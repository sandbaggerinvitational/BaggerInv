-- Step 13E.7B.1 annual Calcutta V1 authority and worker dispatch.
--
-- Installation is inert. It creates no Calcutta configuration, auction,
-- publication, result, or job, and it does not move the current tournament
-- pointer. The frozen 2026 RPCs remain the only 2026 mutation path and retain
-- the annual pointer fence installed by migration 069.
begin;

-- Calcutta remains an OBSERVATION-phase capability in the installed V1
-- contract. Its explicit worker calls are intentionally classified as
-- bounded mutations too: they are not generic platform workers and require
-- the same open annual admission/runtime fence as every Calcutta write.
alter table production_control.annual_scoring_rpc_allowlist_v1
  drop constraint if exists production_annual_scoring_required_phase_v2;
alter table production_control.annual_scoring_rpc_allowlist_v1
  add constraint production_annual_scoring_required_phase_v3 check (
    required_phase in (
      'CURRENT_READS', 'SCORING_COMMIT', 'WORKERS', 'ODDS_WAR_ROOM',
      'OBSERVATION'
    )
  );

insert into production_control.annual_scoring_rpc_allowlist_v1 (
  operation_name, target_rpc, required_phase, operation_class,
  required_worker
) values
  ('configure_production_calcutta_v1',
    'public.future_production_configure_calcutta_v1',
    'OBSERVATION', 'MUTATION', null),
  ('replace_production_calcutta_v1_auction_facts',
    'public.future_production_replace_calcutta_auction_facts_v1',
    'OBSERVATION', 'MUTATION', null),
  ('publish_production_calcutta_v1',
    'public.future_production_publish_calcutta_v1',
    'OBSERVATION', 'MUTATION', null),
  ('unpublish_production_calcutta_v1',
    'public.future_production_unpublish_calcutta_v1',
    'OBSERVATION', 'MUTATION', null),
  ('enqueue_production_calcutta_v1_recalculation',
    'public.future_production_enqueue_calcutta_recalculation_v1',
    'OBSERVATION', 'MUTATION', null),
  ('claim_production_calcutta_v1_recalculation',
    'public.future_production_claim_calcutta_recalculation_v1',
    'OBSERVATION', 'MUTATION', null),
  ('complete_production_calcutta_v1_recalculation',
    'public.future_production_complete_calcutta_recalculation_v1',
    'OBSERVATION', 'MUTATION', null),
  ('fail_production_calcutta_v1_recalculation',
    'public.future_production_fail_calcutta_recalculation_v1',
    'OBSERVATION', 'MUTATION', null),
  ('inspect_production_calcutta_v1',
    'public.future_production_inspect_calcutta_v1',
    'OBSERVATION', 'READ', null),
  ('resolve_production_calcutta_postcommit_match_v1',
    'public.future_production_resolve_calcutta_postcommit_match_v1',
    'OBSERVATION', 'READ', null);

-- Future Calcutta calls are accepted only for the exact pointer-selected,
-- ACTIVE, runtime-certified tournament. The service assertion proves the
-- immutable Production resource and (for Director actions) the existing
-- Director entitlement rooted in the 2026 governance authority. The caller
-- cannot select a dormant tournament by adding or replacing JSON fields.
create function production_control.assert_annual_calcutta_runtime_v1(
  input jsonb,
  expected_operation text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $annual_calcutta_runtime$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  authority production_control.annual_scoring_runtime_authorities_v1%rowtype;
  annual_resource production_control.future_tournament_resources_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
begin
  -- The dispatcher and this target-side assertion both bind the exact
  -- pointer/runtime/destination. Keeping the target-side check means a direct
  -- service-role call cannot bypass the annual allowlist.
  if production_control.assert_annual_scoring_runtime_v1(
       input, expected_operation, null
     ) = '2026' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CALCUTTA_RUNTIME_REQUIRED';
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pointer.tournament_id;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  select value.* into strict authority
  from production_control.annual_scoring_runtime_authorities_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.runtime_generation_id = generation.runtime_generation_id;
  select value.* into strict annual_resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = pointer.tournament_id;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';

  if pointer.tournament_id = '2026'
     or input->>'contract_version' is distinct from 'production-calcutta-v1'
     or input->>'expected_current_tournament_id'
       is distinct from pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or input->>'expected_runtime_generation_id'
       is distinct from generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id'
       is distinct from generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id'
       is distinct from generation.admission_generation_id::text
     or coalesce((input->>'expected_activation_revision')::bigint, -1)
       <> activation.activation_revision
     or generation.pointer_revision <> pointer.pointer_revision
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision
     or authority.authority_status <> 'ACTIVE'
     or authority.admission_state <> 'OPEN'
     or authority.pointer_revision <> pointer.pointer_revision
     or authority.lifecycle_revision <> pointer.lifecycle_revision
     or authority.authority_generation_id is distinct from
       generation.authority_generation_id
     or authority.admission_generation_id is distinct from
       generation.admission_generation_id
     or annual_resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or annual_resource.source_workbook_id is null
     or annual_resource.project_ref is distinct from input->>'project_ref'
     or annual_resource.project_url is distinct from input->>'project_url'
     or annual_resource.source_workbook_id
       is distinct from input->>'annual_destination_workbook_id' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CALCUTTA_RUNTIME_REQUIRED';
  end if;
  return pointer.tournament_id;
exception
  when invalid_text_representation or numeric_value_out_of_range
    or no_data_found then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CALCUTTA_RUNTIME_REQUIRED';
end;
$annual_calcutta_runtime$;

revoke all on function
  production_control.assert_annual_calcutta_runtime_v1(jsonb, text)
  from public, anon, authenticated, service_role;

create function production_control.annual_calcutta_resource_fingerprint_v1(
  target text,
  runtime_generation uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $annual_calcutta_resource_fingerprint$
  select production_control.calcutta_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-annual-calcutta-v1',
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.source_workbook_id,
      'tournament_id', target,
      'runtime_generation_id', runtime_generation,
      'pointer_revision', pointer.pointer_revision,
      'lifecycle_revision', pointer.lifecycle_revision
    )
  )
  from production_control.future_tournament_resources_v1 resource
  join production_control.current_tournament_pointer_v1 pointer
    on pointer.scope_key = 'BAGGER_INV_PRODUCTION'
   and pointer.tournament_id = resource.tournament_id
  where resource.tournament_id = target
$annual_calcutta_resource_fingerprint$;

revoke all on function
  production_control.annual_calcutta_resource_fingerprint_v1(text, uuid)
  from public, anon, authenticated, service_role;

-- The existing configuration validator is the single V1 rules validator.
-- Only its frozen resource identity fields are replaced after validation.
create function production_control.build_annual_calcutta_v1_configuration(
  input jsonb,
  target text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $annual_calcutta_configuration$
  select production_control.build_production_calcutta_v1_configuration(input)
    || pg_catalog.jsonb_build_object(
      'tournament_id', target,
      'tournament_year', target::integer
    )
$annual_calcutta_configuration$;

revoke all on function
  production_control.build_annual_calcutta_v1_configuration(jsonb, text)
  from public, anon, authenticated, service_role;

-- Auction validation is tournament-scoped because both purchased Players and
-- owners must be ACTIVE members of the exact annual tournament.
create function production_control.build_annual_calcutta_v1_auction(
  input jsonb,
  target text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_calcutta_auction$
declare
  purchase_value jsonb;
  ownership_value jsonb;
  entrant_value text;
  owner_value text;
  price_value numeric;
  share_value numeric;
  purchases_value jsonb := '[]'::jsonb;
  ownership_value_out jsonb := '[]'::jsonb;
  seen_entrants text[] := '{}'::text[];
  seen_ownership text[] := '{}'::text[];
  pot_value numeric := 0;
begin
  if input->>'contract_version' is distinct from 'production-calcutta-v1'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'purchases', 'null'::jsonb
     )) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'ownership', 'null'::jsonb
     )) <> 'array'
     or pg_catalog.jsonb_array_length(input->'purchases') = 0
     or pg_catalog.jsonb_array_length(input->'ownership') = 0 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
  end if;
  for purchase_value in
    select value from pg_catalog.jsonb_array_elements(input->'purchases') value
    order by value->>'player_id'
  loop
    entrant_value := pg_catalog.btrim(coalesce(
      purchase_value->>'player_id', ''
    ));
    if pg_catalog.jsonb_typeof(purchase_value) <> 'object'
       or not (purchase_value ?& array['player_id', 'purchase_price'])
       or purchase_value->'player_id' = 'null'::jsonb
       or purchase_value->'purchase_price' = 'null'::jsonb then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_PURCHASE_INVALID';
    end if;
    price_value := (purchase_value->>'purchase_price')::numeric;
    if entrant_value = '' or entrant_value = any(seen_entrants)
       or price_value < 0 or not exists (
         select 1 from scoring_authority.tournament_players membership
         where membership.tournament_id = target
           and membership.player_id = entrant_value
           and membership.participation_status = 'ACTIVE'
       ) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_PURCHASE_INVALID';
    end if;
    seen_entrants := pg_catalog.array_append(seen_entrants, entrant_value);
    pot_value := pot_value + price_value;
    purchases_value := purchases_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'player_id', entrant_value, 'purchase_price', price_value
      )
    );
  end loop;
  for ownership_value in
    select value from pg_catalog.jsonb_array_elements(input->'ownership') value
    order by value->>'player_id', value->>'owner_player_id'
  loop
    if pg_catalog.jsonb_typeof(ownership_value) <> 'object'
       or not (ownership_value ?& array[
         'player_id', 'owner_player_id', 'ownership_fraction'
       ])
       or ownership_value->'player_id' = 'null'::jsonb
       or ownership_value->'owner_player_id' = 'null'::jsonb
       or ownership_value->'ownership_fraction' = 'null'::jsonb then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_OWNERSHIP_INVALID';
    end if;
    entrant_value := pg_catalog.btrim(coalesce(
      ownership_value->>'player_id', ''
    ));
    owner_value := pg_catalog.btrim(coalesce(
      ownership_value->>'owner_player_id', ''
    ));
    share_value := (ownership_value->>'ownership_fraction')::numeric;
    if entrant_value = '' or not (entrant_value = any(seen_entrants))
       or owner_value = '' or share_value <= 0 or share_value > 1
       or (entrant_value || ':' || owner_value) = any(seen_ownership)
       or not exists (
         select 1 from scoring_authority.tournament_players membership
         where membership.tournament_id = target
           and membership.player_id = owner_value
           and membership.participation_status = 'ACTIVE'
       ) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_OWNERSHIP_INVALID';
    end if;
    seen_ownership := pg_catalog.array_append(
      seen_ownership, entrant_value || ':' || owner_value
    );
    ownership_value_out := ownership_value_out ||
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'player_id', entrant_value,
        'owner_player_id', owner_value,
        'ownership_fraction', share_value
      ));
  end loop;
  if exists (
    select 1 from pg_catalog.unnest(seen_entrants) entrant
    where coalesce((
      select pg_catalog.sum((owner_row->>'ownership_fraction')::numeric)
      from pg_catalog.jsonb_array_elements(ownership_value_out) owner_row
      where owner_row->>'player_id' = entrant
    ), 0) <> 1
  ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_OWNERSHIP_TOTAL_MISMATCH';
  end if;
  return pg_catalog.jsonb_build_object(
    'contract_version', 'production-calcutta-v1',
    'tournament_id', target,
    'state', 'AUCTION_COMPLETE',
    'currency_code', 'USD',
    'auction_unit', 'PLAYER',
    'entry_workflow', 'MANUAL_FINAL_AUCTION_FACTS',
    'pot', pot_value,
    'purchases', purchases_value,
    'ownership', ownership_value_out
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
end;
$annual_calcutta_auction$;

revoke all on function
  production_control.build_annual_calcutta_v1_auction(jsonb, text)
  from public, anon, authenticated, service_role;

create function public.future_production_configure_calcutta_v1(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_calcutta_configure$
declare
  target text;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  manifest_value jsonb;
  configuration_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(coalesce(
    input->>'request_fingerprint', ''
  ));
  payload_hash_value text := production_control.calcutta_v1_hash(input);
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid := nullif(input#>>'{authorization,auth_user_id}', '')::uuid;
  prior_configuration_revision bigint := 0;
  prior_auction_revision bigint := 0;
  prior_publication_revision bigint := 0;
begin
  target := production_control.assert_annual_calcutta_runtime_v1(
    input, 'configure_production_calcutta_v1'
  );
  perform production_control.assert_future_production_scoring_actor_v1(
    input, target, true
  );
  existing_response := production_control.lookup_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_CONFIGURE', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_INPUT_INVALID';
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target and value.generation_status = 'ACTIVE';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target
  for update;
  if found then
    prior_configuration_revision := current_value.configuration_revision;
    prior_auction_revision := current_value.auction_revision;
    prior_publication_revision := current_value.publication_revision;
  end if;
  if prior_configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or (case when prior_configuration_revision = 0 then null
       else current_value.configuration_fingerprint end) is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if prior_auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if prior_publication_revision <>
       coalesce((input->>'expected_publication_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';
  end if;
  manifest_value := production_control
    .build_annual_calcutta_v1_configuration(input, target);
  configuration_fingerprint_value :=
    production_control.calcutta_v1_hash(manifest_value);
  insert into scoring_authority.calcutta_v1_configuration_revisions (
    tournament_id, configuration_revision, contract_version, state,
    configuration_manifest, configuration_fingerprint,
    resource_fingerprint, activation_revision, authority_epoch_id,
    configured_by_player_id, configured_by_auth_user_id,
    request_fingerprint, request_payload_hash, configured_at
  ) values (
    target, prior_configuration_revision + 1,
    'production-calcutta-v1', 'CONFIGURED', manifest_value,
    configuration_fingerprint_value,
    production_control.annual_calcutta_resource_fingerprint_v1(
      target, generation.runtime_generation_id
    ), activation.activation_revision, generation.authority_generation_id,
    actor_player, actor_auth, request_fingerprint_value,
    payload_hash_value, pg_catalog.clock_timestamp()
  ) returning * into configuration_value;
  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    target, prior_publication_revision + 1,
    configuration_value.configuration_revision, prior_auction_revision,
    configuration_fingerprint_value, current_value.auction_fingerprint,
    'UNPUBLISHED', 'CONFIGURATION_REPLACED', actor_player, actor_auth,
    production_control.calcutta_v1_hash(pg_catalog.jsonb_build_object(
      'operation', 'ANNUAL_CONFIGURATION_REPLACED',
      'target_tournament_id', target,
      'request_fingerprint', request_fingerprint_value
    )), payload_hash_value, null
  ) returning * into publication_value;
  update scoring_authority.calcutta_v1_recalculation_jobs set
    status = 'SUPERSEDED', claimed_by = null, claim_token = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target and status in ('PENDING', 'RUNNING');
  update scoring_authority.calcutta_v1_result_revisions set
    is_current = false, superseded_at = pg_catalog.clock_timestamp()
  where tournament_id = target and is_current;
  insert into scoring_authority.calcutta_v1_current (
    tournament_id, configuration_revision_id, configuration_revision,
    configuration_fingerprint, auction_revision_id, auction_revision,
    auction_fingerprint, publication_revision_id, publication_revision,
    publication_state, state, result_revision, updated_at
  ) values (
    target, configuration_value.configuration_revision_id,
    configuration_value.configuration_revision,
    configuration_fingerprint_value,
    current_value.auction_revision_id, prior_auction_revision,
    current_value.auction_fingerprint,
    publication_value.publication_revision_id,
    publication_value.publication_revision, 'UNPUBLISHED',
    case when prior_auction_revision > 0
      then 'AUCTION_COMPLETE' else 'CONFIGURED' end,
    0, pg_catalog.clock_timestamp()
  ) on conflict (tournament_id) do update set
    configuration_revision_id = excluded.configuration_revision_id,
    configuration_revision = excluded.configuration_revision,
    configuration_fingerprint = excluded.configuration_fingerprint,
    publication_revision_id = excluded.publication_revision_id,
    publication_revision = excluded.publication_revision,
    publication_state = excluded.publication_state,
    state = excluded.state,
    result_revision = excluded.result_revision,
    updated_at = excluded.updated_at;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, 'PRODUCTION_CALCUTTA_V1_CONFIGURED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', configuration_value.configuration_revision,
      'configuration_fingerprint', configuration_fingerprint_value,
      'auction_revision', prior_auction_revision,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED',
      'runtime_generation_id', generation.runtime_generation_id,
      'payout_rounding', 'NONE', 'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_CONFIGURED', 'CALCUTTA', target,
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', configuration_value.configuration_revision,
      'auction_revision', prior_auction_revision,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED',
      'runtime_generation_id', generation.runtime_generation_id
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_CALCUTTA_V1_CONFIGURED',
    'tournament_id', target,
    'runtime_generation_id', generation.runtime_generation_id,
    'state', case when prior_auction_revision > 0
      then 'AUCTION_COMPLETE' else 'CONFIGURED' end,
    'publication_state', 'UNPUBLISHED',
    'configuration_revision', configuration_value.configuration_revision,
    'configuration_fingerprint', configuration_fingerprint_value,
    'auction_revision', prior_auction_revision,
    'auction_fingerprint', current_value.auction_fingerprint,
    'publication_revision', publication_value.publication_revision,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_CONFIGURE', input, response_value
  );
  return response_value;
end;
$annual_calcutta_configure$;

revoke all on function public.future_production_configure_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.future_production_replace_calcutta_auction_facts_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_calcutta_replace_auction$
declare
  target text;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  manifest_value jsonb;
  auction_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(coalesce(
    input->>'request_fingerprint', ''
  ));
  payload_hash_value text := production_control.calcutta_v1_hash(input);
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid := nullif(input#>>'{authorization,auth_user_id}', '')::uuid;
begin
  target := production_control.assert_annual_calcutta_runtime_v1(
    input, 'replace_production_calcutta_v1_auction_facts'
  );
  perform production_control.assert_future_production_scoring_actor_v1(
    input, target, true
  );
  existing_response := production_control.lookup_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_REPLACE_AUCTION', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target and value.generation_status = 'ACTIVE';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target for update;
  if current_value.state = 'NOT_CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REQUIRED';
  end if;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.publication_revision <>
       coalesce((input->>'expected_publication_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';
  end if;
  manifest_value := production_control
    .build_annual_calcutta_v1_auction(input, target);
  auction_fingerprint_value := production_control.calcutta_v1_hash(
    manifest_value
  );
  insert into scoring_authority.calcutta_v1_auction_fact_revisions (
    tournament_id, auction_revision, state, auction_manifest,
    auction_fingerprint, resource_fingerprint, activation_revision,
    authority_epoch_id, recorded_by_player_id, recorded_by_auth_user_id,
    request_fingerprint, request_payload_hash, recorded_at
  ) values (
    target, current_value.auction_revision + 1, 'AUCTION_COMPLETE',
    manifest_value, auction_fingerprint_value,
    production_control.annual_calcutta_resource_fingerprint_v1(
      target, generation.runtime_generation_id
    ), activation.activation_revision, generation.authority_generation_id,
    actor_player, actor_auth, request_fingerprint_value,
    payload_hash_value, pg_catalog.clock_timestamp()
  ) returning * into auction_value;
  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    target, current_value.publication_revision + 1,
    current_value.configuration_revision, auction_value.auction_revision,
    current_value.configuration_fingerprint, auction_fingerprint_value,
    'UNPUBLISHED', 'AUCTION_REPLACED', actor_player, actor_auth,
    production_control.calcutta_v1_hash(pg_catalog.jsonb_build_object(
      'operation', 'ANNUAL_AUCTION_REPLACED',
      'target_tournament_id', target,
      'request_fingerprint', request_fingerprint_value
    )), payload_hash_value, null
  ) returning * into publication_value;
  update scoring_authority.calcutta_v1_recalculation_jobs set
    status = 'SUPERSEDED', claimed_by = null, claim_token = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target and status in ('PENDING', 'RUNNING');
  update scoring_authority.calcutta_v1_result_revisions set
    is_current = false, superseded_at = pg_catalog.clock_timestamp()
  where tournament_id = target and is_current;
  update scoring_authority.calcutta_v1_current set
    auction_revision_id = auction_value.auction_revision_id,
    auction_revision = auction_value.auction_revision,
    auction_fingerprint = auction_fingerprint_value,
    publication_revision_id = publication_value.publication_revision_id,
    publication_revision = publication_value.publication_revision,
    publication_state = 'UNPUBLISHED', state = 'AUCTION_COMPLETE',
    result_revision = 0, updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, 'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', auction_value.auction_revision,
      'auction_fingerprint', auction_fingerprint_value,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED',
      'purchase_count', pg_catalog.jsonb_array_length(
        manifest_value->'purchases'
      ),
      'ownership_count', pg_catalog.jsonb_array_length(
        manifest_value->'ownership'
      ), 'pot', manifest_value->>'pot', 'currency_code', 'USD',
      'runtime_generation_id', generation.runtime_generation_id,
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED', 'CALCUTTA', target,
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', auction_value.auction_revision,
      'publication_revision', publication_value.publication_revision,
      'runtime_generation_id', generation.runtime_generation_id
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED',
    'tournament_id', target,
    'runtime_generation_id', generation.runtime_generation_id,
    'state', 'AUCTION_COMPLETE', 'publication_state', 'UNPUBLISHED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', auction_value.auction_revision,
    'auction_fingerprint', auction_fingerprint_value,
    'publication_revision', publication_value.publication_revision,
    'currency_code', 'USD', 'pot', manifest_value->>'pot',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_REPLACE_AUCTION', input, response_value
  );
  return response_value;
end;
$annual_calcutta_replace_auction$;

revoke all on function
  public.future_production_replace_calcutta_auction_facts_v1(jsonb)
  from public, anon, authenticated, service_role;

create function production_control.enqueue_annual_calcutta_v1(
  target text,
  runtime_generation uuid,
  activation_revision_value bigint,
  reason_value text,
  requested_by_value text,
  force_value boolean default false,
  request_fingerprint_value text default null,
  request_payload_hash_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_calcutta_enqueue$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  current_result scoring_authority.calcutta_v1_result_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  completed_rounds_value integer[];
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target
    and value.runtime_generation_id = runtime_generation
    and value.generation_status = 'ACTIVE';
  if target = '2026' or pointer.tournament_id <> target
     or pointer.pointer_revision <> generation.pointer_revision then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CALCUTTA_RUNTIME_REQUIRED';
  end if;
  select value.* into current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target for update;
  if not found or current_value.state = 'NOT_CONFIGURED'
     or current_value.auction_revision = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;
  source_revision_value :=
    production_control.calcutta_v1_source_revision(target);
  source_fingerprint_value := production_control.calcutta_v1_hash(
    source_revision_value
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'production-calcutta-v1:enqueue:' || target, 202608300075
    )
  );
  select value.* into current_result
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = target
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.source_fingerprint = source_fingerprint_value
    and value.is_current limit 1;
  if found and not force_value then
    return pg_catalog.jsonb_build_object(
      'job_id', null, 'status', 'CURRENT',
      'tournament_id', target,
      'runtime_generation_id', runtime_generation,
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'source_fingerprint', source_fingerprint_value,
      'result_revision', current_result.result_revision
    );
  end if;
  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.tournament_id = target
    and value.runtime_generation_id = runtime_generation
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.activation_revision = activation_revision_value
    and value.source_fingerprint = source_fingerprint_value
    and value.status in ('PENDING', 'RUNNING')
  order by value.requested_at desc, value.job_id desc limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id, 'status', job_value.status,
      'tournament_id', target,
      'runtime_generation_id', runtime_generation,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'auction_revision', job_value.auction_revision,
      'auction_fingerprint', job_value.auction_fingerprint,
      'source_fingerprint', job_value.source_fingerprint,
      'result_revision', null
    );
  end if;
  update scoring_authority.calcutta_v1_recalculation_jobs set
    status = 'SUPERSEDED', claimed_by = null, claim_token = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target and runtime_generation_id = runtime_generation
    and status in ('PENDING', 'RUNNING');
  insert into scoring_authority.calcutta_v1_recalculation_jobs (
    tournament_id, configuration_revision_id, configuration_revision,
    configuration_fingerprint, auction_revision_id, auction_revision,
    auction_fingerprint, activation_revision, source_revision,
    source_fingerprint, status, reason, requested_by,
    request_fingerprint, request_payload_hash, runtime_generation_id
  ) values (
    target, current_value.configuration_revision_id,
    current_value.configuration_revision,
    current_value.configuration_fingerprint,
    current_value.auction_revision_id, current_value.auction_revision,
    current_value.auction_fingerprint, activation_revision_value,
    source_revision_value, source_fingerprint_value, 'PENDING',
    pg_catalog.left(coalesce(nullif(reason_value, ''),
      'EXPLICIT_RECALCULATION'), 120),
    pg_catalog.left(coalesce(nullif(requested_by_value, ''),
      'production-calcutta-v1'), 160),
    request_fingerprint_value, request_payload_hash_value,
    runtime_generation
  ) returning * into job_value;
  completed_rounds_value :=
    production_control.calcutta_v1_completed_rounds(target);
  update scoring_authority.calcutta_v1_current set
    state = case
      when current_result.result_id is not null
        and current_result.result_state = 'OFFICIAL'
        and 3 = any(completed_rounds_value) then 'OFFICIAL'
      when current_result.result_id is not null
        and coalesce(pg_catalog.array_length(
          completed_rounds_value, 1
        ), 0) > 0 then 'IN_PROGRESS'
      else 'AUCTION_COMPLETE' end,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target;
  return pg_catalog.jsonb_build_object(
    'job_id', job_value.job_id, 'status', job_value.status,
    'tournament_id', target,
    'runtime_generation_id', runtime_generation,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'source_fingerprint', job_value.source_fingerprint,
    'result_revision', null
  );
end;
$annual_calcutta_enqueue$;

revoke all on function production_control.enqueue_annual_calcutta_v1(
  text, uuid, bigint, text, text, boolean, text, text
) from public, anon, authenticated, service_role;

create function production_control.mutate_annual_calcutta_publication_v1(
  input jsonb,
  publish_value boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_calcutta_publication$
declare
  target text;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_value jsonb;
  operation_value text := case when publish_value
    then 'ANNUAL_CALCUTTA_V1_PUBLISH'
    else 'ANNUAL_CALCUTTA_V1_UNPUBLISH' end;
  desired_state text := case when publish_value
    then 'PUBLISHED' else 'UNPUBLISHED' end;
  request_fingerprint_value text := pg_catalog.lower(coalesce(
    input->>'request_fingerprint', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid := nullif(input#>>'{authorization,auth_user_id}', '')::uuid;
begin
  target := production_control.assert_annual_calcutta_runtime_v1(
    input, case when publish_value
      then 'publish_production_calcutta_v1'
      else 'unpublish_production_calcutta_v1' end
  );
  perform production_control.assert_future_production_scoring_actor_v1(
    input, target, true
  );
  existing_response := production_control.lookup_cutover_receipt(
    operation_value, input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target and value.generation_status = 'ACTIVE';
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target for update;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.publication_revision <>
       coalesce((input->>'expected_publication_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';
  end if;
  if publish_value and (
       current_value.state = 'NOT_CONFIGURED'
       or current_value.auction_revision = 0
       or current_value.auction_revision_id is null
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;
  if current_value.publication_state = desired_state then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', case when publish_value
        then 'PRODUCTION_CALCUTTA_V1_ALREADY_PUBLISHED'
        else 'PRODUCTION_CALCUTTA_V1_ALREADY_UNPUBLISHED' end,
      'tournament_id', target,
      'runtime_generation_id', generation.runtime_generation_id,
      'state', current_value.state,
      'publication_state', desired_state,
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'job', null, 'idempotent', true
    );
    perform production_control.store_cutover_receipt(
      operation_value, input, response_value
    );
    return response_value;
  end if;
  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    target, current_value.publication_revision + 1,
    current_value.configuration_revision, current_value.auction_revision,
    current_value.configuration_fingerprint,
    current_value.auction_fingerprint, desired_state,
    case when publish_value
      then 'DIRECTOR_PUBLISHED' else 'DIRECTOR_UNPUBLISHED' end,
    actor_player, actor_auth, request_fingerprint_value,
    production_control.calcutta_v1_hash(input),
    case when publish_value
      then pg_catalog.clock_timestamp() else null end
  ) returning * into publication_value;
  update scoring_authority.calcutta_v1_current set
    publication_revision_id = publication_value.publication_revision_id,
    publication_revision = publication_value.publication_revision,
    publication_state = desired_state,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target;
  if publish_value then
    job_value := production_control.enqueue_annual_calcutta_v1(
      target, generation.runtime_generation_id,
      (input->>'expected_activation_revision')::bigint,
      'DIRECTOR_PUBLISHED', actor_player, false, null, null
    );
  else
    job_value := null;
  end if;
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, case when publish_value
      then 'PRODUCTION_CALCUTTA_V1_PUBLISHED'
      else 'PRODUCTION_CALCUTTA_V1_UNPUBLISHED' end,
    actor_player, pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', current_value.auction_revision,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'state_preserved', current_value.state,
      'runtime_generation_id', generation.runtime_generation_id,
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    case when publish_value
      then 'PRODUCTION_CALCUTTA_V1_PUBLISHED'
      else 'PRODUCTION_CALCUTTA_V1_UNPUBLISHED' end,
    'CALCUTTA', target, actor_player, request_fingerprint_value,
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', current_value.auction_revision,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'runtime_generation_id', generation.runtime_generation_id,
      'job_id', job_value->>'job_id'
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', case when publish_value
      then 'PRODUCTION_CALCUTTA_V1_PUBLISHED'
      else 'PRODUCTION_CALCUTTA_V1_UNPUBLISHED' end,
    'tournament_id', target,
    'runtime_generation_id', generation.runtime_generation_id,
    'state', current_value.state, 'publication_state', desired_state,
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', current_value.auction_revision,
    'auction_fingerprint', current_value.auction_fingerprint,
    'publication_revision', current_value.publication_revision,
    'result_revision', nullif(current_value.result_revision, 0),
    'job', job_value, 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    operation_value, input, response_value
  );
  return response_value;
end;
$annual_calcutta_publication$;

revoke all on function
  production_control.mutate_annual_calcutta_publication_v1(jsonb, boolean)
  from public, anon, authenticated, service_role;

create function public.future_production_publish_calcutta_v1(input jsonb)
returns jsonb language sql security definer set search_path = pg_catalog
as $annual_calcutta_publish$
  select production_control.mutate_annual_calcutta_publication_v1(input, true)
$annual_calcutta_publish$;

create function public.future_production_unpublish_calcutta_v1(input jsonb)
returns jsonb language sql security definer set search_path = pg_catalog
as $annual_calcutta_unpublish$
  select production_control.mutate_annual_calcutta_publication_v1(input, false)
$annual_calcutta_unpublish$;

revoke all on function public.future_production_publish_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.future_production_unpublish_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.future_production_enqueue_calcutta_recalculation_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_calcutta_enqueue_rpc$
declare
  target text;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_value jsonb;
  request_fingerprint_value text := pg_catalog.lower(coalesce(
    input->>'request_fingerprint', ''
  ));
begin
  target := production_control.assert_annual_calcutta_runtime_v1(
    input, 'enqueue_production_calcutta_v1_recalculation'
  );
  existing_response := production_control.lookup_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_ENQUEUE', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_REQUEST_FINGERPRINT_INVALID';
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target and value.generation_status = 'ACTIVE';
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;
  job_value := production_control.enqueue_annual_calcutta_v1(
    target, generation.runtime_generation_id,
    (input->>'expected_activation_revision')::bigint,
    pg_catalog.left(coalesce(nullif(input->>'reason', ''),
      'EXPLICIT_RECALCULATION'), 120),
    pg_catalog.left(coalesce(nullif(input->>'requested_by', ''),
      'production-calcutta-v1'), 160),
    true, request_fingerprint_value,
    production_control.calcutta_v1_hash(input)
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_ENQUEUED',
    'tournament_id', target,
    'runtime_generation_id', generation.runtime_generation_id,
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', current_value.auction_revision,
    'auction_fingerprint', current_value.auction_fingerprint,
    'job', job_value, 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_ENQUEUE', input, response_value
  );
  return response_value;
end;
$annual_calcutta_enqueue_rpc$;

revoke all on function
  public.future_production_enqueue_calcutta_recalculation_v1(jsonb)
  from public, anon, authenticated, service_role;

create function production_control.project_annual_calcutta_v1_result(
  target text,
  engine_payload jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $annual_calcutta_projection$
  select pg_catalog.jsonb_set(
    production_control.project_production_calcutta_v1_result(engine_payload),
    '{year}', pg_catalog.to_jsonb(target::integer), false
  )
$annual_calcutta_projection$;

revoke all on function
  production_control.project_annual_calcutta_v1_result(text, jsonb)
  from public, anon, authenticated, service_role;

create function production_control.validate_annual_calcutta_v1_result(
  target text,
  target_result_state text,
  engine_payload jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_calcutta_result_validation$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  golfer_value jsonb;
  portfolio_value jsonb;
  completed_rounds integer[];
  canonical_completed_rounds integer[];
  expected_entrant_count integer;
  expected_owner_count integer;
begin
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target;
  select value.* into strict auction_value
  from scoring_authority.calcutta_v1_auction_fact_revisions value
  where value.auction_revision_id = current_value.auction_revision_id
    and value.tournament_id = target;
  if pg_catalog.jsonb_typeof(engine_payload) <> 'object'
     or not (engine_payload ?& array[
       'available', 'year', 'pot', 'completedRounds',
       'tournamentComplete', 'distributedPrizePool',
       'guaranteedDistributed', 'remainingPrizePool',
       'golfers', 'portfolios'
     ])
     or engine_payload->'available' = 'null'::jsonb
     or engine_payload->'year' = 'null'::jsonb
     or engine_payload->'pot' = 'null'::jsonb
     or engine_payload->'tournamentComplete' = 'null'::jsonb
     or pg_catalog.jsonb_typeof(engine_payload->'completedRounds') <> 'array'
     or pg_catalog.jsonb_typeof(engine_payload->'golfers') <> 'array'
     or pg_catalog.jsonb_typeof(engine_payload->'portfolios') <> 'array'
     or coalesce((engine_payload->>'year')::integer, 0) <> target::integer
     or (engine_payload->>'pot')::numeric < 0
     or (engine_payload->>'pot')::numeric <>
       (auction_value.auction_manifest->>'pot')::numeric
     or engine_payload::text ~*
       '"(email|auth_user_id|authUserId|phone|service_role|serviceRole|secret|credential)"[[:space:]]*:'
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(engine_payload) key_value
       where not (key_value = any(array[
         'available', 'year', 'pot', 'distributedPrizePool',
         'guaranteedDistributed', 'remainingPrizePool',
         'completedRounds', 'tournamentComplete', 'golfers', 'portfolios',
         'storylines', 'hero', 'source'
       ]))
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_PAYLOAD_INVALID';
  end if;
  begin
    select pg_catalog.array_agg(value::integer order by value::integer)
      into completed_rounds
    from pg_catalog.jsonb_array_elements_text(
      engine_payload->'completedRounds'
    ) value;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_PAYLOAD_INVALID';
  end;
  if coalesce(pg_catalog.array_length(completed_rounds, 1), 0) <>
       coalesce((select pg_catalog.count(distinct value)
         from pg_catalog.unnest(completed_rounds) value), 0)
     or exists (
       select 1 from pg_catalog.unnest(coalesce(
         completed_rounds, '{}'::integer[]
       )) value where value not between 1 and 3
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_PAYLOAD_INVALID';
  end if;
  completed_rounds := coalesce(completed_rounds, '{}'::integer[]);
  canonical_completed_rounds :=
    production_control.calcutta_v1_completed_rounds(target);
  if completed_rounds is distinct from canonical_completed_rounds then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_COMPLETED_ROUNDS_CONFLICT';
  end if;
  expected_entrant_count := pg_catalog.jsonb_array_length(
    auction_value.auction_manifest->'purchases'
  );
  for golfer_value in select value from pg_catalog.jsonb_array_elements(
    engine_payload->'golfers'
  ) value loop
    if pg_catalog.jsonb_typeof(golfer_value) <> 'object'
       or pg_catalog.btrim(coalesce(golfer_value->>'playerId', '')) = ''
       or golfer_value#>>'{player,id}' is distinct from
         golfer_value->>'playerId'
       or pg_catalog.btrim(coalesce(
         golfer_value#>>'{player,name}', ''
       )) = ''
       or not exists (
         select 1 from pg_catalog.jsonb_array_elements(
           auction_value.auction_manifest->'purchases'
         ) purchase
         where purchase->>'player_id' = golfer_value->>'playerId'
       ) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_RESULT_ENTRANT_INVALID';
    end if;
  end loop;
  if pg_catalog.jsonb_array_length(engine_payload->'golfers') <>
       expected_entrant_count
     or (select pg_catalog.count(distinct golfer->>'playerId')
       from pg_catalog.jsonb_array_elements(
         engine_payload->'golfers'
       ) golfer) <> expected_entrant_count then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_ENTRANT_INVALID';
  end if;
  select pg_catalog.count(distinct ownership->>'owner_player_id')
    into expected_owner_count
  from pg_catalog.jsonb_array_elements(
    auction_value.auction_manifest->'ownership'
  ) ownership;
  for portfolio_value in select value
    from pg_catalog.jsonb_array_elements(engine_payload->'portfolios') value
  loop
    if pg_catalog.jsonb_typeof(portfolio_value) <> 'object'
       or pg_catalog.btrim(coalesce(portfolio_value->>'ownerId', '')) = ''
       or portfolio_value#>>'{owner,id}' is distinct from
         portfolio_value->>'ownerId'
       or pg_catalog.btrim(coalesce(
         portfolio_value#>>'{owner,name}', ''
       )) = ''
       or not exists (
         select 1 from pg_catalog.jsonb_array_elements(
           auction_value.auction_manifest->'ownership'
         ) ownership
         where ownership->>'owner_player_id' =
           portfolio_value->>'ownerId'
       ) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_RESULT_OWNER_INVALID';
    end if;
  end loop;
  if pg_catalog.jsonb_array_length(engine_payload->'portfolios') <>
       expected_owner_count
     or (select pg_catalog.count(distinct portfolio->>'ownerId')
       from pg_catalog.jsonb_array_elements(
         engine_payload->'portfolios'
       ) portfolio) <> expected_owner_count then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_OWNER_INVALID';
  end if;
  if target_result_state = 'OFFICIAL' then
    if coalesce((engine_payload->>'tournamentComplete')::boolean, false)
         is not true or not (3 = any(completed_rounds)) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_CALCUTTA_OFFICIAL_FINALIZATION_REQUIRED';
    end if;
  elsif target_result_state = 'PROVISIONAL' then
    if coalesce((engine_payload->>'tournamentComplete')::boolean, false)
         is true then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_RESULT_STATE_INVALID';
    end if;
  else
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_STATE_INVALID';
  end if;
  perform production_control.project_annual_calcutta_v1_result(
    target, engine_payload
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_RESULT_PAYLOAD_INVALID';
end;
$annual_calcutta_result_validation$;

revoke all on function
  production_control.validate_annual_calcutta_v1_result(text, text, jsonb)
  from public, anon, authenticated, service_role;

create function public.future_production_claim_calcutta_recalculation_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_calcutta_claim$
declare
  target text;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  calculation_input jsonb;
  core_view jsonb;
  current_source jsonb;
  current_source_fingerprint text;
  replacement_job jsonb;
  expected_result_revision bigint;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  lease_seconds_value integer := pg_catalog.least(300,
    pg_catalog.greatest(15, coalesce(
      (input->>'lease_seconds')::integer, 60
    ))
  );
  claim_token_value uuid;
begin
  target := production_control.assert_annual_calcutta_runtime_v1(
    input, 'claim_production_calcutta_v1_recalculation'
  );
  existing_response := production_control.lookup_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_CLAIM', input
  );
  if existing_response is not null then return existing_response; end if;
  if worker_value = '' or pg_catalog.length(worker_value) > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_WORKER_ID_REQUIRED';
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target and value.generation_status = 'ACTIVE';
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision = 0 then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;
  update scoring_authority.calcutta_v1_recalculation_jobs set
    status = case when attempts >= 5 then 'FAILED' else 'PENDING' end,
    claimed_by = null, claim_token = null, lease_expires_at = null,
    completed_at = case when attempts >= 5
      then pg_catalog.clock_timestamp() else null end,
    last_error_code = case when attempts >= 5
      then 'PRODUCTION_CALCUTTA_LEASE_EXHAUSTED' else null end,
    last_error_safe = case when attempts >= 5
      then 'Calcutta recalculation is temporarily unavailable.' else null end,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target
    and runtime_generation_id = generation.runtime_generation_id
    and configuration_revision = current_value.configuration_revision
    and configuration_fingerprint = current_value.configuration_fingerprint
    and auction_revision = current_value.auction_revision
    and auction_fingerprint = current_value.auction_fingerprint
    and activation_revision =
      (input->>'expected_activation_revision')::bigint
    and status = 'RUNNING' and lease_expires_at <= pg_catalog.clock_timestamp();
  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.tournament_id = target
    and value.runtime_generation_id = generation.runtime_generation_id
    and value.configuration_revision = current_value.configuration_revision
    and value.configuration_fingerprint =
      current_value.configuration_fingerprint
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.activation_revision =
      (input->>'expected_activation_revision')::bigint
    and value.status = 'PENDING' and value.attempts < 5
  order by value.requested_at, value.job_id
  for update skip locked limit 1;
  if not found then
    if exists (
      select 1 from scoring_authority.calcutta_v1_recalculation_jobs value
      where value.tournament_id = target
        and value.runtime_generation_id = generation.runtime_generation_id
        and value.configuration_revision = current_value.configuration_revision
        and value.auction_revision = current_value.auction_revision
        and value.status = 'FAILED'
    ) then
      update scoring_authority.calcutta_v1_current set
        state = 'UNAVAILABLE', updated_at = pg_catalog.clock_timestamp()
      where tournament_id = target;
    end if;
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_EMPTY',
      'tournament_id', target,
      'runtime_generation_id', generation.runtime_generation_id,
      'job', null, 'calculation_input', null, 'idempotent', false
    );
    perform production_control.store_cutover_receipt(
      'ANNUAL_CALCUTTA_V1_CLAIM', input, response_value
    );
    return response_value;
  end if;
  current_source := production_control.calcutta_v1_source_revision(target);
  current_source_fingerprint := production_control.calcutta_v1_hash(
    current_source
  );
  if current_source_fingerprint <> job_value.source_fingerprint then
    update scoring_authority.calcutta_v1_recalculation_jobs set
      status = 'SUPERSEDED', completed_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    where job_id = job_value.job_id;
    replacement_job := production_control.enqueue_annual_calcutta_v1(
      target, generation.runtime_generation_id,
      (input->>'expected_activation_revision')::bigint,
      'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value, false, null, null
    );
    select value.* into strict job_value
    from scoring_authority.calcutta_v1_recalculation_jobs value
    where value.job_id = (replacement_job->>'job_id')::uuid
      and value.tournament_id = target
      and value.runtime_generation_id = generation.runtime_generation_id
    for update;
  end if;
  claim_token_value := extensions.gen_random_uuid();
  update scoring_authority.calcutta_v1_recalculation_jobs set
    status = 'RUNNING', attempts = attempts + 1,
    claimed_by = worker_value, claim_token = claim_token_value,
    lease_expires_at = pg_catalog.clock_timestamp()
      + pg_catalog.make_interval(secs => lease_seconds_value),
    started_at = pg_catalog.clock_timestamp(), completed_at = null,
    updated_at = pg_catalog.clock_timestamp()
  where job_id = job_value.job_id
    and tournament_id = target
    and runtime_generation_id = generation.runtime_generation_id
  returning * into job_value;
  select coalesce(pg_catalog.max(value.result_revision), 0)
    into expected_result_revision
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = target;
  select value.* into strict configuration_value
  from scoring_authority.calcutta_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id
    and value.tournament_id = target;
  select value.* into strict auction_value
  from scoring_authority.calcutta_v1_auction_fact_revisions value
  where value.auction_revision_id = current_value.auction_revision_id
    and value.tournament_id = target;
  core_view := public.read_leaderboards_core_view(target);
  if coalesce((core_view->>'ok')::boolean, false) is not true then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_CANONICAL_INPUT_UNAVAILABLE';
  end if;
  calculation_input := pg_catalog.jsonb_build_object(
    'tournament', core_view#>'{data,tournament}',
    'configuration', pg_catalog.jsonb_build_object(
      'tournament_id', target, 'tournament_year', target::integer,
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'purchases', auction_value.auction_manifest->'purchases',
      'ownership', auction_value.auction_manifest->'ownership',
      'point_structure',
        configuration_value.configuration_manifest->'point_structure',
      'payout_structure',
        configuration_value.configuration_manifest->'payout_structure',
      'financial_contract',
        configuration_value.configuration_manifest->'financial_contract'
    ), 'core_view', core_view->'data'
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_CLAIMED',
    'tournament_id', target,
    'runtime_generation_id', generation.runtime_generation_id,
    'job', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'tournament_id', target,
      'runtime_generation_id', job_value.runtime_generation_id,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'auction_revision', job_value.auction_revision,
      'auction_fingerprint', job_value.auction_fingerprint,
      'activation_revision', job_value.activation_revision,
      'source_fingerprint', job_value.source_fingerprint,
      'claim_token', job_value.claim_token,
      'lease_expires_at', job_value.lease_expires_at,
      'expected_result_revision', expected_result_revision
    ), 'calculation_input', calculation_input, 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_CLAIM', input, response_value
  );
  return response_value;
end;
$annual_calcutta_claim$;

revoke all on function
  public.future_production_claim_calcutta_recalculation_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.future_production_complete_calcutta_recalculation_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_calcutta_complete$
declare
  target text;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  current_source jsonb;
  current_source_fingerprint text;
  current_result_revision bigint;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  requested_result_state text := pg_catalog.upper(coalesce(
    input->>'result_state', ''
  ));
  result_payload_value jsonb := input->'result_payload';
  payload_hash_value text;
begin
  target := production_control.assert_annual_calcutta_runtime_v1(
    input, 'complete_production_calcutta_v1_recalculation'
  );
  existing_response := production_control.lookup_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_COMPLETE', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or input->>'engine_version' is distinct from 'calcutta-js-v1'
     or requested_result_state not in ('PROVISIONAL', 'OFFICIAL')
     or pg_catalog.jsonb_typeof(coalesce(
       result_payload_value, 'null'::jsonb
     )) <> 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_COMPLETION_INPUT_INVALID';
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target and value.generation_status = 'ACTIVE';
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.job_id = job_id_value
    and value.tournament_id = target
    and value.runtime_generation_id = generation.runtime_generation_id
  for update;
  if not found or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.configuration_fingerprint <>
       current_value.configuration_fingerprint
     or job_value.auction_revision <> current_value.auction_revision
     or job_value.auction_fingerprint <> current_value.auction_fingerprint
     or job_value.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.clock_timestamp()
     or input->>'expected_source_fingerprint' is distinct from
       job_value.source_fingerprint then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_JOB_LEASE_REQUIRED';
  end if;
  current_source := production_control.calcutta_v1_source_revision(target);
  current_source_fingerprint := production_control.calcutta_v1_hash(
    current_source
  );
  if current_source_fingerprint <> job_value.source_fingerprint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_SOURCE_REVISION_CONFLICT';
  end if;
  payload_hash_value := production_control.calcutta_v1_hash(
    result_payload_value
  );
  perform production_control.validate_annual_calcutta_v1_result(
    target, requested_result_state, result_payload_value
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'production-calcutta-v1:result:' || target, 202608300075
    )
  );
  select coalesce(pg_catalog.max(value.result_revision), 0)
    into current_result_revision
  from scoring_authority.calcutta_v1_result_revisions value
  where value.tournament_id = target;
  if current_result_revision <>
       coalesce((input->>'expected_result_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_RESULT_REVISION_CONFLICT';
  end if;
  update scoring_authority.calcutta_v1_result_revisions set
    is_current = false, superseded_at = pg_catalog.clock_timestamp()
  where tournament_id = target and is_current;
  insert into scoring_authority.calcutta_v1_result_revisions (
    tournament_id, configuration_revision_id, configuration_revision,
    configuration_fingerprint, auction_revision_id, auction_revision,
    auction_fingerprint, result_revision, job_id, engine_version,
    source_fingerprint, result_state, engine_result_payload, payload_hash,
    is_current, calculated_by, calculated_at
  ) values (
    target, job_value.configuration_revision_id,
    job_value.configuration_revision, job_value.configuration_fingerprint,
    job_value.auction_revision_id, job_value.auction_revision,
    job_value.auction_fingerprint, current_result_revision + 1,
    job_value.job_id, 'calcutta-js-v1', job_value.source_fingerprint,
    requested_result_state, result_payload_value, payload_hash_value,
    true, worker_value, pg_catalog.clock_timestamp()
  ) returning * into result_value;
  update scoring_authority.calcutta_v1_recalculation_jobs set
    status = 'SUCCEEDED', claimed_by = null, claim_token = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    last_error_code = null, last_error_safe = null,
    updated_at = pg_catalog.clock_timestamp()
  where job_id = job_value.job_id
    and tournament_id = target
    and runtime_generation_id = generation.runtime_generation_id;
  update scoring_authority.calcutta_v1_current set
    state = case
      when requested_result_state = 'OFFICIAL' then 'OFFICIAL'
      when pg_catalog.jsonb_array_length(
        result_payload_value->'completedRounds'
      ) > 0 then 'IN_PROGRESS'
      else 'AUCTION_COMPLETE' end,
    result_revision = result_value.result_revision,
    updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target;
  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    target, 'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED',
    worker_value, pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'runtime_generation_id', generation.runtime_generation_id,
      'configuration_revision', job_value.configuration_revision,
      'auction_revision', job_value.auction_revision,
      'result_revision', result_value.result_revision,
      'result_state', requested_result_state,
      'source_fingerprint', job_value.source_fingerprint,
      'result_fingerprint', payload_hash_value,
      'publication_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED', 'CALCUTTA',
    target, worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'runtime_generation_id', generation.runtime_generation_id,
      'configuration_revision', job_value.configuration_revision,
      'auction_revision', job_value.auction_revision,
      'result_revision', result_value.result_revision,
      'result_state', requested_result_state,
      'publication_changed', false
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED',
    'tournament_id', target,
    'runtime_generation_id', generation.runtime_generation_id,
    'job_id', job_value.job_id,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'result_revision', result_value.result_revision,
    'result_state', requested_result_state,
    'result_fingerprint', payload_hash_value,
    'publication_state', current_value.publication_state,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_COMPLETE', input, response_value
  );
  return response_value;
end;
$annual_calcutta_complete$;

revoke all on function
  public.future_production_complete_calcutta_recalculation_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.future_production_fail_calcutta_recalculation_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $annual_calcutta_fail$
declare
  target text;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  error_code_value text := pg_catalog.upper(pg_catalog.left(coalesce(
    nullif(input->>'error_code', ''),
    'PRODUCTION_CALCUTTA_CALCULATION_FAILED'
  ), 120));
  error_safe_value text := pg_catalog.left(coalesce(
    nullif(input->>'error_safe', ''),
    'Calcutta recalculation is temporarily unavailable.'
  ), 300);
begin
  target := production_control.assert_annual_calcutta_runtime_v1(
    input, 'fail_production_calcutta_v1_recalculation'
  );
  existing_response := production_control.lookup_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_FAIL', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or error_code_value !~ '^[A-Z0-9_:-]{3,120}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_FAILURE_INPUT_INVALID';
  end if;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target and value.generation_status = 'ACTIVE';
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1)
     or current_value.configuration_fingerprint is distinct from
       nullif(input->>'expected_configuration_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';
  end if;
  if current_value.auction_revision <>
       coalesce((input->>'expected_auction_revision')::bigint, -1)
     or current_value.auction_fingerprint is distinct from
       nullif(input->>'expected_auction_fingerprint', '') then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  select value.* into job_value
  from scoring_authority.calcutta_v1_recalculation_jobs value
  where value.job_id = job_id_value
    and value.tournament_id = target
    and value.runtime_generation_id = generation.runtime_generation_id
  for update;
  if not found or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.configuration_fingerprint <>
       current_value.configuration_fingerprint
     or job_value.auction_revision <> current_value.auction_revision
     or job_value.auction_fingerprint <> current_value.auction_fingerprint
     or job_value.activation_revision <>
       (input->>'expected_activation_revision')::bigint
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_JOB_LEASE_REQUIRED';
  end if;
  update scoring_authority.calcutta_v1_recalculation_jobs set
    status = 'FAILED', claimed_by = null, claim_token = null,
    lease_expires_at = null, completed_at = pg_catalog.clock_timestamp(),
    last_error_code = error_code_value,
    last_error_safe = error_safe_value,
    updated_at = pg_catalog.clock_timestamp()
  where job_id = job_value.job_id
    and tournament_id = target
    and runtime_generation_id = generation.runtime_generation_id;
  update scoring_authority.calcutta_v1_current set
    state = 'UNAVAILABLE', updated_at = pg_catalog.clock_timestamp()
  where tournament_id = target;
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_RECALCULATION_FAILED', 'CALCUTTA',
    target, worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'FAILED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'runtime_generation_id', generation.runtime_generation_id,
      'configuration_revision', job_value.configuration_revision,
      'auction_revision', job_value.auction_revision,
      'source_fingerprint', job_value.source_fingerprint,
      'error_code', error_code_value
    )
  );
  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_RECALCULATION_FAILED',
    'tournament_id', target,
    'runtime_generation_id', generation.runtime_generation_id,
    'job_id', job_value.job_id,
    'configuration_revision', job_value.configuration_revision,
    'configuration_fingerprint', job_value.configuration_fingerprint,
    'auction_revision', job_value.auction_revision,
    'auction_fingerprint', job_value.auction_fingerprint,
    'state', 'UNAVAILABLE', 'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'ANNUAL_CALCUTTA_V1_FAIL', input, response_value
  );
  return response_value;
end;
$annual_calcutta_fail$;

revoke all on function
  public.future_production_fail_calcutta_recalculation_v1(jsonb)
  from public, anon, authenticated, service_role;

create function public.future_production_inspect_calcutta_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $annual_calcutta_inspect$
declare
  target text;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  revision_value text;
begin
  target := production_control.assert_annual_calcutta_runtime_v1(
    input, 'inspect_production_calcutta_v1'
  );
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target and value.generation_status = 'ACTIVE';
  select value.* into current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'data', pg_catalog.jsonb_build_object(
        'contract_version', 'production-calcutta-v1',
        'tournament_id', target,
        'runtime_generation_id', generation.runtime_generation_id,
        'state', 'NOT_CONFIGURED',
        'publication_policy',
          'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
        'publication_state', 'UNPUBLISHED', 'published', false,
        'configuration_revision', 0,
        'configuration_fingerprint', null,
        'auction_revision', 0, 'auction_fingerprint', null,
        'publication_revision', 0, 'result_revision', null,
        'result_fingerprint', null,
        'revision',
          'calcutta-v1:0:0:0:0:NOT_CONFIGURED:UNPUBLISHED'
      )
    );
  end if;
  if current_value.auction_revision > 0 then
    select value.* into result_value
    from scoring_authority.calcutta_v1_result_revisions value
    where value.tournament_id = target
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.is_current limit 1;
  end if;
  revision_value := pg_catalog.format(
    'calcutta-v1:%s:%s:%s:%s:%s:%s',
    current_value.configuration_revision,
    current_value.auction_revision,
    current_value.publication_revision,
    case when result_value.result_id is null
      then 0 else result_value.result_revision end,
    current_value.state, current_value.publication_state
  );
  return pg_catalog.jsonb_build_object(
    'ok', true, 'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'tournament_id', target,
      'runtime_generation_id', generation.runtime_generation_id,
      'state', current_value.state,
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'publication_state', current_value.publication_state,
      'published', current_value.publication_state = 'PUBLISHED',
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', case when result_value.result_id is null
        then null else result_value.result_revision end,
      'result_fingerprint', case when result_value.result_id is null
        then null else result_value.payload_hash end,
      'revision', revision_value
    )
  );
end;
$annual_calcutta_inspect$;

revoke all on function public.future_production_inspect_calcutta_v1(jsonb)
  from public, anon, authenticated, service_role;

-- The existing result projector is a strict allowlist and contains all V1
-- monetary semantics. Preserve it under a frozen name and change only the
-- output year to the already-validated engine year. For 2026 this is exactly
-- 2026; annual reads no longer mislabel a future result as 2026.
alter function production_control.project_production_calcutta_v1_result(jsonb)
  rename to project_production_calcutta_v1_result_frozen_2026_v1;

create function production_control.project_production_calcutta_v1_result(
  engine_payload jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $pointer_aware_calcutta_projection$
  select pg_catalog.jsonb_set(
    production_control
      .project_production_calcutta_v1_result_frozen_2026_v1(engine_payload),
    '{year}', pg_catalog.to_jsonb((engine_payload->>'year')::integer), false
  )
$pointer_aware_calcutta_projection$;

revoke all on function
  production_control.project_production_calcutta_v1_result(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function production_control
  .project_production_calcutta_v1_result_frozen_2026_v1(jsonb)
  from public, anon, authenticated, service_role;

-- Derive invalidation from the affected canonical row. A future tournament
-- can enqueue only when it is the exact active pointer/runtime generation.
-- The 2026 branch retains its old behavior while pointer=2026 and becomes
-- inert after the pointer advances, preventing predecessor side-game work.
create or replace function scoring_authority.enqueue_production_calcutta_v1_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $pointer_aware_calcutta_invalidation$
declare
  row_payload jsonb := case when tg_op = 'DELETE'
    then pg_catalog.to_jsonb(old) else pg_catalog.to_jsonb(new) end;
  target_tournament text;
  target_match_id text;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
begin
  if tg_table_name in ('rounds', 'matches') then
    target_tournament := row_payload->>'tournament_id';
  else
    target_match_id := row_payload->>'match_id';
    select match_value.tournament_id into target_tournament
    from scoring_authority.matches match_value
    where match_value.match_id = target_match_id;
  end if;
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if target_tournament is null
     or target_tournament is distinct from pointer.tournament_id then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select value.* into current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = target_tournament;
  if not found or current_value.state = 'NOT_CONFIGURED'
     or current_value.auction_revision = 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or resource.scoring_authority <> 'SUPABASE'
     or resource.current_tournament_read_authority <> 'SUPABASE' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if target_tournament = '2026' then
    if resource.current_tournament_id <> '2026' then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    perform production_control.enqueue_production_calcutta_v1(
      case
        when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'
        when tg_table_name = 'rounds'
          then 'CANONICAL_ROUND_LIFECYCLE_CHANGED'
        else 'CANONICAL_MATCH_LIFECYCLE_CHANGED'
      end,
      'production-calcutta-v1-trigger', false, null, null
    );
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select value.* into generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_tournament
    and value.generation_status = 'ACTIVE'
    and value.pointer_revision = pointer.pointer_revision;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  perform production_control.enqueue_annual_calcutta_v1(
    target_tournament, generation.runtime_generation_id,
    activation.activation_revision,
    case
      when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'
      when tg_table_name = 'rounds'
        then 'CANONICAL_ROUND_LIFECYCLE_CHANGED'
      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED'
    end,
    'production-calcutta-v1-trigger', false, null, null
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$pointer_aware_calcutta_invalidation$;

create function public.resolve_production_calcutta_postcommit_match_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $calcutta_postcommit_match$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  target_match text := pg_catalog.btrim(coalesce(input->>'match_id', ''));
  target_tournament text;
begin
  if target_match = '' or pg_catalog.length(target_match) > 120 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_MATCH_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.tournament_id into strict target_tournament
  from scoring_authority.matches value
  where value.match_id = target_match;
  if pointer.tournament_id <> '2026'
     or target_tournament <> '2026' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_MATCH_TOURNAMENT_MISMATCH';
  end if;
  perform production_control.assert_production_calcutta_v1_runtime(input);
  return pg_catalog.jsonb_build_object(
    'ok', true, 'tournament_id', target_tournament,
    'match_id', target_match, 'runtime_generation_id', null,
    'pointer_revision', pointer.pointer_revision
  );
exception
  when no_data_found then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_MATCH_TOURNAMENT_MISMATCH';
end;
$calcutta_postcommit_match$;

revoke all on function
  public.resolve_production_calcutta_postcommit_match_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.resolve_production_calcutta_postcommit_match_v1(jsonb)
  to service_role;

create function public.future_production_resolve_calcutta_postcommit_match_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $future_calcutta_postcommit_match$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  target_match text := pg_catalog.btrim(coalesce(input->>'match_id', ''));
  target_tournament text;
begin
  if target_match = '' or pg_catalog.length(target_match) > 120 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_MATCH_REQUIRED';
  end if;
  target_tournament := production_control.assert_annual_calcutta_runtime_v1(
    input, 'resolve_production_calcutta_postcommit_match_v1'
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.tournament_id into strict target_tournament
  from scoring_authority.matches value
  where value.match_id = target_match
    and value.tournament_id = target_tournament;
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_tournament
    and value.generation_status = 'ACTIVE';
  return pg_catalog.jsonb_build_object(
    'ok', true, 'tournament_id', target_tournament,
    'match_id', target_match,
    'runtime_generation_id', generation.runtime_generation_id,
    'pointer_revision', pointer.pointer_revision
  );
exception
  when no_data_found then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_MATCH_TOURNAMENT_MISMATCH';
end;
$future_calcutta_postcommit_match$;

revoke all on function
  public.future_production_resolve_calcutta_postcommit_match_v1(jsonb)
  from public, anon, authenticated, service_role;

-- No row/data mutation has occurred above. The only current-state assertion
-- below makes installation fail closed if a migration accidentally touched
-- the established 2026 control row.
do $annual_calcutta_inert_install$
begin
  if not exists (
       select 1 from production_control.current_tournament_pointer_v1 value
       where value.scope_key = 'BAGGER_INV_PRODUCTION'
         and value.tournament_id = '2026'
     )
     or exists (
       select 1 from scoring_authority.calcutta_v1_current value
       where value.tournament_id <> '2026'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_CALCUTTA_INSTALL_NOT_INERT';
  end if;
end;
$annual_calcutta_inert_install$;

notify pgrst, 'reload schema';
commit;
