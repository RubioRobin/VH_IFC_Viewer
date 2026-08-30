import { isCleanupKeyValid } from "./domain.ts";

Deno.test("retention cleanup accepts only the configured high-entropy key", () => {
  const key = "f4b59b63e3014c3c95105cd9d5c13a711844c87d9eb14d8f";
  if (!isCleanupKeyValid(key, key)) {
    throw new Error("The configured cleanup key was rejected.");
  }
  if (isCleanupKeyValid(key, `${key.slice(0, -1)}0`)) {
    throw new Error("A different cleanup key was accepted.");
  }
  if (isCleanupKeyValid("too-short", "too-short")) {
    throw new Error("A low-entropy cleanup key was accepted.");
  }
});
