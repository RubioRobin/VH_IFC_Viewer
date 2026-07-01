import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as TEMPLATES from "./ui-templates";
import { ModelAligner, AlignmentStrategy, BoundsCalculationMethod } from "./viewer/alignment";
import { TransparencyManager } from "./viewer/transparency-manager";
import { setDownloadInfo } from "./viewer/download-store";
import "./style.css";

// UI Manager initialiseren
BUI.Manager.init();

// Componenten instellen
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
world.scene.three.background = new THREE.Color(0x101112);

// Viewport aanmaken
const viewport = BUI.Component.create<BUI.Viewport>(() => {
  return BUI.html`<bim-viewport></bim-viewport>`;
});

world.renderer = new OBF.PostproductionRenderer(components, viewport);
world.renderer.enabled = false; // Definitively prevent WebGL clear/render before layout is ready
world.camera = new OBC.OrthoPerspectiveCamera(components);

// Camera-instellingen
const MIN_CAMERA_NEAR = 0.01;
const DEFAULT_CAMERA_FAR = 1_000_000;

const updateCameraClippingRange = (radius = 50000) => {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 50000;
  const near = Math.max(safeRadius / 100000, MIN_CAMERA_NEAR);
  const far = Math.max(safeRadius * 20, 10000);

  world.camera.threePersp.near = near;
  world.camera.threePersp.far = Math.max(far, DEFAULT_CAMERA_FAR);
  world.camera.threePersp.updateProjectionMatrix();

  world.camera.threeOrtho.near = near;
  world.camera.threeOrtho.far = Math.max(far, DEFAULT_CAMERA_FAR);
  world.camera.threeOrtho.updateProjectionMatrix();
};

updateCameraClippingRange();

// smoothTime wordt gebruikt voor vloeiende beweging.
world.camera.controls.smoothTime = 0.25;
world.camera.controls.dollyToCursor = true;
world.camera.controls.infinityDolly = true;


// Raster: echte world-space grid op Y=0, los van OBC.Grids.
const GRID_SIZE = 10000;
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

  const grid = new THREE.LineSegments(geometry, material);
  grid.name = "VH Ground Grid";
  grid.frustumCulled = false;
  grid.renderOrder = -1000;
  grid.position.y = 0;
  return grid;
};

world.scene.three.add(createGroundGrid());

// Formaat aanpassen bij vensterwijziging
let resizeFrame = 0;
let lastViewportWidth = 0;
let lastViewportHeight = 0;

const resizeWorld = () => {
  const { width, height } = viewport.getBoundingClientRect();
  if (width < 10 || height < 10) return;

  if (
    Math.abs(width - lastViewportWidth) < 1 &&
    Math.abs(height - lastViewportHeight) < 1
  ) {
    return;
  }

  lastViewportWidth = width;
  lastViewportHeight = height;

  if (world.renderer) {
    // Only enable renderer and postproduction when we have a valid size
    if (!world.renderer.enabled) world.renderer.enabled = true;

    const postproduction = world.renderer.postproduction as any;
    if (postproduction && !postproduction.enabled) {
      postproduction.enabled = true;
      if (postproduction.customEffects) {
        postproduction.customEffects.outlineEnabled = true;
      }
    }
  }

  world.renderer?.resize();
  world.camera.updateAspect();
};

const queueWorldResize = () => {
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    resizeWorld();
  });
};

const resizeObserver = new ResizeObserver(queueWorldResize);
resizeObserver.observe(viewport);
window.addEventListener("resize", queueWorldResize);

world.dynamicAnchor = true;

components.init();

// Initialize custom modules
const aligner = new ModelAligner(components);
const transparencyManager = new TransparencyManager(components);

components.get(OBC.Raycasters).get(world);

const fragments = components.get(OBC.FragmentsManager);
fragments.init("/obc-worker.mjs");

const syncManualGridWithTarget = () => {
  // Ground grid is fixed on Y=0; this hook keeps projection changes safe.
};

// Sync camera
world.camera.projection.onChanged.add(() => {
  syncManualGridWithTarget();
  for (const [_, model] of fragments.list) {
    model.useCamera(world.camera.three);
  }
});

world.camera.controls.addEventListener("rest", () => {
  fragments.core.update(true);
});

// IFC Loader instellen
const ifcLoader = components.get(OBC.IfcLoader);
const webIfcWasmPath = new URL("/web-ifc/", window.location.origin).toString();
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: { absolute: true, path: webIfcWasmPath },
  webIfc: {
    ...ifcLoader.settings.webIfc,
    COORDINATE_TO_ORIGIN: true,
  },
});

// Highlighter instellen
const highlighter = components.get(OBF.Highlighter);
highlighter.setup({
  world,
  selectMaterialDefinition: {
    color: new THREE.Color("#c1a979"),
    renderedFaces: 1,
    opacity: 1,
    transparent: false,
    depthTest: true,
  },
});

// Configure Postproduction (AO & Borders)
const postproduction = world.renderer.postproduction;
if (postproduction) {
  const settings = (postproduction as any).settings;
  if (settings && settings.customEffects) {
    settings.customEffects.ao.enabled = true;
    settings.customEffects.ao.opacity = 0.3;
    settings.customEffects.outline.enabled = true;
    settings.customEffects.outline.color = 0xc1a979;
    settings.customEffects.outline.opacity = 0.8;
    settings.customEffects.outline.thickness = 0.5;
  }
}

// Tools
const clipper = components.get(OBC.Clipper);
clipper.enabled = false;

const clearViewerClipping = () => {
  clipper.enabled = false;
  clipper.visible = false;
  clipper.deleteAll();

  if (world.renderer) {
    world.renderer.clippingPlanes.length = 0;
    world.renderer.three.clippingPlanes = [];
    world.renderer.updateClippingPlanes();
  }
};

const isValidBox = (box: THREE.Box3) => {
  return (
    !box.isEmpty() &&
    Number.isFinite(box.min.x) &&
    Number.isFinite(box.min.y) &&
    Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) &&
    Number.isFinite(box.max.y) &&
    Number.isFinite(box.max.z)
  );
};

const getModelBox = async (model: any) => {
  const methods = [
    BoundsCalculationMethod.FAST_SCAN,
    BoundsCalculationMethod.BOUNDING_BOXER,
    BoundsCalculationMethod.THREE_BOX3,
  ];

  for (const method of methods) {
    try {
      const bounds = await aligner.calculateBounds(model, method, false);
      if (isValidBox(bounds.box)) return bounds.box.clone();
    } catch (error) {
      console.warn(`[Main] Bounds calculation failed with ${method}:`, error);
    }
  }

  model.object.updateMatrixWorld(true);
  const fallbackBox = new THREE.Box3().setFromObject(model.object);
  return isValidBox(fallbackBox) ? fallbackBox : null;
};

const fitLoadedModelToView = async (model: any) => {
  const box = await getModelBox(model);
  if (!box) return;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return;

  sphere.radius *= 1.2;
  updateCameraClippingRange(sphere.radius);

  const controls = world.camera.controls;
  controls.minDistance = Math.max(sphere.radius / 10000, MIN_CAMERA_NEAR);
  controls.maxDistance = Math.max(sphere.radius * 12, 10000);

  await controls.fitToSphere(sphere, true);
  await fragments.core.update(true);
};




window.addEventListener("keydown", (event) => {
  if (event.code === "Delete" || event.code === "Backspace") {
    if (clipper.enabled) clipper.delete(world);
  }

});



// Model Loaded Handler
fragments.list.onItemSet.add(async ({ value: model }) => {
  clearViewerClipping();
  model.useCamera(world.camera.three);
  model.getClippingPlanesEvent = () => Array.from(world.renderer?.clippingPlanes ?? []);

  model.object.visible = false;
  world.scene.three.add(model.object);

  await fragments.core.update(true);
  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    await aligner.alignModel(model, {
      strategy: AlignmentStrategy.BOTTOM_TO_GRID,
      method: BoundsCalculationMethod.FAST_SCAN,
      logDetails: true,
    });
  } catch (error) {
    console.error("[Main] Alignment failed:", error);
  }

  await fragments.core.update(true);
  model.object.visible = true;
  await fitLoadedModelToView(model);

  // HIDE LOADING OVERLAY
  const loader = document.getElementById('initial-loading-overlay');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 500);
  }

  // CAPTURE THUMBNAIL for dashboard preview
  const thumbParams = new URLSearchParams(window.location.search);
  const thumbFileId = thumbParams.get("fileId");
  if (thumbFileId) {
    await new Promise(resolve => setTimeout(resolve, 800));
    try {
      const renderer = world.renderer;
      if (!renderer) return;

      const canvas = renderer.three.domElement;
      renderer.three.render(world.scene.three, world.camera.three);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      if (dataUrl && dataUrl.length > 100) {
        localStorage.setItem(`thumb_${thumbFileId}`, dataUrl);
      }
    } catch (e) {
      console.warn('[Thumbnail] Capture failed:', e);
    }
  }

  // Verwerk URL-parameter voor element-markering (ID)
  const urlParams = new URLSearchParams(window.location.search);
  const elementId = urlParams.get("id");

  if (elementId) {
    try {
      const hider = components.get(OBC.Hider);
      const modelIdMap = await fragments.guidsToModelIdMap([elementId]);
      if (modelIdMap && Object.keys(modelIdMap).length > 0) {
        await highlighter.highlightByID("select", modelIdMap, true);
        await hider.isolate(modelIdMap);

        const bbox = components.get(OBC.BoundingBoxer);
        bbox.list.clear();
        await bbox.addFromModelIdMap(modelIdMap);
        const box = bbox.get();
        if (box && !box.isEmpty()) {
          const sphere = new THREE.Sphere();
          box.getBoundingSphere(sphere);
          world.camera.controls.fitToSphere(sphere, false);
        }
      }
    } catch (e) {
      console.warn("Highlight error:", e);
    }
  }
});

// Layouts
const [viewportGrid] = BUI.Component.create(TEMPLATES.viewportGridTemplate, {
  components,
  world,
  transparencyManager,
});
viewport.append(viewportGrid);

const viewportCardTemplate = () => BUI.html`
  <div style="height: 100%; width: 100%; overflow: hidden;">
    ${viewport}
  </div>
`;

const [contentGrid] = BUI.Component.create(
  TEMPLATES.contentGridTemplate,
  {
    components,
    world, // kept for ContentGridState interface compatibility
    viewportTemplate: viewportCardTemplate,
  }
);

const app = document.getElementById("app");
if (app) app.appendChild(contentGrid);
queueWorldResize();
setTimeout(queueWorldResize, 50);
setTimeout(queueWorldResize, 250);

// ---- Mobiele paneel-drawers ----
const isMobile = () => window.innerWidth <= 768;

const setupMobilePanelToggles = () => {
  const leftPanel = document.querySelector('.app-side-panel--left') as HTMLElement | null;
  const rightPanel = document.querySelector('.app-side-panel--right') as HTMLElement | null;
  if (!leftPanel || !rightPanel) return;
  if (document.querySelector('.mobile-panel-actions')) return;

  const scrim = document.createElement('div');
  scrim.className = 'mobile-panel-scrim';
  document.body.appendChild(scrim);

  const panelActions = document.createElement('div');
  panelActions.className = 'mobile-panel-actions';
  panelActions.setAttribute('aria-label', 'Mobiele panelen');
  document.body.appendChild(panelActions);

  let fabProperties: HTMLButtonElement | null = null;

  const updateButtonState = () => {
    const leftOpen = leftPanel.classList.contains('mobile-panel-open');
    const rightOpen = rightPanel.classList.contains('mobile-panel-open');

    fabProperties?.classList.toggle('mobile-fab--active', rightOpen);
    fabProperties?.setAttribute('aria-expanded', String(rightOpen));

    document.body.classList.toggle('mobile-drawer-open', leftOpen || rightOpen);
  };

  const closeAll = () => {
    leftPanel.classList.remove('mobile-panel-open');
    rightPanel.classList.remove('mobile-panel-open');
    scrim.classList.remove('visible');
    updateButtonState();
  };

  const openPanel = (panel: HTMLElement) => {
    closeAll();
    panel.classList.add('mobile-panel-open');
    scrim.classList.add('visible');
    updateButtonState();
  };

  scrim.addEventListener('click', closeAll);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll();
  });
  window.addEventListener('resize', () => {
    if (!isMobile()) closeAll();
  });

  fabProperties = document.createElement('button');
  fabProperties.className = 'mobile-fab mobile-fab--properties';
  fabProperties.setAttribute('aria-label', 'Eigenschappen tonen');
  fabProperties.setAttribute('aria-controls', 'mobile-properties-panel');
  fabProperties.setAttribute('aria-expanded', 'false');
  rightPanel.id = rightPanel.id || 'mobile-properties-panel';
  fabProperties.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span class="mobile-fab__label">Info</span>`;
  fabProperties.addEventListener('click', () => {
    const isOpen = rightPanel.classList.contains('mobile-panel-open');
    closeAll();
    if (!isOpen) openPanel(rightPanel);
  });
  panelActions.appendChild(fabProperties);
};

// Wacht op DOM zodat panelen beschikbaar zijn
requestAnimationFrame(() => setupMobilePanelToggles());

// 🚀 AUTO-LOAD LOGIC
const init = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const modelName = urlParams.get("model");
  const fileId = urlParams.get("fileId");

  // NEW: Check for /v/{publicId} in path
  const pathParts = window.location.pathname.split('/');
  const vIndex = pathParts.indexOf('v');
  const publicId = (vIndex !== -1 && pathParts.length > vIndex + 1) ? pathParts[vIndex + 1] : null;

  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  if (publicId) {
    console.log(`Initializing Public Viewer for ID: ${publicId}`);
    try {
      // Fetch model info from the new Public Share API
      const metaResponse = await fetch(`${baseUrl}/api/share/${publicId}`);

      if (metaResponse.status === 404) throw new Error("Link ongeldig of verlopen");
      if (metaResponse.status === 410) throw new Error("Link is verlopen");
      if (!metaResponse.ok) throw new Error("Fout bij ophalen gegevens");

      const { modelUrl, filename } = await metaResponse.json();
      console.log(`Model laden: ${filename}`);

      // Het IFC-bestand ophalen (via ondertekende URL of proxy)
      const modelResponse = await fetch(modelUrl);
      if (!modelResponse.ok) throw new Error(`Fout bij downloaden model: ${modelResponse.status}`);

      const blob = await modelResponse.blob();
      setDownloadInfo(blob, filename);
      const file = new File([blob], filename, { type: 'application/octet-stream' });
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      clearViewerClipping();
      await ifcLoader.load(bytes, true, filename.replace(".ifc", ""));
    } catch (e) {
      console.error("Publieke viewer fout:", e);
      const loader = document.getElementById('initial-loading-overlay');
      if (loader) {
        const errorMsg = (e as any).message || 'Kon model niet laden.';
        const is404 = errorMsg.includes('ongeldig') || errorMsg.includes('verlopen');

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'text-align:center;padding:2rem;max-width:400px';

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('width', '48'); icon.setAttribute('height', '48');
        icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', '#ef4444'); icon.setAttribute('stroke-width', '1.5');
        icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round');
        icon.style.cssText = 'display:block;margin:0 auto 1rem';
        icon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';

        const title = document.createElement('h2');
        title.textContent = is404 ? 'Link niet gevonden' : 'Fout bij laden';
        title.style.cssText = 'color:#111827;font-size:1.25rem;font-weight:600;margin:0 0 0.5rem';

        const msg = document.createElement('p');
        msg.textContent = errorMsg;
        msg.style.cssText = 'color:#6b7280;font-size:0.95rem;margin:0 0 1.5rem;line-height:1.5';

        const contact = document.createElement('p');
        contact.style.cssText = 'color:#9ca3af;font-size:0.8rem;margin:0';
        contact.textContent = 'Neem contact op als dit probleem aanhoudt.';

        wrapper.appendChild(icon);
        wrapper.appendChild(title);
        wrapper.appendChild(msg);
        wrapper.appendChild(contact);
        while (loader.firstChild) loader.removeChild(loader.firstChild);
        loader.appendChild(wrapper);
      }
    }
  } else if (modelName || fileId) {
    // Legacy / Admin Logic
    console.log(`Auto-loading: ${modelName || fileId}`);

    let modelUrl = modelName ? `${baseUrl}/models/${modelName}` : '';
    let displayTitle = modelName || 'Model';

    try {
      if (fileId) {
        const signedResponse = await fetch(`${baseUrl}/api/files/${fileId}/signed-url`, {
          credentials: "include"
        });
        if (!signedResponse.ok) throw new Error(`Ophalen mislukt: ${signedResponse.status}`);

        const signedData = await signedResponse.json();
        modelUrl = signedData.url;
        displayTitle = signedData.filename || displayTitle;
      }

      const response = await fetch(modelUrl);
      if (!response.ok) throw new Error(`Ophalen mislukt: ${response.status}`);

      const blob = await response.blob();
      setDownloadInfo(blob, displayTitle);
      const file = new File([blob], displayTitle, { type: 'application/octet-stream' });
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      clearViewerClipping();
      await ifcLoader.load(bytes, true, displayTitle.replace(".ifc", ""));
    } catch (e) {
      console.error("Laden mislukt:", e);
      const loader = document.getElementById('initial-loading-overlay');
      if (loader) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'text-align:center;padding:2rem;max-width:400px';

        const title = document.createElement('h2');
        title.textContent = 'Fout bij laden';
        title.style.cssText = 'color:#111827;font-size:1.25rem;font-weight:600;margin:0 0 0.5rem';

        const msg = document.createElement('p');
        msg.textContent = 'Kon model niet laden. Probeer de pagina opnieuw te laden.';
        msg.style.cssText = 'color:#6b7280;font-size:0.95rem;margin:0;line-height:1.5';

        wrapper.appendChild(title);
        wrapper.appendChild(msg);
        while (loader.firstChild) loader.removeChild(loader.firstChild);
        loader.appendChild(wrapper);
      }
    }
  } else {
    // If no model provided, just remove the spinner so user sees empty viewer
    const loader = document.getElementById('initial-loading-overlay');
    if (loader) loader.remove();
  }
};

init();
