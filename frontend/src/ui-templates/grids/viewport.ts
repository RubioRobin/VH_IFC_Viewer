import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import { viewerToolbarTemplate } from "../toolbars/viewer-toolbar";
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

  const [bottomToolbar] = BUI.Component.create(viewerToolbarTemplate, {
    components,
    world,
    transparencyManager,
  });

  return BUI.html`
    <div class="viewport-ui-overlay">
      <div class="viewport-ui-bottom">
        ${bottomToolbar}
      </div>
    </div>
  `;
};
