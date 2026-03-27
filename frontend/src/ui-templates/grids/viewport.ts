import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
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

  return BUI.html`
    <div class="viewport-ui-overlay">
      <div class="viewport-logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="5" fill="#4f46e5"/>
          <path d="M5 7L9 17L12 10L15 17L19 7" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="viewport-logo__text">VH Engineering</span>
      </div>
      <div class="viewport-ui-bottom">
        ${bottomToolbar}
      </div>
    </div>
  `;
};
