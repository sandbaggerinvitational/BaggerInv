-- Certification downstream authority/recovery corrections after136 focused gate.
-- CLI scaffold20260930190618_certification_domain_resource_recovery_v1;
-- mapped to repository forward ordinal137. No hosted resource changes.
begin;

-- Rich internal resource metadata, never a client-selected execution context.
create function production_control.current_canonical_resource_context_v1()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype; c jsonb;
 s production_control.resource_scope%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;
 a production_control.cutover_activation_state%rowtype;
begin
 select * into strict r from production_control.canonical_resource_v1 where singleton;
 if r.resource_class='CERTIFICATION' then
  c:=production_control.current_certification_context_v1();
  if c->>'resource_id' is distinct from r.resource_id or r.database_name<>current_database() then
   raise exception using errcode='42501',message='CERTIFICATION_DOMAIN_CONTEXT_REQUIRED';end if;
  select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id;
  return c||jsonb_build_object('provenance_id',r.provenance_id,'installation_id',r.installation_id,
   'schema_digest',r.schema_digest,'manifest_digest',r.manifest_digest,'lifecycle_revision',p.lifecycle_revision);
 end if;
 -- Only explicit new callers use this rich Production projection. Unchanged
 -- Production triggers retain their original early-return queries below.
 select * into strict s from production_control.resource_scope where scope_key=r.resource_id;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=r.resource_id;
 select * into strict a from production_control.cutover_activation_state where scope_key=r.resource_id;
 return to_jsonb(s)||jsonb_build_object('resource_id',r.resource_id,'resource_class','PRODUCTION',
  'installation_id',r.installation_id,'provenance_id',r.provenance_id,'schema_digest',r.schema_digest,
  'manifest_digest',r.manifest_digest,'current_tournament_id',p.tournament_id,'tournament_id',p.tournament_id,
  'current_tournament_year',p.tournament_year,'pointer_revision',p.pointer_revision,'lifecycle_revision',p.lifecycle_revision,
  'governance_tournament_id',s.current_tournament_id,'activation_revision',a.activation_revision,
  'authority_epoch_id',a.authority_generation_id);
end;$$;
revoke all on function production_control.current_canonical_resource_context_v1() from public,anon,authenticated,service_role;

-- Historical receipt recovery is separate from fresh mutation admission. The
-- static registered resource and original actor are verified by136; this path
-- cannot push an executable context or invoke a mutation core.
create function production_control.read_certification_score_recovery_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare payload jsonb:=input->'payload'; original text; required_type text;
 l production_control.certification_ingress_leases_v1%rowtype;
 receipt scoring_authority.score_mutations%rowtype;
 recovery_input jsonb; director_read boolean:=input->>'operation_id'='SCORING.READ_DIRECTOR_OPERATION_STATUS';
begin
 if jsonb_typeof(payload) is distinct from 'object'
  or coalesce(payload->>'match_id','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
  or coalesce(payload->>'mutation_key','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  or payload->>'mutation_key' is distinct from input->>'operation_request_id'
  or exists(select 1 from jsonb_object_keys(payload) k where k not in('match_id','mutation_key','action','expected_match_revision')) then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED';end if;
 if director_read then
  if input->>'phase' is distinct from 'DIRECTOR' or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
   or payload->>'action' not in('finalize','reopen') or payload->>'action' is null then
   raise exception using errcode='42501',message='CERTIFICATION_OPERATION_RECOVERY_AUTHORIZATION_REQUIRED';end if;
  original:=case payload->>'action' when 'finalize' then 'SCORING.FINALIZE_MATCH' else 'SCORING.REOPEN_MATCH' end;
  required_type:=upper(payload->>'action');
 elsif input->>'operation_id'='SCORING.READ_MUTATION_STATUS' and input->>'phase'='READS' then
  original:='SCORING.SUBMIT_HOLE';required_type:='HOLE_SCORE';
 else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';end if;
 recovery_input:=input||jsonb_build_object('operation_id',original,'payload',jsonb_build_object('match_id',payload->>'match_id'));
 l:=production_control.certification_ingress_lookup_v1(recovery_input,false);
 if l.lease_id is not null and l.state='COMMITTED' and not coalesce((l.result->>'semantic_noop')::boolean,false) then
  select m.* into receipt from scoring_authority.score_mutations m
   join scoring_authority.matches mt using(match_id)
   where m.match_id=l.match_id and m.mutation_key=l.operation_request_id and mt.tournament_id=l.tournament_id
    and m.actor_id=l.actor_player_id and m.mutation_type=required_type
    and (director_read or m.originating_auth_user_id=l.actor_auth_user_id);
  if not found or receipt.result->>'ok' is distinct from 'true'
    or receipt.result->>'match_id' is distinct from l.match_id then
   raise exception using errcode='55000',message='CERTIFICATION_INGRESS_RECEIPT_CONTRADICTION';end if;
  if director_read then return jsonb_build_object('ok',true,'committed',true,'receipt',receipt.result||jsonb_build_object('idempotent',true));end if;
  if receipt.result->>'code' is distinct from 'ACCEPTED' then
   raise exception using errcode='55000',message='CERTIFICATION_INGRESS_RECEIPT_CONTRADICTION';end if;
  return jsonb_build_object('ok',true,'contract','score-mutation-recovery-v1','status','COMMITTED',
   'match_id',l.match_id,'mutation_key',l.operation_request_id,'result',receipt.result);
 end if;
 -- NOT_COMMITTED is an internal fenced ingress outcome. The established score
 -- recovery DTO remains conservative and does not acquire a new negative claim.
 if director_read then return jsonb_build_object('ok',true,'committed',false,'status','UNKNOWN');end if;
 return jsonb_build_object('ok',true,'contract','score-mutation-recovery-v1','status','UNKNOWN',
  'match_id',payload->>'match_id','mutation_key',payload->>'mutation_key');
end;$$;
revoke all on function production_control.read_certification_score_recovery_v1(jsonb) from public,anon,authenticated,service_role;

create function public.read_certification_director_recovery_material_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare l production_control.certification_ingress_leases_v1%rowtype; result jsonb;
begin
 if input->>'operation_id' not in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL',
   'DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')
  or input->>'operation_id' is null or input#>>'{authorization,role}' is distinct from 'DIRECTOR'
  or input->>'phase' is distinct from 'DIRECTOR' or jsonb_typeof(input->'payload') is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(input->'payload') k where k<>'match_id')
  or(input->>'operation_id'<>'DIRECTOR.MATCH_CONTROL' and input->'payload'<>'{}'::jsonb) then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_RECOVERY_AUTHORIZATION_REQUIRED';end if;
 l:=production_control.certification_ingress_lookup_v1(input,false);
 if l.lease_id is null then
  return jsonb_build_object('ok',true,'contract','certification-ingress-v1','state','UNKNOWN','lease_id',null,
   'operation_request_id',input->>'operation_request_id');end if;
 -- The136 reader independently checks terminal/canonical receipt consistency.
 result:=public.read_certification_ingress_status_v1(input);
 result:=result||jsonb_build_object('admission_context',l.admission_context);
 if l.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then
  if l.predecessor_auction_revision is null then
   raise exception using errcode='55000',message='CERTIFICATION_OPERATION_RECOVERY_PROVENANCE_REQUIRED';end if;
  result:=result||jsonb_build_object('predecessor_projection',production_control.director_calcutta_management_projection_v1(
   l.tournament_id,l.predecessor_auction_revision));
 end if;
 return result;
end;$$;
revoke all on function public.read_certification_director_recovery_material_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_certification_director_recovery_material_v1(jsonb) to service_role;

-- Original canonical trigger algorithms retained below class-specific resource seams.

do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.capture_first_production_canonical_write()'::regprocedure),'sha256'),'hex')<>'f1e84cb6948517384fa265904e74d2e666e128813a81bf86d2fff645ec0256b0' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: production_control.capture_first_production_canonical_write()'; end if;
end; $predecessor$;
CREATE OR REPLACE FUNCTION production_control.capture_first_production_canonical_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  target_tournament text;
  activation production_control.cutover_activation_state%rowtype;
  resource_context jsonb;
  ingress jsonb;
  required_receipt_type text;
begin
  if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION') then
    resource_context:=production_control.current_canonical_resource_context_v1();
    -- Actual same-transaction executable lease, not a stored terminal lease ID
    -- or a caller-controlled resource/context flag.
    ingress:=production_control.require_certification_ingress_execution_v1();
    select tournament_id into strict target_tournament
    from scoring_authority.matches where match_id=new.match_id;
    required_receipt_type:=case ingress->>'operation_id'
      when 'SCORING.SUBMIT_HOLE' then 'HOLE_SCORE'
      when 'SCORING.FINALIZE_MATCH' then 'FINALIZE'
      when 'SCORING.REOPEN_MATCH' then 'REOPEN'
      when 'DIRECTOR.MATCH_CONTROL' then case ingress->>'domain_action'
        when 'mark-live' then 'MARK_LIVE'
        when 'scoring-lock' then 'SCORING_LOCK'
        when 'scoring-unlock' then 'SCORING_UNLOCK'
        when 'access-activate' then 'ACCESS_ACTIVATE'
        when 'access-revoke' then 'ACCESS_REVOKE'
      end
    end;
    if ingress->>'resource_id' is distinct from resource_context->>'resource_id'
      or ingress->>'authority_epoch_id' is distinct from resource_context->>'authority_epoch_id'
      or ingress->>'tournament_id' is distinct from target_tournament
      or ingress->>'match_id' is distinct from new.match_id
      or ingress->>'operation_request_id' is distinct from new.mutation_key
      or ingress->>'actor_player_id' is distinct from new.actor_id
      or required_receipt_type is null
      or new.mutation_type is distinct from required_receipt_type
      or new.result->>'ok' is distinct from 'true' then
      raise exception using errcode='42501',message='CERTIFICATION_RECEIPT_INGRESS_MISMATCH';
    end if;
    -- Receipt plus domain audit and gateway outcome remain atomic. Certification
    -- never updates or invents the Production first-write rollback latch.
    return new;
  end if;
  select tournament_id into target_tournament
  from scoring_authority.matches
  where match_id = new.match_id;
  if target_tournament <> '2026' then return new; end if;

  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or not activation.scoring_ingress_enabled
     or not exists (
       select 1 from scoring_authority.ingress_gates gate
       where gate.tournament_id = '2026'
         and gate.state = 'OPEN'
         and gate.authority = 'SUPABASE'
         and gate.active_epoch_id = activation.authority_generation_id
     ) then
    return new;
  end if;

  update production_control.cutover_activation_state
  set first_supabase_write_observed_at = now(),
      first_supabase_mutation_key = new.mutation_key,
      first_supabase_match_id = new.match_id,
      first_supabase_match_revision = new.next_match_revision,
      updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and first_supabase_write_observed_at is null;
  if found then
    insert into production_control.operation_audit_events (
      event_type, domain, tournament_id, actor, request_fingerprint, result, details
    ) values (
      'FIRST_SUPABASE_CANONICAL_WRITE_OBSERVED', 'SCORING_AUTHORITY', '2026',
      left(new.actor_id, 160), null, 'SUCCEEDED',
      jsonb_build_object(
        'epoch_id', activation.authority_generation_id,
        'mutation_key', new.mutation_key,
        'match_id', new.match_id,
        'match_revision', new.next_match_revision
      )
    );
  end if;
  return new;
end;
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='scoring_authority.enqueue_annual_derived_v1_change()'::regprocedure),'sha256'),'hex')<>'fed9fc91630fc7ee79a8b31b930514d6279bafc20109b2cfacedcf4e98d209f9' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: scoring_authority.enqueue_annual_derived_v1_change()'; end if;
end; $predecessor$;
CREATE OR REPLACE FUNCTION scoring_authority.enqueue_annual_derived_v1_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  target_match text;
  target_tournament text;
  current_tournament text;
  runtime_generation uuid;
  reason_value text;
  revision_value jsonb;
  engine_values text[];
  engine_value text;
begin
  if tg_table_schema <> 'scoring_authority'
     or tg_table_name not in (
       'hole_scores', 'matches', 'odds_published_snapshots',
       'net_skins_v1_result_revisions'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_DERIVED_TRIGGER_SCOPE_INVALID';
  end if;
  if tg_table_name = 'hole_scores' then
    target_match := case when tg_op = 'DELETE'
      then old.match_id else new.match_id end;
    select value.tournament_id into target_tournament
    from scoring_authority.matches value
    where value.match_id = target_match;
    reason_value := 'CANONICAL_HOLE_SCORE_CHANGED';
    revision_value := pg_catalog.jsonb_build_object(
      'matchId', target_match,
      'holeNumber', case when tg_op = 'DELETE'
        then old.hole_number else new.hole_number end,
      'holeRevision', case when tg_op = 'DELETE'
        then old.hole_revision else new.hole_revision end
    );
    engine_values := array[
      'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES',
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ]::text[];
  elsif tg_table_name = 'matches' then
    target_match := new.match_id;
    target_tournament := new.tournament_id;
    reason_value := 'CANONICAL_MATCH_CHANGED';
    revision_value := pg_catalog.jsonb_build_object(
      'matchId', target_match,
      'matchRevision', new.match_revision,
      'status', new.status,
      'resultWinner', new.result_winner,
      'scorecardComplete', new.scorecard_complete
    );
    engine_values := array[
      'TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES',
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ]::text[];
  elsif tg_table_name = 'odds_published_snapshots' then
    target_tournament := new.tournament_id;
    reason_value := 'OFFICIAL_ODDS_PUBLICATION_CHANGED';
    revision_value := pg_catalog.jsonb_build_object(
      'publicationRevision', new.publication_revision,
      'payloadHash', new.payload_hash,
      'isCurrentOfficial', new.is_current_official
    );
    engine_values := array[
      'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL',
      'TOURNAMENT_FINAL_RECAP'
    ]::text[];
  else
    if new.is_current is not true then
      return new;
    end if;
    target_tournament := new.tournament_id;
    reason_value := 'NET_SKINS_CURRENT_RESULT_CHANGED';
    revision_value := pg_catalog.jsonb_build_object(
      'roundNumber', new.round_number,
      'resultRevision', new.result_revision,
      'payloadHash', new.payload_hash,
      'isCurrent', new.is_current
    );
    engine_values := array['TOURNAMENT_STORYLINES']::text[];
  end if;
  if target_tournament is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_DERIVED_TRIGGER_TOURNAMENT_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.tournament_id into strict current_tournament
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = production_control.canonical_execution_resource_id_v1();
  -- Setup and historical corrections for a non-current tournament do not
  -- create current-runtime work. Their own activation preparation owns their
  -- future generation and readiness markers.
  if target_tournament <> current_tournament then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if target_tournament = '2026' then
    if not exists (
      select 1 from scoring_authority.ingress_gates value
      where value.tournament_id = '2026' and value.state = 'OPEN'
        and value.authority = 'SUPABASE'
    ) then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_DERIVED_ADMISSION_CLOSED';
    end if;
  else
    select value.runtime_generation_id into runtime_generation
    from production_control.annual_scoring_runtime_authorities_v1 value
    where value.tournament_id = target_tournament
      and value.authority_status = 'ACTIVE'
      and value.admission_state = 'OPEN';
    if runtime_generation is null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_ANNUAL_DERIVED_RUNTIME_REQUIRED';
    end if;
  end if;

  if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (
    select 1 from scoring_authority.score_derived_intents_v1 intent
    where intent.tournament_id = target_tournament and intent.match_id = target_match
      and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then
    perform production_control.append_score_derived_intent_v1(
      target_tournament, target_match,
      (select round_number from scoring_authority.matches where match_id = target_match),
      'COMPETITION', reason_value, revision_value || jsonb_strip_nulls(jsonb_build_object(
        'mutationKey', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'mutation_key' else null end)), runtime_generation
    );
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  foreach engine_value in array engine_values loop
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status,
      requested_source_revision, requested_at, started_at, completed_at,
      last_error_code, last_error_safe, runtime_generation_id,
      claim_token, claimed_by, lease_expires_at, updated_at
    ) values (
      target_tournament, 0, engine_value, 'PENDING',
      pg_catalog.jsonb_build_object(
        'reason', reason_value, 'revision', revision_value,
        'transactional', true
      ), pg_catalog.clock_timestamp(), null, null, null, null,
      runtime_generation, null, null, null, pg_catalog.clock_timestamp()
    ) on conflict (tournament_id, round_number, engine_key) do update set
      status = 'PENDING',
      requested_source_revision = excluded.requested_source_revision,
      requested_at = excluded.requested_at,
      started_at = null, completed_at = null,
      last_error_code = null, last_error_safe = null,
      runtime_generation_id = excluded.runtime_generation_id,
      claim_token = null, claimed_by = null, lease_expires_at = null,
      updated_at = excluded.updated_at;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='scoring_authority.enqueue_production_calcutta_v1_change()'::regprocedure),'sha256'),'hex')<>'638e8f2a0d5b1570c928520e124bc1f23754c76f20d9802cd3b23ed9d73c5fa8' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: scoring_authority.enqueue_production_calcutta_v1_change()'; end if;
end; $predecessor$;
CREATE OR REPLACE FUNCTION scoring_authority.enqueue_production_calcutta_v1_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='scoring_authority.enqueue_production_net_skins_v1_change()'::regprocedure),'sha256'),'hex')<>'54f160d0007ca16e62c0edc355f672857508100ec7026ab3332bc07689f965df' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: scoring_authority.enqueue_production_net_skins_v1_change()'; end if;
end; $predecessor$;
CREATE OR REPLACE FUNCTION scoring_authority.enqueue_production_net_skins_v1_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  target_match_id text;
  match_value scoring_authority.matches%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  resource_context jsonb;
begin
  target_match_id := case when tg_op = 'DELETE'
    then old.match_id else new.match_id end;
  select value.* into match_value
  from scoring_authority.matches value
  where value.match_id = target_match_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select value.* into current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = match_value.tournament_id;
  if not found or current_value.state <> 'CONFIGURED' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION') then
    resource_context:=production_control.current_canonical_resource_context_v1();
    if match_value.tournament_id<>'2026'
      or match_value.tournament_id is distinct from resource_context->>'current_tournament_id' then
      return case when tg_op='DELETE' then old else new end;
    end if;
  else
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if match_value.tournament_id <> '2026'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'SUPABASE' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  end if;

  if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (
    select 1 from scoring_authority.score_derived_intents_v1 intent
    where intent.tournament_id = match_value.tournament_id
      and intent.match_id = target_match_id
      and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then
  if exists (select 1 from scoring_authority.net_skins_v1_configuration_revisions revision
    cross join lateral jsonb_array_elements(revision.configuration_manifest->'rounds') configured
    where revision.configuration_revision_id = current_value.configuration_revision_id
      and (configured->>'round_number')::integer = match_value.round_number) then
    perform production_control.append_score_derived_intent_v1(
      match_value.tournament_id, target_match_id, match_value.round_number, 'NET_SKINS',
      case when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED' else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,
      jsonb_strip_nulls(jsonb_build_object('matchRevision', match_value.match_revision,
        'holeNumber', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'hole_number' else null end,
        'holeRevision', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'hole_revision' else null end,
        'mutationKey', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'mutation_key' else null end)), null
    );
  end if;
  else
  perform production_control.enqueue_production_net_skins_v1_round(
    match_value.round_number,
    case when tg_table_name = 'hole_scores'
      then 'CANONICAL_SCORE_CHANGED'
      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,
    'production-net-skins-v1-trigger'
  );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
exception
  when sqlstate '22023' then
    return case when tg_op = 'DELETE' then old else new end;
end;
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='scoring_authority.enqueue_annual_net_skins_v1_change()'::regprocedure),'sha256'),'hex')<>'26af7d968bf12fa8a5145796e2ab21852642a91eaad27a53066f840ac062c6e0' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: scoring_authority.enqueue_annual_net_skins_v1_change()'; end if;
end; $predecessor$;
CREATE OR REPLACE FUNCTION scoring_authority.enqueue_annual_net_skins_v1_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  target_match_id text;
  match_value scoring_authority.matches%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
begin
  target_match_id := case when tg_op = 'DELETE'
    then old.match_id else new.match_id end;
  select value.* into match_value
  from scoring_authority.matches value
  where value.match_id = target_match_id;
  if not found or match_value.tournament_id = '2026' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select value.* into current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = match_value.tournament_id;
  if not found or current_value.state <> 'CONFIGURED' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = production_control.canonical_execution_resource_id_v1();
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = match_value.tournament_id
    and value.generation_status = 'ACTIVE';
  if pointer.tournament_id <> match_value.tournament_id
     or pointer.pointer_revision <> generation.pointer_revision then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_ANNUAL_NET_SKINS_RUNTIME_REQUIRED';
  end if;
  if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (
    select 1 from scoring_authority.score_derived_intents_v1 intent
    where intent.tournament_id = match_value.tournament_id
      and intent.match_id = target_match_id
      and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then
  if exists (select 1 from scoring_authority.net_skins_v1_configuration_revisions revision
    cross join lateral jsonb_array_elements(revision.configuration_manifest->'rounds') configured
    where revision.configuration_revision_id = current_value.configuration_revision_id
      and (configured->>'round_number')::integer = match_value.round_number) then
    perform production_control.append_score_derived_intent_v1(
      match_value.tournament_id, target_match_id, match_value.round_number, 'NET_SKINS',
      case when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED' else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,
      jsonb_strip_nulls(jsonb_build_object('matchRevision', match_value.match_revision,
        'holeNumber', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'hole_number' else null end,
        'holeRevision', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'hole_revision' else null end,
        'mutationKey', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'mutation_key' else null end)), generation.runtime_generation_id
    );
  end if;
  else
  perform production_control.enqueue_annual_net_skins_v1_round(
    match_value.tournament_id, generation.runtime_generation_id,
    match_value.round_number,
    case when tg_table_name = 'hole_scores'
      then 'CANONICAL_SCORE_CHANGED'
      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,
    'production-net-skins-v1-trigger'
  );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
exception
  when sqlstate '22023' then
    return case when tg_op = 'DELETE' then old else new end;
end;
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.lock_net_skins_storylines_v1(text,jsonb)'::regprocedure),'sha256'),'hex')<>'de20a06361a3ad68ae5d3c2de0e2a8f24c3a8029f5a8477cfb3766c8d763e358' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: production_control.lock_net_skins_storylines_v1(text,jsonb)'; end if;
end; $predecessor$;
CREATE OR REPLACE FUNCTION production_control.lock_net_skins_storylines_v1(target text, input jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare current_tournament text; generation_id uuid; job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
 result_revision_value bigint;
begin
 -- The caller already validated runtime, receipt replay and input shape. Repeat
 -- the result trigger's current-tournament/admission boundary before any write.
 perform pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key());
 select tournament_id into strict current_tournament from production_control.current_tournament_pointer_v1
 where scope_key=production_control.canonical_execution_resource_id_v1();
 if target<>current_tournament then return; end if;
 if target='2026' then
  if not exists(select 1 from scoring_authority.ingress_gates where tournament_id=target and state='OPEN' and authority='SUPABASE') then
   raise exception using errcode='55000',message='PRODUCTION_ANNUAL_DERIVED_ADMISSION_CLOSED';
  end if;
 else
  select runtime_generation_id into generation_id from production_control.annual_scoring_runtime_authorities_v1
  where tournament_id=target and authority_status='ACTIVE' and admission_state='OPEN';
  if generation_id is null then raise exception using errcode='55000',message='PRODUCTION_ANNUAL_DERIVED_RUNTIME_REQUIRED'; end if;
 end if;
 perform 1 from scoring_authority.competition_recalculation_jobs
 where tournament_id=target and round_number=0 and engine_key='TOURNAMENT_STORYLINES' for update;
 if found then return; end if;
 -- Read only: taking a job/config lock here would recreate the inverse order.
 -- Invalid identity leaves the original completion guards to reject unchanged.
 select j.* into job_value from scoring_authority.net_skins_v1_recalculation_jobs j
 join scoring_authority.net_skins_v1_configuration_current c on c.tournament_id=j.tournament_id
 where j.job_id=(input->>'job_id')::uuid and j.tournament_id=target and j.status='RUNNING'
  and j.claim_token=(input->>'claim_token')::uuid and j.claimed_by=btrim(input->>'worker_id')
  and j.lease_expires_at>case when target='2026' then now() else clock_timestamp() end
  and j.configuration_revision=c.configuration_revision and c.state='CONFIGURED'
  and c.configuration_revision=(input->>'expected_configuration_revision')::bigint
  and (target='2026' or (j.runtime_generation_id=generation_id and generation_id=(input->>'expected_runtime_generation_id')::uuid));
 if not found then return; end if;
 select coalesce(max(result_revision),0)+1 into result_revision_value
 from scoring_authority.net_skins_v1_result_revisions where tournament_id=target and round_number=job_value.round_number;
 insert into scoring_authority.competition_recalculation_jobs(
  tournament_id,round_number,engine_key,status,requested_source_revision,requested_at,
  started_at,completed_at,last_error_code,last_error_safe,runtime_generation_id,claim_token,claimed_by,lease_expires_at,updated_at)
 values(target,0,'TOURNAMENT_STORYLINES','PENDING',jsonb_build_object(
  'reason','NET_SKINS_CURRENT_RESULT_CHANGED','revision',jsonb_build_object('roundNumber',job_value.round_number,
   'resultRevision',result_revision_value,'payloadHash',production_control.net_skins_v1_hash(input->'result_payload'),'isCurrent',true),
  'transactional',true),clock_timestamp(),null,null,null,null,generation_id,null,null,null,clock_timestamp())
 on conflict(tournament_id,round_number,engine_key) do nothing;
 perform 1 from scoring_authority.competition_recalculation_jobs
 where tournament_id=target and round_number=0 and engine_key='TOURNAMENT_STORYLINES' for update;
end;
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.guard_future_unprepared_match_v1()'::regprocedure),'sha256'),'hex')<>'6d176058e9ee7e0fdbad7aa3823893f1fb533c36be5dab51f0bde47ac889de47' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: production_control.guard_future_unprepared_match_v1()'; end if;
end; $predecessor$;
CREATE OR REPLACE FUNCTION production_control.guard_future_unprepared_match_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  where value.scope_key = production_control.canonical_execution_resource_id_v1();
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
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.assert_certification_context_v1(jsonb,text,boolean)'::regprocedure),'sha256'),'hex')<>'b41804662fe6866020752eef53b12fae6261b09a646368d7f34bdd270c8455e6' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: production_control.assert_certification_context_v1(jsonb,text,boolean)';end if;
end;$predecessor$;
CREATE OR REPLACE FUNCTION production_control.assert_certification_context_v1(input jsonb, required_phase text, mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare resource production_control.canonical_resource_v1%rowtype;
  admission production_control.certification_admission_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  context jsonb; token text; operation_id text;
begin
  perform production_control.assert_production_service_role();
  if required_phase is null or required_phase not in('READS','SCORING','DIRECTOR','WORKERS','ANNUAL')
    or input->>'contract_version' is distinct from 'certification-runtime-v1'
    or input->>'phase' is distinct from required_phase
    or jsonb_typeof(input->'resource') is distinct from 'object'
    or input#>>'{resource,resource_class}' is distinct from 'CERTIFICATION'
    or jsonb_typeof(input->'deployment') is distinct from 'object' then
    raise exception using errcode='42501',message='CANONICAL_RESOURCE_CONTEXT_REQUIRED';
  end if;
  perform pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key());
  select * into strict resource from production_control.canonical_resource_v1 where singleton for share;
  if resource.resource_class<>'CERTIFICATION' or resource.database_name<>current_database()
    or exists(select 1 from production_control.resource_scope)
    or exists(select 1 from production_control.cutover_activation_state)
    or input#>>'{resource,resource_id}' is distinct from resource.resource_id
    or input#>>'{resource,installation_id}' is distinct from resource.installation_id::text
    or input#>>'{resource,project_ref}' is distinct from resource.project_ref
    or input#>>'{resource,project_url}' is distinct from resource.project_url then
    raise exception using errcode='42501',message='CANONICAL_RESOURCE_BINDING_DENIED';
  end if;
  if input#>>'{resource,schema_contract}' is distinct from resource.schema_contract
    or input#>>'{resource,schema_digest}' is distinct from resource.schema_digest then
    raise exception using errcode='55000',message='CANONICAL_RESOURCE_SCHEMA_UNAVAILABLE';
  end if;
  if input#>>'{resource,registration_revision}' is distinct from resource.registration_revision::text
    or input#>>'{resource,manifest_digest}' is distinct from resource.manifest_digest then
    raise exception using errcode='40001',message='CANONICAL_RESOURCE_REGISTRATION_STALE';
  end if;
  select * into strict admission from production_control.certification_admission_v1 where resource_id=resource.resource_id for share;
  if not admission.enabled or not required_phase=any(admission.capabilities)
    or input#>>'{deployment,vercel_team_id}' is distinct from resource.vercel_team_id
    or input#>>'{deployment,vercel_project_id}' is distinct from resource.vercel_project_id
    or input#>>'{deployment,git_branch}' is distinct from admission.git_branch
    or input#>>'{deployment,deployment_class}' is distinct from admission.deployment_class
    or input#>>'{deployment,release_commit}' is distinct from admission.release_commit
    or input#>>'{deployment,deployment_id}' is distinct from admission.deployment_id
    or input#>>'{deployment,deployment_origin}' is distinct from admission.deployment_origin then
    raise exception using errcode='42501',message='CANONICAL_RESOURCE_DEPLOYMENT_DENIED';
  end if;
  select * into strict pointer from production_control.current_tournament_pointer_v1 where scope_key=resource.resource_id for share;
  select * into strict gate from scoring_authority.ingress_gates where tournament_id=pointer.tournament_id for share;
  if gate.authority<>'SUPABASE'
    or gate.active_epoch_id is distinct from admission.authority_epoch_id
    or not exists(select 1 from scoring_authority.tournaments t where t.tournament_id=pointer.tournament_id
      and t.tournament_year=pointer.tournament_year and t.scoring_authority='SUPABASE')
    or not exists(select 1 from scoring_authority.authority_epochs e where e.epoch_id=admission.authority_epoch_id
      and e.status='COMMITTED' and e.authority_after='SUPABASE') then
    raise exception using errcode='55000',message='CANONICAL_RESOURCE_RUNTIME_UNAVAILABLE';
  end if;
  -- Reads/annual transitions must observe closed ingress safely; mutation
  -- domain/lifecycle guards remain independently enforced by their cores.
  if required_phase in('SCORING','DIRECTOR','WORKERS') and (gate.state<>'OPEN' or gate.unresolved_client_queues<>0) then
    raise exception using errcode='55000',message='CANONICAL_RESOURCE_INGRESS_CLOSED';
  end if;
  context:=jsonb_build_object(
    'resource_id',resource.resource_id,'resource_class',resource.resource_class,
    'installation_id',resource.installation_id,'project_ref',resource.project_ref,'project_url',resource.project_url,
    'registration_revision',resource.registration_revision,'manifest_digest',resource.manifest_digest,
    'schema_contract',resource.schema_contract,'schema_digest',resource.schema_digest,
    'binding_id',admission.binding_id,'current_tournament_id',pointer.tournament_id,'tournament_id',pointer.tournament_id,
    'current_tournament_year',pointer.tournament_year,'pointer_revision',pointer.pointer_revision,
    'governance_tournament_id',admission.governance_tournament_id,
    'authority_epoch_id',admission.authority_epoch_id,'activation_revision',admission.activation_revision,
    'admission_revision',admission.admission_revision,'release_commit',admission.release_commit,
    'vercel_team_id',resource.vercel_team_id,'vercel_project_id',resource.vercel_project_id,
    'git_branch',admission.git_branch,'deployment_class',admission.deployment_class,
    'deployment_id',admission.deployment_id,'deployment_origin',admission.deployment_origin);
  token:=production_control.tournament_setup_hash_v1(context);
  if (mutation or input ? 'expected_context_token') and input->>'expected_context_token' is distinct from token then
    raise exception using errcode='40001',message='CANONICAL_RESOURCE_CONTEXT_STALE';
  end if;
  if mutation then
    operation_id:=coalesce(input->>'operation_request_id',input->>'mutation_key');
    if operation_id is null then
      raise exception using errcode='22023',message='CANONICAL_RESOURCE_OPERATION_ID_REQUIRED';
    end if;
    if required_phase='SCORING' or (required_phase='DIRECTOR' and input->>'operation_id'='SCORING.REOPEN_MATCH') then
      if operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then
        raise exception using errcode='22023',message='CANONICAL_RESOURCE_OPERATION_ID_INVALID';
      end if;
    else
      perform operation_id::uuid;
    end if;
  end if;
  return context||jsonb_build_object('context_token',token,
    'resource_fingerprint',production_control.tournament_setup_hash_v1(to_jsonb(resource)-'created_at'),
    'phase',required_phase,'operation_request_id',operation_id,'authorization',input->'authorization',
    'actor_auth_user_id',input#>>'{authorization,auth_user_id}','actor_player_id',input#>>'{authorization,player_id}');
exception when no_data_found then
  raise exception using errcode='55000',message='CANONICAL_RESOURCE_NOT_INSTALLED';
when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='22023',message='CANONICAL_RESOURCE_INPUT_INVALID';
end;
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure),'sha256'),'hex')<>'0f3b7aafedb9e4569d18aacb06b64e6a5d489f810c9c5a27fa28a8c002654848' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)';end if;
end;$predecessor$;
CREATE OR REPLACE FUNCTION production_control.dispatch_certification_operation_v1(input jsonb, context jsonb, mutation boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;
 actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;
 status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');
begin
 if mutation and (operation_id like 'WORKERS.%' or operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED')) then
  return production_control.dispatch_certification_derived_operation_v1(input,context);
 end if;
 -- The marker is owner-only and revalidates registered resource/deployment,
 -- current pointer, admission revision and live ingress under transaction locks.
 perform production_control.assert_canonical_scoring_context_v1('{}'::jsonb,context,'RUNTIME');
 if jsonb_typeof(payload) is distinct from 'object' then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;
 if status_read and (coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  or coalesce(payload->>'original_context_token','') !~ '^[0-9a-f]{64}$') then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED'; end if;
 if payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',
  'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token',
  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',
  'admission_revision','governance_tournament_id'] or (payload ? 'player_id' and not coalesce(
   operation_id='DIRECTOR.CLEAR_CALCUTTA_AUCTION' or
   (operation_id='DIRECTOR.MUTATE_SETUP' and payload->>'action'='assign-roster-team'),false)) then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;
 if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')
  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')
  or (input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then
  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH'; end if;
 command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id',
  'expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');
 if mutation and operation_id like 'SCORING.%' and command->>'mutation_key' is distinct from input->>'operation_request_id' then
  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;
 if operation_id in('SCORING.REOPEN_MATCH') or operation_id like 'DIRECTOR.%' then
  perform production_control.assert_production_scoring_actor(command,true);
  actor_context:=context||jsonb_build_object('actor_player_id',input#>>'{authorization,player_id}',
   'actor_auth_user_id',input#>>'{authorization,auth_user_id}','authorization',input->'authorization',
   'operation_request_id',input->>'operation_request_id',
   'resource_fingerprint',production_control.cutover_payload_hash(input->'resource'));
 end if;
 case operation_id
 when 'SCORING.READ_AUTHORITY' then
  return production_control.canonical_read_scoring_authority_v2(command,context);
 when 'SCORING.READ_PARTICIPANT_CONTEXT' then
  return production_control.canonical_read_scoring_participant_context_v2(command||jsonb_build_object(
   'player_id',input#>>'{authorization,player_id}','auth_user_id',input#>>'{authorization,auth_user_id}',
   'role',input#>>'{authorization,role}'),context);
 when 'SCORING.READ_MUTATION_STATUS' then
  return production_control.read_score_mutation_status_v1(command,'2026');
 when 'SCORING.SUBMIT_HOLE' then
  return production_control.canonical_submit_hole_score_v2(command,context);
 when 'SCORING.FINALIZE_MATCH' then
  return production_control.canonical_finalize_match_v2(command,context);
 when 'SCORING.REOPEN_MATCH' then
  return production_control.canonical_reopen_match_v2(command,context);
 when 'DIRECTOR.READ_SETUP' then
  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:='read';
  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then
   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;
 when 'DIRECTOR.MUTATE_SETUP' then family:='TOURNAMENT_SETUP'; action:=payload->>'action';
 when 'DIRECTOR.SETUP_STATUS' then
  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:=payload->>'action';
  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS') then
   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;
 when 'DIRECTOR.MUTATE_PAIRINGS' then family:='ROUND_PAIRINGS'; action:='replace-round-pairings';
 when 'DIRECTOR.MATCH_CONTROL' then family:='MATCH_CONTROL'; action:=payload->>'action';
 when 'DIRECTOR.MATCH_CONTROL_STATUS' then family:='MATCH_CONTROL'; action:=payload->>'action';
 when 'DIRECTOR.READ_NET_SKINS' then family:='NET_SKINS_ENTRIES'; action:='read';
 when 'DIRECTOR.SAVE_NET_SKINS_ENTRIES' then family:='NET_SKINS_ENTRIES'; action:='save';
 when 'DIRECTOR.NET_SKINS_STATUS' then family:='NET_SKINS_ENTRIES'; action:='save';
 when 'DIRECTOR.READ_CALCUTTA' then family:='CALCUTTA_MANAGEMENT'; action:='read';
 when 'DIRECTOR.CALCUTTA_STATUS' then family:='CALCUTTA_MANAGEMENT'; action:=payload->>'action';
 when 'DIRECTOR.REPLACE_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='replace-auction';
 when 'DIRECTOR.CLEAR_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='clear-entry';
 else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';
 end case;
 dispatch_input:=input||jsonb_build_object('family',family,'action',action,'payload',payload-array['action','family','original_context_token']);
 if status_read then
  -- The original token is receipt-hash provenance only. The current outer
  -- context was freshly admitted and remains the sole execution authority.
  dispatch_input:=dispatch_input||jsonb_build_object('mode','status','expected_context_token',payload->>'original_context_token');
 end if;
 if family in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then
  return production_control.canonical_director_setup_operation_v2(dispatch_input,actor_context,mutation);
 end if;
 return production_control.canonical_director_financial_operation_v2(dispatch_input,actor_context,mutation);
end;
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.certification_operation_phase_v1(text,boolean)'::regprocedure),'sha256'),'hex')<>'5e2f83be8fc5f1b7d1c1512151be9f31a280f429c29c8074a61431fa34ee7a34' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: production_control.certification_operation_phase_v1(text,boolean)';end if;
end;$predecessor$;
CREATE OR REPLACE FUNCTION production_control.certification_operation_phase_v1(operation_id text, mutation boolean)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
 if mutation and operation_id in('WORKERS.DELIVERY_TICK','WORKERS.FAIL_PRECLAIM','WORKERS.COMPETITION_CLAIM','WORKERS.COMPETITION_WRITE','WORKERS.COMPETITION_FAIL','WORKERS.INTELLIGENCE_CLAIM','WORKERS.INTELLIGENCE_WRITE','WORKERS.INTELLIGENCE_FAIL','WORKERS.CALCUTTA_CLAIM','WORKERS.CALCUTTA_COMPLETE','WORKERS.CALCUTTA_FAIL') then return 'WORKERS'; end if;
 if mutation and operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED') then return 'DIRECTOR'; end if;
 if not mutation and operation_id in('SCORING.READ_AUTHORITY','SCORING.READ_PARTICIPANT_CONTEXT','SCORING.READ_MUTATION_STATUS') then return 'READS'; end if;
 if not mutation and operation_id in('SCORING.READ_DIRECTOR_OPERATION_STATUS','DIRECTOR.READ_SETUP','DIRECTOR.READ_NET_SKINS','DIRECTOR.READ_CALCUTTA',
  'DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS') then return 'DIRECTOR'; end if;
 if mutation and operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH') then return 'SCORING'; end if;
 if mutation and operation_id in('SCORING.REOPEN_MATCH','DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then return 'DIRECTOR'; end if;
 raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';
end;
$function$;


do $predecessor$ begin
 if encode(extensions.digest((select prosrc from pg_proc where oid='public.read_certification_operation_v1(jsonb)'::regprocedure),'sha256'),'hex')<>'1575515343ac0905634daa45524902611ab552a4ce1fa03c36af3ca52e86093f' then
  raise exception 'CERTIFICATION_RESOURCE_SEAM_PREDECESSOR_MISMATCH: public.read_certification_operation_v1(jsonb)';end if;
end;$predecessor$;
CREATE OR REPLACE FUNCTION public.read_certification_operation_v1(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare phase text; context jsonb; result jsonb;
begin
 if input->>'operation_id' in('SCORING.READ_MUTATION_STATUS','SCORING.READ_DIRECTOR_OPERATION_STATUS') then
  return production_control.read_certification_score_recovery_v1(input);
 end if;
 phase:=production_control.certification_operation_phase_v1(input->>'operation_id',false);
 context:=production_control.push_certification_context_v1(input,phase,false);
 result:=production_control.dispatch_certification_operation_v1(input,context,false);
 perform production_control.pop_certification_context_v1();
 return result;
end;
$function$;



-- Fail installation if default ACLs introduce an unreviewed direct caller.
do $privileges$
declare item record;allowed oid:=(select oid from pg_roles where rolname='service_role');
begin
 for item in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='production_control' and p.proname in('current_canonical_resource_context_v1','read_certification_score_recovery_v1'))
    or(n.nspname='public' and p.proname='read_certification_director_recovery_material_v1') loop
  if item.proowner<>(select oid from pg_roles where rolname=current_user) or not item.prosecdef
    or item.proconfig is distinct from array['search_path=pg_catalog']::text[]
    or exists(select 1 from aclexplode(coalesce(item.proacl,acldefault('f',item.proowner))) acl
      where acl.privilege_type='EXECUTE' and acl.grantee<>item.proowner
       and not(item.proname='read_certification_director_recovery_material_v1' and acl.grantee=allowed)) then
   raise exception 'CERTIFICATION_RESOURCE_PRIVILEGE_BASELINE_MISMATCH: %',item.oid::regprocedure;end if;
 end loop;
end;$privileges$;
notify pgrst,'reload schema';
commit;
