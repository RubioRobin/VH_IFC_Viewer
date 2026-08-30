-- Project numbers and model names are routing identities. Generated normalized
-- columns let PostgREST target ordinary unique indexes for atomic upserts.
-- Production was checked before this migration: no duplicate identity groups.
alter table public.projects
    add column if not exists code_normalized text
    generated always as (nullif(upper(btrim(code)), '')) stored;

alter table public.models
    add column if not exists name_normalized text
    generated always as (
        lower(btrim(regexp_replace(btrim(name), '\.ifc$', '', 'i')))
    ) stored;

do $$
begin
    if exists (
        select 1 from public.projects
        where code_normalized is not null
        group by code_normalized having count(*) > 1
    ) then
        raise exception 'Dubbele genormaliseerde projectcodes moeten eerst worden opgelost.'
            using errcode = '23505';
    end if;

    if exists (
        select 1 from public.models
        group by project_id, name_normalized having count(*) > 1
    ) then
        raise exception 'Dubbele modelidentiteiten moeten eerst worden opgelost.'
            using errcode = '23505';
    end if;
end;
$$;

create unique index if not exists uq_projects_code_normalized
    on public.projects(code_normalized);
create unique index if not exists uq_models_project_name_normalized
    on public.models(project_id, name_normalized);
