
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

  // STATE: Store current properties to display
  let currentProperties: { key: string; value: any }[] = [];

  // Create a custom component for the table content
  const [propertiesUI, updatePropertiesUI] = BUI.Component.create<void>(() => {
    return BUI.html`
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${currentProperties.length === 0
        ? BUI.html`<div style="padding: 1rem; color: #9ca3af; text-align: center;">Selecteer een element om eigenschappen te zien</div>`
        : currentProperties.map(prop => BUI.html`
              <div style="display: flex; flex-direction: column; border-bottom: 1px solid #f3f4f6; padding: 0.5rem 0;">
                <span style="font-size: 0.75rem; color: #6b7280; font-weight: 500; text-transform: uppercase;">${prop.key}</span>
                <span style="font-size: 0.875rem; color: #111827; overflow-wrap: anywhere; word-break: break-all; white-space: normal; line-height: 1.4;">
                  ${prop.value || "-"}
                </span>
              </div>
            `)
      }
      </div>
    `;
  });

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

  highlighter.events.select.onHighlight.add(async (modelIdMap) => {
    currentProperties = []; // Clear previous
    updatePropertiesUI();

    for (const fragID of Object.keys(modelIdMap)) {
      const fragments = components.get(OBC.FragmentsManager);
      const model = fragments.list.get(fragID);
      if (!model) continue;

      const ids = Array.from(modelIdMap[fragID]);
      for (const id of ids) {
        const props = await fetchProperties(model, id);
        if (props) {
          // Basic Attributes
          if (props.Name) currentProperties.push({ key: "Name", value: props.Name.value || props.Name });
          if (props.GlobalId) currentProperties.push({ key: "GlobalId", value: props.GlobalId.value || props.GlobalId });
          if (props.ObjectType) currentProperties.push({ key: "Type", value: props.ObjectType.value || props.ObjectType });

          // Iterate all other keys for a basic dump (excluding heavy objects)
          // Ideally we filter this list. For now, showing raw attributes is better than broken UI.
          for (const key in props) {
            if (["Name", "GlobalId", "ObjectType", "OwnerHistory", "expressID"].includes(key)) continue;
            const val = props[key];
            if (val && (typeof val === 'string' || typeof val === 'number' || val.value)) {
              currentProperties.push({ key: key, value: val.value || val });
            }
          }
        }
      }
    }
    updatePropertiesUI();
  });

  highlighter.events.select.onClear.add(() => {
    currentProperties = [];
    updatePropertiesUI();
  });

  const search = (e: Event) => {
    // TODO: Implement client-side filtering of currentProperties if needed
    const input = e.target as HTMLInputElement;
    const query = input.value.toLowerCase();
    // Simple filter logic could be added here
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
        
        <!-- Custom Table Area -->
        <div style="width: 100%; max-width: 100%;">
          ${propertiesUI}
        </div>
      </div>
    </div>
  `;
};
