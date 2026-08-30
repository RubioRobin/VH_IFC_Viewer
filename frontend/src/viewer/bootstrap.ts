export interface LocalViewerBootstrap {
  mode: "local";
}

export interface PublicViewerBootstrap {
  mode: "public";
  token: string;
  filename: string;
  modelUrl: string;
}

export type ViewerBootstrap = LocalViewerBootstrap | PublicViewerBootstrap;

let viewerBootstrap: ViewerBootstrap = { mode: "local" };

export const setViewerBootstrap = (value: ViewerBootstrap) => {
  viewerBootstrap = value;
};

export const getViewerBootstrap = () => viewerBootstrap;

export const getViewerToken = () => {
  const pathParts = window.location.pathname.split("/");
  const viewerIndex = pathParts.indexOf("v");
  return viewerIndex >= 0
    ? decodeURIComponent(pathParts[viewerIndex + 1] || "")
    : "";
};

export const getViewerModelName = (filename: string) => (
  filename.replace(/\.ifc$/i, "").trim() || "IFC-model"
);
