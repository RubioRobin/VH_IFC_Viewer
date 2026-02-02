import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import { modelsPanelTemplate, ModelsPanelState } from "../sections/models";
import { elementsDataPanelTemplate, ElementsDataPanelState } from "../sections/elements-data";

export interface ContentGridState {
  components: OBC.Components;
  viewportTemplate: BUI.StatelessComponent;
}

// Store the update function globally so models.ts can access it
let globalModelsUpdate: ((state: Partial<ModelsPanelState>) => void) | null = null;

export const getModelsUpdate = () => globalModelsUpdate;

export const contentGridTemplate: BUI.StatefullComponent<ContentGridState> = (
  state,
) => {
  const { components } = state;

  // Create the models panel with update function
  const [modelsPanel, updateModelsPanel] = BUI.Component.create(
    modelsPanelTemplate,
    { components, loading: false }
  );

  // Store the update function globally
  globalModelsUpdate = updateModelsPanel;

  // Set up auto-refresh when fragments are loaded/deleted
  const fragments = components.get(OBC.FragmentsManager);
  const refreshModels = () => {
    updateModelsPanel({ _version: Date.now() });
  };

  // Add event listeners
  fragments.onFragmentsLoaded.add(refreshModels);
  fragments.list.onItemDeleted.add(refreshModels);

  const [elementsDataPanel] = BUI.Component.create(elementsDataPanelTemplate, { components });
  const viewportPanel = state.viewportTemplate();

  return BUI.html`
    <div class="app-content">
      <aside class="app-side-panel app-side-panel--left">
        ${modelsPanel}
      </aside>
      <main class="app-viewer-container">
        ${viewportPanel}
      </main>
      <aside class="app-side-panel app-side-panel--right">
        ${elementsDataPanel}
      </aside>
    </div>
  `;
};
