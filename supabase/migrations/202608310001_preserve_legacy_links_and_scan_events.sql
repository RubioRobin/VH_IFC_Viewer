-- A legacy file may be linked only once, even when two QR requests race.
do $$
begin
    if exists (
        select 1 from public.model_versions
        where source_file_id is not null
        group by source_file_id having count(*) > 1
    ) then
        raise exception 'Dubbele modelversies per bronbestand moeten eerst worden opgelost.'
            using errcode = '23505';
    end if;
end;
$$;

create unique index if not exists uq_model_versions_source_file_id
    on public.model_versions(source_file_id);

create index if not exists idx_revit_audit_log_action_occurred_at
    on public.revit_audit_log(action, occurred_at desc);

-- Some original dashboard installations created public_links outside the
-- migration history. Preserve those printed UUID capabilities, but resolve
-- them only through viewer-link with the server-side role.
do $$
declare
    existing_policy text;
begin
    if to_regclass('public.public_links') is not null then
        execute 'alter table public.public_links enable row level security';
        for existing_policy in
            select policyname from pg_policies
            where schemaname = 'public' and tablename = 'public_links'
        loop
            execute format(
                'drop policy if exists %I on public.public_links',
                existing_policy
            );
        end loop;
        execute 'revoke all on table public.public_links from public, anon, authenticated';
        execute 'grant all privileges on table public.public_links to service_role';
    end if;
end;
$$;
