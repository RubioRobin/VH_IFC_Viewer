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
const fragmentsBenchmarkMode = new URLSearchParams(window.location.search).get("benchmark") === "fragments";
const benchmarkWindow = window as Window & {
  __VH_FRAGMENTS_BENCHMARK_RESULT__?: Record<string, unknown> | null;
  __VH_FRAGMENTS_BENCHMARK_ERROR__?: string | null;
};
if (fragmentsBenchmarkMode) {
  benchmarkWindow.__VH_FRAGMENTS_BENCHMARK_RESULT__ = null;
  benchmarkWindow.__VH_FRAGMENTS_BENCHMARK_ERROR__ = null;
}

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
// Keep the production viewer behaviour: do not let WebGL clear or render
// before the viewport has a real layout size.
world.renderer.enabled = false;
world.camera = new OBC.OrthoPerspectiveCamera(components);

const MIN_CAMERA_NEAR = 0.005;
const DEFAULT_CAMERA_FAR = 1_000_000;

const updateCameraClippingRange = (radius = 500) => {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 500;
  const near = Math.max(safeRadius / 200_000, MIN_CAMERA_NEAR);
  const far = Math.max(safeRadius * 50, 10_000);

  world.camera.threePersp.near = near;
  world.camera.threePersp.far = Math.max(far, DEFAULT_CAMERA_FAR);
  world.camera.threePersp.updateProjectionMatrix();

  world.camera.threeOrtho.near = near;
  world.camera.threeOrtho.far = Math.max(far, DEFAULT_CAMERA_FAR);
  world.camera.threeOrtho.updateProjectionMatrix();
};

updateCameraClippingRange();
await world.camera.controls.setLookAt(12, 8, 12, 0, 0, 0);
world.camera.controls.smoothTime = 0.25;
world.camera.controls.dollyToCursor = true;
world.camera.controls.infinityDolly = true;

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

// Use the proven production grid. It lives in world space and does not move,
// vibrate or disappear when the camera crosses an OBC grid fade boundary.
const GRID_SIZE = 10_000;
const GRID_FINE_STEP = 1;
const GRID_MAJOR_STEP = 5;

const createGroundGrid = () => {
  const halfSize = GRID_SIZE / 2;
  const positions: number[] = [];
  const colors: number[] = [];
  const fineColor = new THREE.Color(0x332f28);
  const majorColor = new THREE.Color(0x5b5244);

  const pushVertex = (x: number, y: number, z: number, color: THREE.Color) => {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
  };

  for (let index = -halfSize; index <= halfSize; index += GRID_FINE_STEP) {
    const color = index % GRID_MAJOR_STEP === 0 ? majorColor : fineColor;
    pushVertex(-halfSize, 0, index, color);
    pushVertex(halfSize, 0, index, color);
    pushVertex(index, 0, -halfSize, color);
    pushVertex(index, 0, halfSize, color);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const groundGrid = new THREE.LineSegments(geometry, material);
  groundGrid.name = "VH Ground Grid";
  groundGrid.frustumCulled = false;
  groundGrid.renderOrder = -1000;
  return groundGrid;
};

const grid = createGroundGrid();
world.scene.three.add(grid);

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
    const ifcLoadStartedAt = performance.now();
    const model = await ifcLoader.load(bytes, true, file.name.replace(/\.ifc$/i, ""));
    await keepAllElementsLoaded(model);
    const ifcLoadFinishedAt = performance.now();

    if (fragmentsBenchmarkMode) {
      const ifcItemIds = await model.getItemsIdsWithGeometry();
      const ifcItemCount = ifcItemIds.length;
      const ifcCategories = (await model.getCategories()).sort();
      const sampleItemIds = ifcItemIds.slice(0, 10);
      const ifcSampleData = await model.getItemsData(sampleItemIds);
      const encodeStartedAt = performance.now();
      const fragmentBuffer = await model.getBuffer(false);
      const encodeFinishedAt = performance.now();

      await fragments.core.disposeModel(model.modelId);
      const fragmentLoadStartedAt = performance.now();
      const fragmentModel = await fragments.core.load(fragmentBuffer, {
        modelId: `benchmark-${crypto.randomUUID()}`,
        camera: world.camera.three,
        raw: false,
      });
      await keepAllElementsLoaded(fragmentModel);
      const fragmentLoadFinishedAt = performance.now();
      const fragmentItemCount = (await fragmentModel.getItemsIdsWithGeometry()).length;
      const fragmentCategories = (await fragmentModel.getCategories()).sort();
      const fragmentSampleData = await fragmentModel.getItemsData(sampleItemIds);
      const memory = performance as Performance & {
        memory?: { usedJSHeapSize?: number };
      };

      benchmarkWindow.__VH_FRAGMENTS_BENCHMARK_RESULT__ = {
        fileName: file.name,
        ifcBytes: bytes.byteLength,
        fragmentBytes: fragmentBuffer.byteLength,
        fragmentToIfcRatio: Number((fragmentBuffer.byteLength / bytes.byteLength).toFixed(4)),
        ifcLoadMs: Math.round(ifcLoadFinishedAt - ifcLoadStartedAt),
        fragmentEncodeMs: Math.round(encodeFinishedAt - encodeStartedAt),
        fragmentLoadMs: Math.round(fragmentLoadFinishedAt - fragmentLoadStartedAt),
        ifcItemCount,
        fragmentItemCount,
        geometryCountMatches: ifcItemCount === fragmentItemCount,
        categoriesMatch: JSON.stringify(ifcCategories) === JSON.stringify(fragmentCategories),
        samplePropertiesMatch: JSON.stringify(ifcSampleData) === JSON.stringify(fragmentSampleData),
        checkedPropertyItemCount: sampleItemIds.length,
        usedJsHeapBytes: memory.memory?.usedJSHeapSize || null,
        userAgent: navigator.userAgent,
      };
    }
  } catch (error) {
    console.error("IFC file loading error:", error);
    if (fragmentsBenchmarkMode) {
      benchmarkWindow.__VH_FRAGMENTS_BENCHMARK_ERROR__ = error instanceof Error
        ? error.stack || error.message
        : String(error);
    }
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
    return;
  }

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
    </div>
    <aside
      id="viewer-properties-panel"
      class="basic-viewer__sidebar basic-viewer__sidebar--right"
      data-viewer-panel="properties"
      aria-label="Eigenschappen"
    >
      <header class="viewer-panel__header">
        <h2>Eigenschappen</h2>
      </header>
      <div class="viewer-panel__content">
        ${propertiesHint}
        ${propertiesContent}
      </div>
    </aside>
  </div>
`);

const resizeViewer = () => {
  const { width, height } = viewport.getBoundingClientRect();
  if (width < 10 || height < 10) return false;
  world.renderer?.resize();
  world.camera.updateAspect();
  return true;
};

const app = document.getElementById("app");
if (!app) throw new Error("Viewer root element #app ontbreekt.");
app.append(viewerRoot);
viewerRoot.querySelector(".basic-viewer__viewport")?.append(viewerTools.element);

if (fragmentsBenchmarkMode) {
  const benchmarkInput = document.createElement("input");
  benchmarkInput.id = "vh-fragments-benchmark-input";
  benchmarkInput.type = "file";
  benchmarkInput.accept = ".ifc";
  benchmarkInput.hidden = true;
  benchmarkInput.addEventListener("change", () => {
    const [file] = Array.from(benchmarkInput.files ?? []);
    if (file) void loadLocalIfc(file);
  });
  document.body.append(benchmarkInput);
}
window.addEventListener("resize", resizeViewer);
await new Promise<void>((resolve) => {
  window.requestAnimationFrame(() => {
    if (resizeViewer()) world.renderer.enabled = true;
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

  const gridHeight = grid.getWorldPosition(new THREE.Vector3()).y;
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
