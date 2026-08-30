// @deno-types="npm:@types/qrcode@1.5.6"
import QRCode from "npm:qrcode@1.5.4";
import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts";
import { normalizeModelIdentity, normalizeProjectCode } from "./domain.ts";

const IFC_BUCKET = "ifc-models";
const LEGACY_IFC_BUCKET = "ifc-private";
const QR_BUCKET = "qr-public";
const MAX_IFC_BYTES = 5 * 1024 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type RevitUser = {
  id: string;
  email: string;
};

function hasViewerUrl(): boolean {
  const value = Deno.env.get("VH_VIEWER_URL");
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function safeFileName(value: string): string {
  const result = (value || "unnamed.ifc").replace(/[^a-zA-Z0-9._-]/g, "_");
  return result.slice(0, 180) || "unnamed.ifc";
}

function requireIfcFileName(value: unknown): string {
  const fileName = safeFileName(String(value || ""));
  if (!fileName.toLowerCase().endsWith(".ifc")) {
    throw new ApiError(
      400,
      "Alleen IFC-bestanden (.ifc) kunnen worden geüpload.",
    );
  }
  return fileName;
}

function requireViewerUrl(): string {
  const baseUrl = (Deno.env.get("VH_VIEWER_URL") || "").replace(/\/$/, "");
  if (!baseUrl || !hasViewerUrl()) {
    throw new ApiError(503, "VH_VIEWER_URL ontbreekt in Supabase secrets.");
  }
  return baseUrl;
}

function viewerUrl(token: string): string {
  const baseUrl = requireViewerUrl();
  return `${baseUrl}/v/${encodeURIComponent(token)}`;
}

function tusEndpoint(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    throw new ApiError(503, "SUPABASE_URL ontbreekt in de function-omgeving.");
  }

  const endpoint = new URL(supabaseUrl);
  // Supabase advises the direct Storage hostname for large resumable uploads.
  // Keep localhost and custom domains functional by only rewriting the standard
  // hosted project URL.
  const hostedProject = /^([a-z0-9-]+)\.supabase\.co$/i.exec(
    endpoint.hostname,
  );
  if (hostedProject) {
    endpoint.hostname = `${hostedProject[1]}.storage.supabase.co`;
  }
  // Signed upload tokens are accepted only by the signed TUS route.  The
  // desktop client sends the token in x-signature for POST, HEAD and PATCH.
  endpoint.pathname = "/storage/v1/upload/resumable/sign";
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString().replace(/\/$/, "");
}

function pathParts(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isExpired(value: string | null | undefined): boolean {
  return Boolean(value && Date.parse(value) <= Date.now());
}

async function requestJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiError(400, "Ongeldige JSON-invoer.");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Ongeldige JSON-invoer.");
  }
}

// The database is intentionally migration-driven and has no generated TypeScript
// types in this repository yet. Keep the admin client dynamic at this boundary.
async function getAuthenticatedUser(
  supabase: any,
  request: Request,
): Promise<RevitUser> {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw new ApiError(401, "Meld je opnieuw aan in de Revit add-in.");
  }

  // getUser performs a server-side Auth validation; JWT claims or metadata from
  // the desktop client are never trusted for authorization decisions.
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (
    error || !data.user ||
    (data.user.banned_until && Date.parse(data.user.banned_until) > Date.now())
  ) {
    throw new ApiError(
      401,
      "Je Supabase-sessie is verlopen of je account is geblokkeerd.",
    );
  }

  return { id: data.user.id, email: data.user.email || data.user.id };
}

async function getVersion(
  supabase: any,
  modelId: string,
  versionId: string,
) {
  const { data, error } = await supabase
    .from("model_versions")
    .select(
      "id, model_id, storage_path_ifc, storage_bucket, file_name, file_size, upload_status, models(project_id, name)",
    )
    .eq("id", versionId)
    .eq("model_id", modelId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError(404, "Modelversie niet gevonden.");
  return data;
}

async function findStoredObject(
  supabase: any,
  bucket: string,
  storagePath: string,
) {
  const parts = storagePath.split("/");
  const fileName = parts.pop();
  if (!fileName) throw new ApiError(400, "Ongeldig opslagpad.");

  const { data, error } = await supabase.storage.from(bucket).list(
    parts.join("/"),
    {
      limit: 100,
      search: fileName,
    },
  );
  if (error) throw error;
  return (data || []).find((item: any) => item.name === fileName) || null;
}

async function ensureModel(
  supabase: any,
  projectId: string,
  modelName: string,
  createdBy: string,
) {
  const identity = normalizeModelIdentity(modelName);
  if (!identity) throw new ApiError(400, "Modelnaam is ongeldig.");
  const { data: created, error: createError } = await supabase.from("models")
    .upsert({
      id: crypto.randomUUID(),
      project_id: projectId,
      name: modelName,
      created_by: createdBy,
    }, {
      onConflict: "project_id,name_normalized",
      ignoreDuplicates: true,
    }).select("id").maybeSingle();
  if (createError) throw createError;
  if (created) return { id: String(created.id), created: true };

  const { data: existing, error: lookupError } = await supabase.from("models")
    .select("id").eq("project_id", projectId)
    .eq("name_normalized", identity).single();
  if (lookupError) throw lookupError;
  return { id: String(existing.id), created: false };
}

async function ensureActiveShare(
  supabase: any,
  versionId: string,
) {
  const { data, error } = await supabase
    .from("shares")
    .select("token, expires_at")
    .eq("model_version_id", versionId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const existing = (data || []).find((share: any) =>
    share.token && !isExpired(share.expires_at)
  );
  if (existing) return { token: existing.token, created: false };

  const token = crypto.randomUUID();
  const { error: insertError } = await supabase
    .from("shares")
    .insert({ model_version_id: versionId, token, is_active: true });
  if (insertError) throw insertError;
  return { token, created: true };
}

async function createQr(
  supabase: any,
  modelId: string,
  versionId: string,
  projectId: string,
  token: string,
) {
  const storagePath = `qr_codes/${modelId}/${versionId}.png`;
  const qr = await QRCode.toBuffer(viewerUrl(token), {
    errorCorrectionLevel: "H",
    width: 1024,
    margin: 1,
  });
  const { error: uploadError } = await supabase.storage
    .from(QR_BUCKET)
    .upload(storagePath, qr, { contentType: "image/png", upsert: true });
  if (uploadError) throw uploadError;

  const { data: existing, error: lookupError } = await supabase
    .from("qr_assets")
    .select("id")
    .eq("model_version_id", versionId)
    .limit(1);
  if (lookupError) throw lookupError;

  const metadata = {
    project_id: projectId,
    model_version_id: versionId,
    storage_path_png: storagePath,
  };
  const qrAssetError = existing?.[0]
    ? (await supabase.from("qr_assets").update(metadata).eq(
      "id",
      existing[0].id,
    )).error
    : (await supabase.from("qr_assets").insert(metadata)).error;
  if (qrAssetError) throw qrAssetError;

  const { data } = supabase.storage.from(QR_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

// Publish only after Storage and file metadata are complete. The database RPC
// moves existing QR/share capabilities atomically and retains older IFCs for
// recovery instead of invalidating printed QR codes.
async function publishModelVersion(
  supabase: any,
  modelId: string,
  versionId: string,
) {
  const retainedUntil = new Date(Date.now() + 7 * 86400000).toISOString();
  const { error } = await supabase.rpc("publish_model_version", {
    p_model_id: modelId,
    p_version_id: versionId,
    p_retained_until: retainedUntil,
  });
  if (error) throw error;
}

async function assertReadyVersion(
  supabase: any,
  modelId: string,
  versionId: string,
) {
  const version = await getVersion(supabase, modelId, versionId);
  if (version.upload_status !== "uploaded") {
    throw new ApiError(409, "De IFC-upload is nog niet volledig afgerond.");
  }
  return version;
}

async function findReservedVersion(
  supabase: any,
  modelId: string,
  fileName: string,
) {
  const { data, error } = await supabase.from("model_versions")
    .select("id, storage_path_ifc, storage_bucket")
    .eq("model_id", modelId)
    .eq("file_name", fileName)
    .eq("upload_status", "pending")
    .is("file_size", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const url = new URL(request.url);
    const parts = pathParts(url.pathname.replace(/^.*\/revit-api(?=\/|$)/, ""));
    const isHealthRequest = request.method === "GET" && parts[0] === "health";
    const user = isHealthRequest
      ? null
      : await getAuthenticatedUser(supabase, request);

    if (isHealthRequest) {
      const [projects, models, versions, shares, files, buckets] = await Promise
        .all([
          supabase.from("projects").select("id").limit(1),
          supabase.from("models").select("id, created_by").limit(1),
          supabase.from("model_versions").select(
            "id, storage_bucket, upload_status",
          ).limit(1),
          supabase.from("shares").select("id, token, is_active").limit(1),
          supabase.from("files").select("id, storage_bucket").limit(1),
          supabase.storage.listBuckets(),
        ]);
      const schemaError = [projects, models, versions, shares, files].find((
        result,
      ) => result.error)?.error;
      const bucketNames = new Set(
        (buckets.data || []).map((bucket: { name: string }) => bucket.name),
      );
      if (
        schemaError || buckets.error || !bucketNames.has(IFC_BUCKET) ||
        !bucketNames.has(LEGACY_IFC_BUCKET) || !bucketNames.has(QR_BUCKET) ||
        !hasViewerUrl()
      ) {
        console.error(
          "Directe Revit health-check mislukt",
          schemaError || buckets.error,
        );
        throw new ApiError(
          503,
          "Supabase schema of Storage is nog niet ingericht. Voer alle migraties uit.",
        );
      }
      return json({
        status: "ok",
        storage: IFC_BUCKET,
        authentication: "supabase-auth",
      });
    }

    if (
      request.method === "GET" && parts[0] === "projects" && parts.length === 1
    ) {
      const { data, error } = await supabase.from("projects").select(
        "id, name, code",
      ).order("name");
      if (error) throw error;
      return json(data ?? []);
    }

    if (
      request.method === "GET" && parts[0] === "projects" &&
      parts[2] === "files"
    ) {
      const { data, error } = await supabase
        .from("files")
        .select(
          "id, filename, path, size, storage_bucket, model_version_id, created_at",
        )
        .eq("project_id", parts[1])
        .order("filename");
      if (error) throw error;
      return json(data ?? []);
    }

    if (
      request.method === "POST" && parts[0] === "projects" &&
      parts[1] === "ensure"
    ) {
      const body = await requestJson(request);
      const code = normalizeProjectCode(body.projectNumber);
      const name = String(body.projectName || code).trim().slice(0, 255);
      if (!name) throw new ApiError(400, "Projectnaam ontbreekt.");

      if (code) {
        // A generated normalized column plus its unique index makes this
        // conflict-safe when two Revit clients ensure the project at once.
        const { data: created, error: createError } = await supabase
          .from("projects")
          .upsert({ id: crypto.randomUUID(), name, code }, {
            onConflict: "code_normalized",
            ignoreDuplicates: true,
          })
          .select("id, name, code")
          .maybeSingle();
        if (createError) throw createError;
        if (created) return json(created, 201);

        const { data: existing, error: lookupError } = await supabase
          .from("projects").select("id, name, code")
          .eq("code_normalized", code).single();
        if (lookupError) throw lookupError;
        return json(existing);
      }

      const { data: existing, error: lookupError } = await supabase
        .from("projects").select("id, name, code").eq("name", name)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return json(existing);

      const { data, error } = await supabase.from("projects")
        .insert({ id: crypto.randomUUID(), name, code: null })
        .select("id, name, code").single();
      if (error) throw error;
      return json(data, 201);
    }

    if (
      request.method === "POST" && parts[0] === "models" &&
      parts[1] === "create"
    ) {
      const body = await requestJson(request);
      const projectId = String(body.projectId || "").trim();
      const modelName = String(body.modelName || "").trim().slice(0, 255);
      if (!projectId || !modelName) {
        throw new ApiError(400, "Project en modelnaam zijn verplicht.");
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project) throw new ApiError(404, "Project niet gevonden.");

      const model = await ensureModel(
        supabase,
        String(project.id),
        modelName,
        user!.email,
      );
      return json({ modelId: model.id }, model.created ? 201 : 200);
    }

    if (
      request.method === "POST" && parts[0] === "models" &&
      parts[2] === "versions" && parts[3] === "upload-session"
    ) {
      const modelId = parts[1];
      const body = await requestJson(request);
      const fileName = requireIfcFileName(body.fileName);
      const fileSize = Number(body.fileSize);
      if (
        !Number.isSafeInteger(fileSize) || fileSize <= 0 ||
        fileSize > MAX_IFC_BYTES
      ) {
        throw new ApiError(400, "Ongeldige IFC-bestandsgrootte.");
      }

      const { data: model, error: modelError } = await supabase
        .from("models")
        .select("project_id")
        .eq("id", modelId)
        .maybeSingle();
      if (modelError) throw modelError;
      if (!model) throw new ApiError(404, "Model niet gevonden.");

      // The admin dashboard can reserve a stable viewer/QR capability before
      // Revit uploads the IFC. Reuse that empty version so its share token and
      // printed QR code remain valid after the real upload completes.
      const reserved = await findReservedVersion(supabase, modelId, fileName);
      if (reserved) {
        const bucket = reserved.storage_bucket || IFC_BUCKET;
        const { data: signed, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUploadUrl(reserved.storage_path_ifc);
        if (signedError || !signed) {
          throw signedError ||
            new Error("Kon geen ondertekende upload-URL maken.");
        }
        const { error: updateError } = await supabase.from("model_versions")
          .update({
            file_size: fileSize,
            checksum_sha256: body.checksumSha256
              ? String(body.checksumSha256).slice(0, 128)
              : null,
          })
          .eq("id", reserved.id);
        if (updateError) throw updateError;

        return json({
          versionId: reserved.id,
          uploadUrl: signed.signedUrl,
          uploadToken: signed.token,
          tusEndpoint: tusEndpoint(),
          storagePath: reserved.storage_path_ifc,
          storageBucket: bucket,
          reserved: true,
        }, 200);
      }

      const storagePath =
        `projects/${model.project_id}/models/${modelId}/revisions/${crypto.randomUUID()}/${fileName}`;
      const { data: signed, error: signedError } = await supabase.storage
        .from(IFC_BUCKET)
        .createSignedUploadUrl(storagePath);
      if (signedError || !signed) {
        throw signedError ||
          new Error("Kon geen ondertekende upload-URL maken.");
      }

      const { data: version, error: versionError } = await supabase
        .from("model_versions")
        .insert({
          model_id: modelId,
          storage_path_ifc: storagePath,
          storage_bucket: IFC_BUCKET,
          file_name: fileName,
          file_size: fileSize,
          checksum_sha256: body.checksumSha256
            ? String(body.checksumSha256).slice(0, 128)
            : null,
          upload_status: "pending",
        })
        .select("id")
        .single();
      if (versionError) throw versionError;

      return json({
        versionId: version.id,
        uploadUrl: signed.signedUrl,
        uploadToken: signed.token,
        tusEndpoint: tusEndpoint(),
        storagePath,
        storageBucket: IFC_BUCKET,
      }, 201);
    }

    if (
      request.method === "POST" && parts[0] === "models" &&
      parts[2] === "versions" && parts[4] === "complete"
    ) {
      const modelId = parts[1];
      const versionId = parts[3];
      const version = await getVersion(supabase, modelId, versionId);
      const object = await findStoredObject(
        supabase,
        version.storage_bucket || IFC_BUCKET,
        version.storage_path_ifc,
      );
      if (!object) {
        throw new ApiError(
          409,
          "Het IFC-bestand is nog niet volledig in Supabase Storage beschikbaar.",
        );
      }

      const actualSize = Number(object.metadata?.size);
      if (
        Number.isFinite(actualSize) && version.file_size !== null &&
        actualSize !== Number(version.file_size)
      ) {
        throw new ApiError(
          409,
          "De geüploade IFC-bestandsgrootte komt niet overeen met de export.",
        );
      }

      const model = asOne(version.models);
      if (!model?.project_id) {
        throw new ApiError(500, "Model heeft geen gekoppeld project.");
      }

      const { data: files, error: filesError } = await supabase
        .from("files")
        .select("id")
        .eq("model_version_id", versionId)
        .limit(1);
      if (filesError) throw filesError;

      const now = new Date().toISOString();
      const fileData = {
        project_id: String(model.project_id),
        filename: version.file_name,
        original_name: version.file_name,
        path: version.storage_path_ifc,
        size: version.file_size,
        storage_bucket: version.storage_bucket || IFC_BUCKET,
        model_version_id: versionId,
        uploaded_at: now,
      };
      const fileResult = files?.[0]
        ? await supabase.from("files").update(fileData).eq("id", files[0].id)
          .select("id").single()
        // The original VH schema stores file IDs as required text without a
        // default. A UUID string also remains compatible with UUID schemas.
        : await supabase.from("files").insert({
          id: crypto.randomUUID(),
          ...fileData,
        }).select("id").single();
      if (fileResult.error || !fileResult.data) {
        throw fileResult.error ||
          new Error("Bestandsmetadata kon niet worden opgeslagen.");
      }

      // Only mark the version as complete after its file metadata exists. This
      // makes a retry safe if an older schema temporarily rejected that insert.
      const { error: updateError } = await supabase
        .from("model_versions")
        .update({
          upload_status: "uploaded",
          uploaded_at: now,
          completed_at: now,
          source_file_id: String(fileResult.data.id),
        })
        .eq("id", versionId);
      if (updateError) throw updateError;

      // This is the final atomic switch. A failed RPC can be retried without
      // deleting either the previous version or its public capabilities.
      await publishModelVersion(supabase, modelId, versionId);

      return json({ ok: true });
    }

    if (
      request.method === "POST" && parts[0] === "models" &&
      parts[2] === "versions" && parts[4] === "share"
    ) {
      const modelId = parts[1];
      const versionId = parts[3];
      await assertReadyVersion(supabase, modelId, versionId);
      requireViewerUrl();
      const share = await ensureActiveShare(supabase, versionId);
      return json({ token: share.token, viewerUrl: viewerUrl(share.token) });
    }

    if (
      request.method === "POST" && parts[0] === "models" &&
      parts[2] === "versions" && parts[4] === "qr"
    ) {
      const modelId = parts[1];
      const versionId = parts[3];
      const version = await assertReadyVersion(supabase, modelId, versionId);
      const model = asOne(version.models);
      if (!model?.project_id) {
        throw new ApiError(500, "Model heeft geen gekoppeld project.");
      }

      requireViewerUrl();
      const share = await ensureActiveShare(supabase, versionId);
      const qrUrl = await createQr(
        supabase,
        modelId,
        versionId,
        String(model.project_id),
        share.token,
      );
      return json({ qrUrl });
    }

    if (
      request.method === "POST" && parts[0] === "files" &&
      parts[2] === "share-qr"
    ) {
      const fileId = parts[1];
      const body = await requestJson(request);
      const projectId = String(body.projectId || "").trim();
      if (!projectId) throw new ApiError(400, "Project ontbreekt.");

      const { data: file, error: fileError } = await supabase
        .from("files")
        .select(
          "id, project_id, filename, path, size, storage_bucket, model_version_id",
        )
        .eq("id", fileId)
        .maybeSingle();
      if (fileError) throw fileError;
      if (!file) throw new ApiError(404, "Bestand niet gevonden.");
      if (String(file.project_id) !== projectId) {
        throw new ApiError(403, "Bestand hoort niet bij het gekozen project.");
      }

      const storageBucket = file.storage_bucket || LEGACY_IFC_BUCKET;
      const storedObject = await findStoredObject(
        supabase,
        storageBucket,
        file.path,
      );
      if (!storedObject) {
        throw new ApiError(
          404,
          "Het IFC-bestand bestaat niet meer in Supabase Storage.",
        );
      }
      requireViewerUrl();

      let modelId: string | null = null;
      let versionId: string | null = null;
      if (file.model_version_id) {
        const { data: version, error: versionError } = await supabase
          .from("model_versions")
          .select("id, model_id")
          .eq("id", file.model_version_id)
          .maybeSingle();
        if (versionError) throw versionError;
        if (version) {
          modelId = version.model_id;
          versionId = version.id;
        }
      }

      if (!modelId || !versionId) {
        const model = await ensureModel(
          supabase,
          projectId,
          file.filename,
          user!.email,
        );
        modelId = model.id;

        const now = new Date().toISOString();
        const candidateVersionId = crypto.randomUUID();
        const { data: createdVersion, error: createVersionError } =
          await supabase.from("model_versions").upsert({
            id: candidateVersionId,
            model_id: modelId,
            storage_path_ifc: file.path,
            storage_bucket: storageBucket,
            file_name: file.filename,
            file_size: file.size || null,
            source_file_id: String(file.id),
            upload_status: "uploaded",
            uploaded_at: now,
            completed_at: now,
          }, {
            onConflict: "source_file_id",
            ignoreDuplicates: true,
          }).select("id, model_id").maybeSingle();
        if (createVersionError) throw createVersionError;

        let linkedVersion = createdVersion;
        if (!linkedVersion) {
          const { data: existingVersion, error: existingVersionError } =
            await supabase.from("model_versions").select("id, model_id")
              .eq("source_file_id", String(file.id)).single();
          if (existingVersionError) throw existingVersionError;
          linkedVersion = existingVersion;
        }
        versionId = String(linkedVersion.id);
        modelId = String(linkedVersion.model_id);

        const { error: refreshVersionError } = await supabase.from(
          "model_versions",
        ).update({
          storage_path_ifc: file.path,
          storage_bucket: storageBucket,
          file_name: file.filename,
          file_size: file.size || null,
          upload_status: "uploaded",
          uploaded_at: now,
          completed_at: now,
        }).eq("id", versionId);
        if (refreshVersionError) throw refreshVersionError;

        const { error: linkError } = await supabase.from("files").update({
          model_version_id: versionId,
        }).eq("id", file.id);
        if (linkError) throw linkError;

        await publishModelVersion(supabase, modelId, versionId);
      }

      if (modelId === null || versionId === null) {
        throw new ApiError(
          500,
          "Modelversie kon niet worden gekoppeld aan het bestand.",
        );
      }

      const resolvedModelId = modelId;
      const resolvedVersionId = versionId;
      const share = await ensureActiveShare(supabase, resolvedVersionId);
      const qrUrl = await createQr(
        supabase,
        resolvedModelId,
        resolvedVersionId,
        projectId,
        share.token,
      );
      return json({
        viewerUrl: viewerUrl(share.token),
        qrUrl,
        modelId: resolvedModelId,
        versionId: resolvedVersionId,
      });
    }

    return json({ error: "Endpoint niet gevonden." }, 404);
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.message }, error.status);
    }
    console.error("revit-api fout", error);
    return json(
      { error: "De Revit-koppeling kon de aanvraag niet verwerken." },
      500,
    );
  }
});
