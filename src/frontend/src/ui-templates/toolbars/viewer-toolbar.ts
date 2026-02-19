import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import { appIcons } from "../../globals";
import { customButton } from "../components/custom-button";
import { TransparencyManager } from "../../viewer/transparency-manager";

export interface ViewerToolbarState {
  components: OBC.Components;
  world: OBC.World;
  transparencyManager: TransparencyManager;
}

const originalColors = new Map<
  FRAGS.BIMMaterial,
  { color: number; transparent: boolean; opacity: number }
>();

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
  const fragments = components.get(OBC.FragmentsManager);

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

  /* Measurement & Clipper Logic */
  const lengthMeasurer = components.get(OBF.LengthMeasurement);
  const areaMeasurer = components.get(OBF.AreaMeasurement);
  const clipper = components.get(OBC.Clipper);

  const disableAll = () => {
    BUI.ContextMenu.removeMenus();
    lengthMeasurer.enabled = false;
    areaMeasurer.enabled = false;
    clipper.enabled = false;
    highlighter.enabled = true;
  };


  const onSectionBox = async (e: any) => {
    const btn = e.currentTarget as BUI.Button;

    // If planes exist, clear them
    if (clipper.list.size > 0) {
      clipper.delete(world as any);
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
    clipper.config.color = new THREE.Color("#ff0000");
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

  const onToggleLengthMeasure = () => {
    if (lengthMeasurer.enabled) {
      lengthMeasurer.enabled = false;
      lengthMeasurer.delete();
      highlighter.enabled = true;
    } else {
      disableAll();
      lengthMeasurer.enabled = true;
      highlighter.enabled = false;
      lengthMeasurer.create();
    }
  };

  const onDeleteMeasurements = () => {
    (lengthMeasurer.list as any).clear();
  };

  return BUI.html`
    <bim-toolbar>
      <bim-toolbar-section> 
        ${customButton({ icon: appIcons.SHOW, label: "Toon alles", onClick: onShowAll })}
        ${customButton({ icon: appIcons.TRANSPARENT, label: "Transparant", onClick: onToggleGhost })}
      </bim-toolbar-section> 
      
      <bim-toolbar-section>
        ${customButton({ icon: appIcons.FOCUS, label: "Focus", onClick: onFocus })}
        ${customButton({ icon: appIcons.HIDE, label: "Verberg", onClick: onHide })}
        ${customButton({ icon: appIcons.ISOLATE, label: "Isoleer", onClick: onIsolate })}
      </bim-toolbar-section> 

      <bim-toolbar-section>
         ${customButton({ icon: appIcons.RULER, label: "Lengte meten", onClick: onToggleLengthMeasure })}
         ${customButton({ icon: appIcons.DELETE, label: "Wis metingen", onClick: onDeleteMeasurements })}
         ${customButton({ icon: appIcons.CLIPPING, label: "Sectie Box", onClick: onSectionBox })}
      </bim-toolbar-section>
    </bim-toolbar>
  `;
};
