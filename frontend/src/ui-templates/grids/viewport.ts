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

export const viewportGridTemplate: BUI.StatefullComponent<ViewportGridState> = (
  state,
) => {
  const { components, world, transparencyManager } = state;

  const [bottomToolbar] = BUI.Component.create(viewerToolbarTemplate, { components, world, transparencyManager });
  const viewCube = document.createElement("bim-view-cube") as HTMLElement & { camera?: THREE.Camera };
  viewCube.className = "vh-view-cube";
  viewCube.camera = (world.camera as any).three;

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
