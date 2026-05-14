/**
 * Model Tree / Spatiale Structuur
 *
 * Toont de IFC-ruimtelijke structuur van geladen modellen:
 *   Model → Gebouw → Verdieping
 *
 * Functies:
 * - Verdiepingen tonen/verbergen via oogknop
 * - Verdieping isoleren (alleen die verdieping zichtbaar)
 * - Camera richten op verdieping
 * - Live zoekfilter
 */

import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as THREE from "three";
import { customPanel } from "../components/custom-panel";
import { customInput } from "../components/custom-input";

export interface ModelTreeState {
  components: OBC.Components;
  world: OBC.World;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Haal de naam op uit een IFC-attribuutobject dat { value: string } kan zijn */
function resolveIfcName(val: any): string {
  if (!val) return "Naamloos";
  if (typeof val === "string") return val;
  if (typeof val === "object" && "value" in val) return String(val.value);
  return String(val);
}

/** Bouw een Map van expressID → naam voor alle entiteiten van een gegeven IFC-type */
async function queryStoreys(
  model: any,
): Promise<Array<{ expressID: number; name: string }>> {
  const result: Array<{ expressID: number; name: string }> = [];
  if (!model) return result;

  try {
    // Gebruik de Classifier om alle IfcBuildingStorey-entiteiten te vinden
    // classifier.list.Entity is een { TypeName: { modelId: Set<number> } } structuur
    const componentMgr = (model as any)._components as OBC.Components | undefined;

    // Probeer via Classifier (beschikbaar in @thatopen/components)
    if (componentMgr) {
      try {
        const classifier = componentMgr.get(OBC.Classifier);
        classifier.byEntity(model);
        const entityList = classifier.list?.Entity;
        if (entityList) {
          const storeyMap = entityList["IfcBuildingStorey"];
          if (storeyMap) {
            for (const [, idSet] of Object.entries(storeyMap)) {
              const ids = Array.from(idSet as Set<number>);
              for (const id of ids) {
                const data = await model.getItemsData([id], { attributesDefault: true, relationsDefault: false });
                const name = resolveIfcName(data?.[0]?.Name);
                result.push({ expressID: id, name });
              }
            }
          }
        }
      } catch (_e) {
        // Classifier niet beschikbaar of gefaald — val terug op directe query
      }
    }

    // Fallback: lees via getProperties (werkt met de meeste versies)
    if (result.length === 0 && model.getProperties) {
      // Web-ifc type nummer voor IfcBuildingStorey = 3124254112
      const STOREY_TYPE = 3124254112;
      // Probeer getAllPropertiesIDs te gebruiken als dat beschikbaar is
      if (model.data?.has?.(STOREY_TYPE)) {
        const storeyIds = model.data.get(STOREY_TYPE);
        if (storeyIds) {
          for (const id of storeyIds) {
            const props = await model.getProperties(id);
            const name = resolveIfcName(props?.Name);
            result.push({ expressID: id, name });
          }
        }
      }
    }
  } catch (e) {
    console.warn("[ModelTree] Kon verdiepingen niet ophalen:", e);
  }

  // Sorteer alfabetisch op naam
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── State per model ────────────────────────────────────────────────────────

interface StoreyVisibility {
  expressID: number;
  name: string;
  fragMap: OBC.ModelIdMap | null;
  visible: boolean;
}

interface ModelEntry {
  id: string;
  name: string;
  storeys: StoreyVisibility[];
  allVisible: boolean;
}

// ─── Render helper ──────────────────────────────────────────────────────────

function renderModelTree(
  entries: ModelEntry[],
  filter: string,
  onToggleStorey: (entry: ModelEntry, storey: StoreyVisibility) => void,
  onIsolateStorey: (entry: ModelEntry, storey: StoreyVisibility) => void,
  onFocusStorey: (storey: StoreyVisibility) => void,
  onToggleModel: (entry: ModelEntry) => void,
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = "display:flex;flex-direction:column;gap:0.5rem;";

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding:1.5rem 1rem;text-align:center;color:#9ca3af;font-size:0.875rem;";
    empty.textContent = "Laad een IFC-model om de structuur te zien";
    container.appendChild(empty);
    return container;
  }

  const filterLower = filter.toLowerCase();

  for (const entry of entries) {
    const modelBlock = document.createElement("div");
    modelBlock.style.cssText = "border:1px solid #e5e7eb;border-radius:0.75rem;overflow:hidden;";

    // Model header
    const modelHeader = document.createElement("div");
    modelHeader.style.cssText = `
      display:flex;align-items:center;gap:0.5rem;
      padding:0.75rem 1rem;
      background:#f8fafc;
      border-bottom:1px solid #e5e7eb;
      cursor:pointer;
    `;

    const modelIcon = document.createElement("span");
    modelIcon.style.cssText = "color:#c1a979;flex-shrink:0;";
    modelIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;

    const modelName = document.createElement("span");
    modelName.style.cssText = "font-weight:600;font-size:0.875rem;color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    modelName.textContent = entry.name;

    // Oog-knop voor volledig model
    const modelEyeBtn = document.createElement("button");
    modelEyeBtn.title = entry.allVisible ? "Model verbergen" : "Model tonen";
    modelEyeBtn.style.cssText = `
      background:none;border:none;cursor:pointer;padding:2px;
      color:${entry.allVisible ? "#c1a979" : "#9ca3af"};
      flex-shrink:0;display:flex;align-items:center;
    `;
    modelEyeBtn.innerHTML = entry.allVisible
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    modelEyeBtn.addEventListener("click", (e) => { e.stopPropagation(); onToggleModel(entry); });

    modelHeader.appendChild(modelIcon);
    modelHeader.appendChild(modelName);
    modelHeader.appendChild(modelEyeBtn);
    modelBlock.appendChild(modelHeader);

    // Verdiepingen
    const storeyList = document.createElement("div");
    storeyList.style.cssText = "display:flex;flex-direction:column;";

    const visibleStoreys = filter
      ? entry.storeys.filter(s => s.name.toLowerCase().includes(filterLower))
      : entry.storeys;

    if (visibleStoreys.length === 0) {
      const noStoreys = document.createElement("div");
      noStoreys.style.cssText = "padding:0.75rem 1rem;color:#9ca3af;font-size:0.8rem;font-style:italic;";
      noStoreys.textContent = filter ? "Geen resultaten" : "Geen verdiepingen gevonden";
      storeyList.appendChild(noStoreys);
    } else {
      for (const storey of visibleStoreys) {
        const storeyRow = document.createElement("div");
        storeyRow.style.cssText = `
          display:flex;align-items:center;gap:0.5rem;
          padding:0.5rem 1rem 0.5rem 1.75rem;
          border-bottom:1px solid #f3f4f6;
          transition:background 0.1s;
        `;
        storeyRow.addEventListener("mouseenter", () => { storeyRow.style.background = "#f8fafc"; });
        storeyRow.addEventListener("mouseleave", () => { storeyRow.style.background = ""; });

        // Verdieping icoon
        const storeyIcon = document.createElement("span");
        storeyIcon.style.cssText = "color:#6b7280;flex-shrink:0;";
        storeyIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>`;

        // Naam
        const storeyName = document.createElement("span");
        storeyName.style.cssText = "flex:1;font-size:0.8125rem;color:#374151;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        storeyName.textContent = storey.name;

        // Acties
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;align-items:center;gap:2px;flex-shrink:0;";

        // Focus-knop
        const focusBtn = document.createElement("button");
        focusBtn.title = "Camera richten";
        focusBtn.style.cssText = "background:none;border:none;cursor:pointer;padding:2px;color:#9ca3af;display:flex;align-items:center;";
        focusBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
        focusBtn.addEventListener("click", (e) => { e.stopPropagation(); onFocusStorey(storey); });

        // Isoleer-knop
        const isolateBtn = document.createElement("button");
        isolateBtn.title = "Isoleer verdieping";
        isolateBtn.style.cssText = "background:none;border:none;cursor:pointer;padding:2px;color:#9ca3af;display:flex;align-items:center;";
        isolateBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
        isolateBtn.addEventListener("click", (e) => { e.stopPropagation(); onIsolateStorey(entry, storey); });

        // Zichtbaarheid
        const eyeBtn = document.createElement("button");
        eyeBtn.title = storey.visible ? "Verbergen" : "Tonen";
        eyeBtn.style.cssText = `background:none;border:none;cursor:pointer;padding:2px;color:${storey.visible ? "#c1a979" : "#9ca3af"};display:flex;align-items:center;`;
        eyeBtn.innerHTML = storey.visible
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
        eyeBtn.addEventListener("click", (e) => { e.stopPropagation(); onToggleStorey(entry, storey); });

        actions.appendChild(focusBtn);
        actions.appendChild(isolateBtn);
        actions.appendChild(eyeBtn);

        storeyRow.appendChild(storeyIcon);
        storeyRow.appendChild(storeyName);
        storeyRow.appendChild(actions);
        storeyList.appendChild(storeyRow);
      }
    }

    modelBlock.appendChild(storeyList);
    container.appendChild(modelBlock);
  }

  return container;
}

// ─── Hoofd-component ────────────────────────────────────────────────────────

export const modelTreeTemplate: BUI.StatefullComponent<ModelTreeState> = (state) => {
  const { components, world } = state;

  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);

  // ── State ──────────────────────────────────────────────────────────────
  let entries: ModelEntry[] = [];
  let filterText = "";

  // ── DOM container waar de boom in wordt gerenderd ──────────────────────
  const treeContainer = document.createElement("div");
  treeContainer.id = "model-tree-content";

  // ── Herteken de boom ──────────────────────────────────────────────────
  const redraw = () => {
    treeContainer.innerHTML = "";
    const tree = renderModelTree(
      entries,
      filterText,
      handleToggleStorey,
      handleIsolateStorey,
      handleFocusStorey,
      handleToggleModel,
    );
    treeContainer.appendChild(tree);
  };

  // ── Modellen ophalen + verdiepingen bouwen ────────────────────────────
  const rebuildEntries = async () => {
    entries = [];
    for (const [modelId, model] of fragments.list) {
      const name = (model as any).name || modelId;
      const storeys = await queryStoreys(model);

      const storeyVis: StoreyVisibility[] = storeys.map(s => ({
        expressID: s.expressID,
        name: s.name,
        fragMap: null,
        visible: true,
      }));

      // Bouw fragMap voor elke verdieping (nodig voor Hider)
      for (const sv of storeyVis) {
        try {
          const map = await (fragments as any).expressIDsToFragmentIdMap?.([sv.expressID]);
          if (map && Object.keys(map).length > 0) sv.fragMap = map;
        } catch (_e) { /* stilletjes falen */ }
      }

      entries.push({ id: modelId, name, storeys: storeyVis, allVisible: true });
    }
    redraw();
  };

  // ── Event handlers ─────────────────────────────────────────────────────

  const handleToggleStorey = async (entry: ModelEntry, storey: StoreyVisibility) => {
    storey.visible = !storey.visible;
    if (storey.fragMap) {
      await hider.set(storey.visible, storey.fragMap);
    }
    entry.allVisible = entry.storeys.every(s => s.visible);
    redraw();
  };

  const handleIsolateStorey = async (_entry: ModelEntry, storey: StoreyVisibility) => {
    // Eerst alles tonen
    await hider.set(true);
    // Dan alle verdiepingen verbergen behalve de geselecteerde
    for (const e of entries) {
      for (const s of e.storeys) {
        if (s !== storey && s.fragMap) {
          await hider.set(false, s.fragMap);
          s.visible = false;
        } else {
          s.visible = true;
        }
      }
      e.allVisible = e.storeys.every(s => s.visible);
    }
    redraw();
    // Focus camera op verdieping
    handleFocusStorey(storey);
  };

  const handleFocusStorey = async (storey: StoreyVisibility) => {
    if (!storey.fragMap) return;
    try {
      const bbox = components.get(OBC.BoundingBoxer);
      bbox.list.clear();
      await bbox.addFromModelIdMap(storey.fragMap);
      const box = bbox.get();
      if (box && !box.isEmpty()) {
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        (world.camera as any).controls?.fitToSphere(sphere, true);
      }
    } catch (e) {
      console.warn("[ModelTree] Focus mislukt:", e);
    }
  };

  const handleToggleModel = async (entry: ModelEntry) => {
    entry.allVisible = !entry.allVisible;
    for (const storey of entry.storeys) {
      storey.visible = entry.allVisible;
      if (storey.fragMap) {
        await hider.set(storey.visible, storey.fragMap);
      }
    }
    if (entry.allVisible) {
      // Als er geen fragMaps zijn: gebruik Hider.set(true) globaal
      if (entry.storeys.every(s => !s.fragMap)) {
        await hider.set(true);
      }
    }
    redraw();
  };

  const handleSearch = (e: Event) => {
    filterText = (e.target as HTMLInputElement).value;
    redraw();
  };

  // ── Luisteren op model-events ──────────────────────────────────────────
  fragments.onFragmentsLoaded.add(() => {
    rebuildEntries();
  });

  fragments.list.onItemDeleted.add(() => {
    rebuildEntries();
  });

  // Initieel opbouwen
  rebuildEntries();

  return customPanel({
    label: "Structuur",
    fixed: true,
    icon: BUI.html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    children: BUI.html`
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        ${customInput({ placeholder: "Zoek verdieping...", onInput: handleSearch, style: "width:100%;" })}
        ${treeContainer}
      </div>
    `,
  });
};
