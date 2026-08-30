import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts";
import { isCleanupKeyValid } from "./domain.ts";

const IFC_BUCKET = "ifc-models";
const QR_BUCKET = "qr-public";
const BATCH_LIMIT = 100;

type StoredObject = { bucket?: string | null; path?: string | null };

async function removeStoredObjects(supabase: any, objects: StoredObject[]) {
  const byBucket = new Map<string, Set<string>>();
  for (const object of objects) {
    if (!object.path) continue;
    const bucket = object.bucket || IFC_BUCKET;
    (byBucket.get(bucket) || byBucket.set(bucket, new Set()).get(bucket)!)
      .add(object.path);
  }
  for (const [bucket, paths] of byBucket) {
    const { error } = await supabase.storage.from(bucket).remove([...paths]);
    if (error) throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  if (
    !isCleanupKeyValid(
      Deno.env.get("VH_RETENTION_CLEANUP_KEY"),
      request.headers.get("x-cleanup-key"),
    )
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: versions, error } = await supabase.from("model_versions")
      .select("id, storage_bucket, storage_path_ifc")
      .eq("is_current", false)
      .not("retained_until", "is", null)
      .lte("retained_until", new Date().toISOString())
      .order("retained_until", { ascending: true })
      .limit(BATCH_LIMIT);
    if (error) throw error;

    let deleted = 0;
    const failures: Array<{ versionId: string; message: string }> = [];
    for (const version of versions || []) {
      try {
        const [filesResult, qrResult, revokeResult] = await Promise.all([
          supabase.from("files").select("path, storage_bucket").eq(
            "model_version_id",
            version.id,
          ),
          supabase.from("qr_assets").select("storage_path_png").eq(
            "model_version_id",
            version.id,
          ),
          supabase.from("shares").update({ is_active: false }).eq(
            "model_version_id",
            version.id,
          ),
        ]);
        if (filesResult.error || qrResult.error || revokeResult.error) {
          throw filesResult.error || qrResult.error || revokeResult.error;
        }

        await removeStoredObjects(supabase, [
          { bucket: version.storage_bucket, path: version.storage_path_ifc },
          ...(filesResult.data || []).map((file: any) => ({
            bucket: file.storage_bucket,
            path: file.path,
          })),
          ...(qrResult.data || []).map((asset: any) => ({
            bucket: QR_BUCKET,
            path: asset.storage_path_png,
          })),
        ]);

        const { error: filesDeleteError } = await supabase.from("files")
          .delete().eq("model_version_id", version.id);
        if (filesDeleteError) throw filesDeleteError;
        const { error: versionDeleteError } = await supabase.from(
          "model_versions",
        ).delete().eq("id", version.id);
        if (versionDeleteError) throw versionDeleteError;
        deleted += 1;
      } catch (cleanupError) {
        failures.push({
          versionId: String(version.id),
          message: cleanupError instanceof Error
            ? cleanupError.message
            : "Onbekende cleanupfout",
        });
      }
    }

    return Response.json(
      {
        ok: failures.length === 0,
        considered: versions?.length || 0,
        deleted,
        failures,
        hasMore: (versions?.length || 0) === BATCH_LIMIT,
      },
      { status: failures.length ? 500 : 200 },
    );
  } catch (error) {
    console.error("Retention cleanup mislukt", error);
    return Response.json({ error: "Retention cleanup mislukt." }, {
      status: 500,
    });
  }
});
