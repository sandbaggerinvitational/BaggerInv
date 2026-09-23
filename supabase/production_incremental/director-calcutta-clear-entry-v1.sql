-- Additive Director-only single-entry clear. No data changes during installation.
begin;
create or replace function public.clear_production_calcutta_v1_auction_entry(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  manifest_value jsonb;
  predecessor_manifest jsonb;
  target_player text := pg_catalog.btrim(coalesce(input->>'player_id', ''));
  remaining_purchases jsonb;
  remaining_ownership jsonb;
  pot_value numeric;
  auction_fingerprint_value text;
  resource_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  payload_hash_value text := production_control.calcutta_v1_hash(input);
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_production_calcutta_v1_runtime(input);
  if input->>'contract_version' is distinct from 'production-calcutta-v1'
     or input->>'expected_tournament_id' is distinct from '2026'
     or (select tournament_id from production_control.current_tournament_pointer_v1
         where scope_key='BAGGER_INV_PRODUCTION') is distinct from '2026' then
    raise exception using errcode='42501', message='PRODUCTION_CALCUTTA_CLEAR_SCOPE_DENIED';
  end if;
  perform production_control.assert_production_scoring_actor(input, true);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_CLEAR_ENTRY', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
  end if;

  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;

  -- Recheck after acquiring the same canonical locks used by Save/Publish.
  -- Concurrent retries must return the original receipt, not create revisions.
  existing_response := production_control.lookup_cutover_receipt('CALCUTTA_V1_CLEAR_ENTRY', input);
  if existing_response is not null then return existing_response; end if;
  if current_value.publication_state <> 'UNPUBLISHED' then
    raise exception using errcode='55000', message='PRODUCTION_CALCUTTA_CLEAR_PUBLISHED_DENIED';
  end if;
  if current_value.result_revision <> 0
     or exists(select 1 from scoring_authority.calcutta_v1_result_revisions
       where tournament_id='2026' and (is_current or auction_revision_id=current_value.auction_revision_id))
     or exists(select 1 from scoring_authority.calcutta_v1_recalculation_jobs
       where tournament_id='2026' and status in ('PENDING','RUNNING')) then
    raise exception using errcode='55000', message='PRODUCTION_CALCUTTA_CLEAR_RESULT_DEPENDENCY';
  end if;
  if not exists(select 1 from scoring_authority.tournament_players
      where tournament_id='2026' and player_id=target_player and participation_status='ACTIVE') then
    raise exception using errcode='22023', message='PRODUCTION_CALCUTTA_CLEAR_PLAYER_DENIED';
  end if;
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

  select auction_manifest into strict predecessor_manifest
  from scoring_authority.calcutta_v1_auction_fact_revisions
  where auction_revision_id=current_value.auction_revision_id and tournament_id='2026';
  if not exists(select 1 from jsonb_array_elements(predecessor_manifest->'purchases') p
      where p->>'player_id'=target_player) then
    raise exception using errcode='55000', message='PRODUCTION_CALCUTTA_ENTRY_NOT_ENTERED';
  end if;
  select coalesce(jsonb_agg(p order by p->>'player_id'),'[]'::jsonb),
         coalesce(sum((p->>'purchase_price')::numeric),0)
    into remaining_purchases,pot_value
    from jsonb_array_elements(predecessor_manifest->'purchases') p where p->>'player_id'<>target_player;
  select coalesce(jsonb_agg(o order by o->>'player_id',o->>'owner_player_id'),'[]'::jsonb)
    into remaining_ownership
    from jsonb_array_elements(predecessor_manifest->'ownership') o where o->>'player_id'<>target_player;
  -- Derive exclusively from locked canonical facts; the client cannot replace another entry.
  manifest_value := predecessor_manifest || jsonb_build_object(
    'purchases',remaining_purchases,'ownership',remaining_ownership,'pot',pot_value);
  if jsonb_array_length(remaining_purchases)>0 then
    manifest_value := production_control.build_production_calcutta_v1_auction(manifest_value);
  elsif remaining_ownership <> '[]'::jsonb then
    raise exception using errcode='55000', message='PRODUCTION_CALCUTTA_CLEAR_ORPHAN_OWNERSHIP';
  end if;
  auction_fingerprint_value := production_control.calcutta_v1_hash(
    manifest_value
  );
  resource_fingerprint_value := production_control.calcutta_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id,
      'vercel_project_id', input->>'vercel_project_id',
      'vercel_team_id', input->>'vercel_team_id',
      'vercel_environment', 'production',
      'deployment_commit', activation.expected_deployment_commit,
      'authority_epoch_id', activation.authority_generation_id,
      'activation_revision', activation.activation_revision
    )
  );

  insert into scoring_authority.calcutta_v1_auction_fact_revisions (
    tournament_id, auction_revision, state, auction_manifest,
    auction_fingerprint, resource_fingerprint, activation_revision,
    authority_epoch_id, recorded_by_player_id, recorded_by_auth_user_id,
    request_fingerprint, request_payload_hash, recorded_at
  ) values (
    '2026', current_value.auction_revision + 1, 'AUCTION_COMPLETE',
    manifest_value, auction_fingerprint_value, resource_fingerprint_value,
    activation.activation_revision, activation.authority_generation_id,
    actor_player, actor_auth_user, request_fingerprint_value,
    payload_hash_value, pg_catalog.now()
  ) returning * into auction_value;

  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    '2026', current_value.publication_revision + 1,
    current_value.configuration_revision, auction_value.auction_revision,
    current_value.configuration_fingerprint, auction_fingerprint_value,
    'UNPUBLISHED', 'AUCTION_REPLACED', actor_player, actor_auth_user,
    production_control.calcutta_v1_hash(pg_catalog.jsonb_build_object(
      'operation', 'AUCTION_REPLACED',
      'request_fingerprint', request_fingerprint_value
    )), payload_hash_value, null
  ) returning * into publication_value;

  update scoring_authority.calcutta_v1_current
  set auction_revision_id = auction_value.auction_revision_id,
      auction_revision = auction_value.auction_revision,
      auction_fingerprint = auction_fingerprint_value,
      publication_revision_id = publication_value.publication_revision_id,
      publication_revision = publication_value.publication_revision,
      publication_state = 'UNPUBLISHED', state = 'AUCTION_COMPLETE',
      result_revision = 0, updated_at = pg_catalog.now()
  where tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_ENTRY_CLEARED', actor_player,
    pg_catalog.jsonb_build_object(
      'cleared_player_id', target_player,
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', auction_value.auction_revision,
      'auction_fingerprint', auction_fingerprint_value,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED',
      'prior_auction_revision', current_value.auction_revision,
      'purchase_count', pg_catalog.jsonb_array_length(
        manifest_value->'purchases'
      ),
      'ownership_count', pg_catalog.jsonb_array_length(
        manifest_value->'ownership'
      ),
      'pot', manifest_value->>'pot',
      'currency_code', 'USD',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_ENTRY_CLEARED', 'CALCUTTA', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'cleared_player_id', target_player,
      'prior_auction_revision', current_value.auction_revision,
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', auction_value.auction_revision,
      'auction_fingerprint', auction_fingerprint_value,
      'publication_revision', publication_value.publication_revision,
      'publication_state', 'UNPUBLISHED'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_ENTRY_CLEARED',
    'state', 'AUCTION_COMPLETE',
    'cleared_player_id', target_player,
    'publication_state', 'UNPUBLISHED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', auction_value.auction_revision,
    'auction_fingerprint', auction_fingerprint_value,
    'publication_revision', publication_value.publication_revision,
    'currency_code', 'USD',
    'pot', manifest_value->>'pot',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_CLEAR_ENTRY', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.clear_production_calcutta_v1_auction_entry(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.clear_production_calcutta_v1_auction_entry(jsonb)
  to service_role;


-- A last-entry clear creates the only supported empty, nonzero auction revision.
-- Do not let legacy Publish/Enqueue mistake that revision for entered facts.
create function production_control.assert_calcutta_nonempty_revision_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare facts jsonb;
begin
  if TG_TABLE_NAME='calcutta_v1_publication_revisions' then
    if NEW.publication_state <> 'PUBLISHED' then return NEW; end if;
  end if;
  select auction_manifest into facts from scoring_authority.calcutta_v1_auction_fact_revisions
    where tournament_id=NEW.tournament_id and auction_revision=NEW.auction_revision;
  if facts is null or jsonb_array_length(facts->'purchases')=0 then
    raise exception using errcode='55000', message='PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;
  return NEW;
end; $$;
revoke all on function production_control.assert_calcutta_nonempty_revision_v1() from public,anon,authenticated,service_role;
create trigger calcutta_publication_requires_entries_v1 before insert on scoring_authority.calcutta_v1_publication_revisions
for each row execute function production_control.assert_calcutta_nonempty_revision_v1();
create trigger calcutta_job_requires_entries_v1 before insert on scoring_authority.calcutta_v1_recalculation_jobs
for each row execute function production_control.assert_calcutta_nonempty_revision_v1();

commit;
