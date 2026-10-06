-- Certification Calcutta result publication: shared domain core, unchanged Production guard.
-- Forward-only. Exact predecessor checks, metadata preservation, no hosted action.
begin;
select pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
do $scope$ begin
 if not exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION' and resource_id='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' and project_ref='trmcwrljjxwhgtikfdgu' and database_name=current_database())
   or exists(select 1 from production_control.resource_scope) or exists(select 1 from production_control.cutover_activation_state)
   or exists(select 1 from production_control.certification_admission_v1 where enabled)
   or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')
   or exists(select 1 from production_control.worker_supervisor_v1 where state<>'OFF')
   or exists(select 1 from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')) then
   raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_INSTALL_SCOPE_DENIED'; end if;
end;$scope$;
do $install$ declare m jsonb:=$manifest$[
  {
    "signature": "public.publish_production_calcutta_v1(jsonb)",
    "old_hash": "8d7bdb91712cda908bc546ba2772eab47079d7468e05bde77716ce8fead649cd",
    "new_hash": "79af55b9f11f693944b11f36b5cdc422f130ae8647d503f3baf76ca05a56cde7",
    "old": "\ndeclare\n  current_value scoring_authority.calcutta_v1_current%rowtype;\n  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;\n  existing_response jsonb;\n  response_value jsonb;\n  job_value jsonb;\n  request_fingerprint_value text := pg_catalog.lower(\n    coalesce(input->>'request_fingerprint', '')\n  );\n  actor_player text := pg_catalog.btrim(coalesce(\n    input#>>'{authorization,player_id}', ''\n  ));\n  actor_auth_user uuid := nullif(\n    input#>>'{authorization,auth_user_id}', ''\n  )::uuid;\nbegin\n  perform production_control.assert_production_calcutta_v1_runtime(input);\n  perform production_control.assert_production_scoring_actor(input, true);\n  existing_response := production_control.lookup_cutover_receipt(\n    'CALCUTTA_V1_PUBLISH', input\n  );\n  if existing_response is not null then return existing_response; end if;\n  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then\n    raise exception using errcode = '22023',\n      message = 'PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';\n  end if;\n\n  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = '2026'\n  for update;\n  if current_value.configuration_revision <>\n       coalesce((input->>'expected_configuration_revision')::bigint, -1)\n     or current_value.configuration_fingerprint is distinct from\n       nullif(input->>'expected_configuration_fingerprint', '') then\n    raise exception using errcode = '40001',\n      message = 'PRODUCTION_CALCUTTA_CONFIGURATION_REVISION_CONFLICT';\n  end if;\n  if current_value.auction_revision <>\n       coalesce((input->>'expected_auction_revision')::bigint, -1)\n     or current_value.auction_fingerprint is distinct from\n       nullif(input->>'expected_auction_fingerprint', '') then\n    raise exception using errcode = '40001',\n      message = 'PRODUCTION_CALCUTTA_AUCTION_REVISION_CONFLICT';\n  end if;\n  if current_value.publication_revision <>\n       coalesce((input->>'expected_publication_revision')::bigint, -1) then\n    raise exception using errcode = '40001',\n      message = 'PRODUCTION_CALCUTTA_PUBLICATION_REVISION_CONFLICT';\n  end if;\n  if current_value.state = 'NOT_CONFIGURED'\n     or current_value.auction_revision = 0\n     or current_value.auction_revision_id is null then\n    raise exception using errcode = '55000',\n      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';\n  end if;\n\n  if current_value.publication_state = 'PUBLISHED' then\n    response_value := pg_catalog.jsonb_build_object(\n      'ok', true,\n      'code', 'PRODUCTION_CALCUTTA_V1_ALREADY_PUBLISHED',\n      'state', current_value.state,\n      'publication_state', 'PUBLISHED',\n      'configuration_revision', current_value.configuration_revision,\n      'configuration_fingerprint', current_value.configuration_fingerprint,\n      'auction_revision', current_value.auction_revision,\n      'auction_fingerprint', current_value.auction_fingerprint,\n      'publication_revision', current_value.publication_revision,\n      'result_revision', nullif(current_value.result_revision, 0),\n      'job', null,\n      'idempotent', true\n    );\n    perform production_control.store_cutover_receipt(\n      'CALCUTTA_V1_PUBLISH', input, response_value\n    );\n    return response_value;\n  end if;\n\n  insert into scoring_authority.calcutta_v1_publication_revisions (\n    tournament_id, publication_revision, configuration_revision,\n    auction_revision, configuration_fingerprint, auction_fingerprint,\n    publication_state, action, actor_player_id, actor_auth_user_id,\n    request_fingerprint, request_payload_hash, published_at\n  ) values (\n    '2026', current_value.publication_revision + 1,\n    current_value.configuration_revision, current_value.auction_revision,\n    current_value.configuration_fingerprint,\n    current_value.auction_fingerprint, 'PUBLISHED',\n    'DIRECTOR_PUBLISHED', actor_player, actor_auth_user,\n    request_fingerprint_value,\n    production_control.calcutta_v1_hash(input), pg_catalog.now()\n  ) returning * into publication_value;\n\n  update scoring_authority.calcutta_v1_current\n  set publication_revision_id = publication_value.publication_revision_id,\n      publication_revision = publication_value.publication_revision,\n      publication_state = 'PUBLISHED', updated_at = pg_catalog.now()\n  where tournament_id = '2026';\n\n  job_value := production_control.enqueue_production_calcutta_v1(\n    'DIRECTOR_PUBLISHED', actor_player, false, null, null\n  );\n  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = '2026';\n\n  insert into scoring_authority.audit_events (\n    tournament_id, action, actor_id, metadata\n  ) values (\n    '2026', 'PRODUCTION_CALCUTTA_V1_PUBLISHED', actor_player,\n    pg_catalog.jsonb_build_object(\n      'configuration_revision', current_value.configuration_revision,\n      'configuration_fingerprint', current_value.configuration_fingerprint,\n      'auction_revision', current_value.auction_revision,\n      'auction_fingerprint', current_value.auction_fingerprint,\n      'publication_revision', current_value.publication_revision,\n      'result_revision', nullif(current_value.result_revision, 0),\n      'publication_policy',\n        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',\n      'authority_changed', false\n    )\n  );\n  insert into production_control.operation_audit_events (\n    event_type, domain, tournament_id, actor, request_fingerprint,\n    result, details\n  ) values (\n    'PRODUCTION_CALCUTTA_V1_PUBLISHED', 'CALCUTTA', '2026',\n    actor_player, request_fingerprint_value, 'SUCCEEDED',\n    pg_catalog.jsonb_build_object(\n      'configuration_revision', current_value.configuration_revision,\n      'auction_revision', current_value.auction_revision,\n      'publication_revision', current_value.publication_revision,\n      'result_revision', nullif(current_value.result_revision, 0),\n      'job_id', job_value->>'job_id'\n    )\n  );\n\n  response_value := pg_catalog.jsonb_build_object(\n    'ok', true,\n    'code', 'PRODUCTION_CALCUTTA_V1_PUBLISHED',\n    'state', current_value.state,\n    'publication_state', 'PUBLISHED',\n    'configuration_revision', current_value.configuration_revision,\n    'configuration_fingerprint', current_value.configuration_fingerprint,\n    'auction_revision', current_value.auction_revision,\n    'auction_fingerprint', current_value.auction_fingerprint,\n    'publication_revision', current_value.publication_revision,\n    'result_revision', nullif(current_value.result_revision, 0),\n    'job', job_value,\n    'idempotent', false\n  );\n  perform production_control.store_cutover_receipt(\n    'CALCUTTA_V1_PUBLISH', input, response_value\n  );\n  return response_value;\nend;\n",
    "new": "begin return production_control.canonical_publish_calcutta_v1(input,null); end;"
  },
  {
    "signature": "production_control.certification_operation_phase_v1(text,boolean)",
    "old_hash": "a3f81f1b3bc2570313115fce2a9b1ab85d691eb94cbc58586fda7925fa8e5059",
    "new_hash": "0b9d4cad7e0870e1a2a163d8eb48dabc1d5a0061e05c34a07ff73ae7aa5fc69b",
    "old": "\nbegin\n if mutation and operation_id='DIRECTOR.CONFIGURE_NET_SKINS' then return 'DIRECTOR'; end if;\n if not mutation and operation_id='DIRECTOR.READ_NET_SKINS_CONFIGURATION' then return 'DIRECTOR'; end if;\n if mutation and operation_id in('WORKERS.DELIVERY_TICK','WORKERS.FAIL_PRECLAIM','WORKERS.COMPETITION_CLAIM','WORKERS.COMPETITION_WRITE','WORKERS.COMPETITION_FAIL','WORKERS.INTELLIGENCE_CLAIM','WORKERS.INTELLIGENCE_WRITE','WORKERS.INTELLIGENCE_FAIL','WORKERS.CALCUTTA_CLAIM','WORKERS.CALCUTTA_COMPLETE','WORKERS.CALCUTTA_FAIL') then return 'WORKERS'; end if;\n if mutation and operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED') then return 'DIRECTOR'; end if;\n if not mutation and operation_id in('SCORING.READ_AUTHORITY','SCORING.READ_PARTICIPANT_CONTEXT','SCORING.READ_MUTATION_STATUS') then return 'READS'; end if;\n if not mutation and operation_id in('SCORING.READ_DIRECTOR_OPERATION_STATUS','DIRECTOR.READ_SETUP','DIRECTOR.READ_NET_SKINS','DIRECTOR.READ_CALCUTTA',\n  'DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS') then return 'DIRECTOR'; end if;\n if mutation and operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH') then return 'SCORING'; end if;\n if mutation and operation_id in('SCORING.REOPEN_MATCH','DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then return 'DIRECTOR'; end if;\n raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\nend;\n",
    "new": "\nbegin\n if mutation and operation_id='DIRECTOR.PUBLISH_CALCUTTA' then return 'DIRECTOR';end if;\n if not mutation and operation_id='DIRECTOR.READ_CALCUTTA_PUBLICATION' then return 'DIRECTOR';end if;\n if mutation and operation_id='DIRECTOR.CONFIGURE_NET_SKINS' then return 'DIRECTOR'; end if;\n if not mutation and operation_id='DIRECTOR.READ_NET_SKINS_CONFIGURATION' then return 'DIRECTOR'; end if;\n if mutation and operation_id in('WORKERS.DELIVERY_TICK','WORKERS.FAIL_PRECLAIM','WORKERS.COMPETITION_CLAIM','WORKERS.COMPETITION_WRITE','WORKERS.COMPETITION_FAIL','WORKERS.INTELLIGENCE_CLAIM','WORKERS.INTELLIGENCE_WRITE','WORKERS.INTELLIGENCE_FAIL','WORKERS.CALCUTTA_CLAIM','WORKERS.CALCUTTA_COMPLETE','WORKERS.CALCUTTA_FAIL') then return 'WORKERS'; end if;\n if mutation and operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED') then return 'DIRECTOR'; end if;\n if not mutation and operation_id in('SCORING.READ_AUTHORITY','SCORING.READ_PARTICIPANT_CONTEXT','SCORING.READ_MUTATION_STATUS') then return 'READS'; end if;\n if not mutation and operation_id in('SCORING.READ_DIRECTOR_OPERATION_STATUS','DIRECTOR.READ_SETUP','DIRECTOR.READ_NET_SKINS','DIRECTOR.READ_CALCUTTA',\n  'DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS') then return 'DIRECTOR'; end if;\n if mutation and operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH') then return 'SCORING'; end if;\n if mutation and operation_id in('SCORING.REOPEN_MATCH','DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then return 'DIRECTOR'; end if;\n raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\nend;\n"
  },
  {
    "signature": "production_control.certification_ingress_required_v1(text)",
    "old_hash": "8c21bbe56b306995dc8451b2889c6d0c332a2136f5ef6ae77894ef01197bd916",
    "new_hash": "be5c6cc54f60443bc6bdd32f8e86ac71ec12f47395b0597f3a7c2e8aa6c9c8ab",
    "old": "\n select coalesce(operation_id=any(array['SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH',\n 'DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.CONFIGURE_NET_SKINS',\n 'DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION']),false)\n",
    "new": "\n select coalesce(operation_id=any(array['SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH',\n 'DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.PUBLISH_CALCUTTA',\n 'DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION']),false)\n"
  },
  {
    "signature": "production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)",
    "old_hash": "54a2c792062a83a7eccda779bf5364852aa58e78995d5e6f658be6b74beb4204",
    "new_hash": "8dea95b16851cbb1b972cd66ce85fe4573ce4941c4a870f7fe5cf83da5cb59de",
    "old": "\ndeclare\n operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;\n actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;\n status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');\nbegin\n if operation_id in('DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CONFIGURATION') then\n  return production_control.dispatch_certification_net_skins_configuration_v1(input,context,mutation);\n end if;\n if mutation and (operation_id like 'WORKERS.%' or operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED')) then\n  return production_control.dispatch_certification_derived_operation_v1(input,context);\n end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  return production_control.dispatch_certification_future_scoring_v1(input,context,mutation);\n end if;\n -- The marker is owner-only and revalidates registered resource/deployment,\n -- current pointer, admission revision and live ingress under transaction locks.\n perform production_control.assert_canonical_scoring_context_v1('{}'::jsonb,context,'RUNTIME');\n if jsonb_typeof(payload) is distinct from 'object' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n if status_read and (coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'\n  or coalesce(payload->>'original_context_token','') !~ '^[0-9a-f]{64}$') then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED'; end if;\n if payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',\n  'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token',\n  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',\n  'admission_revision','governance_tournament_id'] or (payload ? 'player_id' and not coalesce(\n   operation_id='DIRECTOR.CLEAR_CALCUTTA_AUCTION' or\n   (operation_id='DIRECTOR.MUTATE_SETUP' and payload->>'action'='assign-roster-team'),false)) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;\n if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')\n  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')\n  or (input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH'; end if;\n command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id',\n  'expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');\n if mutation and operation_id like 'SCORING.%' and command->>'mutation_key' is distinct from input->>'operation_request_id' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;\n if operation_id in('SCORING.REOPEN_MATCH') or operation_id like 'DIRECTOR.%' then\n  perform production_control.assert_production_scoring_actor(command,true);\n  actor_context:=context||jsonb_build_object('actor_player_id',input#>>'{authorization,player_id}',\n   'actor_auth_user_id',input#>>'{authorization,auth_user_id}','authorization',input->'authorization',\n   'operation_request_id',input->>'operation_request_id',\n   'resource_fingerprint',production_control.cutover_payload_hash(input->'resource'));\n end if;\n case operation_id\n when 'SCORING.READ_AUTHORITY' then\n  return production_control.canonical_read_scoring_authority_v2(command,context);\n when 'SCORING.READ_PARTICIPANT_CONTEXT' then\n  return production_control.canonical_read_scoring_participant_context_v2(command||jsonb_build_object(\n   'player_id',input#>>'{authorization,player_id}','auth_user_id',input#>>'{authorization,auth_user_id}',\n   'role',input#>>'{authorization,role}'),context);\n when 'SCORING.READ_MUTATION_STATUS' then\n  return production_control.read_score_mutation_status_v1(command,'2026');\n when 'SCORING.SUBMIT_HOLE' then\n  return production_control.canonical_submit_hole_score_v2(command,context);\n when 'SCORING.FINALIZE_MATCH' then\n  return production_control.canonical_finalize_match_v2(command,context);\n when 'SCORING.REOPEN_MATCH' then\n  return production_control.canonical_reopen_match_v2(command,context);\n when 'DIRECTOR.READ_SETUP' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:='read';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_SETUP' then family:='TOURNAMENT_SETUP'; action:=payload->>'action';\n when 'DIRECTOR.SETUP_STATUS' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:=payload->>'action';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_PAIRINGS' then family:='ROUND_PAIRINGS'; action:='replace-round-pairings';\n when 'DIRECTOR.MATCH_CONTROL' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.MATCH_CONTROL_STATUS' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.READ_NET_SKINS' then family:='NET_SKINS_ENTRIES'; action:='read';\n when 'DIRECTOR.SAVE_NET_SKINS_ENTRIES' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.NET_SKINS_STATUS' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.READ_CALCUTTA' then family:='CALCUTTA_MANAGEMENT'; action:='read';\n when 'DIRECTOR.CALCUTTA_STATUS' then family:='CALCUTTA_MANAGEMENT'; action:=payload->>'action';\n when 'DIRECTOR.REPLACE_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='replace-auction';\n when 'DIRECTOR.CLEAR_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='clear-entry';\n else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\n end case;\n dispatch_input:=input||jsonb_build_object('family',family,'action',action,'payload',payload-array['action','family','original_context_token']);\n if status_read then\n  -- The original token is receipt-hash provenance only. The current outer\n  -- context was freshly admitted and remains the sole execution authority.\n  dispatch_input:=dispatch_input||jsonb_build_object('mode','status','expected_context_token',payload->>'original_context_token');\n end if;\n if family in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n  return production_control.canonical_director_setup_operation_v2(dispatch_input,actor_context,mutation);\n end if;\n return production_control.canonical_director_financial_operation_v2(dispatch_input,actor_context,mutation);\nend;\n",
    "new": "\ndeclare\n operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;\n actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;\n status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');\nbegin\n if operation_id in('DIRECTOR.PUBLISH_CALCUTTA','DIRECTOR.READ_CALCUTTA_PUBLICATION') then\n  return production_control.dispatch_certification_calcutta_publication_v1(input,context,mutation);end if;\n if operation_id in('DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CONFIGURATION') then\n  return production_control.dispatch_certification_net_skins_configuration_v1(input,context,mutation);\n end if;\n if mutation and (operation_id like 'WORKERS.%' or operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED')) then\n  return production_control.dispatch_certification_derived_operation_v1(input,context);\n end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  return production_control.dispatch_certification_future_scoring_v1(input,context,mutation);\n end if;\n -- The marker is owner-only and revalidates registered resource/deployment,\n -- current pointer, admission revision and live ingress under transaction locks.\n perform production_control.assert_canonical_scoring_context_v1('{}'::jsonb,context,'RUNTIME');\n if jsonb_typeof(payload) is distinct from 'object' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n if status_read and (coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'\n  or coalesce(payload->>'original_context_token','') !~ '^[0-9a-f]{64}$') then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED'; end if;\n if payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',\n  'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token',\n  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',\n  'admission_revision','governance_tournament_id'] or (payload ? 'player_id' and not coalesce(\n   operation_id='DIRECTOR.CLEAR_CALCUTTA_AUCTION' or\n   (operation_id='DIRECTOR.MUTATE_SETUP' and payload->>'action'='assign-roster-team'),false)) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;\n if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')\n  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')\n  or (input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH'; end if;\n command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id',\n  'expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');\n if mutation and operation_id like 'SCORING.%' and command->>'mutation_key' is distinct from input->>'operation_request_id' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;\n if operation_id in('SCORING.REOPEN_MATCH') or operation_id like 'DIRECTOR.%' then\n  perform production_control.assert_production_scoring_actor(command,true);\n  actor_context:=context||jsonb_build_object('actor_player_id',input#>>'{authorization,player_id}',\n   'actor_auth_user_id',input#>>'{authorization,auth_user_id}','authorization',input->'authorization',\n   'operation_request_id',input->>'operation_request_id',\n   'resource_fingerprint',production_control.cutover_payload_hash(input->'resource'));\n end if;\n case operation_id\n when 'SCORING.READ_AUTHORITY' then\n  return production_control.canonical_read_scoring_authority_v2(command,context);\n when 'SCORING.READ_PARTICIPANT_CONTEXT' then\n  return production_control.canonical_read_scoring_participant_context_v2(command||jsonb_build_object(\n   'player_id',input#>>'{authorization,player_id}','auth_user_id',input#>>'{authorization,auth_user_id}',\n   'role',input#>>'{authorization,role}'),context);\n when 'SCORING.READ_MUTATION_STATUS' then\n  return production_control.read_score_mutation_status_v1(command,'2026');\n when 'SCORING.SUBMIT_HOLE' then\n  return production_control.canonical_submit_hole_score_v2(command,context);\n when 'SCORING.FINALIZE_MATCH' then\n  return production_control.canonical_finalize_match_v2(command,context);\n when 'SCORING.REOPEN_MATCH' then\n  return production_control.canonical_reopen_match_v2(command,context);\n when 'DIRECTOR.READ_SETUP' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:='read';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_SETUP' then family:='TOURNAMENT_SETUP'; action:=payload->>'action';\n when 'DIRECTOR.SETUP_STATUS' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:=payload->>'action';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_PAIRINGS' then family:='ROUND_PAIRINGS'; action:='replace-round-pairings';\n when 'DIRECTOR.MATCH_CONTROL' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.MATCH_CONTROL_STATUS' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.READ_NET_SKINS' then family:='NET_SKINS_ENTRIES'; action:='read';\n when 'DIRECTOR.SAVE_NET_SKINS_ENTRIES' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.NET_SKINS_STATUS' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.READ_CALCUTTA' then family:='CALCUTTA_MANAGEMENT'; action:='read';\n when 'DIRECTOR.CALCUTTA_STATUS' then family:='CALCUTTA_MANAGEMENT'; action:=payload->>'action';\n when 'DIRECTOR.REPLACE_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='replace-auction';\n when 'DIRECTOR.CLEAR_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='clear-entry';\n else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\n end case;\n dispatch_input:=input||jsonb_build_object('family',family,'action',action,'payload',payload-array['action','family','original_context_token']);\n if status_read then\n  -- The original token is receipt-hash provenance only. The current outer\n  -- context was freshly admitted and remains the sole execution authority.\n  dispatch_input:=dispatch_input||jsonb_build_object('mode','status','expected_context_token',payload->>'original_context_token');\n end if;\n if family in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n  return production_control.canonical_director_setup_operation_v2(dispatch_input,actor_context,mutation);\n end if;\n return production_control.canonical_director_financial_operation_v2(dispatch_input,actor_context,mutation);\nend;\n"
  },
  {
    "signature": "production_control.certification_ingress_canonical_receipt_v1(production_control.certification_ingress_leases_v1)",
    "old_hash": "e5fd779ec34e89796c49e7bd4fdab33f7a3084d7ffc111500c992c05b24d9419",
    "new_hash": "8a72561e4555af046c10f434474670ac693acd4ae489dedaa93ca62bf8ced0aa",
    "old": "\ndeclare value jsonb;action_name text;binding uuid;fp text;\nbegin\n if lease.operation_id like'SCORING.%'or lease.operation_id='DIRECTOR.MATCH_CONTROL'then\n  select m.result into value from scoring_authority.score_mutations m join scoring_authority.matches mt using(match_id)\n   where m.match_id=lease.match_id and m.mutation_key=lease.operation_request_id and mt.tournament_id=lease.tournament_id;\n elsif lease.operation_id in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS')then\n  action_name:=case lease.domain_action when'update-tournament'then'UPDATE_TOURNAMENT'when'update-team'then'UPDATE_TEAM'\n   when'assign-roster-team'then'ASSIGN_ROSTER_TEAM'when'update-round'then'UPDATE_ROUND'when'upsert-course'then'UPSERT_COURSE'\n   when'upsert-match'then'UPSERT_MATCH'when'replace-pairings'then'REPLACE_PAIRINGS'when'prepare-scoring-context'then'PREPARE_SCORING_CONTEXT'\n   when'replace-round-pairings'then'REPLACE_ROUND_PAIRINGS'end;\n  select r.response into value from production_control.tournament_setup_operation_receipts_v1 r\n   where r.tournament_id=lease.tournament_id and r.action=action_name and r.operation_request_id=lease.operation_request_id::uuid;\n elsif lease.operation_id='DIRECTOR.CONFIGURE_NET_SKINS' then\n  return production_control.certification_net_skins_configuration_receipt_v1(lease);\n elsif lease.operation_id='DIRECTOR.SAVE_NET_SKINS_ENTRIES'then\n  select r.response into value from production_control.net_skins_entry_revisions_v1 r\n   where r.tournament_id=lease.tournament_id and r.request_id=lease.operation_request_id::uuid;\n elsif lease.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')then\n  select a.binding_id into strict binding from production_control.certification_admission_v1 a where resource_id=lease.resource_id;\n  action_name:=case lease.operation_id when'DIRECTOR.REPLACE_CALCUTTA_AUCTION'then'replace-auction'else'clear-entry'end;\n  fp:=production_control.calcutta_v1_hash(jsonb_build_object('binding_id',binding::text,'family','CALCUTTA_MANAGEMENT',\n   'action',action_name,'operation_request_id',lease.operation_request_id));\n  select r.response into value from production_control.cutover_operation_receipts r where request_fingerprint=fp;\n end if;\n return value;\nend;",
    "new": "\ndeclare value jsonb;action_name text;binding uuid;fp text;\nbegin\n if lease.operation_id like'SCORING.%'or lease.operation_id='DIRECTOR.MATCH_CONTROL'then\n  select m.result into value from scoring_authority.score_mutations m join scoring_authority.matches mt using(match_id)\n   where m.match_id=lease.match_id and m.mutation_key=lease.operation_request_id and mt.tournament_id=lease.tournament_id;\n elsif lease.operation_id in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS')then\n  action_name:=case lease.domain_action when'update-tournament'then'UPDATE_TOURNAMENT'when'update-team'then'UPDATE_TEAM'\n   when'assign-roster-team'then'ASSIGN_ROSTER_TEAM'when'update-round'then'UPDATE_ROUND'when'upsert-course'then'UPSERT_COURSE'\n   when'upsert-match'then'UPSERT_MATCH'when'replace-pairings'then'REPLACE_PAIRINGS'when'prepare-scoring-context'then'PREPARE_SCORING_CONTEXT'\n   when'replace-round-pairings'then'REPLACE_ROUND_PAIRINGS'end;\n  select r.response into value from production_control.tournament_setup_operation_receipts_v1 r\n   where r.tournament_id=lease.tournament_id and r.action=action_name and r.operation_request_id=lease.operation_request_id::uuid;\n elsif lease.operation_id='DIRECTOR.PUBLISH_CALCUTTA' then\n  fp:=production_control.calcutta_v1_hash(jsonb_build_object('contract','certification-calcutta-publication-v1',\n    'resource_id',lease.resource_id,'operation_request_id',lease.operation_request_id));\n  select r.response into value from production_control.cutover_operation_receipts r\n    where r.request_fingerprint=fp and r.operation='CALCUTTA_V1_PUBLISH' and r.actor=lease.actor_player_id;\n elsif lease.operation_id='DIRECTOR.CONFIGURE_NET_SKINS' then\n  return production_control.certification_net_skins_configuration_receipt_v1(lease);\n elsif lease.operation_id='DIRECTOR.SAVE_NET_SKINS_ENTRIES'then\n  select r.response into value from production_control.net_skins_entry_revisions_v1 r\n   where r.tournament_id=lease.tournament_id and r.request_id=lease.operation_request_id::uuid;\n elsif lease.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')then\n  select a.binding_id into strict binding from production_control.certification_admission_v1 a where resource_id=lease.resource_id;\n  action_name:=case lease.operation_id when'DIRECTOR.REPLACE_CALCUTTA_AUCTION'then'replace-auction'else'clear-entry'end;\n  fp:=production_control.calcutta_v1_hash(jsonb_build_object('binding_id',binding::text,'family','CALCUTTA_MANAGEMENT',\n   'action',action_name,'operation_request_id',lease.operation_request_id));\n  select r.response into value from production_control.cutover_operation_receipts r where request_fingerprint=fp;\n end if;\n return value;\nend;"
  },
  {
    "signature": "public.read_certification_director_recovery_material_v1(jsonb)",
    "old_hash": "be0134c5cf95c57d56123b7a41185ef8c12f43dd314b3ac180327cf5f6875b05",
    "new_hash": "32d5ad0f97373e7e3ca4143a88fdfdcbd9f9bce1056c7a771e3a60ea5de55aca",
    "old": "\ndeclare l production_control.certification_ingress_leases_v1%rowtype; result jsonb;\nbegin\n if input->>'operation_id' not in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL',\n   'DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')\n  or input->>'operation_id' is null or input#>>'{authorization,role}' is distinct from 'DIRECTOR'\n  or input->>'phase' is distinct from 'DIRECTOR' or jsonb_typeof(input->'payload') is distinct from 'object'\n  or exists(select 1 from jsonb_object_keys(input->'payload') k where k<>'match_id')\n  or(input->>'operation_id'<>'DIRECTOR.MATCH_CONTROL' and input->'payload'<>'{}'::jsonb) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_RECOVERY_AUTHORIZATION_REQUIRED';end if;\n l:=production_control.certification_ingress_lookup_v1(input,false);\n if l.lease_id is null then\n  return jsonb_build_object('ok',true,'contract','certification-ingress-v1','state','UNKNOWN','lease_id',null,\n   'operation_request_id',input->>'operation_request_id');end if;\n -- The136 reader independently checks terminal/canonical receipt consistency.\n result:=public.read_certification_ingress_status_v1(input);\n result:=result||jsonb_build_object('admission_context',l.admission_context);\n if l.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then\n  if l.predecessor_auction_revision is null then\n   raise exception using errcode='55000',message='CERTIFICATION_OPERATION_RECOVERY_PROVENANCE_REQUIRED';end if;\n  result:=result||jsonb_build_object('predecessor_projection',production_control.director_calcutta_management_projection_v1(\n   l.tournament_id,l.predecessor_auction_revision));\n end if;\n return result;\nend;",
    "new": "\ndeclare l production_control.certification_ingress_leases_v1%rowtype; result jsonb;\nbegin\n if input->>'operation_id' not in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL',\n   'DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.PUBLISH_CALCUTTA','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')\n  or input->>'operation_id' is null or input#>>'{authorization,role}' is distinct from 'DIRECTOR'\n  or input->>'phase' is distinct from 'DIRECTOR' or jsonb_typeof(input->'payload') is distinct from 'object'\n  or exists(select 1 from jsonb_object_keys(input->'payload') k where k<>'match_id')\n  or(input->>'operation_id'<>'DIRECTOR.MATCH_CONTROL' and input->'payload'<>'{}'::jsonb) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_RECOVERY_AUTHORIZATION_REQUIRED';end if;\n l:=production_control.certification_ingress_lookup_v1(input,false);\n if l.lease_id is null then\n  return jsonb_build_object('ok',true,'contract','certification-ingress-v1','state','UNKNOWN','lease_id',null,\n   'operation_request_id',input->>'operation_request_id');end if;\n -- The136 reader independently checks terminal/canonical receipt consistency.\n result:=public.read_certification_ingress_status_v1(input);\n result:=result||jsonb_build_object('admission_context',l.admission_context);\n if l.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then\n  if l.predecessor_auction_revision is null then\n   raise exception using errcode='55000',message='CERTIFICATION_OPERATION_RECOVERY_PROVENANCE_REQUIRED';end if;\n  result:=result||jsonb_build_object('predecessor_projection',production_control.director_calcutta_management_projection_v1(\n   l.tournament_id,l.predecessor_auction_revision));\n end if;\n return result;\nend;"
  },
  {
    "signature": "public.read_production_calcutta_frozen_2026_v1(jsonb)",
    "old_hash": "00ee60cdd4e4a7db4be3bac4f110e46c7af266e1bea6a8926c7c4798f04e2d31",
    "new_hash": "cfb40103bd3d7402dcb3da3160308cc72bf536773666ef7eca28d4ece3367a25",
    "old": "\ndeclare\n  started_at timestamptz := pg_catalog.clock_timestamp();\n  current_value scoring_authority.calcutta_v1_current%rowtype;\n  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;\n  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;\n  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;\n  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;\n  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;\n  source_revision_value jsonb;\n  source_fingerprint_value text;\n  completed_rounds_value integer[] := '{}'::integer[];\n  market_value jsonb;\n  participant_result_value jsonb;\n  state_value text;\n  revision_value text;\n  result_is_fresh boolean := false;\n  result_is_stale boolean := false;\n  updating_value boolean := false;\n  expose_result boolean := false;\n  participant_player text := pg_catalog.btrim(coalesce(\n    input->>'player_id', ''\n  ));\nbegin\n  perform production_control.assert_production_service_role();\n  perform production_control.assert_production_cutover_read_scope(\n    input, 'OBSERVATION'\n  );\n  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'\n     or input->>'tournament_id' is distinct from '2026'\n     or not production_control.native_calcutta_reader_v1(participant_player,'2026',nullif(input->>'observer_auth_user_id','')::uuid) then\n    raise exception using errcode = '42501',\n      message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESOURCE_REQUIRED';\n  end if;\n\n  select value.* into strict current_value\n  from scoring_authority.calcutta_v1_current value\n  where value.tournament_id = '2026';\n  select value.* into strict configuration_value\n  from scoring_authority.calcutta_v1_configuration_revisions value\n  where value.configuration_revision_id =\n    current_value.configuration_revision_id;\n\n  if current_value.auction_revision > 0 then\n    select value.* into strict auction_value\n    from scoring_authority.calcutta_v1_auction_fact_revisions value\n    where value.auction_revision_id = current_value.auction_revision_id;\n    source_revision_value :=\n      production_control.calcutta_v1_source_revision('2026');\n    source_fingerprint_value := production_control.calcutta_v1_hash(\n      source_revision_value\n    );\n    completed_rounds_value :=\n      production_control.calcutta_v1_completed_rounds();\n\n    select value.* into result_value\n    from scoring_authority.calcutta_v1_result_revisions value\n    where value.tournament_id = '2026'\n      and value.configuration_revision = current_value.configuration_revision\n      and value.configuration_fingerprint =\n        current_value.configuration_fingerprint\n      and value.auction_revision = current_value.auction_revision\n      and value.auction_fingerprint = current_value.auction_fingerprint\n      and value.is_current\n    limit 1;\n    result_is_fresh := result_value.result_id is not null\n      and (result_value.source_fingerprint = source_fingerprint_value or production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value));\n    result_is_stale := result_value.result_id is not null\n      and result_value.source_fingerprint <> source_fingerprint_value and not production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value);\n\n    select value.* into job_value\n    from scoring_authority.calcutta_v1_recalculation_jobs value\n    where value.tournament_id = '2026'\n      and value.configuration_revision = current_value.configuration_revision\n      and value.configuration_fingerprint =\n        current_value.configuration_fingerprint\n      and value.auction_revision = current_value.auction_revision\n      and value.auction_fingerprint = current_value.auction_fingerprint\n      and value.source_fingerprint = source_fingerprint_value\n    order by value.requested_at desc, value.job_id desc\n    limit 1;\n    updating_value := (job_value.job_id is not null\n      and job_value.status in ('PENDING', 'RUNNING'))\n      or exists (select 1 from scoring_authority.score_derived_intents_v1 intent\n        where intent.tournament_id = '2026' and intent.family = 'CALCUTTA'\n          and intent.status in ('PENDING', 'RETRYABLE'));\n  end if;\n\n  if current_value.publication_revision > 0 then\n    select value.* into strict publication_value\n    from scoring_authority.calcutta_v1_publication_revisions value\n    where value.publication_revision_id =\n      current_value.publication_revision_id;\n  end if;\n\n  state_value := case\n    when current_value.state = 'NOT_CONFIGURED' then 'NOT_CONFIGURED'\n    when current_value.auction_revision = 0 then 'CONFIGURED'\n    when result_is_fresh and result_value.result_state = 'OFFICIAL'\n      then 'OFFICIAL'\n    when result_is_fresh\n      and pg_catalog.jsonb_array_length(\n        result_value.engine_result_payload->'completedRounds'\n      ) > 0 then 'IN_PROGRESS'\n    when result_is_fresh then 'AUCTION_COMPLETE'\n    -- A Reopen invalidates OFFICIAL semantics immediately. Withhold the old\n    -- payload until the worker commits a new canonical revision.\n    when result_is_stale and updating_value\n      and result_value.result_state = 'OFFICIAL'\n      and not (3 = any(completed_rounds_value)) then 'UNAVAILABLE'\n    when result_is_stale and updating_value\n      and result_value.result_state = 'OFFICIAL'\n      then 'OFFICIAL'\n    when result_is_stale and updating_value\n      and pg_catalog.jsonb_array_length(\n        result_value.engine_result_payload->'completedRounds'\n      ) > 0 then 'IN_PROGRESS'\n    when result_is_stale and updating_value then 'AUCTION_COMPLETE'\n    when result_is_stale then 'UNAVAILABLE'\n    when job_value.job_id is not null and job_value.status = 'FAILED'\n      then 'UNAVAILABLE'\n    else 'AUCTION_COMPLETE'\n  end;\n\n  expose_result := current_value.publication_state = 'PUBLISHED'\n    and result_value.result_id is not null\n    and state_value <> 'UNAVAILABLE';\n\n  if current_value.publication_state = 'PUBLISHED' then\n    market_value := pg_catalog.jsonb_build_object(\n      'pot', (auction_value.auction_manifest->>'pot')::numeric::text,\n      'purchases', coalesce((\n        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(\n          'player', pg_catalog.jsonb_build_object(\n            'player_id', purchase->>'player_id',\n            'display_name', entrant.display_name\n          ),\n          'purchase_price',\n            (purchase->>'purchase_price')::numeric::text,\n          'owners', coalesce((\n            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(\n              'player', pg_catalog.jsonb_build_object(\n                'player_id', ownership->>'owner_player_id',\n                'display_name', owner_player.display_name\n              ),\n              'ownership_fraction',\n                (ownership->>'ownership_fraction')::numeric::text\n            ) order by ownership->>'owner_player_id')\n            from pg_catalog.jsonb_array_elements(\n              auction_value.auction_manifest->'ownership'\n            ) ownership\n            join scoring_authority.players owner_player\n              on owner_player.player_id = ownership->>'owner_player_id'\n            where ownership->>'player_id' = purchase->>'player_id'\n          ), '[]'::jsonb)\n        ) order by purchase->>'player_id')\n        from pg_catalog.jsonb_array_elements(\n          auction_value.auction_manifest->'purchases'\n        ) purchase\n        join scoring_authority.players entrant\n          on entrant.player_id = purchase->>'player_id'\n      ), '[]'::jsonb)\n    );\n  else\n    market_value := null;\n  end if;\n  participant_result_value := case when expose_result\n    then production_control.project_production_calcutta_v1_result(\n      result_value.engine_result_payload\n    ) else null end;\n\n  revision_value := pg_catalog.format(\n    'calcutta-v1:%s:%s:%s:%s:%s:%s',\n    current_value.configuration_revision,\n    current_value.auction_revision,\n    current_value.publication_revision,\n    case when result_value.result_id is null\n      then 0 else result_value.result_revision end,\n    state_value, current_value.publication_state\n  );\n\n  return pg_catalog.jsonb_build_object(\n    'ok', true,\n    'data', pg_catalog.jsonb_build_object(\n      'contract_version', 'production-calcutta-v1',\n      'tournament_id', '2026',\n      'state', state_value,\n      'publication_policy',\n        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',\n      'publication_state', current_value.publication_state,\n      'published', current_value.publication_state = 'PUBLISHED',\n      'currency_code', 'USD',\n      'configuration_revision', current_value.configuration_revision,\n      'auction_revision', current_value.auction_revision,\n      'publication_revision', current_value.publication_revision,\n      'result_revision', case when result_value.result_id is null\n        then null else result_value.result_revision end,\n      'configuration_fingerprint', case\n        when state_value = 'NOT_CONFIGURED' then null\n        else current_value.configuration_fingerprint end,\n      'auction_fingerprint', current_value.auction_fingerprint,\n      'result_fingerprint', case when result_value.result_id is null\n        then null else result_value.payload_hash end,\n      'revision', revision_value,\n      'freshness', pg_catalog.jsonb_build_object(\n        'stale', result_is_stale, 'lifecycle_compatible', production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value), 'original_result_source_fingerprint', result_value.source_fingerprint,\n        'updating', updating_value,\n        'configured_at', configuration_value.configured_at,\n        'auction_recorded_at', auction_value.recorded_at,\n        'published_at', case\n          when current_value.publication_state = 'PUBLISHED'\n            then publication_value.published_at\n          else null end,\n        'calculated_at', result_value.calculated_at,\n        'source_fingerprint', source_fingerprint_value\n      ),\n      'market', market_value,\n      'result', participant_result_value,\n      'query_ms', pg_catalog.round(extract(epoch from\n        (pg_catalog.clock_timestamp() - started_at)) * 1000, 3)\n    )\n  );\nend;\n",
    "new": "begin return production_control.canonical_read_published_calcutta_v1(input,null); end;"
  },
  {
    "signature": "public.read_certification_projection_v1(jsonb)",
    "old_hash": "06c9133ed64cce969baa6f56de6533b4e5386fa1b9ed0ea38089870e84764504",
    "new_hash": "b2a5f297dc9b07dddb10de715b6adb4677b7738ffe6fd118253c5deab46c1bee",
    "old": "\ndeclare context jsonb; payload jsonb:=coalesce(input->'payload','{}'); result jsonb;\nbegin\n context:=production_control.push_certification_context_v1(input,'READS',false);\n if input->>'operation'='READS.CLOSED_HISTORY_2026'then\n  result:=production_control.certification_closed_history_2026_read_v1(payload,context);\n  perform production_control.pop_certification_context_v1();return result;end if;\n if input->>'operation'='READS.CLOSED_TOURNAMENT'then\n  result:=production_control.certification_closed_tournament_read_v1(payload,context);\n  perform production_control.pop_certification_context_v1();return result;end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  perform production_control.assert_current_certification_future_context_v1(context);\n  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('TOURNAMENT_LIVE','PARTICIPANT_HOME','MY_MATCH','GAME_CENTER')then\n   result:=production_control.certification_successor_current_read_v1(payload,context);\n   perform production_control.pop_certification_context_v1();return result;end if;\n  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('LEADERBOARDS','NET_SKINS_RESULT','COMPETITION_DERIVED','PUBLISHED_ODDS')then\n   result:=production_control.certification_worker_current_projection_v1(payload,context);\n   perform production_control.pop_certification_context_v1();return result;end if;\n  if jsonb_typeof(payload) is distinct from 'object' or payload->>'target_tournament_id' is distinct from context->>'tournament_id'\n   or exists(select 1 from jsonb_object_keys(payload) k where k not in('target_auth_user_id','target_player_id','target_tournament_id')) then\n   raise exception using errcode='42501',message='CERTIFICATION_READ_TARGET_DENIED';end if;\n  case input->>'operation'\n  when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_future_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n  when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_future_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);\n  when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_future_director_entitlement_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n  else raise exception using errcode='42501',message='CERTIFICATION_FUTURE_READ_OPERATION_DENIED';end case;\n  perform production_control.pop_certification_context_v1();return result;\n end if;\n perform production_control.assert_certification_read_v1(context,payload);\n case input->>'operation'\n when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,coalesce(payload->>'target_tournament_id','2026'),context);\n when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);\n when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_director_entitlement_read_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n when 'READS.CURRENT_VIEW' then result:=production_control.canonical_current_view_read_v1(payload,context);\n when 'READS.HISTORY_2026' then result:=production_control.canonical_current_view_read_v1(payload||jsonb_build_object('surface','HISTORY_2026'),context);\n when 'READS.COMPLETED_HISTORY' then result:=production_control.canonical_completed_history_read_v1(payload,context);\n when 'READS.DRAFT' then result:=production_control.canonical_draft_read_v1(payload,context);\n when 'READS.GUIDE' then result:=production_control.canonical_guide_read_v1(payload||jsonb_build_object('domain','GUIDE',\n  'contract_version','guide-projection-v1','source_tabs',\n  '[\"Tournaments\",\"Guide Sections\",\"Tournament Itinerary\",\"Tournament Timeline\",\"Rule Book\",\"Tournament Rules\",\"Rounds\",\"Dining\",\"Local Guide\",\"Important Contacts\",\"Courses\"]'::jsonb),context);\n when 'READS.PREDICTION_SETTINGS' then result:=production_control.canonical_projection_read_v1(payload||jsonb_build_object('domain','PREDICTION_SETTINGS',\n  'contract_version','prediction-settings-v1','source_tabs','[\"Prediction Settings\"]'::jsonb),\n  'PREDICTION_SETTINGS','prediction-settings-v1','[\"Prediction Settings\"]'::jsonb,context);\n when 'READS.PLAYER_EDITORIAL' then result:=production_control.canonical_player_editorial_read_v1(payload||jsonb_build_object('domain','PLAYER_EDITORIAL',\n  'contract_version','player-public-profile-v1','source_tabs','[\"Players\"]'::jsonb),context);\n else raise exception using errcode='42501',message='CERTIFICATION_READ_OPERATION_DENIED';\n end case;\n perform production_control.pop_certification_context_v1();\n return result;\nend;\n",
    "new": "\ndeclare context jsonb; payload jsonb:=coalesce(input->'payload','{}'); result jsonb;\nbegin\n context:=production_control.push_certification_context_v1(input,'READS',false);\n if input->>'operation'='READS.CLOSED_HISTORY_2026'then\n  result:=production_control.certification_closed_history_2026_read_v1(payload,context);\n  perform production_control.pop_certification_context_v1();return result;end if;\n if input->>'operation'='READS.CLOSED_TOURNAMENT'then\n  result:=production_control.certification_closed_tournament_read_v1(payload,context);\n  perform production_control.pop_certification_context_v1();return result;end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  perform production_control.assert_current_certification_future_context_v1(context);\n  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('TOURNAMENT_LIVE','PARTICIPANT_HOME','MY_MATCH','GAME_CENTER')then\n   result:=production_control.certification_successor_current_read_v1(payload,context);\n   perform production_control.pop_certification_context_v1();return result;end if;\n  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('LEADERBOARDS','NET_SKINS_RESULT','COMPETITION_DERIVED','PUBLISHED_ODDS')then\n   result:=production_control.certification_worker_current_projection_v1(payload,context);\n   perform production_control.pop_certification_context_v1();return result;end if;\n  if jsonb_typeof(payload) is distinct from 'object' or payload->>'target_tournament_id' is distinct from context->>'tournament_id'\n   or exists(select 1 from jsonb_object_keys(payload) k where k not in('target_auth_user_id','target_player_id','target_tournament_id')) then\n   raise exception using errcode='42501',message='CERTIFICATION_READ_TARGET_DENIED';end if;\n  case input->>'operation'\n  when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_future_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n  when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_future_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);\n  when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_future_director_entitlement_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n  else raise exception using errcode='42501',message='CERTIFICATION_FUTURE_READ_OPERATION_DENIED';end case;\n  perform production_control.pop_certification_context_v1();return result;\n end if;\n perform production_control.assert_certification_read_v1(context,payload);\n case input->>'operation'\n when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,coalesce(payload->>'target_tournament_id','2026'),context);\n when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);\n when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_director_entitlement_read_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n when 'READS.PUBLISHED_CALCUTTA' then\n  if exists(select 1 from jsonb_object_keys(payload)k where k not in('target_tournament_id','player_id')) then\n    raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PARTICIPANT_READ_DENIED';end if;\n  result:=production_control.canonical_read_published_calcutta_v1(jsonb_build_object(\n    'tournament_id',context->>'tournament_id','player_id',payload->>'player_id'),context);\n when 'READS.CURRENT_VIEW' then result:=production_control.canonical_current_view_read_v1(payload,context);\n when 'READS.HISTORY_2026' then result:=production_control.canonical_current_view_read_v1(payload||jsonb_build_object('surface','HISTORY_2026'),context);\n when 'READS.COMPLETED_HISTORY' then result:=production_control.canonical_completed_history_read_v1(payload,context);\n when 'READS.DRAFT' then result:=production_control.canonical_draft_read_v1(payload,context);\n when 'READS.GUIDE' then result:=production_control.canonical_guide_read_v1(payload||jsonb_build_object('domain','GUIDE',\n  'contract_version','guide-projection-v1','source_tabs',\n  '[\"Tournaments\",\"Guide Sections\",\"Tournament Itinerary\",\"Tournament Timeline\",\"Rule Book\",\"Tournament Rules\",\"Rounds\",\"Dining\",\"Local Guide\",\"Important Contacts\",\"Courses\"]'::jsonb),context);\n when 'READS.PREDICTION_SETTINGS' then result:=production_control.canonical_projection_read_v1(payload||jsonb_build_object('domain','PREDICTION_SETTINGS',\n  'contract_version','prediction-settings-v1','source_tabs','[\"Prediction Settings\"]'::jsonb),\n  'PREDICTION_SETTINGS','prediction-settings-v1','[\"Prediction Settings\"]'::jsonb,context);\n when 'READS.PLAYER_EDITORIAL' then result:=production_control.canonical_player_editorial_read_v1(payload||jsonb_build_object('domain','PLAYER_EDITORIAL',\n  'contract_version','player-public-profile-v1','source_tabs','[\"Players\"]'::jsonb),context);\n else raise exception using errcode='42501',message='CERTIFICATION_READ_OPERATION_DENIED';\n end case;\n perform production_control.pop_certification_context_v1();\n return result;\nend;\n"
  }
]$manifest$;p jsonb;before_metadata jsonb;after_metadata jsonb;h text;definition text;begin
 -- Check every predecessor before creating shared cores or changing a wrapper.
 for p in select value from jsonb_array_elements(m)loop
  select encode(extensions.digest(prosrc,'sha256'),'hex')into strict h from pg_proc where oid=(p->>'signature')::regprocedure;
  if h not in(p->>'old_hash',p->>'new_hash')then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_PREDECESSOR_MISMATCH: %',p->>'signature';end if;
 end loop;
 if to_regprocedure('production_control.canonical_publish_calcutta_v1(jsonb,jsonb)')is null then
execute $core$CREATE OR REPLACE FUNCTION production_control.canonical_publish_calcutta_v1(input jsonb, context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_value jsonb;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  source_fingerprint text;
  affected_rows bigint;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  actor_player text := pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  ));
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
begin
  if context is null then
    perform production_control.assert_production_calcutta_v1_runtime(input);
  else
    perform production_control.assert_canonical_scoring_context_v1(input,context,'RUNTIME');
    if context->>'phase' is distinct from 'DIRECTOR'
      or context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
      or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu' then
      raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PUBLICATION_TARGET_DENIED';
    end if;
    -- Match/source mutations lock access/setup before match rows. Use that
    -- same order so current-result validation and publication are atomic.
    perform pg_advisory_xact_lock(hashtextextended('production-access-governance-v1:2026',0));
    perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));
    perform 1 from scoring_authority.matches m where m.tournament_id='2026' order by m.match_id for share;
  end if;
  perform production_control.assert_production_scoring_actor(input, true);
  existing_response := production_control.lookup_cutover_receipt(
    'CALCUTTA_V1_PUBLISH', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026'
  for update;
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
  if current_value.state = 'NOT_CONFIGURED'
     or current_value.auction_revision = 0
     or current_value.auction_revision_id is null then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CALCUTTA_AUCTION_FACTS_REQUIRED';
  end if;

  if context is not null then
    source_fingerprint:=production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'));
    select r.* into result_value from scoring_authority.calcutta_v1_result_revisions r
      where r.tournament_id='2026' and r.is_current and r.result_revision=current_value.result_revision
        and r.configuration_revision=current_value.configuration_revision
        and r.configuration_fingerprint=current_value.configuration_fingerprint
        and r.auction_revision=current_value.auction_revision
        and r.auction_fingerprint=current_value.auction_fingerprint;
    if not found or result_value.source_fingerprint is distinct from source_fingerprint
      or result_value.result_revision is distinct from (input->>'expected_result_revision')::bigint
      or source_fingerprint is distinct from input->>'expected_source_fingerprint' then
      raise exception using errcode='PT409',message='PRODUCTION_CALCUTTA_RESULT_SOURCE_CONFLICT';
    end if;
  end if;

  if current_value.publication_state = 'PUBLISHED' then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_CALCUTTA_V1_ALREADY_PUBLISHED',
      'state', current_value.state,
      'publication_state', 'PUBLISHED',
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'job', null,
      'idempotent', true
    );
    perform production_control.store_cutover_receipt(
      'CALCUTTA_V1_PUBLISH', input, response_value
    );
    return response_value;
  end if;

  insert into scoring_authority.calcutta_v1_publication_revisions (
    tournament_id, publication_revision, configuration_revision,
    auction_revision, configuration_fingerprint, auction_fingerprint,
    publication_state, action, actor_player_id, actor_auth_user_id,
    request_fingerprint, request_payload_hash, published_at
  ) values (
    '2026', current_value.publication_revision + 1,
    current_value.configuration_revision, current_value.auction_revision,
    current_value.configuration_fingerprint,
    current_value.auction_fingerprint, 'PUBLISHED',
    'DIRECTOR_PUBLISHED', actor_player, actor_auth_user,
    request_fingerprint_value,
    production_control.calcutta_v1_hash(input), pg_catalog.now()
  ) returning * into publication_value;

  update scoring_authority.calcutta_v1_current
  set publication_revision_id = publication_value.publication_revision_id,
      publication_revision = publication_value.publication_revision,
      publication_state = 'PUBLISHED', updated_at = pg_catalog.now()
  where tournament_id = '2026';

  get diagnostics affected_rows=row_count;
  if affected_rows<>1 then raise exception using errcode='PT409',message='PRODUCTION_CALCUTTA_PUBLICATION_POINTER_DRIFT';end if;

  job_value := production_control.enqueue_production_calcutta_v1(
    'DIRECTOR_PUBLISHED', actor_player, false, null, null
  );
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_CALCUTTA_V1_PUBLISHED', actor_player,
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'configuration_fingerprint', current_value.configuration_fingerprint,
      'auction_revision', current_value.auction_revision,
      'auction_fingerprint', current_value.auction_fingerprint,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_CALCUTTA_V1_PUBLISHED', 'CALCUTTA', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', current_value.auction_revision,
      'publication_revision', current_value.publication_revision,
      'result_revision', nullif(current_value.result_revision, 0),
      'job_id', job_value->>'job_id'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_CALCUTTA_V1_PUBLISHED',
    'state', current_value.state,
    'publication_state', 'PUBLISHED',
    'configuration_revision', current_value.configuration_revision,
    'configuration_fingerprint', current_value.configuration_fingerprint,
    'auction_revision', current_value.auction_revision,
    'auction_fingerprint', current_value.auction_fingerprint,
    'publication_revision', current_value.publication_revision,
    'result_revision', nullif(current_value.result_revision, 0),
    'job', job_value,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'CALCUTTA_V1_PUBLISH', input, response_value
  );
  return response_value;
end;
$function$
;$core$;
execute $reader$CREATE OR REPLACE FUNCTION production_control.canonical_read_published_calcutta_v1(input jsonb, context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  started_at timestamptz := pg_catalog.clock_timestamp();
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  job_value scoring_authority.calcutta_v1_recalculation_jobs%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  completed_rounds_value integer[] := '{}'::integer[];
  market_value jsonb;
  participant_result_value jsonb;
  state_value text;
  revision_value text;
  result_is_fresh boolean := false;
  result_is_stale boolean := false;
  updating_value boolean := false;
  expose_result boolean := false;
  participant_player text := pg_catalog.btrim(coalesce(
    input->>'player_id', ''
  ));
begin
  perform production_control.assert_production_service_role();
  if context is null then
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026'
     or not production_control.native_calcutta_reader_v1(participant_player,'2026',nullif(input->>'observer_auth_user_id','')::uuid) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_CALCUTTA_PARTICIPANT_RESOURCE_REQUIRED';
  end if;
  else
    perform production_control.assert_canonical_scoring_context_v1(input,context,'RUNTIME');
    if context->>'phase' is distinct from 'READS'
      or context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
      or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'
      or input ? 'observer_auth_user_id'
      or not production_control.native_calcutta_reader_v1(participant_player,'2026',null::uuid) then
      raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PARTICIPANT_READ_DENIED';end if;
  end if;

  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  select value.* into strict configuration_value
  from scoring_authority.calcutta_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;

  if current_value.auction_revision > 0 then
    select value.* into strict auction_value
    from scoring_authority.calcutta_v1_auction_fact_revisions value
    where value.auction_revision_id = current_value.auction_revision_id;
    source_revision_value :=
      production_control.calcutta_v1_source_revision('2026');
    source_fingerprint_value := production_control.calcutta_v1_hash(
      source_revision_value
    );
    completed_rounds_value :=
      production_control.calcutta_v1_completed_rounds();

    select value.* into result_value
    from scoring_authority.calcutta_v1_result_revisions value
    where value.tournament_id = '2026'
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.is_current
    limit 1;
    result_is_fresh := result_value.result_id is not null
      and (result_value.source_fingerprint = source_fingerprint_value or production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value));
    result_is_stale := result_value.result_id is not null
      and result_value.source_fingerprint <> source_fingerprint_value and not production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value);

    select value.* into job_value
    from scoring_authority.calcutta_v1_recalculation_jobs value
    where value.tournament_id = '2026'
      and value.configuration_revision = current_value.configuration_revision
      and value.configuration_fingerprint =
        current_value.configuration_fingerprint
      and value.auction_revision = current_value.auction_revision
      and value.auction_fingerprint = current_value.auction_fingerprint
      and value.source_fingerprint = source_fingerprint_value
    order by value.requested_at desc, value.job_id desc
    limit 1;
    updating_value := (job_value.job_id is not null
      and job_value.status in ('PENDING', 'RUNNING'))
      or exists (select 1 from scoring_authority.score_derived_intents_v1 intent
        where intent.tournament_id = '2026' and intent.family = 'CALCUTTA'
          and intent.status in ('PENDING', 'RETRYABLE'));
  end if;

  if current_value.publication_revision > 0 then
    select value.* into strict publication_value
    from scoring_authority.calcutta_v1_publication_revisions value
    where value.publication_revision_id =
      current_value.publication_revision_id;
  end if;

  state_value := case
    when current_value.state = 'NOT_CONFIGURED' then 'NOT_CONFIGURED'
    when current_value.auction_revision = 0 then 'CONFIGURED'
    when result_is_fresh and result_value.result_state = 'OFFICIAL'
      then 'OFFICIAL'
    when result_is_fresh
      and pg_catalog.jsonb_array_length(
        result_value.engine_result_payload->'completedRounds'
      ) > 0 then 'IN_PROGRESS'
    when result_is_fresh then 'AUCTION_COMPLETE'
    -- A Reopen invalidates OFFICIAL semantics immediately. Withhold the old
    -- payload until the worker commits a new canonical revision.
    when result_is_stale and updating_value
      and result_value.result_state = 'OFFICIAL'
      and not (3 = any(completed_rounds_value)) then 'UNAVAILABLE'
    when result_is_stale and updating_value
      and result_value.result_state = 'OFFICIAL'
      then 'OFFICIAL'
    when result_is_stale and updating_value
      and pg_catalog.jsonb_array_length(
        result_value.engine_result_payload->'completedRounds'
      ) > 0 then 'IN_PROGRESS'
    when result_is_stale and updating_value then 'AUCTION_COMPLETE'
    when result_is_stale then 'UNAVAILABLE'
    when job_value.job_id is not null and job_value.status = 'FAILED'
      then 'UNAVAILABLE'
    else 'AUCTION_COMPLETE'
  end;

  expose_result := current_value.publication_state = 'PUBLISHED'
    and result_value.result_id is not null
    and state_value <> 'UNAVAILABLE';

  if current_value.publication_state = 'PUBLISHED' then
    market_value := pg_catalog.jsonb_build_object(
      'pot', (auction_value.auction_manifest->>'pot')::numeric::text,
      'purchases', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'player', pg_catalog.jsonb_build_object(
            'player_id', purchase->>'player_id',
            'display_name', entrant.display_name
          ),
          'purchase_price',
            (purchase->>'purchase_price')::numeric::text,
          'owners', coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'player', pg_catalog.jsonb_build_object(
                'player_id', ownership->>'owner_player_id',
                'display_name', owner_player.display_name
              ),
              'ownership_fraction',
                (ownership->>'ownership_fraction')::numeric::text
            ) order by ownership->>'owner_player_id')
            from pg_catalog.jsonb_array_elements(
              auction_value.auction_manifest->'ownership'
            ) ownership
            join scoring_authority.players owner_player
              on owner_player.player_id = ownership->>'owner_player_id'
            where ownership->>'player_id' = purchase->>'player_id'
          ), '[]'::jsonb)
        ) order by purchase->>'player_id')
        from pg_catalog.jsonb_array_elements(
          auction_value.auction_manifest->'purchases'
        ) purchase
        join scoring_authority.players entrant
          on entrant.player_id = purchase->>'player_id'
      ), '[]'::jsonb)
    );
  else
    market_value := null;
  end if;
  participant_result_value := case when expose_result
    then production_control.project_production_calcutta_v1_result(
      result_value.engine_result_payload
    ) else null end;

  revision_value := pg_catalog.format(
    'calcutta-v1:%s:%s:%s:%s:%s:%s',
    current_value.configuration_revision,
    current_value.auction_revision,
    current_value.publication_revision,
    case when result_value.result_id is null
      then 0 else result_value.result_revision end,
    state_value, current_value.publication_state
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-calcutta-v1',
      'tournament_id', '2026',
      'state', state_value,
      'publication_policy',
        'DIRECTOR_CONTROLLED_PARTICIPANT_FULL_MARKET',
      'publication_state', current_value.publication_state,
      'published', current_value.publication_state = 'PUBLISHED',
      'currency_code', 'USD',
      'configuration_revision', current_value.configuration_revision,
      'auction_revision', current_value.auction_revision,
      'publication_revision', current_value.publication_revision,
      'result_revision', case when result_value.result_id is null
        then null else result_value.result_revision end,
      'configuration_fingerprint', case
        when state_value = 'NOT_CONFIGURED' then null
        else current_value.configuration_fingerprint end,
      'auction_fingerprint', current_value.auction_fingerprint,
      'result_fingerprint', case when result_value.result_id is null
        then null else result_value.payload_hash end,
      'revision', revision_value,
      'freshness', pg_catalog.jsonb_build_object(
        'stale', result_is_stale, 'lifecycle_compatible', production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value), 'original_result_source_fingerprint', result_value.source_fingerprint,
        'updating', updating_value,
        'configured_at', configuration_value.configured_at,
        'auction_recorded_at', auction_value.recorded_at,
        'published_at', case
          when current_value.publication_state = 'PUBLISHED'
            then publication_value.published_at
          else null end,
        'calculated_at', result_value.calculated_at,
        'source_fingerprint', source_fingerprint_value
      ),
      'market', market_value,
      'result', participant_result_value,
      'query_ms', pg_catalog.round(extract(epoch from
        (pg_catalog.clock_timestamp() - started_at)) * 1000, 3)
    )
  );
end;
$function$
;$reader$;
execute $private$
create function production_control.certification_calcutta_publication_projection_v1(target text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare c scoring_authority.calcutta_v1_current%rowtype;r scoring_authority.calcutta_v1_result_revisions%rowtype;fp text;
begin
 select * into strict c from scoring_authority.calcutta_v1_current where tournament_id=target;
 select * into r from scoring_authority.calcutta_v1_result_revisions where tournament_id=target and result_revision=c.result_revision and configuration_revision=c.configuration_revision and auction_revision=c.auction_revision and is_current;
 fp:=production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision(target));
 return jsonb_build_object('ok',true,'tournament_id',target,'configuration_revision',c.configuration_revision,
   'configuration_fingerprint',c.configuration_fingerprint,'auction_revision',c.auction_revision,
   'auction_fingerprint',c.auction_fingerprint,'publication_revision',c.publication_revision,'publication_state',c.publication_state,
   'result_revision',c.result_revision,'source_fingerprint',fp,'result_state',r.result_state,
   'result_current',coalesce(r.source_fingerprint=fp and r.configuration_revision=c.configuration_revision
     and r.configuration_fingerprint=c.configuration_fingerprint and r.auction_revision=c.auction_revision
     and r.auction_fingerprint=c.auction_fingerprint,false));
end;$$;$private$;
execute $private$
create function production_control.dispatch_certification_calcutta_publication_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare payload jsonb:=input->'payload';command jsonb;
begin
 perform production_control.assert_canonical_scoring_context_v1('{}',context,'RUNTIME');
 if context->>'phase' is distinct from 'DIRECTOR' or context->>'tournament_id' is distinct from '2026'
   or context->>'resource_class' is distinct from 'CERTIFICATION'
   or context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
   or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'
   or input->>'phase' is distinct from 'DIRECTOR'
   or input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id' then
   raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PUBLICATION_TARGET_DENIED';end if;
 perform production_control.assert_production_scoring_actor(jsonb_build_object('authorization',input->'authorization'),true);
 if jsonb_typeof(payload) is distinct from 'object' or payload->>'family' is distinct from 'CALCUTTA_PUBLICATION' then
   raise exception using errcode='22023',message='PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';end if;
 if not mutation then
   if input->>'operation_id' is distinct from 'DIRECTOR.READ_CALCUTTA_PUBLICATION' or payload->>'action' is distinct from 'read'
     or exists(select 1 from jsonb_object_keys(payload)k where k not in('family','action')) then
     raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PUBLICATION_INPUT_DENIED';end if;
   return production_control.certification_calcutta_publication_projection_v1('2026');
 end if;
 if input->>'operation_id' is distinct from 'DIRECTOR.PUBLISH_CALCUTTA' or payload->>'action' is distinct from 'publish'
   or exists(select 1 from jsonb_object_keys(payload)k where k not in('family','action','expected_configuration_revision',
     'expected_configuration_fingerprint','expected_auction_revision','expected_auction_fingerprint',
     'expected_publication_revision','expected_result_revision','expected_source_fingerprint'))
   or coalesce(payload->>'expected_configuration_revision','') !~ '^[1-9][0-9]*$'
   or coalesce(payload->>'expected_auction_revision','') !~ '^[1-9][0-9]*$'
   or coalesce(payload->>'expected_publication_revision','') !~ '^(0|[1-9][0-9]*)$'
   or coalesce(payload->>'expected_result_revision','') !~ '^[1-9][0-9]*$'
   or coalesce(payload->>'expected_configuration_fingerprint','') !~ '^[0-9a-f]{64}$'
   or coalesce(payload->>'expected_auction_fingerprint','') !~ '^[0-9a-f]{64}$'
   or coalesce(payload->>'expected_source_fingerprint','') !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='PRODUCTION_CALCUTTA_PUBLICATION_INPUT_INVALID';end if;
 command:=(payload-array['family','action'])||jsonb_build_object('contract_version','production-calcutta-v1',
   'tournament_id',context->>'tournament_id','authorization',input->'authorization','actor_id',input#>>'{authorization,player_id}',
   'request_fingerprint',production_control.calcutta_v1_hash(jsonb_build_object('contract','certification-calcutta-publication-v1',
     'resource_id',context->>'resource_id','operation_request_id',input->>'operation_request_id')));
 return production_control.canonical_publish_calcutta_v1(command,context);
end;$$;$private$;
execute format('alter function production_control.canonical_publish_calcutta_v1(jsonb,jsonb) owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure)));
execute 'revoke all on function production_control.canonical_publish_calcutta_v1(jsonb,jsonb) from public,anon,authenticated,service_role';
execute format('alter function production_control.canonical_read_published_calcutta_v1(jsonb,jsonb) owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure)));
execute 'revoke all on function production_control.canonical_read_published_calcutta_v1(jsonb,jsonb) from public,anon,authenticated,service_role';
execute format('alter function production_control.certification_calcutta_publication_projection_v1(text) owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure)));
execute 'revoke all on function production_control.certification_calcutta_publication_projection_v1(text) from public,anon,authenticated,service_role';
execute format('alter function production_control.dispatch_certification_calcutta_publication_v1(jsonb,jsonb,boolean) owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure)));
execute 'revoke all on function production_control.dispatch_certification_calcutta_publication_v1(jsonb,jsonb,boolean) from public,anon,authenticated,service_role';
 end if;
 for p in select value from jsonb_array_elements(m)loop
  select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'security',prosecdef,
   'config',proconfig,'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)
   into strict h,before_metadata from pg_proc where oid=(p->>'signature')::regprocedure;
  if h=p->>'old_hash'then
   definition:=pg_get_functiondef((p->>'signature')::regprocedure);
   if position(p->>'old' in definition)=0 then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_BODY_DRIFT';end if;
   execute replace(definition,p->>'old',p->>'new');
  end if;
  select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'security',prosecdef,
   'config',proconfig,'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)
   into strict h,after_metadata from pg_proc where oid=(p->>'signature')::regprocedure;
  if h<>p->>'new_hash'or before_metadata is distinct from after_metadata then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_METADATA_DRIFT';end if;
 end loop;
end;$install$;
do $verify$declare target oid:='production_control.canonical_publish_calcutta_v1(jsonb,jsonb)'::regprocedure;expected_owner oid;begin
 select proowner into strict expected_owner from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure;
 if exists(select 1 from pg_proc where oid=target and (proowner<>expected_owner or prosecdef is distinct from true or proconfig is distinct from (select proconfig from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure)))
   or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
     where p.oid=target and (a.grantee<>p.proowner or a.privilege_type<>'EXECUTE')) then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_PRIVATE_ACL_DRIFT';end if;
 if encode(extensions.digest((select prosrc from pg_proc where oid=target),'sha256'),'hex')<>'fdee477fae5e7f8bbb265a898796c075c5b9ac997b891ff0ea5e1257403bb447' then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_CORE_DRIFT';end if;
 end;$verify$;
do $verify$declare target oid:='production_control.canonical_read_published_calcutta_v1(jsonb,jsonb)'::regprocedure;expected_owner oid;begin
 select proowner into strict expected_owner from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure;
 if exists(select 1 from pg_proc where oid=target and (proowner<>expected_owner or prosecdef is distinct from true or proconfig is distinct from (select proconfig from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure)))
   or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
     where p.oid=target and (a.grantee<>p.proowner or a.privilege_type<>'EXECUTE')) then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_PRIVATE_ACL_DRIFT';end if;
 if encode(extensions.digest((select prosrc from pg_proc where oid=target),'sha256'),'hex')<>'e37900e3ceb00b937540a29360bee7acb343efdb968931a00bea0fee2ea6041d' then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_CORE_DRIFT';end if;
 end;$verify$;
do $verify$declare target oid:='production_control.certification_calcutta_publication_projection_v1(text)'::regprocedure;expected_owner oid;begin
 select proowner into strict expected_owner from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure;
 if exists(select 1 from pg_proc where oid=target and (proowner<>expected_owner or prosecdef is distinct from true or proconfig is distinct from array['search_path=pg_catalog']::text[]))
   or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
     where p.oid=target and (a.grantee<>p.proowner or a.privilege_type<>'EXECUTE')) then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_PRIVATE_ACL_DRIFT';end if;
 if encode(extensions.digest((select prosrc from pg_proc where oid=target),'sha256'),'hex')<>'9892aff1f3fe46a04b6618df18bff66eedd40ac3ac0ad8ef50dd48e29f107635' then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_CORE_DRIFT';end if;
 end;$verify$;
do $verify$declare target oid:='production_control.dispatch_certification_calcutta_publication_v1(jsonb,jsonb,boolean)'::regprocedure;expected_owner oid;begin
 select proowner into strict expected_owner from pg_proc where oid='public.publish_production_calcutta_v1(jsonb)'::regprocedure;
 if exists(select 1 from pg_proc where oid=target and (proowner<>expected_owner or prosecdef is distinct from true or proconfig is distinct from array['search_path=pg_catalog']::text[]))
   or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
     where p.oid=target and (a.grantee<>p.proowner or a.privilege_type<>'EXECUTE')) then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_PRIVATE_ACL_DRIFT';end if;
 if encode(extensions.digest((select prosrc from pg_proc where oid=target),'sha256'),'hex')<>'dc2a2759e3f042e8154bc5643ae0c134b0c3ba91d3902d0c3ff2f7f3e4c06e46' then raise exception 'CERTIFICATION_CALCUTTA_PUBLICATION_CORE_DRIFT';end if;
 end;$verify$;
commit;
