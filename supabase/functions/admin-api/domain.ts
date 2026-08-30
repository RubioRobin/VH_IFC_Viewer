export type QrAdminRoute =
  | { name: "list-qr" }
  | { name: "reserve-upload" }
  | { name: "delete-qr"; assetId: string };

function adminPathParts(pathname: string): string[] {
  return pathname
    .replace(/^.*\/admin-api(?=\/|$)/, "")
    .split("/")
    .filter(Boolean);
}

export function matchQrAdminRoute(
  method: string,
  pathname: string,
): QrAdminRoute | null {
  const parts = adminPathParts(pathname);
  const verb = method.toUpperCase();

  if (verb === "GET" && parts.length === 1 && parts[0] === "qr") {
    return { name: "list-qr" };
  }
  if (
    verb === "POST" && parts.length === 2 && parts[0] === "upload" &&
    parts[1] === "reserve"
  ) {
    return { name: "reserve-upload" };
  }
  if (verb === "DELETE" && parts.length === 2 && parts[0] === "qr") {
    return { name: "delete-qr", assetId: parts[1] };
  }
  return null;
}

export function buildReservedFileName(
  requestedName: string,
  reservationId: string,
): string {
  const cleaned = String(requestedName || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!cleaned.toLowerCase().endsWith(".ifc")) {
    throw new Error("Alleen IFC-bestanden (.ifc) kunnen worden gereserveerd.");
  }

  const suffix = `_${reservationId}.ifc`;
  const maxStemLength = Math.max(1, 180 - suffix.length);
  const stem =
    cleaned.slice(0, -4).replace(/[._-]+$/g, "").slice(0, maxStemLength) ||
    "model";
  return `${stem}${suffix}`;
}

export function buildReservedModelName(reservedFileName: string): string {
  const name = String(reservedFileName || "").trim();
  if (!name.toLowerCase().endsWith(".ifc")) {
    throw new Error(
      "Een gereserveerde modelnaam vereist een IFC-bestandsnaam.",
    );
  }
  return name.slice(0, -4);
}

export function normalizeAccountEmail(value: unknown): string {
  const email = String(value || "").trim().toLowerCase();
  const parts = email.split("@");
  const domain = parts[1] || "";
  const reservedDomain = /(?:^|\.)(?:invalid|localhost|test|example)$/i;

  if (
    email.length > 320 || parts.length !== 2 || !parts[0] ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.includes("..") ||
    reservedDomain.test(domain)
  ) {
    throw new Error("Vul een geldig, bereikbaar e-mailadres in.");
  }

  return email;
}

export function calculateScanGrowth(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  return current > 0 ? 100 : 0;
}
