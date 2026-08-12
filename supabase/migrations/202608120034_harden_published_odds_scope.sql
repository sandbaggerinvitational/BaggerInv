-- Never resolve public published Odds from an arbitrary tournament sharing a workbook.
-- The participant path supplies an exact tournament_id. The public recovery path may
-- resolve a workbook only when it has exactly one verified current publication.

create or replace function public.read_published_odds_view(target_tournament_id text default null, target_source_workbook_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  resolved_tournament scoring_authority.tournaments%rowtype;
  snapshot_value jsonb;
  history_count integer;
  published_tournament_count integer;
begin
  if btrim(coalesce(target_tournament_id, '')) <> '' then
    select * into resolved_tournament from scoring_authority.tournaments t
    where t.tournament_id = btrim(target_tournament_id)
      and (btrim(coalesce(target_source_workbook_id, '')) = '' or t.source_workbook_id = btrim(target_source_workbook_id));
  elsif btrim(coalesce(target_source_workbook_id, '')) <> '' then
    select count(distinct t.tournament_id) into published_tournament_count
    from scoring_authority.tournaments t
    join scoring_authority.odds_published_snapshots s on s.tournament_id = t.tournament_id
    where t.source_workbook_id = btrim(target_source_workbook_id)
      and s.is_current_official and s.publication_verified;
    if published_tournament_count <> 1 then
      return jsonb_build_object('ok', false,
        'code', case when published_tournament_count = 0 then 'PUBLISHED_ODDS_TOURNAMENT_NOT_FOUND'
          else 'PUBLISHED_ODDS_TOURNAMENT_AMBIGUOUS' end);
    end if;
    select t.* into resolved_tournament
    from scoring_authority.tournaments t
    join scoring_authority.odds_published_snapshots s on s.tournament_id = t.tournament_id
    where t.source_workbook_id = btrim(target_source_workbook_id)
      and s.is_current_official and s.publication_verified;
  else return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_SCOPE_REQUIRED'); end if;
  if resolved_tournament.tournament_id is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'milestone', s.milestone, 'phase_order', s.phase_order,
    'publication_revision', s.publication_revision, 'published_at', s.published_at,
    'payload', s.published_payload, 'payload_hash', s.payload_hash,
    'source_fingerprint', s.source_fingerprint, 'engine_version', s.engine_version,
    'engine_metadata', s.engine_metadata, 'google_publication_fingerprint', s.google_publication_fingerprint,
    'is_current_official', s.is_current_official, 'publication_verified', s.publication_verified,
    'imported_at', s.imported_at
  ) order by s.phase_order), '[]'::jsonb), count(*) into snapshot_value, history_count
  from scoring_authority.odds_published_snapshots s
  where s.tournament_id = resolved_tournament.tournament_id and s.is_current_for_milestone and s.publication_verified;
  return jsonb_build_object('ok', true,
    'data', jsonb_build_object('tournament', to_jsonb(resolved_tournament), 'snapshots', snapshot_value,
      'history_count', history_count, 'query_ms', extract(epoch from (clock_timestamp() - started_at)) * 1000));
end;
$$;

revoke all on function public.read_published_odds_view(text, text) from public, anon, authenticated;
grant execute on function public.read_published_odds_view(text, text) to service_role;
