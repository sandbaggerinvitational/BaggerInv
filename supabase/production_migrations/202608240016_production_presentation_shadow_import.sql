-- Step 10B: Production-only, dormant presentation shadow import.
--
-- This migration fills the Game Center and participant Home presentation
-- projections needed by the isolated Production-shadow candidate. It can run
-- only through service_role, is bound to the exact certified current-shadow
-- revision and Production Google workbook, and cannot enable scoring ingress,
-- workers, public reads, Auth authority, outbox/archive delivery, or Google
-- writes. No Preview import RPC is reused.

begin;

create table production_control.presentation_shadow_revisions (
  revision_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null check (tournament_id = '2026'),
  tournament_year integer not null check (tournament_year = 2026),
  revision_number bigint not null check (revision_number > 0),
  previous_revision_id uuid references production_control.presentation_shadow_revisions(revision_id),
  current_shadow_import_run_id uuid not null references production_control.import_runs(import_run_id),
  project_ref text not null check (project_ref = 'ymqhhtxaywtqllynrmxe'),
  project_url text not null check (project_url = 'https://ymqhhtxaywtqllynrmxe.supabase.co'),
  source_workbook_id text not null check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  source_tabs jsonb not null check (jsonb_typeof(source_tabs) = 'array'),
  contract_version text not null check (contract_version = 'production-presentation-shadow-v1'),
  request_fingerprint text not null unique check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  current_shadow_source_fingerprint text not null check (current_shadow_source_fingerprint ~ '^[0-9a-f]{64}$'),
  current_shadow_database_fingerprint text not null check (current_shadow_database_fingerprint ~ '^[0-9a-f]{64}$'),
  database_fingerprint text not null check (database_fingerprint ~ '^[0-9a-f]{64}$'),
  source_payload jsonb not null check (jsonb_typeof(source_payload) = 'object'),
  projection_payload jsonb not null check (jsonb_typeof(projection_payload) = 'object'),
  counts jsonb not null check (jsonb_typeof(counts) = 'object'),
  imported_by text not null check (btrim(imported_by) <> ''),
  imported_at timestamptz not null default now(),
  unique (tournament_id, revision_number),
  check (previous_revision_id is null or revision_number > 1)
);

create table production_control.presentation_shadow_current (
  tournament_id text primary key check (tournament_id = '2026'),
  revision_id uuid not null unique references production_control.presentation_shadow_revisions(revision_id),
  advanced_at timestamptz not null default now()
);

alter table production_control.presentation_shadow_revisions enable row level security;
alter table production_control.presentation_shadow_current enable row level security;
revoke all on production_control.presentation_shadow_revisions from public, anon, authenticated, service_role;
revoke all on production_control.presentation_shadow_current from public, anon, authenticated, service_role;
grant select on production_control.presentation_shadow_revisions to service_role;
grant select on production_control.presentation_shadow_current to service_role;

create or replace function production_control.production_presentation_shadow_projection(target_tournament text)
returns jsonb
language sql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, extensions, pg_temp
as $$
  select jsonb_build_object(
    'game_center_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', presentation.match_id,
        'tournament_id', presentation.tournament_id,
        'course_name', presentation.course_name,
        'course_logo', presentation.course_logo,
        'course_yardage', presentation.course_yardage,
        'tee_time', presentation.tee_time,
        'starting_hole', presentation.starting_hole,
        'display_match_number', presentation.display_match_number,
        'match_sort_order', presentation.match_sort_order,
        'team_1_logo', presentation.team_1_logo,
        'team_1_primary_color', presentation.team_1_primary_color,
        'team_1_secondary_color', presentation.team_1_secondary_color,
        'team_2_logo', presentation.team_2_logo,
        'team_2_primary_color', presentation.team_2_primary_color,
        'team_2_secondary_color', presentation.team_2_secondary_color,
        'tournament_location', presentation.tournament_location,
        'tournament_logo', presentation.tournament_logo,
        'tournament_status', presentation.tournament_status,
        'tournament_time_zone', presentation.tournament_time_zone,
        'source_updated_at', case when presentation.source_updated_at is null then ''
          else to_char(
            presentation.source_updated_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) end
      ) order by match_value.round_number, presentation.match_sort_order, presentation.match_id)
      from scoring_authority.game_center_presentations presentation
      join scoring_authority.matches match_value using (match_id)
      where presentation.tournament_id = target_tournament
    ), '[]'::jsonb),
    'participant_home_presentation', coalesce((
      select home.presentation
      from scoring_authority.participant_home_presentations home
      where home.tournament_id = target_tournament
    ), '{}'::jsonb)
  );
$$;

revoke all on function production_control.production_presentation_shadow_projection(text)
  from public, anon, authenticated, service_role;

create or replace function production_control.assert_production_presentation_shadow_scope(input jsonb)
returns production_control.resource_scope
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  expected_tabs constant jsonb := '["Tournaments","Live Tournaments","Players","Handicaps","Team Names","Courses","Live Matches","Matches","Tournament Timeline","Net Skins","Calcutta Purchases","Calcutta Ownership","Calcutta Point Structure","Calcutta Payout"]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_PRESENTATION_SERVICE_ROLE_REQUIRED';
  end if;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if scope.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or scope.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or scope.google_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or scope.vercel_project <> 'bagger-inv'
     or scope.canonical_domain <> 'https://baggerinv.com'
     or scope.current_tournament_id <> '2026'
     or scope.current_tournament_year <> 2026
     or upper(btrim(coalesce(input->>'environment', ''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref', '')) <> scope.project_ref
     or btrim(coalesce(input->>'project_url', '')) <> scope.project_url
     or btrim(coalesce(input->>'source_workbook_id', '')) <> scope.google_workbook_id
     or btrim(coalesce(input->>'tournament_id', '')) <> scope.current_tournament_id
     or coalesce((input->>'tournament_year')::integer, 0) <> scope.current_tournament_year
     or btrim(coalesce(input->>'operation', '')) <> 'PRODUCTION_PRESENTATION_SHADOW_IMPORT'
     or btrim(coalesce(input->>'contract_version', '')) <> 'production-presentation-shadow-v1'
     or coalesce(input->'source_tabs', 'null'::jsonb) <> expected_tabs
     or btrim(coalesce(input->>'requested_by', '')) = ''
     or lower(btrim(coalesce(input->>'request_fingerprint', ''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(input->>'source_fingerprint', ''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(input->>'payload_fingerprint', ''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(input->>'current_shadow_source_fingerprint', ''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(input->>'current_shadow_database_fingerprint', ''))) !~ '^[0-9a-f]{64}$'
     or scope.current_tournament_read_authority <> 'GOOGLE'
     or scope.scoring_authority <> 'GOOGLE'
     or scope.participant_identity_authority <> 'PASSPORT'
     or scope.public_supabase_reads_enabled
     or scope.scoring_ingress_enabled
     or scope.google_writes_enabled
     or scope.auth_user_creation_enabled
     or scope.odds_publication_enabled
     or scope.workers_enabled
     or exists (
       select 1 from production_control.worker_controls worker
       where worker.enabled or worker.scheduler_installed or worker.google_writes_allowed
     ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_PRESENTATION_DORMANT_SCOPE_REQUIRED';
  end if;
  if coalesce((input#>>'{safety,shadow_only}')::boolean, false) is not true
     or coalesce((input#>>'{safety,authoritative}')::boolean, true) is not false
     or upper(btrim(coalesce(input#>>'{safety,scoring_authority}', ''))) <> 'GOOGLE'
     or upper(btrim(coalesce(input#>>'{safety,participant_identity_authority}', ''))) <> 'PASSPORT'
     or coalesce((input#>>'{safety,scoring_ingress_enabled}')::boolean, true)
     or coalesce((input#>>'{safety,public_reads_enabled}')::boolean, true)
     or coalesce((input#>>'{safety,workers_enabled}')::boolean, true)
     or coalesce((input#>>'{safety,google_writes}')::integer, 1) <> 0
     or coalesce((input#>>'{safety,outbox_events}')::integer, 1) <> 0
     or coalesce((input#>>'{safety,archive_jobs}')::integer, 1) <> 0
     or coalesce((input#>>'{safety,mirror_jobs}')::integer, 1) <> 0 then
    raise exception using errcode = '42501', message = 'PRODUCTION_PRESENTATION_SHADOW_SAFETY_REQUIRED';
  end if;
  if exists (select 1 from scoring_authority.google_outbox_events where tournament_id = '2026')
     or exists (select 1 from scoring_authority.scorecard_archive_jobs where tournament_id = '2026')
     or exists (select 1 from scoring_authority.odds_google_mirror_jobs where tournament_id = '2026') then
    raise exception using errcode = '42501', message = 'PRODUCTION_PRESENTATION_DELIVERY_QUEUES_MUST_BE_EMPTY';
  end if;
  return scope;
end;
$$;

revoke all on function production_control.assert_production_presentation_shadow_scope(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.import_production_presentation_shadow_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  current_run production_control.import_runs%rowtype;
  current_revision production_control.presentation_shadow_revisions%rowtype;
  inserted_revision production_control.presentation_shadow_revisions%rowtype;
  source_text text := coalesce(input->>'source_canonical_json', '');
  payload_text text := coalesce(input->>'payload_canonical_json', '');
  request_text text := coalesce(input->>'request_canonical_json', '');
  source_value jsonb;
  payload_value jsonb;
  request_value jsonb;
  expected_request jsonb;
  rows_value jsonb;
  home_value jsonb;
  item jsonb;
  current_database_fingerprint text;
  database_projection jsonb;
  database_fingerprint_value text;
  next_revision bigint;
  counts_value jsonb;
begin
  scope := production_control.assert_production_presentation_shadow_scope(input);
  perform pg_advisory_xact_lock(hashtext('production-presentation-shadow:2026'));

  begin
    source_value := source_text::jsonb;
    payload_value := payload_text::jsonb;
    request_value := request_text::jsonb;
  exception when others then
    raise exception using errcode = '22023', message = 'PRODUCTION_PRESENTATION_CANONICAL_JSON_INVALID';
  end;
  expected_request := jsonb_build_object(
    'environment', 'PRODUCTION',
    'project_ref', scope.project_ref,
    'project_url', scope.project_url,
    'source_workbook_id', scope.google_workbook_id,
    'tournament_id', '2026',
    'tournament_year', 2026,
    'operation', 'PRODUCTION_PRESENTATION_SHADOW_IMPORT',
    'contract_version', 'production-presentation-shadow-v1',
    'requested_by', btrim(input->>'requested_by'),
    'current_shadow_import_run_id', btrim(input->>'current_shadow_import_run_id'),
    'current_shadow_source_fingerprint', lower(btrim(input->>'current_shadow_source_fingerprint')),
    'current_shadow_database_fingerprint', lower(btrim(input->>'current_shadow_database_fingerprint')),
    'source_fingerprint', lower(btrim(input->>'source_fingerprint')),
    'payload_fingerprint', lower(btrim(input->>'payload_fingerprint'))
  );
  if source_value is distinct from input->'source_payload'
     or payload_value is distinct from input->'payload'
     or request_value is distinct from expected_request
     or encode(extensions.digest(source_text, 'sha256'), 'hex') <> lower(btrim(input->>'source_fingerprint'))
     or encode(extensions.digest(payload_text, 'sha256'), 'hex') <> lower(btrim(input->>'payload_fingerprint'))
     or encode(extensions.digest(request_text, 'sha256'), 'hex') <> lower(btrim(input->>'request_fingerprint')) then
    raise exception using errcode = '22023', message = 'PRODUCTION_PRESENTATION_CANONICAL_EVIDENCE_MISMATCH';
  end if;
  if source_value#>>'{source_workbook_id}' <> scope.google_workbook_id
     or source_value#>>'{tournament_id}' <> '2026'
     or source_value#>>'{tournament_year}' <> '2026'
     or source_value#>>'{current_shadow,import_run_id}' <> btrim(input->>'current_shadow_import_run_id')
     or source_value#>>'{current_shadow,source_fingerprint}' <> lower(btrim(input->>'current_shadow_source_fingerprint'))
     or source_value#>>'{current_shadow,database_fingerprint}' <> lower(btrim(input->>'current_shadow_database_fingerprint'))
     or jsonb_typeof(source_value->'sheets') <> 'array'
     or jsonb_array_length(source_value->'sheets') <> 14
     or (select jsonb_agg(sheet_value->'sheet') from jsonb_array_elements(source_value->'sheets') sheet_value)
        <> input->'source_tabs' then
    raise exception using errcode = '22023', message = 'PRODUCTION_PRESENTATION_SOURCE_PROVENANCE_MISMATCH';
  end if;

  select run.* into current_run
  from production_control.import_runs run
  where run.domain = 'CURRENT_SCORING_SHADOW'
    and run.tournament_id = '2026'
    and run.tournament_year = 2026
    and run.source_workbook_id = scope.google_workbook_id
    and run.status = 'SUCCEEDED'
  order by run.completed_at desc
  limit 1;
  if current_run.import_run_id is null
     or current_run.import_run_id::text <> btrim(input->>'current_shadow_import_run_id')
     or current_run.source_fingerprint <> lower(btrim(input->>'current_shadow_source_fingerprint'))
     or current_run.database_fingerprint <> lower(btrim(input->>'current_shadow_database_fingerprint')) then
    raise exception using errcode = '22023', message = 'PRODUCTION_PRESENTATION_CURRENT_SHADOW_REVISION_MISMATCH';
  end if;
  current_database_fingerprint := encode(extensions.digest(
    production_control.current_tournament_shadow_projection('2026')::text,
    'sha256'
  ), 'hex');
  if current_database_fingerprint <> current_run.database_fingerprint then
    raise exception using errcode = '22023', message = 'PRODUCTION_PRESENTATION_CURRENT_SHADOW_DRIFT';
  end if;

  rows_value := payload_value->'game_center_rows';
  home_value := payload_value->'participant_home_presentation';
  if jsonb_typeof(rows_value) <> 'array'
     or jsonb_typeof(home_value) <> 'object'
     or jsonb_array_length(rows_value) <> 24
     or jsonb_typeof(coalesce(home_value#>'{timeline,events}', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(home_value->'netSkinsByPlayer', '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(home_value->'leaderboardsPlayers', '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(home_value->'tournamentMatchDisplay', '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'PRODUCTION_PRESENTATION_COMPLETE_PAYLOAD_REQUIRED';
  end if;
  if (select count(distinct btrim(row_value->>'match_id')) from jsonb_array_elements(rows_value) row_value) <> 24
     or (
       select count(*)
       from jsonb_array_elements(source_value->'sheets') source_sheet
       cross join lateral jsonb_array_elements(source_sheet->'records') source_match
       where source_sheet->>'sheet' = 'Live Matches'
     ) <> 24
     or exists (
       select 1 from scoring_authority.matches match_value
       where match_value.tournament_id = '2026'
         and not exists (
           select 1 from jsonb_array_elements(rows_value) row_value
           where btrim(row_value->>'match_id') = match_value.match_id
         )
     )
     or exists (
       select 1 from jsonb_array_elements(rows_value) row_value
       where btrim(coalesce(row_value->>'tournament_id', '')) <> '2026'
          or btrim(coalesce(row_value->>'course_name', '')) = ''
          or btrim(coalesce(row_value->>'display_match_number', '')) !~ '^[1-9][0-9]*$'
          or coalesce((row_value->>'match_sort_order')::integer, 0) <= 0
          or (row_value->>'match_sort_order')::integer <> (row_value->>'display_match_number')::integer
          or not exists (
            select 1 from scoring_authority.matches match_value
            where match_value.match_id = btrim(row_value->>'match_id')
              and match_value.tournament_id = '2026'
          )
          or not exists (
            select 1
            from jsonb_array_elements(source_value->'sheets') source_sheet
            cross join lateral jsonb_array_elements(source_sheet->'records') source_match
            join scoring_authority.matches match_value
              on match_value.match_id = btrim(row_value->>'match_id')
             and match_value.tournament_id = '2026'
            where source_sheet->>'sheet' = 'Live Matches'
              and btrim(source_match->>'Match ID') = btrim(row_value->>'match_id')
              and btrim(coalesce(source_match->>'Match', '')) ~ '^[1-9][0-9]*$'
              and (source_match->>'Match')::integer = (row_value->>'display_match_number')::integer
              and btrim(coalesce(source_match->>'Round', '')) ~ '^[1-9][0-9]*$'
              and (source_match->>'Round')::integer = match_value.round_number
          )
     )
     or exists (
       select 1
       from jsonb_array_elements(rows_value) left_row
       join scoring_authority.matches left_match on left_match.match_id = btrim(left_row->>'match_id')
       join jsonb_array_elements(rows_value) right_row
         on left_row->>'match_id' < right_row->>'match_id'
       join scoring_authority.matches right_match on right_match.match_id = btrim(right_row->>'match_id')
       where left_match.round_number = right_match.round_number
         and (left_row->>'match_sort_order')::integer = (right_row->>'match_sort_order')::integer
     ) then
    raise exception using errcode = '22023', message = 'PRODUCTION_PRESENTATION_COMPLETE_NUMERIC_MATCH_SET_REQUIRED';
  end if;

  select revision.* into current_revision
  from production_control.presentation_shadow_current pointer
  join production_control.presentation_shadow_revisions revision using (revision_id)
  where pointer.tournament_id = '2026'
  for update of pointer;
  if current_revision.revision_id is not null
     and current_revision.current_shadow_import_run_id = current_run.import_run_id
     and current_revision.source_fingerprint = lower(btrim(input->>'source_fingerprint'))
     and current_revision.payload_fingerprint = lower(btrim(input->>'payload_fingerprint')) then
    database_projection := production_control.production_presentation_shadow_projection('2026');
    database_fingerprint_value := encode(extensions.digest(database_projection::text, 'sha256'), 'hex');
    if database_projection is distinct from payload_value
       or database_fingerprint_value <> current_revision.database_fingerprint then
      raise exception using errcode = '22023', message = 'PRODUCTION_PRESENTATION_DUPLICATE_READBACK_DRIFT';
    end if;
    return jsonb_build_object(
      'ok', true, 'changed', false, 'duplicate', true, 'shadow_only', true,
      'authoritative', false, 'revision_id', current_revision.revision_id,
      'revision_number', current_revision.revision_number,
      'source_fingerprint', current_revision.source_fingerprint,
      'payload_fingerprint', current_revision.payload_fingerprint,
      'database_fingerprint', database_fingerprint_value,
      'counts', current_revision.counts,
      'authority', 'GOOGLE', 'scoring_ingress', 'DISABLED',
      'google_write', false, 'outbox_events', 0, 'archive_jobs', 0, 'mirror_jobs', 0
    );
  end if;

  delete from scoring_authority.game_center_presentations presentation
  where presentation.tournament_id = '2026'
    and not exists (
      select 1 from jsonb_array_elements(rows_value) row_value
      where btrim(row_value->>'match_id') = presentation.match_id
    );
  for item in select value from jsonb_array_elements(rows_value) loop
    insert into scoring_authority.game_center_presentations (
      match_id, tournament_id, course_name, course_logo, course_yardage,
      tee_time, starting_hole, display_match_number, match_sort_order,
      team_1_logo, team_1_primary_color, team_1_secondary_color,
      team_2_logo, team_2_primary_color, team_2_secondary_color,
      tournament_location, tournament_logo, tournament_status, tournament_time_zone,
      source_workbook_id, source_updated_at, source_payload_hash, imported_by,
      imported_at, updated_at
    ) values (
      btrim(item->>'match_id'), '2026',
      btrim(coalesce(item->>'course_name', '')), btrim(coalesce(item->>'course_logo', '')),
      btrim(coalesce(item->>'course_yardage', '')), btrim(coalesce(item->>'tee_time', '')),
      btrim(coalesce(item->>'starting_hole', '')), btrim(item->>'display_match_number'),
      (item->>'match_sort_order')::integer,
      btrim(coalesce(item->>'team_1_logo', '')), btrim(coalesce(item->>'team_1_primary_color', '')),
      btrim(coalesce(item->>'team_1_secondary_color', '')), btrim(coalesce(item->>'team_2_logo', '')),
      btrim(coalesce(item->>'team_2_primary_color', '')), btrim(coalesce(item->>'team_2_secondary_color', '')),
      btrim(coalesce(item->>'tournament_location', '')), btrim(coalesce(item->>'tournament_logo', '')),
      btrim(coalesce(item->>'tournament_status', '')),
      coalesce(nullif(btrim(coalesce(item->>'tournament_time_zone', '')), ''), 'America/Chicago'),
      scope.google_workbook_id, nullif(btrim(coalesce(item->>'source_updated_at', '')), '')::timestamptz,
      encode(extensions.digest(item::text, 'sha256'), 'hex'), btrim(input->>'requested_by'), now(), now()
    ) on conflict (match_id) do update set
      tournament_id = excluded.tournament_id,
      course_name = excluded.course_name, course_logo = excluded.course_logo,
      course_yardage = excluded.course_yardage, tee_time = excluded.tee_time,
      starting_hole = excluded.starting_hole, display_match_number = excluded.display_match_number,
      match_sort_order = excluded.match_sort_order,
      team_1_logo = excluded.team_1_logo, team_1_primary_color = excluded.team_1_primary_color,
      team_1_secondary_color = excluded.team_1_secondary_color,
      team_2_logo = excluded.team_2_logo, team_2_primary_color = excluded.team_2_primary_color,
      team_2_secondary_color = excluded.team_2_secondary_color,
      tournament_location = excluded.tournament_location, tournament_logo = excluded.tournament_logo,
      tournament_status = excluded.tournament_status, tournament_time_zone = excluded.tournament_time_zone,
      source_workbook_id = excluded.source_workbook_id, source_updated_at = excluded.source_updated_at,
      source_payload_hash = excluded.source_payload_hash, imported_by = excluded.imported_by,
      imported_at = now(), updated_at = now();
  end loop;

  insert into scoring_authority.participant_home_presentations (
    tournament_id, presentation, source_workbook_id, source_fingerprint,
    imported_by, imported_at, updated_at
  ) values (
    '2026', home_value, scope.google_workbook_id,
    lower(btrim(input->>'source_fingerprint')), btrim(input->>'requested_by'), now(), now()
  ) on conflict (tournament_id) do update set
    presentation = excluded.presentation,
    source_workbook_id = excluded.source_workbook_id,
    source_fingerprint = excluded.source_fingerprint,
    imported_by = excluded.imported_by,
    imported_at = now(), updated_at = now();

  database_projection := production_control.production_presentation_shadow_projection('2026');
  if database_projection is distinct from payload_value then
    raise exception using errcode = '22023', message = 'PRODUCTION_PRESENTATION_READBACK_MISMATCH';
  end if;
  if exists (select 1 from scoring_authority.google_outbox_events where tournament_id = '2026')
     or exists (select 1 from scoring_authority.scorecard_archive_jobs where tournament_id = '2026')
     or exists (select 1 from scoring_authority.odds_google_mirror_jobs where tournament_id = '2026') then
    raise exception using errcode = 'P0001', message = 'PRODUCTION_PRESENTATION_IMPORT_CREATED_DELIVERY_WORK';
  end if;
  database_fingerprint_value := encode(extensions.digest(database_projection::text, 'sha256'), 'hex');
  counts_value := jsonb_build_object(
    'game_center_presentations', jsonb_array_length(rows_value),
    'participant_home_presentations', 1,
    'round_1', (
      select count(*) from jsonb_array_elements(rows_value) row_value
      join scoring_authority.matches match_value on match_value.match_id = btrim(row_value->>'match_id')
      where match_value.round_number = 1
    ),
    'round_2', (
      select count(*) from jsonb_array_elements(rows_value) row_value
      join scoring_authority.matches match_value on match_value.match_id = btrim(row_value->>'match_id')
      where match_value.round_number = 2
    ),
    'round_3', (
      select count(*) from jsonb_array_elements(rows_value) row_value
      join scoring_authority.matches match_value on match_value.match_id = btrim(row_value->>'match_id')
      where match_value.round_number = 3
    )
  );
  next_revision := coalesce(current_revision.revision_number, 0) + 1;
  insert into production_control.presentation_shadow_revisions (
    tournament_id, tournament_year, revision_number, previous_revision_id,
    current_shadow_import_run_id, project_ref, project_url, source_workbook_id,
    source_tabs, contract_version, request_fingerprint, source_fingerprint,
    payload_fingerprint, current_shadow_source_fingerprint,
    current_shadow_database_fingerprint, database_fingerprint,
    source_payload, projection_payload, counts, imported_by
  ) values (
    '2026', 2026, next_revision, current_revision.revision_id,
    current_run.import_run_id, scope.project_ref, scope.project_url, scope.google_workbook_id,
    input->'source_tabs', 'production-presentation-shadow-v1',
    lower(btrim(input->>'request_fingerprint')), lower(btrim(input->>'source_fingerprint')),
    lower(btrim(input->>'payload_fingerprint')), current_run.source_fingerprint,
    current_run.database_fingerprint, database_fingerprint_value,
    source_value, payload_value, counts_value, btrim(input->>'requested_by')
  ) returning * into inserted_revision;
  insert into production_control.presentation_shadow_current (tournament_id, revision_id, advanced_at)
  values ('2026', inserted_revision.revision_id, now())
  on conflict (tournament_id) do update set
    revision_id = excluded.revision_id, advanced_at = excluded.advanced_at;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_PRESENTATION_SHADOW_IMPORTED', 'CURRENT_TOURNAMENT', '2026',
    btrim(input->>'requested_by'), lower(btrim(input->>'request_fingerprint')), 'SUCCEEDED',
    jsonb_build_object(
      'revisionId', inserted_revision.revision_id, 'revisionNumber', next_revision,
      'currentShadowImportRunId', current_run.import_run_id, 'counts', counts_value,
      'shadowOnly', true, 'authoritative', false, 'authority', 'GOOGLE',
      'scoringIngress', 'DISABLED', 'googleWrite', false,
      'outbox', false, 'archive', false, 'mirror', false
    )
  );
  return jsonb_build_object(
    'ok', true, 'changed', true, 'duplicate', false, 'shadow_only', true,
    'authoritative', false, 'revision_id', inserted_revision.revision_id,
    'revision_number', inserted_revision.revision_number,
    'current_shadow_import_run_id', current_run.import_run_id,
    'source_fingerprint', inserted_revision.source_fingerprint,
    'payload_fingerprint', inserted_revision.payload_fingerprint,
    'database_fingerprint', inserted_revision.database_fingerprint,
    'counts', counts_value, 'authority', 'GOOGLE', 'scoring_ingress', 'DISABLED',
    'google_write', false, 'outbox_events', 0, 'archive_jobs', 0, 'mirror_jobs', 0
  );
end;
$$;

revoke all on function public.import_production_presentation_shadow_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_production_presentation_shadow_v1(jsonb) to service_role;

create or replace function public.read_production_presentation_shadow_v1(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  revision production_control.presentation_shadow_revisions%rowtype;
  projection jsonb;
  fingerprint_value text;
begin
  scope := production_control.assert_production_presentation_shadow_scope(
    input || jsonb_build_object(
      'operation', 'PRODUCTION_PRESENTATION_SHADOW_IMPORT',
      'contract_version', 'production-presentation-shadow-v1',
      'source_tabs', '["Tournaments","Live Tournaments","Players","Handicaps","Team Names","Courses","Live Matches","Matches","Tournament Timeline","Net Skins","Calcutta Purchases","Calcutta Ownership","Calcutta Point Structure","Calcutta Payout"]'::jsonb,
      'requested_by', coalesce(nullif(btrim(input->>'requested_by'), ''), 'production-presentation-shadow-readback'),
      'request_fingerprint', repeat('0', 64), 'source_fingerprint', repeat('0', 64),
      'payload_fingerprint', repeat('0', 64), 'current_shadow_source_fingerprint', repeat('0', 64),
      'current_shadow_database_fingerprint', repeat('0', 64),
      'safety', jsonb_build_object(
        'shadow_only', true, 'authoritative', false, 'scoring_authority', 'GOOGLE',
        'participant_identity_authority', 'PASSPORT', 'scoring_ingress_enabled', false,
        'public_reads_enabled', false, 'workers_enabled', false, 'google_writes', 0,
        'outbox_events', 0, 'archive_jobs', 0, 'mirror_jobs', 0
      )
    )
  );
  select value.* into revision
  from production_control.presentation_shadow_current pointer
  join production_control.presentation_shadow_revisions value using (revision_id)
  where pointer.tournament_id = '2026';
  if revision.revision_id is null then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_PRESENTATION_SHADOW_NOT_IMPORTED');
  end if;
  projection := production_control.production_presentation_shadow_projection('2026');
  fingerprint_value := encode(extensions.digest(projection::text, 'sha256'), 'hex');
  return jsonb_build_object(
    'ok', true, 'shadow_only', true, 'authoritative', false,
    'revision', to_jsonb(revision) - 'source_payload' - 'projection_payload',
    'projection', projection, 'database_fingerprint', fingerprint_value,
    'parity', projection = revision.projection_payload and fingerprint_value = revision.database_fingerprint,
    'authority', 'GOOGLE', 'scoring_ingress', 'DISABLED',
    'google_write', false, 'outbox_events', 0, 'archive_jobs', 0, 'mirror_jobs', 0
  );
end;
$$;

revoke all on function public.read_production_presentation_shadow_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_presentation_shadow_v1(jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
