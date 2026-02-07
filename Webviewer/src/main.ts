import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as TEMPLATES from "./ui-templates";
import { ModelAligner, AlignmentStrategy, BoundsCalculationMethod } from "./viewer/alignment";
import { TransparencyManager } from "./viewer/transparency-manager";
import "./style.css";

// Initialize UI Manager
BUI.Manager.init();

// Components Setup
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
world.scene.three.background = new THREE.Color(0xffffff);

// Create Viewport
const viewport = BUI.Component.create<BUI.Viewport>(() => {
  return BUI.html`<bim-viewport></bim-viewport>`;
});

world.renderer = new OBF.PostproductionRenderer(components, viewport);
world.camera = new OBC.OrthoPerspectiveCamera(components);

// Camera Settings
world.camera.threePersp.near = 0.1;
world.camera.threePersp.far = 10000;
world.camera.threePersp.updateProjectionMatrix();

// Note: Removed 'touches' and 'enableDamping' settings as they were causing lint errors
// and might not be supported on this version of CameraControls.
// Using smoothTime for smoother movement.
world.camera.controls.smoothTime = 0.25;

// Grid
const worldGrid = components.get(OBC.Grids).create(world);
worldGrid.material.uniforms.uColor.value = new THREE.Color(0xd1d5db);
worldGrid.material.uniforms.uSize1.value = 2;
worldGrid.material.uniforms.uSize2.value = 8;

// Resize Logic
const resizeWorld = () => {
  const { width, height } = viewport.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  world.renderer?.resize();
  world.camera.updateAspect();
};

const resizeObserver = new ResizeObserver(() => resizeWorld());
resizeObserver.observe(viewport);

world.dynamicAnchor = false;

components.init();

// Initialize custom modules
const aligner = new ModelAligner(components);
const transparencyManager = new TransparencyManager(components);

components.get(OBC.Raycasters).get(world);

const fragments = components.get(OBC.FragmentsManager);
fragments.init("/obc-worker.mjs");

// Sync camera
world.camera.projection.onChanged.add(() => {
  for (const [_, model] of fragments.list) {
    model.useCamera(world.camera.three);
  }
});

world.camera.controls.addEventListener("rest", () => {
  fragments.core.update(true);
});

// IFC Loader Setup
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: { absolute: true, path: "https://unpkg.com/web-ifc@0.0.71/" },
});

// Highlighter Setup
const highlighter = components.get(OBF.Highlighter);
highlighter.setup({
  world,
  selectMaterialDefinition: {
    color: new THREE.Color("#4f46e5"),
    renderedFaces: 1,
    opacity: 1,
    transparent: false,
    depthTest: true,
  },
});

// Tools
const clipper = components.get(OBC.Clipper);
clipper.enabled = false;
const lengthMeasurer = components.get(OBF.LengthMeasurement);
const areaMeasurer = components.get(OBF.AreaMeasurement);

lengthMeasurer.world = world;
lengthMeasurer.color = new THREE.Color("#4f46e5");
areaMeasurer.world = world;
areaMeasurer.color = new THREE.Color("#4f46e5");

// Viewport Events
viewport.addEventListener("dblclick", () => {
  if (lengthMeasurer.enabled) lengthMeasurer.create();
  else if (areaMeasurer.enabled) areaMeasurer.create();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Delete" || event.code === "Backspace") {
    if (clipper.enabled) clipper.delete(world);
    if (lengthMeasurer.enabled) lengthMeasurer.delete();
    if (areaMeasurer.enabled) areaMeasurer.delete();
  }
  if (event.code === "Enter" || event.code === "NumpadEnter") {
    if (areaMeasurer.enabled) areaMeasurer.endCreation();
  }
});

// Measurement Events
lengthMeasurer.list.onItemAdded.add((line) => {
  const center = new THREE.Vector3();
  line.getCenter(center);
  const radius = line.distance() / 3;
  const sphere = new THREE.Sphere(center, radius);
  world.camera.controls.fitToSphere(sphere, false);
});

areaMeasurer.list.onItemAdded.add((area) => {
  if (!area.boundingBox) return;
  const sphere = new THREE.Sphere();
  area.boundingBox.getBoundingSphere(sphere);
  world.camera.controls.fitToSphere(sphere, false);
});

// Model Loaded Handler
fragments.list.onItemSet.add(async ({ value: model }) => {
  model.useCamera(world.camera.three);
  model.getClippingPlanesEvent = () => Array.from(world.renderer!.three.clippingPlanes) || [];

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

  // HIDE LOADING OVERLAY
  const loader = document.getElementById('initial-loading-overlay');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 500);
  }

  // Handle URL Parameter Highlighting (ID)
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
    viewportTemplate: viewportCardTemplate,
  }
);

const app = document.getElementById("app");
if (app) app.appendChild(contentGrid);

resizeWorld();

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
      // Fetch model info from Public API
      const metaResponse = await fetch(`${baseUrl}/api/public/ifc/${publicId}`);

      if (metaResponse.status === 404) throw new Error("Link ongeldig of verlopen");
      if (metaResponse.status === 410) throw new Error("Link is verlopen");
      if (!metaResponse.ok) throw new Error("Fout bij ophalen gegevens");

      const { modelUrl, filename } = await metaResponse.json();
      console.log(`Loading model: ${filename}`);

      // Fetch the actual IFC file (via signed URL or proxy)
      const modelResponse = await fetch(modelUrl);
      if (!modelResponse.ok) throw new Error(`Fout bij downloaden model: ${modelResponse.status}`);

      const blob = await modelResponse.blob();
      const file = new File([blob], filename, { type: 'application/octet-stream' });
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      await ifcLoader.load(bytes, true, filename.replace(".ifc", ""));
    } catch (e) {
      console.error("Public Viewer Error:", e);
      alert(`Fout: ${e.message}`);
      const loader = document.getElementById('initial-loading-overlay');
      if (loader) loader.innerHTML = `<div style="color:white;text-align:center"><h1>❌</h1><p>${e.message}</p></div>`;
    }
  } else if (modelName || fileId) {
    // Legacy / Admin Logic
    console.log(`Auto-loading: ${modelName || fileId}`);

    // Determine URL: Static model (legacy) or API download (new)
    const modelUrl = fileId
      ? `${baseUrl}/api/files/${fileId}/download`
      : `${baseUrl}/models/${modelName}`;

    const displayTitle = modelName || 'Model';

    try {
      const response = await fetch(modelUrl);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

      const blob = await response.blob();
      const file = new File([blob], displayTitle, { type: 'application/octet-stream' });
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      await ifcLoader.load(bytes, true, displayTitle.replace(".ifc", ""));
    } catch (e) {
      console.error("Load failed:", e);
      alert(`Fout bij laden model: ${e}`);
      const loader = document.getElementById('initial-loading-overlay');
      if (loader) loader.remove();
    }
  } else {
    // If no model provided, just remove the spinner so user sees empty viewer
    const loader = document.getElementById('initial-loading-overlay');
    if (loader) loader.remove();
  }
};

init();
