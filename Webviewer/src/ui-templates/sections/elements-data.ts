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

  // CONFIG: Copied from Examples/Engine IFC/ItemsData
  const itemsDataConfig = {
    attributesDefault: true,
    relationsDefault: { attributes: false, relations: false },
    relations: {
      IsDefinedBy: { attributes: true, relations: true },
      DefinesOcurrence: { attributes: false, relations: false },
      ContainedInStructure: { attributes: true, relations: true },
      ContainsElements: { attributes: false, relations: false }, // Keep false to avoid massive trees
      Decomposes: { attributes: false, relations: false },
    },
  };

  // HELPER: Recursively format values
  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return "-";
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (typeof val === 'object') {
      if (val.value !== undefined) {
        if (val.type === 5) return "-";
        return formatValue(val.value);
      }
      if (Array.isArray(val)) {
        return val.map(v => formatValue(v)).join(", ");
      }
      try {
        return JSON.stringify(val, (k, v) => k === "type" ? undefined : v).replace(/["{}]/g, "").replace(/,/g, ", ");
      } catch { return String(val); }
    }
    return String(val);
  };

  const createPropertyRow = (key: string, value: any, indent = 0) => {
    const startValue = formatValue(value);

    // Don't skip empty rows if they might have children (like relations)
    const isComplex = typeof value === 'object' && value !== null;
    if ((startValue === "-" || startValue === "") && !isComplex) return null;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexDirection = "column";
    row.style.borderBottom = "1px solid #f3f4f6";
    row.style.padding = "0.5rem 0";
    if (indent > 0) {
      row.style.marginLeft = `${indent}rem`;
      row.style.borderLeft = "2px solid #e5e7eb";
      row.style.paddingLeft = "0.5rem";
    }

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
    val.style.wordBreak = "break-word";

    // Check if value is complex (array of relations)
    if (Array.isArray(value)) {
      val.textContent = "";
    } else {
      val.textContent = startValue;
    }

    row.appendChild(label);
    row.appendChild(val);

    // Container for this row + children
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.appendChild(row);

    // Expand known relation keys
    if (key === "IsDefinedBy" || key === "HasProperties") {
      if (Array.isArray(value)) {
        value.forEach((item: any) => {
          if (typeof item === 'object' && item !== null) {
            // Try to find Name or use index
            const itemName = item.Name ? formatValue(item.Name) : "";

            // If item has properties, render them
            for (const k in item) {
              // Skip internal/meta logic
              if (["type", "expressID", "OwnerHistory", "Name", "GlobalId", "ObjectType"].includes(k)) continue;
              // Pset properties usually in HasProperties

              const subRow = createPropertyRow(k, item[k], indent + 1);
              if (subRow) container.appendChild(subRow);
            }
          }
        });
      }
    }

    return container;
  };

  const highlighter = components.get(OBF.Highlighter);

  const fetchProperties = async (model: any, id: number) => {
    try {
      // Priority 1: Use getItemsData if available (for PSets)
      if (model.getItemsData) {
        try {
          // getItemsData returns [attrs]
          const result = await model.getItemsData([id], itemsDataConfig);
          if (result && result.length > 0) {
            return result[0]; // Return the first result (the object with props)
          }
        } catch (err) {
          console.warn("getItemsData failed, falling back", err);
        }
      }

      // Fallback
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
          const addProp = (k: string, v: any) => {
            const el = createPropertyRow(k, v);
            if (el) container.appendChild(el);
          };

          // Header info
          if (props.GlobalId) addProp("Guid", props.GlobalId);
          if (props.Name) addProp("Name", props.Name);
          if (props.ObjectType) addProp("Type", props.ObjectType);

          // Loop all others
          const ignored = ["GlobalId", "Name", "ObjectType", "Tag", "OwnerHistory", "expressID", "ObjectPlacement", "Representation", "_localId"];
          for (const key in props) {
            if (ignored.includes(key)) continue;
            if (key.startsWith("_")) {
              if (key === "_category") addProp("Category", props[key]);
              continue;
            }
            if (key === "MODEL") continue;

            const val = props[key];
            if (val === null || val === undefined) continue;
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
