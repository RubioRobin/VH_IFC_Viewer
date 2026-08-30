import * as THREE from "three";
import * as FRAGS from "@thatopen/fragments";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { appIcons } from "../globals";

type ViewerWorld = OBC.SimpleWorld<
  OBC.SimpleScene,
  OBC.OrthoPerspectiveCamera,
  OBF.PostproductionRenderer
>;

type ActiveTool = "none" | "distance";
export type ViewerVisibilityChange =
  | { type: "hide" | "isolate"; items: OBC.ModelIdMap }
  | { type: "show-all" };

interface ViewerToolsOptions {
  components: OBC.Components;
  world: ViewerWorld;
  highlighter: OBF.Highlighter;
  fragments: OBC.FragmentsManager;
  canvas: HTMLCanvasElement;
  onFitView: () => void | Promise<void>;
  onVisibilityChanged?: (
    change: ViewerVisibilityChange,
  ) => void | Promise<void>;
}
interface TransparentMaterialState {
  depthWrite: boolean;
  side: THREE.Side;
}

const GOLD = new THREE.Color("#c1a979");
const SHELL_OPACITY = 0.4;

const formatMillimeters = (distanceInMeters: number) => {
  const millimeters = Math.abs(distanceInMeters) * 1000;
  return `${new Intl.NumberFormat("nl-NL", {
    maximumFractionDigits: millimeters < 10 ? 1 : 0,
  }).format(millimeters)} mm`;
};

export class ViewerTools {
  readonly element = document.createElement("div");

  private readonly components: OBC.Components;
  private readonly world: ViewerWorld;
  private readonly highlighter: OBF.Highlighter;
  private readonly fragments: OBC.FragmentsManager;
  private readonly canvas: HTMLCanvasElement;
  private readonly hider: OBC.Hider;
  private readonly lengthMeasurement: OBF.LengthMeasurement;
  private readonly onVisibilityChanged?: (
    change: ViewerVisibilityChange,
  ) => void | Promise<void>;
  private readonly onFitView: () => void | Promise<void>;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly transparentMaterialStates = new Map<
    THREE.MeshLambertMaterial,
    TransparentMaterialState
  >();
  private readonly status = document.createElement("div");
  private readonly menu = document.createElement("div");
  private moreButton: HTMLButtonElement | null = null;
  private readonly snappingIndicatorObserver = new MutationObserver(
    (mutations) => {
      for (const mutation of mutations) {
        if (mutation.target instanceof HTMLElement) {
          this.markSnappingIndicator(mutation.target);
        }
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          this.markSnappingIndicator(node);
          node.querySelectorAll<HTMLElement>("div").forEach((element) => {
            this.markSnappingIndicator(element);
          });
        });
      }
    },
  );
  private activeTool: ActiveTool = "none";
  private shellTransparent = false;
  private measurementSession = 0;
  private hasSelection = false;
  private hasMeasurements = false;
  private visibilityChanged = false;
  private statusTimer: number | undefined;

  constructor(options: ViewerToolsOptions) {
    this.components = options.components;
    this.world = options.world;
    this.highlighter = options.highlighter;
    this.fragments = options.fragments;
    this.canvas = options.canvas;
    this.onFitView = options.onFitView;
    this.onVisibilityChanged = options.onVisibilityChanged;
    this.hider = this.components.get(OBC.Hider);
    this.lengthMeasurement = this.components.get(OBF.LengthMeasurement);

    this.configureLengthMeasurement();
    this.buildInterface();
    this.bindEvents();
    this.guardSnappingIndicators();
    this.setStatus("Selecteer een IFC-element of kies een gereedschap.");
  }

  get isShellTransparent() {
    return this.shellTransparent;
  }

  onSelectionChanged(modelIdMap: OBC.ModelIdMap) {
    this.hasSelection = !OBC.ModelIdMapUtils.isEmpty(modelIdMap);
    this.syncContextActions();
  }

  async onModelLoaded(model: FRAGS.FragmentsModel) {
    model.tiles.onItemSet.add(() => {
      if (!this.shellTransparent) return;
      window.queueMicrotask(() => this.stabilizeTransparentMaterials());
    });

    if (!this.shellTransparent) return;
    await model.setOpacity(undefined, SHELL_OPACITY);
    await this.fragments.core.update(true);
    this.stabilizeTransparentMaterials();
  }

  private stabilizeTransparentMaterials() {
    for (const model of this.fragments.list.values()) {
      for (const tile of model.tiles.values()) {
        const materials = Array.isArray(tile.material)
          ? tile.material
          : [tile.material];

        for (const material of materials) {
          if (
            !(material instanceof THREE.MeshLambertMaterial) ||
            !material.transparent ||
            material.opacity >= 1
          ) {
            continue;
          }

          if (!this.transparentMaterialStates.has(material)) {
            this.transparentMaterialStates.set(material, {
              depthWrite: material.depthWrite,
              side: material.side,
            });
          }

          // Keep depth testing, but prevent transparent shell layers from
          // hiding each other depending on the camera's tile sort order.
          material.depthWrite = false;
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
        }
      }
    }
  }

  private restoreTransparentMaterials() {
    for (const [material, state] of this.transparentMaterialStates) {
      material.depthWrite = state.depthWrite;
      material.side = state.side;
      material.needsUpdate = true;
    }
    this.transparentMaterialStates.clear();
  }

  private configureLengthMeasurement() {
    this.lengthMeasurement.world = this.world;
    this.lengthMeasurement.color = GOLD;
    this.lengthMeasurement.snappings = [
      FRAGS.SnappingClass.POINT,
      FRAGS.SnappingClass.LINE,
      FRAGS.SnappingClass.FACE,
    ];
    this.lengthMeasurement.rounding = 0;
    this.lengthMeasurement.units = "mm";
    this.lengthMeasurement.mode = "free";
    this.lengthMeasurement.enabled = false;
    this.guardMeasurementPicker();
  }

  private buildInterface() {
    this.element.className = "viewer-tools-overlay";
    this.element.setAttribute("aria-label", "Viewer gereedschappen");

    const toolbar = document.createElement("div");
    toolbar.className = "viewer-tools";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "IFC viewer gereedschappen");

    const fitButton = this.createButton(
      "fit-view",
      "Model in beeld",
      appIcons.FOCUS,
      () => this.onFitView(),
    );
    const distanceButton = this.createButton(
      "distance",
      "Meten",
      appIcons.RULER,
      () => this.toggleDistance(),
      true,
    );
    const transparentButton = this.createButton(
      "transparent",
      "Transparant",
      appIcons.TRANSPARENT,
      () => this.toggleTransparency(),
      true,
    );
    this.moreButton = this.createButton("more", "Meer", appIcons.MORE, () =>
      this.toggleMenu(),
    );
    this.moreButton.setAttribute("aria-haspopup", "menu");
    this.moreButton.setAttribute("aria-expanded", "false");
    this.moreButton.setAttribute("aria-controls", "viewer-tools-menu");

    toolbar.append(
      fitButton,
      distanceButton,
      transparentButton,
      this.moreButton,
    );

    this.menu.id = "viewer-tools-menu";
    this.menu.className = "viewer-tools-menu";
    this.menu.setAttribute("role", "menu");
    this.menu.setAttribute("aria-label", "Meer viewerfuncties");
    this.menu.hidden = true;
    this.menu.append(
      this.createMenuButton("hide", "Verberg selectie", appIcons.HIDE, () =>
        this.hideSelection(),
      ),
      this.createMenuButton(
        "isolate",
        "Isoleer selectie",
        appIcons.ISOLATE,
        () => this.isolateSelection(),
      ),
      this.createMenuButton(
        "clear-measures",
        "Wis maten",
        appIcons.DELETE,
        () => this.clearMeasurements(),
      ),
      this.createMenuButton("show-all", "Toon alles", appIcons.SHOW, () =>
        this.showAll(),
      ),
    );

    this.status.className = "viewer-tools__feedback";
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.status.setAttribute("aria-atomic", "true");

    this.element.append(this.menu, toolbar, this.status);
    this.syncContextActions();
  }

  private createButton(
    key: string,
    label: string,
    icon: string,
    action: () => void | Promise<void>,
    toggle = false,
  ) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "viewer-tool-button";
    button.title = label;
    button.setAttribute("aria-label", label);
    if (toggle) button.setAttribute("aria-pressed", "false");

    const iconElement = document.createElement("bim-icon");
    iconElement.setAttribute("icon", icon);
    iconElement.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = label;
    button.append(iconElement, text);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.runAction(action);
    });

    this.buttons.set(key, button);
    return button;
  }

  private createMenuButton(
    key: string,
    label: string,
    icon: string,
    action: () => void | Promise<void>,
  ) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "viewer-tools-menu__button";
    button.setAttribute("role", "menuitem");

    const iconElement = document.createElement("bim-icon");
    iconElement.setAttribute("icon", icon);
    iconElement.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = label;
    button.append(iconElement, text);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu();
      void this.runAction(action);
    });

    this.buttons.set(key, button);
    return button;
  }

  private bindEvents() {
    this.canvas.addEventListener("click", this.onCanvasClick, {
      capture: true,
    });
    window.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("pointerdown", this.onDocumentPointerDown);
    this.lengthMeasurement.list.onItemAdded.add((line) => {
      this.hasMeasurements = true;
      this.syncContextActions();
      this.setStatus(
        `Afstand: ${formatMillimeters(line.start.distanceTo(line.end))}`,
        "success",
      );
      window.queueMicrotask(() => {
        if (this.activeTool === "distance") this.setActiveTool("none");
      });
    });
  }

  private readonly onCanvasClick = (event: MouseEvent) => {
    if (this.activeTool !== "distance" || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void this.lengthMeasurement.create();
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (!this.menu.hidden) {
      this.closeMenu(true);
      return;
    }
    if (this.activeTool !== "none") {
      this.setActiveTool("none");
      this.setStatus("Gereedschap gestopt.");
    }
  };

  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    if (this.menu.hidden || !(event.target instanceof Node)) return;
    if (
      this.menu.contains(event.target) ||
      this.moreButton?.contains(event.target)
    )
      return;
    this.closeMenu();
  };

  private async runAction(action: () => void | Promise<void>) {
    try {
      await action();
    } catch (error) {
      console.error("Viewer tool error:", error);
      this.setStatus(
        error instanceof Error
          ? error.message
          : "Het gereedschap kon niet worden uitgevoerd.",
        "warning",
      );
    }
  }

  private toggleDistance() {
    if (this.activeTool === "distance") {
      this.setActiveTool("none");
      this.setStatus("Afstand meten gestopt.");
      return;
    }

    this.setActiveTool("distance");
    this.setStatus("Klik twee punten, lijnen of vlakken. Esc stopt het meten.");
  }

  private setActiveTool(tool: ActiveTool) {
    this.lengthMeasurement.cancelCreation();
    this.measurementSession += 1;
    this.activeTool = tool;
    this.lengthMeasurement.enabled = tool === "distance";
    this.highlighter.enabled = tool !== "distance";
    document.body.classList.toggle(
      "is-distance-measuring",
      tool === "distance",
    );
    this.setButtonActive("distance", tool === "distance");
    this.syncMeasurementPickerVisibility();
  }

  private clearMeasurements() {
    this.lengthMeasurement.cancelCreation();
    this.lengthMeasurement.list.clear();
    this.hasMeasurements = false;
    this.syncContextActions();
    this.setActiveTool("none");
    this.setStatus("Alle maten zijn gewist.", "success");
  }

  private hideMeasurementPicker() {
    const measurement = this.lengthMeasurement as unknown as {
      _vertexPicker?: OBF.GraphicVertexPicker;
      pointerStopTimeout?: number | null;
    };
    const picker = measurement._vertexPicker;
    if (!picker) return;

    if (measurement.pointerStopTimeout !== null) {
      window.clearTimeout(measurement.pointerStopTimeout);
      measurement.pointerStopTimeout = null;
    }

    const hide = () => {
      if (this.activeTool === "distance") return;
      picker.enabled = false;
      if (picker.marker) picker.marker.visible = false;
      this.syncMeasurementPickerVisibility();
    };

    hide();
    window.requestAnimationFrame(hide);
  }

  private guardMeasurementPicker() {
    const picker = (
      this.lengthMeasurement as OBF.LengthMeasurement & {
        _vertexPicker?: OBF.GraphicVertexPicker;
      }
    )._vertexPicker;
    if (!picker) return;

    const getIntersection = picker.get.bind(picker);
    picker.get = async (...args) => {
      const requestSession = this.measurementSession;
      const result = await getIntersection(...args);
      const isCurrentMeasurement =
        requestSession === this.measurementSession &&
        this.activeTool === "distance" &&
        this.lengthMeasurement.enabled;

      this.syncMeasurementPickerVisibility();
      if (isCurrentMeasurement) return result;

      if (picker.marker) picker.marker.visible = false;
      return null;
    };
  }

  private syncMeasurementPickerVisibility() {
    const picker = (
      this.lengthMeasurement as unknown as {
        _vertexPicker?: {
          _preview?: HTMLElement;
          marker?: { three: { element: HTMLElement } } | null;
        };
      }
    )._vertexPicker;
    if (!picker) return;

    picker._preview?.classList.add("viewer-snapping-indicator");
    picker.marker?.three.element.classList.add("viewer-snapping-indicator");
  }

  private guardSnappingIndicators() {
    const viewport = this.canvas.parentElement;
    if (!viewport) return;

    viewport.querySelectorAll<HTMLElement>("div").forEach((element) => {
      this.markSnappingIndicator(element);
    });
    this.snappingIndicatorObserver.observe(viewport, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    this.syncMeasurementPickerVisibility();
  }

  private markSnappingIndicator(element: HTMLElement) {
    if (element.classList.contains("viewer-snapping-indicator")) return;

    const borderColor = element.style.borderColor
      .replace(/\s/g, "")
      .toLowerCase();
    const isThatOpenSnappingCircle =
      element.style.width === "6px" &&
      element.style.height === "6px" &&
      element.style.borderRadius === "100%" &&
      borderColor === "rgb(122,75,209)";
    if (isThatOpenSnappingCircle)
      element.classList.add("viewer-snapping-indicator");
  }

  private async toggleTransparency() {
    this.shellTransparent = !this.shellTransparent;
    this.setButtonActive("transparent", this.shellTransparent);
    this.setStatus(
      this.shellTransparent
        ? "IFC-shell is 60% doorzichtig."
        : "IFC-shell is weer volledig dekkend.",
      "success",
    );

    const opacityUpdates: Promise<void>[] = [];
    for (const model of this.fragments.list.values()) {
      opacityUpdates.push(
        this.shellTransparent
          ? model.setOpacity(undefined, SHELL_OPACITY)
          : model.resetOpacity(undefined),
      );
    }

    if (opacityUpdates.length === 0) return;

    await Promise.all(opacityUpdates);
    await this.fragments.core.update(true);
    if (this.shellTransparent) {
      this.stabilizeTransparentMaterials();
    } else {
      this.restoreTransparentMaterials();
    }
  }

  private async hideSelection() {
    const selection = this.getSelection();
    if (OBC.ModelIdMapUtils.isEmpty(selection)) {
      this.setStatus("Selecteer eerst één of meer IFC-elementen.", "warning");
      return;
    }

    const selectedCount = this.countItems(selection);

    await this.hider.set(false, selection);
    if (this.shellTransparent) this.stabilizeTransparentMaterials();
    await this.onVisibilityChanged?.({ type: "hide", items: selection });
    await this.highlighter.clear("select");
    this.visibilityChanged = true;
    this.syncContextActions();
    this.setStatus(
      `${selectedCount} ${selectedCount === 1 ? "element" : "elementen"} verborgen.`,
      "success",
      true,
    );
  }

  private async isolateSelection() {
    const selection = this.getSelection();
    if (OBC.ModelIdMapUtils.isEmpty(selection)) {
      this.setStatus("Selecteer eerst één of meer IFC-elementen.", "warning");
      return;
    }

    const selectedCount = this.countItems(selection);

    const visibilityUpdates: Promise<void>[] = [];
    for (const [modelId, model] of this.fragments.list) {
      visibilityUpdates.push(
        (async () => {
          await model.setVisible(undefined, false);
          const selectedItems = selection[modelId];
          if (selectedItems?.size)
            await model.setVisible([...selectedItems], true);
        })(),
      );
    }

    await Promise.all([
      ...visibilityUpdates,
      this.onVisibilityChanged?.({ type: "isolate", items: selection }),
    ]);
    await this.fragments.core.update(true);
    if (this.shellTransparent) this.stabilizeTransparentMaterials();
    await this.highlighter.clear("select");
    this.visibilityChanged = true;
    this.syncContextActions();
    this.setStatus(
      `${selectedCount} ${selectedCount === 1 ? "element" : "elementen"} geïsoleerd.`,
      "success",
      true,
    );
  }

  private async showAll() {
    await this.hider.set(true);
    if (this.shellTransparent) this.stabilizeTransparentMaterials();
    await this.onVisibilityChanged?.({ type: "show-all" });
    await this.highlighter.clear("select");
    this.visibilityChanged = false;
    this.syncContextActions();
    this.setStatus("Alle IFC-elementen zijn weer zichtbaar.", "success");
  }

  private getSelection() {
    return this.highlighter.selection.select ?? {};
  }

  private setButtonActive(key: string, active: boolean) {
    const button = this.buttons.get(key);
    if (!button) return;
    button.classList.toggle("viewer-tool-button--active", active);
    if (button.hasAttribute("aria-pressed")) {
      button.setAttribute("aria-pressed", String(active));
    }
  }

  private countItems(items: OBC.ModelIdMap) {
    return Object.values(items).reduce(
      (total, localIds) => total + localIds.size,
      0,
    );
  }

  private toggleMenu() {
    const willOpen = this.menu.hidden;
    this.menu.hidden = !willOpen;
    this.moreButton?.setAttribute("aria-expanded", String(willOpen));
    this.moreButton?.classList.toggle("viewer-tool-button--active", willOpen);

    if (willOpen) {
      const firstEnabled = this.menu.querySelector<HTMLButtonElement>(
        "button:not(:disabled)",
      );
      window.requestAnimationFrame(() => firstEnabled?.focus());
    }
  }

  private closeMenu(restoreFocus = false) {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.moreButton?.setAttribute("aria-expanded", "false");
    this.moreButton?.classList.remove("viewer-tool-button--active");
    if (restoreFocus) this.moreButton?.focus();
  }

  private syncContextActions() {
    const hideButton = this.buttons.get("hide");
    const isolateButton = this.buttons.get("isolate");
    const clearButton = this.buttons.get("clear-measures");
    const showAllButton = this.buttons.get("show-all");

    if (hideButton) hideButton.disabled = !this.hasSelection;
    if (isolateButton) isolateButton.disabled = !this.hasSelection;
    if (clearButton) clearButton.disabled = !this.hasMeasurements;
    if (showAllButton) showAllButton.disabled = !this.visibilityChanged;
  }

  private setStatus(
    message: string,
    state: "info" | "success" | "warning" = "info",
    withUndo = false,
  ) {
    window.clearTimeout(this.statusTimer);
    this.status.replaceChildren();

    const text = document.createElement("span");
    text.textContent = message;
    this.status.append(text);

    if (withUndo) {
      const undoButton = document.createElement("button");
      undoButton.type = "button";
      undoButton.textContent = "Ongedaan maken";
      undoButton.addEventListener(
        "click",
        () => void this.runAction(() => this.showAll()),
      );
      this.status.append(undoButton);
    }

    this.status.dataset.state = state;
    this.status.classList.add("is-visible");

    if (!withUndo) {
      this.statusTimer = window.setTimeout(() => {
        this.status.classList.remove("is-visible");
      }, 4500);
    }
  }
}
