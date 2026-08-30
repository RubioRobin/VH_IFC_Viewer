import {
  isExpired,
  isMissingLegacyRelationError,
  isShareToken,
} from "./domain.ts";

Deno.test("viewer tokens accept current and legacy capability formats", () => {
  for (
    const token of [
      "44f9711a-a06f-48e8-aa45-4b0e60212cbe",
      "legacy_share-token_123",
    ]
  ) {
    if (!isShareToken(token)) throw new Error(`Rejected valid token: ${token}`);
  }
  for (const token of [null, "short", "bad token", "../viewer-token"]) {
    if (isShareToken(token)) {
      throw new Error(`Accepted invalid token: ${token}`);
    }
  }
});

Deno.test("legacy fallback tolerates only a missing public_links relation", () => {
  if (!isMissingLegacyRelationError({ code: "42P01" })) {
    throw new Error("Postgres missing-relation error was not recognized.");
  }
  if (!isMissingLegacyRelationError({ code: "PGRST205" })) {
    throw new Error("PostgREST missing-relation error was not recognized.");
  }
  if (isMissingLegacyRelationError({ code: "42501" })) {
    throw new Error("A permission error was incorrectly ignored.");
  }
});

Deno.test("viewer expiry uses the capability deadline", () => {
  if (!isExpired("2000-01-01T00:00:00.000Z")) {
    throw new Error("Expired capability was accepted.");
  }
  if (isExpired("2999-01-01T00:00:00.000Z") || isExpired(null)) {
    throw new Error("Active capability was marked expired.");
  }
});
