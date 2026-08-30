-- Step 13C: Production Championship Odds publication authority V1.
--
-- Installation is intentionally inert.  It adds the canonical Supabase
-- publication state and bounded operations, but leaves the live resource row
-- at GOOGLE / publication disabled.  Authority changes only through the
-- database-owner adoption operation after it proves the one exact, previously
-- verified Production snapshot.  No Odds calculation is run, no publication
-- is fabricated, and no Google write or mirror job is created by this file.
begin;

alter table production_control.resource_scope
  add column if not exists odds_publication_authority text not null
    default 'GOOGLE';

alter table production_control.resource_scope
  drop constraint if exists production_resource_odds_publication_authority_check;
alter table production_control.resource_scope
  add constraint production_resource_odds_publication_authority_check
    check (odds_publication_authority in ('GOOGLE', 'SUPABASE'));

-- Existing rows are immutable Google-origin evidence.  New Supabase-origin
-- rows bind the exact calculation job, actor, epoch, and Production resources.
alter table scoring_authority.odds_published_snapshots
  alter column google_publication_fingerprint drop not null,
  alter column google_publication_reference drop not null,
  add column if not exists authority_contract_version text not null
    default 'legacy-google-published-odds-v1',
  add column if not exists publication_authority text not null default 'GOOGLE',
  add column if not exists publication_state_revision bigint,
  add column if not exists source_calculation_job_id text references
    scoring_authority.odds_calculation_jobs(job_id) on delete restrict,
  add column if not exists source_calculation_revision jsonb,
  add column if not exists published_by_auth_user_id uuid references
    auth.users(id) on delete restrict,
  add column if not exists published_by_player_id text references
    scoring_authority.players(player_id) on delete restrict,
  add column if not exists authority_epoch_id uuid references
    scoring_authority.authority_epochs(epoch_id) on delete restrict,
  add column if not exists resource_binding jsonb,
  add column if not exists resource_binding_fingerprint text;

alter table scoring_authority.odds_published_snapshots
  add constraint production_odds_snapshot_authority_check
    check (publication_authority in ('GOOGLE', 'SUPABASE')),
  add constraint production_odds_snapshot_authority_contract_check
    check (authority_contract_version in (
      'legacy-google-published-odds-v1',
      'production-odds-publication-v1'
    )),
  add constraint production_odds_snapshot_state_revision_check
    check (publication_state_revision is null
      or publication_state_revision > 0),
  add constraint production_odds_snapshot_source_revision_check
    check (source_calculation_revision is null
      or pg_catalog.jsonb_typeof(source_calculation_revision) = 'object'),
  add constraint production_odds_snapshot_resource_binding_check
    check (resource_binding is null
      or pg_catalog.jsonb_typeof(resource_binding) = 'object'),
  add constraint production_odds_snapshot_resource_fingerprint_check
    check (resource_binding_fingerprint is null
      or resource_binding_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint production_odds_snapshot_origin_shape_check
    check (
      (publication_authority = 'GOOGLE'
        and google_publication_fingerprint ~ '^[0-9a-f]{64}$'
        and pg_catalog.jsonb_typeof(google_publication_reference) = 'object')
      or
      (publication_authority = 'SUPABASE'
        and authority_contract_version = 'production-odds-publication-v1'
        and publication_state_revision is not null
        and source_calculation_job_id is not null
        and pg_catalog.jsonb_typeof(source_calculation_revision) = 'object'
        and published_by_auth_user_id is not null
        and published_by_player_id is not null
        and authority_epoch_id is not null
        and pg_catalog.jsonb_typeof(resource_binding) = 'object'
        and resource_binding_fingerprint ~ '^[0-9a-f]{64}$'
        and google_publication_fingerprint is null
        and google_publication_reference is null
        and mirror_status = 'RETIRED')
    );

create unique index production_odds_snapshot_calculation_job_idx
  on scoring_authority.odds_published_snapshots(source_calculation_job_id)
  where source_calculation_job_id is not null;

create table scoring_authority.odds_publication_current (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  contract_version text not null check (
    contract_version = 'production-odds-publication-v1'
  ),
  publication_authority text not null check (
    publication_authority in ('GOOGLE', 'SUPABASE')
  ),
  publication_state text not null check (
    publication_state in ('UNPUBLISHED', 'PUBLISHED')
  ),
  freshness text not null check (
    freshness in ('UNPUBLISHED', 'CURRENT', 'STALE')
  ),
  current_snapshot_id uuid unique references
    scoring_authority.odds_published_snapshots(id) on delete restrict,
  publication_revision bigint not null default 0 check (
    publication_revision >= 0
  ),
  source_calculation_revision jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(source_calculation_revision) = 'object'
  ),
  published_at timestamptz,
  published_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  published_by_auth_user_id uuid references auth.users(id) on delete restrict,
  authority_epoch_id uuid references scoring_authority.authority_epochs(epoch_id)
    on delete restrict,
  resource_binding jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(resource_binding) = 'object'
  ),
  resource_binding_fingerprint text check (
    resource_binding_fingerprint is null
    or resource_binding_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  adoption_kind text check (
    adoption_kind is null or adoption_kind = 'LEGACY_GOOGLE_ADOPTED'
  ),
  activated_by text,
  activated_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (publication_authority = 'GOOGLE'
      and publication_state = 'UNPUBLISHED'
      and freshness = 'UNPUBLISHED'
      and current_snapshot_id is null
      and publication_revision = 0
      and published_at is null
      and authority_epoch_id is null
      and resource_binding_fingerprint is null
      and activated_at is null)
    or
    (publication_authority = 'SUPABASE'
      and publication_state = 'PUBLISHED'
      and freshness in ('CURRENT', 'STALE')
      and current_snapshot_id is not null
      and publication_revision > 0
      and published_at is not null
      and authority_epoch_id is not null
      and resource_binding_fingerprint ~ '^[0-9a-f]{64}$'
      and activated_at is not null)
  ),
  check (
    (published_by_player_id is null and published_by_auth_user_id is null)
    or
    (published_by_player_id is not null and published_by_auth_user_id is not null)
  )
);

comment on column scoring_authority.odds_publication_current.freshness is
  'CURRENT means the latest explicitly published immutable milestone snapshot. Per existing Odds business semantics, later scoring/input revisions do not silently stale a publication; an explicit corrected publication supersedes it. STALE is reserved for an explicitly proven invalid publication state and is not inferred by this V1 migration.';

insert into scoring_authority.odds_publication_current (
  tournament_id, contract_version, publication_authority,
  publication_state, freshness
) values (
  '2026', 'production-odds-publication-v1', 'GOOGLE',
  'UNPUBLISHED', 'UNPUBLISHED'
) on conflict (tournament_id) do nothing;

alter table scoring_authority.odds_publication_current enable row level security;
revoke all on table scoring_authority.odds_publication_current
  from public, anon, authenticated, service_role;
grant select on table scoring_authority.odds_publication_current to service_role;

-- All writes now pass through the versioned functions below.  Legacy import
-- remains a security-definer path until authority adoption retires it.
revoke insert, update, delete on table
  scoring_authority.odds_published_snapshots from service_role;
grant select on table scoring_authority.odds_published_snapshots to service_role;

create or replace function production_control.odds_publication_v1_hash(input jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(input::text, 'sha256'), 'hex')
$$;

revoke all on function production_control.odds_publication_v1_hash(jsonb)
  from public, anon, authenticated, service_role;

-- Published payloads and their provenance are immutable.  Current-pointer
-- flags may move, and the legacy importer may update only legacy Google
-- verification metadata while Google remains the explicit authority.
create or replace function production_control.guard_odds_snapshot_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  authority_value text;
begin
  select odds_publication_authority into strict authority_value
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';

  if new.id is distinct from old.id
     or new.tournament_id is distinct from old.tournament_id
     or new.milestone is distinct from old.milestone
     or new.phase_order is distinct from old.phase_order
     or new.publication_revision is distinct from old.publication_revision
     or new.published_at is distinct from old.published_at
     or new.published_payload is distinct from old.published_payload
     or new.payload_hash is distinct from old.payload_hash
     or new.source_fingerprint is distinct from old.source_fingerprint
     or new.engine_version is distinct from old.engine_version
     or new.engine_metadata is distinct from old.engine_metadata
     or new.created_at is distinct from old.created_at
     or new.logical_payload_hash is distinct from old.logical_payload_hash
     or new.settings_fingerprint is distinct from old.settings_fingerprint
     or new.ratings_fingerprint is distinct from old.ratings_fingerprint
     or new.pairing_fingerprint is distinct from old.pairing_fingerprint
     or new.deterministic_seed is distinct from old.deterministic_seed
     or new.publication_actor_id is distinct from old.publication_actor_id
     or new.authority_contract_version is distinct from old.authority_contract_version
     or new.publication_authority is distinct from old.publication_authority
     or new.publication_state_revision is distinct from old.publication_state_revision
     or new.source_calculation_job_id is distinct from old.source_calculation_job_id
     or new.source_calculation_revision is distinct from old.source_calculation_revision
     or new.published_by_auth_user_id is distinct from old.published_by_auth_user_id
     or new.published_by_player_id is distinct from old.published_by_player_id
     or new.authority_epoch_id is distinct from old.authority_epoch_id
     or new.resource_binding is distinct from old.resource_binding
     or new.resource_binding_fingerprint is distinct from old.resource_binding_fingerprint
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_PUBLISHED_SNAPSHOT_IMMUTABLE';
  end if;

  if authority_value = 'SUPABASE' and (
       new.google_publication_fingerprint is distinct from
         old.google_publication_fingerprint
       or new.google_publication_reference is distinct from
         old.google_publication_reference
       or new.publication_verified is distinct from old.publication_verified
       or new.imported_by is distinct from old.imported_by
       or new.imported_at is distinct from old.imported_at
       or new.mirror_status is distinct from old.mirror_status
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_GOOGLE_PUBLICATION_RETIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_production_odds_snapshot_immutability
  on scoring_authority.odds_published_snapshots;
create trigger guard_production_odds_snapshot_immutability
before update on scoring_authority.odds_published_snapshots
for each row execute function
  production_control.guard_odds_snapshot_immutability();

revoke all on function
  production_control.guard_odds_snapshot_immutability()
  from public, anon, authenticated, service_role;

-- Preserve Step 11 rehearsal isolation.  Only a committed Production cutover
-- calculation may become publication-eligible, and only after the explicit
-- Odds authority adoption has enabled the Supabase publication domain.
alter table scoring_authority.odds_calculation_jobs
  drop constraint if exists production_odds_initial_publication_separation_check;
alter table scoring_authority.odds_calculation_jobs
  add constraint production_odds_initial_publication_separation_check
  check (
    case production_operation_mode
      when 'STEP11_REHEARSAL' then coalesce(
        publication_reference = '{}'::jsonb
        and (
          (status = 'SUCCEEDED' and publication_status = 'REHEARSAL_ONLY')
          or (status = 'SUPERSEDED' and publication_status = 'STALE')
          or (
            status in ('PENDING', 'RUNNING', 'RETRYABLE', 'FAILED')
            and publication_status = 'NOT_REQUESTED'
          )
        ), false
      )
      when 'PRODUCTION_CUTOVER' then coalesce(
        (
          status = 'SUCCEEDED'
          and publication_status = 'READY'
          and publication_reference = '{}'::jsonb
        )
        or
        (
          status = 'SUCCEEDED'
          and publication_status = 'PUBLISHED'
          and publication_reference->>'contract_version'
            = 'production-odds-publication-v1'
          and publication_reference->>'snapshot_id'
            ~ '^[0-9a-fA-F-]{36}$'
          and coalesce(
            (publication_reference->>'publication_revision')::bigint, 0
          ) > 0
          and coalesce(
            (publication_reference->>'expected_predecessor_revision')::bigint,
            -1
          ) >= 0
          and publication_reference ? 'expected_predecessor_snapshot_id'
          and publication_reference->>'request_fingerprint'
            ~ '^[0-9a-f]{64}$'
        )
        or
        (
          status = 'SUPERSEDED'
          and publication_status = 'STALE'
          and publication_reference = '{}'::jsonb
        )
        or
        (
          status in ('PENDING', 'RUNNING', 'RETRYABLE', 'FAILED')
          and publication_status = 'NOT_REQUESTED'
          and publication_reference = '{}'::jsonb
        ), false
      )
      else false
    end
  );

create or replace function production_control.assert_production_odds_calculation_scope(
  input jsonb,
  require_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  runtime production_control.odds_calculation_runtime%rowtype;
  worker production_control.worker_controls%rowtype;
  mode text := pg_catalog.upper(coalesce(input->>'operation_mode', ''));
  phase text := pg_catalog.upper(coalesce(input->>'cutover_phase', ''));
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  if require_enabled then
    perform pg_catalog.pg_advisory_xact_lock_shared(731102026031::bigint);
  end if;

  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict runtime
  from production_control.odds_calculation_runtime
  where scope_key = 'BAGGER_INV_PRODUCTION';
  select * into strict worker
  from production_control.worker_controls
  where worker_name = 'ODDS_CALCULATION';

  if input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
     or input->>'project_url' is distinct from
       'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or input->>'source_workbook_id' is distinct from
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or input->>'worker_name' is distinct from 'ODDS_CALCULATION'
     or phase <> 'ODDS_WAR_ROOM'
     or mode not in ('STEP11_REHEARSAL', 'PRODUCTION_CUTOVER') then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_EXACT_SCOPE_REQUIRED';
  end if;

  if exists (
    select 1 from production_control.worker_controls
    where worker_name = 'ODDS_GOOGLE_MIRROR'
      and (enabled or google_writes_allowed)
  ) then
    raise exception using errcode = 'P0001',
      message = 'PRODUCTION_ODDS_GOOGLE_MIRROR_MUST_REMAIN_RETIRED';
  end if;

  if mode = 'STEP11_REHEARSAL' then
    if activation.state <> 'STAGED'
       or activation.current_authority <> 'GOOGLE'
       or activation.scoring_ingress_enabled
       or resource.scoring_authority <> 'GOOGLE'
       or resource.scoring_ingress_enabled
       or resource.google_writes_enabled
       or resource.odds_publication_authority <> 'GOOGLE'
       or resource.odds_publication_enabled
       or coalesce(input->>'candidate_hostname', '') = '' then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_REHEARSAL_LEGACY_AUTHORITY_REQUIRED';
    end if;
  else
    if activation.state <> 'SCORING_COMMITTED'
       or activation.current_authority <> 'SUPABASE'
       or not activation.scoring_ingress_enabled
       or production_control.cutover_phase_rank(activation.read_cutover_phase)
            < production_control.cutover_phase_rank(phase)
       or resource.scoring_authority <> 'SUPABASE'
       or not resource.scoring_ingress_enabled
       or resource.odds_publication_authority <> 'SUPABASE'
       or not resource.odds_publication_enabled
       or input ? 'candidate_hostname' then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_CUTOVER_AUTHORITY_REQUIRED';
    end if;
  end if;

  if require_enabled then
    if not runtime.enabled
       or runtime.operation_mode <> mode
       or runtime.cutover_phase <> phase
       or runtime.deployment_commit <> activation.expected_deployment_commit
       or runtime.activation_revision <> activation.activation_revision
       or runtime.candidate_hostname is distinct from
         nullif(input->>'candidate_hostname', '')
       or not worker.enabled
       or worker.google_writes_allowed
       or not resource.workers_enabled then
      raise exception using errcode = 'P0001',
        message = 'PRODUCTION_ODDS_CALCULATION_WORKER_DISABLED';
    end if;
  end if;
end;
$$;

revoke all on function
  production_control.assert_production_odds_calculation_scope(jsonb, boolean)
  from public, anon, authenticated, service_role;

-- Retain the exact pre-migration importer only while the resource row still
-- names Google as publication authority.  It becomes unreachable immediately
-- and transactionally when adoption moves authority to Supabase.
alter function public.import_production_published_odds(jsonb)
  rename to import_production_published_odds_google_authority_v1;

revoke all on function
  public.import_production_published_odds_google_authority_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.import_production_published_odds(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control
as $$
declare
  resource production_control.resource_scope%rowtype;
begin
  perform production_control.assert_production_service_role();
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if resource.odds_publication_authority <> 'GOOGLE'
     or resource.odds_publication_enabled then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_GOOGLE_PUBLICATION_RETIRED';
  end if;
  return public.import_production_published_odds_google_authority_v1(input);
end;
$$;

revoke all on function public.import_production_published_odds(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.import_production_published_odds(jsonb)
  to service_role;

-- One deterministic, audited adoption of the already verified Production
-- Pre-Tournament snapshot.  The constants below are current certified evidence,
-- not caller-selected values.  The operation creates no new snapshot and does
-- not recalculate or alter any tournament/Odds fact.
create or replace function
  production_control.adopt_production_odds_publication_authority_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
set lock_timeout = '5s'
as $$
declare
  existing_response jsonb;
  response_value jsonb;
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  current_value scoring_authority.odds_publication_current%rowtype;
  snapshot_value scoring_authority.odds_published_snapshots%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
  binding jsonb;
  binding_fingerprint text;
begin
  if not pg_catalog.pg_has_role(session_user, current_user, 'USAGE') then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DATABASE_OWNER_REQUIRED';
  end if;
  if input->>'operation' is distinct from
       'ADOPT_PRODUCTION_ODDS_PUBLICATION_AUTHORITY_V1'
     or pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'project_ref' is distinct from 'ymqhhtxaywtqllynrmxe'
     or input->>'project_url' is distinct from
       'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or input->>'source_workbook_id' is distinct from
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or input->>'vercel_environment' is distinct from 'production'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or input->>'tournament_id' is distinct from '2026'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or input->>'expected_snapshot_id' is distinct from
       '65f54c41-2dc3-4b2c-8570-a4d23056649a'
     or input->>'expected_payload_hash' is distinct from
       '6529536209651e61eff2027c3b2c9ef5323dc021699159b1e0565ef39169128f'
     or input->>'expected_google_publication_fingerprint' is distinct from
       'fbd456e560c2d6dcc4737a9fb11e8c3488ad24d8a7e27c61ddb5ee8e04559a0f'
     or input->>'expected_import_fingerprint' is distinct from
       '99d33b84b9c336b130adf3ec18d54b612c6461de697f365fb42662de39448e64'
     or input->>'expected_published_at' is distinct from
       '2026-07-20T02:54:17.133Z'
     or coalesce(input->>'expected_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or coalesce(input->>'expected_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'expected_authority_epoch_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or pg_catalog.jsonb_typeof(input->'expected_activation_revision')
       is distinct from 'number'
     or input->>'expected_activation_revision' !~ '^[0-9]+$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_AUTHORITY_ADOPTION_INPUT_INVALID';
  end if;

  existing_response := production_control.lookup_cutover_receipt(
    'ADOPT_ODDS_PUBLICATION_AUTHORITY_V1', input
  );
  if existing_response is not null then return existing_response; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  perform pg_catalog.pg_advisory_xact_lock(731132026057::bigint);

  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION' for update;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026' for update;
  select value.* into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = gate.active_epoch_id;
  select value.* into strict current_value
  from scoring_authority.odds_publication_current value
  where value.tournament_id = '2026' for update;
  select value.* into strict snapshot_value
  from scoring_authority.odds_published_snapshots value
  where value.id = '65f54c41-2dc3-4b2c-8570-a4d23056649a'::uuid;
  select value.* into strict config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = '2026' and value.is_current;

  if resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.google_workbook_id <>
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'SUPABASE'
     or resource.participant_identity_authority <> 'SUPABASE'
     or not resource.public_supabase_reads_enabled
     or not resource.scoring_ingress_enabled
     or not resource.workers_enabled
     or resource.odds_publication_authority <> 'GOOGLE'
     or resource.odds_publication_enabled
     or activation.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.expected_deployment_commit is distinct from
       input->>'expected_deployment_commit'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or activation.authority_generation_id is distinct from epoch.epoch_id
     or epoch.epoch_id is distinct from
       (input->>'expected_authority_epoch_id')::uuid
     or epoch.status <> 'COMMITTED'
     or epoch.authority_after <> 'SUPABASE'
     or gate.state <> 'OPEN'
     or gate.authority <> 'SUPABASE'
     or gate.admission_deployment_id is distinct from
       input->>'expected_deployment_id'
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.unresolved_client_queues <> 0
     or current_value.contract_version <>
       'production-odds-publication-v1'
     or current_value.publication_authority <> 'GOOGLE'
     or current_value.publication_state <> 'UNPUBLISHED'
     or current_value.current_snapshot_id is not null
     or current_value.publication_revision <> 0
     or exists (
       select 1 from production_control.worker_controls
       where worker_name = 'ODDS_GOOGLE_MIRROR'
         and (enabled or google_writes_allowed)
     )
     or exists (select 1 from scoring_authority.odds_google_mirror_jobs)
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_AUTHORITY_ADOPTION_NOT_SAFE';
  end if;

  if snapshot_value.tournament_id <> '2026'
     or snapshot_value.milestone <> 'Pre-Tournament'
     or snapshot_value.phase_order <> 0
     or snapshot_value.publication_revision <> 1
     or snapshot_value.published_at is distinct from
       '2026-07-20T02:54:17.133Z'::timestamptz
     or snapshot_value.payload_hash <>
       '6529536209651e61eff2027c3b2c9ef5323dc021699159b1e0565ef39169128f'
     or snapshot_value.google_publication_fingerprint <>
       'fbd456e560c2d6dcc4737a9fb11e8c3488ad24d8a7e27c61ddb5ee8e04559a0f'
     or not snapshot_value.is_current_for_milestone
     or not snapshot_value.is_current_official
     or not snapshot_value.publication_verified
     or snapshot_value.publication_authority <> 'GOOGLE'
     or snapshot_value.authority_contract_version <>
       'legacy-google-published-odds-v1'
     or coalesce((snapshot_value.published_payload->>'year')::integer, 0) <> 2026
     or snapshot_value.published_payload->>'phase' <> 'Pre-Tournament'
     or pg_catalog.jsonb_typeof(snapshot_value.published_payload->'teams')
       <> 'array'
     or pg_catalog.jsonb_array_length(
       snapshot_value.published_payload->'teams'
     ) <> 2
     or pg_catalog.jsonb_typeof(snapshot_value.published_payload->'players')
       <> 'array'
     or pg_catalog.jsonb_array_length(
       snapshot_value.published_payload->'players'
     ) <> 24
     or (select pg_catalog.count(*)
         from scoring_authority.odds_published_snapshots value
         where value.tournament_id = '2026' and value.is_current_official) <> 1
     or not exists (
       select 1 from scoring_authority.odds_snapshot_import_runs value
       where value.tournament_id = '2026'
         and value.source_workbook_id =
           '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
         and value.import_fingerprint =
           '99d33b84b9c336b130adf3ec18d54b612c6461de697f365fb42662de39448e64'
         and value.current_official_milestone = 'Pre-Tournament'
         and value.status = 'APPLIED'
         and value.snapshot_count = 1
     )
     or config.validation_status <> 'VALID'
     or config.source_workbook_id <>
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or config.settings_fingerprint <>
       '2b9fb9a625b9f33f28db35834e0cf78128d5dfc82acbee66606ec3e700cf0684'
     or config.ratings_fingerprint <>
       '27b32865de26bed9a1c057bf7fafcb954154c9f6942affd5c280729d3a6df018'
     or config.pairing_fingerprint <>
       'f9babd64464a824d89250e4fb2c17eb4e74db4c5ebd8c39887f28f8b0f94dc47'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_CERTIFIED_SNAPSHOT_MISMATCH';
  end if;

  binding := pg_catalog.jsonb_build_object(
    'contract_version', 'production-odds-publication-v1',
    'environment', 'PRODUCTION',
    'project_ref', resource.project_ref,
    'project_url', resource.project_url,
    'source_workbook_id', resource.google_workbook_id,
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'vercel_environment', 'production',
    'deployment_id', gate.admission_deployment_id,
    'deployment_commit', activation.expected_deployment_commit,
    'canonical_domain', resource.canonical_domain,
    'tournament_id', resource.current_tournament_id,
    'authority_epoch_id', epoch.epoch_id,
    'activation_revision', activation.activation_revision,
    'adoption_snapshot_id', snapshot_value.id,
    'adoption_payload_hash', snapshot_value.payload_hash,
    'google_publication_retired', true,
    'google_mirror_retired', true
  );
  binding_fingerprint :=
    production_control.odds_publication_v1_hash(binding);

  update scoring_authority.odds_publication_current
  set publication_authority = 'SUPABASE',
      publication_state = 'PUBLISHED', freshness = 'CURRENT',
      current_snapshot_id = snapshot_value.id, publication_revision = 1,
      source_calculation_revision = pg_catalog.jsonb_build_object(
        'origin', 'LEGACY_GOOGLE_ADOPTED',
        'snapshot_import_fingerprint',
          '99d33b84b9c336b130adf3ec18d54b612c6461de697f365fb42662de39448e64',
        'input_configuration_id', config.id,
        'configuration_revision', config.configuration_revision,
        'settings_fingerprint', config.settings_fingerprint,
        'ratings_fingerprint', config.ratings_fingerprint,
        'pairing_fingerprint', config.pairing_fingerprint,
        'bundle_fingerprint', config.bundle_fingerprint
      ),
      published_at = snapshot_value.published_at,
      published_by_player_id = null, published_by_auth_user_id = null,
      authority_epoch_id = epoch.epoch_id,
      resource_binding = binding,
      resource_binding_fingerprint = binding_fingerprint,
      adoption_kind = 'LEGACY_GOOGLE_ADOPTED',
      activated_by = pg_catalog.left(input->>'actor_id', 160),
      activated_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where tournament_id = '2026';

  update production_control.resource_scope
  set odds_publication_authority = 'SUPABASE',
      odds_publication_enabled = true,
      updated_at = pg_catalog.now()
  where scope_key = 'BAGGER_INV_PRODUCTION';

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ODDS_PUBLICATION_AUTHORITY_ADOPTED',
    'publication_authority', 'SUPABASE',
    'publication_contract_version', 'production-odds-publication-v1',
    'publication_state', 'PUBLISHED',
    'freshness', 'CURRENT',
    'snapshot_id', snapshot_value.id,
    'publication_revision', 1,
    'published_at', snapshot_value.published_at,
    'adoption_kind', 'LEGACY_GOOGLE_ADOPTED',
    'resource_binding_fingerprint', binding_fingerprint,
    'mirror_created', false,
    'google_writes', 0,
    'idempotent', false
  );

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'ODDS_PUBLICATION_AUTHORITY_MIGRATED_TO_SUPABASE',
    pg_catalog.left(input->>'actor_id', 160),
    response_value - 'ok' - 'idempotent'
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_ODDS_PUBLICATION_AUTHORITY_ADOPTED',
    'CHAMPIONSHIP_ODDS_PUBLICATION', '2026',
    pg_catalog.left(input->>'actor_id', 160),
    pg_catalog.lower(input->>'request_fingerprint'), 'SUCCEEDED',
    response_value - 'ok' - 'idempotent'
  );
  perform production_control.store_cutover_receipt(
    'ADOPT_ODDS_PUBLICATION_AUTHORITY_V1', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  production_control.adopt_production_odds_publication_authority_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.publish_production_championship_odds_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority, extensions
as $$
declare
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  epoch scoring_authority.authority_epochs%rowtype;
  current_value scoring_authority.odds_publication_current%rowtype;
  current_snapshot scoring_authority.odds_published_snapshots%rowtype;
  job scoring_authority.odds_calculation_jobs%rowtype;
  config scoring_authority.odds_input_configurations%rowtype;
  created_snapshot scoring_authority.odds_published_snapshots%rowtype;
  existing_response jsonb;
  response_value jsonb;
  binding jsonb;
  source_revision_value jsonb;
  binding_fingerprint text;
  payload_hash_value text;
  expected_revision bigint := coalesce(
    (input->>'expected_publication_revision')::bigint, -1
  );
  expected_snapshot uuid := nullif(
    input->>'expected_snapshot_id', ''
  )::uuid;
  next_revision bigint;
  next_milestone_revision bigint;
  phase_order_value integer;
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  perform production_control.assert_production_scoring_actor(input, true);
  if input->>'operation' is distinct from
       'PUBLISH_PRODUCTION_CHAMPIONSHIP_ODDS_V1'
     or input->>'contract_version' is distinct from
       'production-odds-publication-v1'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or input->>'vercel_environment' is distinct from 'production'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or coalesce(input->>'job_id', '') !~ '^[0-9a-f]{64}$'
     or expected_revision < 1
     or (
       input ? 'expected_snapshot_id'
       and input->'expected_snapshot_id' <> 'null'::jsonb
       and coalesce(input->>'expected_snapshot_id', '')
         !~ '^[0-9a-fA-F-]{36}$'
     )
     or coalesce(input->>'expected_authority_epoch_id', '')
       !~ '^[0-9a-fA-F-]{36}$'
     or coalesce(input->>'deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'deployment_commit', '') !~ '^[0-9a-f]{40}$'
     or pg_catalog.jsonb_typeof(input->'expected_activation_revision')
       is distinct from 'number'
     or input->>'expected_activation_revision' !~ '^[0-9]+$'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_PUBLICATION_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(731132026057::bigint);
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026';
  select value.* into strict epoch
  from scoring_authority.authority_epochs value
  where value.epoch_id = gate.active_epoch_id;
  select value.* into strict current_value
  from scoring_authority.odds_publication_current value
  where value.tournament_id = '2026' for update;
  select value.* into job
  from scoring_authority.odds_calculation_jobs value
  where value.job_id = input->>'job_id' for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'ODDS_CALCULATION_JOB_NOT_FOUND'
    );
  end if;

  -- A lost-response retry may have re-read postcommit state.  The predecessor
  -- stored in the job is therefore authoritative for this exact request.
  if job.status = 'SUCCEEDED'
     and job.publication_status = 'PUBLISHED'
     and job.publication_reference->>'contract_version'
       = 'production-odds-publication-v1'
     and job.publication_reference->>'request_fingerprint'
       = request_fingerprint_value then
    select value.* into strict created_snapshot
    from scoring_authority.odds_published_snapshots value
    where value.id = (job.publication_reference->>'snapshot_id')::uuid;
    if current_value.publication_authority <> 'SUPABASE'
       or current_value.current_snapshot_id <> created_snapshot.id
       or current_value.publication_revision <>
         (job.publication_reference->>'publication_revision')::bigint
       or created_snapshot.source_calculation_job_id <> job.job_id then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ODDS_PUBLICATION_REPLAY_STATE_INVALID';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_ODDS_PUBLISHED',
      'idempotent', true,
      'publication_authority', 'SUPABASE',
      'publication_contract_version', 'production-odds-publication-v1',
      'snapshot_id', created_snapshot.id,
      'publication_revision', current_value.publication_revision,
      'publication_state', current_value.publication_state,
      'freshness', current_value.freshness,
      'published_at', created_snapshot.published_at,
      'published_payload', created_snapshot.published_payload,
      'mirror_created', false,
      'google_writes', 0
    );
  end if;

  existing_response := production_control.lookup_cutover_receipt(
    'PUBLISH_PRODUCTION_ODDS_V1', input
  );
  if existing_response is not null then return existing_response; end if;

  perform production_control.assert_production_odds_calculation_scope(
    input, true
  );
  perform production_control.assert_production_odds_retained_job_scope(
    input, to_jsonb(job)
  );

  if resource.odds_publication_authority <> 'SUPABASE'
     or not resource.odds_publication_enabled
     or resource.scoring_authority <> 'SUPABASE'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or activation.current_authority <> 'SUPABASE'
     or activation.maintenance_state <> 'NORMAL'
     or not activation.scoring_ingress_enabled
     or activation.active_transition_epoch_id is not null
     or activation.expected_deployment_commit is distinct from
       input->>'deployment_commit'
     or activation.activation_revision is distinct from
       (input->>'expected_activation_revision')::bigint
     or epoch.epoch_id is distinct from
       (input->>'expected_authority_epoch_id')::uuid
     or epoch.epoch_id is distinct from activation.authority_generation_id
     or epoch.status <> 'COMMITTED'
     or gate.authority <> 'SUPABASE'
     or gate.state <> 'OPEN'
     or gate.admission_deployment_id is distinct from input->>'deployment_id'
     or gate.active_epoch_id is distinct from epoch.epoch_id
     or gate.unresolved_client_queues <> 0
     or exists (
       select 1 from production_control.worker_controls
       where worker_name = 'ODDS_GOOGLE_MIRROR'
         and (enabled or google_writes_allowed)
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_PUBLICATION_NOT_SAFE';
  end if;

  if current_value.publication_authority <> 'SUPABASE'
     or current_value.publication_state <> 'PUBLISHED'
     or current_value.publication_revision <> expected_revision
     or current_value.current_snapshot_id is distinct from expected_snapshot then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ODDS_PUBLICATION_REVISION_CONFLICT';
  end if;

  if job.production_operation_mode <> 'PRODUCTION_CUTOVER'
     or job.production_candidate_hostname is not null
     or job.production_deployment_commit <> input->>'deployment_commit'
     or job.status <> 'SUCCEEDED'
     or job.publication_status <> 'READY'
     or job.publication_reference <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(job.result_payload) <> 'object'
     or coalesce(job.result_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or job.result_payload->>'phase' is distinct from job.phase
     or coalesce((job.result_payload->>'year')::integer, 0) <> 2026
     or pg_catalog.jsonb_typeof(job.result_payload->'teams') <> 'array'
     or pg_catalog.jsonb_array_length(job.result_payload->'teams') = 0
     or pg_catalog.jsonb_typeof(job.result_payload->'players') <> 'array'
     or pg_catalog.jsonb_array_length(job.result_payload->'players') = 0
     or (job.result_payload->>'publishedAt')::timestamptz
       is distinct from job.output_timestamp then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_CALCULATION_NOT_PUBLISHABLE';
  end if;

  select value.* into strict config
  from scoring_authority.odds_input_configurations value
  where value.tournament_id = '2026' and value.is_current for share;
  if config.id is distinct from job.input_configuration_id
     or config.validation_status <> 'VALID'
     or config.configuration_revision <>
       coalesce((job.source_revision->>'configuration_revision')::bigint, -1)
     or config.settings_fingerprint <> job.settings_fingerprint
     or config.effective_settings_fingerprint <>
       job.effective_settings_fingerprint
     or config.bundle_fingerprint <> job.input_bundle_fingerprint
     or config.ratings_fingerprint <>
       job.source_revision->>'ratings_fingerprint'
     or config.pairing_fingerprint <>
       job.source_revision->>'pairing_fingerprint' then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_ODDS_INPUT_REVISION_STALE';
  end if;

  phase_order_value := pg_catalog.array_position(
    array[
      'Pre-Tournament', 'After Round 1', 'After Round 2',
      'Round 3 Pairings Announced', 'Final Results'
    ], job.phase
  ) - 1;
  if current_value.current_snapshot_id is not null then
    select value.* into strict current_snapshot
    from scoring_authority.odds_published_snapshots value
    where value.id = current_value.current_snapshot_id;
    if phase_order_value < current_snapshot.phase_order then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ODDS_PUBLICATION_PHASE_REGRESSION';
    end if;
  end if;
  if job.phase = 'Final Results' and exists (
    select 1 from scoring_authority.matches value
    where value.tournament_id = '2026'
      and (value.status <> 'FINAL' or value.scorecard_complete is not true)
  ) then
    raise exception using errcode = '55000',
      message = 'FINAL_RESULTS_NOT_READY';
  end if;

  next_revision := current_value.publication_revision + 1;
  select coalesce(pg_catalog.max(value.publication_revision), 0) + 1
    into next_milestone_revision
  from scoring_authority.odds_published_snapshots value
  where value.tournament_id = '2026' and value.milestone = job.phase;

  source_revision_value := job.source_revision || pg_catalog.jsonb_build_object(
    'calculation_job_id', job.job_id,
    'calculation_result_fingerprint', job.result_fingerprint,
    'input_configuration_id', config.id,
    'configuration_revision', config.configuration_revision,
    'settings_fingerprint', config.settings_fingerprint,
    'effective_settings_fingerprint', config.effective_settings_fingerprint,
    'ratings_fingerprint', config.ratings_fingerprint,
    'pairing_fingerprint', config.pairing_fingerprint,
    'bundle_fingerprint', config.bundle_fingerprint
  );
  binding := pg_catalog.jsonb_build_object(
    'contract_version', 'production-odds-publication-v1',
    'environment', 'PRODUCTION',
    'project_ref', resource.project_ref,
    'project_url', resource.project_url,
    'source_workbook_id', resource.google_workbook_id,
    'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
    'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
    'vercel_environment', 'production',
    'deployment_id', gate.admission_deployment_id,
    'deployment_commit', activation.expected_deployment_commit,
    'canonical_domain', resource.canonical_domain,
    'tournament_id', resource.current_tournament_id,
    'authority_epoch_id', epoch.epoch_id,
    'activation_revision', activation.activation_revision,
    'publication_revision', next_revision,
    'source_calculation_job_id', job.job_id,
    'google_publication_retired', true,
    'google_mirror_retired', true
  );
  binding_fingerprint :=
    production_control.odds_publication_v1_hash(binding);
  payload_hash_value :=
    production_control.odds_publication_v1_hash(job.result_payload);

  update scoring_authority.odds_published_snapshots
  set is_current_for_milestone = false
  where tournament_id = '2026' and milestone = job.phase
    and is_current_for_milestone;
  update scoring_authority.odds_published_snapshots
  set is_current_official = false
  where tournament_id = '2026' and is_current_official;

  insert into scoring_authority.odds_published_snapshots (
    tournament_id, milestone, phase_order, publication_revision,
    published_at, published_payload, payload_hash, source_fingerprint,
    engine_version, engine_metadata, google_publication_fingerprint,
    google_publication_reference, is_current_for_milestone,
    is_current_official, publication_verified, imported_by,
    logical_payload_hash, settings_fingerprint, ratings_fingerprint,
    pairing_fingerprint, deterministic_seed, publication_actor_id,
    mirror_status, authority_contract_version, publication_authority,
    publication_state_revision, source_calculation_job_id,
    source_calculation_revision, published_by_auth_user_id,
    published_by_player_id, authority_epoch_id, resource_binding,
    resource_binding_fingerprint
  ) values (
    '2026', job.phase, phase_order_value, next_milestone_revision,
    job.output_timestamp, job.result_payload, payload_hash_value,
    nullif(job.source_revision->>'source_fingerprint', ''),
    job.engine_version, pg_catalog.jsonb_build_object(
      'iterations', job.total_iterations,
      'phaseOrder', phase_order_value,
      'calculationJobId', job.job_id,
      'resultFingerprint', job.result_fingerprint
    ), null, null, true, true, true,
    'production-odds-publication-v1', job.result_fingerprint,
    config.settings_fingerprint, config.ratings_fingerprint,
    config.pairing_fingerprint, job.deterministic_seed, actor_player,
    'RETIRED', 'production-odds-publication-v1', 'SUPABASE',
    next_revision, job.job_id, source_revision_value, actor_auth_user,
    actor_player, epoch.epoch_id, binding, binding_fingerprint
  ) returning * into created_snapshot;

  update scoring_authority.odds_publication_current
  set publication_state = 'PUBLISHED', freshness = 'CURRENT',
      current_snapshot_id = created_snapshot.id,
      publication_revision = next_revision,
      source_calculation_revision = source_revision_value,
      published_at = created_snapshot.published_at,
      published_by_player_id = actor_player,
      published_by_auth_user_id = actor_auth_user,
      authority_epoch_id = epoch.epoch_id,
      resource_binding = binding,
      resource_binding_fingerprint = binding_fingerprint,
      adoption_kind = null,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  update scoring_authority.odds_calculation_jobs
  set publication_status = 'PUBLISHED',
      publication_reference = pg_catalog.jsonb_build_object(
        'contract_version', 'production-odds-publication-v1',
        'snapshot_id', created_snapshot.id,
        'publication_revision', next_revision,
        'expected_predecessor_revision', expected_revision,
        'expected_predecessor_snapshot_id', expected_snapshot,
        'request_fingerprint', request_fingerprint_value
      ),
      updated_at = pg_catalog.now()
  where job_id = job.job_id;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_ODDS_PUBLISHED',
    'idempotent', false,
    'publication_authority', 'SUPABASE',
    'publication_contract_version', 'production-odds-publication-v1',
    'snapshot_id', created_snapshot.id,
    'publication_revision', next_revision,
    'publication_state', 'PUBLISHED',
    'freshness', 'CURRENT',
    'published_at', created_snapshot.published_at,
    'published_payload', created_snapshot.published_payload,
    'mirror_created', false,
    'google_writes', 0
  );
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'CHAMPIONSHIP_ODDS_PUBLISHED_SUPABASE', actor_player,
    response_value - 'ok' - 'idempotent' - 'published_payload'
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CHAMPIONSHIP_ODDS_PUBLISHED',
    'CHAMPIONSHIP_ODDS_PUBLICATION', '2026', actor_player,
    request_fingerprint_value, 'SUCCEEDED',
    response_value - 'ok' - 'idempotent' - 'published_payload'
  );
  perform production_control.store_cutover_receipt(
    'PUBLISH_PRODUCTION_ODDS_V1', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function public.publish_production_championship_odds_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_production_championship_odds_v1(jsonb)
  to service_role;

create or replace function public.read_production_odds_publication_v1(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  started_at timestamptz := pg_catalog.clock_timestamp();
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  current_value scoring_authority.odds_publication_current%rowtype;
  tournament_value scoring_authority.tournaments%rowtype;
  snapshots jsonb;
  history_count integer;
  legacy_current scoring_authority.odds_published_snapshots%rowtype;
  publication_value jsonb;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if input->>'operation' is distinct from
       'READ_PRODUCTION_ODDS_PUBLICATION_V1'
     or input->>'contract_version' is distinct from
       'production-odds-publication-v1'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or input->>'vercel_environment' is distinct from 'production'
     or input->>'canonical_domain' is distinct from 'https://baggerinv.com'
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_ODDS_PUBLICATION_READ_INPUT_INVALID';
  end if;

  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict current_value
  from scoring_authority.odds_publication_current value
  where value.tournament_id = '2026';
  select value.* into strict tournament_value
  from scoring_authority.tournaments value
  where value.tournament_id = '2026'
    and value.source_workbook_id = resource.google_workbook_id;

  if resource.odds_publication_authority = 'SUPABASE' then
    if not resource.odds_publication_enabled
       or current_value.publication_authority <> 'SUPABASE'
       or current_value.publication_state <> 'PUBLISHED'
       or current_value.current_snapshot_id is null
       or current_value.publication_revision < 1 then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ODDS_SUPABASE_PUBLICATION_NOT_ACTIVE';
    end if;
  elsif resource.odds_publication_authority <> 'GOOGLE'
     or resource.odds_publication_enabled then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_PUBLICATION_AUTHORITY_INVALID';
  end if;

  select value.* into legacy_current
  from scoring_authority.odds_published_snapshots value
  where value.tournament_id = '2026'
    and value.is_current_official
    and value.publication_verified;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'milestone', value.milestone,
    'phase_order', value.phase_order,
    'publication_revision', value.publication_revision,
    'publication_state_revision', value.publication_state_revision,
    'published_at', value.published_at,
    'payload', value.published_payload,
    'payload_hash', value.payload_hash,
    'logical_payload_hash', value.logical_payload_hash,
    'source_fingerprint', value.source_fingerprint,
    'engine_version', value.engine_version,
    'engine_metadata', value.engine_metadata,
    'settings_fingerprint', value.settings_fingerprint,
    'ratings_fingerprint', value.ratings_fingerprint,
    'pairing_fingerprint', value.pairing_fingerprint,
    'authority_contract_version', value.authority_contract_version,
    'origin_authority', value.publication_authority,
    'source_calculation_job_id', value.source_calculation_job_id,
    'published_by_player_id', value.published_by_player_id,
    'google_publication_fingerprint', case
      when resource.odds_publication_authority = 'GOOGLE'
        then value.google_publication_fingerprint
      else null end,
    'is_current_official', value.is_current_official,
    'publication_verified', value.publication_verified,
    'imported_at', value.imported_at
  ) order by value.phase_order), '[]'::jsonb), pg_catalog.count(*)
    into snapshots, history_count
  from scoring_authority.odds_published_snapshots value
  where value.tournament_id = '2026'
    and value.is_current_for_milestone
    and value.publication_verified;

  if resource.odds_publication_authority = 'SUPABASE' then
    publication_value := pg_catalog.jsonb_build_object(
      'contract_version', current_value.contract_version,
      'authority', current_value.publication_authority,
      'state', current_value.publication_state,
      'snapshot_id', current_value.current_snapshot_id,
      'publication_revision', current_value.publication_revision,
      'source_calculation_revision',
        current_value.source_calculation_revision,
      'published_at', current_value.published_at,
      'published_by_player_id', current_value.published_by_player_id,
      'freshness', current_value.freshness,
      'stale', current_value.freshness = 'STALE',
      'authority_epoch_id', current_value.authority_epoch_id,
      'activation_revision', activation.activation_revision,
      'resource_binding_fingerprint',
        current_value.resource_binding_fingerprint,
      'adoption_kind', current_value.adoption_kind,
      'google_publication_fallback', false,
      'google_mirror', 'RETIRED'
    );
  else
    publication_value := pg_catalog.jsonb_build_object(
      'contract_version', 'legacy-google-published-odds-v1',
      'authority', 'GOOGLE',
      'state', case when legacy_current.id is null
        then 'UNPUBLISHED' else 'PUBLISHED' end,
      'snapshot_id', legacy_current.id,
      'publication_revision', 0,
      'source_calculation_revision', '{}'::jsonb,
      'published_at', legacy_current.published_at,
      'published_by_player_id', null,
      'freshness', case when legacy_current.id is null
        then 'UNPUBLISHED' else 'CURRENT' end,
      'stale', false,
      'authority_epoch_id', null,
      'activation_revision', activation.activation_revision,
      'resource_binding_fingerprint', null,
      'adoption_kind', null,
      'google_publication_fallback', true,
      'google_mirror', 'AUTHORITY'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'tournament', to_jsonb(tournament_value),
      'publication', publication_value,
      'snapshots', snapshots,
      'history_count', history_count,
      'query_ms', extract(epoch from (
        pg_catalog.clock_timestamp() - started_at
      )) * 1000
    )
  );
end;
$$;

revoke all on function public.read_production_odds_publication_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_odds_publication_v1(jsonb)
  to service_role;

-- Backward-compatible Production dispatcher.  Preview keeps its existing
-- Preview-only implementation because Production migrations are never applied
-- to the Preview project.
create or replace function public.read_published_odds_view(
  target_tournament_id text default null,
  target_source_workbook_id text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $$
begin
  if pg_catalog.btrim(coalesce(target_tournament_id, '')) <> '2026'
     or pg_catalog.btrim(coalesce(target_source_workbook_id, '')) <>
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED'
    );
  end if;
  return public.read_production_odds_publication_v1(
    pg_catalog.jsonb_build_object(
      'operation', 'READ_PRODUCTION_ODDS_PUBLICATION_V1',
      'contract_version', 'production-odds-publication-v1',
      'environment', 'PRODUCTION',
      'project_ref', 'ymqhhtxaywtqllynrmxe',
      'project_url', 'https://ymqhhtxaywtqllynrmxe.supabase.co',
      'source_workbook_id',
        '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
      'vercel_project_id', 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
      'vercel_team_id', 'team_kPw5zaib8uaQJALAwj4fWI6R',
      'vercel_environment', 'production',
      'canonical_domain', 'https://baggerinv.com',
      'tournament_id', '2026',
      'tournament_year', 2026
    )
  );
end;
$$;

revoke all on function public.read_published_odds_view(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_published_odds_view(text, text)
  to service_role;

-- The normal post-cutover release contract originally froze the only then-
-- valid Odds tuple (GOOGLE / false / false).  Patch exactly the two installed
-- functions, with fail-closed source assertions, so a release must match one of
-- two coherent database states:
--   transitional legacy: GOOGLE / false / false
--   migrated canonical:  SUPABASE / true / false
-- No mixed tuple and no Google mirror is accepted.
do $migration$
declare
  definition text;
  patched text;
  needle text;
  replacement text;
begin
  definition := pg_catalog.pg_get_functiondef(
    'production_control.authorize_production_postcutover_normal_release(jsonb)'
      ::regprocedure
  );
  needle := $needle$
     or resource.odds_publication_enabled
$needle$;
  replacement := $replacement$
     or not (
       (resource.odds_publication_authority = 'GOOGLE'
         and not resource.odds_publication_enabled)
       or
       (resource.odds_publication_authority = 'SUPABASE'
         and resource.odds_publication_enabled)
     )
$replacement$;
  if pg_catalog.strpos(definition, needle) = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_AUTHORIZE_RELEASE_PATCH_BASELINE_MISMATCH';
  end if;
  patched := pg_catalog.replace(definition, needle, replacement);
  if patched = definition then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_AUTHORIZE_RELEASE_PATCH_NOT_APPLIED';
  end if;
  execute patched;

  definition := pg_catalog.pg_get_functiondef(
    'production_control.rebind_production_postcutover_normal_release(jsonb)'
      ::regprocedure
  );

  needle := $needle$
     or input->>'runtime_odds_publication_authority' is distinct from 'GOOGLE'
     or input->'runtime_supabase_odds_publication_enabled' is distinct from
       'false'::jsonb
     or input->'runtime_supabase_odds_google_mirror_enabled' is distinct from
       'false'::jsonb
$needle$;
  replacement := $replacement$
     or not (
       (
         input->>'runtime_odds_publication_authority' = 'GOOGLE'
         and input->'runtime_supabase_odds_publication_enabled'
           = 'false'::jsonb
       )
       or
       (
         input->>'runtime_odds_publication_authority' = 'SUPABASE'
         and input->'runtime_supabase_odds_publication_enabled'
           = 'true'::jsonb
       )
     )
     or input->'runtime_supabase_odds_google_mirror_enabled' is distinct from
       'false'::jsonb
$replacement$;
  if pg_catalog.strpos(definition, needle) = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_REBIND_INPUT_PATCH_BASELINE_MISMATCH';
  end if;
  patched := pg_catalog.replace(definition, needle, replacement);

  needle := $needle$
     or resource.odds_publication_enabled
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
$needle$;
  replacement := $replacement$
     or not (
       (resource.odds_publication_authority = 'GOOGLE'
         and not resource.odds_publication_enabled)
       or
       (resource.odds_publication_authority = 'SUPABASE'
         and resource.odds_publication_enabled)
     )
     or input->>'runtime_odds_publication_authority' is distinct from
       resource.odds_publication_authority
     or input->'runtime_supabase_odds_publication_enabled' is distinct from
       pg_catalog.to_jsonb(resource.odds_publication_enabled)
     or gate.boundary_mode <> 'MAINTENANCE_WINDOW_V1'
$replacement$;
  if pg_catalog.strpos(patched, needle) = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_REBIND_RESOURCE_PATCH_BASELINE_MISMATCH';
  end if;
  patched := pg_catalog.replace(patched, needle, replacement);

  needle := $needle$
    'odds_publication_authority', 'GOOGLE',
    'supabase_odds_publication_enabled', false,
$needle$;
  replacement := $replacement$
    'odds_publication_authority', resource.odds_publication_authority,
    'supabase_odds_publication_enabled',
      resource.odds_publication_enabled,
$replacement$;
  if pg_catalog.strpos(patched, needle) = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_REBIND_MANIFEST_PATCH_BASELINE_MISMATCH';
  end if;
  patched := pg_catalog.replace(patched, needle, replacement);
  if patched = definition then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ODDS_REBIND_PATCH_NOT_APPLIED';
  end if;
  execute patched;
end
$migration$;

notify pgrst, 'reload schema';
commit;
