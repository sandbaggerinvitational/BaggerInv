-- Focused PostgreSQL fixture for migration 078.
-- The caller has already completed the certified 2026 platform cutover,
-- application release 053, and installed migrations through 078.

insert into auth.users (id, email, email_confirmed_at)
values (
  '00000000-0000-4000-8000-000000000091',
  'annual-review@baggerinv.com', pg_catalog.clock_timestamp()
) on conflict (id) do nothing;

insert into scoring_authority.players (player_id, display_name, source_payload)
values ('AR01', 'Annual Review Owner', '{}'::jsonb)
on conflict (player_id) do nothing;

insert into scoring_authority.tournaments (
  tournament_id, tournament_year, name, source_workbook_id,
  scoring_authority
) values (
  '2099', 2099, 'Annual release review target',
  '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4', 'SUPABASE'
) on conflict (tournament_id) do nothing;

update production_control.resource_scope
set odds_publication_authority = 'SUPABASE',
    odds_publication_enabled = true
where scope_key = 'BAGGER_INV_PRODUCTION';

update production_control.future_tournament_catalog_v1
set lifecycle = 'CLOSED', lifecycle_revision = 2
where tournament_id = '2026';

insert into production_control.future_tournament_catalog_v1 (
  tournament_id, tournament_year, contract_version, tournament_name,
  lifecycle, lifecycle_revision, setup_revision, creation_mode,
  source_manifest
) values (
  '2099', 2099, 'production-future-year-administration-v1',
  'Annual release review target', 'ACTIVE', 2, 1, 'BLANK',
  '{"reviewFixture":true}'::jsonb
);

insert into production_control.future_tournament_resources_v1 (
  tournament_id, project_ref, project_url, source_workbook_id,
  resource_status, resource_revision, google_compatibility_policy
) values (
  '2099', 'ymqhhtxaywtqllynrmxe',
  'https://ymqhhtxaywtqllynrmxe.supabase.co',
  '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4',
  'CURRENT_RESOURCE_BOUND', 1, 'CURRENT_CERTIFIED'
);

insert into production_control.future_runtime_promotions_v2 (
  tournament_id, contract_version, promotion_revision,
  source_setup_revision, promoted_manifest_fingerprint, runtime_status,
  promoted_by_player_id, promoted_by_auth_user_id
) values (
  '2099', 'production-future-runtime-activation-v2', 1, 1,
  repeat('1', 64), 'ACTIVE', 'AR01',
  '00000000-0000-4000-8000-000000000091'
);

insert into production_control.future_annual_runtime_generations_v1 (
  runtime_generation_id, tournament_id, generation_status,
  runtime_revision, pointer_revision, authority_generation_id,
  admission_generation_id, authority, ingress_state,
  readiness_fingerprint, activated_at
) values (
  '10000000-0000-4000-8000-000000000091', '2099', 'ACTIVE',
  1, 2, '20000000-0000-4000-8000-000000000092',
  '30000000-0000-4000-8000-000000000093', 'SUPABASE', 'OPEN',
  repeat('2', 64), pg_catalog.clock_timestamp()
);

insert into production_control.future_google_writer_generations_v2 (
  writer_generation_id, contract_version, destination_workbook_id,
  implementation_fingerprint, certification_status
)
select production_control.future_google_writer_generation_id_v2(
    '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4', value.fingerprint
  ),
  'production-future-google-match-provisioning-v2',
  '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4', value.fingerprint,
  'CERTIFIED'
from (
  select production_control
    .future_google_writer_implementation_fingerprint_v2() fingerprint
) value;

insert into production_control.future_google_writer_targets_v2 (
  tournament_id, writer_generation_id, destination_workbook_id,
  target_contract_fingerprint, contract_status,
  certification_contract_version, resource_revision,
  promotion_revision, source_setup_revision,
  promoted_manifest_fingerprint, resource_binding_fingerprint
)
select '2099', value.writer_generation_id,
  '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4', repeat('0', 64),
  'CERTIFIED', 'production-annual-google-writer-certification-v1',
  1, 1, 1, repeat('1', 64),
  production_control.future_google_writer_resource_fingerprint_v1('2099')
from production_control.future_google_writer_generations_v2 value;

set session_replication_role = replica;
update production_control.future_google_writer_targets_v2
set target_contract_fingerprint =
  production_control.future_google_writer_target_fingerprint_v1('2099')
where tournament_id = '2099';
set session_replication_role = origin;

insert into participant_identity.future_tournament_identity_contexts_v1 (
  tournament_id, contract_version, binding_revision,
  source_identity_tournament_id, source_context_revision,
  source_configuration_fingerprint, binding_fingerprint,
  roster_count, enrolled_count, not_enrolled_count, status,
  certified_by_player_id, certified_by_auth_user_id,
  runtime_generation_id, authority_generation_id,
  admission_generation_id, pointer_revision
) values (
  '2099', 'production-future-participant-identity-context-v1', 1,
  '2026', 1, repeat('3', 64), repeat('4', 64),
  1, 1, 0, 'CERTIFIED', 'AR01',
  '00000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000091',
  '20000000-0000-4000-8000-000000000092',
  '30000000-0000-4000-8000-000000000093', 2
);

insert into production_control.annual_scoring_runtime_authorities_v1 (
  runtime_generation_id, tournament_id, platform_tournament_id,
  platform_authority_generation_id, platform_admission_generation_id,
  pointer_revision, lifecycle_revision, authority_generation_id,
  admission_generation_id, google_writer_generation_id,
  destination_workbook_id, google_target_contract_fingerprint,
  authority_status, admission_state, admission_revision,
  legacy_root_closure_id, predecessor_tournament_id,
  predecessor_closure_id, active_closure_id,
  predecessor_boundary_fingerprint, activated_by_player_id,
  activated_by_auth_user_id
)
select
  '10000000-0000-4000-8000-000000000091', '2099', '2026',
  activation.authority_generation_id, gate.admission_generation_id,
  2, 2, '20000000-0000-4000-8000-000000000092',
  '30000000-0000-4000-8000-000000000093', writer.writer_generation_id,
  writer.destination_workbook_id, writer.target_contract_fingerprint,
  'ACTIVE', 'OPEN', 1, gate.active_closure_id, '2026',
  gate.active_closure_id, null, repeat('5', 64), 'AR01',
  '00000000-0000-4000-8000-000000000091'
from production_control.cutover_activation_state activation
cross join scoring_authority.ingress_gates gate
cross join production_control.future_google_writer_targets_v2 writer
where activation.scope_key = 'BAGGER_INV_PRODUCTION'
  and gate.tournament_id = '2026'
  and writer.tournament_id = '2099';

select production_control.ensure_annual_side_game_runtime_v1(
  '2099', '10000000-0000-4000-8000-000000000091',
  '20000000-0000-4000-8000-000000000092',
  '30000000-0000-4000-8000-000000000093', true
);

update production_control.current_tournament_pointer_v1
set tournament_id = '2099', tournament_year = 2099,
    pointer_revision = 2, lifecycle_revision = 2,
    updated_at = pg_catalog.clock_timestamp()
where scope_key = 'BAGGER_INV_PRODUCTION';

select production_control
  .assert_future_google_writer_live_implementation_v2('2099');
select production_control.postcutover_annual_release_context_v1();

-- Hash every target-year row in every production-owned base table.  Platform
-- release rows are intentionally 2026-rooted (or have no tournament_id), so
-- this captures the annual pointer/generation/authority/certification and all
-- annual facts without treating the Step-12 deployment binding as annual.
create function public.annual_release_review_target_snapshot()
returns text
language plpgsql
set search_path = pg_catalog
as $snapshot$
declare
  relation record;
  relation_rows jsonb;
  snapshot_value jsonb := '{}'::jsonb;
begin
  for relation in
    select namespace.nspname schema_name, class.relname relation_name
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = class.oid
     and attribute.attname = 'tournament_id'
     and attribute.attnum > 0
     and not attribute.attisdropped
    where class.relkind in ('r', 'p')
      and namespace.nspname in (
        'production_control', 'scoring_authority', 'participant_identity'
      )
      and (namespace.nspname, class.relname) not in (
        ('production_control', 'operation_audit_events'),
        ('scoring_authority', 'audit_events')
      )
    order by namespace.nspname, class.relname
  loop
    execute pg_catalog.format(
      'select coalesce(jsonb_agg(to_jsonb(value) order by to_jsonb(value)::text), ''[]''::jsonb) from %I.%I value where tournament_id = $1',
      relation.schema_name, relation.relation_name
    ) into relation_rows using '2099';
    snapshot_value := snapshot_value || pg_catalog.jsonb_build_object(
      relation.schema_name || '.' || relation.relation_name,
      relation_rows
    );
  end loop;
  return production_control.future_runtime_hash_v2(snapshot_value);
end;
$snapshot$;

create function public.annual_release_review_target_state()
returns jsonb
language plpgsql
set search_path = pg_catalog
as $state$
declare
  relation record;
  relation_rows jsonb;
  snapshot_value jsonb := '{}'::jsonb;
begin
  for relation in
    select namespace.nspname schema_name, class.relname relation_name
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = class.oid
     and attribute.attname = 'tournament_id'
     and attribute.attnum > 0
     and not attribute.attisdropped
    where class.relkind in ('r', 'p')
      and namespace.nspname in (
        'production_control', 'scoring_authority', 'participant_identity'
      )
      and (namespace.nspname, class.relname) not in (
        ('production_control', 'operation_audit_events'),
        ('scoring_authority', 'audit_events')
      )
    order by namespace.nspname, class.relname
  loop
    execute pg_catalog.format(
      'select coalesce(jsonb_agg(to_jsonb(value) order by to_jsonb(value)::text), ''[]''::jsonb) from %I.%I value where tournament_id = $1',
      relation.schema_name, relation.relation_name
    ) into relation_rows using '2099';
    snapshot_value := snapshot_value || pg_catalog.jsonb_build_object(
      relation.schema_name || '.' || relation.relation_name,
      relation_rows
    );
  end loop;
  return snapshot_value;
end;
$state$;
