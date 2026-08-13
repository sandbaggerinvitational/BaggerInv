-- Preview-only finalized scorecard snapshots and durable Google Round Scorecards archive jobs.
-- Normalized scoring_authority tables remain authoritative. These records prove and mirror a
-- finalized revision; they do not permit participant score or archive mutation.

create table scoring_authority.finalized_scorecard_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  match_id text not null references scoring_authority.matches on delete cascade,
  snapshot_revision bigint not null check (snapshot_revision > 0),
  match_revision bigint not null check (match_revision >= 0),
  scoring_snapshot_id text not null references scoring_authority.scoring_snapshots,
  scoring_snapshot_revision bigint not null check (scoring_snapshot_revision >= 0),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  state text not null default 'CURRENT' check (state in ('CURRENT', 'SUPERSEDED', 'INVALIDATED')),
  finalized_at timestamptz not null,
  invalidated_at timestamptz,
  superseded_at timestamptz,
  superseded_by_snapshot_id uuid references scoring_authority.finalized_scorecard_snapshots,
  created_at timestamptz not null default now(),
  unique (match_id, snapshot_revision),
  unique (match_id, match_revision),
  check (jsonb_typeof(payload) = 'object')
);

create unique index scoring_authority_finalized_scorecard_current_idx
  on scoring_authority.finalized_scorecard_snapshots (match_id)
  where state = 'CURRENT';

create table scoring_authority.scorecard_archive_jobs (
  job_id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  match_id text not null references scoring_authority.matches on delete cascade,
  snapshot_id uuid not null references scoring_authority.finalized_scorecard_snapshots,
  snapshot_revision bigint not null check (snapshot_revision > 0),
  match_revision bigint not null check (match_revision >= 0),
  event_type text not null check (event_type in ('SCORECARD_ARCHIVE_UPSERT', 'SCORECARD_ARCHIVE_INVALIDATE')),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  archive_payload_hash text not null check (archive_payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'VERIFIED', 'RETRYABLE', 'BLOCKED', 'SUPERSEDED')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  claimed_by text,
  claim_token uuid,
  last_error_code text,
  last_error_safe text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (match_id, event_type, match_revision)
);

create index scoring_authority_scorecard_archive_jobs_pending_idx
  on scoring_authority.scorecard_archive_jobs (status, available_at, match_id, match_revision desc)
  where status in ('PENDING', 'PROCESSING', 'RETRYABLE');

create table scoring_authority.scorecard_archive_checkpoints (
  match_id text primary key references scoring_authority.matches on delete cascade,
  tournament_id text not null references scoring_authority.tournaments on delete cascade,
  current_snapshot_id uuid references scoring_authority.finalized_scorecard_snapshots,
  finalized_snapshot_revision bigint,
  finalized_match_revision bigint,
  source_fingerprint text,
  archive_payload_hash text,
  expected_logical_identities jsonb not null default '[]'::jsonb,
  google_row_numbers jsonb not null default '[]'::jsonb,
  google_readback_hash text,
  status text not null default 'PENDING' check (status in ('PENDING', 'PENDING_INVALIDATION', 'VERIFIED', 'INVALIDATED', 'FAILED')),
  last_job_id uuid references scoring_authority.scorecard_archive_jobs,
  last_error_code text,
  last_error_safe text,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(expected_logical_identities) = 'array'),
  check (jsonb_typeof(google_row_numbers) = 'array')
);

alter table scoring_authority.finalized_scorecard_snapshots enable row level security;
alter table scoring_authority.scorecard_archive_jobs enable row level security;
alter table scoring_authority.scorecard_archive_checkpoints enable row level security;
revoke all on scoring_authority.finalized_scorecard_snapshots from public, anon, authenticated;
revoke all on scoring_authority.scorecard_archive_jobs from public, anon, authenticated;
revoke all on scoring_authority.scorecard_archive_checkpoints from public, anon, authenticated;

create or replace function scoring_authority.protect_finalized_scorecard_snapshot_payload()
returns trigger
language plpgsql
set search_path = scoring_authority, public, extensions, pg_temp
as $$
begin
  if new.tournament_id is distinct from old.tournament_id
     or new.match_id is distinct from old.match_id
     or new.snapshot_revision is distinct from old.snapshot_revision
     or new.match_revision is distinct from old.match_revision
     or new.scoring_snapshot_id is distinct from old.scoring_snapshot_id
     or new.scoring_snapshot_revision is distinct from old.scoring_snapshot_revision
     or new.source_fingerprint is distinct from old.source_fingerprint
     or new.payload_hash is distinct from old.payload_hash
     or new.payload is distinct from old.payload
     or new.finalized_at is distinct from old.finalized_at
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'FINALIZED_SCORECARD_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger protect_finalized_scorecard_snapshot_payload
before update on scoring_authority.finalized_scorecard_snapshots
for each row execute function scoring_authority.protect_finalized_scorecard_snapshot_payload();

create or replace function scoring_authority.capture_finalized_scorecard_snapshot(target_match text, actor text)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype;
  tournament_row scoring_authority.tournaments%rowtype;
  round_row scoring_authority.rounds%rowtype;
  scoring_row scoring_authority.scoring_snapshots%rowtype;
  presentation_row scoring_authority.game_center_presentations%rowtype;
  prior_row scoring_authority.finalized_scorecard_snapshots%rowtype;
  existing_row scoring_authority.finalized_scorecard_snapshots%rowtype;
  new_snapshot_id uuid := gen_random_uuid();
  next_snapshot_revision bigint;
  expected_participants integer;
  expected_scores_per_side integer;
  participant_count integer;
  hole_count integer;
  teams_value jsonb;
  participants_value jsonb;
  holes_value jsonb;
  hole_revisions jsonb;
  progress_value jsonb;
  source_value jsonb;
  payload_value jsonb;
  source_hash text;
  payload_hash_value text;
begin
  select * into match_row from scoring_authority.matches where match_id = btrim(coalesce(target_match, '')) for update;
  if not found then raise exception using errcode = 'P0001', message = 'ARCHIVE_MATCH_NOT_FOUND'; end if;
  if match_row.status <> 'FINAL' or not match_row.scorecard_complete or match_row.scored_holes <> 18
     or match_row.unresolved_mutations <> 0 or match_row.finalized_at is null or btrim(match_row.result_winner) = '' then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_FINALIZATION_INELIGIBLE';
  end if;
  if match_row.format not in ('BB', 'SC', 'SI') then raise exception using errcode = 'P0001', message = 'ARCHIVE_FORMAT_INVALID'; end if;

  select * into tournament_row from scoring_authority.tournaments where tournament_id = match_row.tournament_id;
  select * into round_row from scoring_authority.rounds where tournament_id = match_row.tournament_id and round_number = match_row.round_number;
  select * into scoring_row from scoring_authority.scoring_snapshots where snapshot_id = match_row.scoring_snapshot_id;
  select * into presentation_row from scoring_authority.game_center_presentations where match_id = match_row.match_id;
  if tournament_row.tournament_id is null or round_row.tournament_id is null or scoring_row.snapshot_id is null
     or presentation_row.match_id is null or btrim(presentation_row.display_match_number) = ''
     or scoring_row.match_id <> match_row.match_id or scoring_row.format <> match_row.format
     or scoring_row.tournament_id <> match_row.tournament_id or jsonb_array_length(scoring_row.hole_definitions) <> 18 then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_CANONICAL_CONTEXT_INCOMPLETE';
  end if;

  expected_participants := case when match_row.format = 'SI' then 2 else 4 end;
  expected_scores_per_side := case when match_row.format = 'BB' then 2 else 1 end;
  select count(*) into participant_count from scoring_authority.match_participants where match_id = match_row.match_id;
  if participant_count <> expected_participants
     or exists (
       select 1 from generate_series(1, 2) side(team_side)
       where (select count(*) from scoring_authority.match_participants mp where mp.match_id = match_row.match_id and mp.team_side = side.team_side)
         <> case when match_row.format = 'SI' then 1 else 2 end
     )
     or exists (
       select 1 from scoring_authority.match_participants mp
       left join scoring_authority.tournament_players tp
         on tp.tournament_id = match_row.tournament_id and tp.player_id = mp.player_id
       where mp.match_id = match_row.match_id
         and (tp.player_id is null or tp.team_side <> mp.team_side or tp.participation_status <> 'ACTIVE')
     ) then raise exception using errcode = 'P0001', message = 'ARCHIVE_PARTICIPANT_MAPPING_INVALID'; end if;

  select count(distinct hs.hole_number) into hole_count from scoring_authority.hole_scores hs where hs.match_id = match_row.match_id;
  if hole_count <> 18
     or (select count(*) from scoring_authority.match_holes mh where mh.match_id = match_row.match_id) <> 18
     or exists (
       select 1 from scoring_authority.hole_scores hs where hs.match_id = match_row.match_id and (
         not scoring_authority.valid_gross_scores(hs.team_1_gross_scores, expected_scores_per_side)
         or not scoring_authority.valid_gross_scores(hs.team_2_gross_scores, expected_scores_per_side)
         or jsonb_typeof(hs.team_1_strokes) <> 'array' or jsonb_array_length(hs.team_1_strokes) <> expected_scores_per_side
         or jsonb_typeof(hs.team_2_strokes) <> 'array' or jsonb_array_length(hs.team_2_strokes) <> expected_scores_per_side
       )
     ) then raise exception using errcode = 'P0001', message = 'ARCHIVE_HOLE_SET_INVALID'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'team_id', t.team_id, 'team_side', t.team_side, 'name', t.name
  ) order by t.team_side), '[]'::jsonb) into teams_value
  from scoring_authority.teams t where t.tournament_id = match_row.tournament_id;
  if jsonb_array_length(teams_value) <> 2 then raise exception using errcode = 'P0001', message = 'ARCHIVE_TEAM_MAPPING_INVALID'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', mp.player_id, 'display_name', p.display_name, 'team_side', mp.team_side,
    'player_slot', mp.player_slot, 'handicap_index', mp.handicap_index,
    'course_handicap', mp.course_handicap, 'playing_handicap', mp.playing_handicap,
    'final_strokes', mp.final_strokes
  ) order by mp.team_side, mp.player_slot), '[]'::jsonb) into participants_value
  from scoring_authority.match_participants mp join scoring_authority.players p using (player_id)
  where mp.match_id = match_row.match_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'hole_number', hs.hole_number, 'hole_revision', hs.hole_revision,
    'par', mh.par, 'stroke_index', mh.stroke_index, 'yardage', mh.yardage,
    'team_1_gross_scores', hs.team_1_gross_scores, 'team_2_gross_scores', hs.team_2_gross_scores,
    'team_1_strokes', hs.team_1_strokes, 'team_2_strokes', hs.team_2_strokes,
    'team_1_net_score', hs.team_1_net_score, 'team_2_net_score', hs.team_2_net_score,
    'hole_winner', hs.hole_winner
  ) order by hs.hole_number), '[]'::jsonb),
  coalesce(jsonb_object_agg(hs.hole_number::text, hs.hole_revision order by hs.hole_number), '{}'::jsonb)
  into holes_value, hole_revisions
  from scoring_authority.hole_scores hs join scoring_authority.match_holes mh
    on mh.match_id = hs.match_id and mh.hole_number = hs.hole_number
  where hs.match_id = match_row.match_id;

  progress_value := scoring_authority.match_progress(match_row.match_id, match_row.format);
  if coalesce((progress_value->>'scorecard_complete')::boolean, false) is not true
     or btrim(coalesce(progress_value->>'result_winner', '')) <> btrim(match_row.result_winner) then
    raise exception using errcode = 'P0001', message = 'ARCHIVE_RESULT_STATE_INCOHERENT';
  end if;

  source_value := jsonb_build_object(
    'schema_version', 'round-scorecards-v1',
    'tournament', jsonb_build_object('tournament_id', tournament_row.tournament_id, 'year', tournament_row.tournament_year, 'name', tournament_row.name),
    'round', jsonb_build_object('round_number', round_row.round_number, 'format', round_row.format, 'name', round_row.name),
    'match', jsonb_build_object(
      'match_id', match_row.match_id, 'display_number', presentation_row.display_match_number,
      'format', match_row.format, 'status', match_row.status, 'match_revision', match_row.match_revision,
      'result_winner', match_row.result_winner, 'running_result', match_row.running_result,
      'finalized_at', match_row.finalized_at
    ),
    'course', jsonb_build_object(
      'course_id', scoring_row.course_id, 'tee', scoring_row.tee, 'rating', scoring_row.rating,
      'slope', scoring_row.slope, 'par', scoring_row.par, 'scoring_snapshot_id', scoring_row.snapshot_id,
      'scoring_snapshot_revision', scoring_row.snapshot_revision, 'configuration_fingerprint', scoring_row.canonical_hash
    ),
    'teams', teams_value, 'participants', participants_value, 'holes', holes_value,
    'hole_revision_set', hole_revisions, 'result', progress_value
  );
  source_hash := encode(digest(source_value::text, 'sha256'), 'hex');
  payload_value := source_value || jsonb_build_object('source_fingerprint', source_hash);
  payload_hash_value := encode(digest(payload_value::text, 'sha256'), 'hex');

  select * into existing_row from scoring_authority.finalized_scorecard_snapshots
  where match_id = match_row.match_id and match_revision = match_row.match_revision;
  if found then
    if existing_row.source_fingerprint <> source_hash or existing_row.payload_hash <> payload_hash_value then
      raise exception using errcode = 'P0001', message = 'ARCHIVE_SNAPSHOT_REVISION_CONFLICT';
    end if;
    insert into scoring_authority.scorecard_archive_jobs (
      tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,
      source_fingerprint, archive_payload_hash
    ) values (
      existing_row.tournament_id, existing_row.match_id, existing_row.snapshot_id, existing_row.snapshot_revision,
      existing_row.match_revision, 'SCORECARD_ARCHIVE_UPSERT', existing_row.source_fingerprint, existing_row.payload_hash
    ) on conflict (match_id, event_type, match_revision) do nothing;
    return jsonb_build_object('ok', true, 'created', false, 'snapshot_id', existing_row.snapshot_id,
      'snapshot_revision', existing_row.snapshot_revision, 'match_revision', existing_row.match_revision,
      'source_fingerprint', existing_row.source_fingerprint, 'payload_hash', existing_row.payload_hash);
  end if;

  select * into prior_row from scoring_authority.finalized_scorecard_snapshots
  where match_id = match_row.match_id and state = 'CURRENT' for update;
  select coalesce(max(snapshot_revision), 0) + 1 into next_snapshot_revision
  from scoring_authority.finalized_scorecard_snapshots where match_id = match_row.match_id;
  if prior_row.snapshot_id is not null then
    update scoring_authority.finalized_scorecard_snapshots set
      state = 'SUPERSEDED', superseded_at = now(), superseded_by_snapshot_id = null
    where snapshot_id = prior_row.snapshot_id;
  end if;
  insert into scoring_authority.finalized_scorecard_snapshots (
    snapshot_id, tournament_id, match_id, snapshot_revision, match_revision,
    scoring_snapshot_id, scoring_snapshot_revision, source_fingerprint, payload_hash,
    payload, state, finalized_at
  ) values (
    new_snapshot_id, match_row.tournament_id, match_row.match_id, next_snapshot_revision, match_row.match_revision,
    scoring_row.snapshot_id, scoring_row.snapshot_revision, source_hash, payload_hash_value,
    payload_value, 'CURRENT', match_row.finalized_at
  );
  if prior_row.snapshot_id is not null then
    update scoring_authority.finalized_scorecard_snapshots set superseded_by_snapshot_id = new_snapshot_id
    where snapshot_id = prior_row.snapshot_id;
  end if;
  insert into scoring_authority.scorecard_archive_jobs (
    tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,
    source_fingerprint, archive_payload_hash
  ) values (
    match_row.tournament_id, match_row.match_id, new_snapshot_id, next_snapshot_revision, match_row.match_revision,
    'SCORECARD_ARCHIVE_UPSERT', source_hash, payload_hash_value
  );
  insert into scoring_authority.scorecard_archive_checkpoints (
    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,
    finalized_match_revision, source_fingerprint, archive_payload_hash, status,
    last_error_code, last_error_safe, verified_at
  ) values (
    match_row.match_id, match_row.tournament_id, new_snapshot_id, next_snapshot_revision,
    match_row.match_revision, source_hash, payload_hash_value, 'PENDING', null, null, null
  ) on conflict (match_id) do update set
    tournament_id = excluded.tournament_id, current_snapshot_id = excluded.current_snapshot_id,
    finalized_snapshot_revision = excluded.finalized_snapshot_revision,
    finalized_match_revision = excluded.finalized_match_revision,
    source_fingerprint = excluded.source_fingerprint, archive_payload_hash = excluded.archive_payload_hash,
    expected_logical_identities = '[]'::jsonb, google_row_numbers = '[]'::jsonb,
    google_readback_hash = null, status = 'PENDING', last_job_id = null,
    last_error_code = null, last_error_safe = null, verified_at = null, updated_at = now();
  insert into scoring_authority.audit_events (tournament_id, match_id, action, actor_id, metadata)
  values (match_row.tournament_id, match_row.match_id, 'FINALIZED_SCORECARD_SNAPSHOT_CREATED', coalesce(nullif(btrim(actor), ''), 'Supabase Finalization'),
    jsonb_build_object('snapshot_id', new_snapshot_id, 'snapshot_revision', next_snapshot_revision,
      'match_revision', match_row.match_revision, 'source_fingerprint', source_hash, 'payload_hash', payload_hash_value));
  return jsonb_build_object('ok', true, 'created', true, 'snapshot_id', new_snapshot_id,
    'snapshot_revision', next_snapshot_revision, 'match_revision', match_row.match_revision,
    'source_fingerprint', source_hash, 'payload_hash', payload_hash_value);
end;
$$;

create or replace function scoring_authority.invalidate_finalized_scorecard_snapshot(target_match text, target_match_revision bigint, actor text)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  match_row scoring_authority.matches%rowtype;
  snapshot_row scoring_authority.finalized_scorecard_snapshots%rowtype;
begin
  select * into match_row from scoring_authority.matches where match_id = btrim(coalesce(target_match, '')) for update;
  if not found then raise exception using errcode = 'P0001', message = 'ARCHIVE_MATCH_NOT_FOUND'; end if;
  if match_row.status = 'FINAL' then raise exception using errcode = 'P0001', message = 'ARCHIVE_REOPEN_STATE_REQUIRED'; end if;
  select * into snapshot_row from scoring_authority.finalized_scorecard_snapshots
  where match_id = match_row.match_id and state = 'CURRENT' for update;
  if not found then return jsonb_build_object('ok', true, 'created', false, 'code', 'NO_CURRENT_ARCHIVE'); end if;
  update scoring_authority.finalized_scorecard_snapshots set
    state = 'INVALIDATED', invalidated_at = now()
  where snapshot_id = snapshot_row.snapshot_id;
  insert into scoring_authority.scorecard_archive_jobs (
    tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,
    source_fingerprint, archive_payload_hash
  ) values (
    match_row.tournament_id, match_row.match_id, snapshot_row.snapshot_id, snapshot_row.snapshot_revision,
    target_match_revision, 'SCORECARD_ARCHIVE_INVALIDATE', snapshot_row.source_fingerprint, snapshot_row.payload_hash
  ) on conflict (match_id, event_type, match_revision) do nothing;
  insert into scoring_authority.scorecard_archive_checkpoints (
    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,
    finalized_match_revision, source_fingerprint, archive_payload_hash, status,
    last_error_code, last_error_safe, verified_at
  ) values (
    match_row.match_id, match_row.tournament_id, snapshot_row.snapshot_id, snapshot_row.snapshot_revision,
    target_match_revision, snapshot_row.source_fingerprint, snapshot_row.payload_hash,
    'PENDING_INVALIDATION', null, null, null
  ) on conflict (match_id) do update set
    finalized_match_revision = excluded.finalized_match_revision, status = 'PENDING_INVALIDATION',
    last_error_code = null, last_error_safe = null, verified_at = null, updated_at = now();
  insert into scoring_authority.audit_events (tournament_id, match_id, action, actor_id, metadata)
  values (match_row.tournament_id, match_row.match_id, 'FINALIZED_SCORECARD_ARCHIVE_INVALIDATION_QUEUED', coalesce(nullif(btrim(actor), ''), 'Supabase Reopen'),
    jsonb_build_object('snapshot_id', snapshot_row.snapshot_id, 'snapshot_revision', snapshot_row.snapshot_revision,
      'reopen_match_revision', target_match_revision));
  return jsonb_build_object('ok', true, 'created', true, 'snapshot_id', snapshot_row.snapshot_id,
    'snapshot_revision', snapshot_row.snapshot_revision, 'match_revision', target_match_revision);
end;
$$;

create or replace function scoring_authority.capture_scorecard_archive_transition()
returns trigger
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
begin
  if new.status = 'FINAL' and old.status <> 'FINAL' then
    perform scoring_authority.capture_finalized_scorecard_snapshot(new.match_id, 'Supabase Finalization');
  elsif old.status = 'FINAL' and new.status <> 'FINAL' then
    perform scoring_authority.invalidate_finalized_scorecard_snapshot(new.match_id, new.match_revision, 'Supabase Reopen');
  end if;
  return new;
end;
$$;

drop trigger if exists capture_scorecard_archive_transition on scoring_authority.matches;
create trigger capture_scorecard_archive_transition
after update of status on scoring_authority.matches
for each row when (old.status is distinct from new.status)
execute function scoring_authority.capture_scorecard_archive_transition();

create or replace function public.claim_preview_scorecard_archive_job(worker_id text, lease_seconds integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  job_row scoring_authority.scorecard_archive_jobs%rowtype;
  token uuid := gen_random_uuid();
  lease integer := greatest(15, least(coalesce(lease_seconds, 60), 300));
begin
  if btrim(coalesce(worker_id, '')) = '' then return jsonb_build_object('ok', false, 'code', 'WORKER_ID_REQUIRED'); end if;
  update scoring_authority.scorecard_archive_jobs older set
    status = 'SUPERSEDED', lease_expires_at = null, claimed_by = null, claim_token = null, updated_at = now()
  where older.status in ('PENDING', 'RETRYABLE', 'PROCESSING')
    and (older.status <> 'PROCESSING' or older.lease_expires_at < now())
    and exists (
      select 1 from scoring_authority.scorecard_archive_jobs newer
      where newer.match_id = older.match_id and newer.match_revision > older.match_revision
        and newer.status in ('PENDING', 'RETRYABLE', 'PROCESSING', 'VERIFIED')
    );
  select * into job_row from scoring_authority.scorecard_archive_jobs j
  where (j.status in ('PENDING', 'RETRYABLE') or (j.status = 'PROCESSING' and j.lease_expires_at < now()))
    and j.available_at <= now()
    and not exists (
      select 1 from scoring_authority.scorecard_archive_jobs newer
      where newer.match_id = j.match_id and newer.match_revision > j.match_revision
        and newer.status in ('PENDING', 'RETRYABLE', 'PROCESSING', 'VERIFIED')
    )
  order by j.available_at, j.created_at, j.match_id
  for update skip locked limit 1;
  if not found then return jsonb_build_object('ok', true, 'job', null); end if;
  update scoring_authority.scorecard_archive_jobs set
    status = 'PROCESSING', attempts = attempts + 1, claimed_by = worker_id,
    claim_token = token, lease_expires_at = now() + make_interval(secs => lease), updated_at = now()
  where job_id = job_row.job_id returning * into job_row;
  return jsonb_build_object(
    'ok', true,
    'job', to_jsonb(job_row) || jsonb_build_object('id', job_row.job_id),
    'snapshot', (select to_jsonb(s) from scoring_authority.finalized_scorecard_snapshots s where s.snapshot_id = job_row.snapshot_id),
    'checkpoint', (select to_jsonb(c) from scoring_authority.scorecard_archive_checkpoints c where c.match_id = job_row.match_id)
  );
end;
$$;

create or replace function public.complete_preview_scorecard_archive_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  job_row scoring_authority.scorecard_archive_jobs%rowtype;
  match_row scoring_authority.matches%rowtype;
  snapshot_row scoring_authority.finalized_scorecard_snapshots%rowtype;
  newer_job scoring_authority.scorecard_archive_jobs%rowtype;
  requested_status text := upper(btrim(coalesce(input->>'verified_status', '')));
begin
  select * into job_row from scoring_authority.scorecard_archive_jobs
  where job_id = nullif(input->>'job_id', '')::uuid for update;
  if not found or job_row.status <> 'PROCESSING' or job_row.claim_token <> nullif(input->>'claim_token', '')::uuid then
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_CLAIM_STALE');
  end if;
  select * into newer_job from scoring_authority.scorecard_archive_jobs
  where match_id = job_row.match_id and match_revision > job_row.match_revision
  order by match_revision desc limit 1;
  if found then
    update scoring_authority.scorecard_archive_jobs set status = 'SUPERSEDED', claim_token = null,
      claimed_by = null, lease_expires_at = null, updated_at = now() where job_id = job_row.job_id;
    update scoring_authority.scorecard_archive_jobs set status = 'RETRYABLE', available_at = now(),
      verified_at = null, updated_at = now() where job_id = newer_job.job_id and status in ('VERIFIED', 'PENDING', 'RETRYABLE');
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_STALE_WORKER_REQUEUED');
  end if;
  select * into match_row from scoring_authority.matches where match_id = job_row.match_id;
  select * into snapshot_row from scoring_authority.finalized_scorecard_snapshots where snapshot_id = job_row.snapshot_id;
  if snapshot_row.snapshot_id is null
     or btrim(coalesce(input->>'source_fingerprint', '')) <> job_row.source_fingerprint
     or btrim(coalesce(input->>'archive_payload_hash', '')) <> job_row.archive_payload_hash
     or coalesce((input->>'snapshot_revision')::bigint, -1) <> job_row.snapshot_revision
     or coalesce((input->>'finalized_match_revision')::bigint, -1) <> job_row.match_revision
     or btrim(coalesce(input->>'google_readback_hash', '')) !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(coalesce(input->'expected_logical_identities', 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(input->'google_row_numbers', 'null'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_CHECKPOINT_PAYLOAD_INVALID');
  end if;
  if (job_row.event_type = 'SCORECARD_ARCHIVE_UPSERT' and (match_row.status <> 'FINAL' or snapshot_row.state <> 'CURRENT' or requested_status <> 'VERIFIED'))
     or (job_row.event_type = 'SCORECARD_ARCHIVE_INVALIDATE' and (match_row.status = 'FINAL' or requested_status <> 'INVALIDATED')) then
    update scoring_authority.scorecard_archive_jobs set status = 'SUPERSEDED', claim_token = null,
      claimed_by = null, lease_expires_at = null, updated_at = now() where job_id = job_row.job_id;
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_LIFECYCLE_SUPERSEDED');
  end if;
  update scoring_authority.scorecard_archive_jobs set
    status = 'VERIFIED', verified_at = now(), claim_token = null, claimed_by = null,
    lease_expires_at = null, last_error_code = null, last_error_safe = null, updated_at = now()
  where job_id = job_row.job_id;
  insert into scoring_authority.scorecard_archive_checkpoints (
    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,
    finalized_match_revision, source_fingerprint, archive_payload_hash,
    expected_logical_identities, google_row_numbers, google_readback_hash,
    status, last_job_id, last_error_code, last_error_safe, verified_at
  ) values (
    job_row.match_id, job_row.tournament_id, job_row.snapshot_id, job_row.snapshot_revision,
    job_row.match_revision, job_row.source_fingerprint, job_row.archive_payload_hash,
    input->'expected_logical_identities', input->'google_row_numbers', input->>'google_readback_hash',
    requested_status, job_row.job_id, null, null, now()
  ) on conflict (match_id) do update set
    tournament_id = excluded.tournament_id, current_snapshot_id = excluded.current_snapshot_id,
    finalized_snapshot_revision = excluded.finalized_snapshot_revision,
    finalized_match_revision = excluded.finalized_match_revision, source_fingerprint = excluded.source_fingerprint,
    archive_payload_hash = excluded.archive_payload_hash,
    expected_logical_identities = excluded.expected_logical_identities,
    google_row_numbers = excluded.google_row_numbers, google_readback_hash = excluded.google_readback_hash,
    status = excluded.status, last_job_id = excluded.last_job_id, last_error_code = null,
    last_error_safe = null, verified_at = excluded.verified_at, updated_at = now();
  return jsonb_build_object('ok', true, 'checkpoint',
    (select to_jsonb(c) from scoring_authority.scorecard_archive_checkpoints c where c.match_id = job_row.match_id));
end;
$$;

create or replace function public.fail_preview_scorecard_archive_job(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  job_row scoring_authority.scorecard_archive_jobs%rowtype;
  delay_seconds integer := greatest(2, least(coalesce((input->>'retry_after_seconds')::integer, 30), 3600));
  blocked boolean := coalesce((input->>'block')::boolean, false);
begin
  select * into job_row from scoring_authority.scorecard_archive_jobs
  where job_id = nullif(input->>'job_id', '')::uuid for update;
  if not found or job_row.status <> 'PROCESSING' or job_row.claim_token <> nullif(input->>'claim_token', '')::uuid then
    return jsonb_build_object('ok', false, 'code', 'ARCHIVE_CLAIM_STALE');
  end if;
  update scoring_authority.scorecard_archive_jobs set
    status = case when blocked then 'BLOCKED' else 'RETRYABLE' end,
    available_at = now() + make_interval(secs => delay_seconds), lease_expires_at = null,
    claimed_by = null, claim_token = null,
    last_error_code = left(btrim(coalesce(input->>'error_code', 'ARCHIVE_DELIVERY_FAILED')), 120),
    last_error_safe = left(btrim(coalesce(input->>'error_safe', 'Round Scorecards archive delivery failed.')), 500),
    updated_at = now()
  where job_id = job_row.job_id;
  update scoring_authority.scorecard_archive_checkpoints set
    status = 'FAILED', last_job_id = job_row.job_id,
    last_error_code = left(btrim(coalesce(input->>'error_code', 'ARCHIVE_DELIVERY_FAILED')), 120),
    last_error_safe = left(btrim(coalesce(input->>'error_safe', 'Round Scorecards archive delivery failed.')), 500),
    updated_at = now()
  where match_id = job_row.match_id and finalized_match_revision <= job_row.match_revision;
  return jsonb_build_object('ok', true, 'status', case when blocked then 'BLOCKED' else 'RETRYABLE' end,
    'available_at', now() + make_interval(secs => delay_seconds));
end;
$$;

create or replace function public.backfill_preview_finalized_scorecard_archives(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  tournament_key text := btrim(coalesce(input->>'tournament_id', ''));
  expected_count integer := coalesce((input->>'expected_final_matches')::integer, -1);
  actual_count integer;
  dry_run boolean := coalesce((input->>'dry_run')::boolean, true);
  actor text := btrim(coalesce(input->>'actor_id', ''));
  item record;
  result_value jsonb;
  created_count integer := 0;
  reused_count integer := 0;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' or tournament_key = '' or actor = '' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_SERVICE_AUTHORIZATION_REQUIRED');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t join scoring_authority.ingress_gates g using (tournament_id)
    where t.tournament_id = tournament_key and t.scoring_authority = 'SUPABASE' and g.authority = 'SUPABASE'
  ) then return jsonb_build_object('ok', false, 'code', 'PREVIEW_SUPABASE_AUTHORITY_REQUIRED'); end if;
  select count(*) into actual_count from scoring_authority.matches
  where tournament_id = tournament_key and status = 'FINAL';
  if expected_count < 0 or actual_count <> expected_count then
    return jsonb_build_object('ok', false, 'code', 'FINAL_MATCH_COUNT_MISMATCH', 'expected', expected_count, 'actual', actual_count);
  end if;
  if dry_run then return jsonb_build_object('ok', true, 'dry_run', true, 'eligible_final_matches', actual_count); end if;
  for item in select match_id from scoring_authority.matches
    where tournament_id = tournament_key and status = 'FINAL' order by round_number, match_id
  loop
    result_value := scoring_authority.capture_finalized_scorecard_snapshot(item.match_id, actor);
    if coalesce((result_value->>'created')::boolean, false) then created_count := created_count + 1;
    else reused_count := reused_count + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'dry_run', false, 'targeted', actual_count,
    'snapshots_created', created_count, 'snapshots_reused', reused_count,
    'jobs_ready', (select count(*) from scoring_authority.scorecard_archive_jobs j
      join scoring_authority.matches m using (match_id)
      where m.tournament_id = tournament_key and j.event_type = 'SCORECARD_ARCHIVE_UPSERT'
        and j.status in ('PENDING', 'RETRYABLE', 'PROCESSING', 'VERIFIED')));
end;
$$;

create or replace function public.inspect_preview_scorecard_archive_state(input jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare tournament_key text := btrim(coalesce(input->>'tournament_id', ''));
begin
  return jsonb_build_object(
    'ok', true,
    'tournament_id', tournament_key,
    'snapshots', coalesce((select jsonb_agg(to_jsonb(s) order by s.match_id, s.snapshot_revision)
      from scoring_authority.finalized_scorecard_snapshots s where tournament_key = '' or s.tournament_id = tournament_key), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) - 'claim_token' order by j.created_at, j.match_id)
      from scoring_authority.scorecard_archive_jobs j where tournament_key = '' or j.tournament_id = tournament_key), '[]'::jsonb),
    'checkpoints', coalesce((select jsonb_agg(to_jsonb(c) order by c.match_id)
      from scoring_authority.scorecard_archive_checkpoints c where tournament_key = '' or c.tournament_id = tournament_key), '[]'::jsonb),
    'counts', jsonb_build_object(
      'snapshots', (select count(*) from scoring_authority.finalized_scorecard_snapshots s where tournament_key = '' or s.tournament_id = tournament_key),
      'current_snapshots', (select count(*) from scoring_authority.finalized_scorecard_snapshots s where (tournament_key = '' or s.tournament_id = tournament_key) and s.state = 'CURRENT'),
      'pending_jobs', (select count(*) from scoring_authority.scorecard_archive_jobs j where (tournament_key = '' or j.tournament_id = tournament_key) and j.status in ('PENDING', 'PROCESSING', 'RETRYABLE')),
      'failed_jobs', (select count(*) from scoring_authority.scorecard_archive_jobs j where (tournament_key = '' or j.tournament_id = tournament_key) and j.status = 'BLOCKED'),
      'verified_jobs', (select count(*) from scoring_authority.scorecard_archive_jobs j where (tournament_key = '' or j.tournament_id = tournament_key) and j.status = 'VERIFIED'),
      'verified_checkpoints', (select count(*) from scoring_authority.scorecard_archive_checkpoints c where (tournament_key = '' or c.tournament_id = tournament_key) and c.status = 'VERIFIED')
    )
  );
end;
$$;

create or replace function public.inspect_preview_scorecard_archive_security()
returns jsonb
language sql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'ok', true,
    'anon_claim_execute', has_function_privilege('anon', 'public.claim_preview_scorecard_archive_job(text,integer)', 'execute'),
    'authenticated_claim_execute', has_function_privilege('authenticated', 'public.claim_preview_scorecard_archive_job(text,integer)', 'execute'),
    'anon_backfill_execute', has_function_privilege('anon', 'public.backfill_preview_finalized_scorecard_archives(jsonb)', 'execute'),
    'authenticated_backfill_execute', has_function_privilege('authenticated', 'public.backfill_preview_finalized_scorecard_archives(jsonb)', 'execute'),
    'anon_snapshot_select', has_table_privilege('anon', 'scoring_authority.finalized_scorecard_snapshots', 'select'),
    'authenticated_snapshot_select', has_table_privilege('authenticated', 'scoring_authority.finalized_scorecard_snapshots', 'select')
  )
$$;

revoke all on function scoring_authority.capture_finalized_scorecard_snapshot(text,text) from public, anon, authenticated;
revoke all on function scoring_authority.protect_finalized_scorecard_snapshot_payload() from public, anon, authenticated;
revoke all on function scoring_authority.invalidate_finalized_scorecard_snapshot(text,bigint,text) from public, anon, authenticated;
revoke all on function scoring_authority.capture_scorecard_archive_transition() from public, anon, authenticated;
revoke all on function public.claim_preview_scorecard_archive_job(text,integer) from public, anon, authenticated;
revoke all on function public.complete_preview_scorecard_archive_job(jsonb) from public, anon, authenticated;
revoke all on function public.fail_preview_scorecard_archive_job(jsonb) from public, anon, authenticated;
revoke all on function public.backfill_preview_finalized_scorecard_archives(jsonb) from public, anon, authenticated;
revoke all on function public.inspect_preview_scorecard_archive_state(jsonb) from public, anon, authenticated;
revoke all on function public.inspect_preview_scorecard_archive_security() from public, anon, authenticated;

grant execute on function public.claim_preview_scorecard_archive_job(text,integer) to service_role;
grant execute on function public.complete_preview_scorecard_archive_job(jsonb) to service_role;
grant execute on function public.fail_preview_scorecard_archive_job(jsonb) to service_role;
grant execute on function public.backfill_preview_finalized_scorecard_archives(jsonb) to service_role;
grant execute on function public.inspect_preview_scorecard_archive_state(jsonb) to service_role;
grant execute on function public.inspect_preview_scorecard_archive_security() to service_role;

notify pgrst, 'reload schema';
