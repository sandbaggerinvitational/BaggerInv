-- Preview Guide observability follow-up. Participant delivery continues to use
-- the last verified immutable projection; this only prevents Director status
-- from reporting CURRENT after two missed five-minute synchronization windows.

create or replace function public.read_preview_guide_sync_status(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament constant text := '2026';
  target_project constant text := 'idgigvjjqkfbqjeredpb';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  current_value jsonb;
  last_attempt_value jsonb;
  last_success_value jsonb;
  last_verified_value timestamptz;
  state_value text;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> target_project
     or btrim(coalesce(input->>'tournament_id', '')) <> target_tournament
     or source_workbook = '' or source_workbook = production_workbook then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_STATUS_CONTEXT_INVALID');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = target_tournament and t.tournament_year = 2026
      and t.source_workbook_id = source_workbook
  ) then return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SOURCE_MISMATCH'); end if;

  select jsonb_build_object(
    'revision_id', r.revision_id,
    'projection_revision', r.projection_revision,
    'publication_sequence', p.publication_sequence,
    'content_fingerprint', r.content_fingerprint,
    'payload_hash', r.payload_hash,
    'published_at', p.published_at,
    'last_verified_at', p.last_verified_at
  ), p.last_verified_at into current_value, last_verified_value
  from scoring_authority.guide_projection_current p
  join scoring_authority.guide_content_revisions r
    on r.tournament_id = p.tournament_id
    and r.source_workbook_id = p.source_workbook_id
    and r.revision_id = p.revision_id
  where p.tournament_id = target_tournament
    and p.source_workbook_id = source_workbook;

  select jsonb_build_object(
    'attempt_sequence', r.attempt_sequence,
    'trigger_type', r.trigger_type,
    'status', r.status,
    'started_at', r.started_at,
    'completed_at', r.completed_at,
    'changed', r.changed,
    'validation_status', r.validation_status,
    'source_workbook_fingerprint', r.source_workbook_fingerprint,
    'failure_category', r.failure_category
  ) into last_attempt_value
  from scoring_authority.guide_sync_runs r
  where r.tournament_id = target_tournament and r.source_workbook_id = source_workbook
  order by r.attempt_sequence desc limit 1;

  select jsonb_build_object(
    'attempt_sequence', r.attempt_sequence,
    'trigger_type', r.trigger_type,
    'status', r.status,
    'completed_at', r.completed_at,
    'changed', r.changed
  ) into last_success_value
  from scoring_authority.guide_sync_runs r
  where r.tournament_id = target_tournament
    and r.source_workbook_id = source_workbook
    and r.status in ('SUCCEEDED', 'NOOP')
  order by r.attempt_sequence desc limit 1;

  state_value := case
    when current_value is null then 'UNPUBLISHED'
    when coalesce(last_attempt_value->>'status', '') in ('FAILED', 'REJECTED') then 'FAILED_REFRESH'
    when coalesce(last_attempt_value->>'status', '') = 'CLAIMED'
      and coalesce((last_attempt_value->>'started_at')::timestamptz, now()) >= now() - interval '10 minutes'
      then 'SYNCING'
    when last_verified_value is null or last_verified_value < now() - interval '10 minutes' then 'STALE'
    else 'CURRENT'
  end;

  return jsonb_build_object(
    'ok', true,
    'tournament_id', target_tournament,
    'current', current_value,
    'last_attempt', last_attempt_value,
    'last_success', last_success_value,
    'state', state_value,
    'stale', state_value = 'STALE',
    'stale_after_seconds', 600,
    'last_known_good_available', current_value is not null
  );
end;
$$;

revoke all on function public.read_preview_guide_sync_status(jsonb) from public, anon, authenticated;
grant execute on function public.read_preview_guide_sync_status(jsonb) to service_role;

notify pgrst, 'reload schema';
