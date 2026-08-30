-- Publishing a later version must not restart the retention clock of versions
-- that were already superseded. Storage cleanup is performed by the scheduled
-- retention-cleanup Edge Function after this immutable deadline expires.
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
        retained_until = coalesce(retained_until, p_retained_until)
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
