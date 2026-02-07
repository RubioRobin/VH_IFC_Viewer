import * as BUI from "@thatopen/ui";
import * as OBF from "@thatopen/components-front";
import * as OBC from "@thatopen/components";
import { customInput } from "../components/custom-input";

export interface ElementsDataPanelState {
  components: OBC.Components;
}

export const elementsDataPanelTemplate: BUI.StatefullComponent<
  ElementsDataPanelState
> = (state) => {
  const { components } = state;

  // HELPER: Recursively format values to avoid [object Object]
  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return "-";

    // Handle Primitive Types directly
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }

    // Handle Objects
    if (typeof val === 'object') {
      // If it has a 'value' property (standard web-ifc wrapper)
      if (val.value !== undefined) {
        // Check if it is a type 5 (null)
        if (val.type === 5) return "-";
        return formatValue(val.value);
      }

      // If it's an array
      if (Array.isArray(val)) {
        return val.map(v => formatValue(v)).join(", ");
      }

      // If it's a minimal object (keys like type, value)
      // Fallback: JSON stringify but cleaner
      try {
        return JSON.stringify(val, (k, v) => {
          if (k === "type") return undefined; // Hide internal type codes
          return v;
        }).replace(/["{}]/g, "").replace(/,/g, ", ");
      } catch {
        return String(val);
      }
    }
    return String(val);
  };

  // HELPER: Create a row element using vanilla JS
  const createPropertyRow = (key: string, value: any) => {
    const startValue = formatValue(value);
    if (startValue === "-" || startValue === "") return null; // Skip empty rows

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexDirection = "column";
    row.style.borderBottom = "1px solid #f3f4f6";
    row.style.padding = "0.5rem 0";

    const label = document.createElement("span");
    label.style.fontSize = "0.75rem";
    label.style.color = "#6b7280";
    label.style.fontWeight = "600";
    label.style.textTransform = "uppercase";
    label.style.marginBottom = "0.25rem";
    label.textContent = key;

    const val = document.createElement("span");
    val.style.fontSize = "0.875rem";
    val.style.color = "#111827";
    val.style.overflowWrap = "anywhere";
    val.style.wordBreak = "break-word";
    val.style.whiteSpace = "normal";
    val.style.lineHeight = "1.5";
    val.textContent = startValue;

    row.appendChild(label);
    row.appendChild(val);
    return row;
  };

  const highlighter = components.get(OBF.Highlighter);

  // Helper to polyfill and fetch properties
  const fetchProperties = async (model: any, id: number) => {
    try {
      if (model.getProperties) {
        return await model.getProperties(id);
      } else if (model.getItem) {
        return await model.getItem(id);
      } else if (model.properties && model.properties[id]) {
        return model.properties[id];
      }
    } catch (e) {
      console.error("Error fetching properties", e);
    }
    return null;
  };

  const updateTableDirectly = async (modelIdMap: { [id: string]: Set<number> }) => {
    const container = document.getElementById("bim-props-dynamic-container");
    if (!container) return;

    container.innerHTML = "";

    let hasSelection = false;

    for (const fragID of Object.keys(modelIdMap)) {
      const fragments = components.get(OBC.FragmentsManager);
      const model = fragments.list.get(fragID);
      if (!model) continue;

      const ids = Array.from(modelIdMap[fragID]);
      for (const id of ids) {
        hasSelection = true;
        const props = await fetchProperties(model, id);
        if (props) {
          // Priority Fields
          const addProp = (k: string, v: any) => {
            const el = createPropertyRow(k, v);
            if (el) container.appendChild(el);
          };

          if (props.GlobalId) addProp("Guid", props.GlobalId);
          if (props.Name) addProp("Name", props.Name);
          if (props.ObjectType) addProp("Type", props.ObjectType);
          if (props.Tag) addProp("Tag", props.Tag);

          // Loop all others
          const ignored = ["GlobalId", "Name", "ObjectType", "Tag", "OwnerHistory", "expressID", "ObjectPlacement", "Representation"];
          for (const key in props) {
            if (ignored.includes(key)) continue;
            if (key.startsWith("_")) continue; // Skip internal props like _LOCALID
            if (key === "MODEL") continue; // Skip Model ref

            const val = props[key];
            // Skip functions
            if (typeof val === 'function') continue;

            addProp(key, val);
          }
        }
      }
    }

    if (!hasSelection) {
      const placeholder = document.createElement("div");
      placeholder.style.padding = "1rem";
      placeholder.style.color = "#9ca3af";
      placeholder.style.textAlign = "center";
      placeholder.textContent = "Selecteer een element om eigenschappen te zien";
      container.appendChild(placeholder);
    }
  };

  highlighter.events.select.onHighlight.add((modelIdMap) => {
    updateTableDirectly(modelIdMap);
  });

  highlighter.events.select.onClear.add(() => {
    updateTableDirectly({});
  });

  const search = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const container = document.getElementById("bim-props-dynamic-container");
    if (!container) return;

    const filter = input.value.toLowerCase();
    Array.from(container.children).forEach((child: any) => {
      if (child.textContent.toLowerCase().includes(filter) || child.textContent.includes("Selecteer")) {
        child.style.display = "flex";
      } else {
        child.style.display = "none";
      }
    });
  };

  // Manual implementation of the panel
  return BUI.html`
    <div class="custom-panel custom-panel--fixed" style="display: flex; flex-direction: column; height: 100%; overflow: hidden; background: white; border-radius: 1rem; box-sizing: border-box;">
      
      <!-- Fixed Header: FORCE LEFT ALIGN -->
      <div class="custom-panel__header" style="flex-shrink: 0; padding: 1rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); display: flex; align-items: center; justify-content: flex-start !important; gap: 0.75rem;">
        <span class="custom-panel__header-icon" style="display: flex; color: var(--bim-ui_bg-contrast-100);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </span>
        <span class="custom-panel__label" style="font-weight: 600; color: var(--bim-ui_bg-contrast-100); flex: 1; text-align: left;">Eigenschappen</span>
      </div>

      <!-- Scrollable Content -->
      <div class="custom-panel__content" style="flex: 1; overflow-y: auto; padding: 1rem; min-height: 0;">
        <!-- Search Input -->
        <div style="display: flex; gap: 0.375rem; margin-bottom: 0.75rem; width: 100%; box-sizing: border-box;">
          ${customInput({ placeholder: "Zoeken...", onInput: search, style: "flex: 1; min-width: 0;" })}
        </div>
        
        <!-- Custom Table Container - Manual DOM -->
        <div id="bim-props-dynamic-container" style="display: flex; flex-direction: column; gap: 0.25rem; width: 100%; max-width: 100%;">
          <div style="padding: 1rem; color: #9ca3af; text-align: center;">Selecteer een element om eigenschappen te zien</div>
        </div>
      </div>
    </div>
  `;
};
