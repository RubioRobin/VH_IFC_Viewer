import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import { viewerToolbarTemplate, ViewerToolbarState } from "../toolbars/viewer-toolbar";
import { TransparencyManager } from "../../viewer/transparency-manager";

interface ViewportGridState {
  components: OBC.Components;
  world: OBC.World;
  transparencyManager: TransparencyManager;
}

type CubeOrientation = "front" | "back" | "left" | "right" | "top" | "bottom";

const syncedWorlds = new WeakSet<OBC.World>();

const syncViewCubeRotation = (world: OBC.World) => {
  const controls = (world.camera as OBC.OrthoPerspectiveCamera | undefined)?.controls as any;
  const cube = document.querySelector<HTMLElement>(".vh-view-cube__cube");
  if (!controls || !cube) return;

  const position = new THREE.Vector3();
  const target = new THREE.Vector3();

  if (typeof controls.getPosition === "function") {
    controls.getPosition(position, false);
  } else {
    position.copy((world.camera as any).three.position);
  }

  if (typeof controls.getTarget === "function") {
    controls.getTarget(target, false);
  }

  const direction = position.sub(target);
  if (direction.lengthSq() < 0.000001) return;

  const horizontalDistance = Math.hypot(direction.x, direction.z);
  const pitch = THREE.MathUtils.radToDeg(Math.atan2(direction.y, horizontalDistance));
  const yaw = THREE.MathUtils.radToDeg(Math.atan2(direction.x, direction.z));

  cube.style.setProperty("--vh-cube-rotation", `rotateX(${-pitch}deg) rotateY(${yaw}deg)`);
};

const setupViewCubeRotation = (world: OBC.World) => {
  requestAnimationFrame(() => syncViewCubeRotation(world));
  if (syncedWorlds.has(world)) return;

  const controls = (world.camera as OBC.OrthoPerspectiveCamera | undefined)?.controls as any;
  if (!controls || typeof controls.addEventListener !== "function") return;

  syncedWorlds.add(world);
  const sync = () => syncViewCubeRotation(world);
  for (const eventName of ["control", "update", "rest", "sleep"]) {
    controls.addEventListener(eventName, sync);
  }
};

const viewFromOrientation = async (
  components: OBC.Components,
  world: OBC.World,
  orientation: CubeOrientation,
) => {
  const camera = world.camera as OBC.OrthoPerspectiveCamera;
  const bbox = components.get(OBC.BoundingBoxer);
  bbox.list.clear();
  bbox.addFromModels();
  const box = bbox.get();
  if (!box || box.isEmpty()) return;

  const controls = camera.controls as any;
  controls.stop?.();
  controls.normalizeRotations?.();

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
  window.dispatchEvent(new CustomEvent("vh-grid-plane-change", { detail: { orientation } }));
  syncViewCubeRotation(world);
};

export const viewportGridTemplate: BUI.StatefullComponent<ViewportGridState> = (
  state,
) => {
  const { components, world, transparencyManager } = state;

  setupViewCubeRotation(world);

  const [bottomToolbar] = BUI.Component.create(viewerToolbarTemplate, { components, world, transparencyManager });

  const onCubeFaceClick = (orientation: CubeOrientation) => (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    viewFromOrientation(components, world, orientation);
  };

  return BUI.html`
    <div class="viewport-ui-overlay">
      <div class="viewport-ui-top">
        <div class="vh-view-cube" aria-label="View cube">
          <div class="vh-view-cube__scene">
            <div class="vh-view-cube__cube">
              <button class="vh-view-cube__face vh-view-cube__face--front" @click=${onCubeFaceClick("front")}>FRONT</button>
              <button class="vh-view-cube__face vh-view-cube__face--right" @click=${onCubeFaceClick("right")}>RIGHT</button>
              <button class="vh-view-cube__face vh-view-cube__face--top" @click=${onCubeFaceClick("top")}>TOP</button>
              <button class="vh-view-cube__face vh-view-cube__face--back" @click=${onCubeFaceClick("back")}>BACK</button>
              <button class="vh-view-cube__face vh-view-cube__face--left" @click=${onCubeFaceClick("left")}>LEFT</button>
              <button class="vh-view-cube__face vh-view-cube__face--bottom" @click=${onCubeFaceClick("bottom")}>BOTTOM</button>
            </div>
          </div>
        </div>
      </div>
      <div class="viewport-ui-bottom">
        ${bottomToolbar}
      </div>
    </div>
  `;
};
