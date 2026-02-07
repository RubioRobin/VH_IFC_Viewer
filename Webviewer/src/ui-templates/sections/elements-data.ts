import * as BUI from "@thatopen/ui";
import * as OBF from "@thatopen/components-front";
import * as OBC from "@thatopen/components";
import { customInput } from "../../components/custom-input";

export interface ElementsDataPanelState {
  components: OBC.Components;
}

export const elementsDataPanelTemplate: BUI.StatefullComponent<
  ElementsDataPanelState
> = (state) => {
  const { components } = state;

  // HELPER: Create a row element using vanilla JS
  const createPropertyRow = (key: string, value: any) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexDirection = "column";
    row.style.borderBottom = "1px solid #f3f4f6";
    row.style.padding = "0.5rem 0";

    const label = document.createElement("span");
    label.style.fontSize = "0.75rem";
    label.style.color = "#6b7280";
    label.style.fontWeight = "500";
    label.style.textTransform = "uppercase";
    label.textContent = key;

    const val = document.createElement("span");
    val.style.fontSize = "0.875rem";
    val.style.color = "#111827";
    val.style.overflowWrap = "anywhere";
    val.style.wordBreak = "break-all";
    val.style.whiteSpace = "normal";
    val.style.lineHeight = "1.4";
    val.textContent = value ?? "-";

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
    if (!container) return; // Should exist if panel is rendered

    container.innerHTML = ""; // Clear current

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
          // Basic Attributes
          if (props.Name) container.appendChild(createPropertyRow("Name", props.Name.value || props.Name));
          if (props.GlobalId) container.appendChild(createPropertyRow("GlobalId", props.GlobalId.value || props.GlobalId));
          if (props.ObjectType) container.appendChild(createPropertyRow("Type", props.ObjectType.value || props.ObjectType));

          // Loop others
          for (const key in props) {
            if (["Name", "GlobalId", "ObjectType", "OwnerHistory", "expressID"].includes(key)) continue;
            const val = props[key];
            if (val && (typeof val === 'string' || typeof val === 'number' || val.value)) {
              container.appendChild(createPropertyRow(key, val.value || val));
            }
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
      if (child.textContent.toLowerCase().includes(filter) || child.textContent === "Selecteer een element om eigenschappen te zien") {
        child.style.display = "flex";
      } else {
        if (child.textContent !== "Selecteer een element om eigenschappen te zien")
          child.style.display = "none";
      }
    });
  };

  // Manual implementation of the panel to ensure strict control over layout and scrolling
  return BUI.html`
    <div class="custom-panel custom-panel--fixed" style="display: flex; flex-direction: column; height: 100%; overflow: hidden; background: white; border-radius: 1rem; box-sizing: border-box;">
      
      <!-- Fixed Header: Explicit Flex Start -->
      <div class="custom-panel__header" style="flex-shrink: 0; padding: 1rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); display: flex; align-items: center; justify-content: flex-start; gap: 0.75rem;">
        <span class="custom-panel__header-icon" style="display: flex; color: var(--bim-ui_bg-contrast-100);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </span>
        <span class="custom-panel__label" style="font-weight: 600; color: var(--bim-ui_bg-contrast-100);">Eigenschappen</span>
      </div>

      <!-- Scrollable Content -->
      <div class="custom-panel__content" style="flex: 1; overflow-y: auto; padding: 1rem; min-height: 0;">
        <!-- Search Input -->
        <div style="display: flex; gap: 0.375rem; margin-bottom: 0.75rem; width: 100%; box-sizing: border-box;">
          ${customInput({ placeholder: "Zoeken...", onInput: search, style: "flex: 1; min-width: 0;" })}
        </div>
        
        <!-- Custom Table Container - Manual DOM -->
        <div id="bim-props-dynamic-container" style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%; max-width: 100%;">
          <div style="padding: 1rem; color: #9ca3af; text-align: center;">Selecteer een element om eigenschappen te zien</div>
        </div>
      </div>
    </div>
  `;
};
