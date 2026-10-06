-- Certification-only synchronous Director calculation adapter.
-- Existing Net Skins processor, claims, mathematics and publication unchanged.
begin;
select pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
do $scope$ begin
 if not exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION'
  and resource_id='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' and project_ref='trmcwrljjxwhgtikfdgu' and database_name=current_database())
  or exists(select 1 from production_control.resource_scope) or exists(select 1 from production_control.cutover_activation_state)
  or exists(select 1 from production_control.certification_admission_v1 where enabled)
  or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')
  or exists(select 1 from production_control.worker_supervisor_v1 where state<>'OFF')
  or exists(select 1 from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN'))
  or exists(select 1 from scoring_authority.net_skins_v1_recalculation_jobs where status='RUNNING') then
   raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_INSTALL_SCOPE_DENIED';end if;
end;$scope$;
do $install$declare m jsonb:=$manifest$[
  {
    "signature": "production_control.certification_operation_phase_v1(text,boolean)",
    "old": "\nbegin\n if mutation and operation_id='DIRECTOR.PUBLISH_CALCUTTA' then return 'DIRECTOR';end if;\n if not mutation and operation_id='DIRECTOR.READ_CALCUTTA_PUBLICATION' then return 'DIRECTOR';end if;\n if mutation and operation_id='DIRECTOR.CONFIGURE_NET_SKINS' then return 'DIRECTOR'; end if;\n if not mutation and operation_id='DIRECTOR.READ_NET_SKINS_CONFIGURATION' then return 'DIRECTOR'; end if;\n if mutation and operation_id in('WORKERS.DELIVERY_TICK','WORKERS.FAIL_PRECLAIM','WORKERS.COMPETITION_CLAIM','WORKERS.COMPETITION_WRITE','WORKERS.COMPETITION_FAIL','WORKERS.INTELLIGENCE_CLAIM','WORKERS.INTELLIGENCE_WRITE','WORKERS.INTELLIGENCE_FAIL','WORKERS.CALCUTTA_CLAIM','WORKERS.CALCUTTA_COMPLETE','WORKERS.CALCUTTA_FAIL') then return 'WORKERS'; end if;\n if mutation and operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED') then return 'DIRECTOR'; end if;\n if not mutation and operation_id in('SCORING.READ_AUTHORITY','SCORING.READ_PARTICIPANT_CONTEXT','SCORING.READ_MUTATION_STATUS') then return 'READS'; end if;\n if not mutation and operation_id in('SCORING.READ_DIRECTOR_OPERATION_STATUS','DIRECTOR.READ_SETUP','DIRECTOR.READ_NET_SKINS','DIRECTOR.READ_CALCUTTA',\n  'DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS') then return 'DIRECTOR'; end if;\n if mutation and operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH') then return 'SCORING'; end if;\n if mutation and operation_id in('SCORING.REOPEN_MATCH','DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then return 'DIRECTOR'; end if;\n raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\nend;\n",
    "new": "\nbegin\n if mutation and operation_id='DIRECTOR.CALCULATE_NET_SKINS' then return 'DIRECTOR';end if;\n if not mutation and operation_id in('DIRECTOR.READ_NET_SKINS_CALCULATION','DIRECTOR.NET_SKINS_CALCULATION_STATUS') then return 'DIRECTOR';end if;\n if mutation and operation_id='DIRECTOR.PUBLISH_CALCUTTA' then return 'DIRECTOR';end if;\n if not mutation and operation_id='DIRECTOR.READ_CALCUTTA_PUBLICATION' then return 'DIRECTOR';end if;\n if mutation and operation_id='DIRECTOR.CONFIGURE_NET_SKINS' then return 'DIRECTOR'; end if;\n if not mutation and operation_id='DIRECTOR.READ_NET_SKINS_CONFIGURATION' then return 'DIRECTOR'; end if;\n if mutation and operation_id in('WORKERS.DELIVERY_TICK','WORKERS.FAIL_PRECLAIM','WORKERS.COMPETITION_CLAIM','WORKERS.COMPETITION_WRITE','WORKERS.COMPETITION_FAIL','WORKERS.INTELLIGENCE_CLAIM','WORKERS.INTELLIGENCE_WRITE','WORKERS.INTELLIGENCE_FAIL','WORKERS.CALCUTTA_CLAIM','WORKERS.CALCUTTA_COMPLETE','WORKERS.CALCUTTA_FAIL') then return 'WORKERS'; end if;\n if mutation and operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED') then return 'DIRECTOR'; end if;\n if not mutation and operation_id in('SCORING.READ_AUTHORITY','SCORING.READ_PARTICIPANT_CONTEXT','SCORING.READ_MUTATION_STATUS') then return 'READS'; end if;\n if not mutation and operation_id in('SCORING.READ_DIRECTOR_OPERATION_STATUS','DIRECTOR.READ_SETUP','DIRECTOR.READ_NET_SKINS','DIRECTOR.READ_CALCUTTA',\n  'DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS') then return 'DIRECTOR'; end if;\n if mutation and operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH') then return 'SCORING'; end if;\n if mutation and operation_id in('SCORING.REOPEN_MATCH','DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then return 'DIRECTOR'; end if;\n raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\nend;\n",
    "old_hash": "0b9d4cad7e0870e1a2a163d8eb48dabc1d5a0061e05c34a07ff73ae7aa5fc69b",
    "new_hash": "7b393089a17651867c8ee07a80331c4619a2e9ee4d6c1667fbd555f4ccd86e9f"
  },
  {
    "signature": "production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)",
    "old": "\ndeclare\n operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;\n actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;\n status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');\nbegin\n if operation_id in('DIRECTOR.PUBLISH_CALCUTTA','DIRECTOR.READ_CALCUTTA_PUBLICATION') then\n  return production_control.dispatch_certification_calcutta_publication_v1(input,context,mutation);end if;\n if operation_id in('DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CONFIGURATION') then\n  return production_control.dispatch_certification_net_skins_configuration_v1(input,context,mutation);\n end if;\n if mutation and (operation_id like 'WORKERS.%' or operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED')) then\n  return production_control.dispatch_certification_derived_operation_v1(input,context);\n end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  return production_control.dispatch_certification_future_scoring_v1(input,context,mutation);\n end if;\n -- The marker is owner-only and revalidates registered resource/deployment,\n -- current pointer, admission revision and live ingress under transaction locks.\n perform production_control.assert_canonical_scoring_context_v1('{}'::jsonb,context,'RUNTIME');\n if jsonb_typeof(payload) is distinct from 'object' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n if status_read and (coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'\n  or coalesce(payload->>'original_context_token','') !~ '^[0-9a-f]{64}$') then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED'; end if;\n if payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',\n  'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token',\n  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',\n  'admission_revision','governance_tournament_id'] or (payload ? 'player_id' and not coalesce(\n   operation_id='DIRECTOR.CLEAR_CALCUTTA_AUCTION' or\n   (operation_id='DIRECTOR.MUTATE_SETUP' and payload->>'action'='assign-roster-team'),false)) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;\n if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')\n  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')\n  or (input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH'; end if;\n command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id',\n  'expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');\n if mutation and operation_id like 'SCORING.%' and command->>'mutation_key' is distinct from input->>'operation_request_id' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;\n if operation_id in('SCORING.REOPEN_MATCH') or operation_id like 'DIRECTOR.%' then\n  perform production_control.assert_production_scoring_actor(command,true);\n  actor_context:=context||jsonb_build_object('actor_player_id',input#>>'{authorization,player_id}',\n   'actor_auth_user_id',input#>>'{authorization,auth_user_id}','authorization',input->'authorization',\n   'operation_request_id',input->>'operation_request_id',\n   'resource_fingerprint',production_control.cutover_payload_hash(input->'resource'));\n end if;\n case operation_id\n when 'SCORING.READ_AUTHORITY' then\n  return production_control.canonical_read_scoring_authority_v2(command,context);\n when 'SCORING.READ_PARTICIPANT_CONTEXT' then\n  return production_control.canonical_read_scoring_participant_context_v2(command||jsonb_build_object(\n   'player_id',input#>>'{authorization,player_id}','auth_user_id',input#>>'{authorization,auth_user_id}',\n   'role',input#>>'{authorization,role}'),context);\n when 'SCORING.READ_MUTATION_STATUS' then\n  return production_control.read_score_mutation_status_v1(command,'2026');\n when 'SCORING.SUBMIT_HOLE' then\n  return production_control.canonical_submit_hole_score_v2(command,context);\n when 'SCORING.FINALIZE_MATCH' then\n  return production_control.canonical_finalize_match_v2(command,context);\n when 'SCORING.REOPEN_MATCH' then\n  return production_control.canonical_reopen_match_v2(command,context);\n when 'DIRECTOR.READ_SETUP' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:='read';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_SETUP' then family:='TOURNAMENT_SETUP'; action:=payload->>'action';\n when 'DIRECTOR.SETUP_STATUS' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:=payload->>'action';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_PAIRINGS' then family:='ROUND_PAIRINGS'; action:='replace-round-pairings';\n when 'DIRECTOR.MATCH_CONTROL' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.MATCH_CONTROL_STATUS' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.READ_NET_SKINS' then family:='NET_SKINS_ENTRIES'; action:='read';\n when 'DIRECTOR.SAVE_NET_SKINS_ENTRIES' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.NET_SKINS_STATUS' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.READ_CALCUTTA' then family:='CALCUTTA_MANAGEMENT'; action:='read';\n when 'DIRECTOR.CALCUTTA_STATUS' then family:='CALCUTTA_MANAGEMENT'; action:=payload->>'action';\n when 'DIRECTOR.REPLACE_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='replace-auction';\n when 'DIRECTOR.CLEAR_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='clear-entry';\n else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\n end case;\n dispatch_input:=input||jsonb_build_object('family',family,'action',action,'payload',payload-array['action','family','original_context_token']);\n if status_read then\n  -- The original token is receipt-hash provenance only. The current outer\n  -- context was freshly admitted and remains the sole execution authority.\n  dispatch_input:=dispatch_input||jsonb_build_object('mode','status','expected_context_token',payload->>'original_context_token');\n end if;\n if family in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n  return production_control.canonical_director_setup_operation_v2(dispatch_input,actor_context,mutation);\n end if;\n return production_control.canonical_director_financial_operation_v2(dispatch_input,actor_context,mutation);\nend;\n",
    "new": "\ndeclare\n operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;\n actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;\n status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');\nbegin\n if operation_id in('DIRECTOR.CALCULATE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CALCULATION','DIRECTOR.NET_SKINS_CALCULATION_STATUS') then\n  return production_control.dispatch_certification_net_skins_calculation_v1(input,context,mutation);end if;\n if operation_id in('DIRECTOR.PUBLISH_CALCUTTA','DIRECTOR.READ_CALCUTTA_PUBLICATION') then\n  return production_control.dispatch_certification_calcutta_publication_v1(input,context,mutation);end if;\n if operation_id in('DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CONFIGURATION') then\n  return production_control.dispatch_certification_net_skins_configuration_v1(input,context,mutation);\n end if;\n if mutation and (operation_id like 'WORKERS.%' or operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED')) then\n  return production_control.dispatch_certification_derived_operation_v1(input,context);\n end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  return production_control.dispatch_certification_future_scoring_v1(input,context,mutation);\n end if;\n -- The marker is owner-only and revalidates registered resource/deployment,\n -- current pointer, admission revision and live ingress under transaction locks.\n perform production_control.assert_canonical_scoring_context_v1('{}'::jsonb,context,'RUNTIME');\n if jsonb_typeof(payload) is distinct from 'object' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n if status_read and (coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'\n  or coalesce(payload->>'original_context_token','') !~ '^[0-9a-f]{64}$') then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED'; end if;\n if payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',\n  'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token',\n  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',\n  'admission_revision','governance_tournament_id'] or (payload ? 'player_id' and not coalesce(\n   operation_id='DIRECTOR.CLEAR_CALCUTTA_AUCTION' or\n   (operation_id='DIRECTOR.MUTATE_SETUP' and payload->>'action'='assign-roster-team'),false)) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;\n if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')\n  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')\n  or (input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH'; end if;\n command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id',\n  'expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');\n if mutation and operation_id like 'SCORING.%' and command->>'mutation_key' is distinct from input->>'operation_request_id' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;\n if operation_id in('SCORING.REOPEN_MATCH') or operation_id like 'DIRECTOR.%' then\n  perform production_control.assert_production_scoring_actor(command,true);\n  actor_context:=context||jsonb_build_object('actor_player_id',input#>>'{authorization,player_id}',\n   'actor_auth_user_id',input#>>'{authorization,auth_user_id}','authorization',input->'authorization',\n   'operation_request_id',input->>'operation_request_id',\n   'resource_fingerprint',production_control.cutover_payload_hash(input->'resource'));\n end if;\n case operation_id\n when 'SCORING.READ_AUTHORITY' then\n  return production_control.canonical_read_scoring_authority_v2(command,context);\n when 'SCORING.READ_PARTICIPANT_CONTEXT' then\n  return production_control.canonical_read_scoring_participant_context_v2(command||jsonb_build_object(\n   'player_id',input#>>'{authorization,player_id}','auth_user_id',input#>>'{authorization,auth_user_id}',\n   'role',input#>>'{authorization,role}'),context);\n when 'SCORING.READ_MUTATION_STATUS' then\n  return production_control.read_score_mutation_status_v1(command,'2026');\n when 'SCORING.SUBMIT_HOLE' then\n  return production_control.canonical_submit_hole_score_v2(command,context);\n when 'SCORING.FINALIZE_MATCH' then\n  return production_control.canonical_finalize_match_v2(command,context);\n when 'SCORING.REOPEN_MATCH' then\n  return production_control.canonical_reopen_match_v2(command,context);\n when 'DIRECTOR.READ_SETUP' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:='read';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_SETUP' then family:='TOURNAMENT_SETUP'; action:=payload->>'action';\n when 'DIRECTOR.SETUP_STATUS' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:=payload->>'action';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_PAIRINGS' then family:='ROUND_PAIRINGS'; action:='replace-round-pairings';\n when 'DIRECTOR.MATCH_CONTROL' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.MATCH_CONTROL_STATUS' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.READ_NET_SKINS' then family:='NET_SKINS_ENTRIES'; action:='read';\n when 'DIRECTOR.SAVE_NET_SKINS_ENTRIES' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.NET_SKINS_STATUS' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.READ_CALCUTTA' then family:='CALCUTTA_MANAGEMENT'; action:='read';\n when 'DIRECTOR.CALCUTTA_STATUS' then family:='CALCUTTA_MANAGEMENT'; action:=payload->>'action';\n when 'DIRECTOR.REPLACE_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='replace-auction';\n when 'DIRECTOR.CLEAR_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='clear-entry';\n else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\n end case;\n dispatch_input:=input||jsonb_build_object('family',family,'action',action,'payload',payload-array['action','family','original_context_token']);\n if status_read then\n  -- The original token is receipt-hash provenance only. The current outer\n  -- context was freshly admitted and remains the sole execution authority.\n  dispatch_input:=dispatch_input||jsonb_build_object('mode','status','expected_context_token',payload->>'original_context_token');\n end if;\n if family in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n  return production_control.canonical_director_setup_operation_v2(dispatch_input,actor_context,mutation);\n end if;\n return production_control.canonical_director_financial_operation_v2(dispatch_input,actor_context,mutation);\nend;\n",
    "old_hash": "8dea95b16851cbb1b972cd66ce85fe4573ce4941c4a870f7fe5cf83da5cb59de",
    "new_hash": "c78c88e509f0cbabd2195f8e6498f16641e8cd61ad95047b3be9e4ec9e826b36"
  }
]$manifest$;p jsonb;h text;definition text;before_metadata jsonb;after_metadata jsonb;begin
 for p in select value from jsonb_array_elements(m)loop
  select encode(extensions.digest(prosrc,'sha256'),'hex')into strict h from pg_proc where oid=(p->>'signature')::regprocedure;
  if h not in(p->>'old_hash',p->>'new_hash')then raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_PREDECESSOR_MISMATCH: %',p->>'signature';end if;
 end loop;
 -- The read correction and unchanged shipping claim/complete/fail cores must be present.
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.canonical_read_net_skins_v1(jsonb,jsonb)'::regprocedure),'sha256'),'hex')<>'f6f08a7c15d76c3c76a7e7e8569780fd5c92705e23f0e3036a4727dadc355520' then raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_READ_PREDECESSOR_MISMATCH';end if;
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.canonical_claim_net_skins_v1_recalculation_core_v2(jsonb,jsonb)'::regprocedure),'sha256'),'hex')<>'117564e9feb1668bb5b1fb5dc567fa6384d2bb90a050b737b0a453484ab2ecee'then raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_PROCESSOR_PREDECESSOR_MISMATCH';end if;
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.canonical_complete_net_skins_v1_recalculation_core_v2(jsonb,jsonb)'::regprocedure),'sha256'),'hex')<>'4e16a065c14908e9845a5eb1541cc6360f4b70069eb218e68796df3cbc26a0db'then raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_PROCESSOR_PREDECESSOR_MISMATCH';end if;
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.canonical_fail_net_skins_v1_recalculation_core_v2(jsonb,jsonb)'::regprocedure),'sha256'),'hex')<>'69283dc6fcbf41e48200c2d7b5827da37c24e99e9a1d6cc31dc93fc5febbaa32'then raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_PROCESSOR_PREDECESSOR_MISMATCH';end if;
 if encode(extensions.digest((select prosrc from pg_proc where oid='production_control.enqueue_production_net_skins_v1_round(integer,text,text)'::regprocedure),'sha256'),'hex')<>'1b1f4421b2e81f92af544a3ee5c91273dfbeb5193ba047c6b733d821539c0a5f'then raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_ENQUEUE_PREDECESSOR_MISMATCH';end if;
 if to_regprocedure('production_control.dispatch_certification_net_skins_calculation_v1(jsonb,jsonb,boolean)')is null then
 execute $helper$CREATE FUNCTION production_control.dispatch_certification_net_skins_calculation_v1(input jsonb,context jsonb,mutation boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','production_control','scoring_authority'
AS $body$
declare
 op text:=input->>'operation_id'; p jsonb:=input->'payload'; actor jsonb;
 cfg scoring_authority.net_skins_v1_configuration_current%rowtype;
 manifest jsonb; entries jsonb; r jsonb; rounds jsonb:='[]'; expected_entries jsonb:='{}'; sources jsonb:='{}';
 id text:=lower(input->>'operation_request_id'); base text; outer_fp text; phase_fp text;
 identity jsonb; prior jsonb; claimed jsonb; command jsonb; completed jsonb; failed jsonb;
 j scoring_authority.net_skins_v1_recalculation_jobs%rowtype; outcome text; state text; receipt jsonb; round_lock integer;
begin
 perform production_control.assert_canonical_scoring_context_v1('{}',context,'RUNTIME');
 if context is distinct from production_control.current_certification_context_v1()
  or context->>'phase' is distinct from 'DIRECTOR' or context->>'tournament_id' is distinct from '2026'
  or context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
  or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'
  or op not in('DIRECTOR.CALCULATE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CALCULATION','DIRECTOR.NET_SKINS_CALCULATION_STATUS')
  or mutation is distinct from (op='DIRECTOR.CALCULATE_NET_SKINS') then
  raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_CALCULATION_CONTEXT_DENIED';end if;
 actor:=jsonb_build_object('tournament_id','2026','authorization',input->'authorization');
 perform production_control.assert_production_scoring_actor(actor,true);
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p)k
  where k not in('expected_configuration_revision','entry_revisions','source_fingerprints')) then
  raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_CALCULATION_INPUT_INVALID';end if;
 select * into cfg from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026';
 if not found then
  -- Absence is a truthful configuration-zero read, not an invented ledger row.
  cfg.state:='NOT_CONFIGURED';cfg.configuration_revision:=0;manifest:='{"rounds":[]}';
 else
  select configuration_manifest into strict manifest from scoring_authority.net_skins_v1_configuration_revisions
   where configuration_revision_id=cfg.configuration_revision_id;
 end if;
 entries:=production_control.net_skins_entries_projection_v1('2026');
 for r in select value from jsonb_array_elements(manifest->'rounds') loop
  expected_entries:=expected_entries||jsonb_build_object(r->>'round_number',r->'entry_revision');
  sources:=sources||jsonb_build_object(r->>'round_number',production_control.net_skins_v1_hash(
    production_control.net_skins_v1_round_source_revision('2026',(r->>'round_number')::integer)));
  rounds:=rounds||jsonb_build_array(jsonb_build_object('round_number',(r->>'round_number')::integer,
   'entry_revision',r->'entry_revision','current_entry_revision',(select v->'revision' from jsonb_array_elements(entries->'rounds')v
    where v->>'roundNumber'=r->>'round_number'),'source_fingerprint',sources->(r->>'round_number'),
   'result_state',(select result_state from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026'
    and round_number=(r->>'round_number')::integer and is_current and configuration_revision=cfg.configuration_revision)));
 end loop;
 if op='DIRECTOR.READ_NET_SKINS_CALCULATION' then
  if p<>'{}'::jsonb then raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_CALCULATION_INPUT_INVALID';end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('tournament_id','2026','state',cfg.state,
   'configuration_revision',cfg.configuration_revision,'entry_revisions',expected_entries,'source_fingerprints',sources,'rounds',rounds,
   'processing',(select count(*) from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026' and status='RUNNING'),
   'pending',(select count(*) from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026' and status='PENDING')));
 end if;
 if coalesce(id,'') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  or jsonb_typeof(p->'expected_configuration_revision') is distinct from 'number'
  or jsonb_typeof(p->'entry_revisions') is distinct from 'object'
  or jsonb_typeof(p->'source_fingerprints') is distinct from 'object' then
  raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_CALCULATION_INPUT_INVALID';end if;
 -- Serialize only this review identity. Receipts remain the existing durable
 -- domain ledger; no new lease, attempt budget or recovery system is introduced.
 perform pg_advisory_xact_lock(hashtextextended('certification-net-skins-calculation-v1:'||id,0));
 base:=encode(extensions.digest('certification-net-skins-calculation-v1'||chr(10)||id,'sha256'),'hex');
 outer_fp:=encode(extensions.digest('ADMISSION'||chr(10)||base,'sha256'),'hex');
 identity:=p||jsonb_build_object('request_fingerprint',outer_fp,'operation_request_id',id,
  'resource_id',context->>'resource_id','project_ref',context->>'project_ref','authorization',input->'authorization');
 prior:=production_control.lookup_cutover_receipt('CERTIFICATION_NET_SKINS_CALCULATION',identity);
 if op='DIRECTOR.NET_SKINS_CALCULATION_STATUS' then
  outcome:='UNKNOWN';state:='UNCONFIRMED';receipt:=null;
  if prior is not null then
   if prior->'job'='null'::jsonb then
    outcome:='COMMITTED';state:='NO_ELIGIBLE_WORK';receipt:=jsonb_build_object('ok',true,'code',prior->>'code','empty',true,'idempotent',true);
   else
    select * into strict j from scoring_authority.net_skins_v1_recalculation_jobs where job_id=(prior#>>'{job,job_id}')::uuid for update;
    phase_fp:=encode(extensions.digest('production-net-skins-v1'||chr(10)||'COMPLETE:'||upper(j.job_id::text)||chr(10)||base,'sha256'),'hex');
    select response into completed from production_control.cutover_operation_receipts where request_fingerprint=phase_fp and operation='NET_SKINS_V1_COMPLETE';
    phase_fp:=encode(extensions.digest('production-net-skins-v1'||chr(10)||'FAIL:'||upper(j.job_id::text)||chr(10)||base,'sha256'),'hex');
    select response into failed from production_control.cutover_operation_receipts where request_fingerprint=phase_fp and operation='NET_SKINS_V1_FAIL';
    if completed is not null then
     outcome:='COMMITTED';state:='COMPLETED';
     receipt:=(completed-'job_id')||jsonb_build_object('idempotent',true,'empty',false);
    elsif failed is not null or j.claim_token is distinct from (prior#>>'{job,claim_token}')::uuid
      or j.claimed_by is distinct from 'certification-net-skins-director-v1' or j.lease_expires_at<=clock_timestamp() then
     outcome:='NOT_COMMITTED';state:=case when failed is not null then 'FAILED' else 'CLAIM_CLOSED' end;
    else state:='CLAIM_HELD';end if;
   end if;
  end if;
  return jsonb_build_object('ok',true,'outcome',outcome,'state',state,'receipt',receipt);
 end if;
 if prior is not null then return prior;end if;
 if cfg.state<>'CONFIGURED' then raise exception using errcode='55000',message='PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED';end if;
 if p->'expected_configuration_revision' is distinct from to_jsonb(cfg.configuration_revision) then
  raise exception using errcode='40001',message='PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';end if;
 if p->'entry_revisions' is distinct from expected_entries or exists(select 1 from jsonb_array_elements(rounds)v
  where v->'entry_revision' is distinct from v->'current_entry_revision') then
  raise exception using errcode='40001',message='FULL_NET_ENTRY_REVISION_STALE_OR_UNAVAILABLE';end if;
 if p->'source_fingerprints' is distinct from sources then
  raise exception using errcode='40001',message='PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';end if;
 -- Shipping separates explicit enqueue from process. Configuration can be
 -- saved after scores finalized, leaving no job/score intent. Materialize at
 -- most one missing configured-round demand through that same private core.
 -- Preserve a successful same-source output and exhausted/failed job history;
 -- ordinary calculation never grants a replacement budget to either.
 for round_lock in 1..3 loop
  perform pg_advisory_xact_lock(hashtextextended(format('production-net-skins-v1:enqueue:2026:R%s',round_lock),202608290055));
 end loop;
 for r in select value from jsonb_array_elements(manifest->'rounds')order by (value->>'round_number')::integer loop
  if not exists(select 1 from scoring_authority.net_skins_v1_recalculation_jobs where tournament_id='2026'
    and round_number=(r->>'round_number')::integer and configuration_revision=cfg.configuration_revision
    and source_fingerprint=sources->>(r->>'round_number') and status<>'SUPERSEDED')
   and not exists(select 1 from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026'
    and round_number=(r->>'round_number')::integer and configuration_revision=cfg.configuration_revision
    and source_fingerprint=sources->>(r->>'round_number') and is_current)then
   perform production_control.enqueue_production_net_skins_v1_round((r->>'round_number')::integer,'DIRECTOR_CALCULATION_REQUEST',input#>>'{authorization,player_id}');
   exit;
  end if;
 end loop;
 -- Canonical claim supplies the input/job. The caller never selects either.
 phase_fp:=encode(extensions.digest('production-net-skins-v1'||chr(10)||'CLAIM'||chr(10)||base,'sha256'),'hex');
 command:=jsonb_build_object('expected_configuration_revision',cfg.configuration_revision,'worker_id','certification-net-skins-director-v1',
  'lease_seconds',60,'request_fingerprint',phase_fp,'expected_activation_revision',context->'activation_revision',
  'tournament_id','2026','environment','CERTIFICATION','expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');
 claimed:=production_control.canonical_claim_net_skins_v1_recalculation_core_v2(command,context);
 if claimed->'job'<>'null'::jsonb and claimed#>>'{job,source_fingerprint}' is distinct from p#>>array['source_fingerprints',claimed#>>'{job,round_number}'] then
  raise exception using errcode='40001',message='PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';end if;
 perform production_control.store_cutover_receipt('CERTIFICATION_NET_SKINS_CALCULATION',identity,claimed);
 return claimed;
end;
$body$;
$helper$;
 execute format('alter function production_control.dispatch_certification_net_skins_calculation_v1(jsonb,jsonb,boolean)owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure)));
 execute 'revoke all on function production_control.dispatch_certification_net_skins_calculation_v1(jsonb,jsonb,boolean)from public,anon,authenticated,service_role';
 end if;
 for p in select value from jsonb_array_elements(m)loop
  select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'security',prosecdef,
   'config',proconfig,'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)
   into strict h,before_metadata from pg_proc where oid=(p->>'signature')::regprocedure;
  if h=p->>'old_hash'then
   definition:=pg_get_functiondef((p->>'signature')::regprocedure);
   if position(p->>'old' in definition)=0 then raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_BODY_DRIFT';end if;
   execute replace(definition,p->>'old',p->>'new');end if;
  select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'security',prosecdef,
   'config',proconfig,'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)
   into strict h,after_metadata from pg_proc where oid=(p->>'signature')::regprocedure;
  if h<>p->>'new_hash'or before_metadata is distinct from after_metadata then raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_METADATA_DRIFT';end if;
 end loop;
end;$install$;
do $verify$declare p pg_proc%rowtype;begin
 select * into strict p from pg_proc where oid='production_control.dispatch_certification_net_skins_calculation_v1(jsonb,jsonb,boolean)'::regprocedure;
 if p.proowner<>(select proowner from pg_proc where oid='production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)'::regprocedure)
  or p.prosecdef is distinct from true or p.provolatile is distinct from 'v'::"char"
  or p.proconfig is distinct from array['search_path=pg_catalog, production_control, scoring_authority']::text[]
  or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee<>p.proowner or a.privilege_type<>'EXECUTE')then
  raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_PRIVATE_ACL_DRIFT';end if;
 if encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'388977ac0ac644cbc5193adf8b6946dc80744d0bab0c463dd174473f43f7fd6e'then raise exception 'CERTIFICATION_NET_SKINS_CALCULATION_CORE_DRIFT';end if;
end;$verify$;
commit;
