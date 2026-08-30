-- Canonical, non-destructive schema for the direct Revit -> Supabase flow.
--
-- This migration intentionally does not reuse backend/migrations/001_revit_workflow.sql:
-- that legacy migration drops existing tables. The definitions below also upgrade
-- installations that previously used the incompatible `revisions` schema.

create extension if not exists pgcrypto;

-- Projects and users are retained for compatibility with the existing Revit UI.
create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    code text,
    description text not null default '',
    status text not null default 'actief',
    created_at timestamptz not null default now()
);

alter table public.projects add column if not exists code text;
alter table public.projects add column if not exists description text not null default '';
alter table public.projects add column if not exists status text not null default 'actief';
alter table public.projects add column if not exists created_at timestamptz not null default now();

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    username text not null unique,
    password_hash text,
    role text not null default 'user',
    disabled boolean not null default false,
    created_at timestamptz not null default now()
);

alter table public.users add column if not exists password_hash text;
alter table public.users add column if not exists role text not null default 'user';
alter table public.users add column if not exists disabled boolean not null default false;
alter table public.users add column if not exists created_at timestamptz not null default now();

-- project_id deliberately remains text in these integration tables. Existing
-- deployments have used both UUID and text project IDs; the Edge Function first
-- validates the project and stores its canonical string representation.
create table if not exists public.files (
    id uuid primary key default gen_random_uuid(),
    project_id text not null,
    filename text not null,
    path text not null,
    size bigint,
    storage_bucket text not null default 'ifc-models',
    model_version_id uuid,
    created_at timestamptz not null default now(),
    uploaded_at timestamptz not null default now()
);

alter table public.files add column if not exists filename text;
alter table public.files add column if not exists path text;
alter table public.files add column if not exists size bigint;
alter table public.files add column if not exists storage_bucket text;
alter table public.files add column if not exists model_version_id uuid;
alter table public.files add column if not exists created_at timestamptz not null default now();
alter table public.files add column if not exists uploaded_at timestamptz not null default now();

-- Files that existed before this direct flow were written by the legacy service
-- to `ifc-private`. New Revit exports explicitly write `ifc-models`.
update public.files as file
set storage_bucket = 'ifc-private'
where exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'ifc-private'
      and object.name = file.path
);

update public.files
set storage_bucket = 'ifc-private'
where storage_bucket is null;

alter table public.files alter column storage_bucket set default 'ifc-models';

create table if not exists public.models (
    id uuid primary key default gen_random_uuid(),
    project_id text not null,
    name text not null,
    created_by text not null default 'Revit',
    created_at timestamptz not null default now()
);

alter table public.models add column if not exists created_by text not null default 'Revit';
alter table public.models add column if not exists created_at timestamptz not null default now();

create table if not exists public.model_versions (
    id uuid primary key default gen_random_uuid(),
    model_id uuid not null references public.models(id) on delete cascade,
    storage_path_ifc text not null,
    storage_bucket text not null default 'ifc-models',
    file_name text not null default 'model.ifc',
    file_size bigint,
    checksum_sha256 text,
    source_file_id text,
    legacy_revision_id uuid,
    upload_status text not null default 'pending'
        check (upload_status in ('pending', 'uploaded', 'failed')),
    created_at timestamptz not null default now(),
    uploaded_at timestamptz,
    completed_at timestamptz
);

-- Do not add a non-null default here. Existing rows predate this direct flow
-- and were stored in ifc-private; a default would silently make their links
-- point at the wrong bucket.
alter table public.model_versions add column if not exists storage_bucket text;
alter table public.model_versions add column if not exists file_name text not null default 'model.ifc';
alter table public.model_versions add column if not exists file_size bigint;
alter table public.model_versions add column if not exists checksum_sha256 text;
alter table public.model_versions add column if not exists source_file_id text;
alter table public.model_versions add column if not exists legacy_revision_id uuid;
alter table public.model_versions add column if not exists upload_status text not null default 'pending';
alter table public.model_versions add column if not exists created_at timestamptz not null default now();
alter table public.model_versions add column if not exists uploaded_at timestamptz;
alter table public.model_versions add column if not exists completed_at timestamptz;

-- Repair an installation where an earlier draft of this migration already
-- assigned ifc-models to legacy rows. Storage is the source of truth here.
update public.model_versions as version
set storage_bucket = 'ifc-private'
where exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'ifc-private'
      and object.name = version.storage_path_ifc
);

update public.model_versions
set storage_bucket = 'ifc-private'
where storage_bucket is null;

alter table public.model_versions alter column storage_bucket set default 'ifc-models';
alter table public.model_versions alter column storage_bucket set not null;

-- Older model_versions predate upload_status. Preserve those IFCs as shareable
-- only when Storage proves that the referenced object still exists.
update public.model_versions as version
set upload_status = 'uploaded',
    uploaded_at = coalesce(version.uploaded_at, version.created_at),
    completed_at = coalesce(version.completed_at, version.uploaded_at, version.created_at)
where version.upload_status = 'pending'
  and exists (
      select 1
      from storage.objects as object
      where object.bucket_id = version.storage_bucket
        and object.name = version.storage_path_ifc
  );

create table if not exists public.shares (
    id uuid primary key default gen_random_uuid(),
    model_version_id uuid references public.model_versions(id) on delete cascade,
    token text,
    is_active boolean not null default true,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    last_accessed_at timestamptz
);

alter table public.shares add column if not exists model_version_id uuid references public.model_versions(id) on delete cascade;
alter table public.shares add column if not exists token text;
alter table public.shares add column if not exists is_active boolean not null default true;
alter table public.shares add column if not exists expires_at timestamptz;
alter table public.shares add column if not exists created_at timestamptz not null default now();
alter table public.shares add column if not exists last_accessed_at timestamptz;

-- Upgrade the older revisions/share_id workflow without dropping historical
-- data. Dynamic SQL keeps a new direct-only project independent of the
-- obsolete revisions table.
do $$
begin
    if to_regclass('public.revisions') is not null then
        execute $legacy$
            insert into public.model_versions (
                model_id, storage_path_ifc, storage_bucket, file_name, file_size,
                checksum_sha256, legacy_revision_id, upload_status,
                created_at, uploaded_at, completed_at
            )
            select
                revision.model_id,
                revision.storage_path,
                'ifc-private',
                revision.file_name,
                revision.file_size,
                revision.sha256,
                revision.id,
                case revision.status
                    when 'uploaded' then 'uploaded'
                    when 'processing' then 'uploaded'
                    when 'ready' then 'uploaded'
                    when 'failed' then 'failed'
                    else 'pending'
                end,
                coalesce(revision.created_at, now()),
                revision.uploaded_at,
                revision.completed_at
            from public.revisions as revision
            where not exists (
                select 1
                from public.model_versions as version
                where version.legacy_revision_id = revision.id
            )
        $legacy$;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'shares' and column_name = 'revision_id'
    ) and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'shares' and column_name = 'share_id'
    ) then
        execute $legacy$
            update public.shares as share
            set model_version_id = version.id,
                token = coalesce(share.token, share.share_id),
                is_active = coalesce(share.is_active, true)
            from public.model_versions as version
            where share.revision_id = version.legacy_revision_id
        $legacy$;

        execute 'alter table public.shares alter column revision_id drop not null';
        execute 'alter table public.shares alter column share_id drop not null';
    end if;
end $$;

-- An older shares table could already contain a nullable is_active column.
-- Normalise it before enforcing the direct viewer contract, where only an
-- explicit false revokes a share capability.
update public.shares
set is_active = true
where is_active is null;

alter table public.shares alter column is_active set default true;
alter table public.shares alter column is_active set not null;

create table if not exists public.qr_assets (
    id uuid primary key default gen_random_uuid(),
    project_id text not null,
    model_version_id uuid not null references public.model_versions(id) on delete cascade,
    storage_path_png text not null,
    created_at timestamptz not null default now()
);

alter table public.qr_assets add column if not exists project_id text;
alter table public.qr_assets add column if not exists model_version_id uuid references public.model_versions(id) on delete cascade;
alter table public.qr_assets add column if not exists storage_path_png text;
alter table public.qr_assets add column if not exists created_at timestamptz not null default now();

create index if not exists idx_projects_code on public.projects(code);
create index if not exists idx_files_project_id on public.files(project_id);
create index if not exists idx_files_model_version_id on public.files(model_version_id);
create index if not exists idx_models_project_id on public.models(project_id);
create index if not exists idx_model_versions_model_id on public.model_versions(model_id);
create index if not exists idx_model_versions_source_file_id on public.model_versions(source_file_id);
create index if not exists idx_model_versions_upload_status on public.model_versions(upload_status);
create unique index if not exists uq_model_versions_legacy_revision_id
    on public.model_versions(legacy_revision_id) where legacy_revision_id is not null;
create unique index if not exists uq_shares_token_not_null on public.shares(token) where token is not null;
create index if not exists idx_shares_model_version_id on public.shares(model_version_id);
create index if not exists idx_qr_assets_model_version_id on public.qr_assets(model_version_id);

-- The Data API should not expose BIM metadata or password hashes. Edge Functions
-- use the server-side secret key, so only service_role needs table privileges.
alter table public.projects enable row level security;
alter table public.users enable row level security;
alter table public.files enable row level security;
alter table public.models enable row level security;
alter table public.model_versions enable row level security;
alter table public.shares enable row level security;
alter table public.qr_assets enable row level security;

-- A legacy migration granted anonymous reads on shares. The public capability
-- is now resolved solely by viewer-link using the server-side key.
drop policy if exists "Public read access on shares via share_id" on public.shares;

revoke all on table public.projects, public.users, public.files, public.models,
    public.model_versions, public.shares, public.qr_assets from anon, authenticated;
revoke all on table public.projects, public.users, public.files, public.models,
    public.model_versions, public.shares, public.qr_assets from public;
grant usage on schema public to service_role;
grant all privileges on table public.projects, public.users, public.files, public.models,
    public.model_versions, public.shares, public.qr_assets to service_role;
grant usage, select on all sequences in schema public to service_role;
