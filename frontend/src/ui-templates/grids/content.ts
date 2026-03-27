import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import { modelsPanelTemplate, ModelsPanelState } from "../sections/models";
import { elementsDataPanelTemplate } from "../sections/elements-data";
import { modelTreeTemplate } from "../sections/model-tree";

export interface ContentGridState {
  components: OBC.Components;
  world: OBC.World;
  viewportTemplate: BUI.StatelessComponent;
}

// Store the update function globally so models.ts can access it
let globalModelsUpdate: ((state: Partial<ModelsPanelState>) => void) | null = null;

export const getModelsUpdate = () => globalModelsUpdate;

export const contentGridTemplate: BUI.StatefullComponent<ContentGridState> = (
  state,
) => {
  const { components, world } = state;

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
  fragments.onFragmentsLoaded.add(refreshModels);
  fragments.list.onItemDeleted.add(refreshModels);

  const [elementsDataPanel] = BUI.Component.create(elementsDataPanelTemplate, { components });
  const [modelTreePanel] = BUI.Component.create(modelTreeTemplate, { components, world });
  const viewportPanel = state.viewportTemplate();

  // ── Linker paneel met tabbladen: Modellen | Structuur ──────────────
  const leftPanelContainer = document.createElement("div");
  leftPanelContainer.style.cssText = "display:flex;flex-direction:column;height:100%;overflow:hidden;";

  // Tab bar
  const tabBar = document.createElement("div");
  tabBar.style.cssText = "display:flex;border-bottom:1px solid #e5e7eb;background:white;flex-shrink:0;";

  const tabModels = document.createElement("button");
  tabModels.textContent = "Modellen";
  tabModels.style.cssText = `
    flex:1;padding:0.75rem 0.5rem;border:none;background:none;cursor:pointer;
    font-size:0.8125rem;font-weight:600;border-bottom:2px solid #4f46e5;
    color:#4f46e5;transition:all 0.15s ease;
  `;

  const tabStructure = document.createElement("button");
  tabStructure.textContent = "Structuur";
  tabStructure.style.cssText = `
    flex:1;padding:0.75rem 0.5rem;border:none;background:none;cursor:pointer;
    font-size:0.8125rem;font-weight:600;border-bottom:2px solid transparent;
    color:#9ca3af;transition:all 0.15s ease;
  `;

  tabBar.appendChild(tabModels);
  tabBar.appendChild(tabStructure);

  // Tab inhoud
  const tabContent = document.createElement("div");
  tabContent.style.cssText = "flex:1;overflow:hidden;min-height:0;";

  const modelsPanelWrapper = document.createElement("div");
  modelsPanelWrapper.style.cssText = "height:100%;overflow:hidden;";
  modelsPanelWrapper.appendChild(modelsPanel);

  const treePanelWrapper = document.createElement("div");
  treePanelWrapper.style.cssText = "display:none;height:100%;overflow:hidden;";
  treePanelWrapper.appendChild(modelTreePanel);

  tabContent.appendChild(modelsPanelWrapper);
  tabContent.appendChild(treePanelWrapper);

  // Tab wissel logica
  tabModels.addEventListener("click", () => {
    modelsPanelWrapper.style.display = "block";
    treePanelWrapper.style.display = "none";
    tabModels.style.borderBottomColor = "#4f46e5";
    tabModels.style.color = "#4f46e5";
    tabStructure.style.borderBottomColor = "transparent";
    tabStructure.style.color = "#9ca3af";
  });

  tabStructure.addEventListener("click", () => {
    modelsPanelWrapper.style.display = "none";
    treePanelWrapper.style.display = "block";
    tabModels.style.borderBottomColor = "transparent";
    tabModels.style.color = "#9ca3af";
    tabStructure.style.borderBottomColor = "#4f46e5";
    tabStructure.style.color = "#4f46e5";
  });

  leftPanelContainer.appendChild(tabBar);
  leftPanelContainer.appendChild(tabContent);

  return BUI.html`
    <div class="app-content">
      <aside class="app-side-panel app-side-panel--left">
        ${leftPanelContainer}
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
