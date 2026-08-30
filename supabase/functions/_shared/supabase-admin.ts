import { createClient } from "npm:@supabase/supabase-js@2.95.3";

const OPAQUE_SECRET_KEY_PREFIX = "sb_secret_";

function serviceRoleKey(): string {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const key = JSON.parse(secretKeys).default;
      if (key && typeof key === "string") return key;
    } catch {
      // Fall through to the legacy key for older/self-hosted environments.
    }
  }

  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  throw new Error("Supabase server key ontbreekt in de function-omgeving.");
}

// supabase-js adds Authorization: Bearer <key> by default. Modern sb_secret
// keys are opaque and Supabase accepts them only in apikey, not Authorization.
// Keep an explicit Authorization header intact: Auth.getUser(token) needs the
// caller's JWT and is never replaced with the server key.
export function adminFetchForServiceKey(
  serviceKey: string,
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  if (!serviceKey.startsWith(OPAQUE_SECRET_KEY_PREFIX)) return baseFetch;

  return async (input, init) => {
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(init?.headers).forEach((value, name) =>
      headers.set(name, value)
    );

    if (headers.get("authorization") === `Bearer ${serviceKey}`) {
      headers.delete("authorization");
    }

    return await baseFetch(input, { ...init, headers });
  };
}

export function createSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL ontbreekt in de function-omgeving.");
  }

  const serviceKey = serviceRoleKey();
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: adminFetchForServiceKey(serviceKey) },
  });
}
