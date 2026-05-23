import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import { appIcons } from "../../globals";
import { customButton } from "../components/custom-button";
import { TransparencyManager } from "../../viewer/transparency-manager";
import { triggerDownload } from "../../viewer/download-store";

export interface ViewerToolbarState {
  components: OBC.Components;
  world: OBC.World;
  transparencyManager: TransparencyManager;
}

const originalColors = new Map<
  FRAGS.BIMMaterial,
  { color: number; transparent: boolean; opacity: number }
>();

type MeasurementKind = "length" | "angle" | "area" | "volume";

const measurementLabels: Record<MeasurementKind, string> = {
  length: "Afstand meten",
  angle: "Hoek meten",
  area: "Oppervlak meten",
  volume: "Volume meten",
};

const setModelTransparent = (components: OBC.Components) => {
  const fragments = components.get(OBC.FragmentsManager);

  const materials = [...fragments.core.models.materials.list.values()];
  for (const material of materials) {
    if (material.userData.customId) continue;
    // save colors
    let color: number | undefined;
    if ("color" in material) {
      color = material.color.getHex();
    } else {
      color = material.lodColor.getHex();
    }

    originalColors.set(material, {
      color,
      transparent: material.transparent,
      opacity: material.opacity,
    });

    // set color
    material.transparent = true;
    material.opacity = 0.05;
    material.needsUpdate = true;
    if ("color" in material) {
      material.color.setColorName("white");
    } else {
      material.lodColor.setColorName("white");
    }
  }
};

const restoreModelMaterials = () => {
  for (const [material, data] of originalColors) {
    const { color, transparent, opacity } = data;
    material.transparent = transparent;
    material.opacity = opacity;
    if ("color" in material) {
      material.color.setHex(color);
    } else {
      material.lodColor.setHex(color);
    }
    material.needsUpdate = true;
  }
  originalColors.clear();
};

export const viewerToolbarTemplate: BUI.StatefullComponent<
  ViewerToolbarState
> = (state) => {
  const { components, world, transparencyManager } = state;

  const highlighter = components.get(OBF.Highlighter);
  const hider = components.get(OBC.Hider);
  const lengthMeasurement = components.get(OBF.LengthMeasurement);
  const angleMeasurement = components.get(OBF.AngleMeasurement);
  const areaMeasurement = components.get(OBF.AreaMeasurement);
  const volumeMeasurement = components.get(OBF.VolumeMeasurement);

  const measurementTools = {
    length: lengthMeasurement,
    angle: angleMeasurement,
    area: areaMeasurement,
    volume: volumeMeasurement,
  };

  for (const tool of Object.values(measurementTools)) {
    if ((tool as any).world !== world) (tool as any).world = world;
    (tool as any).color = new THREE.Color("#c1a979");
    if ("snappings" in tool) {
      (tool as any).snappings = [FRAGS.SnappingClass.POINT, FRAGS.SnappingClass.LINE, FRAGS.SnappingClass.FACE];
    }
    if ("rounding" in tool) (tool as any).rounding = 2;
    tool.enabled = false;
  }
  lengthMeasurement.units = "m";
  areaMeasurement.units = "m2";
  volumeMeasurement.units = "m3";
  angleMeasurement.units = "deg";

  let activeMeasurement: MeasurementKind | null = null;

  const onToggleGhost = () => {
    const current = transparencyManager.getCurrentTransparency();
    if (current < 1.0) {
      transparencyManager.setSolidMode();
    } else {
      transparencyManager.setGhostMode();
    }
  };

  const onFocus = async () => {
    const selection = highlighter.selection.select;
    if (OBC.ModelIdMapUtils.isEmpty(selection)) {
      // Zoom to all
      const bbox = components.get(OBC.BoundingBoxer);
      bbox.list.clear();
      bbox.addFromModels();
      const box = bbox.get();
      if (box && !box.isEmpty()) {
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        world.camera.controls?.fitToSphere(sphere, true);
      }
    } else {
      // Zoom to selection
      if (world.camera instanceof OBC.SimpleCamera || world.camera instanceof OBC.OrthoPerspectiveCamera) {
        await (world.camera as any).fitToItems(selection);
      }
    }
  };

  const onHide = async () => {
    const selection = highlighter.selection.select;
    if (OBC.ModelIdMapUtils.isEmpty(selection)) return;
    await hider.set(false, selection);
  };

  const onIsolate = async () => {
    const selection = highlighter.selection.select;
    if (OBC.ModelIdMapUtils.isEmpty(selection)) return;
    await hider.isolate(selection);
  };

  const onShowAll = async () => {
    await hider.set(true);
    restoreModelMaterials();
  };

  const fitToLoadedModel = async () => {
    const bbox = components.get(OBC.BoundingBoxer);
    bbox.list.clear();
    bbox.addFromModels();
    const box = bbox.get();
    if (!box || box.isEmpty()) return false;
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    world.camera.controls?.fitToSphere(sphere, true);
    return true;
  };

  const viewFromOrientation = async (
    orientation: "front" | "back" | "left" | "right" | "top" | "bottom",
  ) => {
    const camera = world.camera as OBC.OrthoPerspectiveCamera;
    const bbox = components.get(OBC.BoundingBoxer);
    bbox.list.clear();
    bbox.addFromModels();
    const box = bbox.get();
    if (!box || box.isEmpty()) return;

    await camera.projection.set("Orthographic");
    (world.renderer as any)?.postproduction?.updateCamera?.();

    const { position, target } = await bbox.getCameraOrientation(orientation);
    await camera.controls.setLookAt(
      position.x,
      position.y,
      position.z,
      target.x,
      target.y,
      target.z,
      true,
    );
  };

  const setTheme = (mode: "light" | "dark") => {
    const html = document.documentElement;
    html.classList.toggle("vh-light-mode", mode === "light");
    html.classList.toggle("vh-dark-mode", mode === "dark");
    html.classList.toggle("bim-ui-light", mode === "light");
    html.classList.toggle("bim-ui-dark", mode === "dark");
    localStorage.setItem("vh-viewer-theme", mode);
    world.scene.three.background = new THREE.Color(mode === "light" ? 0xf4f1ea : 0x101112);
  };

  const onToggleTheme = () => {
    const isLight = document.documentElement.classList.contains("vh-light-mode");
    setTheme(isLight ? "dark" : "light");
  };

  const savedTheme = localStorage.getItem("vh-viewer-theme");
  setTheme(savedTheme === "light" ? "light" : "dark");

  const clearMeasurementHover = () => {
    const viewport = document.querySelector("bim-viewport") as HTMLElement | null;
    if (viewport) viewport.ondblclick = null;
  };

  const disableMeasurements = () => {
    for (const tool of Object.values(measurementTools)) tool.enabled = false;
    activeMeasurement = null;
    clearMeasurementHover();
  };

  const activateMeasurement = async (kind: MeasurementKind) => {
    disableMeasurements();
    await viewFromOrientation("top");

    const tool = measurementTools[kind] as any;
    tool.enabled = true;
    activeMeasurement = kind;
    highlighter.enabled = false;
    clipper.enabled = false;

    const viewport = document.querySelector("bim-viewport") as HTMLElement | null;
    if (viewport) {
      viewport.ondblclick = () => {
        if (!activeMeasurement) return;
        const activeTool = measurementTools[activeMeasurement] as any;
        if (typeof activeTool.create === "function") activeTool.create();
      };
    }
  };

  const clearMeasurements = () => {
    for (const tool of Object.values(measurementTools) as any[]) {
      if (tool.cancelCreation) tool.cancelCreation();
      if (tool.list?.clear) tool.list.clear();
      if (tool.lines?.clear) tool.lines.clear();
      if (tool.fills?.clear) tool.fills.clear();
      if (tool.labels?.clear) tool.labels.clear();
      if (tool.volumes?.clear) tool.volumes.clear();
      if (tool.deleteAll) tool.deleteAll();
    }
    disableMeasurements();
    highlighter.enabled = true;
  };

  /* Measurement & Clipper Logic */
  const clipper = components.get(OBC.Clipper);

  const disableAll = () => {
    BUI.ContextMenu.removeMenus();
    clipper.enabled = false;
    disableMeasurements();
    highlighter.enabled = true;
  };


  const onSectionBox = async (e: any) => {
    const btn = e.currentTarget as BUI.Button;

    // Use button state as truth for toggle
    if (btn.active) {
      if ("deleteAll" in clipper) {
        (clipper as any).deleteAll();
      } else {
        const planes = Array.from(clipper.list);
        for (const plane of planes) {
          clipper.delete(world as any, plane);
        }
      }
      clipper.enabled = false;
      btn.active = false;
      return;
    }

    disableAll();

    // Create bounding box for the entire model
    const bbox = components.get(OBC.BoundingBoxer);
    bbox.list.clear();
    bbox.addFromModels();
    const box = bbox.get();

    if (!box || box.isEmpty()) {
      alert("Geen model geladen om een Sectie Box te maken.");
      return;
    }

    // Adjust clipper size and color
    const sizeVec = new THREE.Vector3();
    box.getSize(sizeVec);
    const diagonal = Math.sqrt(sizeVec.x ** 2 + sizeVec.y ** 2 + sizeVec.z ** 2);
    clipper.size = diagonal * 1.2;
    clipper.config.color = new THREE.Color("#c1a979");
    clipper.config.opacity = 0.25;

    // Expand box slightly to avoid z-fighting
    const expandedBox = box.clone().expandByScalar(0.1);
    const min = expandedBox.min;
    const max = expandedBox.max;
    const center = new THREE.Vector3();
    expandedBox.getCenter(center);

    // Define 6 planes (Normal towards center, Point on box face center)
    const planeData = [
      { normal: new THREE.Vector3(1, 0, 0), point: new THREE.Vector3(min.x, center.y, center.z) },   // Left
      { normal: new THREE.Vector3(-1, 0, 0), point: new THREE.Vector3(max.x, center.y, center.z) },  // Right
      { normal: new THREE.Vector3(0, 1, 0), point: new THREE.Vector3(center.x, min.y, center.z) },   // Bottom
      { normal: new THREE.Vector3(0, -1, 0), point: new THREE.Vector3(center.x, max.y, center.z) },  // Top
      { normal: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(center.x, center.y, min.z) },   // Back
      { normal: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(center.x, center.y, max.z) },  // Front
    ];

    for (const p of planeData) {
      clipper.createFromNormalAndCoplanarPoint(world, p.normal, p.point);
    }

    clipper.enabled = true;
    clipper.visible = true;
    btn.active = true;
  };



  return BUI.html`
    <bim-toolbar>
      <bim-toolbar-section> 
        ${customButton({ icon: appIcons.SHOW, label: "Toon alles", onClick: onShowAll })}
        ${customButton({ icon: appIcons.TRANSPARENT, label: "Transparant", onClick: onToggleGhost })}
        ${customButton({ icon: appIcons.THEME, label: "Thema", onClick: onToggleTheme })}
      </bim-toolbar-section> 
      
      <bim-toolbar-section>
        ${customButton({ icon: appIcons.FOCUS, label: "Focus", onClick: onFocus })}
        ${customButton({ icon: appIcons.HIDE, label: "Verberg", onClick: onHide })}
        ${customButton({ icon: appIcons.ISOLATE, label: "Isoleer", onClick: onIsolate })}
      </bim-toolbar-section> 

      <bim-toolbar-section>
         ${customButton({ icon: appIcons.CLIPPING, label: "Sectie Box", onClick: onSectionBox })}
      </bim-toolbar-section>

      <bim-toolbar-section>
        ${customButton({ icon: appIcons.TOP, label: "Top", onClick: () => viewFromOrientation("top") })}
        ${customButton({ icon: appIcons.BOTTOM, label: "Onder", onClick: () => viewFromOrientation("bottom") })}
        ${customButton({ icon: appIcons.FRONT, label: "Voor", onClick: () => viewFromOrientation("front") })}
        ${customButton({ icon: appIcons.BACK, label: "Achter", onClick: () => viewFromOrientation("back") })}
        ${customButton({ icon: appIcons.LEFT, label: "Links", onClick: () => viewFromOrientation("left") })}
        ${customButton({ icon: appIcons.RIGHT, label: "Rechts", onClick: () => viewFromOrientation("right") })}
        ${customButton({ icon: appIcons.FOCUS, label: "Alles", onClick: fitToLoadedModel })}
      </bim-toolbar-section>

      <bim-toolbar-section>
        ${customButton({ icon: appIcons.RULER, label: measurementLabels.length, onClick: () => activateMeasurement("length") })}
        ${customButton({ icon: appIcons.ANGLE, label: measurementLabels.angle, onClick: () => activateMeasurement("angle") })}
        ${customButton({ icon: appIcons.AREA, label: measurementLabels.area, onClick: () => activateMeasurement("area") })}
        ${customButton({ icon: appIcons.VOLUME, label: measurementLabels.volume, onClick: () => activateMeasurement("volume") })}
        ${customButton({ icon: appIcons.DELETE, label: "Metingen wissen", onClick: clearMeasurements })}
      </bim-toolbar-section>

    </bim-toolbar>
  `;
};
