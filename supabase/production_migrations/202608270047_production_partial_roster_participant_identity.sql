-- Permit the reviewed Production participant-identity cutover to activate
-- with a non-empty, explicitly approved subset of the active 2026 roster.
-- Applying this migration performs no authority or identity-data mutation.
begin;

create or replace function
  production_control.build_production_participant_identity_enrollment_inspection()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $$
declare
  resource production_control.resource_scope%rowtype;
  active_roster_count integer := 0;
  active_contact_count integer := 0;
  enrolled_count integer := 0;
  not_enrolled_count integer := 0;
  invalid_enrolled_count integer := 0;
  residual_authority_count integer := 0;
  distinct_email_count integer := 0;
  players_value jsonb := '[]'::jsonb;
begin
  select * into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';

  if resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.project_url <> 'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or resource.google_workbook_id
       <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.vercel_project <> 'bagger-inv'
     or resource.canonical_domain <> 'https://baggerinv.com'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_year <> 2026 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_RESOURCE_SCOPE_INVALID';
  end if;

  with active_roster as (
    select membership.player_id
    from scoring_authority.tournament_players membership
    where membership.tournament_id = '2026'
      and membership.participation_status = 'ACTIVE'
  ),
  active_contacts as (
    select contact.*
    from participant_identity.participant_identity_contacts contact
    where contact.tournament_id = '2026'
      and contact.identity_active
  ),
  eligible_contacts as (
    select distinct contact.player_id, contact.email_normalized
    from active_contacts contact
    join active_roster membership
      on membership.player_id = contact.player_id
    join participant_identity.identity_context_revisions current_revision
      on current_revision.tournament_id = contact.tournament_id
     and current_revision.context_revision = contact.configuration_revision
    join participant_identity.identity_config_import_runs import_run
      on import_run.tournament_id = contact.tournament_id
     and import_run.configuration_revision = contact.configuration_revision
     and import_run.source_fingerprint
       = current_revision.configuration_fingerprint
     and import_run.status = 'APPROVED'
     and import_run.approved_at is not null
     and import_run.source_workbook_id = resource.google_workbook_id
    where contact.source_workbook_id = resource.google_workbook_id
      and contact.source_system = import_run.source_system
      and contact.player_id = pg_catalog.upper(pg_catalog.btrim(contact.player_id))
      and contact.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
      and contact.email_normalized
        = pg_catalog.lower(pg_catalog.btrim(contact.email))
      and contact.email_normalized ~* (
        '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@'
        || '[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?'
        || '(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
      )::pg_catalog.text collate "C"
      and pg_catalog.split_part(contact.email_normalized, '@', 2)
        !~* '(^|\.)(example\.(com|net|org)|invalid|test|localhost)$'
  ),
  residual_identity_players as (
    select roster.player_id
    from active_roster roster
    where not exists (
      select 1 from active_contacts contact
      where contact.player_id = roster.player_id
    )
      and (
        exists (
          select 1
          from participant_identity.user_player_links link
          where link.player_id = roster.player_id
            and link.status in ('PENDING', 'ACTIVE', 'SUSPENDED')
        )
        or exists (
          select 1
          from participant_identity.participant_auth_identifiers identifier
          where identifier.player_id = roster.player_id
            and identifier.identifier_type = 'EMAIL'
            and identifier.status in (
              'ELIGIBLE', 'VERIFICATION_PENDING', 'VERIFIED'
            )
        )
      )
  ),
  roster_status as (
    select
      roster.player_id,
      eligible.email_normalized,
      case
        when eligible.player_id is not null then 'ENROLLED'
        when active_contact.player_id is not null
          or residual.player_id is not null then 'INVALID_ENROLLMENT'
        else 'NOT_ENROLLED'
      end as enrollment_status
    from active_roster roster
    left join active_contacts active_contact
      on active_contact.player_id = roster.player_id
    left join eligible_contacts eligible
      on eligible.player_id = roster.player_id
    left join residual_identity_players residual
      on residual.player_id = roster.player_id
  ),
  totals as (
    select
      (select pg_catalog.count(*) from active_roster)::integer
        as active_roster_count,
      (select pg_catalog.count(*) from active_contacts)::integer
        as active_contact_count,
      (select pg_catalog.count(*) from eligible_contacts)::integer
        as enrolled_count,
      (select pg_catalog.count(*) from roster_status
        where enrollment_status = 'NOT_ENROLLED')::integer
        as not_enrolled_count,
      (
        (select pg_catalog.count(*) from active_contacts)
        - (select pg_catalog.count(*) from eligible_contacts)
        + (select pg_catalog.count(*) from residual_identity_players)
      )::integer as invalid_enrolled_count,
      (select pg_catalog.count(*) from residual_identity_players)::integer
        as residual_authority_count,
      (select pg_catalog.count(distinct pg_catalog.lower(email_normalized))
        from eligible_contacts)::integer as distinct_email_count,
      coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'playerId', status.player_id,
            'enrollmentStatus', status.enrollment_status
          ) || case
            when status.enrollment_status = 'ENROLLED' then
              pg_catalog.jsonb_build_object(
                'maskedEmail',
                pg_catalog.left(
                  pg_catalog.split_part(status.email_normalized, '@', 1), 1
                ) || '***@' ||
                pg_catalog.left(
                  pg_catalog.split_part(status.email_normalized, '@', 2), 1
                ) || '***.' ||
                pg_catalog.reverse(
                  pg_catalog.split_part(
                    pg_catalog.reverse(
                      pg_catalog.split_part(status.email_normalized, '@', 2)
                    ),
                    '.',
                    1
                  )
                )
              )
            else '{}'::jsonb
          end
          order by status.player_id
        )
        from roster_status status
      ), '[]'::jsonb) as players
  )
  select
    totals.active_roster_count,
    totals.active_contact_count,
    totals.enrolled_count,
    totals.not_enrolled_count,
    totals.invalid_enrolled_count,
    totals.residual_authority_count,
    totals.distinct_email_count,
    totals.players
  into
    active_roster_count,
    active_contact_count,
    enrolled_count,
    not_enrolled_count,
    invalid_enrolled_count,
    residual_authority_count,
    distinct_email_count,
    players_value
  from totals;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'production-participant-identity-partial-enrollment-v1',
    'enrollmentPolicy', 'APPROVED_PARTIAL_ROSTER',
    'activeRosterCount', active_roster_count,
    'enrolledCount', enrolled_count,
    'notEnrolledCount', not_enrolled_count,
    'invalidEnrolledCount', invalid_enrolled_count,
    'residualAuthorityCount', residual_authority_count,
    'distinctEmailCount', distinct_email_count,
    'activationEligible',
      active_roster_count >= 1
      and enrolled_count >= 1
      and active_contact_count = enrolled_count
      and invalid_enrolled_count = 0
      and distinct_email_count = enrolled_count,
    'players', players_value
  );
end;
$$;

revoke all on function
  production_control.build_production_participant_identity_enrollment_inspection()
  from public, anon, authenticated, service_role;

create or replace function
  public.inspect_production_participant_identity_enrollment()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $$
begin
  perform production_control.assert_production_service_role();
  return production_control
    .build_production_participant_identity_enrollment_inspection();
end;
$$;

revoke all on function
  public.inspect_production_participant_identity_enrollment()
  from public, anon, authenticated, service_role;
grant execute on function
  public.inspect_production_participant_identity_enrollment()
  to service_role;

create or replace function public.activate_production_participant_identity(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, participant_identity,
  scoring_authority, auth, extensions, pg_temp
as $$
declare resource production_control.resource_scope%rowtype;
declare activation production_control.cutover_activation_state%rowtype;
declare existing jsonb;
declare response_value jsonb;
declare enrollment_inspection jsonb;
declare active_roster_count integer;
declare enrolled_count integer;
declare not_enrolled_count integer;
declare expected_revision bigint;
begin
  perform production_control.assert_exact_cutover_resource_scope(input, true);
  existing := production_control.lookup_cutover_receipt(
    'ACTIVATE_PARTICIPANT_IDENTITY', input
  );
  if existing is not null then return existing; end if;
  if input->>'contract_version'
       is distinct from 'production-participant-identity-cutover-v2'
     or upper(coalesce(input->>'phase', '')) <> 'IDENTITY'
     or coalesce(input->>'actor_id', '') = '' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_IDENTITY_ACTIVATION_SCOPE_REQUIRED';
  end if;
  expected_revision := coalesce(
    (input->>'expected_activation_revision')::bigint, -1
  );
  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION' for update;
  -- The activation-row lock serializes a concurrent replay. Re-check the
  -- receipt after acquiring it so the second caller returns the first result.
  existing := production_control.lookup_cutover_receipt(
    'ACTIVATE_PARTICIPANT_IDENTITY', input
  );
  if existing is not null then return existing; end if;
  select * into strict resource
  from production_control.resource_scope
  where scope_key = 'BAGGER_INV_PRODUCTION' for update;
  if activation.activation_revision <> expected_revision
     or activation.state = 'DORMANT'
     or activation.expected_deployment_commit
       is distinct from input->>'deployment_commit'
     or resource.scoring_authority <> 'GOOGLE'
     or resource.scoring_ingress_enabled then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_IDENTITY_ACTIVATION_STATE_MISMATCH';
  end if;

  enrollment_inspection := production_control
    .build_production_participant_identity_enrollment_inspection();
  active_roster_count := coalesce(
    (enrollment_inspection->>'activeRosterCount')::integer, 0
  );
  enrolled_count := coalesce(
    (enrollment_inspection->>'enrolledCount')::integer, 0
  );
  not_enrolled_count := coalesce(
    (enrollment_inspection->>'notEnrolledCount')::integer, 0
  );
  if resource.participant_identity_authority = 'SUPABASE'
     and resource.auth_user_creation_enabled then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'authority', 'SUPABASE',
      'authUserCreationEnabled', true,
      'enrollmentPolicy', 'APPROVED_PARTIAL_ROSTER',
      'approvedParticipants', enrolled_count,
      'activeRosterCount', active_roster_count,
      'enrolledCount', enrolled_count,
      'notEnrolledCount', not_enrolled_count,
      'activeRosterParticipants', active_roster_count,
      'enrolledParticipants', enrolled_count,
      'notEnrolledParticipants', not_enrolled_count,
      'activationRevision', activation.activation_revision,
      'idempotent', true
    );
    perform production_control.store_cutover_receipt(
      'ACTIVATE_PARTICIPANT_IDENTITY', input, response_value
    );
    return response_value;
  end if;
  if resource.participant_identity_authority <> 'PASSPORT'
     or resource.auth_user_creation_enabled then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_IDENTITY_ACTIVATION_DRIFT';
  end if;
  if not coalesce(
    (enrollment_inspection->>'activationEligible')::boolean, false
  ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_IDENTITY_APPROVED_PARTIAL_ROSTER_REQUIRED';
  end if;

  update production_control.resource_scope set
    participant_identity_authority = 'SUPABASE',
    auth_user_creation_enabled = true,
    updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION';
  update production_control.cutover_activation_state set
    activation_revision = activation_revision + 1,
    updated_by = left(input->>'actor_id', 160),
    updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
  returning * into activation;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_PARTICIPANT_IDENTITY_ACTIVATED',
    'PARTICIPANT_IDENTITY', '2026',
    left(input->>'actor_id', 160),
    lower(input->>'request_fingerprint'), 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'authority', 'SUPABASE',
      'enrollmentPolicy', 'APPROVED_PARTIAL_ROSTER',
      'approvedParticipants', enrolled_count,
      'activeRosterCount', active_roster_count,
      'enrolledCount', enrolled_count,
      'notEnrolledCount', not_enrolled_count,
      'activeRosterParticipants', active_roster_count,
      'enrolledParticipants', enrolled_count,
      'notEnrolledParticipants', not_enrolled_count,
      'authUserCreationEnabled', true,
      'scoringAuthorityChanged', false,
      'activationRevision', activation.activation_revision,
      'cutoverState', activation.state
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'authority', 'SUPABASE',
    'enrollmentPolicy', 'APPROVED_PARTIAL_ROSTER',
    'approvedParticipants', enrolled_count,
    'activeRosterCount', active_roster_count,
    'enrolledCount', enrolled_count,
    'notEnrolledCount', not_enrolled_count,
    'activeRosterParticipants', active_roster_count,
    'enrolledParticipants', enrolled_count,
    'notEnrolledParticipants', not_enrolled_count,
    'authUserCreationEnabled', true,
    'activationRevision', activation.activation_revision,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ACTIVATE_PARTICIPANT_IDENTITY', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function public.activate_production_participant_identity(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_production_participant_identity(jsonb)
  to service_role;

comment on function
  public.inspect_production_participant_identity_enrollment() is
  'Reports the approved partial-roster Production identity enrollment state without exposing canonical email addresses.';
comment on function public.activate_production_participant_identity(jsonb) is
  'Activates Supabase participant identity for a non-empty, fully valid approved subset of the active Production roster.';

notify pgrst, 'reload schema';
commit;
