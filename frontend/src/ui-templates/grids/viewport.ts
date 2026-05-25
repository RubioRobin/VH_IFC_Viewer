import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
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
          <div class="vh-view-cube__shadow"></div>
        </div>
      </div>
      <div class="viewport-ui-bottom">
        ${bottomToolbar}
      </div>
    </div>
  `;
};
