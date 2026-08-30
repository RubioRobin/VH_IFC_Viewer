import * as THREE from "three";
import {
  type BIMMesh,
  type FragmentsModel,
  LodMode,
  RenderedFaces,
} from "@thatopen/fragments";
import fragmentsWorkerUrl from "@thatopen/fragments/worker?url";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as CUI from "@thatopen/ui-obc";
import CameraControls from "camera-controls";
import { appIcons } from "./globals";
import { IfcEdgeOverlay } from "./viewer/ifc-edge-overlay";
import { ViewerTools, type ViewerVisibilityChange } from "./viewer/viewer-tools";
import { getViewerBootstrap, getViewerModelName } from "./viewer/bootstrap";
import {
  hideLoadingOverlay,
  setLoadingStage,
  showLoadingError,
} from "./viewer/loading-ui";

const viewerBootstrap = getViewerBootstrap();
const isPublicViewer = viewerBootstrap.mode === "public";

BUI.Manager.init();

const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);
const world = worlds.create<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>();

world.name = "Main";
world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = new THREE.Color("#101112");

const viewport = BUI.Component.create<BUI.Viewport>(
  () => BUI.html`<bim-viewport></bim-viewport>`,
);

world.renderer = new OBF.PostproductionRenderer(components, viewport);
world.camera = new OBC.OrthoPerspectiveCamera(components);

const MIN_CAMERA_NEAR = 0.005;

const updateCameraClippingRange = (radius = 500) => {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 500;
  const near = Math.max(safeRadius / 200_000, MIN_CAMERA_NEAR);
  const far = Math.max(safeRadius * 50, 10_000);

  world.camera.threePersp.near = near;
  world.camera.threePersp.far = far;
  world.camera.threePersp.updateProjectionMatrix();

  world.camera.threeOrtho.near = near;
  world.camera.threeOrtho.far = far;
  world.camera.threeOrtho.updateProjectionMatrix();
};

updateCameraClippingRange();
await world.camera.controls.setLookAt(12, 8, 12, 0, 0, 0);

const cameraControls = world.camera.controls;
const rendererCanvas = world.renderer.three.domElement;
let isMiddleMouseDragging = false;
let lastMiddleMouseClickAt = 0;

const DEFAULT_MIN_CAMERA_DISTANCE = 0.05;
const MIDDLE_MOUSE_DOUBLE_CLICK_DELAY = 350;
const loadedModelBounds = new Map<string, THREE.Box3>();
const cameraTarget = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const viewportCenter = new THREE.Vector2(0, 0);
const centeredOrbitTarget = new THREE.Vector3();

const fragments = components.get(OBC.FragmentsManager);
fragments.init(fragmentsWorkerUrl);
const ifcEdgeOverlay = new IfcEdgeOverlay();
const viewerRaycaster = components.get(OBC.Raycasters).get(world);

const hasCpuRaycastGeometry = (object: THREE.Object3D) => {
  if (!(object instanceof THREE.Mesh)) return false;

  const position = object.geometry.getAttribute("position");
  if (!position) return false;

  const positionArray = position instanceof THREE.InterleavedBufferAttribute
    ? position.data.array
    : position.array;
  const indexArray = object.geometry.index?.array;

  return positionArray?.length > 0
    && (object.geometry.index === null || Boolean(indexArray?.length));
};

const setOrbitPointToViewerCenter = () => {
  const visibleModelMeshes: THREE.Object3D[] = [];

  for (const model of fragments.list.values()) {
    if (!model.object.visible) continue;

    for (const mesh of model.tiles.values()) {
      if (mesh.visible && hasCpuRaycastGeometry(mesh)) {
        visibleModelMeshes.push(mesh);
      }
    }
  }

  const intersection = viewerRaycaster.castRayToObjects(
    visibleModelMeshes,
    viewportCenter,
  );

  if (intersection) {
    centeredOrbitTarget.copy(intersection.point);
  } else {
    cameraControls.getTarget(cameraTarget, true);
    const orbitDistance = world.camera.three.position.distanceTo(cameraTarget);
    viewerRaycaster.three.ray.at(orbitDistance, centeredOrbitTarget);
  }

  cameraControls.setOrbitPoint(
    centeredOrbitTarget.x,
    centeredOrbitTarget.y,
    centeredOrbitTarget.z,
  );
};

const getRayBoxInterval = (
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  box: THREE.Box3,
) => {
  let nearDistance = -Infinity;
  let farDistance = Infinity;

  for (const axis of ["x", "y", "z"] as const) {
    const axisDirection = direction[axis];
    const axisOrigin = origin[axis];

    if (Math.abs(axisDirection) < Number.EPSILON) {
      if (axisOrigin < box.min[axis] || axisOrigin > box.max[axis]) return null;
      continue;
    }

    const firstDistance = (box.min[axis] - axisOrigin) / axisDirection;
    const secondDistance = (box.max[axis] - axisOrigin) / axisDirection;
    nearDistance = Math.max(nearDistance, Math.min(firstDistance, secondDistance));
    farDistance = Math.min(farDistance, Math.max(firstDistance, secondDistance));

    if (nearDistance > farDistance) return null;
  }

  return { nearDistance, farDistance };
};

const getBoundsSafetyMargin = (box: THREE.Box3) => {
  const diagonal = box.getSize(new THREE.Vector3()).length();
  return THREE.MathUtils.clamp(diagonal * 0.0025, DEFAULT_MIN_CAMERA_DISTANCE, 0.5);
};

const updateMinimumCameraDistance = () => {
  cameraControls.getTarget(cameraTarget, true);
  cameraControls.getPosition(cameraPosition, true);
  cameraDirection.subVectors(cameraPosition, cameraTarget);

  const currentDistance = cameraDirection.length();
  if (currentDistance <= Number.EPSILON || loadedModelBounds.size === 0) {
    cameraControls.minDistance = DEFAULT_MIN_CAMERA_DISTANCE;
    return;
  }

  cameraDirection.divideScalar(currentDistance);
  let minimumDistance = DEFAULT_MIN_CAMERA_DISTANCE;

  for (const box of loadedModelBounds.values()) {
    const interval = getRayBoxInterval(cameraTarget, cameraDirection, box);
    if (!interval || interval.farDistance <= 0) continue;

    // Only block models that lie between the orbit target and the camera.
    if (interval.nearDistance > currentDistance) continue;

    minimumDistance = Math.max(
      minimumDistance,
      interval.farDistance + getBoundsSafetyMargin(box),
    );
  }

  cameraControls.minDistance = minimumDistance;
  if (currentDistance < minimumDistance) {
    void cameraControls.dollyTo(minimumDistance, true);
  }
};

cameraControls.mouseButtons.left = CameraControls.ACTION.NONE;
cameraControls.mouseButtons.right = CameraControls.ACTION.NONE;
cameraControls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;

// Set the limit before camera-controls handles the same wheel event.
rendererCanvas.addEventListener("wheel", updateMinimumCameraDistance, {
  capture: true,
  passive: true,
});
cameraControls.addEventListener("controlstart", updateMinimumCameraDistance);
cameraControls.addEventListener("control", updateMinimumCameraDistance);

const setMiddleMouseAction = (shiftPressed: boolean) => {
  cameraControls.mouseButtons.middle = shiftPressed
    ? CameraControls.ACTION.ROTATE
    : CameraControls.ACTION.TRUCK;
};

const focusVisibleModels = () => {
  if (loadedModelBounds.size === 0) return;

  const visibleBounds = new THREE.Box3();
  let hasVisibleModel = false;

  for (const [modelId, bounds] of loadedModelBounds) {
    const model = fragments.list.get(modelId);
    if (!model?.object.visible || bounds.isEmpty()) continue;

    visibleBounds.union(bounds);
    hasVisibleModel = true;
  }

  if (!hasVisibleModel || visibleBounds.isEmpty()) return;

  const sphere = visibleBounds.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return;

  cameraControls.stop();
  updateCameraClippingRange(sphere.radius);
  void cameraControls.fitToSphere(sphere, true).then(updateMinimumCameraDistance);
};

// Revit navigation: middle mouse pans, Shift + middle mouse orbits.
setMiddleMouseAction(false);

rendererCanvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse" || event.button !== 1) return;

  const now = performance.now();
  const isDoubleClick = now - lastMiddleMouseClickAt <= MIDDLE_MOUSE_DOUBLE_CLICK_DELAY;
  lastMiddleMouseClickAt = isDoubleClick ? 0 : now;

  if (isDoubleClick) {
    event.preventDefault();
    event.stopImmediatePropagation();
    isMiddleMouseDragging = false;
    setMiddleMouseAction(false);
    focusVisibleModels();
    return;
  }

  isMiddleMouseDragging = true;
  setMiddleMouseAction(event.shiftKey);

  if (event.shiftKey) {
    cameraControls.stop();
    setOrbitPointToViewerCenter();
  }
}, { capture: true });

rendererCanvas.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1) return;
  cameraControls.stop();
  setOrbitPointToViewerCenter();
}, { capture: true, passive: true });

rendererCanvas.addEventListener("mousedown", (event) => {
  if (event.button === 1) event.preventDefault();
}, { capture: true });

rendererCanvas.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
});

window.addEventListener("keydown", (event) => {
  if (isMiddleMouseDragging && event.key === "Shift") setMiddleMouseAction(true);
});

window.addEventListener("keyup", (event) => {
  if (isMiddleMouseDragging && event.key === "Shift") setMiddleMouseAction(false);
});

const stopMiddleMouseNavigation = (event: PointerEvent) => {
  if (event.pointerType !== "mouse" || event.button !== 1) return;
  isMiddleMouseDragging = false;
  setMiddleMouseAction(false);
};

window.addEventListener("pointerup", stopMiddleMouseNavigation);
window.addEventListener("pointercancel", stopMiddleMouseNavigation);
window.addEventListener("blur", () => {
  isMiddleMouseDragging = false;
  setMiddleMouseAction(false);
});

const grid = components.get(OBC.Grids).create(world);
grid.config.color = new THREE.Color("#5c5548");
grid.config.primarySize = 5;
grid.config.secondarySize = 1;
grid.config.distance = 200;
grid.fade = true;

const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: {
    absolute: true,
    path: new URL("/web-ifc/", window.location.origin).toString(),
  },
  webIfc: {
    ...ifcLoader.settings.webIfc,
    COORDINATE_TO_ORIGIN: true,
  },
});

const keepTileRendered = (tile: BIMMesh) => {
  // Fragments handles its own LOD, so Three.js must not cull a complete tile
  // again based on a bounding sphere while the camera is orbiting.
  tile.frustumCulled = false;
};

const keepAllElementsLoaded = async (model: FragmentsModel) => {
  model.tiles.onItemSet.add(({ value: tile }) => keepTileRendered(tile));
  await model.setLodMode(LodMode.ALL_VISIBLE);
  await fragments.core.update(true);
  for (const tile of model.tiles.values()) keepTileRendered(tile);
};

const highlighter = components.get(OBF.Highlighter);
highlighter.setup({
  world,
  selectMaterialDefinition: {
    color: new THREE.Color("#c1a979"),
    opacity: 1,
    transparent: false,
    renderedFaces: RenderedFaces.ONE,
  },
});

const postproduction = world.renderer.postproduction;

const syncIfcEdgeVisibility = async (change: ViewerVisibilityChange) => {
  if (change.type === "hide") {
    await ifcEdgeOverlay.hideItems(change.items);
  } else if (change.type === "isolate") {
    await ifcEdgeOverlay.isolateItems(change.items);
  } else {
    ifcEdgeOverlay.showAllItems();
  }
};

const viewerTools = new ViewerTools({
  components,
  world,
  highlighter,
  fragments,
  canvas: rendererCanvas,
  onFitView: focusVisibleModels,
  onVisibilityChanged: syncIfcEdgeVisibility,
});

const loadIfcButton = BUI.Component.create<BUI.Button>(() => BUI.html`
  <bim-button
    class="ifc-load-button"
    data-ui-id="import-ifc"
    label="IFC Inladen"
    @click=${openIfcPicker}
  ></bim-button>
`);

async function loadLocalIfc(file: File) {
  try {
    document.title = `VH Engineering IFC Viewer – ${getViewerModelName(file.name)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const model = await ifcLoader.load(bytes, true, file.name.replace(/\.ifc$/i, ""));
    await keepAllElementsLoaded(model);
    if (!panelMedia.matches) closePanel("model");
  } catch (error) {
    console.error("IFC file loading error:", error);
  }
}

function openIfcPicker() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".ifc";
  fileInput.addEventListener("change", () => {
    const [file] = Array.from(fileInput.files ?? []);
    if (file) void loadLocalIfc(file);
  }, { once: true });
  fileInput.click();
}

const [modelsList] = CUI.tables.modelsList({
  components,
  actions: { visibility: true, download: true, dispose: true },
});
modelsList.querySelector("[slot='missing-data']")?.remove();

const propertiesContent = BUI.Component.create<HTMLDivElement>(
  () => BUI.html`<div class="properties-content"></div>`,
);

const propertiesHint = BUI.Component.create<HTMLParagraphElement>(
  () => BUI.html`
    <p class="properties-hint">Selecteer een element voor de IFC-eigenschappen.</p>
  `,
);

type IfcItemData = Record<string, unknown>;

const readIfcValue = (item: IfcItemData, key: string) => {
  const attribute = item[key];
  if (!attribute || typeof attribute !== "object" || !("value" in attribute)) return "";
  const value = (attribute as { value?: unknown }).value;
  return value === null || value === undefined ? "" : String(value).trim();
};

const readRelationName = (item: IfcItemData, key: string) => {
  const relation = item[key];
  if (!Array.isArray(relation) || relation.length === 0) return "";
  const related = relation[0];
  if (!related || typeof related !== "object") return "";
  const relatedItem = related as IfcItemData;
  return readIfcValue(relatedItem, "Name")
    || readIfcValue(relatedItem, "LongName")
    || readIfcValue(relatedItem, "ObjectType");
};

const ifcCategoryLabels: Record<string, string> = {
  IFCBEAM: "Balk",
  IFCBUILDINGELEMENTPROXY: "Bouwelement",
  IFCCOLUMN: "Kolom",
  IFCCOVERING: "Afwerking",
  IFCCURTAINWALL: "Vliesgevel",
  IFCDOOR: "Deur",
  IFCFOOTING: "Fundering",
  IFCMEMBER: "Profiel",
  IFCPLATE: "Plaat",
  IFCROOF: "Dak",
  IFCSLAB: "Vloer of plaat",
  IFCSTAIR: "Trap",
  IFCWALL: "Wand",
  IFCWINDOW: "Raam",
};

const formatIfcCategory = (category: string) => (
  ifcCategoryLabels[category.toUpperCase()]
  || category.replace(/^IFC/i, "").replace(/([a-z])([A-Z])/g, "$1 $2")
  || "Onbekend element"
);

const createSummaryRow = (label: string, value: string) => {
  const row = document.createElement("div");
  row.className = "property-summary__row";

  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value || "Niet ingevuld";

  row.append(term, description);
  return row;
};

let propertyRequestId = 0;

const createPropertySummary = async (modelIdMap: OBC.ModelIdMap, requestId: number) => {
  const selectionEntries = Object.entries(modelIdMap)
    .filter(([, localIds]) => localIds.size > 0);
  const selectedCount = selectionEntries
    .reduce((total, [, localIds]) => total + localIds.size, 0);

  const summary = document.createElement("section");
  summary.className = "property-summary";
  summary.setAttribute("aria-label", "Samenvatting geselecteerd element");

  const heading = document.createElement("h3");
  heading.textContent = selectedCount === 1
    ? "Elementoverzicht"
    : `${selectedCount} elementen geselecteerd`;
  summary.append(heading);

  if (selectedCount !== 1) {
    const text = document.createElement("p");
    text.textContent = "Selecteer één element om naam, type en niveau te bekijken.";
    summary.append(text);
    return summary;
  }

  const [modelId, localIds] = selectionEntries[0];
  const model = fragments.list.get(modelId);
  const localId = localIds.values().next().value as number | undefined;
  if (!model || localId === undefined) return summary;

  const [item] = await model.getItemsData([localId], {
    attributesDefault: true,
    relations: {
      ContainedInStructure: { attributes: true, relations: false },
      IsTypedBy: { attributes: true, relations: false },
    },
  });
  if (requestId !== propertyRequestId || !item) return summary;

  const data = item as IfcItemData;
  const category = readIfcValue(data, "_category");
  const name = readIfcValue(data, "Name") || formatIfcCategory(category);
  const type = readRelationName(data, "IsTypedBy")
    || readIfcValue(data, "ObjectType")
    || readIfcValue(data, "PredefinedType");
  const level = readRelationName(data, "ContainedInStructure");

  heading.textContent = name;
  const list = document.createElement("dl");
  list.append(
    createSummaryRow("Categorie", formatIfcCategory(category)),
    createSummaryRow("Type", type),
    createSummaryRow("Niveau", level),
  );
  summary.append(list);
  return summary;
};

const showSelectedProperties = async (modelIdMap: OBC.ModelIdMap) => {
  const requestId = ++propertyRequestId;
  propertiesContent.replaceChildren();
  viewerTools.onSelectionChanged(modelIdMap);

  const hasSelection = Object.values(modelIdMap).some((localIds) => localIds.size > 0);
  propertiesHint.hidden = hasSelection;
  if (!hasSelection) {
    if (window.matchMedia("(max-width: 799px)").matches) closePanel("properties");
    return;
  }

  openPanel("properties");

  const loading = document.createElement("p");
  loading.className = "properties-loading";
  loading.textContent = "Eigenschappen ophalen…";
  propertiesContent.append(loading);

  const [itemsData] = CUI.tables.itemsData({
    components,
    modelIdMap,
    emptySelectionWarning: false,
    itemsDataConfig: {
      attributesDefault: true,
      relationsDefault: { attributes: false, relations: false },
      relations: {
        IsDefinedBy: { attributes: true, relations: true },
        DefinesOcurrence: { attributes: false, relations: false },
        ContainedInStructure: { attributes: true, relations: false },
        ContainsElements: { attributes: false, relations: false },
        Decomposes: { attributes: false, relations: false },
      },
    },
  });

  const technicalDetails = document.createElement("details");
  technicalDetails.className = "properties-technical";
  const technicalSummary = document.createElement("summary");
  technicalSummary.textContent = "Technische IFC-data";
  technicalDetails.append(technicalSummary, itemsData);

  try {
    const summary = await createPropertySummary(modelIdMap, requestId);
    if (requestId !== propertyRequestId) return;
    propertiesContent.replaceChildren(summary, technicalDetails);
  } catch (error) {
    console.error("IFC property summary error:", error);
    if (requestId === propertyRequestId) {
      propertiesContent.replaceChildren(technicalDetails);
    }
  }
};

highlighter.events.select.onHighlight.add((modelIdMap) => void showSelectedProperties(modelIdMap));
highlighter.events.select.onClear.add(() => void showSelectedProperties({}));

const publicModelName = isPublicViewer
  ? getViewerModelName(viewerBootstrap.filename)
  : "";

const viewerRoot = BUI.Component.create<HTMLDivElement>(() => BUI.html`
  <div class="basic-viewer" data-viewer-mode=${isPublicViewer ? "public" : "local"}>
    ${!isPublicViewer ? BUI.html`
      <aside
        id="viewer-model-panel"
        class="basic-viewer__sidebar basic-viewer__sidebar--left"
        data-viewer-panel="model"
        aria-label="Model"
      >
        <header class="viewer-panel__header">
          <h2>Model</h2>
          <button type="button" class="viewer-panel__close" data-close-panel="model" aria-label="Modelpaneel sluiten">
            <bim-icon icon=${appIcons.CLOSE} aria-hidden="true"></bim-icon>
          </button>
        </header>
        <div class="viewer-panel__content">
        ${loadIfcButton}
        ${modelsList}
        </div>
      </aside>
    ` : null}
    <div class="basic-viewer__viewport">
      ${viewport}
      <div class="viewer-brand" aria-label="VH Engineering IFC Viewer">
        <img src="/vh_prefab_engineering_logo.jpg" alt="VH Engineering" />
        <div>
          <span>VH ENGINEERING</span>
          <small>IFC VIEWER</small>
        </div>
      </div>
      ${isPublicViewer ? BUI.html`
        <div class="viewer-model-context" title=${publicModelName}>
          <span>Model</span>
          <strong>${publicModelName}</strong>
        </div>
      ` : null}
      <nav class="viewer-panel-actions" aria-label="Viewerpanelen">
        ${!isPublicViewer ? BUI.html`
          <button
            type="button"
            class="viewer-panel-toggle"
            data-open-panel="model"
            aria-controls="viewer-model-panel"
            aria-expanded="false"
          >
            <bim-icon icon=${appIcons.MODEL} aria-hidden="true"></bim-icon>
            <span>Model</span>
          </button>
        ` : null}
        <button
          type="button"
          class="viewer-panel-toggle"
          data-open-panel="properties"
          aria-controls="viewer-properties-panel"
          aria-expanded="false"
        >
          <bim-icon icon=${appIcons.PROPERTIES} aria-hidden="true"></bim-icon>
          <span>Eigenschappen</span>
        </button>
      </nav>
    </div>
    <aside
      id="viewer-properties-panel"
      class="basic-viewer__sidebar basic-viewer__sidebar--right"
      data-viewer-panel="properties"
      aria-label="Eigenschappen"
    >
      <header class="viewer-panel__header">
        <h2>Eigenschappen</h2>
        <button type="button" class="viewer-panel__close" data-close-panel="properties" aria-label="Eigenschappen sluiten">
          <bim-icon icon=${appIcons.CLOSE} aria-hidden="true"></bim-icon>
        </button>
      </header>
      <div class="viewer-panel__content">
        ${propertiesHint}
        ${propertiesContent}
      </div>
    </aside>
    <button type="button" class="viewer-panel-scrim" data-close-panels aria-label="Paneel sluiten"></button>
  </div>
`);

type ViewerPanelName = "model" | "properties";

const panelMedia = window.matchMedia("(min-width: 1440px)");
let activePanelName: ViewerPanelName | null = null;

const getPanel = (name: ViewerPanelName) => (
  viewerRoot.querySelector<HTMLElement>(`[data-viewer-panel="${name}"]`)
);

const syncPanelToggle = (name: ViewerPanelName, open: boolean) => {
  const toggle = viewerRoot.querySelector<HTMLButtonElement>(`[data-open-panel="${name}"]`);
  toggle?.setAttribute("aria-expanded", String(open));
  toggle?.classList.toggle("is-active", open);
};

const updatePanelScrim = () => {
  const hasOverlayPanel = !panelMedia.matches
    && Array.from(viewerRoot.querySelectorAll<HTMLElement>("[data-viewer-panel]"))
      .some((panel) => panel.classList.contains("is-open"));
  viewerRoot.querySelector("[data-close-panels]")?.classList.toggle("is-active", hasOverlayPanel);
};

function closePanel(name: ViewerPanelName) {
  const panel = getPanel(name);
  if (!panel) return;
  panel.classList.remove("is-open");
  syncPanelToggle(name, false);
  if (activePanelName === name) activePanelName = null;
  updatePanelScrim();
  window.requestAnimationFrame(() => {
    world.renderer?.resize();
    world.camera.updateAspect();
  });
}

function closeAllPanels() {
  for (const name of ["model", "properties"] as const) closePanel(name);
}

function openPanel(name: ViewerPanelName) {
  const panel = getPanel(name);
  if (!panel) return;

  if (!panelMedia.matches) {
    for (const otherName of ["model", "properties"] as const) {
      if (otherName !== name) closePanel(otherName);
    }
  }

  panel.classList.add("is-open");
  activePanelName = name;
  syncPanelToggle(name, true);
  updatePanelScrim();
  window.requestAnimationFrame(() => {
    world.renderer?.resize();
    world.camera.updateAspect();
  });
}

const syncPanelsForViewport = () => {
  if (panelMedia.matches) {
    updatePanelScrim();
    return;
  }

  const openPanels = Array.from(
    viewerRoot.querySelectorAll<HTMLElement>("[data-viewer-panel].is-open"),
  );
  if (openPanels.length > 1) {
    const keepName = activePanelName || openPanels[openPanels.length - 1].dataset.viewerPanel;
    for (const panel of openPanels) {
      if (panel.dataset.viewerPanel !== keepName) {
        closePanel(panel.dataset.viewerPanel as ViewerPanelName);
      }
    }
  }
  updatePanelScrim();
};

viewerRoot.querySelectorAll<HTMLButtonElement>("[data-open-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    const name = button.dataset.openPanel as ViewerPanelName;
    const panel = getPanel(name);
    if (panel?.classList.contains("is-open")) {
      closePanel(name);
    } else {
      openPanel(name);
    }
  });
});

viewerRoot.querySelectorAll<HTMLButtonElement>("[data-close-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    closePanel(button.dataset.closePanel as ViewerPanelName);
  });
});

viewerRoot.querySelector("[data-close-panels]")?.addEventListener("click", closeAllPanels);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !panelMedia.matches) closeAllPanels();
});
panelMedia.addEventListener("change", syncPanelsForViewport);

const resizeViewer = () => {
  world.renderer?.resize();
  world.camera.updateAspect();
};

const app = document.getElementById("app");
if (!app) throw new Error("Viewer root element #app ontbreekt.");
app.append(viewerRoot);
viewerRoot.querySelector(".basic-viewer__viewport")?.append(viewerTools.element);
if (!isPublicViewer && panelMedia.matches) openPanel("model");

window.addEventListener("resize", resizeViewer);
await new Promise<void>((resolve) => {
  window.requestAnimationFrame(() => {
    resizeViewer();
    postproduction.enabled = true;
    resolve();
  });
});
components.init();

let fragmentsUpdateTimer: number | undefined;
world.camera.controls.addEventListener("rest", () => {
  window.clearTimeout(fragmentsUpdateTimer);
  fragmentsUpdateTimer = window.setTimeout(() => {
    // Do not force the worker to finish all pending requests during navigation.
    // A normal deferred update avoids a visible main-thread stall on large IFCs.
    void fragments.core.update();
  }, 300);
});

const fitModelToView = () => {
  const boundingBoxer = components.get(OBC.BoundingBoxer);
  boundingBoxer.list.clear();
  boundingBoxer.addFromModels();
  const box = boundingBoxer.get();
  if (!box || box.isEmpty()) return;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (sphere.radius > 0) {
    updateCameraClippingRange(sphere.radius);
    world.camera.controls.fitToSphere(sphere, true);
    updateMinimumCameraDistance();
  }
};

const placeModelOnGrid = (model: { object: THREE.Object3D; box: THREE.Box3 }) => {
  model.object.updateMatrixWorld(true);
  const boundingBox = model.box;
  if (boundingBox.isEmpty()) return;

  const gridHeight = grid.three.getWorldPosition(new THREE.Vector3()).y;
  model.object.position.y += gridHeight - boundingBox.min.y;
  model.object.updateMatrixWorld(true);
};

const getModelWorldBounds = (model: { box: THREE.Box3 }) => model.box.clone();

fragments.list.onItemSet.add(async ({ key, value: model }) => {
  ifcEdgeOverlay.addModel(model);
  model.useCamera(world.camera.three);
  model.object.visible = false;
  world.scene.three.add(model.object);
  await fragments.core.update(true);
  await viewerTools.onModelLoaded(model);
  placeModelOnGrid(model);
  loadedModelBounds.set(key, getModelWorldBounds(model));
  model.object.visible = true;
  fitModelToView();
});

fragments.list.onItemDeleted.add((key) => {
  ifcEdgeOverlay.removeModel(key);
  loadedModelBounds.delete(key);
  updateMinimumCameraDistance();
});

fragments.list.onCleared.add(() => {
  ifcEdgeOverlay.clear();
  loadedModelBounds.clear();
  updateMinimumCameraDistance();
});

const downloadModelBytes = async (url: string, filename: string) => {
  setLoadingStage("Model downloaden", { detail: filename });
  const response = await fetch(url);
  if (!response.ok) throw new Error("Het IFC-bestand kon niet worden gedownload.");

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (!response.body || !Number.isFinite(contentLength) || contentLength <= 0) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedLength += value.length;
    setLoadingStage("Model downloaden", {
      detail: filename,
      progress: (receivedLength / contentLength) * 100,
    });
  }

  const bytes = new Uint8Array(receivedLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

const loadBootstrappedModel = async () => {
  if (viewerBootstrap.mode !== "public") {
    hideLoadingOverlay();
    return;
  }

  const { filename, modelUrl } = viewerBootstrap;
  try {
    const bytes = await downloadModelBytes(modelUrl, filename);
    setLoadingStage("IFC verwerken", {
      detail: `${filename} wordt omgezet naar een 3D-model.`,
    });
    const model = await ifcLoader.load(bytes, true, getViewerModelName(filename));
    setLoadingStage("3D-weergave opbouwen", {
      detail: "De modelelementen worden in beeld gebracht.",
    });
    await keepAllElementsLoaded(model);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    hideLoadingOverlay();
  } catch (error) {
    console.error("IFC viewer loading error:", error);
    showLoadingError(
      error instanceof Error ? error.message : "Onbekende fout tijdens het laden.",
    );
  }
};

const normalizeUiMotion = (element: Element) => {
  if (!(element instanceof HTMLElement) || !element.shadowRoot) return;
  if (element.shadowRoot.querySelector("style[data-vh-ui-motion]")) return;

  const style = document.createElement("style");
  style.dataset.vhUiMotion = "true";
  const hoverReset = element.tagName === "BIM-BUTTON"
    ? element === loadIfcButton
      ? `
      :host(:hover)::before {
        background-color: #d8c59d !important;
        clip-path: circle(120% at center center) !important;
      }

      :host(:hover) {
        box-shadow: 0 0 0 1px rgba(244, 239, 228, 0.24), 0 0.35rem 1rem rgba(0, 0, 0, 0.2) !important;
      }
    `
      : `
      :host(:hover)::before {
        clip-path: circle(0 at center center) !important;
      }
    `
    : "";

  style.textContent = `
    :host, :host::before, .parent, .button, .expand-icon, .components {
      animation-duration: var(--vh-motion-fast, 140ms) !important;
      transition-duration: var(--vh-motion-fast, 140ms) !important;
    }
    ${hoverReset}
    @media (prefers-reduced-motion: reduce) {
      :host, :host::before, .parent, .button, .expand-icon, .components {
        animation: none !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;
  element.shadowRoot.append(style);
};

const normalizeAllUiMotion = (root: ParentNode) => {
  if (root instanceof Element) normalizeUiMotion(root);
  root.querySelectorAll("bim-button, bim-panel-section").forEach(normalizeUiMotion);
};

normalizeAllUiMotion(document);
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => {
      if (node instanceof Element) normalizeAllUiMotion(node);
    });
  }
}).observe(document.body, { childList: true, subtree: true });

void loadBootstrappedModel();
