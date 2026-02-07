
import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI_OBC from "@thatopen/ui-obc";
import * as WEBIFC from "web-ifc";
import { customInput } from "../components/custom-input";
import { customPanel } from "../components/custom-panel";

export interface ElementsDataPanelState {
  components: OBC.Components;
}

export const elementsDataPanelTemplate: BUI.StatefullComponent<
  ElementsDataPanelState
> = (state) => {
  const { components } = state;

  const [propsTable, updatePropsTable] = BUI_OBC.tables.itemsData({
    components,
    modelIdMap: {},
    emptySelectionWarning: true,
  });

  propsTable.style.width = "auto";
  propsTable.style.maxWidth = "100%";

  // HACK: Inject specific styles into Shadow DOM to fix alignment
  const injectStyles = () => {
    if (propsTable.shadowRoot && !propsTable.shadowRoot.getElementById("bim-props-fix")) {
      const style = document.createElement("style");
      style.id = "bim-props-fix";
      style.textContent = `
        [part="row"] {
          justify-content: space-between !important;
          width: 100%;
        }
        /* First Cell: Left Align */
        [part="cell"]:nth-child(1) {
          text-align: left !important;
          justify-content: flex-start !important;
        }
        /* Second Cell: Right Align */
        [part="cell"]:nth-child(2) {
          text-align: right !important;
          justify-content: flex-end !important;
          flex: 1 !important;
        }
      `;
      propsTable.shadowRoot.appendChild(style);
    }
  };

  // Try immediately and then every 500ms for a few seconds to catch lazy hydration
  setTimeout(injectStyles, 0);
  const interval = setInterval(injectStyles, 500);
  setTimeout(() => clearInterval(interval), 5000);

  const highlighter = components.get(OBF.Highlighter);

  // Helper to polyfill getProperties if missing (fixes "Fout bij laden")
  const polyfillGetProperties = async (model: any) => {
    // If safe getProperties exists, do nothing
    // We check for the specific signature/behavior if needed, but existence is key
    // If it exists but is the "broken" one, we might need to replace it? 
    // Assuming if it's undefined, we fill it.
    if (model.getProperties) return;

    console.log("[Polyfill] Injecting getProperties for model:", model.uuid);

    // Try to fetch metadata once
    let propertiesMap: any = null;

    // Check getMetadata (async)
    if (model.getMetadata) {
      try {
        propertiesMap = await model.getMetadata();
        console.log("[Polyfill] Loaded metadata via getMetadata()");
      } catch (e) { console.warn("[Polyfill] Failed to load metadata", e); }
    }
    // Check properties (sync)
    else if (model.properties) {
      propertiesMap = model.properties;
      console.log("[Polyfill] Using model.properties");
    }

    // Define getProperties on the model instance
    model.getProperties = async (id: number) => {
      if (propertiesMap && propertiesMap[id]) return propertiesMap[id];
      if (model.getItem) return model.getItem(id);
      return null;
    };

    // Also ensure getRelations exists if possible, though itemsData might use Indexer
    // We can't easily polyfill getRelations if it's missing, but it was present in logs.
  };

  highlighter.events.select.onHighlight.add(async (modelIdMap) => {
    // 1. Polyfill models
    const fragments = components.get(OBC.FragmentsManager);
    for (const fragID of Object.keys(modelIdMap)) {
      // Access model safely
      // Access model safely
      const model = fragments.list.get(fragID);

      if (model) {
        await polyfillGetProperties(model);
      }
    }

    // 2. Update the standard table
    updatePropsTable({ modelIdMap });
  });

  highlighter.events.select.onClear.add(() => {
    updatePropsTable({ modelIdMap: {} });
  });

  const search = (e: Event) => {
    const input = e.target as HTMLInputElement;
    propsTable.queryString = input.value;
  };

  // Manual implementation of the panel to ensure strict control over layout and scrolling
  return BUI.html`
    <div class="custom-panel custom-panel--fixed" style="display: flex; flex-direction: column; height: 100%; overflow: hidden; background: white; border-radius: 1rem; box-sizing: border-box;">
      
      <!-- Fixed Header -->
      <div class="custom-panel__header" style="flex-shrink: 0; padding: 1rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); display: flex; align-items: center; gap: 0.75rem; font-weight: 600; color: var(--bim-ui_bg-contrast-100);">
        <span class="custom-panel__header-icon" style="display: flex;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </span>
        <span class="custom-panel__label">Eigenschappen</span>
      </div>

      <!-- Scrollable Content -->
      <div class="custom-panel__content" style="flex: 1; overflow-y: auto; padding: 1rem; min-height: 0;">
        <div style="display: flex; gap: 0.375rem; margin-bottom: 0.75rem; width: 100%; box-sizing: border-box;">
          ${customInput({ placeholder: "Zoeken...", onInput: search, style: "flex: 1; min-width: 0;" })}
        </div>
        <div style="width: 100%; max-width: 100%; overflow-x: auto;">
          ${propsTable}
        </div>
      </div>
    </div>
  `;
};
