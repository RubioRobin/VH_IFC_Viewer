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

  const itemsDataConfig = {
    attributesDefault: true,
    relationsDefault: { attributes: false, relations: false },
    relations: {
      IsDefinedBy: { attributes: true, relations: true },
      DefinesOcurrence: { attributes: false, relations: false },
      ContainedInStructure: { attributes: true, relations: true },
      ContainsElements: { attributes: false, relations: false },
      Decomposes: { attributes: false, relations: false },
    },
  };

  const toTitleCase = (str: string) => {
    return str.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()).trim();
  };

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
    const keyUpper = key.toUpperCase();

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

    let prettyKey = key;
    if (keyUpper === "NOMINALVALUE") prettyKey = "Waarde"; // Value -> Waarde
    else if (keyUpper === "NAME") prettyKey = "Naam";
    else if (keyUpper === "DESCRIPTION") prettyKey = "Omschrijving";
    else if (keyUpper === "TYPE") prettyKey = "Type";
    else if (keyUpper === "GLOBALID") prettyKey = "Global ID";
    else if (keyUpper === "TAG") prettyKey = "Tag";
    else if (keyUpper.startsWith("PSET_")) prettyKey = key.substring(5);
    else prettyKey = toTitleCase(key);

    label.textContent = prettyKey;

    const val = document.createElement("span");
    val.style.fontSize = "0.875rem";
    val.style.color = "#111827";
    val.style.wordBreak = "break-word";
    val.style.flex = "1";

    if (Array.isArray(value)) {
      val.textContent = "";
    } else {
      val.textContent = startValue;
    }

    const valueRow = document.createElement("div");
    valueRow.style.display = "flex";
    valueRow.style.alignItems = "center";
    valueRow.style.gap = "0.25rem";
    valueRow.appendChild(val);

    if (!Array.isArray(value) && startValue !== "-" && startValue !== "") {
      const copyBtn = document.createElement("button");
      copyBtn.title = "Kopiëren";
      copyBtn.style.cssText = "background:none;border:none;padding:2px;cursor:pointer;color:#d1d5db;flex-shrink:0;line-height:0;border-radius:3px;transition:color 0.15s;";
      copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      copyBtn.addEventListener('mouseenter', () => { copyBtn.style.color = '#6b7280'; });
      copyBtn.addEventListener('mouseleave', () => { copyBtn.style.color = '#d1d5db'; });
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(startValue).then(() => {
          copyBtn.style.color = '#22c55e';
          setTimeout(() => { copyBtn.style.color = '#d1d5db'; }, 1500);
        });
      });
      valueRow.appendChild(copyBtn);
    }

    row.appendChild(label);
    row.appendChild(valueRow);

    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.appendChild(row);

    if (keyUpper === "ISDEFINEDBY" || keyUpper === "HASPROPERTIES" || keyUpper === "QUANTITIES") {
      row.style.display = "none";

      if (Array.isArray(value)) {
        value.forEach((item: any) => {
          if (typeof item === 'object' && item !== null) {
            const itemName = item.Name ? formatValue(item.Name) : (item._category || "Property Set");

            const header = document.createElement("div");
            header.textContent = itemName;
            header.style.fontWeight = "700";
            header.style.fontSize = "0.85rem";
            header.style.color = "#4b5563";
            header.style.marginTop = "0.75rem";
            header.style.marginBottom = "0.25rem";
            header.style.padding = "0.25rem 0.5rem";
            header.style.backgroundColor = "#f9fafb";
            header.style.borderRadius = "0.25rem";

            if (indent > 0) header.style.marginLeft = `${indent}rem`;

            container.appendChild(header);

            for (const k in item) {
              const kUp = k.toUpperCase();
              if (["TYPE", "EXPRESSID", "OWNERHISTORY", "NAME", "GLOBALID", "_CATEGORY", "_GUID", "_LOCALID"].includes(kUp)) continue;

              if (kUp === "HASPROPERTIES") {
                if (Array.isArray(item[k])) {
                  item[k].forEach((prop: any) => {
                    if (prop.Name && prop.NominalValue) {
                      const propRow = createPropertyRow(prop.Name.value || prop.Name, prop.NominalValue, indent + 0.5);
                      if (propRow) container.appendChild(propRow);
                    } else {
                      const subRow = createPropertyRow(k, item[k], indent + 0.5);
                      if (subRow) container.appendChild(subRow);
                    }
                  });
                }
                continue;
              }

              const subRow = createPropertyRow(k, item[k], indent + 0.5);
              if (subRow) container.appendChild(subRow);
            }
          }
        });
      }
    }

    return container;
  };

  const highligher = components.get(OBF.Highlighter);

  const fetchProperties = async (model: any, id: number) => {
    try {
      if (model.getItemsData) {
        try {
          const result = await model.getItemsData([id], itemsDataConfig);
          if (result && result.length > 0) return result[0];
        } catch (err) { console.warn("getItemsData failed", err); }
      }
      if (model.getProperties) return await model.getProperties(id);
    } catch (e) { console.error("Error fetching properties", e); }
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

          if (props.GlobalId) addProp("Guid", props.GlobalId);
          if (props.Name) addProp("Naam", props.Name);
          if (props.ObjectType) addProp("Type", props.ObjectType);

          const ignored = ["GlobalId", "Name", "ObjectType", "Tag", "OwnerHistory", "expressID", "ObjectPlacement", "Representation"];
          for (const key in props) {
            const keyUpper = key.toUpperCase();
            if (ignored.map(i => i.toUpperCase()).includes(keyUpper)) continue;
            if (key.startsWith("_")) continue;
            if (keyUpper.startsWith("_")) continue;
            if (keyUpper === "MODEL") continue;

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
      placeholder.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem 1rem;gap:0.75rem;";

      const svgNS = "http://www.w3.org/2000/svg";
      const iconWrap = document.createElementNS(svgNS, "svg");
      iconWrap.setAttribute("width", "32"); iconWrap.setAttribute("height", "32");
      iconWrap.setAttribute("viewBox", "0 0 24 24"); iconWrap.setAttribute("fill", "none");
      iconWrap.setAttribute("stroke", "#d1d5db"); iconWrap.setAttribute("stroke-width", "1.5");
      iconWrap.setAttribute("stroke-linecap", "round"); iconWrap.setAttribute("stroke-linejoin", "round");
      const pathDoc = document.createElementNS(svgNS, "path");
      pathDoc.setAttribute("d", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z");
      const polyFold = document.createElementNS(svgNS, "polyline");
      polyFold.setAttribute("points", "14 2 14 8 20 8");
      const lineH = document.createElementNS(svgNS, "line");
      lineH.setAttribute("x1", "16"); lineH.setAttribute("y1", "13"); lineH.setAttribute("x2", "8"); lineH.setAttribute("y2", "13");
      const lineH2 = document.createElementNS(svgNS, "line");
      lineH2.setAttribute("x1", "16"); lineH2.setAttribute("y1", "17"); lineH2.setAttribute("x2", "8"); lineH2.setAttribute("y2", "17");
      iconWrap.appendChild(pathDoc); iconWrap.appendChild(polyFold);
      iconWrap.appendChild(lineH); iconWrap.appendChild(lineH2);

      const text = document.createElement("span");
      text.textContent = "Selecteer een element";
      text.style.cssText = "color:#9ca3af;font-size:0.85rem;font-weight:500;text-align:center;";

      const sub = document.createElement("span");
      sub.textContent = "Klik op een element in het 3D model om de eigenschappen te zien";
      sub.style.cssText = "color:#d1d5db;font-size:0.75rem;text-align:center;line-height:1.4;max-width:200px;";

      placeholder.appendChild(iconWrap);
      placeholder.appendChild(text);
      placeholder.appendChild(sub);
      container.appendChild(placeholder);
    }
  };

  highligher.events.select.onHighlight.add((modelIdMap) => {
    updateTableDirectly(modelIdMap);
  });

  highligher.events.select.onClear.add(() => {
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

  return BUI.html`
    <div class="custom-panel custom-panel--fixed" style="display: flex; flex-direction: column; height: 100%; overflow: hidden; background: white; border-radius: 1rem; box-sizing: border-box;">
      
      <div class="custom-panel__header" style="flex-shrink: 0; padding: 1rem; border-bottom: 1px solid var(--bim-ui_bg-contrast-20); display: flex; align-items: center; justify-content: flex-start !important; gap: 0.75rem;">
        <span class="custom-panel__header-icon" style="display: flex; color: var(--bim-ui_bg-contrast-100);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </span>
        <span class="custom-panel__label" style="font-weight: 600; color: var(--bim-ui_bg-contrast-100); flex: 1; text-align: left;">Eigenschappen</span>
      </div>

      <div class="custom-panel__content" style="flex: 1; overflow-y: auto; padding: 1rem; min-height: 0;">
        <div style="display: flex; gap: 0.375rem; margin-bottom: 0.75rem; width: 100%; box-sizing: border-box;">
          ${customInput({ placeholder: "Zoeken...", onInput: search, style: "flex: 1; min-width: 0;" })}
        </div>
        
        <div id="bim-props-dynamic-container" style="display: flex; flex-direction: column; gap: 0.25rem; width: 100%; max-width: 100%;">
          <div style="color: #9ca3af; font-size: 0.85rem; font-weight: 500; text-align: center; padding: 2rem 1rem;">Selecteer een element om eigenschappen te zien</div>
        </div>
      </div>
    </div>
  `;
};
