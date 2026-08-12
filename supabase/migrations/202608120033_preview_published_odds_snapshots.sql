-- Preview-only operational projection of already-published Championship Odds.
-- Google remains the Director publication source of record. No calculation lives here.

create table scoring_authority.odds_snapshot_import_runs (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  source_workbook_id text not null,
  import_fingerprint text not null check (import_fingerprint ~ '^[0-9a-f]{64}$'),
  current_official_milestone text not null,
  status text not null check (status in ('APPLIED', 'NO_CHANGE')),
  snapshot_count integer not null check (snapshot_count >= 0),
  requested_by text not null,
  imported_at timestamptz not null default now()
);

create index odds_snapshot_import_runs_scope_idx
  on scoring_authority.odds_snapshot_import_runs (tournament_id, imported_at desc);

create table scoring_authority.odds_published_snapshots (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  milestone text not null check (milestone in ('Pre-Tournament', 'After Round 1', 'After Round 2', 'Round 3 Pairings Announced', 'Final Results')),
  phase_order integer not null check (phase_order between 0 and 4),
  publication_revision bigint not null check (publication_revision > 0),
  published_at timestamptz not null,
  published_payload jsonb not null check (jsonb_typeof(published_payload) = 'object'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  source_fingerprint text,
  engine_version text,
  engine_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(engine_metadata) = 'object'),
  google_publication_fingerprint text not null check (google_publication_fingerprint ~ '^[0-9a-f]{64}$'),
  google_publication_reference jsonb not null default '{}'::jsonb check (jsonb_typeof(google_publication_reference) = 'object'),
  is_current_for_milestone boolean not null default true,
  is_current_official boolean not null default false,
  publication_verified boolean not null default true,
  imported_by text not null,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tournament_id, milestone, published_at, payload_hash)
);

create unique index odds_published_current_milestone_idx
  on scoring_authority.odds_published_snapshots (tournament_id, milestone)
  where is_current_for_milestone;

create unique index odds_published_current_official_idx
  on scoring_authority.odds_published_snapshots (tournament_id)
  where is_current_official;

create index odds_published_history_idx
  on scoring_authority.odds_published_snapshots (tournament_id, phase_order, publication_revision desc, published_at desc);

alter table scoring_authority.odds_snapshot_import_runs enable row level security;
alter table scoring_authority.odds_published_snapshots enable row level security;
revoke all on scoring_authority.odds_snapshot_import_runs from public, anon, authenticated;
revoke all on scoring_authority.odds_published_snapshots from public, anon, authenticated;
grant select, insert on scoring_authority.odds_snapshot_import_runs to service_role;
grant select, insert, update on scoring_authority.odds_published_snapshots to service_role;

create or replace function public.replace_preview_published_odds_snapshots(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  actor text := btrim(coalesce(input->>'requested_by', ''));
  current_phase text := btrim(coalesce(input->>'current_official_milestone', ''));
  overall_fingerprint text := lower(btrim(coalesce(input->>'import_fingerprint', '')));
  item jsonb;
  item_phase text;
  item_hash text;
  item_google_hash text;
  item_published_at timestamptz;
  payload_published_at timestamptz;
  item_order integer;
  expected_year integer;
  prior_id uuid;
  prior_revision bigint;
  changed boolean := false;
  imported_count integer := 0;
  current_snapshot_id uuid;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target_tournament = '' or source_workbook = '' or actor = ''
      or overall_fingerprint !~ '^[0-9a-f]{64}$'
      or current_phase not in ('Pre-Tournament', 'After Round 1', 'After Round 2', 'Round 3 Pairings Announced', 'Final Results')
      or jsonb_typeof(coalesce(input->'snapshots', 'null'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_PUBLISHED_ODDS_IMPORT_REQUIRED');
  end if;

  select t.tournament_year into expected_year
  from scoring_authority.tournaments t
  where t.tournament_id = target_tournament and t.source_workbook_id = source_workbook
  for update;
  if expected_year is null then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_TOURNAMENT_SOURCE_MISMATCH');
  end if;
  if jsonb_array_length(input->'snapshots') = 0 then
    return jsonb_build_object('ok', false, 'code', 'PUBLISHED_ODDS_SNAPSHOT_REQUIRED');
  end if;
  if (select count(distinct value->>'milestone') from jsonb_array_elements(input->'snapshots'))
      <> jsonb_array_length(input->'snapshots') then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE_PUBLISHED_ODDS_MILESTONE');
  end if;

  -- Validate the complete import before changing current pointers.
  for item in select value from jsonb_array_elements(input->'snapshots') loop
    item_phase := btrim(coalesce(item->>'milestone', ''));
    item_hash := lower(btrim(coalesce(item->>'payload_hash', '')));
    item_google_hash := lower(btrim(coalesce(item->>'google_publication_fingerprint', '')));
    item_order := coalesce((item->>'phase_order')::integer, -1);
    if item_phase not in ('Pre-Tournament', 'After Round 1', 'After Round 2', 'Round 3 Pairings Announced', 'Final Results')
        or item_order <> array_position(array['Pre-Tournament', 'After Round 1', 'After Round 2', 'Round 3 Pairings Announced', 'Final Results'], item_phase) - 1
        or coalesce((item->'published_payload'->>'year')::integer, 0) <> expected_year
        or btrim(coalesce(item->'published_payload'->>'phase', '')) <> item_phase
        or jsonb_typeof(coalesce(item->'published_payload'->'teams', 'null'::jsonb)) <> 'array'
        or jsonb_array_length(item->'published_payload'->'teams') = 0
        or jsonb_typeof(coalesce(item->'published_payload'->'players', 'null'::jsonb)) <> 'array'
        or jsonb_array_length(item->'published_payload'->'players') = 0
        or item_hash !~ '^[0-9a-f]{64}$' or item_google_hash !~ '^[0-9a-f]{64}$'
        or coalesce((item->>'publication_verified')::boolean, false) is not true then
      return jsonb_build_object('ok', false, 'code', 'INVALID_PUBLISHED_ODDS_SNAPSHOT');
    end if;
    begin
      item_published_at := (item->>'published_at')::timestamptz;
      payload_published_at := (item->'published_payload'->>'publishedAt')::timestamptz;
    exception when others then return jsonb_build_object('ok', false, 'code', 'INVALID_PUBLISHED_ODDS_TIMESTAMP'); end;
    if item_published_at is null or payload_published_at is null or item_published_at <> payload_published_at then
      return jsonb_build_object('ok', false, 'code', 'PUBLISHED_ODDS_TIMESTAMP_MISMATCH');
    end if;
  end loop;
  if not exists (select 1 from jsonb_array_elements(input->'snapshots') s where s->>'milestone' = current_phase) then
    return jsonb_build_object('ok', false, 'code', 'CURRENT_PUBLISHED_ODDS_MILESTONE_INCOMPLETE');
  end if;

  for item in select value from jsonb_array_elements(input->'snapshots') order by (value->>'phase_order')::integer loop
    item_phase := item->>'milestone';
    item_hash := item->>'payload_hash';
    item_google_hash := item->>'google_publication_fingerprint';
    item_published_at := (item->>'published_at')::timestamptz;
    item_order := (item->>'phase_order')::integer;
    prior_id := null; prior_revision := null;
    select s.id, s.publication_revision into prior_id, prior_revision
    from scoring_authority.odds_published_snapshots s
    where s.tournament_id = target_tournament and s.milestone = item_phase
      and s.published_at = item_published_at and s.payload_hash = item_hash;
    if prior_id is null then
      select coalesce(max(s.publication_revision), 0) + 1 into prior_revision
      from scoring_authority.odds_published_snapshots s
      where s.tournament_id = target_tournament and s.milestone = item_phase;
      changed := true;
      update scoring_authority.odds_published_snapshots set is_current_for_milestone = false
      where tournament_id = target_tournament and milestone = item_phase and is_current_for_milestone;
      insert into scoring_authority.odds_published_snapshots (
        tournament_id, milestone, phase_order, publication_revision, published_at,
        published_payload, payload_hash, source_fingerprint, engine_version, engine_metadata,
        google_publication_fingerprint, google_publication_reference,
        is_current_for_milestone, publication_verified, imported_by
      ) values (
        target_tournament, item_phase, item_order, prior_revision, item_published_at,
        item->'published_payload', item_hash, nullif(btrim(coalesce(item->>'source_fingerprint', '')), ''),
        nullif(btrim(coalesce(item->>'engine_version', '')), ''), coalesce(item->'engine_metadata', '{}'::jsonb),
        item_google_hash, coalesce(item->'google_publication_reference', '{}'::jsonb), true, true, actor
      ) returning id into prior_id;
    else
      update scoring_authority.odds_published_snapshots set is_current_for_milestone = false
      where tournament_id = target_tournament and milestone = item_phase and id <> prior_id and is_current_for_milestone;
      update scoring_authority.odds_published_snapshots set
        is_current_for_milestone = true, publication_verified = true,
        google_publication_fingerprint = item_google_hash,
        google_publication_reference = coalesce(item->'google_publication_reference', '{}'::jsonb),
        imported_by = actor, imported_at = now()
      where id = prior_id;
    end if;
    if item_phase = current_phase then current_snapshot_id := prior_id; end if;
    imported_count := imported_count + 1;
  end loop;

  update scoring_authority.odds_published_snapshots set is_current_official = false
  where tournament_id = target_tournament and is_current_official and id <> current_snapshot_id;
  update scoring_authority.odds_published_snapshots set is_current_official = true
  where id = current_snapshot_id;

  insert into scoring_authority.odds_snapshot_import_runs (
    tournament_id, source_workbook_id, import_fingerprint, current_official_milestone,
    status, snapshot_count, requested_by
  ) values (target_tournament, source_workbook, overall_fingerprint, current_phase,
    case when changed then 'APPLIED' else 'NO_CHANGE' end, imported_count, actor);
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'PUBLISHED_ODDS_SNAPSHOTS_IMPORTED', actor,
    jsonb_build_object('fingerprint', overall_fingerprint, 'snapshots', imported_count,
      'currentMilestone', current_phase, 'changed', changed, 'valuesRecalculated', false));
  return jsonb_build_object('ok', true, 'changed', changed, 'snapshots', imported_count,
    'current_official_milestone', current_phase, 'import_fingerprint', overall_fingerprint);
end;
$$;

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
begin
  if btrim(coalesce(target_tournament_id, '')) <> '' then
    select * into resolved_tournament from scoring_authority.tournaments t
    where t.tournament_id = btrim(target_tournament_id)
      and (btrim(coalesce(target_source_workbook_id, '')) = '' or t.source_workbook_id = btrim(target_source_workbook_id));
  elsif btrim(coalesce(target_source_workbook_id, '')) <> '' then
    select * into resolved_tournament from scoring_authority.tournaments t
    where t.source_workbook_id = btrim(target_source_workbook_id);
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

revoke all on function public.replace_preview_published_odds_snapshots(jsonb) from public, anon, authenticated;
revoke all on function public.read_published_odds_view(text, text) from public, anon, authenticated;
grant execute on function public.replace_preview_published_odds_snapshots(jsonb) to service_role;
grant execute on function public.read_published_odds_view(text, text) to service_role;
