-- Phase2C.1 candidate only. No deployment is authorized by this migration.
-- Created via Supabase CLI migration-new in an isolated scratch directory;
-- renamed to repository production sequence126. Historical manifests/jobs remain intact.
begin;
create function pg_temp.patch_google_release_retirement_v1(signature text, expected_hash text, changes jsonb)
returns void language plpgsql set search_path=pg_catalog as $patch$
declare definition text; actual_hash text; item jsonb; needle text;
begin
 select pg_get_functiondef(oid),encode(extensions.digest(prosrc,'sha256'),'hex')
 into strict definition,actual_hash from pg_proc where oid=signature::regprocedure;
 if actual_hash is distinct from expected_hash then
  raise exception 'GOOGLE_RELEASE_RETIREMENT_SOURCE_BASELINE_MISMATCH: %',signature;end if;
 for item in select value from jsonb_array_elements(changes) loop
  needle:=item->>0;
  if needle='' or (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
   raise exception 'GOOGLE_RELEASE_RETIREMENT_SOURCE_ANCHOR_MISMATCH: %',signature;end if;
  definition:=replace(definition,needle,item->>1);
 end loop;
 execute definition;
end;
$patch$;

select pg_temp.patch_google_release_retirement_v1('production_control.postcutover_annual_release_context_v1()',
 '734c5f74597b958d9940e0eaf9e1b0a00b1118a7643dcea311316b76c2008518',$changes$[
  [
    "  writer production_control.future_google_writer_targets_v2%rowtype;\n",
    ""
  ],
  [
    "  select value.* into strict writer\n  from production_control.future_google_writer_targets_v2 value\n  where value.tournament_id = pointer.tournament_id\n    and value.contract_status = 'CERTIFIED';",
    "  -- External writer retirement: annual canonical authority is independently certified."
  ],
  [
    "     or writer.writer_generation_id is distinct from\n       annual.google_writer_generation_id\n     or writer.destination_workbook_id is distinct from\n       annual.destination_workbook_id\n     or writer.target_contract_fingerprint is distinct from\n       annual.google_target_contract_fingerprint\n",
    ""
  ],
  [
    "     or exists (\n       select 1 from scoring_authority.odds_google_mirror_jobs value\n       where value.tournament_id = pointer.tournament_id\n         and value.status = 'RUNNING'\n     )\n     or exists (\n       select 1 from scoring_authority.google_outbox_events value\n       where value.tournament_id = pointer.tournament_id\n         and (value.status = 'PROCESSING' or value.claimed_by is not null\n           or value.lease_expires_at is not null)\n     )\n     or exists (\n       select 1 from scoring_authority.scorecard_archive_jobs value\n       where value.tournament_id = pointer.tournament_id\n         and (value.status = 'PROCESSING' or value.claim_token is not null\n           or value.claimed_by is not null\n           or value.lease_expires_at is not null)\n     )\n     or exists (\n       select 1\n       from production_control.future_match_google_compatibility_jobs_v1 value\n       where value.tournament_id = pointer.tournament_id\n         and (value.status = 'PROCESSING' or value.claim_token is not null\n           or value.claimed_by is not null\n           or value.lease_expires_at is not null)\n     )",
    ""
  ],
  [
    "  perform production_control\n    .assert_future_google_writer_live_implementation_v2(\n      pointer.tournament_id\n    );\n",
    ""
  ],
  [
    "    'googleWriterGenerationId', writer.writer_generation_id,\n    'googleTargetContractFingerprint',\n      writer.target_contract_fingerprint,",
    "    'googleRuntimeContract', 'google-runtime-retired-v1',"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_release_retirement_v1('production_control.authorize_production_postcutover_normal_release(jsonb)',
 'f9533d581cbca80738bcff280b5a05e9960c3339658c37b7f4d28418efad4c99',$changes$[
  [
    "     or not resource.google_writes_enabled",
    "     or resource.google_writes_enabled"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_release_retirement_v1('production_control.authorize_production_postcutover_normal_release_frozen_2026_v1(jsonb)',
 '9a0e8f989742c06c9773f360206d7136ea2e5a901f62b3a16658fd3504d774dd',$changes$[
  [
    "     or not resource.google_writes_enabled",
    "     or resource.google_writes_enabled"
  ],
  [
    "     or not (\n       (resource.odds_publication_authority = 'GOOGLE'\n         and not resource.odds_publication_enabled)\n       or\n       (resource.odds_publication_authority = 'SUPABASE'\n         and resource.odds_publication_enabled)\n     )",
    "     or resource.odds_publication_authority is distinct from 'SUPABASE'\n     or not resource.odds_publication_enabled"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_release_retirement_v1('production_control.rebind_production_postcutover_normal_release(jsonb)',
 '91f7005bc28bffb66def46fd70e2f93d1c837942fb485000c836c7e66c29bfd9',$changes$[
  [
    "input->'runtime_google_ingress_lease_gate_enabled'\n       is distinct from 'true'::jsonb",
    "input->'runtime_google_ingress_lease_gate_enabled'\n       is distinct from 'false'::jsonb"
  ],
  [
    "input->'runtime_google_mirror_enabled' is distinct from 'true'::jsonb",
    "input->'runtime_google_mirror_enabled' is distinct from 'false'::jsonb"
  ],
  [
    "input->'runtime_scorecard_archive_enabled' is distinct from\n       'true'::jsonb",
    "input->'runtime_scorecard_archive_enabled' is distinct from\n       'false'::jsonb"
  ],
  [
    "input->'runtime_outbox_worker_secret_configured' is distinct from\n       'true'::jsonb",
    "input->'runtime_outbox_worker_secret_configured' is distinct from\n       'false'::jsonb"
  ],
  [
    "input->'runtime_archive_worker_secret_configured' is distinct from\n       'true'::jsonb",
    "input->'runtime_archive_worker_secret_configured' is distinct from\n       'false'::jsonb"
  ],
  [
    "     or not resource.google_writes_enabled",
    "     or resource.google_writes_enabled"
  ],
  [
    "     or 3 <> (\n       select pg_catalog.count(*)\n       from production_control.worker_controls controls\n       join production_control.worker_contracts contracts using (worker_name)\n       where controls.worker_name in (\n         'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE',\n         'ODDS_CALCULATION'\n       )",
    "     or 1 <> (\n       select pg_catalog.count(*)\n       from production_control.worker_controls controls\n       join production_control.worker_contracts contracts using (worker_name)\n       where controls.worker_name = 'ODDS_CALCULATION'\n         and not controls.google_writes_allowed\n         and not contracts.requires_google_write"
  ],
  [
    "  where worker_name in (\n    'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE', 'ODDS_CALCULATION'\n  );",
    "  where worker_name = 'ODDS_CALCULATION';"
  ],
  [
    "     or 1 <> (",
    "     or exists (\n       select 1 from production_control.worker_controls controls\n       where controls.worker_name in ('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE')\n         and (controls.enabled or controls.scheduler_installed or controls.google_writes_allowed)\n     )\n     or 1 <> ("
  ],
  [
    "    'annual_runtime', annual_context,",
    "    'annual_runtime', annual_context,\n    'google_runtime_contract', 'google-runtime-retired-v1',\n    'google_writes_enabled', false,"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_release_retirement_v1('production_control.rebind_production_postcutover_normal_release_frozen_2026_v1(jsonb)',
 'e9c29a995b2f3d6b8ad143facd7921788be5a886ecf5a8e81fad15edb5187f0b',$changes$[
  [
    "input->'runtime_google_ingress_lease_gate_enabled'\n       is distinct from 'true'::jsonb",
    "input->'runtime_google_ingress_lease_gate_enabled'\n       is distinct from 'false'::jsonb"
  ],
  [
    "input->'runtime_google_mirror_enabled' is distinct from 'true'::jsonb",
    "input->'runtime_google_mirror_enabled' is distinct from 'false'::jsonb"
  ],
  [
    "input->'runtime_scorecard_archive_enabled' is distinct from\n       'true'::jsonb",
    "input->'runtime_scorecard_archive_enabled' is distinct from\n       'false'::jsonb"
  ],
  [
    "input->'runtime_outbox_worker_secret_configured' is distinct from\n       'true'::jsonb",
    "input->'runtime_outbox_worker_secret_configured' is distinct from\n       'false'::jsonb"
  ],
  [
    "input->'runtime_archive_worker_secret_configured' is distinct from\n       'true'::jsonb",
    "input->'runtime_archive_worker_secret_configured' is distinct from\n       'false'::jsonb"
  ],
  [
    "     or not resource.google_writes_enabled",
    "     or resource.google_writes_enabled"
  ],
  [
    "     or not (\n       (resource.odds_publication_authority = 'GOOGLE'\n         and not resource.odds_publication_enabled)\n       or\n       (resource.odds_publication_authority = 'SUPABASE'\n         and resource.odds_publication_enabled)\n     )",
    "     or resource.odds_publication_authority is distinct from 'SUPABASE'\n     or not resource.odds_publication_enabled"
  ],
  [
    "     or not (\n       (\n         input->>'runtime_odds_publication_authority' = 'GOOGLE'\n         and input->'runtime_supabase_odds_publication_enabled'\n           = 'false'::jsonb\n       )\n       or\n       (\n         input->>'runtime_odds_publication_authority' = 'SUPABASE'\n         and input->'runtime_supabase_odds_publication_enabled'\n           = 'true'::jsonb\n       )\n     )",
    "     or input->>'runtime_odds_publication_authority' is distinct from 'SUPABASE'\n     or input->'runtime_supabase_odds_publication_enabled' is distinct from 'true'::jsonb"
  ],
  [
    "     or 3 <> (\n       select pg_catalog.count(*)\n       from production_control.worker_controls controls\n       join production_control.worker_contracts contracts using (worker_name)\n       where controls.worker_name in (\n         'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE',\n         'ODDS_CALCULATION'\n       )",
    "     or 1 <> (\n       select pg_catalog.count(*)\n       from production_control.worker_controls controls\n       join production_control.worker_contracts contracts using (worker_name)\n       where controls.worker_name = 'ODDS_CALCULATION'\n         and not controls.google_writes_allowed\n         and not contracts.requires_google_write"
  ],
  [
    "  where worker_name in (\n    'SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE', 'ODDS_CALCULATION'\n  );",
    "  where worker_name = 'ODDS_CALCULATION';"
  ],
  [
    "         and (\n           (controls.worker_name = 'ODDS_CALCULATION'\n             and not controls.google_writes_allowed)\n           or (controls.worker_name <> 'ODDS_CALCULATION'\n             and controls.google_writes_allowed\n             and contracts.requires_google_write)\n         )\n",
    ""
  ],
  [
    "         and (\n           controls.worker_name = 'ODDS_CALCULATION'\n           or controls.metadata->>'activation_epoch_id' = epoch.epoch_id::text\n         )\n",
    ""
  ],
  [
    "     or 1 <> (",
    "     or exists (\n       select 1 from production_control.worker_controls controls\n       where controls.worker_name in ('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE')\n         and (controls.enabled or controls.scheduler_installed or controls.google_writes_allowed)\n     )\n     or 1 <> ("
  ],
  [
    "    'google_writes_enabled', true,",
    "    'google_writes_enabled', false,\n    'google_runtime_contract', 'google-runtime-retired-v1',"
  ],
  [
    "    'outbox_worker_secret_configured', true,",
    "    'outbox_worker_secret_configured', false,"
  ],
  [
    "    'archive_worker_secret_configured', true,",
    "    'archive_worker_secret_configured', false,"
  ]
]$changes$::jsonb);

drop function pg_temp.patch_google_release_retirement_v1(text,text,jsonb);
-- Preserve prior control state as migration evidence, not a fabricated delivery result.
-- Existing authority/rehearsal triggers remain active; unsafe control transitions fail closed.
insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,result,details)
 select 'GOOGLE_RUNTIME_RELEASE_CONTROLS_RETIRED','RELEASE_CONTROL','2026',
 'migration:202609290126','SUCCEEDED',jsonb_build_object(
 'contract','google-runtime-retired-v1','priorGoogleWritesEnabled',google_writes_enabled,
 'workerControls',(select jsonb_agg(to_jsonb(w) order by worker_name)
 from production_control.worker_controls w where worker_name in('SCORING_GOOGLE_OUTBOX','ROUND_SCORECARDS_ARCHIVE')))
 from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION';
update production_control.worker_controls set enabled=false,scheduler_installed=false,google_writes_allowed=false,
 metadata=metadata||jsonb_build_object('googleRuntimeContract','google-runtime-retired-v1',
 'retiredAt',clock_timestamp(),'retiredPriorEnabled',enabled,'retiredPriorSchedulerInstalled',scheduler_installed,
 'retiredPriorGoogleWritesAllowed',google_writes_allowed)
 where worker_name in('SCORING_GOOGLE_OUTBOX','ROUND_SCORECARDS_ARCHIVE');
update production_control.resource_scope set google_writes_enabled=false where scope_key='BAGGER_INV_PRODUCTION';
commit;
