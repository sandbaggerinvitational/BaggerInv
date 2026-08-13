create or replace function public.complete_preview_championship_odds_google_mirror(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare target_snapshot uuid:=(input->>'snapshot_id')::uuid; target_status text:=upper(btrim(coalesce(input->>'status',''))); changed integer:=0;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED'); end if;
  if target_snapshot is null or target_status not in ('SUCCEEDED','FAILED') then return jsonb_build_object('ok',false,'code','COMPLETE_GOOGLE_MIRROR_RESULT_REQUIRED'); end if;
  update scoring_authority.odds_google_mirror_jobs set status=target_status,attempt_count=attempt_count+1,
    last_error_safe=case when target_status='FAILED' then left(btrim(coalesce(input->>'error_safe','Google reporting mirror is delayed.')),400) else null end,updated_at=now()
  where snapshot_id=target_snapshot;
  get diagnostics changed=row_count;
  if changed<>1 then return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_JOB_NOT_FOUND'); end if;
  update scoring_authority.odds_published_snapshots set mirror_status=target_status,
    google_publication_fingerprint=case when target_status='SUCCEEDED' then input->>'google_publication_fingerprint' else google_publication_fingerprint end,
    google_publication_reference=case when target_status='SUCCEEDED' then coalesce(input->'google_publication_reference','{}'::jsonb) else google_publication_reference end
  where id=target_snapshot;
  return jsonb_build_object('ok',true,'snapshot_id',target_snapshot,'status',target_status);
end; $$;
revoke all on function public.complete_preview_championship_odds_google_mirror(jsonb) from public,anon,authenticated;
grant execute on function public.complete_preview_championship_odds_google_mirror(jsonb) to service_role;
notify pgrst,'reload schema';
