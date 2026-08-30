import "./style.css";
import {
  getViewerModelName,
  getViewerToken,
  setViewerBootstrap,
  type PublicViewerBootstrap,
} from "./viewer/bootstrap";
import { setLoadingStage, showLoadingError } from "./viewer/loading-ui";

interface ViewerLinkResponse {
  modelUrl?: unknown;
  filename?: unknown;
}

const loadViewerEngine = async () => {
  setLoadingStage("3D-viewer voorbereiden", {
    detail: "De vieweronderdelen worden geladen.",
  });
  await import("./viewer-app");
};

const getPublicViewerBootstrap = async (
  token: string,
): Promise<PublicViewerBootstrap> => {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const publishableKey = String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || "",
  );

  if (!supabaseUrl || !publishableKey) {
    throw new Error("De viewer mist de Supabase-configuratie.");
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/viewer-link?token=${encodeURIComponent(token)}`,
    { headers: { apikey: publishableKey } },
  );

  if (response.status === 404) {
    throw new Error("Deze link is ongeldig of ingetrokken.");
  }
  if (response.status === 410) {
    throw new Error("Deze link is verlopen.");
  }
  if (!response.ok) {
    throw new Error("Modelgegevens konden niet worden opgehaald.");
  }

  const data = await response.json() as ViewerLinkResponse;
  if (typeof data.modelUrl !== "string" || typeof data.filename !== "string") {
    throw new Error("De viewerlink bevat geen geldig IFC-model.");
  }

  return {
    mode: "public",
    token,
    filename: data.filename,
    modelUrl: data.modelUrl,
  };
};

const bootstrapViewer = async () => {
  const token = getViewerToken();
  const urlParams = new URLSearchParams(window.location.search);

  if (!token) {
    if (urlParams.has("model") || urlParams.has("fileId")) {
      showLoadingError(
        "Deze viewerlink is verouderd. Vraag een nieuwe QR- of share-link aan.",
        { canRequestNewLink: true },
      );
      return;
    }

    document.title = "VH Engineering IFC Viewer";
    setViewerBootstrap({ mode: "local" });
    try {
      await loadViewerEngine();
    } catch (error) {
      console.error("IFC viewer engine error:", error);
      showLoadingError("De 3D-viewer kon niet worden gestart. Probeer het opnieuw.");
    }
    return;
  }

  setLoadingStage("Viewerlink controleren", {
    detail: "Het gedeelde model wordt opgehaald.",
  });

  try {
    const bootstrap = await getPublicViewerBootstrap(token);
    setViewerBootstrap(bootstrap);
    document.title = `VH Engineering IFC Viewer – ${getViewerModelName(bootstrap.filename)}`;
    await loadViewerEngine();
  } catch (error) {
    console.error("IFC viewer bootstrap error:", error);
    const message = error instanceof Error
      ? error.message
      : "Onbekende fout tijdens het controleren van de viewerlink.";
    showLoadingError(message, {
      canRequestNewLink: /ongeldig|ingetrokken|verlopen|verouderd/i.test(message),
    });
  }
};

void bootstrapViewer();
