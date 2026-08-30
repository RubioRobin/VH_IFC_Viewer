-- Revit -> Supabase direct workflow.
-- IFC files remain private; only Edge Functions with the service role create
-- short-lived upload and download URLs. No client receives a service-role key.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ifc-models',
  'ifc-models',
  false,
  5368709120,
  array['application/octet-stream', 'application/x-step', 'application/ifc']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Retained for IFCs written by the former backend. The direct route always
-- writes new exports to ifc-models, but Link QR can still expose old records
-- through a signed URL without making the bucket public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ifc-private',
  'ifc-private',
  false,
  5368709120,
  array['application/octet-stream', 'application/x-step', 'application/ifc']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qr-public',
  'qr-public',
  true,
  5242880,
  array['image/png']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Existing tables are accessed only by Edge Functions (service role). RLS keeps
-- the Data API closed to anon/authenticated clients by default.
alter table if exists public.models enable row level security;
alter table if exists public.model_versions enable row level security;
alter table if exists public.shares enable row level security;
alter table if exists public.qr_assets enable row level security;

-- Share lookup is deliberately performed by viewer-link, which checks that the
-- share is active and returns only a 15-minute Storage signed URL.
