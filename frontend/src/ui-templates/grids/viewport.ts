import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import "@thatopen/ui-obc";
import { viewerToolbarTemplate, ViewerToolbarState } from "../toolbars/viewer-toolbar";
import { TransparencyManager } from "../../viewer/transparency-manager";

interface ViewportGridState {
  components: OBC.Components;
  world: OBC.World;
  transparencyManager: TransparencyManager;
}

type CubeOrientation = "front" | "back" | "left" | "right" | "top" | "bottom";

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

export const viewportGridTemplate: BUI.StatefullComponent<ViewportGridState> = (
  state,
) => {
  const { components, world, transparencyManager } = state;

  const [bottomToolbar] = BUI.Component.create(viewerToolbarTemplate, { components, world, transparencyManager });
  const viewCube = document.createElement("bim-view-cube") as HTMLElement & {
    camera?: THREE.Camera;
    size?: number;
    rightText?: string;
    leftText?: string;
    topText?: string;
    bottomText?: string;
    frontText?: string;
    backText?: string;
    updateOrientation?: () => void;
  };
  viewCube.className = "vh-view-cube";
  viewCube.camera = (world.camera as any).three;
  viewCube.size = 72;
  viewCube.topText = "TOP";
  viewCube.bottomText = "BOTTOM";
  viewCube.frontText = "FRONT";
  viewCube.backText = "BACK";
  viewCube.leftText = "LEFT";
  viewCube.rightText = "RIGHT";

  const orientationEvents: Record<string, CubeOrientation> = {
    topclick: "top",
    bottomclick: "bottom",
    frontclick: "front",
    backclick: "back",
    leftclick: "left",
    rightclick: "right",
  };

  for (const [eventName, orientation] of Object.entries(orientationEvents)) {
    viewCube.addEventListener(eventName, () => {
      viewFromOrientation(components, world, orientation).then(() => {
        viewCube.camera = (world.camera as any).three;
        viewCube.updateOrientation?.();
      });
    });
  }

  return BUI.html`
    <div class="viewport-ui-overlay">
      <div class="viewport-ui-top">
        ${viewCube}
      </div>
      <div class="viewport-ui-bottom">
        ${bottomToolbar}
      </div>
    </div>
  `;
};
