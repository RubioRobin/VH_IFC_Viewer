import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as TEMPLATES from "./ui-templates";
import { ModelAligner, AlignmentStrategy, BoundsCalculationMethod } from "./viewer/alignment";
import { TransparencyManager } from "./viewer/transparency-manager";
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
world.scene.three.background = new THREE.Color(0xffffff);

// Viewport aanmaken
const viewport = BUI.Component.create<BUI.Viewport>(() => {
  return BUI.html`<bim-viewport></bim-viewport>`;
});

world.renderer = new OBF.PostproductionRenderer(components, viewport);
world.camera = new OBC.OrthoPerspectiveCamera(components);

// Camera-instellingen
world.camera.threePersp.near = 0.1;
world.camera.threePersp.far = 10000;
world.camera.threePersp.updateProjectionMatrix();

// smoothTime wordt gebruikt voor vloeiende beweging.
world.camera.controls.smoothTime = 0.25;
world.camera.controls.dollyToCursor = true;
world.camera.controls.infinityZoom = true;


// Raster
const worldGrid = components.get(OBC.Grids).create(world);
worldGrid.material.uniforms.uColor.value = new THREE.Color(0xd1d5db);
worldGrid.material.uniforms.uSize1.value = 1;
worldGrid.material.uniforms.uSize2.value = 5;



// Formaat aanpassen bij vensterwijziging
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

// IFC Loader instellen
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: { absolute: true, path: "https://unpkg.com/web-ifc@0.0.72/" },
});

// Highlighter instellen
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

// Configure Postproduction (AO & Borders)
const postproduction = world.renderer.postproduction;
if (postproduction) {
  postproduction.enabled = true;
  const settings = (postproduction as any).settings;
  if (settings && settings.customEffects) {
    settings.customEffects.ao.enabled = true;
    settings.customEffects.ao.opacity = 0.3; // Subtler AO for more realism
    settings.customEffects.outline.enabled = true;
    settings.customEffects.outline.color = 0x333333; // Dark grey instead of pitch black
    settings.customEffects.outline.opacity = 0.8;
    settings.customEffects.outline.thickness = 0.5; // Thinner lines
  }
}

// Force resize to ensure postproduction buffers are correctly sized
setTimeout(() => world.renderer?.resize(), 100);

// Tools
const clipper = components.get(OBC.Clipper);
clipper.enabled = false;




window.addEventListener("keydown", (event) => {
  if (event.code === "Delete" || event.code === "Backspace") {
    if (clipper.enabled) clipper.delete(world);
  }

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
      const file = new File([blob], filename, { type: 'application/octet-stream' });
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      await ifcLoader.load(bytes, true, filename.replace(".ifc", ""));
    } catch (e) {
      console.error("Publieke viewer fout:", e);
      const loader = document.getElementById('initial-loading-overlay');
      if (loader) {
        loader.innerHTML = `<div style="color:white;text-align:center;padding:2rem"><h2>❌ Fout bij laden</h2><p>${(e as any).message}</p><small style="opacity:0.7">ID: ${publicId}</small></div>`;
      }
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
      if (!response.ok) throw new Error(`Ophalen mislukt: ${response.status}`);

      const blob = await response.blob();
      const file = new File([blob], displayTitle, { type: 'application/octet-stream' });
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      await ifcLoader.load(bytes, true, displayTitle.replace(".ifc", ""));
    } catch (e) {
      console.error("Laden mislukt:", e);
      const loader = document.getElementById('initial-loading-overlay');
      if (loader) {
        loader.innerHTML = `<div style="color:white;text-align:center;padding:2rem"><h2>❌ Fout bij laden</h2><p>Kon model niet laden.</p><small style="opacity:0.7">URL: ${modelUrl}</small></div>`;
      }
    }
  } else {
    // If no model provided, just remove the spinner so user sees empty viewer
    const loader = document.getElementById('initial-loading-overlay');
    if (loader) loader.remove();
  }
};

init();
