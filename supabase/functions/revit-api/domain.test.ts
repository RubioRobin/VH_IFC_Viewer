import { normalizeModelIdentity, normalizeProjectCode } from "./domain.ts";

Deno.test("project routing codes are case-insensitive and preserve content", () => {
  if (normalizeProjectCode(" 25i2p435 ") !== "25I2P435") {
    throw new Error("Project code was not normalized as expected.");
  }
});

Deno.test("model identities match extension and casing variants", () => {
  const variants = ["Constructie", " constructie.ifc ", "CONSTRUCTIE.IFC"];
  const identities = variants.map(normalizeModelIdentity);
  if (identities.some((identity) => identity !== "constructie")) {
    throw new Error(`Model identities do not match: ${identities.join(", ")}`);
  }
});
