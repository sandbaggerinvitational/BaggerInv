-- Exact reviewed forward correction after bagger-canonical-bootstrap-v1.
-- No data, receipt, registration, grant, policy, provider or trigger change.
-- Historical installer remains immutable. Apply this artifact transactionally,
-- only after separately authorized target/owner/disabled-state preflight.
\set ON_ERROR_STOP on
begin;
do $preflight$
declare fn pg_catalog.pg_proc%rowtype; body_hash text;
begin
  select * into strict fn from pg_catalog.pg_proc
    where oid = 'scoring_authority.enqueue_production_calcutta_v1_change()'::regprocedure;
  if current_user <> pg_get_userbyid(fn.proowner)
     or pg_get_userbyid(fn.proowner) <> 'postgres'
     or fn.proacl::text[] is distinct from array['postgres=X/postgres']
     or not fn.prosecdef or fn.proconfig is distinct from array['search_path=pg_catalog'] then
    raise exception using errcode='42501', message='CALCUTTA_DEMAND_CORRECTION_OWNER_CATALOG_REQUIRED';
  end if;
  body_hash := encode(extensions.digest(fn.prosrc,'sha256'),'hex');
  if body_hash not in ('07a51a1f523c27c5410427e83f72e5dea581a5db8e9605e28eb7f02fb9a35aaa','1450d4944fed0d68e5604c6cca06a347dddfdc05a0e9a9926d2c25bf780aab0c') then
    raise exception using errcode='55000', message='CALCUTTA_DEMAND_CORRECTION_PREDECESSOR_MISMATCH';
  end if;
end;
$preflight$;

CREATE OR REPLACE FUNCTION scoring_authority.enqueue_production_calcutta_v1_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  row_payload jsonb := case when tg_op = 'DELETE'
    then pg_catalog.to_jsonb(old) else pg_catalog.to_jsonb(new) end;
  target_tournament text;
  target_match_id text;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.calcutta_v1_current%rowtype;
  auction_manifest_value jsonb;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  resource_context jsonb;
  handling_activation_revision bigint;
begin
  if tg_table_name = 'matches' and tg_op = 'UPDATE' and exists (select 1 from production_control.late_r3_transactions_v1 where transaction_id=txid_current() and (to_jsonb(new)->>'match_id')=any(eligible_matches)) then
    if (to_jsonb(old)-array['match_revision','permission_revision','scoring_snapshot_id','updated_at','authority_updated_at']) is distinct from (to_jsonb(new)-array['match_revision','permission_revision','scoring_snapshot_id','updated_at','authority_updated_at']) then raise exception 'TOURNAMENT_SETUP_LIFECYCLE_TRIGGER_CHANGE_BLOCKED'; end if;
    return new;
  end if;
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
  where value.scope_key = production_control.canonical_execution_resource_id_v1();
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
  if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION') then
    resource_context:=production_control.current_canonical_resource_context_v1();
    if target_tournament is distinct from resource_context->>'current_tournament_id' then
      return case when tg_op='DELETE' then old else new end;
    end if;
    handling_activation_revision:=(resource_context->>'activation_revision')::bigint;
  else
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
    handling_activation_revision:=activation.activation_revision;
  end if;
  -- A supported last-entry clear retains a nonzero immutable revision, but
  -- supplies no financial facts to calculate. Revision existence is not demand.
  -- Check the complete current immutable identity before recognizing emptiness;
  -- a missing/stale/malformed auction must never become a silent skip.
  select value.auction_manifest into auction_manifest_value
  from scoring_authority.calcutta_v1_auction_fact_revisions value
  where value.auction_revision_id = current_value.auction_revision_id
    and value.tournament_id = target_tournament
    and value.auction_revision = current_value.auction_revision
    and value.auction_fingerprint = current_value.auction_fingerprint
    and value.auction_fingerprint = production_control.calcutta_v1_hash(value.auction_manifest);
  if not found then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';
  end if;
  if jsonb_typeof(auction_manifest_value->'purchases') is distinct from 'array'
     or jsonb_typeof(auction_manifest_value->'ownership') is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
  end if;
  if jsonb_array_length(auction_manifest_value->'purchases') = 0 then
    if auction_manifest_value is distinct from jsonb_build_object(
      'contract_version', 'production-calcutta-v1', 'state', 'AUCTION_COMPLETE',
      'auction_unit', 'PLAYER', 'entry_workflow', 'MANUAL_FINAL_AUCTION_FACTS',
      'currency_code', 'USD', 'tournament_id', target_tournament,
      'purchases', '[]'::jsonb, 'ownership', '[]'::jsonb, 'pot', 0)
       or current_value.state <> 'AUCTION_COMPLETE'
       or current_value.publication_state <> 'UNPUBLISHED'
       or current_value.result_revision <> 0
       or not exists (
         select 1 from scoring_authority.calcutta_v1_configuration_revisions value
         where value.configuration_revision_id = current_value.configuration_revision_id
           and value.tournament_id = target_tournament
           and value.configuration_revision = current_value.configuration_revision
           and value.configuration_fingerprint = current_value.configuration_fingerprint
           and value.configuration_fingerprint = production_control.calcutta_v1_hash(value.configuration_manifest)) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_CALCUTTA_AUCTION_INPUT_INVALID';
    end if;
    -- No direct job and no durable CALCUTTA intent. Explicit publish/enqueue
    -- guards remain unchanged and continue rejecting an auction without facts.
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if target_tournament = '2026' then
    if resource_context is null and resource.current_tournament_id <> '2026' then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (
      select 1 from scoring_authority.score_derived_intents_v1 intent
      where intent.tournament_id = target_tournament
        and intent.match_id = row_payload->>'match_id'
        and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then
    perform production_control.append_score_derived_intent_v1(
      target_tournament, coalesce(row_payload->>'match_id', 'ROUND:' || (row_payload->>'round_number')),
      coalesce((row_payload->>'round_number')::integer, (select round_number from scoring_authority.matches where match_id = target_match_id)),
      'CALCUTTA', case when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'
        when tg_table_name = 'rounds' then 'CANONICAL_ROUND_LIFECYCLE_CHANGED' else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,
      jsonb_strip_nulls(jsonb_build_object('matchRevision', row_payload->'match_revision',
        'holeNumber', row_payload->'hole_number', 'holeRevision', row_payload->'hole_revision',
        'mutationKey', row_payload->'mutation_key')), null
    );
    else
    perform production_control.enqueue_production_calcutta_v1(
      case
        when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'
        when tg_table_name = 'rounds'
          then 'CANONICAL_ROUND_LIFECYCLE_CHANGED'
        else 'CANONICAL_MATCH_LIFECYCLE_CHANGED'
      end,
      'production-calcutta-v1-trigger', false, null, null
    );
    end if;
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
    if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (
      select 1 from scoring_authority.score_derived_intents_v1 intent
      where intent.tournament_id = target_tournament
        and intent.match_id = row_payload->>'match_id'
        and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then
  perform production_control.append_score_derived_intent_v1(
      target_tournament, coalesce(row_payload->>'match_id', 'ROUND:' || (row_payload->>'round_number')),
      coalesce((row_payload->>'round_number')::integer, (select round_number from scoring_authority.matches where match_id = target_match_id)),
      'CALCUTTA', case when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'
        when tg_table_name = 'rounds' then 'CANONICAL_ROUND_LIFECYCLE_CHANGED' else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,
      jsonb_strip_nulls(jsonb_build_object('matchRevision', row_payload->'match_revision',
        'holeNumber', row_payload->'hole_number', 'holeRevision', row_payload->'hole_revision',
        'mutationKey', row_payload->'mutation_key')), generation.runtime_generation_id
    );
    else
  perform production_control.enqueue_annual_calcutta_v1(
    target_tournament, generation.runtime_generation_id,
    handling_activation_revision,
    case
      when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'
      when tg_table_name = 'rounds'
        then 'CANONICAL_ROUND_LIFECYCLE_CHANGED'
      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED'
    end,
    'production-calcutta-v1-trigger', false, null, null
  );
    end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $postflight$
begin
  if (select encode(extensions.digest(prosrc,'sha256'),'hex') from pg_catalog.pg_proc
      where oid='scoring_authority.enqueue_production_calcutta_v1_change()'::regprocedure)
     is distinct from '1450d4944fed0d68e5604c6cca06a347dddfdc05a0e9a9926d2c25bf780aab0c' then
    raise exception 'CALCUTTA_DEMAND_CORRECTION_SUCCESSOR_MISMATCH';
  end if;
end;
$postflight$;
commit;
