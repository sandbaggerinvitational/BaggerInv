-- Step 13E.7A Production future runtime promotion and activation V1.
--
-- Installation is inert.  It installs bounded future-tournament runtime,
-- handicap, pairing, snapshot, compatibility-provisioning, activation, close,
-- and archive-planning contracts.  It does not create a future tournament,
-- move the current-tournament pointer, change 2026 evidence, or mutate a score.
begin;

create table scoring_authority.global_course_catalog_v1 (
  course_id text primary key check (
    course_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$'
  ),
  display_name text not null check (
    pg_catalog.btrim(display_name) <> ''
    and pg_catalog.length(display_name) <= 240
  ),
  location text,
  catalog_status text not null default 'ACTIVE' check (
    catalog_status in ('ACTIVE', 'INACTIVE')
  ),
  identity_source text not null check (
    identity_source in ('PRESERVED_EXISTING', 'DIRECTOR_CREATED')
  ),
  catalog_revision bigint not null check (catalog_revision > 0),
  created_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  created_by_auth_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (location is null or (
    pg_catalog.btrim(location) <> ''
    and pg_catalog.length(location) <= 240
  ))
);

create table production_control.global_course_id_allocator_v1 (
  scope_key text primary key check (scope_key = 'BAGGER_INV_PRODUCTION'),
  next_number bigint not null check (next_number between 1 and 999999),
  allocator_revision bigint not null check (allocator_revision > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

insert into production_control.global_course_id_allocator_v1 (
  scope_key, next_number, allocator_revision
) values ('BAGGER_INV_PRODUCTION', 1, 1);

-- A Director-created global Course is deliberately not a scoring context by
-- itself.  The permanent tee and all 18 holes must be installed and validated
-- before a future tournament can reference it.  These rows are global library
-- facts; tournament assignment remains an explicit, separate operation.
create table scoring_authority.global_course_tee_contexts_v1 (
  course_id text not null references scoring_authority.global_course_catalog_v1(
    course_id
  ) on delete restrict,
  tee_id text not null check (
    pg_catalog.btrim(tee_id) <> '' and pg_catalog.length(tee_id) <= 120
  ),
  rating numeric not null check (rating > 0 and rating <= 100),
  slope integer not null check (slope between 55 and 155),
  par integer not null check (par between 54 and 90),
  context_revision bigint not null check (context_revision > 0),
  configured_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  configured_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  configured_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (course_id, tee_id)
);

create table scoring_authority.global_course_hole_contexts_v1 (
  course_id text not null,
  tee_id text not null,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer not null check (par between 3 and 6),
  stroke_index integer not null check (stroke_index between 1 and 18),
  yardage integer check (yardage is null or yardage between 1 and 999),
  context_revision bigint not null check (context_revision > 0),
  primary key (course_id, tee_id, hole_number),
  unique (course_id, tee_id, stroke_index),
  foreign key (course_id, tee_id)
    references scoring_authority.global_course_tee_contexts_v1(
      course_id, tee_id
    ) on delete restrict
);

-- Migration 064 intentionally allowed only copied 2026 contexts.  Extend that
-- staged reference contract narrowly for a validated permanent global-course
-- context; existing 2026 references retain their exact semantics.
alter table production_control.future_tournament_course_references_v1
  drop constraint if exists
    future_tournament_course_references_v1_reference_status_check,
  drop constraint if exists future_tournament_course_references_v1_check,
  drop constraint if exists
    future_tournament_course_references__source_tournament_id_check;

alter table production_control.future_tournament_course_references_v1
  add constraint production_future_course_reference_status_v2 check (
    reference_status in ('EXISTING_REFERENCE', 'GLOBAL_COURSE_CONTEXT')
  ),
  add constraint production_future_course_reference_source_v2 check (
    (reference_status = 'EXISTING_REFERENCE'
      and source_tournament_id = '2026')
    or (reference_status = 'GLOBAL_COURSE_CONTEXT'
      and source_tournament_id = tournament_id
      and source_round_number is null
      and source_setup_revision is not null)
  );

-- Installation must not create a Course fact.  This read-only union preserves
-- all established IDs while the catalog table holds only explicit future
-- Director-created global Courses.
create view scoring_authority.global_course_library_v1
with (security_invoker = true)
as
select distinct on (source.course_id)
  source.course_id, source.display_name, source.location,
  source.catalog_status, source.identity_source, source.catalog_revision
from (
  select value.course_id, value.display_name, value.location,
    value.catalog_status, value.identity_source, value.catalog_revision,
    1 priority
  from scoring_authority.global_course_catalog_v1 value
  union all
  select tee.course_id, tee.display_name, tee.location,
    'ACTIVE'::text, 'PRESERVED_EXISTING'::text, 1::bigint, 2
  from scoring_authority.tournament_setup_course_tees_v1 tee
  union all
  select identity.course_id, identity.canonical_name,
    identity.canonical_location, 'ACTIVE'::text,
    'PRESERVED_EXISTING'::text, 1::bigint, 3
  from scoring_authority.completed_history_course_identities identity
  union all
  select snapshot.course_id, snapshot.course_id, null::text,
    'ACTIVE'::text, 'PRESERVED_EXISTING'::text, 1::bigint, 4
  from scoring_authority.scoring_snapshots snapshot
) source
where source.course_id is not null
  and pg_catalog.btrim(source.course_id) <> ''
order by source.course_id, source.priority;

create table production_control.future_runtime_promotions_v2 (
  tournament_id text primary key references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  contract_version text not null check (
    contract_version = 'production-future-runtime-activation-v2'
  ),
  promotion_revision bigint not null check (promotion_revision > 0),
  source_setup_revision bigint not null check (source_setup_revision > 0),
  promoted_manifest_fingerprint text not null check (
    promoted_manifest_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  runtime_status text not null check (
    runtime_status in ('PROMOTED', 'READY', 'ACTIVE', 'CLOSED')
  ),
  promoted_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  promoted_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  promoted_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table production_control.future_runtime_match_bindings_v2 (
  tournament_id text not null references
    production_control.future_runtime_promotions_v2(tournament_id)
    on delete restrict,
  match_id text not null unique references scoring_authority.matches(match_id)
    on delete restrict,
  structural_setup_revision bigint not null check (
    structural_setup_revision > 0
  ),
  runtime_revision bigint not null check (runtime_revision > 0),
  runtime_state text not null default 'PROMOTED' check (
    runtime_state in ('PROMOTED', 'CONFIGURED', 'PAIRED', 'PREPARED')
  ),
  configuration_fingerprint text check (
    configuration_fingerprint is null
    or configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, match_id)
);

create table production_control.future_annual_projection_bindings_v1 (
  tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  domain text not null check (
    domain in ('GUIDE', 'DRAFT', 'PREDICTION_SETTINGS')
  ),
  source_workbook_id text not null check (
    pg_catalog.btrim(source_workbook_id) <> ''
  ),
  source_revision bigint not null check (source_revision > 0),
  binding_revision bigint not null check (binding_revision > 0),
  source_fingerprint text not null check (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  payload_fingerprint text not null check (
    payload_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  projection jsonb not null check (
    pg_catalog.jsonb_typeof(projection) = 'object'
  ),
  certification_status text not null check (
    certification_status in ('DRAFT', 'CERTIFIED')
  ),
  certified_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  certified_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, domain),
  check (
    (certification_status = 'CERTIFIED'
      and certified_by_player_id is not null and certified_at is not null)
    or (certification_status = 'DRAFT' and certified_at is null)
  )
);

create table participant_identity.future_tournament_identity_contexts_v1 (
  tournament_id text primary key references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  contract_version text not null check (
    contract_version = 'production-future-participant-identity-context-v1'
  ),
  binding_revision bigint not null check (binding_revision > 0),
  source_identity_tournament_id text not null check (
    source_identity_tournament_id = '2026'
  ),
  source_context_revision bigint not null check (source_context_revision > 0),
  source_configuration_fingerprint text not null check (
    source_configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  binding_fingerprint text not null check (
    binding_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  roster_count integer not null check (roster_count > 0),
  enrolled_count integer not null check (
    enrolled_count >= 0 and enrolled_count <= roster_count
  ),
  not_enrolled_count integer not null check (
    not_enrolled_count >= 0
    and enrolled_count + not_enrolled_count = roster_count
  ),
  status text not null check (status = 'CERTIFIED'),
  certified_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  certified_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  certified_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table participant_identity.future_tournament_participant_bindings_v1 (
  tournament_id text not null references
    participant_identity.future_tournament_identity_contexts_v1(tournament_id)
    on delete restrict,
  player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  enrollment_state text not null check (
    enrollment_state in ('ENROLLED', 'NOT_ENROLLED')
  ),
  source_identity_tournament_id text check (
    source_identity_tournament_id is null
    or source_identity_tournament_id = '2026'
  ),
  source_configuration_revision bigint,
  source_contact_fingerprint text check (
    source_contact_fingerprint is null
    or source_contact_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  bound_link_revision bigint,
  binding_revision bigint not null check (binding_revision > 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (tournament_id, player_id),
  check (
    (enrollment_state = 'ENROLLED'
      and source_identity_tournament_id = '2026'
      and source_configuration_revision is not null
      and source_contact_fingerprint is not null)
    or (enrollment_state = 'NOT_ENROLLED'
      and source_identity_tournament_id is null
      and source_configuration_revision is null
      and source_contact_fingerprint is null)
  )
);

-- Future annual Director selection is explicit governance, not a clone of the
-- current tournament's role. This row is created only by the bounded Owner
-- mutation below, so installation remains inert.
create table production_control.future_tournament_director_governance_v1 (
  tournament_id text primary key references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  governance_revision bigint not null check (governance_revision > 0),
  updated_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  updated_by_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table production_control.future_annual_runtime_generations_v1 (
  runtime_generation_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null unique references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  generation_status text not null check (
    generation_status in ('PREPARED', 'ACTIVE', 'CLOSED')
  ),
  runtime_revision bigint not null check (runtime_revision > 0),
  pointer_revision bigint not null check (pointer_revision > 0),
  authority_generation_id uuid not null,
  admission_generation_id uuid not null default extensions.gen_random_uuid(),
  authority text not null default 'SUPABASE' check (
    authority = 'SUPABASE'
  ),
  ingress_state text not null default 'OPEN' check (
    ingress_state = 'OPEN'
  ),
  readiness_fingerprint text not null check (
    readiness_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  activated_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  activated_by_auth_user_id uuid references auth.users(id) on delete restrict,
  activated_at timestamptz,
  closed_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  closed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (generation_status = 'PREPARED' and activated_at is null
      and closed_at is null)
    or (generation_status = 'ACTIVE' and activated_at is not null
      and closed_at is null)
    or (generation_status = 'CLOSED' and activated_at is not null
      and closed_at is not null)
  )
);

create unique index production_future_single_active_runtime_generation_v1
  on production_control.future_annual_runtime_generations_v1(
    generation_status
  ) where generation_status = 'ACTIVE';

create table production_control.future_archive_plans_v1 (
  archive_plan_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  plan_revision bigint not null check (plan_revision > 0),
  lifecycle_revision bigint not null check (lifecycle_revision > 0),
  source_fingerprint text not null check (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  archive_fingerprint text not null check (
    archive_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  readiness_status text not null check (
    readiness_status in ('READY', 'BLOCKED')
  ),
  blocker_codes jsonb not null default '[]'::jsonb check (
    pg_catalog.jsonb_typeof(blocker_codes) = 'array'
  ),
  promotion_status text not null default 'PLANNED_ONLY' check (
    promotion_status = 'PLANNED_ONLY'
  ),
  created_by_player_id text not null references scoring_authority.players(
    player_id
  ) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tournament_id, plan_revision)
);

create table production_control.future_runtime_operation_receipts_v2 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  tournament_id text,
  action text not null check (action in (
    'ADD_GLOBAL_COURSE', 'CONFIGURE_GLOBAL_COURSE_CONTEXT',
    'ASSIGN_FUTURE_COURSE', 'PROMOTE_RUNTIME_STRUCTURE',
    'BIND_ANNUAL_PROJECTION', 'STAGE_HANDICAPS', 'APPROVE_HANDICAPS',
    'CONFIGURE_MATCH', 'REPLACE_PAIRINGS', 'PREPARE_SCORING_CONTEXT',
    'GRANT_FUTURE_DIRECTOR',
    'MARK_READY_FOR_ACTIVATION', 'ACTIVATE_TOURNAMENT',
    'CLOSE_TOURNAMENT', 'PREPARE_ARCHIVE_PLAN'
  )),
  operation_request_id uuid not null,
  declared_request_payload_hash text not null check (
    declared_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  database_request_payload_hash text not null check (
    database_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  prior_revision bigint not null check (prior_revision >= 0),
  next_revision bigint not null check (next_revision >= prior_revision),
  response jsonb not null check (pg_catalog.jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (action, operation_request_id)
);

create table production_control.future_runtime_audit_events_v2 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text,
  action text not null,
  target_kind text not null check (target_kind in (
    'GLOBAL_COURSE', 'COURSE_ASSIGNMENT', 'RUNTIME',
    'ANNUAL_PROJECTION', 'HANDICAP',
    'MATCH', 'PAIRINGS', 'SCORING_CONTEXT', 'IDENTITY', 'ACTIVATION',
    'CLOSE', 'ARCHIVE_PLAN'
  )),
  target_id text not null,
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  prior_revision bigint not null check (prior_revision >= 0),
  next_revision bigint not null check (next_revision >= prior_revision),
  operation_request_id uuid not null,
  result text not null check (result in ('CHANGED', 'NO_CHANGE')),
  safe_metadata jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(safe_metadata) = 'object'
    and not (safe_metadata ?| array[
      'email', 'phone', 'auth_user_id', 'authUserId', 'token', 'secret'
    ])
  ),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index production_future_runtime_audit_timeline_v2
  on production_control.future_runtime_audit_events_v2(
    tournament_id, occurred_at desc, event_id
  );

-- Extend the deliberately inert 064 compatibility job into a leased worker
-- queue.  Existing rows remain PROVISIONING_REQUIRED and no job is claimed.
alter table production_control.future_match_google_compatibility_jobs_v1
  drop constraint if exists future_match_google_compatibility_jobs_v1_writer_installed_check,
  drop constraint if exists future_match_google_compatibility_jobs_v1_status_check,
  drop constraint if exists future_match_google_compatibility_jobs_v1_check;

alter table production_control.future_match_google_compatibility_jobs_v1
  add column if not exists attempts integer not null default 0,
  add column if not exists available_at timestamptz not null
    default pg_catalog.clock_timestamp(),
  add column if not exists lease_expires_at timestamptz,
  add column if not exists claimed_by text,
  add column if not exists claim_token uuid,
  add column if not exists expected_manifest_fingerprint text,
  add column if not exists readback_fingerprint text,
  add column if not exists readback_checkpoint jsonb,
  add column if not exists last_attempt_at timestamptz;

alter table production_control.future_match_google_compatibility_jobs_v1
  -- Preserve migration 064's false-only writer boundary until the retained
  -- compatibility worker is explicitly authorized to replace that guard.
  alter column writer_installed set default false,
  add constraint production_future_google_job_status_v2 check (status in (
    'PROVISIONING_REQUIRED', 'PROCESSING', 'RETRYABLE', 'CERTIFIED',
    'NOT_REQUIRED', 'BLOCKED', 'FAILED'
  )),
  add constraint production_future_google_job_attempts_v2 check (attempts >= 0),
  add constraint production_future_google_job_manifest_v2 check (
    expected_manifest_fingerprint is null
    or expected_manifest_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint production_future_google_job_readback_v2 check (
    readback_fingerprint is null
    or readback_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint production_future_google_job_shape_v2 check (
    (status = 'PROCESSING' and claim_token is not null
      and lease_expires_at is not null and claimed_by is not null)
    or (status <> 'PROCESSING' and claim_token is null
      and lease_expires_at is null and claimed_by is null)
  ),
  add constraint production_future_google_job_certified_v2 check (
    (status = 'CERTIFIED' and certified_at is not null
      and readback_fingerprint is not null
      and pg_catalog.jsonb_typeof(readback_checkpoint) = 'object')
    or (status <> 'CERTIFIED' and certified_at is null)
  );

-- A future match may exist before its first prepared scoring snapshot, but
-- only while private, UPCOMING, locked, and entirely free of scoring facts.
alter table scoring_authority.matches
  alter column scoring_snapshot_id drop not null;

alter table scoring_authority.matches
  add constraint production_future_unprepared_match_shape_v1 check (
    scoring_snapshot_id is not null
    or (
      status = 'UPCOMING' and scoring_locked
      and match_revision = 0 and scored_holes = 0 and current_hole = 0
      and holes_remaining = 18 and unresolved_mutations = 0
      and not scorecard_complete and finalized_at is null
    )
  );

alter table scoring_authority.global_course_catalog_v1 enable row level security;
alter table scoring_authority.global_course_tee_contexts_v1
  enable row level security;
alter table scoring_authority.global_course_hole_contexts_v1
  enable row level security;
alter table production_control.global_course_id_allocator_v1 enable row level security;
alter table production_control.future_runtime_promotions_v2 enable row level security;
alter table production_control.future_runtime_match_bindings_v2 enable row level security;
alter table production_control.future_annual_projection_bindings_v1 enable row level security;
alter table participant_identity.future_tournament_identity_contexts_v1
  enable row level security;
alter table participant_identity.future_tournament_participant_bindings_v1
  enable row level security;
alter table production_control.future_tournament_director_governance_v1
  enable row level security;
alter table production_control.future_annual_runtime_generations_v1 enable row level security;
alter table production_control.future_archive_plans_v1 enable row level security;
alter table production_control.future_runtime_operation_receipts_v2 enable row level security;
alter table production_control.future_runtime_audit_events_v2 enable row level security;

create or replace function production_control.reject_future_runtime_immutable_v2()
returns trigger
language plpgsql
set search_path = pg_catalog, production_control
as $$
begin
  raise exception using errcode = '55000',
    message = 'PRODUCTION_FUTURE_RUNTIME_IMMUTABLE_RECORD';
end;
$$;

create or replace function production_control.assert_future_compatibility_worker_v1(
  input jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  scope production_control.resource_scope%rowtype;
begin
  begin
    perform production_control.assert_production_service_role();
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_COMPATIBILITY_SERVICE_ROLE_REQUIRED';
  end;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'contract_version'
       is distinct from 'production-future-google-match-provisioning-v1'
     or input->>'environment' is distinct from 'PRODUCTION'
     or input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id' is distinct from scope.google_workbook_id
     or coalesce(input->>'target_tournament_id', '') !~ '^[0-9]{4}$'
     or input->>'target_tournament_id' = scope.current_tournament_id then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_COMPATIBILITY_SCOPE_REQUIRED';
  end if;
end;
$$;

create or replace function production_control.future_google_match_manifest_v1(
  target_match text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  match_value scoring_authority.matches%rowtype;
  detail scoring_authority.tournament_setup_match_details_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  template_live text;
  template_archive text;
  team_1_player_1 text;
  team_1_player_2 text;
  team_2_player_1 text;
  team_2_player_2 text;
  logical_fields jsonb;
begin
  select value.* into strict match_value
  from scoring_authority.matches value where value.match_id = target_match;
  select value.* into strict detail
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.match_id = target_match;
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = match_value.tournament_id;
  select pg_catalog.min(value.match_id) into template_live
  from scoring_authority.matches value
  where value.tournament_id = '2026' and value.format = match_value.format
    and exists (
      select 1 from scoring_authority.google_match_checkpoints checkpoint
      where checkpoint.match_id = value.match_id
    );
  select pg_catalog.min(value.match_id) into template_archive
  from scoring_authority.matches value
  where value.tournament_id = '2026' and value.format = match_value.format
    and value.status = 'FINAL'
    and exists (
      select 1 from scoring_authority.finalized_scorecard_snapshots final
      where final.match_id = value.match_id and final.state = 'CURRENT'
    );
  template_archive := coalesce(template_archive, template_live);
  if template_live is null or template_archive is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_TEMPLATE_REQUIRED';
  end if;
  select
    pg_catalog.max(value.player_id) filter (
      where value.team_side = 1 and value.player_slot = 1),
    pg_catalog.max(value.player_id) filter (
      where value.team_side = 1 and value.player_slot = 2),
    pg_catalog.max(value.player_id) filter (
      where value.team_side = 2 and value.player_slot = 1),
    pg_catalog.max(value.player_id) filter (
      where value.team_side = 2 and value.player_slot = 2)
  into team_1_player_1, team_1_player_2,
    team_2_player_1, team_2_player_2
  from scoring_authority.match_participants value
  where value.match_id = target_match;
  logical_fields := pg_catalog.jsonb_build_object(
    'Year', catalog.tournament_year,
    'Round', match_value.round_number,
    'Format', match_value.format,
    'Match', detail.match_number,
    'Course ID', detail.course_id,
    'Tee Time', coalesce(detail.tee_time::text, ''),
    'Starting Hole', detail.starting_hole,
    'Team 1 Player 1', coalesce(team_1_player_1, ''),
    'Team 1 Player 2', coalesce(team_1_player_2, ''),
    'Team 2 Player 1', coalesce(team_2_player_1, ''),
    'Team 2 Player 2', coalesce(team_2_player_2, '')
  );
  return pg_catalog.jsonb_build_object(
    'contractVersion', 'production-future-google-match-provisioning-v1',
    'tournamentId', match_value.tournament_id,
    'tournamentYear', catalog.tournament_year,
    'matchId', target_match,
    'templateLiveMatchId', template_live,
    'templateArchiveMatchId', template_archive,
    'liveMatch', logical_fields,
    'archiveMatch', logical_fields
  );
end;
$$;

create or replace function public.claim_production_future_google_compatibility_job_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  job production_control.future_match_google_compatibility_jobs_v1%rowtype;
  claim_token_value uuid := extensions.gen_random_uuid();
  lease_seconds integer := 120;
  manifest jsonb;
  manifest_fingerprint text;
  worker_id text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
begin
  perform production_control.assert_future_compatibility_worker_v1(input);
  if worker_id !~ '^[A-Za-z0-9_.:-]{3,120}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_COMPATIBILITY_WORKER_INVALID';
  end if;
  begin
    lease_seconds := least(300, greatest(30,
      coalesce((input->>'lease_seconds')::integer, 120)));
  exception when others then
    lease_seconds := 120;
  end;
  select value.* into job
  from production_control.future_match_google_compatibility_jobs_v1 value
  join production_control.future_runtime_match_bindings_v2 binding
    on binding.tournament_id = value.tournament_id
   and binding.match_id = value.match_id
  where value.tournament_id = input->>'target_tournament_id'
    and value.writer_installed
    and value.status in ('PROVISIONING_REQUIRED', 'RETRYABLE')
    and value.available_at <= pg_catalog.clock_timestamp()
    and binding.runtime_state = 'PREPARED'
  order by value.created_at, value.match_id
  for update of value skip locked limit 1;
  if job.job_id is null then
    return pg_catalog.jsonb_build_object('ok', true, 'job', null);
  end if;
  manifest := production_control.future_google_match_manifest_v1(job.match_id);
  manifest_fingerprint := production_control.future_runtime_hash_v2(manifest);
  update production_control.future_match_google_compatibility_jobs_v1 value set
    status = 'PROCESSING', attempts = value.attempts + 1,
    claimed_by = worker_id, claim_token = claim_token_value,
    lease_expires_at = pg_catalog.clock_timestamp()
      + pg_catalog.make_interval(secs => lease_seconds),
    last_attempt_at = pg_catalog.clock_timestamp(),
    expected_manifest_fingerprint = manifest_fingerprint,
    safe_error_code = null, updated_at = pg_catalog.clock_timestamp()
  where value.job_id = job.job_id;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'job', pg_catalog.jsonb_build_object(
      'jobId', job.job_id, 'tournamentId', job.tournament_id,
      'matchId', job.match_id, 'claimToken', claim_token_value,
      'attempt', job.attempts + 1,
      'expectedManifestFingerprint', manifest_fingerprint,
      'manifest', manifest,
      'requiredArtifacts', pg_catalog.jsonb_build_array(
        'LIVE_MATCHES_ROW', 'MATCHES_ROW'
      ),
      'sourceWorkbookId', input->>'source_workbook_id'
    )
  );
end;
$$;

create or replace function public.complete_production_future_google_compatibility_job_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  job production_control.future_match_google_compatibility_jobs_v1%rowtype;
begin
  perform production_control.assert_future_compatibility_worker_v1(input);
  select value.* into strict job
  from production_control.future_match_google_compatibility_jobs_v1 value
  where value.job_id = (input->>'job_id')::uuid
    and value.tournament_id = input->>'target_tournament_id'
  for update;
  if job.status = 'CERTIFIED' then
    if job.readback_fingerprint is distinct from input->>'readback_fingerprint'
       or job.expected_manifest_fingerprint
         is distinct from input->>'expected_manifest_fingerprint' then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_COMPATIBILITY_COMPLETION_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'status', 'CERTIFIED', 'idempotent', true
    );
  end if;
  if job.status <> 'PROCESSING'
     or job.claim_token is distinct from (input->>'claim_token')::uuid
     or job.lease_expires_at <= pg_catalog.clock_timestamp()
     or input->>'expected_manifest_fingerprint'
       is distinct from job.expected_manifest_fingerprint
     or input->>'readback_fingerprint' !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input->'readback_checkpoint') <> 'object'
     or coalesce((input#>>'{readback_checkpoint,liveMatchVerified}')::boolean,
       false) is not true
     or coalesce((input#>>'{readback_checkpoint,archiveMatchVerified}')::boolean,
       false) is not true then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_FUTURE_COMPATIBILITY_COMPLETION_STALE';
  end if;
  update production_control.future_match_google_compatibility_jobs_v1 value set
    status = 'CERTIFIED', readback_fingerprint = input->>'readback_fingerprint',
    readback_checkpoint = input->'readback_checkpoint',
    certified_at = pg_catalog.clock_timestamp(), claim_token = null,
    claimed_by = null, lease_expires_at = null, safe_error_code = null,
    updated_at = pg_catalog.clock_timestamp()
  where value.job_id = job.job_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 'CERTIFIED', 'jobId', job.job_id,
    'matchId', job.match_id, 'readbackFingerprint',
      input->>'readback_fingerprint', 'idempotent', false
  );
end;
$$;

create or replace function public.fail_production_future_google_compatibility_job_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  job production_control.future_match_google_compatibility_jobs_v1%rowtype;
  retryable boolean := coalesce((input->>'retryable')::boolean, false);
  next_status text;
  safe_code text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'safe_error_code', ''
  )));
begin
  perform production_control.assert_future_compatibility_worker_v1(input);
  select value.* into strict job
  from production_control.future_match_google_compatibility_jobs_v1 value
  where value.job_id = (input->>'job_id')::uuid
    and value.tournament_id = input->>'target_tournament_id'
  for update;
  if job.status <> 'PROCESSING'
     or job.claim_token is distinct from (input->>'claim_token')::uuid
     or safe_code !~ '^[A-Z0-9_]{3,120}$' then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_FUTURE_COMPATIBILITY_FAILURE_STALE';
  end if;
  next_status := case when retryable and job.attempts < 10
    then 'RETRYABLE' else 'BLOCKED' end;
  update production_control.future_match_google_compatibility_jobs_v1 value set
    status = next_status, safe_error_code = safe_code,
    available_at = case when next_status = 'RETRYABLE'
      then pg_catalog.clock_timestamp() + interval '30 seconds'
      else value.available_at end,
    claim_token = null, claimed_by = null, lease_expires_at = null,
    updated_at = pg_catalog.clock_timestamp()
  where value.job_id = job.job_id;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', next_status, 'jobId', job.job_id,
    'matchId', job.match_id, 'retryable', next_status = 'RETRYABLE'
  );
end;
$$;

create trigger production_future_runtime_receipt_immutable_v2
before update or delete on production_control.future_runtime_operation_receipts_v2
for each row execute function production_control.reject_future_runtime_immutable_v2();

create trigger production_future_runtime_audit_immutable_v2
before update or delete on production_control.future_runtime_audit_events_v2
for each row execute function production_control.reject_future_runtime_immutable_v2();

create trigger production_future_archive_plan_immutable_v1
before update or delete on production_control.future_archive_plans_v1
for each row execute function production_control.reject_future_runtime_immutable_v2();

create or replace function production_control.future_runtime_hash_v2(value jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(value::text, 'sha256'), 'hex')
$$;

create or replace function production_control.guard_future_unprepared_match_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  catalog production_control.future_tournament_catalog_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  if new.scoring_snapshot_id is not null then
    return new;
  end if;
  select value.* into catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = new.tournament_id;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if catalog.tournament_id is null
     or catalog.lifecycle not in (
       'DRAFT', 'CONFIGURING', 'READY_FOR_ACTIVATION'
     )
     or pointer.tournament_id = new.tournament_id
     or new.status <> 'UPCOMING'
     or not new.scoring_locked
     or new.match_revision <> 0
     or new.scored_holes <> 0
     or new.current_hole <> 0
     or new.holes_remaining <> 18
     or new.unresolved_mutations <> 0
     or new.scorecard_complete
     or new.finalized_at is not null
     or exists (select 1 from scoring_authority.hole_scores value
       where value.match_id = new.match_id)
     or exists (select 1 from scoring_authority.score_mutations value
       where value.match_id = new.match_id)
     or exists (select 1 from scoring_authority.scoring_permissions value
       where value.match_id = new.match_id and value.can_score)
     or exists (select 1 from scoring_authority.scoring_ingress_leases value
       where value.match_id = new.match_id
         and value.expires_at > pg_catalog.clock_timestamp()) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_UNPREPARED_MATCH_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

create trigger production_guard_future_unprepared_match_v1
before insert or update of scoring_snapshot_id, status, scoring_locked,
  match_revision, scored_holes, current_hole, holes_remaining,
  unresolved_mutations, scorecard_complete, finalized_at
on scoring_authority.matches
for each row execute function production_control.guard_future_unprepared_match_v1();

create or replace function production_control.assert_future_runtime_service_scope_v2(
  input jsonb,
  require_director boolean default true,
  require_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
begin
  begin
    perform production_control.assert_production_service_role();
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_SERVICE_ROLE_REQUIRED';
  end;
  if input->>'contract_version'
       is distinct from 'production-future-runtime-activation-v2'
     or input->>'environment' is distinct from 'PRODUCTION' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_SCOPE_REQUIRED';
  end if;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id' is distinct from scope.google_workbook_id
     or input->>'project_ref' ~* '(preview|staging|test)'
     or input->>'source_workbook_id' ~* '(preview|staging|test)' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_EXACT_RESOURCE_REQUIRED';
  end if;
  if not require_director then
    return;
  end if;
  if actor_player !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
     or coalesce(input#>>'{authorization,auth_user_id}', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or input#>>'{authorization,role}' is distinct from 'DIRECTOR' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_DIRECTOR_REQUIRED';
  end if;
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_DIRECTOR_REQUIRED';
  end;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input#>>'{authorization,tournament_id}'
       is distinct from scope.current_tournament_id
     or not exists (
       select 1 from production_control.director_entitlements entitlement
       where entitlement.tournament_id = scope.current_tournament_id
         and entitlement.player_id = actor_player
         and entitlement.auth_user_id = actor_auth
         and entitlement.role in ('DIRECTOR', 'OWNER')
         and entitlement.status = 'ACTIVE'
         and entitlement.revoked_at is null
     ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_FUTURE_RUNTIME_DIRECTOR_REQUIRED';
  end if;
  if require_owner then
    begin
      -- Owner governance was deliberately adopted against the immutable 2026
      -- Production governance root and is not cloned into annual memberships.
      perform production_control.assert_access_governance_owner_v1(
        '2026', actor_player, actor_auth
      );
    exception when others then
      raise exception using errcode = '42501',
        message = 'PRODUCTION_FUTURE_RUNTIME_OWNER_REQUIRED';
    end;
  end if;
end;
$$;

create or replace function production_control.allocate_global_course_id_v1()
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  allocator production_control.global_course_id_allocator_v1%rowtype;
  candidate text;
begin
  select value.* into strict allocator
  from production_control.global_course_id_allocator_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  loop
    if allocator.next_number > 999999 then
      raise exception using errcode = '54000',
        message = 'PRODUCTION_GLOBAL_COURSE_ID_SPACE_EXHAUSTED';
    end if;
    candidate := 'CRS' || pg_catalog.lpad(
      allocator.next_number::text, 6, '0'
    );
    allocator.next_number := allocator.next_number + 1;
    exit when not exists (
      select 1 from scoring_authority.global_course_library_v1 value
      where value.course_id = candidate
    );
  end loop;
  update production_control.global_course_id_allocator_v1 set
    next_number = allocator.next_number,
    allocator_revision = allocator_revision + 1,
    updated_at = pg_catalog.clock_timestamp()
  where scope_key = 'BAGGER_INV_PRODUCTION';
  return candidate;
end;
$$;

create or replace function production_control.future_runtime_readiness_v2(
  target_tournament text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  catalog production_control.future_tournament_catalog_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  blockers jsonb := '[]'::jsonb;
  blocker_count integer;
  team_count integer;
  roster_count integer;
  round_count integer;
  course_count integer;
  match_count integer;
  paired_count integer;
  prepared_count integer;
  compat_count integer;
  projection_count integer;
  handicap_revision bigint;
  fingerprint_value text;
begin
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target_tournament;
  select value.* into promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into team_count
  from scoring_authority.teams value
  where value.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into roster_count
  from scoring_authority.tournament_players value
  where value.tournament_id = target_tournament
    and value.participation_status = 'ACTIVE';
  select pg_catalog.count(*)::integer into round_count
  from scoring_authority.rounds value
  where value.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into course_count
  from scoring_authority.tournament_setup_round_courses_v1 value
  where value.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into match_count
  from scoring_authority.matches value
  where value.tournament_id = target_tournament;
  select pg_catalog.count(*)::integer into paired_count
  from scoring_authority.matches match_value
  where match_value.tournament_id = target_tournament
    and (select pg_catalog.count(*)
      from scoring_authority.match_participants participant
      where participant.match_id = match_value.match_id) =
      case when match_value.format = 'SI' then 2 else 4 end;
  select pg_catalog.count(*)::integer into prepared_count
  from scoring_authority.matches match_value
  join production_control.future_runtime_match_bindings_v2 binding
    on binding.match_id = match_value.match_id
   and binding.tournament_id = match_value.tournament_id
  join scoring_authority.tournament_setup_match_details_v1 detail
    on detail.match_id = match_value.match_id
  where match_value.tournament_id = target_tournament
    and match_value.scoring_snapshot_id is not null
    and binding.runtime_state = 'PREPARED'
    and detail.prepared_setup_revision = detail.setup_revision
    and detail.prepared_configuration_fingerprint =
      binding.configuration_fingerprint;
  select pg_catalog.count(*)::integer into compat_count
  from production_control.future_match_google_compatibility_jobs_v1 value
  where value.tournament_id = target_tournament
    and value.status in ('CERTIFIED', 'NOT_REQUIRED');
  select pg_catalog.count(*)::integer into projection_count
  from production_control.future_annual_projection_bindings_v1 value
  where value.tournament_id = target_tournament
    and value.certification_status = 'CERTIFIED';
  select value.revision_number into handicap_revision
  from scoring_authority.handicap_revision_current value
  where value.tournament_id = target_tournament;

  if promotion.tournament_id is null then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code',
        'FUTURE_RUNTIME_PROMOTION_REQUIRED', 'section', 'Runtime',
        'message', 'Promote the reviewed tournament structure.')
    );
  end if;
  if team_count <> 2 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'FUTURE_TEAMS_INCOMPLETE',
        'section', 'Teams', 'message', 'Exactly two teams are required.')
    );
  end if;
  if roster_count = 0 or exists (
    select 1 from scoring_authority.tournament_players value
    where value.tournament_id = target_tournament
      and value.participation_status = 'ACTIVE'
      and (value.team_id is null or value.team_side is null)
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'FUTURE_ROSTER_INCOMPLETE',
        'section', 'Roster',
        'message', 'Roster membership and team assignment are incomplete.')
    );
  end if;
  if handicap_revision is null or exists (
    select 1 from scoring_authority.tournament_players value
    where value.tournament_id = target_tournament
      and value.participation_status = 'ACTIVE'
      and (value.handicap_revision_id is null
        or value.tournament_handicap is null)
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code',
        'FUTURE_APPROVED_HANDICAP_REVISION_REQUIRED',
        'section', 'Handicaps',
        'message', 'Approve a complete tournament handicap revision.')
    );
  end if;
  if round_count = 0 or course_count <> round_count then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'FUTURE_COURSES_INCOMPLETE',
        'section', 'Courses',
        'message', 'Each round needs a certified course and tee.')
    );
  end if;
  if exists (
    select 1 from scoring_authority.tournament_setup_round_courses_v1 assignment
    where assignment.tournament_id = target_tournament
      and ((select pg_catalog.count(*)
        from scoring_authority.tournament_setup_course_holes_v1 hole
        where hole.tournament_id = assignment.tournament_id
          and hole.course_id = assignment.course_id
          and hole.tee_id = assignment.tee_id) <> 18
      or (select pg_catalog.count(distinct hole.stroke_index)
        from scoring_authority.tournament_setup_course_holes_v1 hole
        where hole.tournament_id = assignment.tournament_id
          and hole.course_id = assignment.course_id
          and hole.tee_id = assignment.tee_id) <> 18)
  ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code',
        'FUTURE_COURSE_HOLES_INCOMPLETE', 'section', 'Courses',
        'message', 'Every selected tee needs 18 unique stroke indexes.')
    );
  end if;
  if match_count = 0 or paired_count <> match_count
     or prepared_count <> match_count then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code',
        'FUTURE_MATCH_SCORING_CONTEXT_INCOMPLETE', 'section', 'Matches',
        'message', 'Pair and prepare every promoted match.')
    );
  end if;
  if compat_count <> match_count then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code',
        'FUTURE_GOOGLE_COMPATIBILITY_NOT_CERTIFIED',
        'section', 'Compatibility',
        'message', 'Downstream Google compatibility is not certified.')
    );
  end if;
  if projection_count <> 3 then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code',
        'FUTURE_ANNUAL_PROJECTIONS_NOT_CERTIFIED',
        'section', 'Annual content',
        'message', 'Guide, Draft, and Prediction Settings need certified annual revisions.')
    );
  end if;
  if pg_catalog.to_regprocedure(
    'production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)'
  ) is null then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code',
        'FUTURE_SCORING_RUNTIME_CAPABILITY_NOT_INSTALLED',
        'section', 'Scoring',
        'message', 'The certified annual scoring runtime is not installed.')
    );
  end if;
  if pg_catalog.to_regprocedure(
    'production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid)'
  ) is null then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code',
        'FUTURE_PARTICIPANT_IDENTITY_CAPABILITY_NOT_INSTALLED',
        'section', 'Identity',
        'message', 'The certified annual participant identity binding is not installed.')
    );
  end if;
  -- Frozen 2026 scoring RPCs do not yet consume annual lifecycle state.  Keep
  -- first future activation explicitly blocked until a separately authorized
  -- shared scoring-admission overlay proves a CLOSED predecessor cannot accept
  -- another ordinary score/control mutation.  Migration 066 does not rewrite
  -- those certified RPCs or pretend catalog metadata is an enforcement fence.
  blockers := blockers || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('code',
      'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED',
      'section', 'Activation',
      'message', 'The current tournament close fence is not yet certified for activation.')
  );
  -- The future-only pointer-aware read dispatcher is installed by this
  -- migration. No caller-controlled manifest or payload can attest it.
  if exists (select 1 from scoring_authority.matches value
    where value.tournament_id = target_tournament and (
      value.status <> 'UPCOMING' or value.match_revision <> 0
      or value.scored_holes <> 0 or value.unresolved_mutations <> 0
    )) or exists (
      select 1 from scoring_authority.scoring_permissions permission
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
        and permission.can_score and permission.revoked_at is null
    ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code',
        'FUTURE_PREACTIVATION_SCORING_FACTS_FORBIDDEN',
        'section', 'Scoring',
        'message', 'Future tournaments cannot contain scoring or access facts.')
    );
  end if;
  blocker_count := pg_catalog.jsonb_array_length(blockers);
  fingerprint_value := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion', 'production-future-runtime-readiness-v2',
      'tournamentId', target_tournament,
      'setupRevision', catalog.setup_revision,
      'lifecycleRevision', catalog.lifecycle_revision,
      'promotionRevision', promotion.promotion_revision,
      'promotionFingerprint', promotion.promoted_manifest_fingerprint,
      'handicapRevision', handicap_revision,
      'counts', pg_catalog.jsonb_build_object(
        'teams', team_count, 'roster', roster_count, 'rounds', round_count,
        'courses', course_count, 'matches', match_count,
        'pairings', paired_count, 'currentSnapshots', prepared_count,
        'compatibilityCertified', compat_count,
        'annualProjectionsCertified', projection_count
      ),
      'blockers', blockers
    )
  );
  return pg_catalog.jsonb_build_object(
    'contractVersion', 'production-future-runtime-readiness-v2',
    'tournamentId', target_tournament,
    'setupRevision', catalog.setup_revision,
    'lifecycleRevision', catalog.lifecycle_revision,
    'ready', blocker_count = 0,
    'fingerprint', fingerprint_value,
    'blockerCount', blocker_count,
    'blockers', blockers,
    'counts', pg_catalog.jsonb_build_object(
      'teams', team_count, 'roster', roster_count, 'rounds', round_count,
      'courses', course_count, 'matches', match_count,
      'pairings', paired_count, 'currentSnapshots', prepared_count,
      'compatibilityCertified', compat_count,
      'annualProjectionsCertified', projection_count
    )
  );
end;
$$;

create or replace function public.read_production_current_tournament_runtime_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
begin
  begin
    perform production_control.assert_production_service_role();
  exception when others then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CURRENT_TOURNAMENT_SERVICE_ROLE_REQUIRED';
  end;
  if input->>'contract_version'
       is distinct from 'production-current-tournament-runtime-v1'
     or input->>'environment' is distinct from 'PRODUCTION' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CURRENT_TOURNAMENT_SCOPE_REQUIRED';
  end if;
  select value.* into strict scope from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if input->>'project_ref' is distinct from scope.project_ref
     or input->>'project_url' is distinct from scope.project_url
     or input->>'source_workbook_id' is distinct from scope.google_workbook_id then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CURRENT_TOURNAMENT_EXACT_RESOURCE_REQUIRED';
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pointer.tournament_id;
  if catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CURRENT_TOURNAMENT_POINTER_NOT_ACTIVE';
  end if;
  select value.* into generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  -- The represented 2026 pointer predates annual generations.  It remains
  -- valid under the frozen Step-12 authority contracts.  Every later pointer
  -- must have an active annual runtime generation.
  if pointer.tournament_id <> '2026'
     and generation.runtime_generation_id is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CURRENT_TOURNAMENT_RUNTIME_GENERATION_REQUIRED';
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'production-current-tournament-runtime-v1',
    'tournamentId', pointer.tournament_id,
    'tournamentYear', pointer.tournament_year,
    'lifecycle', catalog.lifecycle,
    'pointerRevision', pointer.pointer_revision,
    'lifecycleRevision', catalog.lifecycle_revision,
    'runtimeGenerationId', generation.runtime_generation_id,
    'runtimeRevision', generation.runtime_revision,
    'authorityGenerationId', generation.authority_generation_id,
    'admissionGenerationId', generation.admission_generation_id,
    'status', case when pointer.tournament_id = '2026'
      then 'FROZEN_2026_RUNTIME' else generation.generation_status end
  );
end;
$$;

create or replace function public.read_production_future_annual_projection_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  domain_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'domain', ''
  )));
  binding production_control.future_annual_projection_bindings_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
begin
  perform production_control.assert_future_runtime_service_scope_v2(
    input, true, false
  );
  if domain_value not in ('GUIDE', 'DRAFT', 'PREDICTION_SETTINGS') then
    raise exception using errcode = '22023',
      message = 'FUTURE_ANNUAL_PROJECTION_DOMAIN_INVALID';
  end if;
  select value.* into binding
  from production_control.future_annual_projection_bindings_v1 value
  where value.tournament_id = target_id and value.domain = domain_value;
  select value.* into promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target_id;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'production-future-annual-projection-v1',
    'activation_revision', (select value.activation_revision
      from production_control.cutover_activation_state value
      where value.scope_key = 'BAGGER_INV_PRODUCTION'),
    'setup_revision', (select value.setup_revision
      from production_control.future_tournament_catalog_v1 value
      where value.tournament_id = target_id),
    'runtime_revision', coalesce(promotion.promotion_revision, 0),
    'current_projection', binding.projection,
    'canonical_context', pg_catalog.jsonb_build_object(
      'tournament', (select pg_catalog.to_jsonb(value)
        from scoring_authority.tournaments value
        where value.tournament_id = target_id),
      'players', coalesce((select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'player_id', player.player_id,
          'display_name', player.display_name
        ) order by player.player_id)
        from scoring_authority.players player
        join scoring_authority.tournament_players membership
          on membership.player_id = player.player_id
         and membership.tournament_id = target_id), '[]'::jsonb),
      'roster', coalesce((select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(value) order by value.player_id)
        from scoring_authority.tournament_players value
        where value.tournament_id = target_id), '[]'::jsonb),
      'teams', coalesce((select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(value) order by value.team_side)
        from scoring_authority.teams value
        where value.tournament_id = target_id), '[]'::jsonb),
      'handicaps', coalesce((select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'player_id', value.player_id,
          'tournament_handicap', value.tournament_handicap,
          'handicap_revision_id', value.handicap_revision_id
        ) order by value.player_id)
        from scoring_authority.tournament_players value
        where value.tournament_id = target_id), '[]'::jsonb),
      'canonical_course_context', coalesce((select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'round_number', assignment.round_number,
          'course_id', assignment.course_id,
          'tee_id', assignment.tee_id,
          'display_name', tee.display_name,
          'location', tee.location,
          'rating', tee.rating, 'slope', tee.slope, 'par', tee.par
        ) order by assignment.round_number)
        from scoring_authority.tournament_setup_round_courses_v1 assignment
        join scoring_authority.tournament_setup_course_tees_v1 tee
          on tee.tournament_id = assignment.tournament_id
         and tee.course_id = assignment.course_id
         and tee.tee_id = assignment.tee_id
        where assignment.tournament_id = target_id), '[]'::jsonb)
    ),
    'data', pg_catalog.jsonb_build_object(
      'domain', domain_value, 'tournament_id', target_id,
      'tournament_year', (select value.tournament_year
        from production_control.future_tournament_catalog_v1 value
        where value.tournament_id = target_id),
      'runtime_revision', coalesce(promotion.promotion_revision, 0),
      'revision_id', null, 'revision_number', binding.binding_revision,
      'source_revision', binding.source_revision,
      'source_workbook_id', binding.source_workbook_id,
      'source_fingerprint', binding.source_fingerprint,
      'payload_fingerprint', binding.payload_fingerprint,
      'validation_status', case when binding.certification_status = 'CERTIFIED'
        then 'VALID' else binding.certification_status end,
      'payload', binding.projection, 'projection', binding.projection,
      'status', binding.certification_status,
      'google_foreground_requests', 0, 'fallback_used', false,
      'authoritative', true, 'shadow_only', false
    ),
    'tournamentId', target_id,
    'domain', domain_value,
    'configured', binding.tournament_id is not null,
    'sourceWorkbookId', binding.source_workbook_id,
    'sourceRevision', binding.source_revision,
    'bindingRevision', binding.binding_revision,
    'sourceFingerprint', binding.source_fingerprint,
    'payloadFingerprint', binding.payload_fingerprint,
    'status', binding.certification_status,
    'certifiedAt', binding.certified_at
  );
end;
$$;

create or replace function public.synchronize_production_future_annual_projection_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  target_year integer;
  domain_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'domain', ''
  )));
  catalog production_control.future_tournament_catalog_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  existing production_control.future_annual_projection_bindings_v1%rowtype;
  next_revision bigint;
  actor_player text := pg_catalog.upper(pg_catalog.btrim(
    input#>>'{authorization,player_id}'
  ));
begin
  perform production_control.assert_future_runtime_service_scope_v2(
    input, true, false
  );
  begin target_year := (input->>'target_tournament_year')::integer;
  exception when others then
    raise exception using errcode = '22023',
      message = 'FUTURE_ANNUAL_PROJECTION_SCOPE_INVALID';
  end;
  if domain_value not in ('GUIDE', 'DRAFT', 'PREDICTION_SETTINGS')
     or coalesce(input->>'source_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'payload_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(coalesce(input->'projection', input->'payload'))
       <> 'object' then
    raise exception using errcode = '22023',
      message = 'FUTURE_ANNUAL_PROJECTION_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('future-annual-projection:' || target_id || ':' || domain_value, 0)
  );
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target_id for update;
  select value.* into promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target_id;
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target_id;
  select value.* into existing
  from production_control.future_annual_projection_bindings_v1 value
  where value.tournament_id = target_id and value.domain = domain_value
  for update;
  if target_id = (select tournament_id
      from production_control.current_tournament_pointer_v1
      where scope_key = 'BAGGER_INV_PRODUCTION')
     or catalog.tournament_year <> target_year
     or catalog.lifecycle not in ('DRAFT', 'CONFIGURING', 'READY_FOR_ACTIVATION')
     or resource.source_workbook_id is null
     or input->>'source_workbook_id' is distinct from resource.source_workbook_id then
    raise exception using errcode = '40001',
      message = 'FUTURE_ANNUAL_PROJECTION_PREDECESSOR_STALE';
  end if;
  -- Exact certified content is the idempotency identity.  Recognize a lost-
  -- response retry before comparing predecessor revisions because the first
  -- successful change advances setup (and, when Ready, lifecycle) revision.
  if existing.tournament_id is not null
     and existing.source_revision = (input->>'source_revision')::bigint
     and existing.source_fingerprint = input->>'source_fingerprint'
     and existing.payload_fingerprint = input->>'payload_fingerprint'
     and existing.certification_status = 'CERTIFIED' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'FUTURE_ANNUAL_PROJECTION_CERTIFIED',
      'tournamentId', target_id, 'domain', domain_value,
      'bindingRevision', existing.binding_revision,
      'changed', false, 'duplicate', true, 'idempotent', true
    );
  end if;
  if (input->>'expected_setup_revision')::bigint
       is distinct from catalog.setup_revision
     or (input->>'expected_runtime_revision')::bigint
       is distinct from coalesce(promotion.promotion_revision, 0) then
    raise exception using errcode = '40001',
      message = 'FUTURE_ANNUAL_PROJECTION_PREDECESSOR_STALE';
  end if;
  -- Bind the projection by fingerprint.  The JSON projection remains in its
  -- domain-owned table/worker; this contract never copies it across years.
  next_revision := coalesce(existing.binding_revision, 0) + 1;
  insert into production_control.future_annual_projection_bindings_v1 (
    tournament_id, domain, source_workbook_id, source_revision,
    binding_revision, source_fingerprint, payload_fingerprint, projection,
    certification_status, certified_by_player_id, certified_at
  ) values (
    target_id, domain_value, resource.source_workbook_id,
    (input->>'source_revision')::bigint, next_revision,
    input->>'source_fingerprint', input->>'payload_fingerprint',
    coalesce(input->'projection', input->'payload'),
    'CERTIFIED', actor_player, pg_catalog.clock_timestamp()
  ) on conflict (tournament_id, domain) do update set
    source_workbook_id = excluded.source_workbook_id,
    source_revision = excluded.source_revision,
    binding_revision = excluded.binding_revision,
    source_fingerprint = excluded.source_fingerprint,
    payload_fingerprint = excluded.payload_fingerprint,
    projection = excluded.projection,
    certification_status = excluded.certification_status,
    certified_by_player_id = excluded.certified_by_player_id,
    certified_at = excluded.certified_at,
    updated_at = pg_catalog.clock_timestamp();
  -- Before runtime promotion the projection is part of the staged structure
  -- and therefore advances its structural setup revision.  After promotion,
  -- the structural manifest is immutable: annual Guide/Draft/Prediction
  -- refreshes are independently revisioned by their binding row and must not
  -- invalidate promotion.source_setup_revision.  A changed post-promotion
  -- projection still clears activation readiness (and reopens Ready to
  -- Configuring) so it must be reviewed again before activation.
  update production_control.future_tournament_catalog_v1 value set
    lifecycle = case when value.lifecycle = 'READY_FOR_ACTIVATION'
      then 'CONFIGURING' else value.lifecycle end,
    lifecycle_revision = case when value.lifecycle = 'READY_FOR_ACTIVATION'
      then value.lifecycle_revision + 1 else value.lifecycle_revision end,
    setup_revision = case when promotion.tournament_id is null
      then value.setup_revision + 1 else value.setup_revision end,
    readiness_fingerprint = null, readiness_setup_revision = null,
    updated_by_player_id = actor_player,
    updated_at = pg_catalog.clock_timestamp()
  where value.tournament_id = target_id
  returning value.setup_revision, value.lifecycle_revision
    into catalog.setup_revision, catalog.lifecycle_revision;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'FUTURE_ANNUAL_PROJECTION_CERTIFIED',
    'tournamentId', target_id, 'tournamentYear', target_year,
    'domain', domain_value, 'sourceRevision',
      (input->>'source_revision')::bigint,
    'bindingRevision', next_revision,
    'setupRevision', catalog.setup_revision,
    'lifecycleRevision', catalog.lifecycle_revision,
    'runtimeRevision', coalesce(promotion.promotion_revision, 0),
    'changed', true, 'duplicate', false,
    'sourceFingerprint', input->>'source_fingerprint',
    'payloadFingerprint', input->>'payload_fingerprint',
    'idempotent', false
  );
end;
$$;

create or replace function public.read_production_future_runtime_v2(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  readiness jsonb;
begin
  perform production_control.assert_future_runtime_service_scope_v2(
    input, true, false
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target_id;
  select value.* into promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target_id;
  select value.* into generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_id;
  readiness := production_control.future_runtime_readiness_v2(target_id);
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'production-future-runtime-activation-v2',
    'currentTournament', pg_catalog.jsonb_build_object(
      'tournamentId', pointer.tournament_id,
      'tournamentYear', pointer.tournament_year,
      'pointerRevision', pointer.pointer_revision
    ),
    'selectedTournament', pg_catalog.jsonb_build_object(
      'tournamentId', catalog.tournament_id,
      'tournamentYear', catalog.tournament_year,
      'name', catalog.tournament_name,
      'lifecycle', catalog.lifecycle,
      'setupRevision', catalog.setup_revision,
      'lifecycleRevision', catalog.lifecycle_revision
    ),
    'runtimePromotion', case when promotion.tournament_id is null then null
      else pg_catalog.jsonb_build_object(
        'revision', promotion.promotion_revision,
        'sourceSetupRevision', promotion.source_setup_revision,
        'fingerprint', promotion.promoted_manifest_fingerprint,
        'status', promotion.runtime_status
      ) end,
    'handicap', (select pg_catalog.jsonb_build_object(
      'revisionId', current_value.revision_id,
      'revisionNumber', current_value.revision_number,
      'effectiveDate', revision.effective_date,
      'approvedAt', revision.approved_at
    ) from scoring_authority.handicap_revision_current current_value
      join scoring_authority.handicap_revisions revision
        on revision.revision_id = current_value.revision_id
      where current_value.tournament_id = target_id),
    'handicapDraft', (select pg_catalog.jsonb_build_object(
      'revisionId', draft.revision_id,
      'revisionNumber', draft.revision_number,
      'effectiveDate', draft.effective_date,
      'status', draft.status,
      'entryCount', (select pg_catalog.count(*)
        from scoring_authority.handicap_revision_entries draft_entry
        where draft_entry.revision_id = draft.revision_id),
      'entries', coalesce((select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'playerId', draft_entry.player_id,
          'tournamentHandicap', draft_entry.tournament_handicap::text
        ) order by draft_entry.player_id)
        from scoring_authority.handicap_revision_entries draft_entry
        where draft_entry.revision_id = draft.revision_id), '[]'::jsonb),
      'createdAt', draft.created_at
    ) from scoring_authority.handicap_revisions draft
      where draft.tournament_id = target_id and draft.status = 'DRAFT'
      order by draft.revision_number desc limit 1),
    'courseAllocatorRevision', (select value.allocator_revision
      from production_control.global_course_id_allocator_v1 value
      where value.scope_key = 'BAGGER_INV_PRODUCTION'),
    'matches', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'matchId', match_value.match_id, 'round', match_value.round_number,
        'format', match_value.format, 'status', match_value.status,
        'snapshotId', match_value.scoring_snapshot_id,
        'runtimeState', binding.runtime_state,
        'runtimeRevision', binding.runtime_revision,
        'configurationFingerprint', binding.configuration_fingerprint,
        'matchNumber', detail.match_number,
        'courseId', detail.course_id, 'teeId', detail.tee_id,
        'teeTime', detail.tee_time, 'startingHole', detail.starting_hole,
        'participants', coalesce((select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'playerId', participant.player_id,
            'teamId', participant.team_id,
            'teamSide', participant.team_side,
            'playerSlot', participant.player_slot
          ) order by participant.team_side, participant.player_slot)
          from scoring_authority.match_participants participant
          where participant.match_id = match_value.match_id), '[]'::jsonb)
      ) order by match_value.round_number, match_value.match_id
    ) from scoring_authority.matches match_value
      left join production_control.future_runtime_match_bindings_v2 binding
        on binding.match_id = match_value.match_id
      left join scoring_authority.tournament_setup_match_details_v1 detail
        on detail.match_id = match_value.match_id
      where match_value.tournament_id = target_id), '[]'::jsonb),
    'compatibilityJobs', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'jobId', value.job_id, 'matchId', value.match_id,
        'status', value.status, 'attempts', value.attempts,
        'errorCode', value.safe_error_code
      ) order by value.match_id
    ) from production_control.future_match_google_compatibility_jobs_v1 value
      where value.tournament_id = target_id), '[]'::jsonb),
    'annualProjections', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'domain', value.domain, 'sourceRevision', value.source_revision,
        'bindingRevision', value.binding_revision,
        'status', value.certification_status,
        'sourceFingerprint', value.source_fingerprint,
        'payloadFingerprint', value.payload_fingerprint
      ) order by value.domain
    ) from production_control.future_annual_projection_bindings_v1 value
      where value.tournament_id = target_id), '[]'::jsonb),
    'futureDirectorGovernance', pg_catalog.jsonb_build_object(
      'revision', coalesce((select value.governance_revision
        from production_control.future_tournament_director_governance_v1 value
        where value.tournament_id = target_id), 0),
      'directors', coalesce((select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'playerId', entitlement.player_id,
          'displayName', player.display_name,
          'status', entitlement.status,
          'roleActive', role_value.role_active and
            role_value.revoked_at is null
        ) order by entitlement.player_id)
        from production_control.director_entitlements entitlement
        join scoring_authority.players player
          on player.player_id = entitlement.player_id
        left join participant_identity.tournament_roles role_value
          on role_value.tournament_id = entitlement.tournament_id
         and role_value.auth_user_id = entitlement.auth_user_id
         and role_value.role = 'DIRECTOR'
        where entitlement.tournament_id = target_id
          and entitlement.role = 'DIRECTOR'), '[]'::jsonb)
    ),
    'readiness', readiness,
    'activation', case when generation.runtime_generation_id is null then null
      else pg_catalog.jsonb_build_object(
        'runtimeGenerationId', generation.runtime_generation_id,
        'status', generation.generation_status,
        'runtimeRevision', generation.runtime_revision,
        'pointerRevision', generation.pointer_revision
      ) end,
    'archivePlan', (select pg_catalog.jsonb_build_object(
      'planId', plan.archive_plan_id, 'planRevision', plan.plan_revision,
      'status', plan.readiness_status,
      'fingerprint', plan.archive_fingerprint,
      'promotionStatus', plan.promotion_status
    ) from production_control.future_archive_plans_v1 plan
      where plan.tournament_id = target_id
      order by plan.plan_revision desc limit 1),
    'courseCatalog', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'courseId', value.course_id, 'name', value.display_name,
        'location', value.location, 'status', value.catalog_status,
        'source', value.identity_source, 'revision', value.catalog_revision,
        'teeContexts', coalesce((select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'teeId', context.tee_id, 'rating', context.rating::text,
            'slope', context.slope, 'par', context.par,
            'contextRevision', context.context_revision,
            'holeCount', (select pg_catalog.count(*)
              from scoring_authority.global_course_hole_contexts_v1 hole
              where hole.course_id = context.course_id
                and hole.tee_id = context.tee_id
                and hole.context_revision = context.context_revision),
            'scoringReady', (select pg_catalog.count(*) = 18
              and pg_catalog.count(distinct hole.stroke_index) = 18
              from scoring_authority.global_course_hole_contexts_v1 hole
              where hole.course_id = context.course_id
                and hole.tee_id = context.tee_id
                and hole.context_revision = context.context_revision)
          ) order by context.tee_id)
          from scoring_authority.global_course_tee_contexts_v1 context
          where context.course_id = value.course_id), '[]'::jsonb)
      ) order by value.display_name, value.course_id
    ) from scoring_authority.global_course_library_v1 value), '[]'::jsonb),
    'capabilities', pg_catalog.jsonb_build_object(
      'addGlobalCourse', true, 'configureGlobalCourseContext', true,
      'assignFutureCourse', promotion.tournament_id is null
        and catalog.lifecycle in ('DRAFT', 'CONFIGURING'),
      'promoteRuntime', true,
      'bindAnnualProjection', true,
      'stageHandicaps', true, 'approveHandicaps', true,
      'configureMatch', true, 'replacePairings', true,
      'prepareScoringContext', true,
      'grantFutureDirector', catalog.lifecycle in ('DRAFT', 'CONFIGURING')
        and exists (
          select 1
          from production_control.tournament_owner_capabilities_v1 owner_value
          where owner_value.tournament_id = '2026'
            and owner_value.player_id = pg_catalog.upper(pg_catalog.btrim(
              input#>>'{authorization,player_id}'
            ))
            and owner_value.auth_user_id =
              (input#>>'{authorization,auth_user_id}')::uuid
            and owner_value.status = 'ACTIVE'
            and owner_value.revoked_at is null
        ),
      'markReady', (readiness->>'ready')::boolean,
      'activateTournament', catalog.lifecycle = 'READY_FOR_ACTIVATION'
        and (readiness->>'ready')::boolean,
      'closeTournament', catalog.lifecycle = 'ACTIVE',
      'prepareArchivePlan', catalog.lifecycle = 'CLOSED',
      'claimCompatibilityJob', true
    )
  );
end;
$$;

create or replace function production_control.future_handicap_match_context_v2(
  target_match_id text,
  target_revision_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  match_value scoring_authority.matches%rowtype;
  detail scoring_authority.tournament_setup_match_details_v1%rowtype;
  tee scoring_authority.tournament_setup_course_tees_v1%rowtype;
  computed jsonb;
  participant_configuration jsonb;
  team_configuration jsonb;
  team_1_playing numeric;
  team_2_playing numeric;
  team_1_strokes integer;
  team_2_strokes integer;
begin
  select value.* into strict match_value
  from scoring_authority.matches value
  where value.match_id = target_match_id;
  select value.* into strict detail
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.match_id = target_match_id
    and value.tournament_id = match_value.tournament_id;
  select value.* into strict tee
  from scoring_authority.tournament_setup_course_tees_v1 value
  where value.tournament_id = match_value.tournament_id
    and value.course_id = detail.course_id and value.tee_id = detail.tee_id;
  with course_values as (
    select participant.player_id, participant.team_side,
      participant.player_slot, entry.tournament_handicap,
      entry.tournament_handicap * (tee.slope::numeric / 113::numeric)
        + (tee.rating - tee.par::numeric) course_handicap
    from scoring_authority.match_participants participant
    join scoring_authority.handicap_revision_entries entry
      on entry.revision_id = target_revision_id
     and entry.tournament_id = match_value.tournament_id
     and entry.player_id = participant.player_id
    where participant.match_id = target_match_id
  ), calculated as (
    select course.*,
      case match_value.format when 'SC' then 0::numeric
        else pg_catalog.round(course.course_handicap, 0) end playing_handicap,
      case match_value.format
        when 'BB' then pg_catalog.round((course.course_handicap
          - pg_catalog.min(course.course_handicap) over ()) * 0.9, 0)::integer
        when 'SI' then pg_catalog.round(course.course_handicap
          - pg_catalog.min(course.course_handicap) over (), 0)::integer
        else 0::integer end final_strokes
    from course_values course
  )
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'player_id', value.player_id, 'team_side', value.team_side,
    'player_slot', value.player_slot,
    'tournament_handicap', value.tournament_handicap,
    'handicap_index', value.tournament_handicap,
    'course_handicap', value.course_handicap,
    'playing_handicap', value.playing_handicap,
    'final_strokes', value.final_strokes
  ) order by value.team_side, value.player_slot)
  into strict computed from calculated value;
  select pg_catalog.jsonb_build_object(
    'team_1', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item->>'player_id', 'team', 1,
      'slot', (item->>'player_slot')::integer,
      'handicap_index', (item->>'handicap_index')::numeric,
      'course_handicap', (item->>'course_handicap')::numeric,
      'playing_handicap', (item->>'playing_handicap')::numeric,
      'final_strokes', (item->>'final_strokes')::integer,
      'tournament_handicap', (item->>'tournament_handicap')::numeric,
      'handicap_revision_id', target_revision_id
    ) order by (item->>'player_slot')::integer)
      filter (where (item->>'team_side')::integer = 1), '[]'::jsonb),
    'team_2', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item->>'player_id', 'team', 2,
      'slot', (item->>'player_slot')::integer,
      'handicap_index', (item->>'handicap_index')::numeric,
      'course_handicap', (item->>'course_handicap')::numeric,
      'playing_handicap', (item->>'playing_handicap')::numeric,
      'final_strokes', (item->>'final_strokes')::integer,
      'tournament_handicap', (item->>'tournament_handicap')::numeric,
      'handicap_revision_id', target_revision_id
    ) order by (item->>'player_slot')::integer)
      filter (where (item->>'team_side')::integer = 2), '[]'::jsonb),
    'all_ids', pg_catalog.jsonb_agg(item->>'player_id' order by
      (item->>'team_side')::integer, (item->>'player_slot')::integer),
    'handicap_revision_id', target_revision_id,
    'handicap_context_contract', 'production-handicap-context-v1'
  ) into participant_configuration
  from pg_catalog.jsonb_array_elements(computed) item;
  if match_value.format = 'SC' then
    select pg_catalog.round(pg_catalog.min((item->>'course_handicap')::numeric) * 0.35
      + pg_catalog.max((item->>'course_handicap')::numeric) * 0.15, 0)
      into team_1_playing from pg_catalog.jsonb_array_elements(computed) item
      where (item->>'team_side')::integer = 1;
    select pg_catalog.round(pg_catalog.min((item->>'course_handicap')::numeric) * 0.35
      + pg_catalog.max((item->>'course_handicap')::numeric) * 0.15, 0)
      into team_2_playing from pg_catalog.jsonb_array_elements(computed) item
      where (item->>'team_side')::integer = 2;
    team_1_strokes := (team_1_playing - least(team_1_playing, team_2_playing))::integer;
    team_2_strokes := (team_2_playing - least(team_1_playing, team_2_playing))::integer;
  else
    select pg_catalog.max((item->>'playing_handicap')::numeric),
      pg_catalog.max((item->>'final_strokes')::integer)
      into team_1_playing, team_1_strokes
    from pg_catalog.jsonb_array_elements(computed) item
    where (item->>'team_side')::integer = 1;
    select pg_catalog.max((item->>'playing_handicap')::numeric),
      pg_catalog.max((item->>'final_strokes')::integer)
      into team_2_playing, team_2_strokes
    from pg_catalog.jsonb_array_elements(computed) item
    where (item->>'team_side')::integer = 2;
  end if;
  team_configuration := pg_catalog.jsonb_build_object(
    'team_1_handicap', team_1_playing,
    'team_2_handicap', team_2_playing,
    'team_1_playing_handicap', team_1_playing,
    'team_2_playing_handicap', team_2_playing,
    'team_1_strokes', team_1_strokes,
    'team_2_strokes', team_2_strokes,
    'handicap_revision_id', target_revision_id,
    'handicap_context_contract', 'production-handicap-context-v1'
  );
  return pg_catalog.jsonb_build_object(
    'participants', computed,
    'participant_configuration', participant_configuration,
    'team_configuration', team_configuration
  );
exception when no_data_found then
  raise exception using errcode = '55000',
    message = 'FUTURE_HANDICAP_CONTEXT_INCOMPLETE';
end;
$$;

create or replace function public.mutate_production_future_runtime_v2(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $future_runtime_mutation$
declare
  action_value text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input->>'action', ''
  )));
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  request_id uuid;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  database_hash text;
  expected_revision bigint;
  receipt production_control.future_runtime_operation_receipts_v2%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  match_value scoring_authority.matches%rowtype;
  binding production_control.future_runtime_match_bindings_v2%rowtype;
  detail scoring_authority.tournament_setup_match_details_v1%rowtype;
  current_handicap uuid;
  handicap_revision_id_value uuid;
  next_revision bigint;
  prior_revision bigint := 0;
  result_value jsonb;
  safe_metadata jsonb := '{}'::jsonb;
  target_kind text := 'RUNTIME';
  target_object text;
  changed_value boolean := true;
  course_id_value text;
  tee_id_value text;
  course_name text;
  course_location text;
  rating_value numeric;
  slope_value integer;
  par_value integer;
  target_round_value integer;
  context_revision_value bigint;
  hole_value jsonb;
  hole_number_value integer;
  hole_par_value integer;
  stroke_index_value integer;
  yardage_value integer;
  manifest_fingerprint text;
  participants_input jsonb;
  participant jsonb;
  normalized jsonb := '[]'::jsonb;
  expected_count integer;
  player_value text;
  side_value integer;
  slot_value integer;
  context_value jsonb;
  holes_value jsonb;
  participant_manifest jsonb;
  preparation_fingerprint text;
  next_snapshot_revision bigint;
  next_snapshot_id text;
  next_snapshot_hash text;
  readiness jsonb;
  blockers jsonb;
  previous_pointer_revision bigint;
  source_fingerprint text;
  archive_fingerprint text;
  generation_id uuid;
  authority_generation_id_value uuid;
  admission_generation_id_value uuid;
  target_player_value text;
  target_auth_value uuid;
  target_auth_candidates uuid[];
  entitlement_value production_control.director_entitlements%rowtype;
  role_changed boolean := false;
begin
  if action_value not in (
    'ADD_GLOBAL_COURSE', 'CONFIGURE_GLOBAL_COURSE_CONTEXT',
    'ASSIGN_FUTURE_COURSE', 'PROMOTE_RUNTIME_STRUCTURE',
    'STAGE_HANDICAPS', 'APPROVE_HANDICAPS', 'CONFIGURE_MATCH',
    'REPLACE_PAIRINGS', 'PREPARE_SCORING_CONTEXT',
    'GRANT_FUTURE_DIRECTOR',
    'MARK_READY_FOR_ACTIVATION', 'ACTIVATE_TOURNAMENT',
    'CLOSE_TOURNAMENT', 'PREPARE_ARCHIVE_PLAN'
  ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_RUNTIME_ACTION_INVALID';
  end if;
  perform production_control.assert_future_runtime_service_scope_v2(
    input, true, action_value in (
      'ADD_GLOBAL_COURSE', 'CONFIGURE_GLOBAL_COURSE_CONTEXT',
      'PROMOTE_RUNTIME_STRUCTURE', 'GRANT_FUTURE_DIRECTOR',
      'MARK_READY_FOR_ACTIVATION', 'ACTIVATE_TOURNAMENT',
      'CLOSE_TOURNAMENT', 'PREPARE_ARCHIVE_PLAN'
    )
  );
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
    request_id := (input->>'operation_request_id')::uuid;
    expected_revision := (input->>'expected_revision')::bigint;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_RUNTIME_INPUT_INVALID';
  end;
  perform production_control.assert_access_governance_safe_reason_v1(
    input->>'reason'
  );
  database_hash := production_control.future_runtime_hash_v2(
    input - 'request_payload_hash'
  );
  if declared_hash !~ '^[0-9a-f]{64}$'
     or declared_hash <> database_hash then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_RUNTIME_PAYLOAD_HASH_INVALID';
  end if;
  select value.* into receipt
  from production_control.future_runtime_operation_receipts_v2 value
  where value.action = action_value
    and value.operation_request_id = request_id;
  if receipt.receipt_id is not null then
    if receipt.database_request_payload_hash <> database_hash
       or receipt.declared_request_payload_hash <> declared_hash then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_RUNTIME_IDEMPOTENCY_CONFLICT';
    end if;
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'future-runtime-v2:' || action_value || ':' || coalesce(target_id, ''), 0
    )
  );
  select value.* into receipt
  from production_control.future_runtime_operation_receipts_v2 value
  where value.action = action_value
    and value.operation_request_id = request_id;
  if receipt.receipt_id is not null then
    if receipt.database_request_payload_hash <> database_hash
       or receipt.declared_request_payload_hash <> declared_hash then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_RUNTIME_IDEMPOTENCY_CONFLICT';
    end if;
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  target_object := nullif(target_id, '');

  if action_value = 'GRANT_FUTURE_DIRECTOR' then
    target_player_value := pg_catalog.upper(pg_catalog.btrim(coalesce(
      input->>'target_player_id', ''
    )));
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.governance_revision into prior_revision
    from production_control.future_tournament_director_governance_v1 value
    where value.tournament_id = target_id for update;
    prior_revision := coalesce(prior_revision, 0);
    if target_player_value !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
       or catalog.tournament_year <= 2026
       or catalog.tournament_year <> (input->>'target_tournament_year')::integer
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or target_id = (select value.tournament_id
         from production_control.current_tournament_pointer_v1 value
         where value.scope_key = 'BAGGER_INV_PRODUCTION')
       or expected_revision <> prior_revision
       or production_control.access_governance_global_status_v1(
         target_player_value
       ) <> 'ACTIVE'
       or not exists (
         select 1
         from production_control.future_tournament_roster_v1 membership
         where membership.tournament_id = target_id
           and membership.player_id = target_player_value
           and membership.participation_status = 'ACTIVE'
       ) then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_FUTURE_DIRECTOR_PREDECESSOR_INVALID';
    end if;

    select pg_catalog.array_agg(candidate.auth_user_id order by
      candidate.auth_user_id::text) into target_auth_candidates
    from (
      select distinct link.auth_user_id
      from participant_identity.user_player_links link
      join auth.users auth_user on auth_user.id = link.auth_user_id
      join participant_identity.participant_auth_identifiers identifier
        on identifier.player_id = link.player_id
       and identifier.auth_user_id = link.auth_user_id
       and identifier.status = 'VERIFIED'
       and identifier.revoked_at is null
      where link.player_id = target_player_value
        and link.status = 'ACTIVE' and link.revoked_at is null
        and (
          (identifier.identifier_type = 'EMAIL'
            and auth_user.email_confirmed_at is not null
            and pg_catalog.lower(pg_catalog.btrim(coalesce(
              auth_user.email, ''
            ))) = identifier.normalized_value_private)
          or (identifier.identifier_type = 'PHONE'
            and auth_user.phone_confirmed_at is not null
            and pg_catalog.btrim(coalesce(auth_user.phone, '')) =
              identifier.normalized_value_private)
        )
    ) candidate;
    if coalesce(pg_catalog.cardinality(target_auth_candidates), 0) <> 1 then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_FUTURE_DIRECTOR_LINKED_IDENTITY_REQUIRED';
    end if;
    target_auth_value := target_auth_candidates[1];

    select value.* into entitlement_value
    from production_control.director_entitlements value
    where value.tournament_id = target_id
      and value.auth_user_id = target_auth_value;
    if entitlement_value.entitlement_id is not null and (
      entitlement_value.player_id is distinct from target_player_value
      or entitlement_value.role <> 'DIRECTOR'
    ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_FUTURE_DIRECTOR_IDENTITY_CONFLICT';
    end if;
    changed_value := entitlement_value.entitlement_id is null
      or entitlement_value.status <> 'ACTIVE'
      or entitlement_value.revoked_at is not null;
    if changed_value then
      insert into production_control.director_entitlements (
        auth_user_id, tournament_id, player_id, role, status,
        granted_by, granted_at, revoked_at
      ) values (
        target_auth_value, target_id, target_player_value, 'DIRECTOR',
        'ACTIVE', actor_player, pg_catalog.clock_timestamp(), null
      ) on conflict (auth_user_id, tournament_id) do update set
        player_id = excluded.player_id, role = 'DIRECTOR', status = 'ACTIVE',
        granted_by = excluded.granted_by, granted_at = excluded.granted_at,
        revoked_at = null;
      select value.* into strict entitlement_value
      from production_control.director_entitlements value
      where value.tournament_id = target_id
        and value.auth_user_id = target_auth_value;
      insert into production_control.director_entitlement_events (
        entitlement_id, action, actor, reason
      ) values (
        entitlement_value.entitlement_id, 'GRANTED', actor_player,
        pg_catalog.btrim(input->>'reason')
      );
    end if;
    role_changed := not exists (
      select 1 from participant_identity.tournament_roles role_value
      where role_value.tournament_id = target_id
        and role_value.auth_user_id = target_auth_value
        and role_value.role = 'DIRECTOR'
        and role_value.role_active and role_value.revoked_at is null
    );
    insert into participant_identity.tournament_roles (
      tournament_id, auth_user_id, role, role_active, role_revision,
      granted_at, granted_by, revoked_at, revoked_by
    ) values (
      target_id, target_auth_value, 'DIRECTOR', true, 1,
      pg_catalog.clock_timestamp(), actor_player, null, null
    ) on conflict (tournament_id, auth_user_id, role) do update set
      role_active = true,
      role_revision = participant_identity.tournament_roles.role_revision +
        case when participant_identity.tournament_roles.role_active
          and participant_identity.tournament_roles.revoked_at is null
          then 0 else 1 end,
      granted_at = case when participant_identity.tournament_roles.role_active
          and participant_identity.tournament_roles.revoked_at is null
        then participant_identity.tournament_roles.granted_at
        else pg_catalog.clock_timestamp() end,
      granted_by = case when participant_identity.tournament_roles.role_active
          and participant_identity.tournament_roles.revoked_at is null
        then participant_identity.tournament_roles.granted_by
        else actor_player end,
      revoked_at = null, revoked_by = null,
      updated_at = case when participant_identity.tournament_roles.role_active
          and participant_identity.tournament_roles.revoked_at is null
        then participant_identity.tournament_roles.updated_at
        else pg_catalog.clock_timestamp() end;
    changed_value := changed_value or role_changed;
    next_revision := prior_revision + case when changed_value then 1 else 0 end;
    if changed_value then
      insert into production_control.future_tournament_director_governance_v1 (
        tournament_id, governance_revision, updated_by_player_id,
        updated_by_auth_user_id
      ) values (
        target_id, next_revision, actor_player, actor_auth
      ) on conflict (tournament_id) do update set
        governance_revision = excluded.governance_revision,
        updated_by_player_id = excluded.updated_by_player_id,
        updated_by_auth_user_id = excluded.updated_by_auth_user_id,
        updated_at = pg_catalog.clock_timestamp();
    end if;
    target_kind := 'IDENTITY';
    target_object := target_player_value;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future tournament Director granted',
      'playerId', target_player_value, 'role', 'DIRECTOR',
      'identityChanged', false, 'membershipChanged', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_DIRECTOR_GRANTED',
      'action', action_value, 'tournamentId', target_id,
      'targetPlayerId', target_player_value,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'changed', changed_value, 'idempotent', false
    );

  elsif action_value = 'ADD_GLOBAL_COURSE' then
    select value.allocator_revision into strict prior_revision
    from production_control.global_course_id_allocator_v1 value
    where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
    if expected_revision <> prior_revision then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_GLOBAL_COURSE_ALLOCATOR_REVISION_STALE';
    end if;
    course_name := pg_catalog.btrim(coalesce(input->>'display_name', ''));
    course_location := nullif(pg_catalog.btrim(coalesce(
      input->>'location', ''
    )), '');
    if course_name = '' or pg_catalog.length(course_name) > 240
       or (course_location is not null
         and pg_catalog.length(course_location) > 240)
       or exists (
         select 1 from scoring_authority.global_course_library_v1 value
         where pg_catalog.lower(value.display_name) =
           pg_catalog.lower(course_name)
           and coalesce(pg_catalog.lower(value.location), '') =
             coalesce(pg_catalog.lower(course_location), '')
       ) then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_GLOBAL_COURSE_IDENTITY_CONFLICT';
    end if;
    course_id_value := production_control.allocate_global_course_id_v1();
    insert into scoring_authority.global_course_catalog_v1 (
      course_id, display_name, location, catalog_status, identity_source,
      catalog_revision, created_by_player_id, created_by_auth_user_id
    ) values (
      course_id_value, course_name, course_location, 'ACTIVE',
      'DIRECTOR_CREATED', 1, actor_player, actor_auth
    );
    next_revision := prior_revision + 1;
    target_kind := 'GLOBAL_COURSE';
    target_object := course_id_value;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Global Course created', 'courseId', course_id_value
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_GLOBAL_COURSE_CREATED',
      'action', action_value, 'courseId', course_id_value,
      'catalogRevision', 1, 'priorRevision', prior_revision,
      'nextRevision', next_revision, 'scoringReady', false,
      'idempotent', false
    );

  elsif action_value = 'CONFIGURE_GLOBAL_COURSE_CONTEXT' then
    course_id_value := pg_catalog.btrim(coalesce(input->>'course_id', ''));
    tee_id_value := pg_catalog.btrim(coalesce(input->>'tee_id', ''));
    holes_value := input->'holes';
    begin
      rating_value := (input->>'rating')::numeric;
      slope_value := (input->>'slope')::integer;
      par_value := (input->>'par')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_GLOBAL_COURSE_CONTEXT_INPUT_INVALID';
    end;
    select value.catalog_revision into strict prior_revision
    from scoring_authority.global_course_catalog_v1 value
    where value.course_id = course_id_value
      and value.identity_source = 'DIRECTOR_CREATED'
      and value.catalog_status = 'ACTIVE'
    for update;
    if expected_revision <> prior_revision
       or tee_id_value = '' or pg_catalog.length(tee_id_value) > 120
       or rating_value <= 0 or rating_value > 100
       or slope_value not between 55 and 155
       or par_value not between 54 and 90
       or pg_catalog.jsonb_typeof(holes_value) <> 'array'
       or pg_catalog.jsonb_array_length(holes_value) <> 18 then
      raise exception using errcode = '40001',
        message = 'PRODUCTION_GLOBAL_COURSE_CONTEXT_PREDECESSOR_INVALID';
    end if;
    normalized := '[]'::jsonb;
    for hole_value in
      select entry.value from pg_catalog.jsonb_array_elements(holes_value)
        entry(value)
    loop
      begin
        hole_number_value := (hole_value->>'hole_number')::integer;
        hole_par_value := (hole_value->>'par')::integer;
        stroke_index_value := (hole_value->>'stroke_index')::integer;
        yardage_value := nullif(hole_value->>'yardage', '')::integer;
      exception when others then
        raise exception using errcode = '22023',
          message = 'PRODUCTION_GLOBAL_COURSE_HOLE_INPUT_INVALID';
      end;
      if hole_number_value not between 1 and 18
         or hole_par_value not between 3 and 6
         or stroke_index_value not between 1 and 18
         or (yardage_value is not null
           and yardage_value not between 1 and 999) then
        raise exception using errcode = '22023',
          message = 'PRODUCTION_GLOBAL_COURSE_HOLE_INPUT_INVALID';
      end if;
      normalized := normalized || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'hole_number', hole_number_value, 'par', hole_par_value,
          'stroke_index', stroke_index_value, 'yardage', yardage_value
        )
      );
    end loop;
    if (select pg_catalog.count(distinct (entry->>'hole_number')::integer)
          from pg_catalog.jsonb_array_elements(normalized) entry) <> 18
       or (select pg_catalog.count(distinct (entry->>'stroke_index')::integer)
          from pg_catalog.jsonb_array_elements(normalized) entry) <> 18
       or (select pg_catalog.sum((entry->>'par')::integer)
          from pg_catalog.jsonb_array_elements(normalized) entry) <> par_value then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_GLOBAL_COURSE_HOLES_INCOMPLETE';
    end if;
    next_revision := prior_revision + 1;
    delete from scoring_authority.global_course_hole_contexts_v1 value
    where value.course_id = course_id_value and value.tee_id = tee_id_value;
    insert into scoring_authority.global_course_tee_contexts_v1 (
      course_id, tee_id, rating, slope, par, context_revision,
      configured_by_player_id, configured_by_auth_user_id
    ) values (
      course_id_value, tee_id_value, rating_value, slope_value, par_value,
      next_revision, actor_player, actor_auth
    ) on conflict (course_id, tee_id) do update set
      rating = excluded.rating, slope = excluded.slope, par = excluded.par,
      context_revision = excluded.context_revision,
      configured_by_player_id = excluded.configured_by_player_id,
      configured_by_auth_user_id = excluded.configured_by_auth_user_id,
      updated_at = pg_catalog.clock_timestamp();
    insert into scoring_authority.global_course_hole_contexts_v1 (
      course_id, tee_id, hole_number, par, stroke_index, yardage,
      context_revision
    ) select course_id_value, tee_id_value,
      (entry->>'hole_number')::integer, (entry->>'par')::integer,
      (entry->>'stroke_index')::integer,
      nullif(entry->>'yardage', '')::integer, next_revision
    from pg_catalog.jsonb_array_elements(normalized) entry;
    update scoring_authority.global_course_catalog_v1 value set
      catalog_revision = next_revision,
      updated_at = pg_catalog.clock_timestamp()
    where value.course_id = course_id_value;
    target_kind := 'GLOBAL_COURSE';
    target_object := course_id_value || ':' || tee_id_value;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Global Course scoring context configured',
      'courseId', course_id_value, 'teeId', tee_id_value,
      'holeCount', 18
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_GLOBAL_COURSE_CONTEXT_CONFIGURED',
      'action', action_value, 'courseId', course_id_value,
      'teeId', tee_id_value, 'contextRevision', next_revision,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'scoringReady', true, 'idempotent', false
    );

  elsif action_value = 'ASSIGN_FUTURE_COURSE' then
    course_id_value := pg_catalog.btrim(coalesce(input->>'course_id', ''));
    tee_id_value := pg_catalog.btrim(coalesce(input->>'tee_id', ''));
    begin
      target_round_value := (input->>'round_number')::integer;
      context_revision_value := (input->>'course_context_revision')::bigint;
    exception when others then
      raise exception using errcode = '22023',
        message = 'FUTURE_GLOBAL_COURSE_ASSIGNMENT_INPUT_INVALID';
    end;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.context_revision into strict context_revision_value
    from scoring_authority.global_course_tee_contexts_v1 value
    join scoring_authority.global_course_catalog_v1 course
      on course.course_id = value.course_id
    where value.course_id = course_id_value and value.tee_id = tee_id_value
      and value.context_revision = context_revision_value
      and course.catalog_status = 'ACTIVE'
      and course.identity_source = 'DIRECTOR_CREATED';
    prior_revision := catalog.setup_revision;
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or exists (select 1
         from production_control.future_runtime_promotions_v2 promotion_value
         where promotion_value.tournament_id = target_id)
       or not exists (
         select 1 from production_control.future_tournament_rounds_v1 round_value
         where round_value.tournament_id = target_id
           and round_value.round_number = target_round_value
       )
       or (select pg_catalog.count(*)
         from scoring_authority.global_course_hole_contexts_v1 hole
         where hole.course_id = course_id_value
           and hole.tee_id = tee_id_value
           and hole.context_revision = context_revision_value) <> 18
       or (select pg_catalog.count(distinct hole.stroke_index)
         from scoring_authority.global_course_hole_contexts_v1 hole
         where hole.course_id = course_id_value
           and hole.tee_id = tee_id_value
           and hole.context_revision = context_revision_value) <> 18 then
      raise exception using errcode = '40001',
        message = 'FUTURE_GLOBAL_COURSE_ASSIGNMENT_PREDECESSOR_INVALID';
    end if;
    next_revision := prior_revision + 1;
    insert into production_control.future_tournament_course_references_v1 (
      tournament_id, round_number, course_id, tee_id,
      source_tournament_id, source_round_number, source_setup_revision,
      reference_status, setup_revision, updated_by_player_id
    ) values (
      target_id, target_round_value, course_id_value, tee_id_value,
      target_id, null, context_revision_value, 'GLOBAL_COURSE_CONTEXT',
      next_revision, actor_player
    ) on conflict (tournament_id, round_number) do update set
      course_id = excluded.course_id, tee_id = excluded.tee_id,
      source_tournament_id = excluded.source_tournament_id,
      source_round_number = excluded.source_round_number,
      source_setup_revision = excluded.source_setup_revision,
      reference_status = excluded.reference_status,
      setup_revision = excluded.setup_revision,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    update production_control.future_tournament_catalog_v1 value set
      lifecycle = 'CONFIGURING', setup_revision = next_revision,
      readiness_fingerprint = null, readiness_setup_revision = null,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where value.tournament_id = target_id;
    target_kind := 'COURSE_ASSIGNMENT';
    target_object := target_id || ':R' || target_round_value::text;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Validated global Course assigned to future round',
      'courseId', course_id_value, 'teeId', tee_id_value,
      'roundNumber', target_round_value
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_GLOBAL_COURSE_ASSIGNED',
      'action', action_value, 'tournamentId', target_id,
      'roundNumber', target_round_value, 'courseId', course_id_value,
      'teeId', tee_id_value, 'courseContextRevision', context_revision_value,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'CONFIGURE_MATCH' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict match_value
    from scoring_authority.matches value
    where value.tournament_id = target_id
      and value.match_id = input->>'match_id' for update;
    select value.* into strict binding
    from production_control.future_runtime_match_bindings_v2 value
    where value.tournament_id = target_id
      and value.match_id = match_value.match_id for update;
    prior_revision := binding.runtime_revision;
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or match_value.status <> 'UPCOMING' or match_value.match_revision <> 0
       or not match_value.scoring_locked
       or not exists (
         select 1 from scoring_authority.tournament_setup_course_tees_v1 tee
         join scoring_authority.tournament_setup_round_courses_v1 assignment
           on assignment.tournament_id = tee.tournament_id
          and assignment.course_id = tee.course_id
          and assignment.tee_id = tee.tee_id
         where tee.tournament_id = target_id
           and assignment.round_number = match_value.round_number
           and tee.course_id = input->>'course_id'
           and tee.tee_id = input->>'tee_id'
       ) then
      raise exception using errcode = '40001',
        message = 'FUTURE_MATCH_CONFIGURATION_PREDECESSOR_INVALID';
    end if;
    begin
      side_value := coalesce((input->>'starting_hole')::integer, 1);
      slot_value := (input->>'match_number')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'FUTURE_MATCH_CONFIGURATION_INPUT_INVALID';
    end;
    if side_value not between 1 and 18 or slot_value not between 1 and 99
       or (select pg_catalog.count(*)
         from scoring_authority.tournament_setup_course_holes_v1 hole
         where hole.tournament_id = target_id
           and hole.course_id = input->>'course_id'
           and hole.tee_id = input->>'tee_id') <> 18 then
      raise exception using errcode = '22023',
        message = 'FUTURE_MATCH_COURSE_CONTEXT_INCOMPLETE';
    end if;
    if match_value.scoring_snapshot_id is not null then
      delete from scoring_authority.match_holes value
      where value.match_id = match_value.match_id;
      update scoring_authority.matches set
        scoring_snapshot_id = null, scoring_locked = true,
        updated_at = pg_catalog.clock_timestamp()
      where match_id = match_value.match_id;
    end if;
    next_revision := prior_revision + 1;
    insert into scoring_authority.tournament_setup_match_details_v1 (
      match_id, tournament_id, round_number, match_number,
      course_id, tee_id, tee_time, starting_hole, setup_revision,
      prepared_setup_revision, prepared_configuration_fingerprint,
      updated_by_player_id
    ) values (
      match_value.match_id, target_id, match_value.round_number, slot_value,
      input->>'course_id', input->>'tee_id',
      nullif(input->>'tee_time', '')::time, side_value, next_revision,
      null, null, actor_player
    ) on conflict (match_id) do update set
      match_number = excluded.match_number,
      course_id = excluded.course_id, tee_id = excluded.tee_id,
      tee_time = excluded.tee_time, starting_hole = excluded.starting_hole,
      setup_revision = excluded.setup_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = excluded.updated_by_player_id,
      updated_at = pg_catalog.clock_timestamp();
    update production_control.future_runtime_match_bindings_v2 set
      runtime_revision = next_revision, runtime_state = 'CONFIGURED',
      configuration_fingerprint = null,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    target_kind := 'MATCH'; target_object := match_value.match_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future match configured', 'matchId', match_value.match_id,
      'round', match_value.round_number
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_MATCH_CONFIGURED',
      'action', action_value, 'tournamentId', target_id,
      'matchId', match_value.match_id, 'priorRevision', prior_revision,
      'nextRevision', next_revision, 'snapshotPrepared', false,
      'idempotent', false
    );

  elsif action_value = 'REPLACE_PAIRINGS' then
    participants_input := input->'participants';
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict match_value
    from scoring_authority.matches value
    where value.tournament_id = target_id
      and value.match_id = input->>'match_id' for update;
    select value.* into strict binding
    from production_control.future_runtime_match_bindings_v2 value
    where value.match_id = match_value.match_id for update;
    select value.* into strict detail
    from scoring_authority.tournament_setup_match_details_v1 value
    where value.match_id = match_value.match_id;
    select value.revision_id into strict current_handicap
    from scoring_authority.handicap_revision_current value
    where value.tournament_id = target_id;
    prior_revision := binding.runtime_revision;
    expected_count := case when match_value.format = 'SI' then 2 else 4 end;
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or match_value.status <> 'UPCOMING' or match_value.match_revision <> 0
       or pg_catalog.jsonb_typeof(participants_input) <> 'array'
       or pg_catalog.jsonb_array_length(participants_input) <> expected_count then
      raise exception using errcode = '40001',
        message = 'FUTURE_PAIRINGS_PREDECESSOR_INVALID';
    end if;
    for participant in select value
      from pg_catalog.jsonb_array_elements(participants_input) entry(value)
    loop
      begin
        player_value := pg_catalog.upper(pg_catalog.btrim(
          participant->>'player_id'
        ));
        side_value := (participant->>'team_side')::integer;
        slot_value := (participant->>'player_slot')::integer;
      exception when others then
        raise exception using errcode = '22023',
          message = 'FUTURE_PAIRING_STRUCTURE_INVALID';
      end;
      if side_value not in (1, 2)
         or slot_value not between 1 and
           (case when match_value.format = 'SI' then 1 else 2 end)
         or not exists (
           select 1 from scoring_authority.tournament_players membership
           where membership.tournament_id = target_id
             and membership.player_id = player_value
             and membership.team_side = side_value
             and membership.participation_status = 'ACTIVE'
             and membership.handicap_revision_id = current_handicap
             and membership.tournament_handicap is not null
         ) then
        raise exception using errcode = '22023',
          message = 'FUTURE_PAIRING_ACTIVE_TEAM_HANDICAP_REQUIRED';
      end if;
      normalized := normalized || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'player_id', player_value, 'team_side', side_value,
          'player_slot', slot_value
        )
      );
    end loop;
    if (select pg_catalog.count(distinct item->>'player_id')
      from pg_catalog.jsonb_array_elements(normalized) item) <> expected_count
       or (select pg_catalog.count(distinct
          (item->>'team_side') || ':' || (item->>'player_slot'))
        from pg_catalog.jsonb_array_elements(normalized) item) <> expected_count
       or (select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(normalized) item
        where (item->>'team_side')::integer = 1) <> expected_count / 2
       or (select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(normalized) item
        where (item->>'team_side')::integer = 2) <> expected_count / 2
       or exists (
         select 1 from pg_catalog.jsonb_array_elements(normalized) requested
         join scoring_authority.match_participants other
           on other.player_id = requested->>'player_id'
         join scoring_authority.matches other_match
           on other_match.match_id = other.match_id
          and other_match.tournament_id = target_id
          and other_match.round_number = match_value.round_number
          and other_match.match_id <> match_value.match_id
       ) then
      raise exception using errcode = '23505',
        message = 'FUTURE_PAIRING_DUPLICATE_OR_UNBALANCED';
    end if;
    if match_value.scoring_snapshot_id is not null then
      delete from scoring_authority.match_holes value
      where value.match_id = match_value.match_id;
      update scoring_authority.matches set scoring_snapshot_id = null,
        scoring_locked = true, updated_at = pg_catalog.clock_timestamp()
      where match_id = match_value.match_id;
    end if;
    delete from scoring_authority.scoring_permissions value
    where value.match_id = match_value.match_id;
    delete from scoring_authority.match_participants value
    where value.match_id = match_value.match_id;
    insert into scoring_authority.match_participants (
      match_id, player_id, team_side, player_slot, tournament_handicap,
      handicap_index, course_handicap, playing_handicap, final_strokes,
      handicap_revision_id
    ) select match_value.match_id, item->>'player_id',
      (item->>'team_side')::integer, (item->>'player_slot')::integer,
      entry.tournament_handicap, entry.tournament_handicap,
      entry.tournament_handicap, 0, 0, current_handicap
    from pg_catalog.jsonb_array_elements(normalized) item
    join scoring_authority.handicap_revision_entries entry
      on entry.revision_id = current_handicap
     and entry.tournament_id = target_id
     and entry.player_id = item->>'player_id';
    next_revision := prior_revision + 1;
    insert into scoring_authority.scoring_permissions (
      match_id, player_id, can_score, permission_revision,
      revoked_at, updated_at
    ) select match_value.match_id, item->>'player_id', false,
      next_revision, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
    from pg_catalog.jsonb_array_elements(normalized) item;
    update scoring_authority.matches set
      permission_revision = next_revision,
      scoring_locked = true, updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    update scoring_authority.tournament_setup_match_details_v1 set
      setup_revision = next_revision,
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    update production_control.future_runtime_match_bindings_v2 set
      runtime_revision = next_revision, runtime_state = 'PAIRED',
      configuration_fingerprint = null,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    target_kind := 'PAIRINGS'; target_object := match_value.match_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future match pairings replaced',
      'matchId', match_value.match_id, 'participantCount', expected_count,
      'scoringAccessGranted', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_PAIRINGS_REPLACED',
      'action', action_value, 'tournamentId', target_id,
      'matchId', match_value.match_id, 'participantCount', expected_count,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'scoringAccessGranted', false, 'idempotent', false
    );

  elsif action_value = 'MARK_READY_FOR_ACTIVATION' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    prior_revision := catalog.lifecycle_revision;
    readiness := production_control.future_runtime_readiness_v2(target_id);
    if expected_revision <> prior_revision
       or catalog.lifecycle <> 'CONFIGURING'
       or not (readiness->>'ready')::boolean
       or input->>'readiness_fingerprint'
         is distinct from readiness->>'fingerprint' then
      raise exception using errcode = '40001',
        message = 'FUTURE_ACTIVATION_READINESS_STALE_OR_BLOCKED';
    end if;
    next_revision := prior_revision + 1;
    update production_control.future_tournament_catalog_v1 set
      lifecycle = 'READY_FOR_ACTIVATION',
      lifecycle_revision = next_revision,
      readiness_fingerprint = readiness->>'fingerprint',
      readiness_setup_revision = setup_revision,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update production_control.future_runtime_promotions_v2 set
      runtime_status = 'READY', updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    target_kind := 'ACTIVATION'; target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Tournament marked Ready for Activation',
      'readinessFingerprint', readiness->>'fingerprint'
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_TOURNAMENT_READY',
      'action', action_value, 'tournamentId', target_id,
      'lifecycle', 'READY_FOR_ACTIVATION',
      'readinessFingerprint', readiness->>'fingerprint',
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'ACTIVATE_TOURNAMENT' then
    select value.* into strict pointer
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict activation
    from production_control.cutover_activation_state value
    where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
    readiness := production_control.future_runtime_readiness_v2(target_id);
    begin previous_pointer_revision :=
      (input->>'expected_pointer_revision')::bigint;
    exception when others then
      raise exception using errcode = '22023',
        message = 'FUTURE_ACTIVATION_POINTER_REVISION_INVALID';
    end;
    prior_revision := catalog.lifecycle_revision;
    if expected_revision <> prior_revision
       or previous_pointer_revision <> pointer.pointer_revision
       or catalog.lifecycle <> 'READY_FOR_ACTIVATION'
       or catalog.readiness_fingerprint is null
       or catalog.readiness_fingerprint <> readiness->>'fingerprint'
       or input->>'readiness_fingerprint'
         is distinct from readiness->>'fingerprint'
       or not (readiness->>'ready')::boolean
       or not exists (
         select 1 from production_control.future_tournament_catalog_v1 current_value
         where current_value.tournament_id = pointer.tournament_id
           and current_value.lifecycle = 'CLOSED'
       )
       or activation.state <> 'SCORING_COMMITTED'
       or activation.current_authority <> 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or activation.active_transition_epoch_id is not null
       or exists (select 1 from scoring_authority.scoring_ingress_leases value
         where value.expires_at > pg_catalog.clock_timestamp())
       or exists (select 1 from scoring_authority.google_outbox_events value
         where value.status in ('PENDING', 'PROCESSING', 'RETRYABLE'))
       or exists (select 1 from scoring_authority.scorecard_archive_jobs value
         where value.status in ('PENDING', 'PROCESSING', 'RETRYABLE')) then
      raise exception using errcode = '40001',
        message = 'FUTURE_TOURNAMENT_ACTIVATION_PREDECESSOR_INVALID';
    end if;
    if exists (select 1 from production_control.future_annual_runtime_generations_v1
      where generation_status = 'ACTIVE') then
      raise exception using errcode = '55000',
        message = 'FUTURE_ACTIVE_RUNTIME_GENERATION_EXISTS';
    end if;
    next_revision := prior_revision + 1;
    generation_id := extensions.gen_random_uuid();
    authority_generation_id_value := extensions.gen_random_uuid();
    admission_generation_id_value := extensions.gen_random_uuid();
    insert into production_control.future_annual_runtime_generations_v1 (
      runtime_generation_id, tournament_id, generation_status,
      runtime_revision, pointer_revision, authority_generation_id,
      admission_generation_id, authority, ingress_state,
      readiness_fingerprint
    ) values (
      generation_id, target_id, 'PREPARED', 1,
      pointer.pointer_revision + 1, authority_generation_id_value,
      admission_generation_id_value, 'SUPABASE', 'OPEN',
      readiness->>'fingerprint'
    );
    if pg_catalog.to_regprocedure(
      'production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)'
    ) is null then
      raise exception using errcode = '55000',
        message = 'FUTURE_SCORING_RUNTIME_CAPABILITY_NOT_INSTALLED';
    end if;
    execute 'select production_control.assert_future_scoring_runtime_capability_v1($1,$2,$3,$4)'
      using target_id, generation_id, authority_generation_id_value,
        admission_generation_id_value;
    if pg_catalog.to_regprocedure(
      'production_control.bind_future_participant_identity_runtime_v1(text,uuid,uuid,uuid,text,uuid)'
    ) is null then
      raise exception using errcode = '55000',
        message = 'FUTURE_PARTICIPANT_IDENTITY_CAPABILITY_NOT_INSTALLED';
    end if;
    execute 'select production_control.bind_future_participant_identity_runtime_v1($1,$2,$3,$4,$5,$6)'
      using target_id, generation_id, authority_generation_id_value,
        admission_generation_id_value, actor_player, actor_auth;
    update production_control.future_tournament_catalog_v1 set
      lifecycle = 'ACTIVE', lifecycle_revision = next_revision,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update production_control.current_tournament_pointer_v1 set
      tournament_id = target_id, tournament_year = catalog.tournament_year,
      pointer_revision = pointer.pointer_revision + 1,
      lifecycle_revision = next_revision,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where scope_key = 'BAGGER_INV_PRODUCTION'
      and pointer_revision = previous_pointer_revision;
    if not found then
      raise exception using errcode = '40001',
        message = 'FUTURE_TOURNAMENT_POINTER_CAS_FAILED';
    end if;
    update production_control.future_annual_runtime_generations_v1 set
      generation_status = 'ACTIVE', activated_by_player_id = actor_player,
      activated_by_auth_user_id = actor_auth,
      activated_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where runtime_generation_id = generation_id
      and generation_status = 'PREPARED';
    update production_control.future_runtime_promotions_v2 set
      runtime_status = 'ACTIVE', updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    target_kind := 'ACTIVATION'; target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future tournament activated',
      'pointerRevision', pointer.pointer_revision + 1,
      'runtimeGenerationId', generation_id
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_TOURNAMENT_ACTIVATED',
      'action', action_value, 'tournamentId', target_id,
      'tournamentYear', catalog.tournament_year,
      'runtimeGenerationId', generation_id,
      'authorityGenerationId', authority_generation_id_value,
      'admissionGenerationId', admission_generation_id_value,
      'pointerRevision', pointer.pointer_revision + 1,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'CLOSE_TOURNAMENT' then
    select value.* into strict pointer
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    prior_revision := catalog.lifecycle_revision;
    blockers := '[]'::jsonb;
    if pointer.tournament_id <> target_id or catalog.lifecycle <> 'ACTIVE' then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'CURRENT_ACTIVE_TOURNAMENT_REQUIRED'
      );
    end if;
    if not exists (select 1 from scoring_authority.matches value
      where value.tournament_id = target_id)
       or exists (select 1 from scoring_authority.matches value
        where value.tournament_id = target_id
          and (value.status <> 'FINAL' or not value.scorecard_complete
            or value.unresolved_mutations <> 0)) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'ALL_MATCHES_FINAL_REQUIRED'
      );
    end if;
    if exists (select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = target_id and not exists (
        select 1 from scoring_authority.finalized_scorecard_snapshots final
        where final.match_id = match_value.match_id and final.state = 'CURRENT'
          and final.match_revision = match_value.match_revision
          and final.scoring_snapshot_id = match_value.scoring_snapshot_id
      )) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'FINAL_SCORECARD_SNAPSHOT_REQUIRED'
      );
    end if;
    if exists (select 1 from scoring_authority.scoring_ingress_leases value
      where value.tournament_id = target_id
        and value.expires_at > pg_catalog.clock_timestamp())
       or exists (select 1 from scoring_authority.google_outbox_events value
        where value.tournament_id = target_id
          and value.status in ('PENDING', 'PROCESSING', 'RETRYABLE'))
       or exists (select 1 from scoring_authority.scorecard_archive_jobs value
        where value.tournament_id = target_id
          and value.status in ('PENDING', 'PROCESSING', 'RETRYABLE')) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'SCORING_OR_ARCHIVE_QUEUE_UNRESOLVED'
      );
    end if;
    if exists (
      select 1 from scoring_authority.net_skins_v1_configuration_current cfg
      where cfg.tournament_id = target_id and cfg.state = 'CONFIGURED'
        and exists (select 1 from scoring_authority.rounds round_value
          where round_value.tournament_id = target_id and not exists (
            select 1 from scoring_authority.net_skins_v1_result_revisions result
            where result.tournament_id = target_id
              and result.round_number = round_value.round_number
              and result.result_state = 'OFFICIAL' and result.is_current
          ))
    ) or exists (
      select 1 from scoring_authority.calcutta_v1_current value
      where value.tournament_id = target_id
        and value.state not in ('NOT_CONFIGURED', 'OFFICIAL')
    ) then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'CONFIGURED_SIDE_GAME_OFFICIAL_RESULT_REQUIRED'
      );
    end if;
    if expected_revision <> prior_revision
       or pg_catalog.jsonb_array_length(blockers) > 0 then
      raise exception using errcode = '40001',
        message = 'FUTURE_TOURNAMENT_CLOSE_BLOCKED',
        detail = blockers::text;
    end if;
    next_revision := prior_revision + 1;
    update production_control.future_tournament_catalog_v1 set
      lifecycle = 'CLOSED', lifecycle_revision = next_revision,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update production_control.future_annual_runtime_generations_v1 set
      generation_status = 'CLOSED', closed_by_player_id = actor_player,
      closed_at = pg_catalog.clock_timestamp(),
      runtime_revision = runtime_revision + 1,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id and generation_status = 'ACTIVE';
    update production_control.future_runtime_promotions_v2 set
      runtime_status = 'CLOSED', updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    target_kind := 'CLOSE'; target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Tournament closed', 'newScoringAllowed', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_TOURNAMENT_CLOSED',
      'action', action_value, 'tournamentId', target_id,
      'lifecycle', 'CLOSED', 'priorRevision', prior_revision,
      'nextRevision', next_revision, 'idempotent', false
    );

  elsif action_value = 'PREPARE_ARCHIVE_PLAN' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    prior_revision := coalesce((select pg_catalog.max(value.plan_revision)
      from production_control.future_archive_plans_v1 value
      where value.tournament_id = target_id), 0);
    if expected_revision <> prior_revision or catalog.lifecycle <> 'CLOSED' then
      raise exception using errcode = '40001',
        message = 'FUTURE_ARCHIVE_PLAN_PREDECESSOR_INVALID';
    end if;
    blockers := '[]'::jsonb;
    if exists (select 1 from scoring_authority.matches value
      where value.tournament_id = target_id and (
        value.status <> 'FINAL' or not value.scorecard_complete
      )) then blockers := blockers || pg_catalog.jsonb_build_array(
      'FINAL_MATCH_FACTS_INCOMPLETE'
    ); end if;
    if exists (select 1 from scoring_authority.scorecard_archive_checkpoints value
      where value.tournament_id = target_id and value.status <> 'VERIFIED') then
      blockers := blockers || pg_catalog.jsonb_build_array(
        'ROUND_SCORECARDS_ARCHIVE_INCOMPLETE'
      );
    end if;
    source_fingerprint := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-archive-source-v1',
        'tournamentId', target_id,
        'tournament', (select pg_catalog.to_jsonb(value)
          from scoring_authority.tournaments value
          where value.tournament_id = target_id),
        'teams', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.team_side) from scoring_authority.teams value
          where value.tournament_id = target_id),
        'roster', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.player_id)
          from scoring_authority.tournament_players value
          where value.tournament_id = target_id),
        'rounds', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.round_number) from scoring_authority.rounds value
          where value.tournament_id = target_id),
        'matches', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.match_id) from scoring_authority.matches value
          where value.tournament_id = target_id),
        'finalizedScorecards', (select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'matchId', value.match_id, 'matchRevision', value.match_revision,
            'snapshotRevision', value.snapshot_revision,
            'sourceFingerprint', value.source_fingerprint,
            'payloadHash', value.payload_hash
          ) order by value.match_id)
          from scoring_authority.finalized_scorecard_snapshots value
          where value.tournament_id = target_id and value.state = 'CURRENT')
      )
    );
    archive_fingerprint := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-archive-plan-v1',
        'tournamentId', target_id,
        'lifecycleRevision', catalog.lifecycle_revision,
        'sourceFingerprint', source_fingerprint,
        'blockers', blockers,
        'actualHistoryPromotionInstalled', false
      )
    );
    next_revision := prior_revision + 1;
    insert into production_control.future_archive_plans_v1 (
      tournament_id, plan_revision, lifecycle_revision,
      source_fingerprint, archive_fingerprint, readiness_status,
      blocker_codes, created_by_player_id
    ) values (
      target_id, next_revision, catalog.lifecycle_revision,
      source_fingerprint, archive_fingerprint,
      case when pg_catalog.jsonb_array_length(blockers) = 0
        then 'READY' else 'BLOCKED' end,
      blockers, actor_player
    );
    target_kind := 'ARCHIVE_PLAN'; target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Archive readiness plan prepared',
      'ready', pg_catalog.jsonb_array_length(blockers) = 0,
      'historyPromotionExecuted', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_ARCHIVE_PLAN_PREPARED',
      'action', action_value, 'tournamentId', target_id,
      'planRevision', next_revision,
      'readinessStatus', case when pg_catalog.jsonb_array_length(blockers) = 0
        then 'READY' else 'BLOCKED' end,
      'blockers', blockers, 'sourceFingerprint', source_fingerprint,
      'archiveFingerprint', archive_fingerprint,
      'historyPromotionExecuted', false,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'PREPARE_SCORING_CONTEXT' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict match_value
    from scoring_authority.matches value
    where value.tournament_id = target_id
      and value.match_id = input->>'match_id' for update;
    select value.* into strict binding
    from production_control.future_runtime_match_bindings_v2 value
    where value.match_id = match_value.match_id for update;
    select value.* into strict detail
    from scoring_authority.tournament_setup_match_details_v1 value
    where value.match_id = match_value.match_id;
    select value.revision_id into strict current_handicap
    from scoring_authority.handicap_revision_current value
    where value.tournament_id = target_id;
    prior_revision := binding.runtime_revision;
    expected_count := case when match_value.format = 'SI' then 2 else 4 end;
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or match_value.status <> 'UPCOMING' or match_value.match_revision <> 0
       or (select pg_catalog.count(*)
         from scoring_authority.match_participants value
         where value.match_id = match_value.match_id) <> expected_count
       or (select pg_catalog.count(*)
         from scoring_authority.tournament_setup_course_holes_v1 hole
         where hole.tournament_id = target_id
           and hole.course_id = detail.course_id
           and hole.tee_id = detail.tee_id) <> 18 then
      raise exception using errcode = '40001',
        message = 'FUTURE_SCORING_CONTEXT_PREDECESSOR_INVALID';
    end if;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'hole_number', hole.hole_number, 'par', hole.par,
      'stroke_index', hole.stroke_index, 'yardage', hole.yardage
    ) order by hole.hole_number) into strict holes_value
    from scoring_authority.tournament_setup_course_holes_v1 hole
    where hole.tournament_id = target_id
      and hole.course_id = detail.course_id and hole.tee_id = detail.tee_id;
    context_value := production_control.future_handicap_match_context_v2(
      match_value.match_id, current_handicap
    );
    participant_manifest := context_value->'participant_configuration';
    preparation_fingerprint := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-scoring-context-v1',
        'tournamentId', target_id, 'matchId', match_value.match_id,
        'round', match_value.round_number, 'format', match_value.format,
        'courseId', detail.course_id, 'teeId', detail.tee_id,
        'startingHole', detail.starting_hole,
        'holes', holes_value, 'participants', participant_manifest,
        'teams', context_value->'team_configuration',
        'handicapRevisionId', current_handicap,
        'setupRevision', detail.setup_revision,
        'runtimeRevision', binding.runtime_revision
      )
    );
    select coalesce(pg_catalog.max(value.snapshot_revision), 0) + 1
      into next_snapshot_revision
    from scoring_authority.scoring_snapshots value
    where value.match_id = match_value.match_id;
    next_snapshot_id := match_value.match_id || ':S' || next_snapshot_revision;
    next_snapshot_hash := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'preparationFingerprint', preparation_fingerprint,
        'snapshotRevision', next_snapshot_revision,
        'participantConfiguration', participant_manifest,
        'teamConfiguration', context_value->'team_configuration'
      )
    );
    insert into scoring_authority.scoring_snapshots (
      snapshot_id, tournament_id, match_id, snapshot_revision,
      scoring_rules_version, format, handicap_allowance,
      course_id, tee, rating, slope, par, match_netting_baseline,
      hole_definitions, participant_configuration, team_configuration,
      effective_at, canonical_hash, handicap_revision_id
    ) select next_snapshot_id, target_id, match_value.match_id,
      next_snapshot_revision, 'production-scoring-rules-v1',
      match_value.format, round_value.handicap_allowance,
      detail.course_id, detail.tee_id, tee.rating, tee.slope, tee.par,
      'LOWEST_PLAYING_HANDICAP', holes_value, participant_manifest,
      context_value->'team_configuration', pg_catalog.clock_timestamp(),
      next_snapshot_hash, current_handicap
    from scoring_authority.rounds round_value
    join scoring_authority.tournament_setup_course_tees_v1 tee
      on tee.tournament_id = round_value.tournament_id
     and tee.course_id = detail.course_id and tee.tee_id = detail.tee_id
    where round_value.tournament_id = target_id
      and round_value.round_number = match_value.round_number;
    update scoring_authority.match_participants participant set
      tournament_handicap = (item->>'tournament_handicap')::numeric,
      handicap_index = (item->>'handicap_index')::numeric,
      course_handicap = (item->>'course_handicap')::numeric,
      playing_handicap = (item->>'playing_handicap')::numeric,
      final_strokes = (item->>'final_strokes')::integer,
      handicap_revision_id = current_handicap
    from pg_catalog.jsonb_array_elements(context_value->'participants') item
    where participant.match_id = match_value.match_id
      and participant.player_id = item->>'player_id';
    delete from scoring_authority.match_holes value
    where value.match_id = match_value.match_id;
    insert into scoring_authority.match_holes (
      match_id, hole_number, snapshot_id, stroke_index, par, yardage
    ) select match_value.match_id, (item->>'hole_number')::integer,
      next_snapshot_id, (item->>'stroke_index')::integer,
      (item->>'par')::integer, nullif(item->>'yardage', '')::integer
    from pg_catalog.jsonb_array_elements(holes_value) item;
    update scoring_authority.matches set
      scoring_snapshot_id = next_snapshot_id,
      scoring_locked = true, updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    next_revision := prior_revision + 1;
    update scoring_authority.tournament_setup_match_details_v1 set
      prepared_setup_revision = setup_revision,
      prepared_configuration_fingerprint = preparation_fingerprint,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    update production_control.future_runtime_match_bindings_v2 set
      runtime_revision = next_revision, runtime_state = 'PREPARED',
      configuration_fingerprint = preparation_fingerprint,
      updated_at = pg_catalog.clock_timestamp()
    where match_id = match_value.match_id;
    target_kind := 'SCORING_CONTEXT'; target_object := match_value.match_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future scoring snapshot prepared',
      'matchId', match_value.match_id,
      'snapshotRevision', next_snapshot_revision,
      'scoringAccessGranted', false, 'scoreFactsChanged', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_SCORING_CONTEXT_PREPARED',
      'action', action_value, 'tournamentId', target_id,
      'matchId', match_value.match_id, 'snapshotId', next_snapshot_id,
      'snapshotRevision', next_snapshot_revision,
      'configurationFingerprint', preparation_fingerprint,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'scoringAccessGranted', false, 'idempotent', false
    );


  elsif action_value = 'STAGE_HANDICAPS' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict promotion
    from production_control.future_runtime_promotions_v2 value
    where value.tournament_id = target_id;
    select coalesce(value.revision_number, 0), value.revision_id
      into prior_revision, current_handicap
    from scoring_authority.handicap_revision_current value
    where value.tournament_id = target_id;
    prior_revision := coalesce(prior_revision, 0);
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or promotion.tournament_id is null
       or pg_catalog.jsonb_typeof(input->'entries') <> 'array'
       or pg_catalog.jsonb_array_length(input->'entries') < 1 then
      raise exception using errcode = '40001',
        message = 'FUTURE_HANDICAP_STAGE_PREDECESSOR_INVALID';
    end if;
    if (select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(input->'entries')) <>
       (select pg_catalog.count(*)
        from scoring_authority.tournament_players value
        where value.tournament_id = target_id
          and value.participation_status = 'ACTIVE')
       or (select pg_catalog.count(distinct pg_catalog.upper(
          pg_catalog.btrim(item->>'player_id')))
        from pg_catalog.jsonb_array_elements(input->'entries') item) <>
         pg_catalog.jsonb_array_length(input->'entries')
       or exists (
         select 1 from pg_catalog.jsonb_array_elements(input->'entries') item
         where coalesce(item->>'player_id', '') !~
             '^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$'
           or coalesce(item->>'tournament_handicap', '') !~
             '^-?[0-9]+(?:\.[0-9]+)?$'
           or not exists (
             select 1 from scoring_authority.tournament_players membership
             where membership.tournament_id = target_id
               and membership.player_id = pg_catalog.upper(
                 pg_catalog.btrim(item->>'player_id')
               )
               and membership.participation_status = 'ACTIVE'
           )
       ) then
      raise exception using errcode = '22023',
        message = 'FUTURE_HANDICAP_COMPLETE_ACTIVE_ROSTER_REQUIRED';
    end if;
    next_revision := coalesce((select pg_catalog.max(value.revision_number)
      from scoring_authority.handicap_revisions value
      where value.tournament_id = target_id), 0) + 1;
    handicap_revision_id_value := extensions.gen_random_uuid();
    manifest_fingerprint := production_control.future_runtime_hash_v2(
      (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'player_id', pg_catalog.upper(pg_catalog.btrim(item->>'player_id')),
        'tournament_handicap', (item->>'tournament_handicap')::numeric,
        'source_index', nullif(item->>'source_index', '')::numeric,
        'low_index', nullif(item->>'low_index', '')::numeric
      ) order by pg_catalog.upper(pg_catalog.btrim(item->>'player_id')))
      from pg_catalog.jsonb_array_elements(input->'entries') item)
    );
    insert into scoring_authority.handicap_revisions (
      revision_id, tournament_id, revision_number, status,
      effective_date, method, source_metadata, source_evidence_date,
      canonical_fingerprint, roster_fingerprint,
      predecessor_revision, predecessor_revision_id,
      context_contract_version, created_by, created_by_auth_user_id
    ) values (
      handicap_revision_id_value, target_id, next_revision, 'DRAFT',
      catalog.start_date,
      pg_catalog.btrim(coalesce(input->>'method', 'DIRECTOR_REVIEW')),
      pg_catalog.jsonb_build_object(
        'source', 'DIRECTOR_FUTURE_RUNTIME_V2',
        'sourceYear', input->>'source_year',
        'carryForwardApproved', false
      ), nullif(input->>'source_evidence_date', '')::date,
      manifest_fingerprint,
      production_control.handicap_v1_roster_fingerprint(target_id),
      prior_revision, current_handicap,
      'production-handicap-context-v1', actor_player, actor_auth
    );
    insert into scoring_authority.handicap_revision_entries (
      revision_id, tournament_id, player_id, tournament_handicap,
      source_index, low_index, source_metadata
    ) select handicap_revision_id_value, target_id,
      pg_catalog.upper(pg_catalog.btrim(item->>'player_id')),
      (item->>'tournament_handicap')::numeric,
      nullif(item->>'source_index', '')::numeric,
      nullif(item->>'low_index', '')::numeric,
      pg_catalog.jsonb_build_object('source', 'DIRECTOR_FUTURE_RUNTIME_V2')
    from pg_catalog.jsonb_array_elements(input->'entries') item;
    insert into scoring_authority.handicap_audit_events (
      tournament_id, revision_id, action, actor_player_id,
      actor_auth_user_id, operation_request_id, request_payload_hash,
      canonical_fingerprint, before_state, after_state
    ) values (
      target_id, handicap_revision_id_value, 'REVISION_STAGED', actor_player,
      actor_auth, request_id, database_hash, manifest_fingerprint,
      pg_catalog.jsonb_build_object('approvedRevision', prior_revision),
      pg_catalog.jsonb_build_object(
        'draftRevision', next_revision, 'entryCount',
          pg_catalog.jsonb_array_length(input->'entries')
      )
    );
    target_kind := 'HANDICAP';
    target_object := handicap_revision_id_value::text;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future handicap revision staged',
      'revision', next_revision,
      'entryCount', pg_catalog.jsonb_array_length(input->'entries')
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_HANDICAPS_STAGED',
      'action', action_value, 'tournamentId', target_id,
      'revisionId', handicap_revision_id_value, 'revisionNumber', next_revision,
      'canonicalFingerprint', manifest_fingerprint,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'idempotent', false
    );

  elsif action_value = 'APPROVE_HANDICAPS' then
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    begin handicap_revision_id_value :=
      (input->>'handicap_revision_id')::uuid;
    exception when others then
      raise exception using errcode = '22023',
        message = 'FUTURE_HANDICAP_REVISION_ID_INVALID';
    end;
    select coalesce(value.revision_number, 0), value.revision_id
      into prior_revision, current_handicap
    from scoring_authority.handicap_revision_current value
    where value.tournament_id = target_id;
    prior_revision := coalesce(prior_revision, 0);
    if expected_revision <> prior_revision
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or not exists (
         select 1 from scoring_authority.handicap_revisions value
         where value.revision_id = handicap_revision_id_value
           and value.tournament_id = target_id and value.status = 'DRAFT'
           and value.predecessor_revision = prior_revision
       )
       or (select pg_catalog.count(*)
         from scoring_authority.handicap_revision_entries value
         where value.revision_id = handicap_revision_id_value) <>
         (select pg_catalog.count(*)
          from scoring_authority.tournament_players value
          where value.tournament_id = target_id
            and value.participation_status = 'ACTIVE') then
      raise exception using errcode = '40001',
        message = 'FUTURE_HANDICAP_APPROVAL_PREDECESSOR_INVALID';
    end if;
    if current_handicap is not null then
      update scoring_authority.handicap_revisions set
        status = 'SUPERSEDED', superseded_at = pg_catalog.clock_timestamp()
    where scoring_authority.handicap_revisions.revision_id = current_handicap;
    end if;
    update scoring_authority.handicap_revisions set
      status = 'APPROVED', approved_by = actor_player,
      approved_by_auth_user_id = actor_auth,
      approved_at = pg_catalog.clock_timestamp()
    where scoring_authority.handicap_revisions.revision_id =
      handicap_revision_id_value;
    select value.revision_number into strict next_revision
    from scoring_authority.handicap_revisions value
    where value.revision_id = handicap_revision_id_value;
    insert into scoring_authority.handicap_revision_current (
      tournament_id, revision_id, revision_number
    ) values (target_id, handicap_revision_id_value, next_revision)
    on conflict (tournament_id) do update set
      revision_id = excluded.revision_id,
      revision_number = excluded.revision_number,
      updated_at = pg_catalog.clock_timestamp();
    update scoring_authority.tournament_players membership set
      tournament_handicap = entry.tournament_handicap,
      handicap_revision_id = handicap_revision_id_value,
      updated_at = pg_catalog.clock_timestamp()
    from scoring_authority.handicap_revision_entries entry
    where entry.revision_id = handicap_revision_id_value
      and entry.tournament_id = target_id
      and membership.tournament_id = entry.tournament_id
      and membership.player_id = entry.player_id;
    -- A changed approved context invalidates only affected private, unstarted
    -- future snapshots.  Immutable snapshot rows remain as evidence.
    delete from scoring_authority.match_holes hole
    using scoring_authority.matches match_value
    where match_value.tournament_id = target_id
      and match_value.status = 'UPCOMING' and match_value.match_revision = 0
      and hole.match_id = match_value.match_id;
    update scoring_authority.matches set
      scoring_snapshot_id = null, scoring_locked = true,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id and status = 'UPCOMING'
      and match_revision = 0 and scoring_snapshot_id is not null;
    update scoring_authority.tournament_setup_match_details_v1 set
      prepared_setup_revision = null,
      prepared_configuration_fingerprint = null,
      updated_by_player_id = actor_player,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update production_control.future_runtime_match_bindings_v2 set
      runtime_state = case when exists (
        select 1 from scoring_authority.match_participants participant
        where participant.match_id = future_runtime_match_bindings_v2.match_id
      ) then 'PAIRED' else 'CONFIGURED' end,
      runtime_revision = runtime_revision + 1,
      configuration_fingerprint = null,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    update scoring_authority.match_participants participant set
      tournament_handicap = entry.tournament_handicap,
      handicap_index = entry.tournament_handicap,
      handicap_revision_id = handicap_revision_id_value
    from scoring_authority.handicap_revision_entries entry,
      scoring_authority.matches match_value
    where match_value.match_id = participant.match_id
      and match_value.tournament_id = target_id
      and entry.revision_id = handicap_revision_id_value
      and entry.player_id = participant.player_id;
    insert into scoring_authority.handicap_audit_events (
      tournament_id, revision_id, action, actor_player_id,
      actor_auth_user_id, operation_request_id, request_payload_hash,
      canonical_fingerprint, before_state, after_state
    ) select target_id, value.revision_id, 'REVISION_APPROVED', actor_player,
      actor_auth, request_id, database_hash, value.canonical_fingerprint,
      pg_catalog.jsonb_build_object('approvedRevision', prior_revision),
      pg_catalog.jsonb_build_object('approvedRevision', next_revision)
    from scoring_authority.handicap_revisions value
    where value.revision_id = handicap_revision_id_value;
    target_kind := 'HANDICAP';
    target_object := handicap_revision_id_value::text;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future handicap revision approved',
      'revision', next_revision, 'scoringFactsChanged', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_HANDICAPS_APPROVED',
      'action', action_value, 'tournamentId', target_id,
      'revisionId', handicap_revision_id_value,
      'revisionNumber', next_revision,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'snapshotsInvalidated', true, 'scoreFactsChanged', false,
      'idempotent', false
    );


  elsif action_value = 'PROMOTE_RUNTIME_STRUCTURE' then
    if target_id = '' then
      raise exception using errcode = '22023',
        message = 'FUTURE_RUNTIME_TARGET_REQUIRED';
    end if;
    select value.* into strict catalog
    from production_control.future_tournament_catalog_v1 value
    where value.tournament_id = target_id for update;
    select value.* into strict pointer
    from production_control.current_tournament_pointer_v1 value
    where value.scope_key = 'BAGGER_INV_PRODUCTION';
    select value.* into strict resource
    from production_control.future_tournament_resources_v1 value
    where value.tournament_id = target_id;
    prior_revision := coalesce((select value.promotion_revision
      from production_control.future_runtime_promotions_v2 value
      where value.tournament_id = target_id), 0);
    if expected_revision <> prior_revision
       or pointer.tournament_id = target_id
       or target_id = '2026'
       or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
       or catalog.setup_revision <= 0
       or resource.source_workbook_id is null
       or resource.project_ref is distinct from
         (select project_ref from production_control.resource_scope
          where scope_key = 'BAGGER_INV_PRODUCTION')
       or resource.project_url is distinct from
         (select project_url from production_control.resource_scope
          where scope_key = 'BAGGER_INV_PRODUCTION') then
      raise exception using errcode = '40001',
        message = 'FUTURE_RUNTIME_PROMOTION_PREDECESSOR_INVALID';
    end if;
    if prior_revision > 0 then
      raise exception using errcode = '55000',
        message = 'FUTURE_RUNTIME_ALREADY_PROMOTED';
    end if;
    if exists (select 1 from scoring_authority.tournaments value
      where value.tournament_id = target_id)
       or (select pg_catalog.count(*)
        from production_control.future_tournament_teams_v1 value
        where value.tournament_id = target_id and value.active) <> 2
       or not exists (select 1
        from production_control.future_tournament_roster_v1 value
        where value.tournament_id = target_id
          and value.participation_status = 'ACTIVE')
       or exists (select 1
        from production_control.future_tournament_roster_v1 value
        where value.tournament_id = target_id
          and value.participation_status = 'ACTIVE'
          and (value.team_id is null or value.team_side is null))
       or not exists (select 1
        from production_control.future_tournament_rounds_v1 value
        where value.tournament_id = target_id)
       or not exists (select 1
        from production_control.future_match_definitions_v1 value
        where value.tournament_id = target_id) then
      raise exception using errcode = '55000',
        message = 'FUTURE_RUNTIME_STAGED_STRUCTURE_INCOMPLETE';
    end if;
    manifest_fingerprint := production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-runtime-promotion-v2',
        'tournamentId', target_id, 'year', catalog.tournament_year,
        'setupRevision', catalog.setup_revision,
        'teams', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.team_side)
          from production_control.future_tournament_teams_v1 value
          where value.tournament_id = target_id),
        'roster', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.player_id)
          from production_control.future_tournament_roster_v1 value
          where value.tournament_id = target_id),
        'rounds', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.round_number)
          from production_control.future_tournament_rounds_v1 value
          where value.tournament_id = target_id),
        'courses', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.round_number)
          from production_control.future_tournament_course_references_v1 value
          where value.tournament_id = target_id),
        'matches', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value)
          order by value.round_number, value.match_number)
          from production_control.future_match_definitions_v1 value
          where value.tournament_id = target_id)
      )
    );
    insert into scoring_authority.tournaments (
      tournament_id, tournament_year, name, source_workbook_id,
      scoring_authority
    ) values (
      target_id, catalog.tournament_year, catalog.tournament_name,
      resource.source_workbook_id, 'SUPABASE'
    );
    insert into scoring_authority.teams (
      tournament_id, team_id, team_side, name, source_payload
    ) select target_id, value.team_id, value.team_side, value.team_name,
      pg_catalog.jsonb_build_object(
        'futureRuntimePromotion', true,
        'captainPlayerId', value.captain_player_id
      )
    from production_control.future_tournament_teams_v1 value
    where value.tournament_id = target_id and value.active;
    insert into scoring_authority.tournament_players (
      tournament_id, player_id, team_id, team_side,
      participation_status, source_roster_key, source_payload
    ) select target_id, value.player_id, value.team_id, value.team_side,
      value.participation_status,
      target_id || ':' || value.player_id,
      pg_catalog.jsonb_build_object('futureRuntimePromotion', true)
    from production_control.future_tournament_roster_v1 value
    where value.tournament_id = target_id
      and value.team_id is not null and value.team_side is not null;
    insert into scoring_authority.rounds (
      tournament_id, round_number, format, name, handicap_allowance,
      status, source_payload
    ) select target_id, value.round_number, value.format, value.round_name,
      value.handicap_allowance, 'UPCOMING',
      pg_catalog.jsonb_build_object('futureRuntimePromotion', true)
    from production_control.future_tournament_rounds_v1 value
    where value.tournament_id = target_id;
    insert into production_control.tournament_setup_context_v1 (
      tournament_id, contract_version, revision,
      updated_by_player_id, updated_by_auth_user_id
    ) values (
      target_id, 'production-tournament-setup-v1', catalog.setup_revision,
      actor_player, actor_auth
    );
    insert into scoring_authority.tournament_setup_operational_v1 (
      tournament_id, destination, start_date, end_date, timezone,
      operational_status, setup_revision, updated_by_player_id
    ) values (
      target_id, catalog.destination, catalog.start_date, catalog.end_date,
      catalog.timezone, 'UPCOMING', catalog.setup_revision, actor_player
    );
    insert into scoring_authority.tournament_setup_team_details_v1 (
      tournament_id, team_id, captain_player_id, setup_revision,
      updated_by_player_id
    ) select target_id, value.team_id, value.captain_player_id,
      catalog.setup_revision, actor_player
    from production_control.future_tournament_teams_v1 value
    where value.tournament_id = target_id and value.active;
    insert into scoring_authority.tournament_setup_round_details_v1 (
      tournament_id, round_number, team_size, points_available,
      display_order, setup_revision, updated_by_player_id
    ) select target_id, value.round_number, value.team_size,
      value.points_available, value.round_number, catalog.setup_revision,
      actor_player
    from production_control.future_tournament_rounds_v1 value
    where value.tournament_id = target_id;
    insert into scoring_authority.tournament_setup_course_tees_v1 (
      tournament_id, course_id, tee_id, display_name, location,
      rating, slope, par, setup_revision, updated_by_player_id
    ) select distinct target_id, source.course_id, source.tee_id,
      source.display_name, source.location, source.rating, source.slope,
      source.par, catalog.setup_revision, actor_player
    from (
      select reference.tournament_id, existing.course_id, existing.tee_id,
        existing.display_name, existing.location, existing.rating,
        existing.slope, existing.par
      from production_control.future_tournament_course_references_v1 reference
      join scoring_authority.tournament_setup_course_tees_v1 existing
        on existing.tournament_id = reference.source_tournament_id
       and existing.course_id = reference.course_id
       and existing.tee_id = reference.tee_id
      where reference.reference_status = 'EXISTING_REFERENCE'
      union all
      select reference.tournament_id, context.course_id, context.tee_id,
        global_course.display_name, global_course.location, context.rating,
        context.slope, context.par
      from production_control.future_tournament_course_references_v1 reference
      join scoring_authority.global_course_tee_contexts_v1 context
        on context.course_id = reference.course_id
       and context.tee_id = reference.tee_id
       and context.context_revision = reference.source_setup_revision
      join scoring_authority.global_course_catalog_v1 global_course
        on global_course.course_id = context.course_id
       and global_course.catalog_status = 'ACTIVE'
      where reference.reference_status = 'GLOBAL_COURSE_CONTEXT'
    ) source
    where source.tournament_id = target_id;
    insert into scoring_authority.tournament_setup_course_holes_v1 (
      tournament_id, course_id, tee_id, hole_number, par,
      stroke_index, yardage, setup_revision
    ) select target_id, source.course_id, source.tee_id,
      source.hole_number, source.par, source.stroke_index, source.yardage,
      catalog.setup_revision
    from (
      select reference.tournament_id, existing.course_id, existing.tee_id,
        existing.hole_number, existing.par, existing.stroke_index,
        existing.yardage
      from production_control.future_tournament_course_references_v1 reference
      join scoring_authority.tournament_setup_course_holes_v1 existing
        on existing.tournament_id = reference.source_tournament_id
       and existing.course_id = reference.course_id
       and existing.tee_id = reference.tee_id
      where reference.reference_status = 'EXISTING_REFERENCE'
      union all
      select reference.tournament_id, context.course_id, context.tee_id,
        context.hole_number, context.par, context.stroke_index,
        context.yardage
      from production_control.future_tournament_course_references_v1 reference
      join scoring_authority.global_course_hole_contexts_v1 context
        on context.course_id = reference.course_id
       and context.tee_id = reference.tee_id
       and context.context_revision = reference.source_setup_revision
      where reference.reference_status = 'GLOBAL_COURSE_CONTEXT'
    ) source
    where source.tournament_id = target_id;
    insert into scoring_authority.tournament_setup_round_courses_v1 (
      tournament_id, round_number, course_id, tee_id,
      setup_revision, updated_by_player_id
    ) select target_id, value.round_number, value.course_id, value.tee_id,
      catalog.setup_revision, actor_player
    from production_control.future_tournament_course_references_v1 value
    where value.tournament_id = target_id;
    insert into production_control.future_runtime_promotions_v2 (
      tournament_id, contract_version, promotion_revision,
      source_setup_revision, promoted_manifest_fingerprint,
      runtime_status, promoted_by_player_id, promoted_by_auth_user_id
    ) values (
      target_id, 'production-future-runtime-activation-v2', 1,
      catalog.setup_revision, manifest_fingerprint, 'PROMOTED',
      actor_player, actor_auth
    );
    insert into scoring_authority.matches (
      match_id, tournament_id, round_number, format, scoring_snapshot_id,
      status, scoring_locked
    ) select value.match_id, target_id, value.round_number, value.format,
      null, 'UPCOMING', true
    from production_control.future_match_definitions_v1 value
    where value.tournament_id = target_id;
    insert into production_control.future_runtime_match_bindings_v2 (
      tournament_id, match_id, structural_setup_revision,
      runtime_revision, runtime_state
    ) select target_id, value.match_id, value.setup_revision, 1, 'PROMOTED'
    from production_control.future_match_definitions_v1 value
    where value.tournament_id = target_id;
    insert into scoring_authority.google_match_checkpoints (
      match_id, last_supabase_match_revision, google_match_revision,
      google_hole_revisions
    ) select value.match_id, 0, 0, '{}'::jsonb
    from production_control.future_match_definitions_v1 value
    where value.tournament_id = target_id;
    update production_control.future_match_google_compatibility_jobs_v1 value
    set writer_installed = false,
      -- The exact writer manifest depends on configured tee/pairing fields and
      -- is therefore bound by the leased claim operation after preparation.
      -- Migration 064's immutable false-only writer guard remains in force;
      -- do not claim the compatibility writer is installed until replacing
      -- that guard is separately authorized and certified.
      expected_manifest_fingerprint = null,
      status = 'PROVISIONING_REQUIRED', available_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where value.tournament_id = target_id;
    update production_control.future_tournament_catalog_v1 set
      lifecycle = 'CONFIGURING', lifecycle_revision = lifecycle_revision + 1,
      readiness_fingerprint = null, readiness_setup_revision = null,
      updated_by_player_id = actor_player,
      updated_by_auth_user_id = actor_auth,
      updated_at = pg_catalog.clock_timestamp()
    where tournament_id = target_id;
    prior_revision := 0;
    next_revision := 1;
    target_kind := 'RUNTIME';
    target_object := target_id;
    safe_metadata := pg_catalog.jsonb_build_object(
      'summary', 'Future tournament structure promoted',
      'runtimeMatches', (select pg_catalog.count(*)
        from scoring_authority.matches where tournament_id = target_id),
      'scoringAccessCreated', false, 'scoresCreated', false
    );
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'PRODUCTION_FUTURE_RUNTIME_PROMOTED',
      'action', action_value, 'tournamentId', target_id,
      'promotionRevision', 1, 'manifestFingerprint', manifest_fingerprint,
      'priorRevision', prior_revision, 'nextRevision', next_revision,
      'scoringAccessCreated', false, 'scoreFactsCreated', false,
      'idempotent', false
    );

  end if;

  if result_value is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_RUNTIME_RESULT_REQUIRED';
  end if;
  insert into production_control.future_runtime_audit_events_v2 (
    tournament_id, action, target_kind, target_id, actor_player_id,
    prior_revision, next_revision, operation_request_id, result, safe_metadata
  ) values (
    nullif(target_id, ''), action_value, target_kind,
    coalesce(target_object, target_id, 'GLOBAL'), actor_player,
    prior_revision, next_revision, request_id,
    case when changed_value then 'CHANGED' else 'NO_CHANGE' end,
    safe_metadata
  );
  insert into production_control.future_runtime_operation_receipts_v2 (
    tournament_id, action, operation_request_id,
    declared_request_payload_hash, database_request_payload_hash,
    actor_player_id, actor_auth_user_id, prior_revision, next_revision,
    response
  ) values (
    nullif(target_id, ''), action_value, request_id,
    declared_hash, database_hash, actor_player, actor_auth,
    prior_revision, next_revision, result_value
  );
  return result_value;
end;
$future_runtime_mutation$;

create or replace function public.read_production_future_current_view_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $future_current_read$
declare
  resource production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  projection_binding production_control.future_annual_projection_bindings_v1%rowtype;
  surface text := pg_catalog.upper(pg_catalog.btrim(coalesce(input->>'surface', '')));
  required_phase text := case
    when surface in ('PUBLISHED_ODDS', 'GUIDE_COURSE_CONTEXT', 'GUIDE_PROJECTION')
      then 'READ_CUTOVER'
    when surface = 'ODDS_INPUT' then 'ODDS_WAR_ROOM'
    when surface in ('NET_SKINS_V1', 'CALCUTTA_V1') then 'OBSERVATION'
    else 'CURRENT_READS' end;
  target_id text := pg_catalog.btrim(coalesce(input->>'target_tournament_id', ''));
  player_id_value text := pg_catalog.btrim(coalesce(input->>'player_id', ''));
  match_id_value text := pg_catalog.btrim(coalesce(input->>'match_id', ''));
  engine_keys_value text[];
  result_value jsonb;
begin
  resource := production_control.assert_production_cutover_read_scope(input, required_phase);
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  if target_id = '' or target_id = '2026'
     or target_id is distinct from pointer.tournament_id
     or pointer.tournament_year <= 2026
     or generation.pointer_revision <> pointer.pointer_revision
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_CURRENT_POINTER_REQUIRED';
  end if;
  if surface in ('TOURNAMENT_LIVE', 'LEADERBOARDS', 'GUIDE_COURSE_CONTEXT') then
    result_value := public.read_leaderboards_core_view(target_id);
    if surface = 'TOURNAMENT_LIVE' and result_value->>'ok' = 'true' then
      -- The existing live adapter hashes `live_revision`.  Preserve its DTO
      -- contract while sourcing the revision from the pointer-selected annual
      -- view's canonical `source_revision` projection.
      result_value := pg_catalog.jsonb_set(
        result_value,
        '{data,live_revision}',
        coalesce(result_value#>'{data,source_revision}', '{}'::jsonb),
        true
      );
    end if;
  elsif surface = 'PARTICIPANT_HOME' then
    result_value := case when player_id_value = ''
      then pg_catalog.jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED')
      else public.read_participant_home_view(target_id, player_id_value) end;
  elsif surface = 'MY_MATCH' then
    result_value := case when player_id_value = ''
      then pg_catalog.jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED')
      else public.read_my_match_view(target_id, player_id_value) end;
  elsif surface = 'GAME_CENTER' then
    if match_id_value = '' or not exists (
      select 1 from scoring_authority.matches value
      where value.match_id = match_id_value and value.tournament_id = target_id
    ) then
      result_value := pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'PRODUCTION_MATCH_NOT_FOUND'
      );
    else
      result_value := public.read_game_center_view(match_id_value);
    end if;
  elsif surface = 'MATCH_AUTHORIZATION' then
    result_value := public.read_match_authorization_matrix(target_id);
  elsif surface = 'NET_SKINS_INPUT' then
    result_value := public.read_net_skins_input_view(target_id);
  elsif surface = 'NET_SKINS_RESULT' then
    result_value := public.read_net_skins_result_view(target_id);
  elsif surface = 'NET_SKINS_V1' then
    -- Optional annual side-game facts are never cloned.  Until a separately
    -- bounded tournament-scoped configuration operation creates them, the
    -- exact participant-safe V1 DTO is an authoritative NOT_CONFIGURED state.
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'data', pg_catalog.jsonb_build_object(
        'contract_version', 'production-net-skins-v1',
        'tournament_id', target_id, 'state', 'NOT_CONFIGURED',
        'publication_policy', 'OFFICIAL_ONLY',
        'configuration_revision', 0, 'result_revision', null,
        'configuration_fingerprint', null,
        'revision', pg_catalog.format(
          'net-skins-v1:%s:0:NOT_CONFIGURED', 0
        ),
        'freshness', pg_catalog.jsonb_build_object(
          'stale', false, 'configured_at', null,
          'calculated_at', null, 'published_at', null,
          'source_fingerprint', null
        ),
        'rounds', '[]'::jsonb
      )
    );
  elsif surface = 'CALCUTTA_CONFIGURATION' then
    result_value := public.read_calcutta_configuration_view(target_id);
  elsif surface = 'CALCUTTA_V1' then
    if player_id_value = '' or not exists (
      select 1 from scoring_authority.tournament_players membership
      where membership.tournament_id = target_id
        and membership.player_id = player_id_value
        and membership.participation_status = 'ACTIVE'
    ) then
      raise exception using errcode = '42501',
        message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESOURCE_REQUIRED';
    end if;
    result_value := pg_catalog.jsonb_build_object(
      'ok', true, 'data', pg_catalog.jsonb_build_object(
        'contract_version', 'production-calcutta-v1',
        'tournament_id', target_id, 'state', 'NOT_CONFIGURED',
        'publication_policy',
          'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
        'publication_state', 'UNPUBLISHED', 'published', false,
        'currency_code', 'USD', 'configuration_revision', 0,
        'auction_revision', 0, 'publication_revision', 0,
        'result_revision', null, 'configuration_fingerprint', null,
        'auction_fingerprint', null, 'result_fingerprint', null,
        'revision', 'calcutta-v1:0:0:0:0:NOT_CONFIGURED:UNPUBLISHED',
        'freshness', pg_catalog.jsonb_build_object(
          'stale', false, 'updating', false, 'configured_at', null,
          'auction_recorded_at', null, 'published_at', null,
          'calculated_at', null, 'source_fingerprint', null
        ),
        'market', null, 'result', null, 'query_ms', 0
      )
    );
  elsif surface = 'PUBLISHED_ODDS' then
    result_value := public.read_published_odds_view(target_id, resource.google_workbook_id);
  elsif surface = 'ODDS_INPUT' then
    result_value := public.read_championship_odds_inputs(target_id);
  elsif surface = 'PARTICIPANT_IDENTITY' then
    result_value := case when player_id_value = ''
      then pg_catalog.jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED')
      else public.read_participant_identity_context(target_id, player_id_value) end;
  elsif surface = 'GUIDE_PROJECTION' then
    select value.* into projection_binding
    from production_control.future_annual_projection_bindings_v1 value
    where value.tournament_id = target_id and value.domain = 'GUIDE'
      and value.certification_status = 'CERTIFIED';
    if projection_binding.tournament_id is null then
      result_value := pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'GUIDE_PROJECTION_UNAVAILABLE'
      );
    else
      result_value := pg_catalog.jsonb_build_object(
        'ok', true,
        'data', pg_catalog.jsonb_build_object(
          'domain', 'GUIDE', 'tournament_id', target_id,
          'tournament_year', pointer.tournament_year,
          'revision_id', null, 'revision_number',
            projection_binding.binding_revision,
          'source_workbook_id', projection_binding.source_workbook_id,
          'contract_version', coalesce(
            projection_binding.projection->>'schemaVersion',
            'guide-projection-v1'
          ),
          'source_fingerprint', projection_binding.source_fingerprint,
          'payload_fingerprint', projection_binding.payload_fingerprint,
          'validation_status', 'VALID',
          'validation_diagnostics', '{}'::jsonb,
          'payload', projection_binding.projection,
          'imported_at', projection_binding.certified_at,
          'google_foreground_requests', 0, 'fallback_used', false,
          'authoritative', true, 'shadow_only', false
        )
      );
    end if;
  elsif surface = 'COMPETITION_DERIVED' then
    if pg_catalog.jsonb_typeof(input->'engine_keys') <> 'array' then
      result_value := pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'ENGINE_KEYS_REQUIRED'
      );
    else
      select pg_catalog.array_agg(value) into engine_keys_value
      from pg_catalog.jsonb_array_elements_text(input->'engine_keys') value;
      if engine_keys_value is null or pg_catalog.cardinality(engine_keys_value) = 0
         or exists (
           select 1 from pg_catalog.unnest(engine_keys_value) value
           where value not in (
             'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES', 'CALCUTTA',
             'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
             'TOURNAMENT_FINAL_RECAP'
           )
         ) then
        result_value := pg_catalog.jsonb_build_object(
          'ok', false, 'code', 'ENGINE_KEYS_INVALID'
        );
      else
        result_value := public.read_competition_derived_state(target_id, engine_keys_value);
      end if;
    end if;
  elsif surface = 'HISTORY_2026' then
    result_value := pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'EXPLICIT_HISTORY_USES_FROZEN_2026_READER'
    );
  else
    result_value := pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_FUTURE_SURFACE_NOT_ALLOWED'
    );
  end if;
  return production_control.mark_cutover_read_response(result_value, required_phase)
    || pg_catalog.jsonb_build_object(
      'target_tournament_id', target_id,
      'target_tournament_year', pointer.tournament_year,
      'pointer_revision', pointer.pointer_revision,
      'runtime_generation_id', generation.runtime_generation_id,
      'annual_authority_generation_id', generation.authority_generation_id,
      'annual_admission_generation_id', generation.admission_generation_id
    );
end;
$future_current_read$;

revoke all on function public.read_production_future_current_view_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_future_current_view_v1(jsonb)
  to service_role;

create or replace function public.claim_production_future_match_google_compatibility_v1(
  input jsonb
)
returns jsonb language sql security definer set search_path = pg_catalog
as $worker_alias$
  select public.claim_production_future_google_compatibility_job_v1(input)
$worker_alias$;
create or replace function public.complete_production_future_match_google_compatibility_v1(
  input jsonb
)
returns jsonb language sql security definer set search_path = pg_catalog
as $worker_alias$
  select public.complete_production_future_google_compatibility_job_v1(input)
$worker_alias$;
create or replace function public.fail_production_future_match_google_compatibility_v1(
  input jsonb
)
returns jsonb language sql security definer set search_path = pg_catalog
as $worker_alias$
  select public.fail_production_future_google_compatibility_job_v1(input)
$worker_alias$;
revoke all on function
  public.claim_production_future_match_google_compatibility_v1(jsonb),
  public.complete_production_future_match_google_compatibility_v1(jsonb),
  public.fail_production_future_match_google_compatibility_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.claim_production_future_match_google_compatibility_v1(jsonb),
  public.complete_production_future_match_google_compatibility_v1(jsonb),
  public.fail_production_future_match_google_compatibility_v1(jsonb)
  to service_role;

revoke all on table scoring_authority.global_course_catalog_v1,
  scoring_authority.global_course_tee_contexts_v1,
  scoring_authority.global_course_hole_contexts_v1
  from public, anon, authenticated, service_role;
revoke all on table production_control.global_course_id_allocator_v1,
  production_control.future_runtime_promotions_v2,
  production_control.future_runtime_match_bindings_v2,
  production_control.future_annual_projection_bindings_v1,
  production_control.future_tournament_director_governance_v1,
  production_control.future_annual_runtime_generations_v1,
  production_control.future_archive_plans_v1,
  production_control.future_runtime_operation_receipts_v2,
  production_control.future_runtime_audit_events_v2,
  participant_identity.future_tournament_identity_contexts_v1,
  participant_identity.future_tournament_participant_bindings_v1
  from public, anon, authenticated, service_role;
revoke all on function public.read_production_current_tournament_runtime_v1(jsonb),
  public.read_production_future_annual_projection_v1(jsonb),
  public.synchronize_production_future_annual_projection_v1(jsonb),
  public.read_production_future_runtime_v2(jsonb),
  public.mutate_production_future_runtime_v2(jsonb),
  public.claim_production_future_google_compatibility_job_v1(jsonb),
  public.complete_production_future_google_compatibility_job_v1(jsonb),
  public.fail_production_future_google_compatibility_job_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_current_tournament_runtime_v1(jsonb),
  public.read_production_future_annual_projection_v1(jsonb),
  public.synchronize_production_future_annual_projection_v1(jsonb),
  public.read_production_future_runtime_v2(jsonb),
  public.mutate_production_future_runtime_v2(jsonb),
  public.claim_production_future_google_compatibility_job_v1(jsonb),
  public.complete_production_future_google_compatibility_job_v1(jsonb),
  public.fail_production_future_google_compatibility_job_v1(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
