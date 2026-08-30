export function normalizeProjectCode(value: unknown): string {
  const raw = String(value || "").trim().slice(0, 100);
  // Project Information is authoritative. Preserve the complete Revit Project
  // Number (for example 25I2P435) and only normalise casing/outer whitespace.
  return raw.toUpperCase();
}

export function normalizeModelIdentity(value: unknown): string {
  return String(value || "")
    .trim()
    .slice(0, 255)
    .replace(/\.ifc$/i, "")
    .trim()
    .toLowerCase();
}
