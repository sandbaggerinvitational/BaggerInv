-- Certification full Net Skins configuration: shared domain core, unchanged Production guard.
-- Forward-only. Exact predecessor checks, metadata preservation, no hosted action.
begin;
select pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
do $scope$ begin
 if not exists(select 1 from production_control.canonical_resource_v1 where singleton and resource_class='CERTIFICATION' and resource_id='CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51' and project_ref='trmcwrljjxwhgtikfdgu' and database_name=current_database())
   or exists(select 1 from production_control.resource_scope) or exists(select 1 from production_control.cutover_activation_state)
   or exists(select 1 from production_control.certification_admission_v1 where enabled)
   or exists(select 1 from scoring_authority.ingress_gates where state<>'PAUSED')
   or exists(select 1 from production_control.certification_ingress_leases_v1 where state in('ADMITTED','UNKNOWN')) then
   raise exception 'CERTIFICATION_NET_SKINS_INSTALL_SCOPE_DENIED'; end if;
end;$scope$;
do $install$ declare m jsonb:=$manifest$[
  {
    "signature": "public.configure_production_net_skins_v1(jsonb)",
    "old_hash": "5768a1d9e959680dc9e7ca2bbf7c002fbbbdab44bbef43376a79c8ab2e2e2444",
    "new_hash": "95db0b569b9c4e17966ff3c09936b5a199e7e0950cc20303aa1958ee7657a8d5",
    "old": "\ndeclare\n  activation production_control.cutover_activation_state%rowtype;\n  resource production_control.resource_scope%rowtype;\n  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;\n  existing_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;\n  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;\n  selected_rounds integer[];\n  manifest_value jsonb;\n  round_value jsonb;\n  entry_value jsonb;\n  overall_fingerprint text;\n  resource_fingerprint_value text;\n  request_fingerprint_value text := pg_catalog.lower(\n    coalesce(input->>'request_fingerprint', '')\n  );\n  payload_hash_value text := production_control.net_skins_v1_hash(input);\n  expected_configuration bigint := coalesce(\n    (input->>'expected_configuration_revision')::bigint, -1\n  );\n  actor_player text := pg_catalog.btrim(\n    coalesce(input#>>'{authorization,player_id}', '')\n  );\n  actor_auth_user uuid := nullif(\n    input#>>'{authorization,auth_user_id}', ''\n  )::uuid;\n  response_value jsonb;\n  round_count integer := 0;\n  entry_count integer := 0;\nbegin\n  perform production_control.assert_production_net_skins_v1_runtime(input);\n  perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:'||'2026',0));\n  perform production_control.assert_production_scoring_actor(input, true);\n\n  if input->>'contract_version'\n       is distinct from 'production-net-skins-v1'\n     or input->>'publication_policy' is distinct from 'OFFICIAL_ONLY'\n     or request_fingerprint_value !~ '^[0-9a-f]{64}$'\n     or pg_catalog.jsonb_typeof(coalesce(\n       input->'eligible_round_numbers', 'null'::jsonb\n     )) <> 'array' then\n    raise exception using errcode = '22023',\n      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_INPUT_INVALID';\n  end if;\n\n  select value.* into existing_value\n  from scoring_authority.net_skins_v1_configuration_revisions value\n  where value.request_fingerprint = request_fingerprint_value;\n  if found then\n    if existing_value.request_payload_hash <> payload_hash_value then\n      raise exception using errcode = '23505',\n        message = 'PRODUCTION_NET_SKINS_IDEMPOTENCY_CONFLICT';\n    end if;\n    return pg_catalog.jsonb_build_object(\n      'ok', true,\n      'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',\n      'configuration_revision', existing_value.configuration_revision,\n      'configuration_fingerprint',\n        existing_value.configuration_fingerprint,\n      'state', existing_value.state,\n      'rounds', existing_value.configuration_manifest->'rounds',\n      'idempotent', true\n    );\n  end if;\n\n  begin\n    select pg_catalog.array_agg(value::integer order by value::integer)\n      into selected_rounds\n    from pg_catalog.jsonb_array_elements_text(\n      input->'eligible_round_numbers'\n    ) value;\n  exception when others then\n    raise exception using errcode = '22023',\n      message = 'PRODUCTION_NET_SKINS_ELIGIBLE_ROUNDS_INVALID';\n  end;\n\n  select value.* into strict activation\n  from production_control.cutover_activation_state value\n  where value.scope_key = 'BAGGER_INV_PRODUCTION'\n  for update;\n  select value.* into strict resource\n  from production_control.resource_scope value\n  where value.scope_key = 'BAGGER_INV_PRODUCTION';\n  select value.* into strict current_value\n  from scoring_authority.net_skins_v1_configuration_current value\n  where value.tournament_id = '2026'\n  for update;\n\n  if activation.activation_revision < 0\n     or activation.activation_revision <>\n       (input->>'expected_activation_revision')::bigint then\n    raise exception using errcode = '40001',\n      message = 'PRODUCTION_NET_SKINS_ACTIVATION_REVISION_CONFLICT';\n  end if;\n  if current_value.configuration_revision <> expected_configuration then\n    raise exception using errcode = '40001',\n      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';\n  end if;\n\n  manifest_value :=\n    production_control.full_net_skins_manifest_v2('2026',selected_rounds,input->'entry_revisions');\n  overall_fingerprint := production_control.net_skins_v1_hash(manifest_value);\n  resource_fingerprint_value := production_control.net_skins_v1_hash(\n    pg_catalog.jsonb_build_object(\n      'contract_version', 'production-net-skins-v1',\n      'environment', 'PRODUCTION',\n      'project_ref', resource.project_ref,\n      'project_url', resource.project_url,\n      'source_workbook_id', resource.google_workbook_id,\n      'tournament_id', resource.current_tournament_id,\n      'vercel_project_id', input->>'vercel_project_id',\n      'vercel_team_id', input->>'vercel_team_id',\n      'vercel_environment', 'production',\n      'deployment_commit', activation.expected_deployment_commit,\n      'authority_epoch_id', activation.authority_generation_id,\n      'activation_revision', activation.activation_revision\n    )\n  );\n\n  insert into scoring_authority.net_skins_v1_configuration_revisions (\n    tournament_id, configuration_revision, contract_version, state,\n    publication_policy, configuration_manifest, configuration_fingerprint,\n    resource_fingerprint, activation_revision, authority_epoch_id,\n    configured_by_player_id, configured_by_auth_user_id,\n    request_fingerprint, request_payload_hash, configured_at\n  ) values (\n    '2026', current_value.configuration_revision + 1,\n    'production-net-skins-v1', 'CONFIGURED', 'OFFICIAL_ONLY',\n    manifest_value, overall_fingerprint, resource_fingerprint_value,\n    activation.activation_revision, activation.authority_generation_id,\n    actor_player, actor_auth_user, request_fingerprint_value,\n    payload_hash_value, pg_catalog.now()\n  ) returning * into revision_value;\n\n  -- Preserve revision history in the immutable V1 ledger while updating the\n  -- installed canonical engine-input tables atomically.\n  update scoring_authority.net_skins_configurations\n  set enabled = false,\n      configuration_revision = revision_value.configuration_revision,\n      imported_by = actor_player,\n      updated_at = pg_catalog.now()\n  where tournament_id = '2026';\n\n  for round_value in\n    select value\n    from pg_catalog.jsonb_array_elements(manifest_value->'rounds') value\n  loop\n    round_count := round_count + 1;\n    insert into scoring_authority.net_skins_configurations (\n      tournament_id, round_number, format, enabled, entry_type,\n      buy_in_per_entry, expected_pot, completion_rule, payout_rounding,\n      tie_rule, configuration_revision, configuration_fingerprint,\n      source_workbook_id, imported_by, imported_at, approved_at, updated_at\n    ) values (\n      '2026', (round_value->>'round_number')::integer,\n      round_value->>'format', true, round_value->>'entry_type',\n      (round_value->>'buy_in_per_entry')::numeric,\n      (round_value->>'expected_pot')::numeric,\n      round_value->>'completion_rule', round_value->>'payout_rounding',\n      round_value->>'tie_rule', revision_value.configuration_revision,\n      round_value->>'configuration_fingerprint',\n      resource.google_workbook_id, actor_player, pg_catalog.now(),\n      pg_catalog.now(), pg_catalog.now()\n    ) on conflict (tournament_id, round_number) do update set\n      format = excluded.format,\n      enabled = true,\n      entry_type = excluded.entry_type,\n      buy_in_per_entry = excluded.buy_in_per_entry,\n      expected_pot = excluded.expected_pot,\n      completion_rule = excluded.completion_rule,\n      payout_rounding = excluded.payout_rounding,\n      tie_rule = excluded.tie_rule,\n      configuration_revision = excluded.configuration_revision,\n      configuration_fingerprint = excluded.configuration_fingerprint,\n      source_workbook_id = excluded.source_workbook_id,\n      imported_by = excluded.imported_by,\n      imported_at = excluded.imported_at,\n      approved_at = excluded.approved_at,\n      updated_at = excluded.updated_at;\n\n    delete from scoring_authority.net_skins_configuration_entries\n    where tournament_id = '2026'\n      and round_number = (round_value->>'round_number')::integer;\n\n    for entry_value in\n      select value\n      from pg_catalog.jsonb_array_elements(round_value->'entries') value\n    loop\n      entry_count := entry_count + 1;\n      insert into scoring_authority.net_skins_configuration_entries (\n        tournament_id, round_number, entry_id, match_number, format,\n        player_id_1, player_id_2, team_handicap, buy_in, eligible,\n        source_payload, created_at, updated_at\n      ) values (\n        '2026', (round_value->>'round_number')::integer,\n        entry_value->>'entry_id', entry_value->>'match_number',\n        round_value->>'format', entry_value->>'player_id_1',\n        nullif(entry_value->>'player_id_2', ''),\n        nullif(entry_value->>'team_handicap', '')::numeric,\n        (entry_value->>'buy_in')::numeric, true,\n        pg_catalog.jsonb_build_object(\n          'Contract Version', 'production-net-skins-v1',\n          'Canonical Match ID', entry_value->>'match_id',\n          'Stable Player IDs', entry_value->'player_ids',\n          'Eligible Holes', round_value->'eligible_holes',\n          'Net Handicap Basis', round_value->>'net_handicap_basis',\n          'Entry Revision',entry_value->'entry_revision','Entry Key',entry_value->>'entry_key','Entry Binding Fingerprint',entry_value->>'binding_fingerprint','Individual Stroke Allocation',\n            entry_value->'individual_stroke_allocation'\n        ),\n        pg_catalog.now(), pg_catalog.now()\n      );\n    end loop;\n  end loop;\n\n  update scoring_authority.net_skins_v1_configuration_current\n  set configuration_revision_id = revision_value.configuration_revision_id,\n      configuration_revision = revision_value.configuration_revision,\n      state = 'CONFIGURED',\n      updated_at = pg_catalog.now()\n  where tournament_id = '2026';\n\n  update scoring_authority.net_skins_v1_recalculation_jobs\n  set status = 'SUPERSEDED',\n      claimed_by = null,\n      claim_token = null,\n      lease_expires_at = null,\n      completed_at = pg_catalog.now(),\n      updated_at = pg_catalog.now()\n  where tournament_id = '2026'\n    and status in ('PENDING', 'RUNNING');\n\n  update scoring_authority.net_skins_v1_result_revisions\n  set is_current = false,\n      superseded_at = pg_catalog.now()\n  where tournament_id = '2026' and is_current;\n\n  insert into scoring_authority.net_skins_configuration_import_runs (\n    tournament_id, source_workbook_id, configuration_fingerprint,\n    status, round_count, entry_count, requested_by, imported_at\n  ) values (\n    '2026', resource.google_workbook_id, overall_fingerprint,\n    'APPLIED', round_count, entry_count, actor_player, pg_catalog.now()\n  );\n\n  insert into scoring_authority.audit_events (\n    tournament_id, action, actor_id, metadata\n  ) values (\n    '2026', 'PRODUCTION_NET_SKINS_V1_CONFIGURED', actor_player,\n    pg_catalog.jsonb_build_object(\n      'contract_version', 'production-net-skins-v1',\n      'configuration_revision', revision_value.configuration_revision,\n      'configuration_fingerprint', overall_fingerprint,\n      'resource_fingerprint', resource_fingerprint_value,\n      'round_count', round_count,\n      'entry_count', entry_count,\n      'publication_policy', 'OFFICIAL_ONLY',\n      'authority_changed', false\n    )\n  );\n  insert into production_control.operation_audit_events (\n    event_type, domain, tournament_id, actor, request_fingerprint,\n    result, details\n  ) values (\n    'PRODUCTION_NET_SKINS_V1_CONFIGURED', 'NET_SKINS', '2026',\n    actor_player, request_fingerprint_value, 'SUCCEEDED',\n    pg_catalog.jsonb_build_object(\n      'configuration_revision', revision_value.configuration_revision,\n      'configuration_fingerprint', overall_fingerprint,\n      'resource_fingerprint', resource_fingerprint_value,\n      'round_count', round_count,\n      'entry_count', entry_count,\n      'publication_policy', 'OFFICIAL_ONLY'\n    )\n  );\n\n  response_value := pg_catalog.jsonb_build_object(\n    'ok', true,\n    'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',\n    'configuration_revision', revision_value.configuration_revision,\n    'configuration_fingerprint', overall_fingerprint,\n    'state', 'CONFIGURED',\n    'rounds', manifest_value->'rounds',\n    'idempotent', false\n  );\n  return response_value;\nend;\n",
    "new": "begin return production_control.canonical_configure_net_skins_v1(input,null); end;"
  },
  {
    "signature": "production_control.certification_operation_phase_v1(text,boolean)",
    "old_hash": "870bee1b03d4ed36e97709adbdef6773b3e373c0d56b3f37cc47f609fbdcea6b",
    "new_hash": "a3f81f1b3bc2570313115fce2a9b1ab85d691eb94cbc58586fda7925fa8e5059",
    "old": "\nbegin\n if mutation and operation_id in('WORKERS.DELIVERY_TICK','WORKERS.FAIL_PRECLAIM','WORKERS.COMPETITION_CLAIM','WORKERS.COMPETITION_WRITE','WORKERS.COMPETITION_FAIL','WORKERS.INTELLIGENCE_CLAIM','WORKERS.INTELLIGENCE_WRITE','WORKERS.INTELLIGENCE_FAIL','WORKERS.CALCUTTA_CLAIM','WORKERS.CALCUTTA_COMPLETE','WORKERS.CALCUTTA_FAIL') then return 'WORKERS'; end if;\n if mutation and operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED') then return 'DIRECTOR'; end if;\n if not mutation and operation_id in('SCORING.READ_AUTHORITY','SCORING.READ_PARTICIPANT_CONTEXT','SCORING.READ_MUTATION_STATUS') then return 'READS'; end if;\n if not mutation and operation_id in('SCORING.READ_DIRECTOR_OPERATION_STATUS','DIRECTOR.READ_SETUP','DIRECTOR.READ_NET_SKINS','DIRECTOR.READ_CALCUTTA',\n  'DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS') then return 'DIRECTOR'; end if;\n if mutation and operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH') then return 'SCORING'; end if;\n if mutation and operation_id in('SCORING.REOPEN_MATCH','DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then return 'DIRECTOR'; end if;\n raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\nend;\n",
    "new": "\nbegin\n if mutation and operation_id='DIRECTOR.CONFIGURE_NET_SKINS' then return 'DIRECTOR'; end if;\n if not mutation and operation_id='DIRECTOR.READ_NET_SKINS_CONFIGURATION' then return 'DIRECTOR'; end if;\n if mutation and operation_id in('WORKERS.DELIVERY_TICK','WORKERS.FAIL_PRECLAIM','WORKERS.COMPETITION_CLAIM','WORKERS.COMPETITION_WRITE','WORKERS.COMPETITION_FAIL','WORKERS.INTELLIGENCE_CLAIM','WORKERS.INTELLIGENCE_WRITE','WORKERS.INTELLIGENCE_FAIL','WORKERS.CALCUTTA_CLAIM','WORKERS.CALCUTTA_COMPLETE','WORKERS.CALCUTTA_FAIL') then return 'WORKERS'; end if;\n if mutation and operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED') then return 'DIRECTOR'; end if;\n if not mutation and operation_id in('SCORING.READ_AUTHORITY','SCORING.READ_PARTICIPANT_CONTEXT','SCORING.READ_MUTATION_STATUS') then return 'READS'; end if;\n if not mutation and operation_id in('SCORING.READ_DIRECTOR_OPERATION_STATUS','DIRECTOR.READ_SETUP','DIRECTOR.READ_NET_SKINS','DIRECTOR.READ_CALCUTTA',\n  'DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS') then return 'DIRECTOR'; end if;\n if mutation and operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH') then return 'SCORING'; end if;\n if mutation and operation_id in('SCORING.REOPEN_MATCH','DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then return 'DIRECTOR'; end if;\n raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\nend;\n"
  },
  {
    "signature": "production_control.certification_ingress_required_v1(text)",
    "old_hash": "396d30bed86a9ec26208f7b5ceca78dfac5a7111287d1096b06464496a44fb9b",
    "new_hash": "8c21bbe56b306995dc8451b2889c6d0c332a2136f5ef6ae77894ef01197bd916",
    "old": "\n select coalesce(operation_id=any(array['SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH',\n 'DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES',\n 'DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION']),false)\n",
    "new": "\n select coalesce(operation_id=any(array['SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH',\n 'DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.CONFIGURE_NET_SKINS',\n 'DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION']),false)\n"
  },
  {
    "signature": "production_control.dispatch_certification_operation_v1(jsonb,jsonb,boolean)",
    "old_hash": "5ee91f323e4e23146ad16b9a170ca93cd5b19d0ff6b3545766315a7fe091565e",
    "new_hash": "54a2c792062a83a7eccda779bf5364852aa58e78995d5e6f658be6b74beb4204",
    "old": "\ndeclare\n operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;\n actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;\n status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');\nbegin\n if mutation and (operation_id like 'WORKERS.%' or operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED')) then\n  return production_control.dispatch_certification_derived_operation_v1(input,context);\n end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  return production_control.dispatch_certification_future_scoring_v1(input,context,mutation);\n end if;\n -- The marker is owner-only and revalidates registered resource/deployment,\n -- current pointer, admission revision and live ingress under transaction locks.\n perform production_control.assert_canonical_scoring_context_v1('{}'::jsonb,context,'RUNTIME');\n if jsonb_typeof(payload) is distinct from 'object' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n if status_read and (coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'\n  or coalesce(payload->>'original_context_token','') !~ '^[0-9a-f]{64}$') then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED'; end if;\n if payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',\n  'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token',\n  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',\n  'admission_revision','governance_tournament_id'] or (payload ? 'player_id' and not coalesce(\n   operation_id='DIRECTOR.CLEAR_CALCUTTA_AUCTION' or\n   (operation_id='DIRECTOR.MUTATE_SETUP' and payload->>'action'='assign-roster-team'),false)) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;\n if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')\n  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')\n  or (input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH'; end if;\n command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id',\n  'expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');\n if mutation and operation_id like 'SCORING.%' and command->>'mutation_key' is distinct from input->>'operation_request_id' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;\n if operation_id in('SCORING.REOPEN_MATCH') or operation_id like 'DIRECTOR.%' then\n  perform production_control.assert_production_scoring_actor(command,true);\n  actor_context:=context||jsonb_build_object('actor_player_id',input#>>'{authorization,player_id}',\n   'actor_auth_user_id',input#>>'{authorization,auth_user_id}','authorization',input->'authorization',\n   'operation_request_id',input->>'operation_request_id',\n   'resource_fingerprint',production_control.cutover_payload_hash(input->'resource'));\n end if;\n case operation_id\n when 'SCORING.READ_AUTHORITY' then\n  return production_control.canonical_read_scoring_authority_v2(command,context);\n when 'SCORING.READ_PARTICIPANT_CONTEXT' then\n  return production_control.canonical_read_scoring_participant_context_v2(command||jsonb_build_object(\n   'player_id',input#>>'{authorization,player_id}','auth_user_id',input#>>'{authorization,auth_user_id}',\n   'role',input#>>'{authorization,role}'),context);\n when 'SCORING.READ_MUTATION_STATUS' then\n  return production_control.read_score_mutation_status_v1(command,'2026');\n when 'SCORING.SUBMIT_HOLE' then\n  return production_control.canonical_submit_hole_score_v2(command,context);\n when 'SCORING.FINALIZE_MATCH' then\n  return production_control.canonical_finalize_match_v2(command,context);\n when 'SCORING.REOPEN_MATCH' then\n  return production_control.canonical_reopen_match_v2(command,context);\n when 'DIRECTOR.READ_SETUP' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:='read';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_SETUP' then family:='TOURNAMENT_SETUP'; action:=payload->>'action';\n when 'DIRECTOR.SETUP_STATUS' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:=payload->>'action';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_PAIRINGS' then family:='ROUND_PAIRINGS'; action:='replace-round-pairings';\n when 'DIRECTOR.MATCH_CONTROL' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.MATCH_CONTROL_STATUS' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.READ_NET_SKINS' then family:='NET_SKINS_ENTRIES'; action:='read';\n when 'DIRECTOR.SAVE_NET_SKINS_ENTRIES' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.NET_SKINS_STATUS' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.READ_CALCUTTA' then family:='CALCUTTA_MANAGEMENT'; action:='read';\n when 'DIRECTOR.CALCUTTA_STATUS' then family:='CALCUTTA_MANAGEMENT'; action:=payload->>'action';\n when 'DIRECTOR.REPLACE_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='replace-auction';\n when 'DIRECTOR.CLEAR_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='clear-entry';\n else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\n end case;\n dispatch_input:=input||jsonb_build_object('family',family,'action',action,'payload',payload-array['action','family','original_context_token']);\n if status_read then\n  -- The original token is receipt-hash provenance only. The current outer\n  -- context was freshly admitted and remains the sole execution authority.\n  dispatch_input:=dispatch_input||jsonb_build_object('mode','status','expected_context_token',payload->>'original_context_token');\n end if;\n if family in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n  return production_control.canonical_director_setup_operation_v2(dispatch_input,actor_context,mutation);\n end if;\n return production_control.canonical_director_financial_operation_v2(dispatch_input,actor_context,mutation);\nend;\n",
    "new": "\ndeclare\n operation_id text:=input->>'operation_id'; payload jsonb:=input->'payload'; command jsonb;\n actor_context jsonb; dispatch_input jsonb; family text; action text; result jsonb;\n status_read boolean:=not mutation and operation_id in('DIRECTOR.SETUP_STATUS','DIRECTOR.MATCH_CONTROL_STATUS','DIRECTOR.NET_SKINS_STATUS','DIRECTOR.CALCUTTA_STATUS');\nbegin\n if operation_id in('DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.READ_NET_SKINS_CONFIGURATION') then\n  return production_control.dispatch_certification_net_skins_configuration_v1(input,context,mutation);\n end if;\n if mutation and (operation_id like 'WORKERS.%' or operation_id in('DIRECTOR.NET_SKINS_CLAIM','DIRECTOR.NET_SKINS_COMPLETE','DIRECTOR.NET_SKINS_FAIL','DIRECTOR.REQUEUE_DERIVED')) then\n  return production_control.dispatch_certification_derived_operation_v1(input,context);\n end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  return production_control.dispatch_certification_future_scoring_v1(input,context,mutation);\n end if;\n -- The marker is owner-only and revalidates registered resource/deployment,\n -- current pointer, admission revision and live ingress under transaction locks.\n perform production_control.assert_canonical_scoring_context_v1('{}'::jsonb,context,'RUNTIME');\n if jsonb_typeof(payload) is distinct from 'object' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n if status_read and (coalesce(input->>'operation_request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'\n  or coalesce(payload->>'original_context_token','') !~ '^[0-9a-f]{64}$') then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_RECOVERY_INPUT_REQUIRED'; end if;\n if payload ?| array['resource','deployment','authorization','environment','project_ref','project_url',\n  'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token',\n  'binding_id','resource_id','resource_class','installation_id','release_commit','activation_revision',\n  'admission_revision','governance_tournament_id'] or (payload ? 'player_id' and not coalesce(\n   operation_id='DIRECTOR.CLEAR_CALCUTTA_AUCTION' or\n   (operation_id='DIRECTOR.MUTATE_SETUP' and payload->>'action'='assign-roster-team'),false)) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_AUTHORITY_FIELD_REJECTED'; end if;\n if (payload ? 'tournament_id' and payload->>'tournament_id' is distinct from context->>'tournament_id')\n  or (payload ? 'expected_epoch_id' and payload->>'expected_epoch_id' is distinct from context->>'authority_epoch_id')\n  or (input#>>'{authorization,tournament_id}' is not null and input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id') then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_TARGET_MISMATCH'; end if;\n command:=payload||jsonb_build_object('tournament_id',context->>'tournament_id',\n  'expected_epoch_id',context->>'authority_epoch_id','authorization',input->'authorization');\n if mutation and operation_id like 'SCORING.%' and command->>'mutation_key' is distinct from input->>'operation_request_id' then\n  raise exception using errcode='22023',message='CERTIFICATION_OPERATION_ID_MISMATCH'; end if;\n if operation_id in('SCORING.REOPEN_MATCH') or operation_id like 'DIRECTOR.%' then\n  perform production_control.assert_production_scoring_actor(command,true);\n  actor_context:=context||jsonb_build_object('actor_player_id',input#>>'{authorization,player_id}',\n   'actor_auth_user_id',input#>>'{authorization,auth_user_id}','authorization',input->'authorization',\n   'operation_request_id',input->>'operation_request_id',\n   'resource_fingerprint',production_control.cutover_payload_hash(input->'resource'));\n end if;\n case operation_id\n when 'SCORING.READ_AUTHORITY' then\n  return production_control.canonical_read_scoring_authority_v2(command,context);\n when 'SCORING.READ_PARTICIPANT_CONTEXT' then\n  return production_control.canonical_read_scoring_participant_context_v2(command||jsonb_build_object(\n   'player_id',input#>>'{authorization,player_id}','auth_user_id',input#>>'{authorization,auth_user_id}',\n   'role',input#>>'{authorization,role}'),context);\n when 'SCORING.READ_MUTATION_STATUS' then\n  return production_control.read_score_mutation_status_v1(command,'2026');\n when 'SCORING.SUBMIT_HOLE' then\n  return production_control.canonical_submit_hole_score_v2(command,context);\n when 'SCORING.FINALIZE_MATCH' then\n  return production_control.canonical_finalize_match_v2(command,context);\n when 'SCORING.REOPEN_MATCH' then\n  return production_control.canonical_reopen_match_v2(command,context);\n when 'DIRECTOR.READ_SETUP' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:='read';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_SETUP' then family:='TOURNAMENT_SETUP'; action:=payload->>'action';\n when 'DIRECTOR.SETUP_STATUS' then\n  family:=coalesce(payload->>'family','TOURNAMENT_SETUP'); action:=payload->>'action';\n  if family not in('TOURNAMENT_SETUP','ROUND_PAIRINGS') then\n   raise exception using errcode='22023',message='CERTIFICATION_OPERATION_INPUT_INVALID'; end if;\n when 'DIRECTOR.MUTATE_PAIRINGS' then family:='ROUND_PAIRINGS'; action:='replace-round-pairings';\n when 'DIRECTOR.MATCH_CONTROL' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.MATCH_CONTROL_STATUS' then family:='MATCH_CONTROL'; action:=payload->>'action';\n when 'DIRECTOR.READ_NET_SKINS' then family:='NET_SKINS_ENTRIES'; action:='read';\n when 'DIRECTOR.SAVE_NET_SKINS_ENTRIES' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.NET_SKINS_STATUS' then family:='NET_SKINS_ENTRIES'; action:='save';\n when 'DIRECTOR.READ_CALCUTTA' then family:='CALCUTTA_MANAGEMENT'; action:='read';\n when 'DIRECTOR.CALCUTTA_STATUS' then family:='CALCUTTA_MANAGEMENT'; action:=payload->>'action';\n when 'DIRECTOR.REPLACE_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='replace-auction';\n when 'DIRECTOR.CLEAR_CALCUTTA_AUCTION' then family:='CALCUTTA_MANAGEMENT'; action:='clear-entry';\n else raise exception using errcode='42501',message='CERTIFICATION_OPERATION_NOT_ADMITTED';\n end case;\n dispatch_input:=input||jsonb_build_object('family',family,'action',action,'payload',payload-array['action','family','original_context_token']);\n if status_read then\n  -- The original token is receipt-hash provenance only. The current outer\n  -- context was freshly admitted and remains the sole execution authority.\n  dispatch_input:=dispatch_input||jsonb_build_object('mode','status','expected_context_token',payload->>'original_context_token');\n end if;\n if family in('TOURNAMENT_SETUP','ROUND_PAIRINGS','MATCH_CONTROL') then\n  return production_control.canonical_director_setup_operation_v2(dispatch_input,actor_context,mutation);\n end if;\n return production_control.canonical_director_financial_operation_v2(dispatch_input,actor_context,mutation);\nend;\n"
  },
  {
    "signature": "production_control.certification_ingress_canonical_receipt_v1(production_control.certification_ingress_leases_v1)",
    "old_hash": "63050ad4430edca64fbe77dba01811d86915e00f3e8497112cb94ddbc6b6e547",
    "new_hash": "e5fd779ec34e89796c49e7bd4fdab33f7a3084d7ffc111500c992c05b24d9419",
    "old": "\ndeclare value jsonb;action_name text;binding uuid;fp text;\nbegin\n if lease.operation_id like'SCORING.%'or lease.operation_id='DIRECTOR.MATCH_CONTROL'then\n  select m.result into value from scoring_authority.score_mutations m join scoring_authority.matches mt using(match_id)\n   where m.match_id=lease.match_id and m.mutation_key=lease.operation_request_id and mt.tournament_id=lease.tournament_id;\n elsif lease.operation_id in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS')then\n  action_name:=case lease.domain_action when'update-tournament'then'UPDATE_TOURNAMENT'when'update-team'then'UPDATE_TEAM'\n   when'assign-roster-team'then'ASSIGN_ROSTER_TEAM'when'update-round'then'UPDATE_ROUND'when'upsert-course'then'UPSERT_COURSE'\n   when'upsert-match'then'UPSERT_MATCH'when'replace-pairings'then'REPLACE_PAIRINGS'when'prepare-scoring-context'then'PREPARE_SCORING_CONTEXT'\n   when'replace-round-pairings'then'REPLACE_ROUND_PAIRINGS'end;\n  select r.response into value from production_control.tournament_setup_operation_receipts_v1 r\n   where r.tournament_id=lease.tournament_id and r.action=action_name and r.operation_request_id=lease.operation_request_id::uuid;\n elsif lease.operation_id='DIRECTOR.SAVE_NET_SKINS_ENTRIES'then\n  select r.response into value from production_control.net_skins_entry_revisions_v1 r\n   where r.tournament_id=lease.tournament_id and r.request_id=lease.operation_request_id::uuid;\n elsif lease.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')then\n  select a.binding_id into strict binding from production_control.certification_admission_v1 a where resource_id=lease.resource_id;\n  action_name:=case lease.operation_id when'DIRECTOR.REPLACE_CALCUTTA_AUCTION'then'replace-auction'else'clear-entry'end;\n  fp:=production_control.calcutta_v1_hash(jsonb_build_object('binding_id',binding::text,'family','CALCUTTA_MANAGEMENT',\n   'action',action_name,'operation_request_id',lease.operation_request_id));\n  select r.response into value from production_control.cutover_operation_receipts r where request_fingerprint=fp;\n end if;\n return value;\nend;",
    "new": "\ndeclare value jsonb;action_name text;binding uuid;fp text;\nbegin\n if lease.operation_id like'SCORING.%'or lease.operation_id='DIRECTOR.MATCH_CONTROL'then\n  select m.result into value from scoring_authority.score_mutations m join scoring_authority.matches mt using(match_id)\n   where m.match_id=lease.match_id and m.mutation_key=lease.operation_request_id and mt.tournament_id=lease.tournament_id;\n elsif lease.operation_id in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS')then\n  action_name:=case lease.domain_action when'update-tournament'then'UPDATE_TOURNAMENT'when'update-team'then'UPDATE_TEAM'\n   when'assign-roster-team'then'ASSIGN_ROSTER_TEAM'when'update-round'then'UPDATE_ROUND'when'upsert-course'then'UPSERT_COURSE'\n   when'upsert-match'then'UPSERT_MATCH'when'replace-pairings'then'REPLACE_PAIRINGS'when'prepare-scoring-context'then'PREPARE_SCORING_CONTEXT'\n   when'replace-round-pairings'then'REPLACE_ROUND_PAIRINGS'end;\n  select r.response into value from production_control.tournament_setup_operation_receipts_v1 r\n   where r.tournament_id=lease.tournament_id and r.action=action_name and r.operation_request_id=lease.operation_request_id::uuid;\n elsif lease.operation_id='DIRECTOR.CONFIGURE_NET_SKINS' then\n  return production_control.certification_net_skins_configuration_receipt_v1(lease);\n elsif lease.operation_id='DIRECTOR.SAVE_NET_SKINS_ENTRIES'then\n  select r.response into value from production_control.net_skins_entry_revisions_v1 r\n   where r.tournament_id=lease.tournament_id and r.request_id=lease.operation_request_id::uuid;\n elsif lease.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')then\n  select a.binding_id into strict binding from production_control.certification_admission_v1 a where resource_id=lease.resource_id;\n  action_name:=case lease.operation_id when'DIRECTOR.REPLACE_CALCUTTA_AUCTION'then'replace-auction'else'clear-entry'end;\n  fp:=production_control.calcutta_v1_hash(jsonb_build_object('binding_id',binding::text,'family','CALCUTTA_MANAGEMENT',\n   'action',action_name,'operation_request_id',lease.operation_request_id));\n  select r.response into value from production_control.cutover_operation_receipts r where request_fingerprint=fp;\n end if;\n return value;\nend;"
  },
  {
    "signature": "public.read_certification_director_recovery_material_v1(jsonb)",
    "old_hash": "f27e69470f04f20a3f1e6206d454f2a1dbe9aaa6de6cf071bd79fcf75b2c2bd6",
    "new_hash": "be0134c5cf95c57d56123b7a41185ef8c12f43dd314b3ac180327cf5f6875b05",
    "old": "\ndeclare l production_control.certification_ingress_leases_v1%rowtype; result jsonb;\nbegin\n if input->>'operation_id' not in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL',\n   'DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')\n  or input->>'operation_id' is null or input#>>'{authorization,role}' is distinct from 'DIRECTOR'\n  or input->>'phase' is distinct from 'DIRECTOR' or jsonb_typeof(input->'payload') is distinct from 'object'\n  or exists(select 1 from jsonb_object_keys(input->'payload') k where k<>'match_id')\n  or(input->>'operation_id'<>'DIRECTOR.MATCH_CONTROL' and input->'payload'<>'{}'::jsonb) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_RECOVERY_AUTHORIZATION_REQUIRED';end if;\n l:=production_control.certification_ingress_lookup_v1(input,false);\n if l.lease_id is null then\n  return jsonb_build_object('ok',true,'contract','certification-ingress-v1','state','UNKNOWN','lease_id',null,\n   'operation_request_id',input->>'operation_request_id');end if;\n -- The136 reader independently checks terminal/canonical receipt consistency.\n result:=public.read_certification_ingress_status_v1(input);\n result:=result||jsonb_build_object('admission_context',l.admission_context);\n if l.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then\n  if l.predecessor_auction_revision is null then\n   raise exception using errcode='55000',message='CERTIFICATION_OPERATION_RECOVERY_PROVENANCE_REQUIRED';end if;\n  result:=result||jsonb_build_object('predecessor_projection',production_control.director_calcutta_management_projection_v1(\n   l.tournament_id,l.predecessor_auction_revision));\n end if;\n return result;\nend;",
    "new": "\ndeclare l production_control.certification_ingress_leases_v1%rowtype; result jsonb;\nbegin\n if input->>'operation_id' not in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL',\n   'DIRECTOR.SAVE_NET_SKINS_ENTRIES','DIRECTOR.CONFIGURE_NET_SKINS','DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')\n  or input->>'operation_id' is null or input#>>'{authorization,role}' is distinct from 'DIRECTOR'\n  or input->>'phase' is distinct from 'DIRECTOR' or jsonb_typeof(input->'payload') is distinct from 'object'\n  or exists(select 1 from jsonb_object_keys(input->'payload') k where k<>'match_id')\n  or(input->>'operation_id'<>'DIRECTOR.MATCH_CONTROL' and input->'payload'<>'{}'::jsonb) then\n  raise exception using errcode='42501',message='CERTIFICATION_OPERATION_RECOVERY_AUTHORIZATION_REQUIRED';end if;\n l:=production_control.certification_ingress_lookup_v1(input,false);\n if l.lease_id is null then\n  return jsonb_build_object('ok',true,'contract','certification-ingress-v1','state','UNKNOWN','lease_id',null,\n   'operation_request_id',input->>'operation_request_id');end if;\n -- The136 reader independently checks terminal/canonical receipt consistency.\n result:=public.read_certification_ingress_status_v1(input);\n result:=result||jsonb_build_object('admission_context',l.admission_context);\n if l.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION') then\n  if l.predecessor_auction_revision is null then\n   raise exception using errcode='55000',message='CERTIFICATION_OPERATION_RECOVERY_PROVENANCE_REQUIRED';end if;\n  result:=result||jsonb_build_object('predecessor_projection',production_control.director_calcutta_management_projection_v1(\n   l.tournament_id,l.predecessor_auction_revision));\n end if;\n return result;\nend;"
  }
]$manifest$;p jsonb;before_metadata jsonb;after_metadata jsonb;h text;definition text;begin
 -- Check every predecessor before creating shared cores or changing a wrapper.
 for p in select value from jsonb_array_elements(m)loop
  select encode(extensions.digest(prosrc,'sha256'),'hex')into strict h from pg_proc where oid=(p->>'signature')::regprocedure;
  if h not in(p->>'old_hash',p->>'new_hash')then raise exception 'CERTIFICATION_NET_SKINS_PREDECESSOR_MISMATCH: %',p->>'signature';end if;
 end loop;
 if to_regprocedure('production_control.canonical_configure_net_skins_v1(jsonb,jsonb)')is null then
execute $core$CREATE OR REPLACE FUNCTION production_control.canonical_configure_net_skins_v1(input jsonb, canonical_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  existing_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  selected_rounds integer[];
  manifest_value jsonb;
  round_value jsonb;
  entry_value jsonb;
  overall_fingerprint text;
  resource_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  payload_hash_value text := production_control.net_skins_v1_hash(input);
  expected_configuration bigint := coalesce(
    (input->>'expected_configuration_revision')::bigint, -1
  );
  actor_player text := pg_catalog.btrim(
    coalesce(input#>>'{authorization,player_id}', '')
  );
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
  response_value jsonb;
  round_count integer := 0;
  entry_count integer := 0;
  affected_rows bigint;
begin
  if canonical_context is null then
    perform production_control.assert_production_net_skins_v1_runtime(input);
  else
    perform production_control.assert_canonical_scoring_context_v1(input, canonical_context, 'RUNTIME');
    if canonical_context->>'tournament_id' is distinct from '2026'
      or canonical_context->>'resource_class' is distinct from 'CERTIFICATION'
      or canonical_context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
      or canonical_context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu' then
      raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_TARGET_DENIED';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:'||'2026',0));
  perform production_control.assert_production_scoring_actor(input, true);

  if input->>'contract_version'
       is distinct from 'production-net-skins-v1'
     or input->>'publication_policy' is distinct from 'OFFICIAL_ONLY'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'eligible_round_numbers', 'null'::jsonb
     )) <> 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_INPUT_INVALID';
  end if;

  select value.* into existing_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.request_fingerprint = request_fingerprint_value;
  if found then
    if existing_value.request_payload_hash <> payload_hash_value then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_NET_SKINS_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',
      'configuration_revision', existing_value.configuration_revision,
      'configuration_fingerprint',
        existing_value.configuration_fingerprint,
      'state', existing_value.state,
      'rounds', existing_value.configuration_manifest->'rounds',
      'idempotent', true
    );
  end if;

  begin
    select pg_catalog.array_agg(value::integer order by value::integer)
      into selected_rounds
    from pg_catalog.jsonb_array_elements_text(
      input->'eligible_round_numbers'
    ) value;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ELIGIBLE_ROUNDS_INVALID';
  end;

  if canonical_context is null then
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  else
    -- Same domain operation; identity is from the admitted private marker,
    -- never a caller-selected resource, financial fact or Production row.
    activation.activation_revision := (canonical_context->>'activation_revision')::bigint;
    activation.authority_generation_id := (canonical_context->>'authority_epoch_id')::uuid;
    activation.expected_deployment_commit := canonical_context->>'release_commit';
    resource.project_ref := canonical_context->>'project_ref';
    resource.project_url := canonical_context->>'project_url';
    resource.current_tournament_id := canonical_context->>'tournament_id';
    resource.google_workbook_id := 'urn:bagger:synthetic:'||(canonical_context->>'installation_id');
    -- Absence is a revision-zero CAS expectation, never a fabricated ledger row.
  end if;
  if canonical_context is null then
  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026'
  for update;
  else
    select value.* into current_value from scoring_authority.net_skins_v1_configuration_current value
      where value.tournament_id='2026' for update;
    current_value.configuration_revision:=coalesce(current_value.configuration_revision,0);
  end if;

  if activation.activation_revision < 0
     or activation.activation_revision <>
       (input->>'expected_activation_revision')::bigint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_ACTIVATION_REVISION_CONFLICT';
  end if;
  if current_value.configuration_revision <> expected_configuration then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;

  manifest_value :=
    production_control.full_net_skins_manifest_v2('2026',selected_rounds,input->'entry_revisions');
  overall_fingerprint := production_control.net_skins_v1_hash(manifest_value);
  resource_fingerprint_value := production_control.net_skins_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'environment', case when canonical_context is null then 'PRODUCTION' else 'CERTIFICATION' end,
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id,
      'vercel_project_id', input->>'vercel_project_id',
      'vercel_team_id', input->>'vercel_team_id',
      'vercel_environment', case when canonical_context is null then 'production' else 'preview' end,
      'deployment_commit', activation.expected_deployment_commit,
      'authority_epoch_id', activation.authority_generation_id,
      'activation_revision', activation.activation_revision
    )
  );

  insert into scoring_authority.net_skins_v1_configuration_revisions (
    tournament_id, configuration_revision, contract_version, state,
    publication_policy, configuration_manifest, configuration_fingerprint,
    resource_fingerprint, activation_revision, authority_epoch_id,
    configured_by_player_id, configured_by_auth_user_id,
    request_fingerprint, request_payload_hash, configured_at
  ) values (
    '2026', current_value.configuration_revision + 1,
    'production-net-skins-v1', 'CONFIGURED', 'OFFICIAL_ONLY',
    manifest_value, overall_fingerprint, resource_fingerprint_value,
    activation.activation_revision, activation.authority_generation_id,
    actor_player, actor_auth_user, request_fingerprint_value,
    payload_hash_value, pg_catalog.now()
  ) returning * into revision_value;

  -- Preserve revision history in the immutable V1 ledger while updating the
  -- installed canonical engine-input tables atomically.
  update scoring_authority.net_skins_configurations
  set enabled = false,
      configuration_revision = revision_value.configuration_revision,
      imported_by = actor_player,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  for round_value in
    select value
    from pg_catalog.jsonb_array_elements(manifest_value->'rounds') value
  loop
    round_count := round_count + 1;
    insert into scoring_authority.net_skins_configurations (
      tournament_id, round_number, format, enabled, entry_type,
      buy_in_per_entry, expected_pot, completion_rule, payout_rounding,
      tie_rule, configuration_revision, configuration_fingerprint,
      source_workbook_id, imported_by, imported_at, approved_at, updated_at
    ) values (
      '2026', (round_value->>'round_number')::integer,
      round_value->>'format', true, round_value->>'entry_type',
      (round_value->>'buy_in_per_entry')::numeric,
      (round_value->>'expected_pot')::numeric,
      round_value->>'completion_rule', round_value->>'payout_rounding',
      round_value->>'tie_rule', revision_value.configuration_revision,
      round_value->>'configuration_fingerprint',
      resource.google_workbook_id, actor_player, pg_catalog.now(),
      pg_catalog.now(), pg_catalog.now()
    ) on conflict (tournament_id, round_number) do update set
      format = excluded.format,
      enabled = true,
      entry_type = excluded.entry_type,
      buy_in_per_entry = excluded.buy_in_per_entry,
      expected_pot = excluded.expected_pot,
      completion_rule = excluded.completion_rule,
      payout_rounding = excluded.payout_rounding,
      tie_rule = excluded.tie_rule,
      configuration_revision = excluded.configuration_revision,
      configuration_fingerprint = excluded.configuration_fingerprint,
      source_workbook_id = excluded.source_workbook_id,
      imported_by = excluded.imported_by,
      imported_at = excluded.imported_at,
      approved_at = excluded.approved_at,
      updated_at = excluded.updated_at;

    delete from scoring_authority.net_skins_configuration_entries
    where tournament_id = '2026'
      and round_number = (round_value->>'round_number')::integer;

    for entry_value in
      select value
      from pg_catalog.jsonb_array_elements(round_value->'entries') value
    loop
      entry_count := entry_count + 1;
      insert into scoring_authority.net_skins_configuration_entries (
        tournament_id, round_number, entry_id, match_number, format,
        player_id_1, player_id_2, team_handicap, buy_in, eligible,
        source_payload, created_at, updated_at
      ) values (
        '2026', (round_value->>'round_number')::integer,
        entry_value->>'entry_id', entry_value->>'match_number',
        round_value->>'format', entry_value->>'player_id_1',
        nullif(entry_value->>'player_id_2', ''),
        nullif(entry_value->>'team_handicap', '')::numeric,
        (entry_value->>'buy_in')::numeric, true,
        pg_catalog.jsonb_build_object(
          'Contract Version', 'production-net-skins-v1',
          'Canonical Match ID', entry_value->>'match_id',
          'Stable Player IDs', entry_value->'player_ids',
          'Eligible Holes', round_value->'eligible_holes',
          'Net Handicap Basis', round_value->>'net_handicap_basis',
          'Entry Revision',entry_value->'entry_revision','Entry Key',entry_value->>'entry_key','Entry Binding Fingerprint',entry_value->>'binding_fingerprint','Individual Stroke Allocation',
            entry_value->'individual_stroke_allocation'
        ),
        pg_catalog.now(), pg_catalog.now()
      );
    end loop;
  end loop;

  if canonical_context is null then
  update scoring_authority.net_skins_v1_configuration_current
  set configuration_revision_id = revision_value.configuration_revision_id,
      configuration_revision = revision_value.configuration_revision,
      state = 'CONFIGURED',
      updated_at = pg_catalog.now()
  where tournament_id = '2026';
  else
    insert into scoring_authority.net_skins_v1_configuration_current(tournament_id,configuration_revision_id,configuration_revision,state)
    values('2026',revision_value.configuration_revision_id,revision_value.configuration_revision,'CONFIGURED')
    on conflict(tournament_id) do update set configuration_revision_id=excluded.configuration_revision_id,
      configuration_revision=excluded.configuration_revision,state=excluded.state,updated_at=pg_catalog.now();
  end if;
  get diagnostics affected_rows = row_count;
  if canonical_context is not null and affected_rows <> 1 then
    raise exception using errcode='PT409',message='CERTIFICATION_NET_SKINS_POINTER_DRIFT';
  end if;

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'SUPERSEDED',
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and status in ('PENDING', 'RUNNING');

  update scoring_authority.net_skins_v1_result_revisions
  set is_current = false,
      superseded_at = pg_catalog.now()
  where tournament_id = '2026' and is_current;

  insert into scoring_authority.net_skins_configuration_import_runs (
    tournament_id, source_workbook_id, configuration_fingerprint,
    status, round_count, entry_count, requested_by, imported_at
  ) values (
    '2026', resource.google_workbook_id, overall_fingerprint,
    'APPLIED', round_count, entry_count, actor_player, pg_catalog.now()
  );

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_NET_SKINS_V1_CONFIGURED', actor_player,
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'configuration_revision', revision_value.configuration_revision,
      'configuration_fingerprint', overall_fingerprint,
      'resource_fingerprint', resource_fingerprint_value,
      'round_count', round_count,
      'entry_count', entry_count,
      'publication_policy', 'OFFICIAL_ONLY',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_CONFIGURED', 'NET_SKINS', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', revision_value.configuration_revision,
      'configuration_fingerprint', overall_fingerprint,
      'resource_fingerprint', resource_fingerprint_value,
      'round_count', round_count,
      'entry_count', entry_count,
      'publication_policy', 'OFFICIAL_ONLY'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',
    'configuration_revision', revision_value.configuration_revision,
    'configuration_fingerprint', overall_fingerprint,
    'state', 'CONFIGURED',
    'rounds', manifest_value->'rounds',
    'idempotent', false
  );
  return response_value;
end;
$function$
;$core$;
execute $private$
create function production_control.certification_net_skins_configuration_fingerprint_v1(resource_id text, operation_id text)
returns text language sql immutable set search_path=pg_catalog as $$
 select production_control.net_skins_v1_hash(jsonb_build_object('contract','certification-net-skins-configuration-v1',
   'resource_id',resource_id,'operation_request_id',operation_id))
$$;$private$;
execute $private$
create function production_control.certification_net_skins_configuration_receipt_v1(lease production_control.certification_ingress_leases_v1)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r scoring_authority.net_skins_v1_configuration_revisions%rowtype;
begin
 select * into r from scoring_authority.net_skins_v1_configuration_revisions
 where tournament_id=lease.tournament_id
   and request_fingerprint=production_control.certification_net_skins_configuration_fingerprint_v1(lease.resource_id,lease.operation_request_id)
   and configured_by_player_id=lease.actor_player_id and configured_by_auth_user_id=lease.actor_auth_user_id;
 if not found then return null; end if;
 return jsonb_build_object('ok',true,'code','PRODUCTION_NET_SKINS_V1_CONFIGURED',
   'configuration_revision',r.configuration_revision,'configuration_fingerprint',r.configuration_fingerprint,
   'state',r.state,'rounds',r.configuration_manifest->'rounds','idempotent',false);
end;$$;$private$;
execute $private$
create function production_control.dispatch_certification_net_skins_configuration_v1(input jsonb, context jsonb, mutation boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare payload jsonb:=input->'payload';command jsonb;current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
 revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
begin
 perform production_control.assert_canonical_scoring_context_v1('{}',context,'RUNTIME');
 if context->>'tournament_id' is distinct from '2026' or context->>'resource_class' is distinct from 'CERTIFICATION'
   or context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
   or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'
   or input->>'phase' is distinct from 'DIRECTOR'
   or input#>>'{authorization,tournament_id}' is distinct from context->>'tournament_id' then
   raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_TARGET_DENIED'; end if;
 perform production_control.assert_production_scoring_actor(jsonb_build_object('authorization',input->'authorization'),true);
 if jsonb_typeof(payload) is distinct from 'object' or payload->>'family' is distinct from 'NET_SKINS_CONFIGURATION' then
   raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_INPUT_INVALID'; end if;
 if not mutation then
   if input->>'operation_id' is distinct from 'DIRECTOR.READ_NET_SKINS_CONFIGURATION'
     or payload->>'action' is distinct from 'read'
     or exists(select 1 from jsonb_object_keys(payload) k where k not in('family','action')) then
     raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_INPUT_DENIED'; end if;
   select * into current_value from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026';
   select * into revision_value from scoring_authority.net_skins_v1_configuration_revisions
     where configuration_revision_id=current_value.configuration_revision_id;
   return jsonb_build_object('ok',true,'tournament_id','2026','configuration_revision',coalesce(current_value.configuration_revision,0),
     'configuration_fingerprint',revision_value.configuration_fingerprint,'state',coalesce(current_value.state,'NOT_CONFIGURED'),
     'rounds',coalesce(revision_value.configuration_manifest->'rounds','[]'::jsonb));
 end if;
 if input->>'operation_id' is distinct from 'DIRECTOR.CONFIGURE_NET_SKINS' or payload->>'action' is distinct from 'configure'
   or exists(select 1 from jsonb_object_keys(payload) k where k not in('family','action','expected_configuration_revision','eligible_round_numbers','entry_revisions'))
   or jsonb_typeof(payload->'entry_revisions') is distinct from 'object'
   or coalesce(payload->>'expected_configuration_revision','') !~ '^(0|[1-9][0-9]*)$' then
   raise exception using errcode='22023',message='CERTIFICATION_NET_SKINS_INPUT_INVALID'; end if;
 -- The operation ID is already admitted by the durable ingress/actor gateway.
 -- No request fingerprint or resource material can be supplied in the DTO.
 command:=(payload-array['family','action'])||jsonb_build_object('contract_version','production-net-skins-v1',
   'publication_policy','OFFICIAL_ONLY','tournament_id',context->>'tournament_id','authorization',input->'authorization',
   'expected_epoch_id',context->>'authority_epoch_id','expected_activation_revision',(context->>'activation_revision')::bigint,
   'vercel_project_id',context->>'vercel_project_id','vercel_team_id',context->>'vercel_team_id',
   'request_fingerprint',production_control.certification_net_skins_configuration_fingerprint_v1(context->>'resource_id',input->>'operation_request_id'));
 return production_control.canonical_configure_net_skins_v1(command,context);
exception when raise_exception then
 -- Adapt only the manifest's documented saved-entry CAS denial. Infrastructure
 -- failures retain their original SQLSTATE; Production's null-context path is unchanged.
 if SQLERRM='FULL_NET_ENTRY_REVISION_STALE_OR_UNAVAILABLE' then
   raise exception using errcode='PT409',message='PRODUCTION_NET_SKINS_ENTRY_REVISION_CONFLICT';
 end if;
 raise;
end;$$;$private$;
execute format('alter function production_control.canonical_configure_net_skins_v1(jsonb,jsonb) owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure)));
execute 'revoke all on function production_control.canonical_configure_net_skins_v1(jsonb,jsonb) from public,anon,authenticated,service_role';
execute format('alter function production_control.certification_net_skins_configuration_fingerprint_v1(text,text) owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure)));
execute 'revoke all on function production_control.certification_net_skins_configuration_fingerprint_v1(text,text) from public,anon,authenticated,service_role';
execute format('alter function production_control.certification_net_skins_configuration_receipt_v1(production_control.certification_ingress_leases_v1) owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure)));
execute 'revoke all on function production_control.certification_net_skins_configuration_receipt_v1(production_control.certification_ingress_leases_v1) from public,anon,authenticated,service_role';
execute format('alter function production_control.dispatch_certification_net_skins_configuration_v1(jsonb,jsonb,boolean) owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure)));
execute 'revoke all on function production_control.dispatch_certification_net_skins_configuration_v1(jsonb,jsonb,boolean) from public,anon,authenticated,service_role';
 end if;
 for p in select value from jsonb_array_elements(m)loop
  select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'security',prosecdef,
   'config',proconfig,'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)
   into strict h,before_metadata from pg_proc where oid=(p->>'signature')::regprocedure;
  if h=p->>'old_hash'then
   definition:=pg_get_functiondef((p->>'signature')::regprocedure);
   if position(p->>'old' in definition)=0 then raise exception 'CERTIFICATION_NET_SKINS_BODY_DRIFT';end if;
   execute replace(definition,p->>'old',p->>'new');
  end if;
  select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'security',prosecdef,
   'config',proconfig,'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)
   into strict h,after_metadata from pg_proc where oid=(p->>'signature')::regprocedure;
  if h<>p->>'new_hash'or before_metadata is distinct from after_metadata then raise exception 'CERTIFICATION_NET_SKINS_METADATA_DRIFT';end if;
 end loop;
end;$install$;
do $verify$declare target oid:='production_control.canonical_configure_net_skins_v1(jsonb,jsonb)'::regprocedure;expected_owner oid;begin
select proowner into strict expected_owner from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure;
if exists(select 1 from pg_proc p where p.oid=target and (p.proowner<>expected_owner or p.prosecdef is distinct from true or p.proconfig is distinct from (select proconfig from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure))) or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=target and (a.grantee<>p.proowner or a.privilege_type<>'EXECUTE')) then raise exception 'CERTIFICATION_NET_SKINS_PRIVATE_ACL_DRIFT';end if;
if encode(extensions.digest((select prosrc from pg_proc where oid=target),'sha256'),'hex')<>'1557276917ec4eae560a43d6f9c4063380359f6459580f188dee34a7d4d13207' then raise exception 'CERTIFICATION_NET_SKINS_CORE_DRIFT: production_control.canonical_configure_net_skins_v1(jsonb,jsonb)';end if;end;$verify$;
do $verify$declare target oid:='production_control.certification_net_skins_configuration_fingerprint_v1(text,text)'::regprocedure;expected_owner oid;begin
select proowner into strict expected_owner from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure;
if exists(select 1 from pg_proc p where p.oid=target and (p.proowner<>expected_owner or p.prosecdef is distinct from false or p.proconfig is distinct from array['search_path=pg_catalog']::text[])) or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=target and (a.grantee<>p.proowner or a.privilege_type<>'EXECUTE')) then raise exception 'CERTIFICATION_NET_SKINS_PRIVATE_ACL_DRIFT';end if;
if encode(extensions.digest((select prosrc from pg_proc where oid=target),'sha256'),'hex')<>'c9931aa414d364bb058672a534aa8902cbfdc4183c216be3368a18bcb74d91ba' then raise exception 'CERTIFICATION_NET_SKINS_CORE_DRIFT: production_control.certification_net_skins_configuration_fingerprint_v1(text,text)';end if;end;$verify$;
do $verify$declare target oid:='production_control.certification_net_skins_configuration_receipt_v1(production_control.certification_ingress_leases_v1)'::regprocedure;expected_owner oid;begin
select proowner into strict expected_owner from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure;
if exists(select 1 from pg_proc p where p.oid=target and (p.proowner<>expected_owner or p.prosecdef is distinct from true or p.proconfig is distinct from array['search_path=pg_catalog']::text[])) or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=target and (a.grantee<>p.proowner or a.privilege_type<>'EXECUTE')) then raise exception 'CERTIFICATION_NET_SKINS_PRIVATE_ACL_DRIFT';end if;
if encode(extensions.digest((select prosrc from pg_proc where oid=target),'sha256'),'hex')<>'fb2116fc66eeff4a999db8173431d2a5e0f643c774af5895bd6c9ceaf9715921' then raise exception 'CERTIFICATION_NET_SKINS_CORE_DRIFT: production_control.certification_net_skins_configuration_receipt_v1(production_control.certification_ingress_leases_v1)';end if;end;$verify$;
do $verify$declare target oid:='production_control.dispatch_certification_net_skins_configuration_v1(jsonb,jsonb,boolean)'::regprocedure;expected_owner oid;begin
select proowner into strict expected_owner from pg_proc where oid='public.configure_production_net_skins_v1(jsonb)'::regprocedure;
if exists(select 1 from pg_proc p where p.oid=target and (p.proowner<>expected_owner or p.prosecdef is distinct from true or p.proconfig is distinct from array['search_path=pg_catalog']::text[])) or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=target and (a.grantee<>p.proowner or a.privilege_type<>'EXECUTE')) then raise exception 'CERTIFICATION_NET_SKINS_PRIVATE_ACL_DRIFT';end if;
if encode(extensions.digest((select prosrc from pg_proc where oid=target),'sha256'),'hex')<>'cd79da608d945f60fd688a8247bea8749751ebf31345a24cd3727495a8011651' then raise exception 'CERTIFICATION_NET_SKINS_CORE_DRIFT: production_control.dispatch_certification_net_skins_configuration_v1(jsonb,jsonb,boolean)';end if;end;$verify$;
commit;
