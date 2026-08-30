import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import { adminFetchForServiceKey } from "./supabase-admin.ts";

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

Deno.test("modern secret keys are sent only in apikey", async () => {
  const secretKey = "sb_secret_test-key";
  let receivedHeaders: Headers | undefined;
  const captureFetch: typeof fetch = async (_input, init) => {
    receivedHeaders = new Headers(init?.headers);
    return new Response("[]", {
      headers: { "content-type": "application/json" },
    });
  };

  const client = createClient("https://project.supabase.co", secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: adminFetchForServiceKey(secretKey, captureFetch) },
  });
  await client.from("projects").select("id");

  assertEquals(receivedHeaders?.get("apikey"), secretKey, "apikey ontbreekt");
  assertEquals(
    receivedHeaders?.get("authorization"),
    null,
    "opaque secret key mag niet als Authorization worden verstuurd",
  );
});

Deno.test("a user JWT remains available for server-side validation", async () => {
  const secretKey = "sb_secret_test-key";
  const userJwt = "ey.test.user.jwt";
  let receivedHeaders: Headers | undefined;
  const captureFetch: typeof fetch = async (_input, init) => {
    receivedHeaders = new Headers(init?.headers);
    return new Response(null, { status: 200 });
  };

  const safeFetch = adminFetchForServiceKey(secretKey, captureFetch);
  await safeFetch("https://project.supabase.co/auth/v1/user", {
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${userJwt}`,
    },
  });

  assertEquals(
    receivedHeaders?.get("authorization"),
    `Bearer ${userJwt}`,
    "gebruikers-JWT mag niet worden verwijderd",
  );
});

Deno.test("legacy JWT service-role keys keep their Authorization header", async () => {
  const legacyKey = "ey.legacy.service-role.jwt";
  let receivedHeaders: Headers | undefined;
  const captureFetch: typeof fetch = async (_input, init) => {
    receivedHeaders = new Headers(init?.headers);
    return new Response(null, { status: 200 });
  };

  const safeFetch = adminFetchForServiceKey(legacyKey, captureFetch);
  await safeFetch("https://project.supabase.co/rest/v1/projects", {
    headers: { authorization: `Bearer ${legacyKey}` },
  });

  assertEquals(
    receivedHeaders?.get("authorization"),
    `Bearer ${legacyKey}`,
    "legacy service-role JWT moet compatibel blijven",
  );
});
