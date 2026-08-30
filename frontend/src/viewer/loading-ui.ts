interface LoadingStageOptions {
  detail?: string;
  progress?: number | null;
}

interface LoadingErrorOptions {
  canRequestNewLink?: boolean;
}

const getOverlay = () => document.getElementById("initial-loading-overlay");

const setText = (selector: string, value: string) => {
  const element = getOverlay()?.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
};

const normalizeProgress = (progress: number) => Math.min(100, Math.max(0, progress));

export const setLoadingStage = (
  title: string,
  { detail = "", progress = null }: LoadingStageOptions = {},
) => {
  const overlay = getOverlay();
  if (!overlay) return;

  overlay.classList.remove("loading-overlay--error", "is-leaving");
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-busy", "true");

  setText("[data-loading-title]", title);
  setText("[data-loading-detail]", detail);

  const detailElement = overlay.querySelector<HTMLElement>("[data-loading-detail]");
  if (detailElement) detailElement.hidden = detail.length === 0;

  const progressElement = overlay.querySelector<HTMLElement>("[data-loading-progress]");
  const progressValue = overlay.querySelector<HTMLElement>("[data-loading-progress-value]");
  const normalized = typeof progress === "number" ? normalizeProgress(progress) : null;

  if (progressElement) progressElement.hidden = normalized === null;
  if (progressValue && normalized !== null) {
    progressValue.style.width = `${normalized}%`;
    progressValue.parentElement?.setAttribute("aria-valuenow", String(Math.round(normalized)));
  }

  setText(
    "[data-loading-progress-label]",
    normalized === null ? "" : `${Math.round(normalized)}%`,
  );

  const actions = overlay.querySelector<HTMLElement>("[data-loading-actions]");
  if (actions) actions.replaceChildren();
};

const createActionButton = (label: string, onClick: () => void, primary = false) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary
    ? "loading-action loading-action--primary"
    : "loading-action";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
};

const requestNewLink = () => {
  const subject = encodeURIComponent("Verzoek om een nieuwe IFC viewerlink");
  const body = encodeURIComponent(
    `De IFC viewerlink werkt niet meer. Kun je een nieuwe link delen?\n\n${window.location.href}`,
  );
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
};

export const showLoadingError = (
  message: string,
  { canRequestNewLink = false }: LoadingErrorOptions = {},
) => {
  const overlay = getOverlay();
  if (!overlay) return;

  overlay.classList.add("loading-overlay--error");
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");
  overlay.setAttribute("aria-busy", "false");

  setText("[data-loading-title]", "IFC kon niet worden geladen");
  setText("[data-loading-detail]", message);

  const detail = overlay.querySelector<HTMLElement>("[data-loading-detail]");
  if (detail) detail.hidden = false;

  const progress = overlay.querySelector<HTMLElement>("[data-loading-progress]");
  if (progress) progress.hidden = true;

  const actions = overlay.querySelector<HTMLElement>("[data-loading-actions]");
  if (!actions) return;

  actions.replaceChildren(
    createActionButton("Opnieuw proberen", () => window.location.reload(), true),
  );
  if (canRequestNewLink) {
    actions.append(createActionButton("Vraag een nieuwe link aan", requestNewLink));
  }
};

export const hideLoadingOverlay = () => {
  const overlay = getOverlay();
  if (!overlay) return;

  overlay.setAttribute("aria-busy", "false");
  overlay.classList.add("is-leaving");

  const remove = () => overlay.remove();
  overlay.addEventListener("transitionend", remove, { once: true });
  window.setTimeout(remove, 220);
};
