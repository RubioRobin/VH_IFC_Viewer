import * as BUI from "@thatopen/ui";
import * as CUI from "@thatopen/ui-obc";
import * as OBC from "@thatopen/components";
import { customButton } from "../components/custom-button";
import { customInput } from "../components/custom-input";
import { customPanel } from "../components/custom-panel";
import { getModelsUpdate } from "../grids/content";

export interface ModelsPanelState {
  components: OBC.Components;
  loading?: boolean;
  _version?: number;
}

export const modelsPanelTemplate: BUI.StatefullComponent<ModelsPanelState> = (
  state,
) => {
  const { components } = state;
  const ifcLoader = components.get(OBC.IfcLoader);

  const onAddIfcModel = (e: any) => {
    const target = e.target as HTMLElement;
    target.blur();
    const fileInput = document.getElementById("ifc-upload-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
      fileInput.click();
    }
  };

  const onFileSelected = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const updateModels = getModelsUpdate();
    if (!updateModels) return;

    // Set loading state and trigger re-render
    updateModels({ loading: true });

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      await ifcLoader.load(bytes, true, file.name.replace(".ifc", ""));
    } catch (error) {
      console.error("Error loading IFC:", error);
    } finally {
      // Clear loading state and trigger re-render
      updateModels({ loading: false });
    }
  };

  // Use the standard CUI table - it works
  const [modelsTable] = CUI.tables.modelsList({
    components,
  });

  const search = (e: Event) => {
    const input = e.target as BUI.TextInput;
    modelsTable.queryString = input.value;
  };

  return customPanel({
    label: "3D Modellen",
    icon: BUI.html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
    fixed: true,
    children: BUI.html`
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${customInput({ placeholder: "Zoeken...", onInput: search, style: "width: 100%;" })}
        ${customButton({
      label: "Importeren",
      onClick: onAddIfcModel,
      style: "width: 100%;",
      variant: "panel",
      loading: state.loading
    })}
        ${modelsTable}
        <input type="file" id="ifc-upload-input" accept=".ifc" style="display: none;" @change=${onFileSelected} />
      </div>
    `
  });
};
