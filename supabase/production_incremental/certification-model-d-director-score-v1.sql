\set ON_ERROR_STOP on
-- Owner-installed Model D-only transport guard; shared scoring mathematics unchanged.
begin;
select pg_advisory_xact_lock(hashtextextended('certification-model-d-director-score-v1-install',0));
do $$begin if current_user<>'postgres' or session_user<>current_user or coalesce(current_setting('request.jwt.claim.role',true),'')not in('','postgres')then raise exception 'CERTIFICATION_DIRECTOR_SCORE_INSTALL_OWNER_REQUIRED';end if;end$$;
do $$begin if to_regprocedure('production_control.assert_model_d_director_score_v1(jsonb,boolean)') is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('production_control.assert_model_d_director_score_v1(jsonb,boolean)') and encode(extensions.digest(prosrc,'sha256'),'hex')='0cc500f70d5947cc28f5c501931867d36e53d950f6f2fce4f4dbcc31cec74ef4' and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and proacl=array['postgres=X/postgres']::aclitem[])then raise exception 'CERTIFICATION_DIRECTOR_SCORE_INSTALLED_MISMATCH';end if;end$$;
create or replace function production_control.assert_model_d_director_score_v1(input jsonb, check_match boolean) returns void language plpgsql security definer set search_path=pg_catalog as $body$
declare c jsonb; h jsonb; k bytea; stamp bigint; message text; m scoring_authority.matches%rowtype;
begin
 perform production_control.assert_production_service_role();
 if input->>'operation_id' is distinct from 'SCORING.SUBMIT_HOLE'
 or input#>>'{payload,director_score_contract}' is distinct from 'model-d-director-score-v1'
 or not production_control.worker_supervisor_model_d_v1() then
  raise exception using errcode='42501',message='CERTIFICATION_DIRECTOR_SCORE_RESOURCE_DENIED';end if;
 c:=production_control.assert_certification_context_v1(input,'SCORING',true);
 perform production_control.assert_certification_context_v1(input||jsonb_build_object('phase','DIRECTOR'),'DIRECTOR',true);
 perform production_control.assert_production_scoring_actor(jsonb_build_object('authorization',input->'authorization'),true);
 if c->>'tournament_id' is distinct from '2026' or input#>>'{authorization,match_id}' is distinct from input#>>'{payload,match_id}'
 or input#>>'{payload,mutation_key}' is distinct from input->>'operation_request_id'
 or exists(select 1 from jsonb_object_keys(input->'payload') as keys(field_name) where field_name not in
 ('director_score_contract','match_id','hole_number','team_1_gross_scores','team_2_gross_scores','expected_match_revision','expected_hole_revision','mutation_key','expected_round','expected_format')) then
  raise exception using errcode='42501',message='CERTIFICATION_DIRECTOR_SCORE_INPUT_DENIED';end if;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if coalesce(h->>'x-bagger-director-score-time','')!~'^[0-9]{10}$'
 or coalesce(h->>'x-bagger-director-score-proof','')!~'^[0-9a-f]{64}$' then
  raise exception using errcode='42501',message='CERTIFICATION_DIRECTOR_SCORE_ATTESTATION_REQUIRED';end if;
 stamp:=(h->>'x-bagger-director-score-time')::bigint;
 if abs(extract(epoch from statement_timestamp())::bigint-stamp)>60 then
  raise exception using errcode='42501',message='CERTIFICATION_DIRECTOR_SCORE_ATTESTATION_STALE';end if;
 select attestation_key into k from production_control.certification_session_keys_v1
 where resource_id=c->>'resource_id' and registration_revision=(c->>'registration_revision')::bigint
 and authority_epoch_id=(c->>'authority_epoch_id')::uuid;
 message:=concat_ws('|','model-d-director-score-v1',input#>>'{authorization,auth_user_id}',input#>>'{authorization,player_id}',stamp::text,
 c->>'resource_id',c->>'project_ref',c->>'authority_epoch_id',c->>'context_token',input->>'operation_request_id',
 input#>>'{payload,match_id}',input#>>'{payload,hole_number}',replace((input#>'{payload,team_1_gross_scores}')::text,' ',''),
 replace((input#>'{payload,team_2_gross_scores}')::text,' ',''),input#>>'{payload,expected_match_revision}',input#>>'{payload,expected_hole_revision}',
 input#>>'{authorization,permission_revision}',input#>>'{payload,expected_round}',input#>>'{payload,expected_format}');
 if k is null or encode(extensions.hmac(convert_to(message,'UTF8'),k,'sha256'),'hex') is distinct from h->>'x-bagger-director-score-proof' then
  raise exception using errcode='42501',message='CERTIFICATION_DIRECTOR_SCORE_ATTESTATION_DENIED';end if;
 if check_match then
  select * into m from scoring_authority.matches where match_id=input#>>'{payload,match_id}' and tournament_id=c->>'tournament_id' for update;
  if not found or m.round_number::text is distinct from input#>>'{payload,expected_round}' or m.format is distinct from input#>>'{payload,expected_format}' then
   raise exception using errcode='42501',message='CERTIFICATION_DIRECTOR_SCORE_MATCH_DENIED';end if;
  if m.status<>'LIVE' or m.scoring_locked or m.scoring_snapshot_id is null then
   raise exception using errcode='42501',message='CERTIFICATION_DIRECTOR_SCORE_LIFECYCLE_DENIED';end if;
  perform 1 from scoring_authority.scoring_permissions where match_id=m.match_id for share;
  if not exists(select 1 from scoring_authority.scoring_permissions where match_id=m.match_id)
  or exists(select 1 from scoring_authority.match_participants p where p.match_id=m.match_id and not exists(
    select 1 from scoring_authority.scoring_permissions s where s.match_id=p.match_id and s.player_id=p.player_id
    and s.can_score and s.revoked_at is null and s.permission_revision=m.permission_revision)) then
   raise exception using errcode='42501',message='CERTIFICATION_DIRECTOR_SCORE_PERMISSION_CLOSED';end if;
 end if;
end;
$body$;
revoke all on function production_control.assert_model_d_director_score_v1(jsonb,boolean) from public,anon,authenticated,service_role;
do $guard$declare p record;definition text;begin select * into p from pg_proc where oid='production_control.dispatch_certification_operation_v1(jsonb, jsonb, boolean)'::regprocedure;
 if p.proowner<>'postgres'::regrole or not p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog'] or p.proacl is distinct from array['postgres=X/postgres']::aclitem[] then raise exception 'CERTIFICATION_DIRECTOR_SCORE_METADATA_MISMATCH';end if;
 if encode(extensions.digest(p.prosrc,'sha256'),'hex')='244cd81c7ea4cd7a07e8248d72e93d170a38a746321866268f1937234614dd77'then return;end if;
 if encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'8c0915447f5ec531db98e5373489c1e4ff75d9727a7561b5581c7f2320154b88'then raise exception 'CERTIFICATION_DIRECTOR_SCORE_PREDECESSOR_MISMATCH';end if;
 definition:=pg_get_functiondef(p.oid);definition:=replace(definition,p.prosrc,$source$
declare
 operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;
 actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;
 status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');
begin
 if input->'payload' ? 'director_score_contract' then
  begin
   perform production_control.assert_model_d_director_score_v1(input,true);
  exception when sqlstate '42501' then
   if sqlerrm not like 'CERTIFICATION_DIRECTOR_SCORE_%' then raise;end if;
   return jsonb_build_object('ok',false,'code',sqlerrm);
  end;
 end if;
 if operation_id in('DIRECTOR.CONFIGURE_ODDS_INPUTS','DIRECTOR.READ_ODDS_INPUT_CONFIGURATION','DIRECTOR.ODDS_INPUT_CONFIGURATION_STATUS') then
  return production_control.dispatch_certification_odds_configuration_v1(input,context,mutation);end if;
 if operation_id in('DIRECTOR.CALCULATE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CALCULATION','DIRECTOR.NET_SKINS_CALCULATION_STATUS') then
  return production_control.dispatch_certification_net_skins_calculation_v1(input,context,mutation);end if;
 if operation_id in('DIRECTOR.PUBLISH_CALCUTTA','DIRECTOR.READ_CALCUTTA_PUBLICATION') then
  return production_control.dispatch_certification_calcutta_publication_v1(input,context,mutation);end if;
 if operation_id in('DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CONFIGURATION') then
  return production_control.dispatch_certification_net_skins_configuration_v1(input,context,mutation);
 end if;
 if mutation and (operation_id like 'WORKERS.%' or operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED')) then
  return production_control.dispatch_certification_derived_operation_v1(input,context);
 end if;
 if (context->>'current_tournament_year')::integer>2026 then
  return production_control.dispatch_certification_future_scoring_v1(input,context,mutation);
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
$source$);execute definition;end$guard$;
do $guard$declare p record;definition text;begin select * into p from pg_proc where oid='public.admit_certification_operation_v1(jsonb)'::regprocedure;
 if p.proowner<>'postgres'::regrole or not p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog'] or p.proacl is distinct from array['postgres=X/postgres','service_role=X/postgres']::aclitem[] then raise exception 'CERTIFICATION_DIRECTOR_SCORE_METADATA_MISMATCH';end if;
 if encode(extensions.digest(p.prosrc,'sha256'),'hex')='62b04fcda82f5ccfc6fe9ff25256eeebca7d4656f9c68c8b0cf2dc9cd13d4ded'then return;end if;
 if encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'e8ab559a36cce9a1549f39e8e4229d68997f0e5b7e8b91c56dbb9da49149afcc'then raise exception 'CERTIFICATION_DIRECTOR_SCORE_PREDECESSOR_MISMATCH';end if;
 definition:=pg_get_functiondef(p.oid);definition:=replace(definition,p.prosrc,$source$
declare r production_control.canonical_resource_v1%rowtype;i jsonb;ctx jsonb;phase text;hash text;
 l production_control.certification_ingress_leases_v1%rowtype;g production_control.certification_ingress_generations_v1%rowtype;
 m scoring_authority.matches%rowtype;
begin
 if input->'payload' ? 'director_score_contract' then
  perform production_control.assert_model_d_director_score_v1(input,true);
 end if;
 r:=production_control.certification_ingress_recovery_resource_v1(input);
 i:=jsonb_build_object('operation_id',input->>'operation_id','operation_request_id',input->>'operation_request_id',
  'target_key',case when input->>'operation_id'like'SCORING.%'or input->>'operation_id'='DIRECTOR.MATCH_CONTROL'
  then'MATCH:'||(input#>>'{payload,match_id}')else'TOURNAMENT'end);
 if jsonb_typeof(input->'payload')is distinct from 'object'or input->'payload'?|array['resource','deployment','authorization','environment','project_ref','project_url',
 'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token','binding_id','resource_id','resource_class',
 'installation_id','release_commit','activation_revision','admission_revision','governance_tournament_id']
 or(input->'payload'?'player_id'and not coalesce(input->>'operation_id'='DIRECTOR.CLEAR_CALCUTTA_AUCTION'
  or(input->>'operation_id'='DIRECTOR.MUTATE_SETUP'and input#>>'{payload,action}'='assign-roster-team'),false))then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_PAYLOAD_INVALID';end if;
 -- Match mutation keys share canonical receipt identity across all four families.
 -- Serialize their admission before any row exists; other families retain their
 -- existing operation-specific namespace.
 perform pg_advisory_xact_lock(hashtextextended(r.resource_id||':'||
  case when i->>'operation_id'in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL')
   then 'MATCH_MUTATION'else i->>'operation_id'end||':'||(i->>'target_key')||':'||(i->>'operation_request_id'),19361));
 l:=production_control.certification_ingress_lookup_v1(input||jsonb_build_object('verify_request',true),true);
 if l.lease_id is not null then return production_control.certification_ingress_response_v1(l);end if;
 if coalesce((input->>'replay_only')::boolean,false)then
  return jsonb_build_object('ok',true,'contract','certification-ingress-v1','state','UNKNOWN','lease_id',null,'operation_request_id',i->>'operation_request_id');end if;
 phase:=production_control.certification_operation_phase_v1(input->>'operation_id',true);
 ctx:=production_control.push_certification_context_v1(input,phase,true);
 i:=production_control.certification_ingress_identity_v1(input);
 hash:=production_control.certification_ingress_request_hash_v1(input,i);
 if i->>'tournament_id'is distinct from ctx->>'tournament_id'then raise exception using errcode='42501',message='CERTIFICATION_INGRESS_TARGET_DENIED';end if;
 if(input#>>'{payload,tournament_id}'is not null and input#>>'{payload,tournament_id}'is distinct from ctx->>'tournament_id')
  or(input#>>'{payload,expected_epoch_id}'is not null and input#>>'{payload,expected_epoch_id}'is distinct from ctx->>'authority_epoch_id')
  or(input->>'operation_id'like'SCORING.%'and input#>>'{payload,mutation_key}'is distinct from input->>'operation_request_id')then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_TARGET_DENIED';end if;
 select * into strict g from production_control.certification_ingress_generations_v1 where resource_id=r.resource_id and state='OPEN'for share;
 if g.tournament_id is distinct from ctx->>'tournament_id'or g.authority_epoch_id::text is distinct from ctx->>'authority_epoch_id'
  or g.pointer_revision::text is distinct from ctx->>'pointer_revision'then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_GENERATION_STALE';end if;
 if i->>'match_id'is not null then
  select * into strict m from scoring_authority.matches where match_id=i->>'match_id'and tournament_id=g.tournament_id for share;
  if i->>'actor_role'='PLAYER'and not exists(select 1 from scoring_authority.scoring_permissions p
   where p.match_id=m.match_id and p.player_id=i->>'actor_player_id'and p.can_score and p.revoked_at is null
    and p.permission_revision=m.permission_revision
    and p.permission_revision::text=input#>>'{authorization,permission_revision}')then
   raise exception using errcode='42501',message='CERTIFICATION_INGRESS_PERMISSION_DENIED';end if;
 end if;
 if i->>'operation_id'in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL')
  and exists(select 1 from production_control.certification_ingress_leases_v1 existing
   where existing.resource_id=r.resource_id and existing.target_key=i->>'target_key'
    and existing.operation_request_id=i->>'operation_request_id'and existing.operation_id<>i->>'operation_id'
    and existing.operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL'))then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT';end if;
 l.resource_id:=r.resource_id;l.tournament_id:=g.tournament_id;l.operation_id:=i->>'operation_id';
 l.operation_request_id:=i->>'operation_request_id';l.match_id:=i->>'match_id';l.domain_action:=input#>>'{payload,action}';
 if production_control.certification_ingress_canonical_receipt_v1(l)is not null then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_EXISTING_RECEIPT_REQUIRES_RECOVERY';end if;
 insert into production_control.certification_ingress_leases_v1(resource_id,admission_generation_id,tournament_id,authority_epoch_id,
 operation_id,operation_request_id,target_key,match_id,domain_action,actor_auth_user_id,actor_player_id,actor_role,request_hash,context_token,admission_context,predecessor_auction_revision)
 values(r.resource_id,g.generation_id,g.tournament_id,g.authority_epoch_id,i->>'operation_id',i->>'operation_request_id',i->>'target_key',
 i->>'match_id',input#>>'{payload,action}',(i->>'actor_auth_user_id')::uuid,i->>'actor_player_id',i->>'actor_role',hash,ctx->>'context_token',
  ctx-array['authorization','actor_auth_user_id','actor_player_id','resource','deployment'],case when i->>'operation_id'in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')
   then(input#>>'{payload,expected_auction_revision}')::bigint else null end)returning * into l;
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('CERTIFICATION_INGRESS_ADMITTED','CERTIFICATION',l.tournament_id,l.actor_player_id,hash,'SUCCEEDED',
 jsonb_build_object('resource_id',r.resource_id,'generation_id',g.generation_id,'lease_id',l.lease_id,'operation_id',l.operation_id,
 'operation_request_id',l.operation_request_id,'admission_sequence',l.admission_sequence));
 perform production_control.pop_certification_context_v1();return production_control.certification_ingress_response_v1(l);
exception when no_data_found then raise exception using errcode='55000',message='CERTIFICATION_INGRESS_AUTHORITY_UNAVAILABLE';
end;$source$);execute definition;end$guard$;
commit;
