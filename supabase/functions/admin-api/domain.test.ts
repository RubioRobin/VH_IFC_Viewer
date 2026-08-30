import {
  buildReservedFileName,
  buildReservedModelName,
  matchQrAdminRoute,
  normalizeAccountEmail,
} from "./domain.ts";

Deno.test("QR admin routes cover the dashboard contract", () => {
  const cases = [
    ["GET", "/functions/v1/admin-api/qr", "list-qr"],
    ["POST", "/functions/v1/admin-api/upload/reserve", "reserve-upload"],
    ["DELETE", "/functions/v1/admin-api/qr/asset-123", "delete-qr"],
  ] as const;

  for (const [method, path, expected] of cases) {
    const match = matchQrAdminRoute(method, path);
    if (match?.name !== expected) {
      throw new Error(
        `${method} ${path} resolved to ${match?.name || "nothing"}`,
      );
    }
  }

  if (matchQrAdminRoute("POST", "/functions/v1/admin-api/qr")) {
    throw new Error("An unsupported QR route must not match.");
  }
});

Deno.test("reserved IFC names are safe, deterministic and retain the extension", () => {
  const result = buildReservedFileName(
    "Constructie definitief.ifc",
    "44f9711a-a06f-48e8-aa45-4b0e60212cbe",
  );

  if (
    result !== "Constructie_definitief_44f9711a-a06f-48e8-aa45-4b0e60212cbe.ifc"
  ) {
    throw new Error(`Unexpected reserved filename: ${result}`);
  }
  if (result.length > 180) {
    throw new Error("Reserved filename exceeds Storage limit.");
  }
});

Deno.test("reserved uploads reject non-IFC file names", () => {
  let rejected = false;
  try {
    buildReservedFileName("model.rvt", crypto.randomUUID());
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("A non-IFC filename was accepted.");
});

Deno.test("reserved model names match Revit model naming without extension", () => {
  const fileName = buildReservedFileName(
    "Constructie V1.ifc",
    "c572db54-6ca9-4e5d-97bb-875af9ee741d",
  );
  const modelName = buildReservedModelName(fileName);
  if (modelName !== "Constructie_V1_c572db54-6ca9-4e5d-97bb-875af9ee741d") {
    throw new Error(`Unexpected reserved model name: ${modelName}`);
  }
});

Deno.test("account e-mail is normalized and must be a usable address", () => {
  if (
    normalizeAccountEmail(" Robin@VH-Engineering.nl ") !==
      "robin@vh-engineering.nl"
  ) {
    throw new Error("Account e-mail was not normalized.");
  }

  for (const invalid of ["robin", "robin@localhost", "robin@example.invalid"]) {
    let rejected = false;
    try {
      normalizeAccountEmail(invalid);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(`Invalid account e-mail was accepted: ${invalid}`);
    }
  }
});
