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

type MeasurementAxis = "3d" | "x" | "y" | "z";

const axisLabels: Record<MeasurementAxis, string> = {
  "3d": "3D",
  x: "X",
  y: "Y",
  z: "Z",
};

const formatMillimeters = (distanceInMeters: number) =>
  `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(
    Math.abs(distanceInMeters) * 1000,
  )} mm`;

const disposeMeasurementGroup = (group: THREE.Group) => {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of materials) {
      const map = (material as THREE.Material & { map?: THREE.Texture }).map;
      map?.dispose();
      material.dispose();
    }
  });
  group.removeFromParent();
};

const createMeasurementLabel = (text: string) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  const fontSize = 52;
  const paddingX = 26;
  const paddingY = 16;
  context.font = `600 ${fontSize}px Arial`;
  const textWidth = Math.ceil(context.measureText(text).width);
  canvas.width = textWidth + paddingX * 2;
  canvas.height = fontSize + paddingY * 2;

  context.font = `600 ${fontSize}px Arial`;
  context.fillStyle = "rgba(27, 30, 33, 0.94)";
  context.roundRect(0, 0, canvas.width, canvas.height, 12);
  context.fill();
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText(text, paddingX, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const label = new THREE.Sprite(material);
  const aspectRatio = canvas.width / canvas.height;
  label.scale.set(0.36 * aspectRatio, 0.36, 1);
  label.renderOrder = 1002;
  return label;
};

const projectToAxis = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  axis: Exclude<MeasurementAxis, "3d">,
) => {
  const projectedEnd = start.clone();
  projectedEnd[axis] = end[axis];
  return projectedEnd;
};

export const viewerToolbarTemplate: BUI.StatefullComponent<
  ViewerToolbarState
> = (state) => {
  const { components, world, transparencyManager } = state;

  const highlighter = components.get(OBF.Highlighter);
  const hider = components.get(OBC.Hider);
  const lengthMeasurement = components.get(OBF.LengthMeasurement);

  if ((lengthMeasurement as any).world !== world) {
    (lengthMeasurement as any).world = world;
  }
  lengthMeasurement.color = new THREE.Color("#c1a979");
  lengthMeasurement.snappings = [
    FRAGS.SnappingClass.POINT,
    FRAGS.SnappingClass.LINE,
    FRAGS.SnappingClass.FACE,
  ];
  lengthMeasurement.rounding = 0;
  lengthMeasurement.units = "mm";
  lengthMeasurement.enabled = false;

  let distanceMeasurementActive = false;
  let measurementAxis: MeasurementAxis = "3d";
  const axisMeasurementGroups = new Set<THREE.Group>();

  const clearAxisMeasurements = () => {
    for (const group of axisMeasurementGroups) disposeMeasurementGroup(group);
    axisMeasurementGroups.clear();
  };

  const createAxisMeasurement = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    axis: Exclude<MeasurementAxis, "3d">,
  ) => {
    const projectedEnd = projectToAxis(start, end, axis);
    const distance = Math.abs(end[axis] - start[axis]);
    const group = new THREE.Group();
    group.name = `VH ${axis.toUpperCase()} measurement`;

    const dimensionMaterial = new THREE.LineBasicMaterial({
      color: 0xc1a979,
      depthTest: false,
      toneMapped: false,
    });
    const dimensionGeometry = new THREE.BufferGeometry().setFromPoints([
      start,
      projectedEnd,
    ]);
    const dimensionLine = new THREE.Line(
      dimensionGeometry,
      dimensionMaterial,
    );
    dimensionLine.renderOrder = 1000;
    group.add(dimensionLine);

    // Korte eindstrepen geven de maatlijn dezelfde leesbaarheid als een
    // uitgelijnde Revit/AutoCAD-maat, ook in een schuine camerastand.
    const tickDirection = new THREE.Vector3();
    tickDirection[axis === "y" ? "z" : "y"] = 0.08;
    const tickPoints = [
      start.clone().sub(tickDirection),
      start.clone().add(tickDirection),
      projectedEnd.clone().sub(tickDirection),
      projectedEnd.clone().add(tickDirection),
    ];
    const ticks = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(tickPoints),
      dimensionMaterial,
    );
    ticks.renderOrder = 1000;
    group.add(ticks);

    // De stippellijn maakt zichtbaar welk geselecteerd punt naar de as is geprojecteerd.
    if (projectedEnd.distanceToSquared(end) > 0.0000001) {
      const extensionGeometry = new THREE.BufferGeometry().setFromPoints([
        projectedEnd,
        end,
      ]);
      const extensionLine = new THREE.Line(
        extensionGeometry,
        new THREE.LineDashedMaterial({
          color: 0xc1a979,
          dashSize: 0.08,
          gapSize: 0.04,
          depthTest: false,
          toneMapped: false,
        }),
      );
      extensionLine.computeLineDistances();
      extensionLine.renderOrder = 999;
      group.add(extensionLine);
    }

    const label = createMeasurementLabel(
      `${axisLabels[axis]} · ${formatMillimeters(distance)}`,
    );
    if (label) {
      label.position.copy(start).lerp(projectedEnd, 0.5);
      label.position.y += 0.22;
      group.add(label);
    }

    world.scene.three.add(group);
    axisMeasurementGroups.add(group);
  };

  // LengthMeasurement verzorgt betrouwbare IFC-snapping. Na de tweede klik
  // vervangen we de standaard 3D-maatlijn alleen bij een asmeting.
  lengthMeasurement.list.onItemAdded.add((line) => {
    if (measurementAxis === "3d") return;

    const start = line.start.clone();
    const end = line.end.clone();
    const axis = measurementAxis;
    lengthMeasurement.list.delete(line);
    createAxisMeasurement(start, end, axis);
  });

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
  };

  const clipper = components.get(OBC.Clipper);

  const clearDistanceClickHandler = () => {
    const viewport = document.querySelector("bim-viewport") as HTMLElement | null;
    if (viewport) viewport.onclick = null;
  };

  const setDistanceMeasurementActive = (active: boolean) => {
    distanceMeasurementActive = active;
    lengthMeasurement.enabled = active;
    highlighter.enabled = !active;

    if (!active) {
      lengthMeasurement.cancelCreation();
      clearDistanceClickHandler();
    }
  };

  const clearDistanceMeasurements = () => {
    const tool = lengthMeasurement as any;

    if (tool.cancelCreation) tool.cancelCreation();
    if (tool.list?.clear) tool.list.clear();
    if (tool.lines?.clear) tool.lines.clear();
    if (tool.fills?.clear) tool.fills.clear();
    if (tool.labels?.clear) tool.labels.clear();
    if (tool.volumes?.clear) tool.volumes.clear();

    clearAxisMeasurements();

    setDistanceMeasurementActive(false);
  };

  const setMeasurementAxis = (axis: MeasurementAxis) => {
    measurementAxis = axis;
    lengthMeasurement.cancelCreation();

    document.querySelectorAll<HTMLButtonElement>("[data-measurement-axis]").forEach((button) => {
      const isActive = button.dataset.measurementAxis === axis;
      button.classList.toggle("custom-btn--active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const disableAll = () => {
    BUI.ContextMenu.removeMenus();
    clipper.enabled = false;
    setDistanceMeasurementActive(false);
    highlighter.enabled = true;
  };

  const onMeasureDistance = () => {
    BUI.ContextMenu.removeMenus();

    if (distanceMeasurementActive) {
      setDistanceMeasurementActive(false);
      return;
    }

    clipper.enabled = false;
    setDistanceMeasurementActive(true);

    const viewport = document.querySelector("bim-viewport") as HTMLElement | null;
    if (!viewport) return;

    viewport.onclick = (event) => {
      if (!distanceMeasurementActive) return;
      event.preventDefault();
      event.stopPropagation();
      lengthMeasurement.create();
    };
  };


  const onSectionBox = async (e: any) => {
    const btn = e.currentTarget as BUI.Button;

    // Use button state as truth for toggle
    if (btn.active) {
      (clipper as any).deleteAll();
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
      </bim-toolbar-section> 
      
      <bim-toolbar-section>
        ${customButton({ icon: appIcons.FOCUS, label: "Focus", onClick: onFocus })}
        ${customButton({ icon: appIcons.HIDE, label: "Verberg", onClick: onHide })}
        ${customButton({ icon: appIcons.ISOLATE, label: "Isoleer", onClick: onIsolate })}
      </bim-toolbar-section> 

      <bim-toolbar-section>
        ${customButton({ icon: appIcons.RULER, label: "Afstand meten", onClick: onMeasureDistance })}
        ${customButton({ icon: appIcons.DELETE, label: "Afstand wissen", onClick: clearDistanceMeasurements })}
      </bim-toolbar-section>

      <bim-toolbar-section aria-label="Meetmethode">
        ${(["3d", "x", "y", "z"] as MeasurementAxis[]).map((axis) => BUI.html`
          <button
            class="custom-btn ${axis === measurementAxis ? "custom-btn--active" : ""}"
            data-measurement-axis="${axis}"
            aria-label="Meet alleen in ${axisLabels[axis]}-richting"
            aria-pressed="${axis === measurementAxis}"
            @click=${() => setMeasurementAxis(axis)}
          >
            <span class="custom-btn__label">${axisLabels[axis]}</span>
          </button>
        `)}
      </bim-toolbar-section>

      <bim-toolbar-section>
         ${customButton({ icon: appIcons.CLIPPING, label: "Sectie Box", onClick: onSectionBox })}
      </bim-toolbar-section>
    </bim-toolbar>
  `;
};
