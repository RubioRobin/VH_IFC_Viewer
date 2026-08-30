-- Remove permissive policies left by the original prototype. All privileged
-- reads and writes now go through authenticated Edge Functions using the
-- service-role client; the public viewer resolves capability tokens there too.
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.files enable row level security;
alter table public.activity enable row level security;
alter table public.qr_codes enable row level security;
alter table public.shares enable row level security;

drop policy if exists "Public Users Access" on public.users;
drop policy if exists "Public Projects Access" on public.projects;
drop policy if exists "Public Files Access" on public.files;
drop policy if exists "Public Activity Access" on public.activity;
drop policy if exists "Public QR Access" on public.qr_codes;
drop policy if exists "Public read access on shares via share_id" on public.shares;

revoke all on table public.users, public.projects, public.files,
  public.activity, public.qr_codes, public.shares from public, anon, authenticated;

grant all privileges on table public.users, public.projects, public.files,
  public.activity, public.qr_codes, public.shares to service_role;
