import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts";
import {
  isExpired,
  isMissingLegacyRelationError,
  isShareToken,
} from "./domain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function projectName(supabase: any, projectId: unknown) {
  if (!projectId) return undefined;
  const { data, error } = await supabase.from("projects").select("name")
    .eq("id", String(projectId)).maybeSingle();
  if (error) {
    console.error("Projectnaam voor viewerstatistiek ontbreekt", error);
    return undefined;
  }
  return data?.name;
}

async function logViewerScan(
  supabase: any,
  values: {
    projectId?: unknown;
    modelId?: unknown;
    modelVersionId?: unknown;
    fileName: string;
    legacy?: boolean;
  },
) {
  const { error } = await supabase.from("revit_audit_log").insert({
    user_email: "viewer-link@vh-engineering.nl",
    action: "viewer_scan",
    project_id: values.projectId ? String(values.projectId) : null,
    model_id: values.modelId || null,
    model_version_id: values.modelVersionId || null,
    detail: { fileName: values.fileName, legacy: Boolean(values.legacy) },
  });
  if (error) console.error("Viewer-scan registreren mislukt", error);
}

async function resolveLegacyPublicLink(
  supabase: any,
  token: string,
): Promise<Response | null> {
  const { data: link, error } = await supabase.from("public_links").select("*")
    .eq("public_id", token).maybeSingle();
  if (error) {
    if (isMissingLegacyRelationError(error)) return null;
    throw error;
  }
  if (!link) return null;
  if (link.is_active === false) {
    return json({ error: "Viewer-link niet gevonden of ingetrokken." }, 404);
  }
  if (isExpired(link.expires_at)) {
    return json({ error: "Viewer-link is verlopen." }, 410);
  }

  const { data: file, error: fileError } = await supabase.from("files")
    .select(
      "id, project_id, filename, path, storage_bucket, model_version_id",
    )
    .eq("id", link.ifc_file_id).maybeSingle();
  if (fileError) throw fileError;
  if (!file?.path) {
    return json({ error: "Viewer-link bevat geen IFC-bestand." }, 404);
  }

  const bucket = file.storage_bucket || "ifc-private";
  const { data: signed, error: signedError } = await supabase.storage
    .from(bucket).createSignedUrl(file.path, 60 * 15);
  if (signedError || !signed?.signedUrl) {
    return json({ error: "IFC-bestand is niet beschikbaar." }, 404);
  }

  const filename = String(file.filename || "model.ifc");
  await logViewerScan(supabase, {
    projectId: file.project_id || link.project_id,
    modelVersionId: file.model_version_id,
    fileName: filename,
    legacy: true,
  });
  return json({
    modelUrl: signed.signedUrl,
    filename,
    projectName: await projectName(
      supabase,
      file.project_id || link.project_id,
    ),
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!isShareToken(token)) {
      return json({ error: "Ongeldige viewer-link." }, 400);
    }

    const supabase = createSupabaseAdminClient();

    const { data: share, error } = await supabase
      .from("shares")
      .select(
        "token, is_active, expires_at, model_versions(id, model_id, storage_path_ifc, storage_bucket, file_name, models(name, project_id))",
      )
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;

    // Historic shares can predate the is_active column. Only an explicit
    // revocation makes a capability unavailable; the migration normalises
    // legacy NULL values to true as well.
    if (!share) {
      const legacy = await resolveLegacyPublicLink(supabase, token);
      if (legacy) return legacy;
      return json({ error: "Viewer-link niet gevonden of ingetrokken." }, 404);
    }
    if (share.is_active === false) {
      return json({ error: "Viewer-link niet gevonden of ingetrokken." }, 404);
    }
    if (isExpired(share.expires_at)) {
      return json({ error: "Viewer-link is verlopen." }, 410);
    }

    const version = asOne<any>(share.model_versions);
    if (!version?.storage_path_ifc) {
      return json({ error: "Viewer-link bevat geen IFC-bestand." }, 404);
    }

    const bucket = version.storage_bucket || "ifc-models";
    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(version.storage_path_ifc, 60 * 15);
    if (signedError || !signed?.signedUrl) {
      return json({ error: "IFC-bestand is niet beschikbaar." }, 404);
    }

    const update = await supabase
      .from("shares")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("token", share.token);
    if (update.error) {
      console.error("Kon laatst-geopend tijdstip niet bijwerken", update.error);
    }

    const model = asOne<any>(version.models);
    const candidateName = version.file_name || model?.name || "model.ifc";
    const filename = candidateName.toLowerCase().endsWith(".ifc")
      ? candidateName
      : `${candidateName}.ifc`;
    await logViewerScan(supabase, {
      projectId: model?.project_id,
      modelId: version.model_id,
      modelVersionId: version.id,
      fileName: filename,
    });
    return json({
      modelUrl: signed.signedUrl,
      filename,
      projectName: await projectName(supabase, model?.project_id),
    });
  } catch (error) {
    console.error("viewer-link fout", error);
    return json({ error: "Viewer-link kon niet worden opgehaald." }, 500);
  }
});
