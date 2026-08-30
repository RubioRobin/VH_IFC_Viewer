import { createSupabaseAdminClient } from "../_shared/supabase-admin.ts";

const IFC_BUCKET = "ifc-models";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type AuthenticatedUser = {
  id: string;
  email: string;
  metadata: Record<string, unknown>;
  appMetadata: Record<string, unknown>;
};

const LEGACY_ADMIN_EMAIL_DOMAIN = "admin.vh-ifc.invalid";

function pathParts(pathname: string): string[] {
  return pathname.replace(/^.*\/admin-api(?=\/|$)/, "").split("/").filter(Boolean);
}

function safeFileName(value: unknown): string {
  const name = String(value || "bestand.ifc").replace(/[^a-zA-Z0-9._-]/g, "_");
  return name.slice(0, 180) || "bestand.ifc";
}

function requireText(value: unknown, label: string, maxLength = 500): string {
  const text = String(value || "").trim().slice(0, maxLength);
  if (!text) throw new ApiError(400, `${label} is verplicht.`);
  return text;
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

async function getAuthenticatedUser(supabase: any, request: Request): Promise<AuthenticatedUser> {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (!match) throw new ApiError(401, "Meld je opnieuw aan.");

  const { data, error } = await supabase.auth.getUser(match[1]);
  const user = data?.user;
  if (error || !user || (user.banned_until && Date.parse(user.banned_until) > Date.now())) {
    throw new ApiError(401, "Je Supabase-sessie is verlopen of je account is geblokkeerd.");
  }

  return {
    id: user.id,
    email: user.email || user.id,
    metadata: (user.user_metadata || {}) as Record<string, unknown>,
    appMetadata: (user.app_metadata || {}) as Record<string, unknown>,
  };
}

function requireAdmin(user: AuthenticatedUser) {
  if (user.appMetadata.role !== "admin") {
    throw new ApiError(403, "Adminrechten zijn vereist voor dit dashboard.");
  }
}

function legacyAdminEmail(username: string): string {
  const localPart = username.trim().toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 64);
  if (!localPart) throw new ApiError(401, "Inloggen mislukt.");
  return `${localPart}@${LEGACY_ADMIN_EMAIL_DOMAIN}`;
}

async function prepareLegacyAdminLogin(supabase: any, request: Request) {
  const body = await requestJson(request);
  const username = requireText(body.username, "Gebruikersnaam", 100);
  const { data: legacyUser, error: legacyError } = await supabase
    .from("users")
    .select("id, username, password_hash, role, disabled")
    .ilike("username", username)
    .maybeSingle();

  if (
    legacyError || !legacyUser || legacyUser.disabled ||
    legacyUser.role !== "admin" || !legacyUser.password_hash
  ) {
    throw new ApiError(401, "Inloggen mislukt.");
  }

  const email = legacyAdminEmail(legacyUser.username);
  const { data: listedUsers, error: listError } = await supabase.auth.admin
    .listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  let authUser = listedUsers.users.find((candidate: any) =>
    candidate.user_metadata?.legacy_user_id === legacyUser.id ||
    String(candidate.email || "").toLowerCase() === email
  );

  if (!authUser) {
    const credentials = {
      email,
      password_hash: legacyUser.password_hash,
      email_confirm: true,
      app_metadata: { role: "admin" },
      user_metadata: {
        username: legacyUser.username,
        legacy_user_id: legacyUser.id,
      },
    } as any;
    const { data, error } = await supabase.auth.admin.createUser(credentials);
    if (error || !data.user) {
      console.error("Legacy admin migreren mislukt", error);
      throw new ApiError(401, "Inloggen mislukt.");
    }
    authUser = data.user;
  } else if (authUser.app_metadata?.role !== "admin") {
    const { data, error } = await supabase.auth.admin.updateUserById(
      authUser.id,
      {
        app_metadata: { ...(authUser.app_metadata || {}), role: "admin" },
        user_metadata: {
          ...(authUser.user_metadata || {}),
          username: legacyUser.username,
          legacy_user_id: legacyUser.id,
        },
      },
    );
    if (error || !data.user) throw new ApiError(401, "Inloggen mislukt.");
    authUser = data.user;
  }

  return { loginEmail: authUser.email || email };
}

async function audit(
  supabase: any,
  user: AuthenticatedUser,
  action: string,
  detail: Record<string, unknown> = {},
  projectId?: string,
) {
  const { error } = await supabase.from("revit_audit_log").insert({
    user_id: user.id,
    user_email: user.email,
    action,
    project_id: projectId || null,
    detail,
  });
  if (error) console.error("Admin auditlog schrijven mislukt", error);
}

function mapUser(user: any) {
  return {
    id: user.id,
    username: user.user_metadata?.username || user.email || user.id,
    email: user.email || "",
    avatar_url: user.user_metadata?.avatar_url || "",
    role: user.app_metadata?.role || "user",
    disabled: Boolean(user.banned_until && Date.parse(user.banned_until) > Date.now()),
    created_at: user.created_at,
  };
}

async function getProject(supabase: any, id: string) {
  const { data, error } = await supabase.from("projects")
    .select("id, name, code, description, status, created_at")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "Project niet gevonden.");
  return data;
}

async function listProjects(supabase: any) {
  const { data: projects, error } = await supabase.from("projects")
    .select("id, name, code, description, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: files, error: filesError } = await supabase.from("files")
    .select("project_id, size, created_at, uploaded_at");
  if (filesError) throw filesError;

  const totals = new Map<string, { file_count: number; total_size: number; updated_at?: string }>();
  for (const file of files || []) {
    const key = String(file.project_id);
    const entry = totals.get(key) || { file_count: 0, total_size: 0 };
    entry.file_count += 1;
    entry.total_size += Number(file.size || 0);
    const fileDate = file.uploaded_at || file.created_at;
    if (fileDate && (!entry.updated_at || fileDate > entry.updated_at)) entry.updated_at = fileDate;
    totals.set(key, entry);
  }

  return (projects || []).map((project: any) => ({
    ...project,
    ...(totals.get(String(project.id)) || { file_count: 0, total_size: 0 }),
    updated_at: totals.get(String(project.id))?.updated_at || project.created_at,
  }));
}

async function listProjectFiles(supabase: any, projectId: string) {
  await getProject(supabase, projectId);
  const { data: files, error } = await supabase.from("files")
    .select("id, filename, path, size, storage_bucket, model_version_id, created_at, uploaded_at")
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;

  const versionIds = (files || []).map((file: any) => file.model_version_id).filter(Boolean);
  const tokens = new Map<string, string>();
  if (versionIds.length) {
    const { data: shares, error: sharesError } = await supabase.from("shares")
      .select("model_version_id, token, is_active, expires_at")
      .in("model_version_id", versionIds)
      .eq("is_active", true);
    if (sharesError) throw sharesError;
    for (const share of shares || []) {
      if (!share.expires_at || Date.parse(share.expires_at) > Date.now()) {
        tokens.set(String(share.model_version_id), share.token);
      }
    }
  }

  return (files || []).map((file: any) => ({
    ...file,
    upload_date: file.uploaded_at || file.created_at,
    share_token: file.model_version_id ? tokens.get(String(file.model_version_id)) || null : null,
  }));
}

async function deleteProject(supabase: any, projectId: string) {
  const { data: files, error: filesError } = await supabase.from("files")
    .select("path, storage_bucket").eq("project_id", projectId);
  if (filesError) throw filesError;
  const { data: models, error: modelsError } = await supabase.from("models")
    .select("id").eq("project_id", projectId);
  if (modelsError) throw modelsError;
  const modelIds = (models || []).map((model: any) => model.id);
  const versionRows = modelIds.length
    ? await supabase.from("model_versions").select("storage_path_ifc, storage_bucket").in("model_id", modelIds)
    : { data: [], error: null };
  if (versionRows.error) throw versionRows.error;
  const objectPaths = new Map<string, Set<string>>();
  for (const item of [...(files || []), ...(versionRows.data || [])]) {
    const bucket = item.storage_bucket || IFC_BUCKET;
    const path = item.path || item.storage_path_ifc;
    if (path) (objectPaths.get(bucket) || objectPaths.set(bucket, new Set()).get(bucket)!).add(path);
  }
  for (const [bucket, paths] of objectPaths) {
    const { error } = await supabase.storage.from(bucket).remove([...paths]);
    if (error) throw error;
  }
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}

async function detailedStatistics(supabase: any, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: auditRows, error } = await supabase.from("revit_audit_log")
    .select("action, project_id, detail, occurred_at")
    .gte("occurred_at", since).order("occurred_at", { ascending: false });
  if (error) throw error;

  const projectCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();
  const timeline = new Map<string, number>();
  for (const row of auditRows || []) {
    const date = String(row.occurred_at).slice(0, 10);
    timeline.set(date, (timeline.get(date) || 0) + 1);
    if (row.project_id) projectCounts.set(String(row.project_id), (projectCounts.get(String(row.project_id)) || 0) + 1);
    const fileName = row.detail?.fileName || row.detail?.filename;
    if (typeof fileName === "string") fileCounts.set(fileName, (fileCounts.get(fileName) || 0) + 1);
  }

  const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name");
  if (projectsError) throw projectsError;
  const projectName = new Map((projects || []).map((project: any) => [String(project.id), project.name]));
  return {
    projects: [...projectCounts].map(([id, count]) => ({ name: projectName.get(id) || id, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    files: [...fileCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    timeline: [...timeline].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    growth: 0,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createSupabaseAdminClient();
    const parts = pathParts(new URL(request.url).pathname);
    const method = request.method;

    // One-time bridge for the legacy username/password accounts. The password
    // hash is copied server-side into Supabase Auth; the plaintext password is
    // never sent to this endpoint and is verified only by Supabase Auth.
    if (
      method === "POST" && parts[0] === "auth" &&
      parts[1] === "prepare-legacy-login"
    ) {
      return json(await prepareLegacyAdminLogin(supabase, request));
    }

    const user = await getAuthenticatedUser(supabase, request);
    requireAdmin(user);

    if (method === "GET" && parts[0] === "auth" && parts[1] === "me") {
      return json(mapUser({
        id: user.id,
        email: user.email,
        user_metadata: user.metadata,
        app_metadata: user.appMetadata,
      }));
    }

    if (method === "PUT" && parts[0] === "auth" && parts[1] === "profile") {
      const body = await requestJson(request);
      const update: Record<string, unknown> = {
        user_metadata: {
          ...user.metadata,
          username: body.username
            ? requireText(body.username, "Gebruikersnaam", 100)
            : user.metadata.username,
          avatar_url: String(body.avatar_url || "").slice(0, 1000),
        },
      };
      if (body.email) update.email = requireText(body.email, "E-mailadres", 320).toLowerCase();
      if (body.password) update.password = requireText(body.password, "Wachtwoord", 256);
      const { data, error } = await supabase.auth.admin.updateUserById(user.id, update);
      if (error) throw new ApiError(400, error.message);
      await audit(supabase, user, "profile_updated");
      return json(mapUser(data.user));
    }

    if (method === "GET" && parts[0] === "projects" && parts.length === 1) return json(await listProjects(supabase));
    if (method === "POST" && parts[0] === "projects" && parts.length === 1) {
      const body = await requestJson(request);
      const code = String(body.code || "").trim().toUpperCase().slice(0, 100) || null;
      const { data, error } = await supabase.from("projects").insert({
        name: requireText(body.name, "Projectnaam"), code, description: String(body.description || "").slice(0, 5000),
        status: String(body.status || "actief").slice(0, 60),
      }).select("id, name, code, description, status, created_at").single();
      if (error) throw error;
      await audit(supabase, user, "project_created", { name: data.name }, String(data.id));
      return json({ ...data, file_count: 0, total_size: 0, updated_at: data.created_at }, 201);
    }
    if (method === "GET" && parts[0] === "projects" && parts.length === 2) return json(await getProject(supabase, parts[1]));
    if (method === "GET" && parts[0] === "projects" && parts[2] === "files") return json(await listProjectFiles(supabase, parts[1]));
    if (method === "PATCH" && parts[0] === "projects" && parts[2] === "status") {
      const body = await requestJson(request); const status = requireText(body.status, "Status", 60);
      const { data, error } = await supabase.from("projects").update({ status }).eq("id", parts[1]).select("id, name, code, description, status, created_at").single();
      if (error) throw error;
      await audit(supabase, user, "project_status_updated", { status }, parts[1]); return json(data);
    }
    if (method === "DELETE" && parts[0] === "projects" && parts.length === 2) {
      await getProject(supabase, parts[1]); await deleteProject(supabase, parts[1]); await audit(supabase, user, "project_deleted", {}, parts[1]); return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (method === "POST" && parts[0] === "upload" && parts[1] === "ticket") {
      const body = await requestJson(request); const projectId = requireText(body.projectId, "Project ID", 100);
      await getProject(supabase, projectId);
      const fileName = safeFileName(body.fileName);
      const { data: existing, error: existingError } = await supabase.from("files").select("id, path").eq("project_id", projectId).eq("filename", fileName).maybeSingle();
      if (existingError) throw existingError;
      const fileId = existing?.id || crypto.randomUUID(); const storagePath = existing?.path || `${projectId}/${fileId}_${fileName}`;
      const { data, error } = await supabase.storage.from(IFC_BUCKET).createSignedUploadUrl(storagePath, { upsert: true });
      if (error || !data) throw new ApiError(500, error?.message || "Kon uploadlink niet genereren.");
      return json({ fileId, uploadUrl: data.signedUrl, storagePath });
    }
    if (method === "POST" && parts[0] === "upload" && parts[1] === "confirm") {
      const body = await requestJson(request); const projectId = requireText(body.projectId, "Project ID", 100); await getProject(supabase, projectId);
      const fileId = requireText(body.fileId, "Bestand ID", 100); const fileName = safeFileName(body.fileName); const storagePath = requireText(body.storagePath, "Opslagpad", 1000);
      const size = Math.max(0, Number(body.fileSize || 0)); const now = new Date().toISOString();
      const { error } = await supabase.from("files").upsert({ id: fileId, project_id: projectId, filename: fileName, path: storagePath, size, storage_bucket: IFC_BUCKET, uploaded_at: now }, { onConflict: "id" });
      if (error) throw error;
      await audit(supabase, user, "file_uploaded", { fileName, fileSize: size }, projectId); return json({ status: "ok", fileId });
    }

    if (method === "GET" && parts[0] === "files" && parts[2] === "signed-url") {
      const { data: file, error } = await supabase.from("files").select("filename, path, storage_bucket").eq("id", parts[1]).maybeSingle();
      if (error) throw error; if (!file) throw new ApiError(404, "Bestand niet gevonden.");
      const { data, error: signedError } = await supabase.storage.from(file.storage_bucket || IFC_BUCKET).createSignedUrl(file.path, 60);
      if (signedError || !data) throw new ApiError(500, signedError?.message || "Kon downloadlink niet genereren."); return json({ url: data.signedUrl, filename: file.filename });
    }
    if (method === "DELETE" && parts[0] === "files" && parts.length === 2) {
      const { data: file, error } = await supabase.from("files").select("project_id, path, storage_bucket, filename").eq("id", parts[1]).maybeSingle();
      if (error) throw error; if (!file) throw new ApiError(404, "Bestand niet gevonden.");
      const { error: storageError } = await supabase.storage.from(file.storage_bucket || IFC_BUCKET).remove([file.path]); if (storageError) throw storageError;
      const { error: deleteError } = await supabase.from("files").delete().eq("id", parts[1]); if (deleteError) throw deleteError;
      await audit(supabase, user, "file_deleted", { fileName: file.filename }, String(file.project_id)); return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (method === "GET" && parts[0] === "users" && parts.length === 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }); if (error) throw error; return json(data.users.map(mapUser));
    }
    if (method === "POST" && parts[0] === "users" && parts.length === 1) {
      const body = await requestJson(request);
      const username = requireText(body.username || body.email, "Gebruikersnaam of e-mailadres", 320);
      const email = username.includes("@")
        ? username.toLowerCase()
        : legacyAdminEmail(username);
      const password = requireText(body.password, "Wachtwoord", 256); if (password.length < 8) throw new ApiError(400, "Het wachtwoord moet minimaal 8 tekens bevatten.");
      const role = String(body.role || "user").slice(0, 50);
      const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role }, user_metadata: { username } });
      if (error || !data.user) throw new ApiError(400, error?.message || "Gebruiker kon niet worden aangemaakt."); await audit(supabase, user, "user_created", { email }); return json(mapUser(data.user), 201);
    }
    if (method === "DELETE" && parts[0] === "users" && parts.length === 2) {
      if (parts[1] === user.id) throw new ApiError(400, "Je kunt je eigen account niet verwijderen.");
      const { error } = await supabase.auth.admin.deleteUser(parts[1]); if (error) throw new ApiError(400, error.message); await audit(supabase, user, "user_deleted", { userId: parts[1] }); return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (method === "PATCH" && parts[0] === "users" && parts[2] === "role") {
      const body = await requestJson(request); const role = requireText(body.role, "Rol", 50);
      const { data: target, error: targetError } = await supabase.auth.admin.getUserById(parts[1]); if (targetError || !target.user) throw new ApiError(404, "Gebruiker niet gevonden.");
      const { data, error } = await supabase.auth.admin.updateUserById(parts[1], { app_metadata: { ...(target.user.app_metadata || {}), role } }); if (error) throw new ApiError(400, error.message); await audit(supabase, user, "user_role_updated", { userId: parts[1], role }); return json(mapUser(data.user));
    }
    if (method === "PATCH" && parts[0] === "users" && parts[2] === "disabled") {
      const body = await requestJson(request); const disabled = Boolean(body.disabled); if (parts[1] === user.id && disabled) throw new ApiError(400, "Je kunt je eigen account niet blokkeren.");
      const { data, error } = await supabase.auth.admin.updateUserById(parts[1], { ban_duration: disabled ? "876000h" : "none" }); if (error) throw new ApiError(400, error.message); await audit(supabase, user, "user_disabled_updated", { userId: parts[1], disabled }); return json(mapUser(data.user));
    }
    if (method === "PATCH" && parts[0] === "users" && parts[2] === "reset-password") {
      const body = await requestJson(request); const password = requireText(body.password, "Wachtwoord", 256); if (password.length < 8) throw new ApiError(400, "Het wachtwoord moet minimaal 8 tekens bevatten.");
      const { error } = await supabase.auth.admin.updateUserById(parts[1], { password }); if (error) throw new ApiError(400, error.message); await audit(supabase, user, "user_password_reset", { userId: parts[1] }); return json({ ok: true });
    }

    if (method === "GET" && parts[0] === "statistics" && parts.length === 1) {
      const [projects, files, qr] = await Promise.all([
        supabase.from("projects").select("id, status", { count: "exact", head: false }),
        supabase.from("files").select("size"),
        supabase.from("qr_assets").select("id", { count: "exact", head: true }),
      ]);
      if (projects.error || files.error || qr.error) throw projects.error || files.error || qr.error;
      return json({ total_projects: projects.count || 0, active_projects: (projects.data || []).filter((p: any) => ["actief", "active", "in-uitvoering"].includes(p.status)).length, total_files: files.data?.length || 0, total_storage: (files.data || []).reduce((sum: number, file: any) => sum + Number(file.size || 0), 0), total_qr_codes: qr.count || 0 });
    }
    if (method === "GET" && parts[0] === "statistics" && parts[1] === "detailed") {
      const value = Number(new URL(request.url).searchParams.get("days") || 30); return json(await detailedStatistics(supabase, Number.isFinite(value) ? Math.min(Math.max(value, 1), 366) : 30));
    }
    if (method === "POST" && parts[0] === "statistics" && parts[1] === "reset") {
      const { error } = await supabase.from("revit_audit_log").delete().gte("occurred_at", "1970-01-01T00:00:00.000Z"); if (error) throw error; return json({ success: true });
    }
    if (method === "GET" && parts[0] === "activity") {
      const value = Number(new URL(request.url).searchParams.get("limit") || 20); const limit = Number.isFinite(value) ? Math.min(Math.max(value, 1), 100) : 20;
      const { data, error } = await supabase.from("revit_audit_log").select("id, user_email, action, detail, occurred_at").order("occurred_at", { ascending: false }).limit(limit); if (error) throw error;
      return json((data || []).map((entry: any) => ({ id: entry.id, user_name: entry.user_email || "Onbekend", type: entry.action, details: JSON.stringify(entry.detail || {}), timestamp: entry.occurred_at })));
    }
    return json({ error: "Endpoint niet gevonden." }, 404);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    console.error("admin-api fout", error);
    return json({ error: "De beheeractie kon niet worden verwerkt." }, 500);
  }
});
