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
world.camera.threePersp.near = 0.1;
world.camera.threePersp.far = 50000;
world.camera.threePersp.updateProjectionMatrix();
world.camera.threeOrtho.near = 0.1;
world.camera.threeOrtho.far = 50000;
world.camera.threeOrtho.updateProjectionMatrix();

// smoothTime wordt gebruikt voor vloeiende beweging.
world.camera.controls.smoothTime = 0.25;
world.camera.controls.dollyToCursor = true;
world.camera.controls.infinityZoom = true;


// Raster
const worldGrid = components.get(OBC.Grids).create(world);
worldGrid.setup({
  color: new THREE.Color(0x5b5244),
  primarySize: 1,
  secondarySize: 5,
  distance: 20000,
});

// Formaat aanpassen bij vensterwijziging
const resizeWorld = () => {
  const { width, height } = viewport.getBoundingClientRect();
  if (width < 10 || height < 10) return;

  if (world.renderer) {
    // Only enable renderer and postproduction when we have a valid size
    if (!world.renderer.enabled) world.renderer.enabled = true;

    if (world.renderer.postproduction && !world.renderer.postproduction.enabled) {
      world.renderer.postproduction.enabled = true;
      if (world.renderer.postproduction.customEffects) {
        world.renderer.postproduction.customEffects.outlineEnabled = true;
      }
    }
  }

  world.renderer?.resize();
  world.camera.updateAspect();
};

const resizeObserver = new ResizeObserver(() => resizeWorld());
resizeObserver.observe(viewport);
// Note: Immediate resizeWorld() call removed. We wait for ResizeObserver to provide first valid layout.

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
const webIfcWasmPath = new URL("/web-ifc/", window.location.origin).toString();
await ifcLoader.setup({
  autoSetWasm: false,
  wasm: { absolute: true, path: webIfcWasmPath },
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

  // CAPTURE THUMBNAIL for dashboard preview
  const thumbParams = new URLSearchParams(window.location.search);
  const thumbFileId = thumbParams.get("fileId");
  if (thumbFileId) {
    await new Promise(resolve => setTimeout(resolve, 800));
    try {
      const canvas = world.renderer.three.domElement;
      world.renderer.three.render(world.scene.three, world.camera.three);
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
// resizeWorld(); // REMOVED: Triggers WebGL zero-size warnings if called before layout is ready

// ---- Mobiele paneel-drawers ----
// Op mobiel verschijnen FAB-knoppen waarmee gebruikers de zijpanelen kunnen openen.
// Dit gebruikt CSS-klassen (.mobile-panel-open) zodat de animaties via CSS lopen.
const isMobile = () => window.innerWidth <= 768;

const setupMobilePanelToggles = () => {
  if (!isMobile()) return;

  const leftPanel = document.querySelector('.app-side-panel--left') as HTMLElement | null;
  const rightPanel = document.querySelector('.app-side-panel--right') as HTMLElement | null;
  if (!leftPanel || !rightPanel) return;

  // Scrim (overlay achter open paneel)
  const scrim = document.createElement('div');
  scrim.className = 'mobile-panel-scrim';
  document.body.appendChild(scrim);

  const closeAll = () => {
    leftPanel.classList.remove('mobile-panel-open');
    rightPanel.classList.remove('mobile-panel-open');
    scrim.classList.remove('visible');
  };

  scrim.addEventListener('click', closeAll);

  // FAB knop: Modellen (links)
  const fabModels = document.createElement('button');
  fabModels.className = 'mobile-fab mobile-fab--models';
  fabModels.setAttribute('aria-label', 'Modellen tonen');
  fabModels.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
  fabModels.addEventListener('click', () => {
    const isOpen = leftPanel.classList.contains('mobile-panel-open');
    closeAll();
    if (!isOpen) {
      leftPanel.classList.add('mobile-panel-open');
      scrim.classList.add('visible');
    }
  });
  document.body.appendChild(fabModels);

  // FAB knop: Eigenschappen (rechts)
  const fabProperties = document.createElement('button');
  fabProperties.className = 'mobile-fab mobile-fab--properties';
  fabProperties.setAttribute('aria-label', 'Eigenschappen tonen');
  fabProperties.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  fabProperties.addEventListener('click', () => {
    const isOpen = rightPanel.classList.contains('mobile-panel-open');
    closeAll();
    if (!isOpen) {
      rightPanel.classList.add('mobile-panel-open');
      scrim.classList.add('visible');
    }
  });
  document.body.appendChild(fabProperties);
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
