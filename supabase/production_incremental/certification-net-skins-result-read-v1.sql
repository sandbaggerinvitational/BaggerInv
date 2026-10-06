-- Certification Full Net Skins read: shared shipping result semantics only.
-- No enqueue/calculation/publication authority. Historical artifacts unchanged.
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
   raise exception 'CERTIFICATION_NET_SKINS_RESULT_INSTALL_SCOPE_DENIED';end if;
end;$scope$;
do $install$declare m jsonb:=$manifest$[
  {
    "signature": "public.read_production_net_skins_frozen_2026_v1(jsonb)",
    "old": "\ndeclare\n  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;\n  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;\n  round_value jsonb;\n  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;\n  result_value scoring_authority.net_skins_v1_result_revisions%rowtype;\n  source_revision_value jsonb;\n  source_fingerprint_value text;\n  source_fingerprints_value jsonb := '{}'::jsonb;\n  entries_value jsonb;\n  eligible_players_value jsonb;\n  rounds_value jsonb := '[]'::jsonb;\n  round_state text;\n  top_state text := 'CONFIGURED';\n  round_stale boolean;\n  any_unavailable boolean := false;\n  any_in_progress boolean := false;\n  all_official boolean := true;\n  max_result_revision bigint := 0;\n  max_calculated_at timestamptz;\n  max_published_at timestamptz;\n  top_source_fingerprint text;\n  revision_token text;\nbegin\n  perform production_control.assert_production_service_role();\n  perform production_control.assert_production_cutover_read_scope(\n    input, 'OBSERVATION'\n  );\n  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'\n     or input->>'tournament_id' is distinct from '2026' then\n    raise exception using errcode = '42501',\n      message = 'PRODUCTION_NET_SKINS_RESOURCE_ASSERTION_FAILED';\n  end if;\n\n  select value.* into strict current_value\n  from scoring_authority.net_skins_v1_configuration_current value\n  where value.tournament_id = '2026';\n  select value.* into strict revision_value\n  from scoring_authority.net_skins_v1_configuration_revisions value\n  where value.configuration_revision_id =\n    current_value.configuration_revision_id;\n\n  if current_value.state = 'NOT_CONFIGURED' then\n    revision_token := pg_catalog.format(\n      'net-skins-v1:%s:0:NOT_CONFIGURED',\n      current_value.configuration_revision\n    );\n    return pg_catalog.jsonb_build_object(\n      'ok', true,\n      'data', pg_catalog.jsonb_build_object(\n        'contract_version', 'production-net-skins-v1',\n        'tournament_id', '2026',\n        'state', 'NOT_CONFIGURED',\n        'publication_policy', 'OFFICIAL_ONLY',\n        'configuration_revision', current_value.configuration_revision,\n        'result_revision', null,\n        'configuration_fingerprint', null,\n        'revision', revision_token,\n        'freshness', pg_catalog.jsonb_build_object(\n          'stale', false,\n          'configured_at', null,\n          'calculated_at', null,\n          'published_at', null,\n          'source_fingerprint', null\n        ),\n        'rounds', '[]'::jsonb\n      )\n    );\n  end if;\n\n  for round_value in\n    select value\n    from pg_catalog.jsonb_array_elements(\n      revision_value.configuration_manifest->'rounds'\n    ) value\n    order by (value->>'round_number')::integer\n  loop\n    source_revision_value :=\n      production_control.net_skins_v1_round_source_revision(\n        '2026', (round_value->>'round_number')::integer\n      );\n    source_fingerprint_value :=\n      production_control.net_skins_v1_hash(source_revision_value);\n    source_fingerprints_value := source_fingerprints_value ||\n      pg_catalog.jsonb_build_object(\n        round_value->>'round_number', source_fingerprint_value\n      );\n\n    job_value := null;\n    select value.* into job_value\n    from scoring_authority.net_skins_v1_recalculation_jobs value\n    where value.tournament_id = '2026'\n      and value.round_number = (round_value->>'round_number')::integer\n      and value.configuration_revision =\n        current_value.configuration_revision\n    order by value.requested_at desc, value.job_id desc\n    limit 1;\n\n    result_value := null;\n    select value.* into result_value\n    from scoring_authority.net_skins_v1_result_revisions value\n    where value.tournament_id = '2026'\n      and value.round_number = (round_value->>'round_number')::integer\n      and value.configuration_revision =\n        current_value.configuration_revision\n      and value.is_current\n    limit 1;\n\n    if result_value.result_id is not null\n       and result_value.result_state = 'OFFICIAL'\n       and result_value.source_fingerprint = source_fingerprint_value then\n      round_state := 'OFFICIAL';\n      round_stale := false;\n    elsif job_value.job_id is not null\n       and job_value.source_fingerprint = source_fingerprint_value\n       and job_value.status = 'FAILED' then\n      round_state := 'UNAVAILABLE';\n      round_stale := true;\n    elsif job_value.job_id is not null\n       and job_value.source_fingerprint = source_fingerprint_value\n       and job_value.status in ('PENDING', 'RUNNING') then\n      round_state := 'IN_PROGRESS';\n      round_stale := true;\n    elsif result_value.result_id is not null\n       and result_value.result_state = 'PROVISIONAL'\n       and result_value.source_fingerprint = source_fingerprint_value then\n      round_state := 'IN_PROGRESS';\n      round_stale := true;\n    elsif exists (\n      select 1\n      from scoring_authority.matches match_value\n      where match_value.tournament_id = '2026'\n        and match_value.round_number =\n          (round_value->>'round_number')::integer\n        and (match_value.status <> 'UPCOMING'\n          or match_value.scored_holes > 0)\n    ) then\n      round_state := 'IN_PROGRESS';\n      round_stale := true;\n    else\n      round_state := 'CONFIGURED';\n      round_stale := false;\n    end if;\n\n    entries_value := coalesce((\n      select pg_catalog.jsonb_agg(\n        pg_catalog.jsonb_build_object(\n          'entry_id', entry->>'entry_id',\n          'entry_type', entry->>'entry_type',\n          'match_id', entry->>'match_id',\n          'player_ids', entry->'player_ids'\n        ) order by entry->>'entry_id'\n      )\n      from pg_catalog.jsonb_array_elements(round_value->'entries') entry\n      where coalesce((entry->>'eligible')::boolean, false)\n    ), '[]'::jsonb);\n    eligible_players_value := coalesce((\n      select pg_catalog.jsonb_agg(player_id order by player_id)\n      from (\n        select distinct pg_catalog.jsonb_array_elements_text(\n          entry->'player_ids'\n        ) as player_id\n        from pg_catalog.jsonb_array_elements(round_value->'entries') entry\n        where coalesce((entry->>'eligible')::boolean, false)\n      ) player_values\n    ), '[]'::jsonb);\n\n    any_unavailable := any_unavailable or round_state = 'UNAVAILABLE';\n    any_in_progress := any_in_progress or round_state = 'IN_PROGRESS';\n    all_official := all_official and round_state = 'OFFICIAL';\n    max_result_revision := greatest(\n      max_result_revision, coalesce(result_value.result_revision, 0)\n    );\n    if result_value.calculated_at is not null\n       and (max_calculated_at is null\n         or result_value.calculated_at > max_calculated_at) then\n      max_calculated_at := result_value.calculated_at;\n    end if;\n    if result_value.published_at is not null\n       and (max_published_at is null\n         or result_value.published_at > max_published_at) then\n      max_published_at := result_value.published_at;\n    end if;\n\n    rounds_value := rounds_value || pg_catalog.jsonb_build_array(\n      pg_catalog.jsonb_build_object(\n        'round_id', round_value->>'round_id',\n        'round_number', (round_value->>'round_number')::integer,\n        'format', round_value->>'format',\n        'entry_type', round_value->>'entry_type',\n        'buy_in_per_entry', (round_value->>'buy_in_per_entry')::numeric,\n        'eligible_entry_count', pg_catalog.jsonb_array_length(entries_value),\n        'eligible_player_ids', eligible_players_value,\n        'match_ids', round_value->'match_ids',\n        'entries', entries_value,\n        'state', round_state,\n        'configuration_revision', current_value.configuration_revision,\n        'result_revision', case when result_value.result_id is null\n          then null else result_value.result_revision end,\n        'configuration_fingerprint',\n          round_value->>'configuration_fingerprint',\n        'freshness', pg_catalog.jsonb_build_object(\n          'stale', round_stale,\n          'calculated_at', result_value.calculated_at,\n          'published_at', case when round_state = 'OFFICIAL'\n            then result_value.published_at else null end,\n          'source_fingerprint', source_fingerprint_value\n        ),\n        'result_payload', case when round_state = 'OFFICIAL'\n          then result_value.engine_result_payload || jsonb_build_object('participantLabels', production_control.native_published_skins_labels_v1('2026',result_value.engine_result_payload)) else null end,\n        'official_results', case when round_state = 'OFFICIAL'\n          then result_value.public_result_payload else null end\n      )\n    );\n  end loop;\n\n  top_state := case\n    when any_unavailable then 'UNAVAILABLE'\n    when all_official and pg_catalog.jsonb_array_length(rounds_value) > 0\n      then 'OFFICIAL'\n    when any_in_progress\n      or exists (\n        select 1\n        from pg_catalog.jsonb_array_elements(rounds_value) value\n        where value->>'state' = 'OFFICIAL'\n      ) then 'IN_PROGRESS'\n    else 'CONFIGURED'\n  end;\n  top_source_fingerprint := production_control.net_skins_v1_hash(\n    source_fingerprints_value\n  );\n  revision_token := pg_catalog.format(\n    'net-skins-v1:%s:%s:%s',\n    current_value.configuration_revision,\n    max_result_revision,\n    top_state\n  );\n\n  return pg_catalog.jsonb_build_object(\n    'ok', true,\n    'data', pg_catalog.jsonb_build_object(\n      'contract_version', 'production-net-skins-v1',\n      'tournament_id', '2026',\n      'state', top_state,\n      'publication_policy', 'OFFICIAL_ONLY',\n      'configuration_revision', current_value.configuration_revision,\n      'result_revision', case when max_result_revision = 0\n        then null else max_result_revision end,\n      'configuration_fingerprint',\n        revision_value.configuration_fingerprint,\n      'revision', revision_token,\n      'freshness', pg_catalog.jsonb_build_object(\n        'stale', any_unavailable or any_in_progress,\n        'configured_at', revision_value.configured_at,\n        'calculated_at', max_calculated_at,\n        'published_at', max_published_at,\n        'source_fingerprint', top_source_fingerprint\n      ),\n      'rounds', rounds_value\n    )\n  );\nend;\n",
    "new": "\nbegin\n return production_control.canonical_read_net_skins_v1(input,null);\nend;\n",
    "old_hash": "87627be217c3a4b1579efea32f1ce9ba6290783f1aa62906882f4aa29ff158b1",
    "new_hash": "24145376444362661793075cec14bbed3ef2132af9ad1e9eab52ae37f976d3ab"
  },
  {
    "signature": "public.read_certification_projection_v1(jsonb)",
    "old": "\ndeclare context jsonb; payload jsonb:=coalesce(input->'payload','{}'); result jsonb;\nbegin\n context:=production_control.push_certification_context_v1(input,'READS',false);\n if input->>'operation'='READS.CLOSED_HISTORY_2026'then\n  result:=production_control.certification_closed_history_2026_read_v1(payload,context);\n  perform production_control.pop_certification_context_v1();return result;end if;\n if input->>'operation'='READS.CLOSED_TOURNAMENT'then\n  result:=production_control.certification_closed_tournament_read_v1(payload,context);\n  perform production_control.pop_certification_context_v1();return result;end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  perform production_control.assert_current_certification_future_context_v1(context);\n  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('TOURNAMENT_LIVE','PARTICIPANT_HOME','MY_MATCH','GAME_CENTER')then\n   result:=production_control.certification_successor_current_read_v1(payload,context);\n   perform production_control.pop_certification_context_v1();return result;end if;\n  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('LEADERBOARDS','NET_SKINS_RESULT','COMPETITION_DERIVED','PUBLISHED_ODDS')then\n   result:=production_control.certification_worker_current_projection_v1(payload,context);\n   perform production_control.pop_certification_context_v1();return result;end if;\n  if jsonb_typeof(payload) is distinct from 'object' or payload->>'target_tournament_id' is distinct from context->>'tournament_id'\n   or exists(select 1 from jsonb_object_keys(payload) k where k not in('target_auth_user_id','target_player_id','target_tournament_id')) then\n   raise exception using errcode='42501',message='CERTIFICATION_READ_TARGET_DENIED';end if;\n  case input->>'operation'\n  when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_future_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n  when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_future_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);\n  when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_future_director_entitlement_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n  else raise exception using errcode='42501',message='CERTIFICATION_FUTURE_READ_OPERATION_DENIED';end case;\n  perform production_control.pop_certification_context_v1();return result;\n end if;\n perform production_control.assert_certification_read_v1(context,payload);\n case input->>'operation'\n when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,coalesce(payload->>'target_tournament_id','2026'),context);\n when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);\n when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_director_entitlement_read_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n when 'READS.PUBLISHED_CALCUTTA' then\n  if exists(select 1 from jsonb_object_keys(payload)k where k not in('target_tournament_id','player_id')) then\n    raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PARTICIPANT_READ_DENIED';end if;\n  result:=production_control.canonical_read_published_calcutta_v1(jsonb_build_object(\n    'tournament_id',context->>'tournament_id','player_id',payload->>'player_id'),context);\n when 'READS.CURRENT_VIEW' then result:=production_control.canonical_current_view_read_v1(payload,context);\n when 'READS.HISTORY_2026' then result:=production_control.canonical_current_view_read_v1(payload||jsonb_build_object('surface','HISTORY_2026'),context);\n when 'READS.COMPLETED_HISTORY' then result:=production_control.canonical_completed_history_read_v1(payload,context);\n when 'READS.DRAFT' then result:=production_control.canonical_draft_read_v1(payload,context);\n when 'READS.GUIDE' then result:=production_control.canonical_guide_read_v1(payload||jsonb_build_object('domain','GUIDE',\n  'contract_version','guide-projection-v1','source_tabs',\n  '[\"Tournaments\",\"Guide Sections\",\"Tournament Itinerary\",\"Tournament Timeline\",\"Rule Book\",\"Tournament Rules\",\"Rounds\",\"Dining\",\"Local Guide\",\"Important Contacts\",\"Courses\"]'::jsonb),context);\n when 'READS.PREDICTION_SETTINGS' then result:=production_control.canonical_projection_read_v1(payload||jsonb_build_object('domain','PREDICTION_SETTINGS',\n  'contract_version','prediction-settings-v1','source_tabs','[\"Prediction Settings\"]'::jsonb),\n  'PREDICTION_SETTINGS','prediction-settings-v1','[\"Prediction Settings\"]'::jsonb,context);\n when 'READS.PLAYER_EDITORIAL' then result:=production_control.canonical_player_editorial_read_v1(payload||jsonb_build_object('domain','PLAYER_EDITORIAL',\n  'contract_version','player-public-profile-v1','source_tabs','[\"Players\"]'::jsonb),context);\n else raise exception using errcode='42501',message='CERTIFICATION_READ_OPERATION_DENIED';\n end case;\n perform production_control.pop_certification_context_v1();\n return result;\nend;\n",
    "new": "\ndeclare context jsonb; payload jsonb:=coalesce(input->'payload','{}'); result jsonb;\nbegin\n context:=production_control.push_certification_context_v1(input,'READS',false);\n if input->>'operation'='READS.CLOSED_HISTORY_2026'then\n  result:=production_control.certification_closed_history_2026_read_v1(payload,context);\n  perform production_control.pop_certification_context_v1();return result;end if;\n if input->>'operation'='READS.CLOSED_TOURNAMENT'then\n  result:=production_control.certification_closed_tournament_read_v1(payload,context);\n  perform production_control.pop_certification_context_v1();return result;end if;\n if (context->>'current_tournament_year')::integer>2026 then\n  perform production_control.assert_current_certification_future_context_v1(context);\n  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('TOURNAMENT_LIVE','PARTICIPANT_HOME','MY_MATCH','GAME_CENTER')then\n   result:=production_control.certification_successor_current_read_v1(payload,context);\n   perform production_control.pop_certification_context_v1();return result;end if;\n  if input->>'operation'='READS.CURRENT_VIEW' and payload->>'surface' in('LEADERBOARDS','NET_SKINS_RESULT','COMPETITION_DERIVED','PUBLISHED_ODDS')then\n   result:=production_control.certification_worker_current_projection_v1(payload,context);\n   perform production_control.pop_certification_context_v1();return result;end if;\n  if jsonb_typeof(payload) is distinct from 'object' or payload->>'target_tournament_id' is distinct from context->>'tournament_id'\n   or exists(select 1 from jsonb_object_keys(payload) k where k not in('target_auth_user_id','target_player_id','target_tournament_id')) then\n   raise exception using errcode='42501',message='CERTIFICATION_READ_TARGET_DENIED';end if;\n  case input->>'operation'\n  when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_future_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n  when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_future_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);\n  when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_future_director_entitlement_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n  else raise exception using errcode='42501',message='CERTIFICATION_FUTURE_READ_OPERATION_DENIED';end case;\n  perform production_control.pop_certification_context_v1();return result;\n end if;\n perform production_control.assert_certification_read_v1(context,payload);\n case input->>'operation'\n when 'READS.IDENTITY_FOR_AUTH' then result:=production_control.canonical_identity_for_auth_v1((payload->>'target_auth_user_id')::uuid,coalesce(payload->>'target_tournament_id','2026'),context);\n when 'READS.IDENTITY_FOR_PLAYER' then result:=production_control.canonical_identity_for_player_v1(payload->>'target_tournament_id',payload->>'target_player_id',context);\n when 'READS.DIRECTOR_ENTITLEMENT' then result:=production_control.canonical_director_entitlement_read_v1((payload->>'target_auth_user_id')::uuid,payload->>'target_tournament_id',context);\n when 'READS.NET_SKINS_V1' then\n  if exists(select 1 from jsonb_object_keys(payload)k where k<>'player_id') then\n    raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_PARTICIPANT_READ_DENIED';end if;\n  result:=production_control.canonical_read_net_skins_v1(jsonb_build_object(\n    'tournament_id',context->>'tournament_id','player_id',payload->>'player_id'),context);\n when 'READS.PUBLISHED_CALCUTTA' then\n  if exists(select 1 from jsonb_object_keys(payload)k where k not in('target_tournament_id','player_id')) then\n    raise exception using errcode='42501',message='CERTIFICATION_CALCUTTA_PARTICIPANT_READ_DENIED';end if;\n  result:=production_control.canonical_read_published_calcutta_v1(jsonb_build_object(\n    'tournament_id',context->>'tournament_id','player_id',payload->>'player_id'),context);\n when 'READS.CURRENT_VIEW' then result:=production_control.canonical_current_view_read_v1(payload,context);\n when 'READS.HISTORY_2026' then result:=production_control.canonical_current_view_read_v1(payload||jsonb_build_object('surface','HISTORY_2026'),context);\n when 'READS.COMPLETED_HISTORY' then result:=production_control.canonical_completed_history_read_v1(payload,context);\n when 'READS.DRAFT' then result:=production_control.canonical_draft_read_v1(payload,context);\n when 'READS.GUIDE' then result:=production_control.canonical_guide_read_v1(payload||jsonb_build_object('domain','GUIDE',\n  'contract_version','guide-projection-v1','source_tabs',\n  '[\"Tournaments\",\"Guide Sections\",\"Tournament Itinerary\",\"Tournament Timeline\",\"Rule Book\",\"Tournament Rules\",\"Rounds\",\"Dining\",\"Local Guide\",\"Important Contacts\",\"Courses\"]'::jsonb),context);\n when 'READS.PREDICTION_SETTINGS' then result:=production_control.canonical_projection_read_v1(payload||jsonb_build_object('domain','PREDICTION_SETTINGS',\n  'contract_version','prediction-settings-v1','source_tabs','[\"Prediction Settings\"]'::jsonb),\n  'PREDICTION_SETTINGS','prediction-settings-v1','[\"Prediction Settings\"]'::jsonb,context);\n when 'READS.PLAYER_EDITORIAL' then result:=production_control.canonical_player_editorial_read_v1(payload||jsonb_build_object('domain','PLAYER_EDITORIAL',\n  'contract_version','player-public-profile-v1','source_tabs','[\"Players\"]'::jsonb),context);\n else raise exception using errcode='42501',message='CERTIFICATION_READ_OPERATION_DENIED';\n end case;\n perform production_control.pop_certification_context_v1();\n return result;\nend;\n",
    "old_hash": "b2a5f297dc9b07dddb10de715b6adb4677b7738ffe6fd118253c5deab46c1bee",
    "new_hash": "bb9c19293624940ef2acc937fa6df0ae89ee5152580d42f4c06a7305d13e5645"
  }
]$manifest$;p jsonb;h text;definition text;before_metadata jsonb;after_metadata jsonb;begin
 for p in select value from jsonb_array_elements(m)loop
  select encode(extensions.digest(prosrc,'sha256'),'hex')into strict h from pg_proc where oid=(p->>'signature')::regprocedure;
  if h not in(p->>'old_hash',p->>'new_hash')then raise exception 'CERTIFICATION_NET_SKINS_RESULT_PREDECESSOR_MISMATCH: %',p->>'signature';end if;
 end loop;
 if to_regprocedure('production_control.canonical_read_net_skins_v1(jsonb,jsonb)')is null then
 execute $core$CREATE FUNCTION production_control.canonical_read_net_skins_v1(input jsonb,context jsonb)returns jsonb
 language plpgsql stable security definer set search_path to 'pg_catalog','production_control','scoring_authority'
 as $body$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  round_value jsonb;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  result_value scoring_authority.net_skins_v1_result_revisions%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  source_fingerprints_value jsonb := '{}'::jsonb;
  entries_value jsonb;
  eligible_players_value jsonb;
  rounds_value jsonb := '[]'::jsonb;
  round_state text;
  top_state text := 'CONFIGURED';
  round_stale boolean;
  any_unavailable boolean := false;
  any_in_progress boolean := false;
  all_official boolean := true;
  max_result_revision bigint := 0;
  max_calculated_at timestamptz;
  max_published_at timestamptz;
  top_source_fingerprint text;
  revision_token text;
begin
  perform production_control.assert_production_service_role();
  if context is null then
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_RESOURCE_ASSERTION_FAILED';
  end if;
  else
    perform production_control.assert_canonical_scoring_context_v1(input,context,'RUNTIME');
    if context->>'phase' is distinct from 'READS'
      or context->>'resource_id' is distinct from 'CERTIFICATION:2857f707-065a-405d-b5fc-b5b6fa1b0f51'
      or context->>'project_ref' is distinct from 'trmcwrljjxwhgtikfdgu'
      or context is distinct from production_control.current_certification_context_v1()
      or input->>'tournament_id' is distinct from '2026'
      or exists(select 1 from jsonb_object_keys(input)k where k not in('player_id','tournament_id'))
      or not production_control.native_calcutta_reader_v1(input->>'player_id','2026',null::uuid) then
      raise exception using errcode='42501',message='CERTIFICATION_NET_SKINS_PARTICIPANT_READ_DENIED';end if;
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;

  if current_value.state = 'NOT_CONFIGURED' then
    revision_token := pg_catalog.format(
      'net-skins-v1:%s:0:NOT_CONFIGURED',
      current_value.configuration_revision
    );
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'contract_version', 'production-net-skins-v1',
        'tournament_id', '2026',
        'state', 'NOT_CONFIGURED',
        'publication_policy', 'OFFICIAL_ONLY',
        'configuration_revision', current_value.configuration_revision,
        'result_revision', null,
        'configuration_fingerprint', null,
        'revision', revision_token,
        'freshness', pg_catalog.jsonb_build_object(
          'stale', false,
          'configured_at', null,
          'calculated_at', null,
          'published_at', null,
          'source_fingerprint', null
        ),
        'rounds', '[]'::jsonb
      )
    );
  end if;

  for round_value in
    select value
    from pg_catalog.jsonb_array_elements(
      revision_value.configuration_manifest->'rounds'
    ) value
    order by (value->>'round_number')::integer
  loop
    source_revision_value :=
      production_control.net_skins_v1_round_source_revision(
        '2026', (round_value->>'round_number')::integer
      );
    source_fingerprint_value :=
      production_control.net_skins_v1_hash(source_revision_value);
    source_fingerprints_value := source_fingerprints_value ||
      pg_catalog.jsonb_build_object(
        round_value->>'round_number', source_fingerprint_value
      );

    job_value := null;
    select value.* into job_value
    from scoring_authority.net_skins_v1_recalculation_jobs value
    where value.tournament_id = '2026'
      and value.round_number = (round_value->>'round_number')::integer
      and value.configuration_revision =
        current_value.configuration_revision
    order by value.requested_at desc, value.job_id desc
    limit 1;

    result_value := null;
    select value.* into result_value
    from scoring_authority.net_skins_v1_result_revisions value
    where value.tournament_id = '2026'
      and value.round_number = (round_value->>'round_number')::integer
      and value.configuration_revision =
        current_value.configuration_revision
      and value.is_current
    limit 1;

    if result_value.result_id is not null
       and result_value.result_state = 'OFFICIAL'
       and result_value.source_fingerprint = source_fingerprint_value then
      round_state := 'OFFICIAL';
      round_stale := false;
    elsif job_value.job_id is not null
       and job_value.source_fingerprint = source_fingerprint_value
       and job_value.status = 'FAILED' then
      round_state := 'UNAVAILABLE';
      round_stale := true;
    elsif job_value.job_id is not null
       and job_value.source_fingerprint = source_fingerprint_value
       and job_value.status in ('PENDING', 'RUNNING') then
      round_state := 'IN_PROGRESS';
      round_stale := true;
    elsif result_value.result_id is not null
       and result_value.result_state = 'PROVISIONAL'
       and result_value.source_fingerprint = source_fingerprint_value then
      round_state := 'IN_PROGRESS';
      round_stale := true;
    elsif exists (
      select 1
      from scoring_authority.matches match_value
      where match_value.tournament_id = '2026'
        and match_value.round_number =
          (round_value->>'round_number')::integer
        and (match_value.status <> 'UPCOMING'
          or match_value.scored_holes > 0)
    ) then
      round_state := 'IN_PROGRESS';
      round_stale := true;
    else
      round_state := 'CONFIGURED';
      round_stale := false;
    end if;

    entries_value := coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'entry_id', entry->>'entry_id',
          'entry_type', entry->>'entry_type',
          'match_id', entry->>'match_id',
          'player_ids', entry->'player_ids'
        ) order by entry->>'entry_id'
      )
      from pg_catalog.jsonb_array_elements(round_value->'entries') entry
      where coalesce((entry->>'eligible')::boolean, false)
    ), '[]'::jsonb);
    eligible_players_value := coalesce((
      select pg_catalog.jsonb_agg(player_id order by player_id)
      from (
        select distinct pg_catalog.jsonb_array_elements_text(
          entry->'player_ids'
        ) as player_id
        from pg_catalog.jsonb_array_elements(round_value->'entries') entry
        where coalesce((entry->>'eligible')::boolean, false)
      ) player_values
    ), '[]'::jsonb);

    any_unavailable := any_unavailable or round_state = 'UNAVAILABLE';
    any_in_progress := any_in_progress or round_state = 'IN_PROGRESS';
    all_official := all_official and round_state = 'OFFICIAL';
    max_result_revision := greatest(
      max_result_revision, coalesce(result_value.result_revision, 0)
    );
    if result_value.calculated_at is not null
       and (max_calculated_at is null
         or result_value.calculated_at > max_calculated_at) then
      max_calculated_at := result_value.calculated_at;
    end if;
    if result_value.published_at is not null
       and (max_published_at is null
         or result_value.published_at > max_published_at) then
      max_published_at := result_value.published_at;
    end if;

    rounds_value := rounds_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'round_id', round_value->>'round_id',
        'round_number', (round_value->>'round_number')::integer,
        'format', round_value->>'format',
        'entry_type', round_value->>'entry_type',
        'buy_in_per_entry', (round_value->>'buy_in_per_entry')::numeric,
        'eligible_entry_count', pg_catalog.jsonb_array_length(entries_value),
        'eligible_player_ids', eligible_players_value,
        'match_ids', round_value->'match_ids',
        'entries', entries_value,
        'state', round_state,
        'configuration_revision', current_value.configuration_revision,
        'result_revision', case when result_value.result_id is null
          then null else result_value.result_revision end,
        'configuration_fingerprint',
          round_value->>'configuration_fingerprint',
        'freshness', pg_catalog.jsonb_build_object(
          'stale', round_stale,
          'calculated_at', result_value.calculated_at,
          'published_at', case when round_state = 'OFFICIAL'
            then result_value.published_at else null end,
          'source_fingerprint', source_fingerprint_value
        ),
        'result_payload', case when round_state = 'OFFICIAL'
          then result_value.engine_result_payload || jsonb_build_object('participantLabels', production_control.native_published_skins_labels_v1('2026',result_value.engine_result_payload)) else null end,
        'official_results', case when round_state = 'OFFICIAL'
          then result_value.public_result_payload else null end
      )
    );
  end loop;

  top_state := case
    when any_unavailable then 'UNAVAILABLE'
    when all_official and pg_catalog.jsonb_array_length(rounds_value) > 0
      then 'OFFICIAL'
    when any_in_progress
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(rounds_value) value
        where value->>'state' = 'OFFICIAL'
      ) then 'IN_PROGRESS'
    else 'CONFIGURED'
  end;
  top_source_fingerprint := production_control.net_skins_v1_hash(
    source_fingerprints_value
  );
  revision_token := pg_catalog.format(
    'net-skins-v1:%s:%s:%s',
    current_value.configuration_revision,
    max_result_revision,
    top_state
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'tournament_id', '2026',
      'state', top_state,
      'publication_policy', 'OFFICIAL_ONLY',
      'configuration_revision', current_value.configuration_revision,
      'result_revision', case when max_result_revision = 0
        then null else max_result_revision end,
      'configuration_fingerprint',
        revision_value.configuration_fingerprint,
      'revision', revision_token,
      'freshness', pg_catalog.jsonb_build_object(
        'stale', any_unavailable or any_in_progress,
        'configured_at', revision_value.configured_at,
        'calculated_at', max_calculated_at,
        'published_at', max_published_at,
        'source_fingerprint', top_source_fingerprint
      ),
      'rounds', rounds_value
    )
  );
end;
$body$;$core$;
 execute format('alter function production_control.canonical_read_net_skins_v1(jsonb,jsonb)owner to %I',pg_get_userbyid((select proowner from pg_proc where oid='public.read_production_net_skins_frozen_2026_v1(jsonb)'::regprocedure)));
 execute 'revoke all on function production_control.canonical_read_net_skins_v1(jsonb,jsonb)from public,anon,authenticated,service_role';
 end if;
 for p in select value from jsonb_array_elements(m)loop
  select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'security',prosecdef,
   'config',proconfig,'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)
   into strict h,before_metadata from pg_proc where oid=(p->>'signature')::regprocedure;
  if h=p->>'old_hash'then
   definition:=pg_get_functiondef((p->>'signature')::regprocedure);
   if position(p->>'old' in definition)=0 then raise exception 'CERTIFICATION_NET_SKINS_RESULT_BODY_DRIFT';end if;
   execute replace(definition,p->>'old',p->>'new');end if;
  select encode(extensions.digest(prosrc,'sha256'),'hex'),jsonb_build_object('owner',proowner,'acl',proacl,'security',prosecdef,
   'config',proconfig,'language',prolang,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict)
   into strict h,after_metadata from pg_proc where oid=(p->>'signature')::regprocedure;
  if h<>p->>'new_hash'or before_metadata is distinct from after_metadata then raise exception 'CERTIFICATION_NET_SKINS_RESULT_METADATA_DRIFT';end if;
 end loop;
end;$install$;
do $verify$declare p pg_proc%rowtype;begin
 select * into strict p from pg_proc where oid='production_control.canonical_read_net_skins_v1(jsonb,jsonb)'::regprocedure;
 if p.proowner<>(select proowner from pg_proc where oid='public.read_production_net_skins_frozen_2026_v1(jsonb)'::regprocedure)
  or p.prosecdef is distinct from true or p.provolatile is distinct from 's'::"char"
  or p.proconfig is distinct from array['search_path=pg_catalog, production_control, scoring_authority']::text[]
  or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee<>p.proowner or a.privilege_type<>'EXECUTE') then
   raise exception 'CERTIFICATION_NET_SKINS_RESULT_PRIVATE_ACL_DRIFT';end if;
 if encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'f6f08a7c15d76c3c76a7e7e8569780fd5c92705e23f0e3036a4727dadc355520'then raise exception 'CERTIFICATION_NET_SKINS_RESULT_CORE_DRIFT';end if;
end;$verify$;
commit;
