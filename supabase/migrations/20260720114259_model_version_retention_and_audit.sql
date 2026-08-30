-- A model always has one published/current IFC. Older versions remain recoverable
-- for seven days, while existing QR/share capabilities are moved to the new version.
alter table public.model_versions
    add column if not exists is_current boolean not null default false,
    add column if not exists retained_until timestamptz;

with ranked_versions as (
    select id,
           row_number() over (
               partition by model_id
               order by coalesce(completed_at, uploaded_at, created_at) desc, created_at desc
           ) as rank
    from public.model_versions
    where upload_status = 'uploaded'
)
update public.model_versions as version
set is_current = ranked_versions.rank = 1
from ranked_versions
where version.id = ranked_versions.id;

create unique index if not exists uq_model_versions_one_current_per_model
    on public.model_versions(model_id)
    where is_current;

create index if not exists idx_model_versions_retained_until
    on public.model_versions(retained_until)
    where retained_until is not null;

-- Keep the publish switch atomic. A partially completed client request can
-- never leave a share/QR pointing to a deleted or non-current IFC.
create or replace function public.publish_model_version(
    p_model_id uuid,
    p_version_id uuid,
    p_retained_until timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    if not exists (
        select 1
        from public.model_versions
        where id = p_version_id
          and model_id = p_model_id
          and upload_status = 'uploaded'
    ) then
        raise exception 'Modelversie is niet upload-klaar of hoort niet bij dit model.';
    end if;

    update public.shares
    set model_version_id = p_version_id
    where model_version_id in (
        select id from public.model_versions
        where model_id = p_model_id and id <> p_version_id
    );

    update public.qr_assets
    set model_version_id = p_version_id
    where model_version_id in (
        select id from public.model_versions
        where model_id = p_model_id and id <> p_version_id
    );

    update public.model_versions
    set is_current = false,
        retained_until = p_retained_until
    where model_id = p_model_id
      and id <> p_version_id;

    update public.model_versions
    set is_current = true,
        retained_until = null
    where id = p_version_id;
end;
$$;

revoke all on function public.publish_model_version(uuid, uuid, timestamptz)
    from public, anon, authenticated;
grant execute on function public.publish_model_version(uuid, uuid, timestamptz)
    to service_role;

create table if not exists public.revit_audit_log (
    id bigint generated always as identity primary key,
    occurred_at timestamptz not null default now(),
    user_id uuid,
    user_email text not null,
    action text not null,
    project_id text,
    model_id uuid,
    model_version_id uuid,
    detail jsonb not null default '{}'::jsonb
);

create index if not exists idx_revit_audit_log_occurred_at
    on public.revit_audit_log(occurred_at desc);
create index if not exists idx_revit_audit_log_project_id
    on public.revit_audit_log(project_id);

alter table public.revit_audit_log enable row level security;
revoke all on table public.revit_audit_log from public, anon, authenticated;
grant all privileges on table public.revit_audit_log to service_role;
grant usage, select on sequence public.revit_audit_log_id_seq to service_role;
