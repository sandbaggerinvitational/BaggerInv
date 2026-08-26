begin;

-- Provider BEGIN challenges are deliberately short lived.  An expired,
-- unconsumed challenge can strand a client on an old candidate/routing-rule
-- binding because challenge issue idempotency correctly refuses to reinterpret
-- that request under a new binding.  Preserve the old challenge and audit
-- chronology while providing one narrowly scoped terminal recovery state.
alter table production_control.vercel_provider_attestation_challenges
  add column abandon_request_id uuid unique,
  add column abandon_request_fingerprint text unique check (
    abandon_request_fingerprint is null
      or abandon_request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add column abandon_payload_hash text check (
    abandon_payload_hash is null or abandon_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  add column abandoned_at timestamptz;

alter table production_control.vercel_provider_attestation_challenges
  drop constraint vercel_provider_attestation_challenges_status_check,
  drop constraint vercel_provider_attestation_challenges_check2;

alter table production_control.vercel_provider_attestation_challenges
  add constraint vercel_provider_attestation_challenges_status_check
    check (status in ('ISSUED', 'CONSUMED', 'ABANDONED')),
  add constraint vercel_provider_attestation_challenges_check2 check (
    (status = 'ISSUED' and consumed_at is null
      and consumed_attestation_id is null and consume_request_id is null
      and consume_request_fingerprint is null and consume_payload_hash is null
      and abandon_request_id is null
      and abandon_request_fingerprint is null
      and abandon_payload_hash is null and abandoned_at is null)
    or (status = 'CONSUMED' and consumed_at is not null
      and consumed_attestation_id is not null and consume_request_id is not null
      and consume_request_fingerprint is not null
      and consume_payload_hash is not null
      and abandon_request_id is null
      and abandon_request_fingerprint is null
      and abandon_payload_hash is null and abandoned_at is null)
    or (status = 'ABANDONED' and stage = 'BEGIN'
      and consumed_at is null and consumed_attestation_id is null
      and consume_request_id is null and consume_request_fingerprint is null
      and consume_payload_hash is null and abandon_request_id is not null
      and abandon_request_fingerprint is not null
      and abandon_payload_hash is not null and abandoned_at is not null
      and abandoned_at >= expires_at)
  );

create or replace function production_control.guard_terminal_vercel_provider_challenge()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.status = 'ABANDONED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED_TERMINAL';
  end if;
  if tg_op = 'UPDATE'
     and old.status = 'ISSUED'
     and new.status = 'CONSUMED'
     and pg_catalog.clock_timestamp() > old.expires_at then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_EXPIRED';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_terminal_vercel_provider_challenge
  before update or delete
  on production_control.vercel_provider_attestation_challenges
  for each row execute function
    production_control.guard_terminal_vercel_provider_challenge();

-- Include abandonment state in the existing sanitized challenge response so
-- read-only inspection and lost-response recovery expose the authoritative
-- terminal result without exposing payload material.
create or replace function production_control.vercel_provider_attestation_challenge_response(
  value production_control.vercel_provider_attestation_challenges,
  was_idempotent boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'found', true,
    'code', 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_' || value.status,
    'challenge_id', value.challenge_id,
    'challenge_request_id', value.challenge_request_id,
    'operation_request_id', value.operation_request_id,
    'evidence_request_id', value.evidence_request_id,
    'challenge_request_fingerprint', value.challenge_request_fingerprint,
    'stage', value.stage,
    'purpose', value.purpose,
    'status', value.status,
    'vercel_project_id', value.vercel_project_id,
    'vercel_team_id', value.vercel_team_id,
    'candidate_deployment_id', value.candidate_deployment_id,
    'candidate_deployment_commit', value.candidate_deployment_commit,
    'candidate_deployment_target', value.candidate_deployment_target,
    'candidate_alias_origin', value.candidate_alias_origin,
    'candidate_immutable_origin', value.candidate_immutable_origin,
    'routing_rule_id', value.routing_rule_id,
    'routing_rule_config_version', value.routing_rule_config_version,
    'routing_rule_scope', value.routing_rule_scope,
    'issued_at', value.issued_at,
    'expires_at', value.expires_at,
    'consumed_at', value.consumed_at,
    'consumed_attestation_id', value.consumed_attestation_id,
    'consumed_attestation_fingerprint', (
      select attestation.attestation_fingerprint
      from production_control.vercel_provider_attestations attestation
      where attestation.attestation_id = value.consumed_attestation_id
    ),
    'consumed_provider_attestation', (
      select pg_catalog.jsonb_build_object(
        'attestation_id', attestation.attestation_id,
        'attestation_fingerprint', attestation.attestation_fingerprint,
        'challenge_id', attestation.challenge_id,
        'challenge_request_fingerprint',
          attestation.challenge_request_fingerprint,
        'operation_request_id', attestation.operation_request_id,
        'evidence_request_id', attestation.evidence_request_id,
        'request_fingerprint', attestation.request_fingerprint,
        'stage', attestation.stage,
        'purpose', attestation.purpose,
        'status', attestation.status,
        'signer_key_fingerprint', attestation.signer_key_fingerprint,
        'signer_key_version', attestation.signer_key_version,
        'signature_verified', attestation.signature_verified,
        'vercel_project_id', attestation.vercel_project_id,
        'vercel_team_id', attestation.vercel_team_id,
        'candidate_deployment_id', attestation.candidate_deployment_id,
        'candidate_deployment_commit', attestation.candidate_deployment_commit,
        'candidate_deployment_target', attestation.candidate_deployment_target,
        'routing_rule_id', attestation.routing_rule_id,
        'routing_rule_config_version',
          attestation.routing_rule_config_version,
        'routing_rule_etag', attestation.routing_rule_etag,
        'routing_rule_fingerprint', attestation.routing_rule_fingerprint,
        'routing_rule_pending_draft_change_count',
          attestation.routing_rule_pending_draft_change_count,
        'live_origin_inventory_count',
          attestation.live_origin_inventory_count,
        'live_origin_inventory_fingerprint',
          attestation.live_origin_inventory_fingerprint,
        'live_origin_inventory', attestation.live_origin_inventory,
        'redacted_environment_scope_fingerprint',
          attestation.redacted_environment_scope_fingerprint,
        'credential_confinement_evidence_schema',
          attestation.credential_confinement_evidence_schema,
        'credential_confinement_record_count',
          attestation.credential_confinement_record_count,
        'credential_confinement_records_fingerprint',
          attestation.credential_confinement_records_fingerprint,
        'credential_confinement_evidence_fingerprint',
          attestation.credential_confinement_evidence_fingerprint,
        'provider_observed_at', attestation.provider_observed_at,
        'binding_expires_at', attestation.binding_expires_at,
        'bound_at', attestation.bound_at
      )
      from production_control.vercel_provider_attestations attestation
      where attestation.attestation_id = value.consumed_attestation_id
    ),
    'consume_request_id', value.consume_request_id,
    'abandon_request_id', value.abandon_request_id,
    'abandon_request_fingerprint', value.abandon_request_fingerprint,
    'abandoned_at', value.abandoned_at,
    'idempotent', was_idempotent
  )
$$;

create or replace function production_control.vercel_provider_challenge_has_abandonment_progression(
  challenge production_control.vercel_provider_attestation_challenges
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
      select 1
      from production_control.vercel_provider_attestations value
      where value.challenge_id = challenge.challenge_id
         or value.operation_request_id = challenge.operation_request_id
         or value.evidence_request_id = challenge.evidence_request_id
    ) or exists (
      select 1
      from production_control.vercel_writer_quiesce_evidence value
      where value.evidence_request_id = challenge.evidence_request_id
    ) or exists (
      select 1
      from production_control.vercel_provider_attestation_challenges value
      where value.evidence_request_id = challenge.evidence_request_id
        and value.stage = 'FINALIZE'
    ) or exists (
      select 1
      from production_control.google_writer_fence_rehearsals rehearsal
      join production_control.vercel_writer_quiesce_evidence evidence
        on evidence.evidence_id = rehearsal.quiesce_evidence_id
      where evidence.evidence_request_id = challenge.evidence_request_id
    ) or exists (
      select 1
      from production_control.google_writer_provider_fences fence
      join production_control.vercel_writer_quiesce_evidence evidence
        on evidence.evidence_id = fence.quiesce_evidence_id
      where evidence.evidence_request_id = challenge.evidence_request_id
    )
$$;

create or replace function public.inspect_production_vercel_provider_attestation_challenge_abandonment(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  challenge production_control.vercel_provider_attestation_challenges%rowtype;
  server_observed_at_value timestamptz;
  abandonment_code_value text;
  abandon_eligible_value boolean := false;
  allowed_keys text[] := array[
    'environment', 'project_ref', 'project_url', 'source_workbook_id',
    'tournament_id', 'actor_id', 'authenticated_actor_fingerprint',
    'challenge_id', 'challenge_request_id', 'operation_request_id',
    'evidence_request_id', 'stage', 'purpose', 'vercel_project_id',
    'vercel_team_id', 'candidate_deployment_id',
    'candidate_deployment_commit', 'candidate_deployment_target',
    'candidate_alias_origin', 'candidate_immutable_origin', 'routing_rule_id',
    'routing_rule_config_version', 'routing_rule_scope'
  ];
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or not (input ?& allowed_keys)
     or (input - allowed_keys) is distinct from '{}'::jsonb
     or coalesce(input->>'challenge_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'challenge_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or input->>'stage' is distinct from 'BEGIN'
     or pg_catalog.upper(coalesce(input->>'purpose', ''))
       not in ('REHEARSAL', 'CUTOVER')
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or coalesce(input->>'vercel_team_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or input->>'candidate_deployment_target' not in ('PREVIEW', 'PRODUCTION')
     or coalesce(input->>'candidate_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_immutable_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'routing_rule_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'routing_rule_config_version', '')
       !~ '^[A-Za-z0-9_.:-]{1,160}$'
     or input->>'routing_rule_scope' is distinct from
       'PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_INSPECT_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict challenge
  from production_control.vercel_provider_attestation_challenges value
  where value.challenge_id = (input->>'challenge_id')::uuid
  for update;

  if challenge.challenge_request_id is distinct from
       (input->>'challenge_request_id')::uuid
     or challenge.operation_request_id is distinct from
       (input->>'operation_request_id')::uuid
     or challenge.evidence_request_id is distinct from
       (input->>'evidence_request_id')::uuid
     or challenge.stage is distinct from 'BEGIN'
     or challenge.purpose is distinct from pg_catalog.upper(input->>'purpose')
     or challenge.authenticated_actor_fingerprint is distinct from
       input->>'authenticated_actor_fingerprint'
     or challenge.actor_id is distinct from
       pg_catalog.left(input->>'actor_id', 160)
     or challenge.vercel_project_id is distinct from
       input->>'vercel_project_id'
     or challenge.vercel_team_id is distinct from input->>'vercel_team_id'
     or challenge.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or challenge.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or challenge.candidate_deployment_target is distinct from
       input->>'candidate_deployment_target'
     or challenge.candidate_alias_origin is distinct from
       pg_catalog.lower(input->>'candidate_alias_origin')
     or challenge.candidate_immutable_origin is distinct from
       pg_catalog.lower(input->>'candidate_immutable_origin')
     or challenge.routing_rule_id is distinct from input->>'routing_rule_id'
     or challenge.routing_rule_config_version is distinct from
       input->>'routing_rule_config_version'
     or challenge.routing_rule_scope is distinct from
       input->>'routing_rule_scope' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_BINDING_MISMATCH';
  end if;

  server_observed_at_value := pg_catalog.clock_timestamp();
  if challenge.status = 'ABANDONED' then
    abandonment_code_value := 'ABANDONED';
  elsif challenge.status = 'CONSUMED' then
    abandonment_code_value := 'CONSUMED';
  elsif production_control.vercel_provider_challenge_has_abandonment_progression(
      challenge
    ) then
    abandonment_code_value := 'PROGRESSION_CONFLICT';
  elsif server_observed_at_value <= challenge.expires_at then
    abandonment_code_value := 'NOT_EXPIRED';
  else
    abandonment_code_value := 'ELIGIBLE';
    abandon_eligible_value := true;
  end if;

  return production_control.vercel_provider_attestation_challenge_response(
    challenge, true
  ) || pg_catalog.jsonb_build_object(
    'abandon_eligible', abandon_eligible_value,
    'abandonment_code', abandonment_code_value,
    'server_observed_at', server_observed_at_value
  );
end;
$$;

create or replace function public.abandon_production_vercel_provider_attestation_challenge(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '5s'
as $$
declare
  challenge production_control.vercel_provider_attestation_challenges%rowtype;
  abandon_request_identifier uuid;
  payload_hash text := production_control.cutover_payload_hash(input);
  abandoned_at_value timestamptz;
  allowed_keys text[] := array[
    'environment', 'project_ref', 'project_url', 'source_workbook_id',
    'tournament_id', 'actor_id', 'authenticated_actor_fingerprint',
    'abandon_request_id', 'request_fingerprint', 'challenge_id',
    'challenge_request_id', 'operation_request_id', 'evidence_request_id',
    'stage', 'purpose', 'vercel_project_id', 'vercel_team_id',
    'candidate_deployment_id', 'candidate_deployment_commit',
    'candidate_deployment_target', 'candidate_alias_origin',
    'candidate_immutable_origin', 'routing_rule_id',
    'routing_rule_config_version', 'routing_rule_scope', 'abandonment_reason'
  ];
begin
  perform production_control.assert_exact_cutover_resource_scope(input, false);
  if pg_catalog.jsonb_typeof(input) is distinct from 'object'
     or not (input ?& allowed_keys)
     or (input - allowed_keys) is distinct from '{}'::jsonb
     or coalesce(input->>'abandon_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'request_fingerprint', '') !~ '^[0-9a-f]{64}$'
     or coalesce(input->>'challenge_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'challenge_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'operation_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or coalesce(input->>'evidence_request_id', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or input->>'stage' is distinct from 'BEGIN'
     or pg_catalog.upper(coalesce(input->>'purpose', ''))
       not in ('REHEARSAL', 'CUTOVER')
     or coalesce(input->>'authenticated_actor_fingerprint', '')
       !~ '^[0-9a-f]{64}$'
     or pg_catalog.btrim(coalesce(input->>'actor_id', '')) = ''
     or pg_catalog.length(input->>'actor_id') > 160
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or coalesce(input->>'vercel_team_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'candidate_deployment_id', '')
       !~ '^dpl_[A-Za-z0-9]{8,64}$'
     or coalesce(input->>'candidate_deployment_commit', '')
       !~ '^[0-9a-f]{40}$'
     or input->>'candidate_deployment_target' not in ('PREVIEW', 'PRODUCTION')
     or coalesce(input->>'candidate_alias_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'candidate_immutable_origin', '')
       !~ '^https://[a-z0-9.-]+$'
     or coalesce(input->>'routing_rule_id', '')
       !~ '^[A-Za-z0-9_.:-]{3,160}$'
     or coalesce(input->>'routing_rule_config_version', '')
       !~ '^[A-Za-z0-9_.:-]{1,160}$'
     or input->>'routing_rule_scope' is distinct from
       'PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE'
     or input->>'abandonment_reason' is distinct from
       'EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_INPUT_INVALID';
  end if;

  abandon_request_identifier := (input->>'abandon_request_id')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(
    production_control.scoring_admission_lock_key()
  );
  select * into strict challenge
  from production_control.vercel_provider_attestation_challenges value
  where value.challenge_id = (input->>'challenge_id')::uuid
  for update;

  if challenge.challenge_request_id is distinct from
       (input->>'challenge_request_id')::uuid
     or challenge.operation_request_id is distinct from
       (input->>'operation_request_id')::uuid
     or challenge.evidence_request_id is distinct from
       (input->>'evidence_request_id')::uuid
     or challenge.stage is distinct from 'BEGIN'
     or challenge.purpose is distinct from pg_catalog.upper(input->>'purpose')
     or challenge.authenticated_actor_fingerprint is distinct from
       input->>'authenticated_actor_fingerprint'
     or challenge.actor_id is distinct from
       pg_catalog.left(input->>'actor_id', 160)
     or challenge.vercel_project_id is distinct from
       input->>'vercel_project_id'
     or challenge.vercel_team_id is distinct from input->>'vercel_team_id'
     or challenge.candidate_deployment_id is distinct from
       input->>'candidate_deployment_id'
     or challenge.candidate_deployment_commit is distinct from
       pg_catalog.lower(input->>'candidate_deployment_commit')
     or challenge.candidate_deployment_target is distinct from
       input->>'candidate_deployment_target'
     or challenge.candidate_alias_origin is distinct from
       pg_catalog.lower(input->>'candidate_alias_origin')
     or challenge.candidate_immutable_origin is distinct from
       pg_catalog.lower(input->>'candidate_immutable_origin')
     or challenge.routing_rule_id is distinct from input->>'routing_rule_id'
     or challenge.routing_rule_config_version is distinct from
       input->>'routing_rule_config_version'
     or challenge.routing_rule_scope is distinct from
       input->>'routing_rule_scope' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_BINDING_MISMATCH';
  end if;

  if challenge.status = 'ABANDONED' then
    if challenge.abandon_request_id is distinct from abandon_request_identifier
       or challenge.abandon_request_fingerprint is distinct from
         input->>'request_fingerprint'
       or challenge.abandon_payload_hash is distinct from payload_hash then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_IDEMPOTENCY_CONFLICT';
    end if;
    return production_control.vercel_provider_attestation_challenge_response(
      challenge, true
    ) || pg_catalog.jsonb_build_object(
      'abandon_eligible', false,
      'abandonment_code', 'ABANDONED',
      'server_observed_at', pg_catalog.clock_timestamp()
    );
  end if;

  if challenge.status is distinct from 'ISSUED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_TERMINAL_CONFLICT';
  end if;
  abandoned_at_value := pg_catalog.clock_timestamp();
  if abandoned_at_value <= challenge.expires_at then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_NOT_EXPIRED';
  end if;

  if production_control.vercel_provider_challenge_has_abandonment_progression(
      challenge
    ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_PROGRESSION_CONFLICT';
  end if;

  update production_control.vercel_provider_attestation_challenges
  set status = 'ABANDONED',
      abandon_request_id = abandon_request_identifier,
      abandon_request_fingerprint = input->>'request_fingerprint',
      abandon_payload_hash = payload_hash,
      abandoned_at = abandoned_at_value,
      updated_at = abandoned_at_value
  where challenge_id = challenge.challenge_id
    and status = 'ISSUED'
  returning * into strict challenge;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint, result, details
  ) values (
    'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED',
    'SCORING_AUTHORITY', '2026', challenge.actor_id,
    challenge.abandon_request_fingerprint, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'abandon_request_id', challenge.abandon_request_id,
      'challenge_id', challenge.challenge_id,
      'challenge_request_id', challenge.challenge_request_id,
      'operation_request_id', challenge.operation_request_id,
      'evidence_request_id', challenge.evidence_request_id,
      'stage', challenge.stage, 'purpose', challenge.purpose,
      'candidate_deployment_id', challenge.candidate_deployment_id,
      'candidate_deployment_commit', challenge.candidate_deployment_commit,
      'candidate_deployment_target', challenge.candidate_deployment_target,
      'candidate_alias_origin', challenge.candidate_alias_origin,
      'candidate_immutable_origin', challenge.candidate_immutable_origin,
      'routing_rule_id', challenge.routing_rule_id,
      'routing_rule_config_version', challenge.routing_rule_config_version,
      'routing_rule_scope', challenge.routing_rule_scope,
      'abandonment_reason', input->>'abandonment_reason',
      'abandoned_at', challenge.abandoned_at
    )
  );
  return production_control.vercel_provider_attestation_challenge_response(
    challenge, false
  ) || pg_catalog.jsonb_build_object(
    'abandon_eligible', false,
    'abandonment_code', 'ABANDONED',
    'server_observed_at', abandoned_at_value
  );
end;
$$;

create unique index production_vercel_provider_challenge_abandoned_audit_idx
  on production_control.operation_audit_events(request_fingerprint)
  where event_type =
    'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED';

-- Supersede migration 035's exact live inventory with the two provider-proven
-- SHA 3fcbaa2 deployments created during abandonment recovery review.  These
-- are fixed reviewed tuples, never optional arbitrary-SHA inventory widening.
create or replace function production_control.assert_exact_vercel_live_inventory(
  retained_inventory jsonb,
  live_inventory jsonb,
  candidate_deployment_id text,
  candidate_deployment_commit text,
  candidate_immutable_origin text,
  candidate_deployment_target text
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  normalized_retained jsonb;
  normalized_reviewed jsonb;
  normalized_live jsonb;
  expected_candidate jsonb;
  expected_candidate_record jsonb;
  live_count integer;
begin
  if candidate_deployment_target not in ('PREVIEW', 'PRODUCTION')
     or pg_catalog.jsonb_typeof(live_inventory) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_INPUT_INVALID';
  end if;
  normalized_retained :=
    production_control.normalized_vercel_origin_inventory(retained_inventory);
  normalized_reviewed := production_control.normalized_vercel_origin_inventory(
    '[
      [
        "dpl_32Upq6iEQoD2MVdxcWWVihj66hEg",
        "41b0517e4e1679536438109ea61028663c80508f",
        "https://bagger-c1miwfnb1-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ],
      [
        "dpl_44fXUMdcS7QbQiJvMimX1DozcZrR",
        "fdda563eaab6569a6c8e0442ef8118fdc0db8569",
        "https://bagger-m3t3ao7ui-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ],
      [
        "dpl_ENU4XkC1dpbj9aho5gTz2x8zw9qP",
        "85eb5efce7f5c9d9292e007fc093c05d7dd5c356",
        "https://bagger-7zpm6cjp3-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ],
      [
        "dpl_6m9FqCvd8pe1epaxyYMmkRhK7Pc6",
        "3fcbaa287fcb306fa3b47310f01ed6eb3901749c",
        "https://bagger-phzmni50c-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ],
      [
        "dpl_Ux3JFpeS8MxMoKj19kL63tzQ9FjQ",
        "3fcbaa287fcb306fa3b47310f01ed6eb3901749c",
        "https://bagger-dc2m041un-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ]
    ]'::jsonb
  );
  normalized_live :=
    production_control.normalized_vercel_origin_inventory(live_inventory);
  expected_candidate := production_control.expected_vercel_live_inventory(
    '[]'::jsonb, candidate_deployment_id, candidate_deployment_commit,
    candidate_immutable_origin, candidate_deployment_target
  );
  expected_candidate_record := expected_candidate->0;
  live_count := pg_catalog.jsonb_array_length(normalized_live);

  if normalized_live is distinct from live_inventory
     or live_count < pg_catalog.jsonb_array_length(normalized_retained)
       + pg_catalog.jsonb_array_length(normalized_reviewed) + 1
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         normalized_retained || normalized_reviewed
       ) required(record)
       where required.record->>0 = candidate_deployment_id
          or required.record->>2 = pg_catalog.lower(pg_catalog.rtrim(
            candidate_immutable_origin, '/'
          ))
     )
     or (select pg_catalog.count(distinct value->>0)
       from pg_catalog.jsonb_array_elements(normalized_live) value) <>
       live_count
     or (select pg_catalog.count(distinct value->>2)
       from pg_catalog.jsonb_array_elements(normalized_live) value) <>
       live_count
     or exists (
       select value from pg_catalog.jsonb_array_elements(normalized_retained)
       except
       select value from pg_catalog.jsonb_array_elements(normalized_live)
     )
     or exists (
       select value from pg_catalog.jsonb_array_elements(normalized_reviewed)
       except
       select value from pg_catalog.jsonb_array_elements(normalized_live)
     )
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized_live) value
       where value = expected_candidate_record) <> 1
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(normalized_live) value
       where (value->>0 = candidate_deployment_id
           or value->>2 = pg_catalog.lower(pg_catalog.rtrim(
             candidate_immutable_origin, '/'
           )))
         and value is distinct from expected_candidate_record
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized_live) live(record)
       join pg_catalog.jsonb_array_elements(normalized_reviewed) reviewed(record)
         on live.record->>0 = reviewed.record->>0
           or live.record->>2 = reviewed.record->>2
       where live.record is distinct from reviewed.record
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized_live) live(record)
       where pg_catalog.jsonb_typeof(live.record) is distinct from 'array'
         or pg_catalog.jsonb_array_length(live.record) <> 6
         or coalesce(live.record->>0, '') !~ '^dpl_[A-Za-z0-9]{8,64}$'
         or (live.record->1 <> 'null'::jsonb
           and coalesce(live.record->>1, '') !~ '^[0-9a-f]{40}$')
         or coalesce(live.record->>2, '') !~ '^https://[a-z0-9.-]+$'
         or live.record->>3 not in (
           'MAIN_PRODUCTION', 'FEATURE_PREVIEW',
           'CUTOVER_PRODUCTION_CANDIDATE'
         )
         or live.record->>4 not in ('READY', 'ERROR', 'BLOCKED')
         or live.record->>5 not in (
           'GIT', 'REDEPLOY_INHERITED_GIT',
           'VERCEL_API_RESOLVED_GIT',
           'VERCEL_CLI_SHA_UNAVAILABLE'
         )
         or (not exists (
           select 1
           from pg_catalog.jsonb_array_elements(normalized_retained)
             retained(record)
           where retained.record = live.record
         ) and not exists (
           select 1
           from pg_catalog.jsonb_array_elements(normalized_reviewed)
             reviewed(record)
           where reviewed.record = live.record
         ) and (
           live.record->1 = 'null'::jsonb
           or live.record->>1 <> pg_catalog.lower(candidate_deployment_commit)
           or (candidate_deployment_target = 'PREVIEW'
             and live.record->>3 <> 'FEATURE_PREVIEW')
           or (candidate_deployment_target = 'PRODUCTION'
             and live.record->>3 not in (
               'FEATURE_PREVIEW', 'CUTOVER_PRODUCTION_CANDIDATE'
             ))
           or live.record->>5 <> 'GIT'
         ))
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH';
  end if;
end;
$$;

revoke all on function
  public.inspect_production_vercel_provider_attestation_challenge_abandonment(
    jsonb
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.inspect_production_vercel_provider_attestation_challenge_abandonment(
    jsonb
  ) to service_role;
revoke all on function
  public.abandon_production_vercel_provider_attestation_challenge(
    jsonb
  ) from public, anon, authenticated, service_role;
grant execute on function
  public.abandon_production_vercel_provider_attestation_challenge(
    jsonb
  ) to service_role;
revoke all on function
  production_control.guard_terminal_vercel_provider_challenge()
  from public, anon, authenticated, service_role;
revoke all on function
  production_control.vercel_provider_attestation_challenge_response(
    production_control.vercel_provider_attestation_challenges, boolean
  ) from public, anon, authenticated, service_role;
revoke all on function
  production_control.vercel_provider_challenge_has_abandonment_progression(
    production_control.vercel_provider_attestation_challenges
  ) from public, anon, authenticated, service_role;
revoke all on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) from public, anon, authenticated;
grant execute on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) to service_role;

comment on function
  public.inspect_production_vercel_provider_attestation_challenge_abandonment(
    jsonb
  ) is 'Locks and classifies an exact retained provider BEGIN challenge for abandonment using database time without mutating it.';
comment on function
  public.abandon_production_vercel_provider_attestation_challenge(
    jsonb
  ) is 'Atomically and immutably abandons only an expired, unconsumed, unprogressed BEGIN provider challenge using its exact stored old binding.';
comment on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) is 'Fail-closed exact Vercel live-origin assertion with five reviewed post-capture Preview deployments and one collision-free dynamic cutover candidate.';

commit;
