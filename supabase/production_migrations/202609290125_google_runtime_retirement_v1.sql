-- Phase2C.1 candidate only. Production deployment requires separate authorization.
-- Created with local Supabase CLI migration-new; renamed to repository production sequence125.
-- Canonical snapshots, audit, history, identity provenance and all historical job rows remain intact.
begin;
do $precondition$
begin
 if exists(select 1 from production_control.annual_side_game_runtime_certifications_v1) then
  raise exception using errcode='55000',message='GOOGLE_RETIREMENT_EXISTING_ANNUAL_CERTIFICATION_REQUIRES_REVIEW';
 end if;
end;
$precondition$;

-- Legacy destination metadata remains readable for historical receipts/rollback.
-- New canonical annual authority does not need a fabricated Google writer identity.
alter table production_control.annual_scoring_runtime_authorities_v1
 alter column google_writer_generation_id drop not null,
 alter column destination_workbook_id drop not null,
 alter column google_target_contract_fingerprint drop not null;

do $policy_constraint$
declare constraint_name text; matching integer;
begin
 select min(c.conname),count(*) into constraint_name,matching
 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid
  and a.attname='google_compatibility_policy'
 where c.conrelid='production_control.future_tournament_resources_v1'::regclass
  and c.contype='c' and c.conkey=array[a.attnum]::smallint[];
 if matching<>1 then raise exception 'GOOGLE_RETIREMENT_RESOURCE_POLICY_CONSTRAINT_REQUIRED';end if;
 execute format('alter table production_control.future_tournament_resources_v1 drop constraint %I',constraint_name);
end;
$policy_constraint$;
alter table production_control.future_tournament_resources_v1
 add constraint future_tournament_resources_google_policy_retired_v1 check(
 google_compatibility_policy in('CURRENT_CERTIFIED','PROVISIONING_REQUIRED','RETIRED'));

create function pg_temp.patch_google_retirement_v1(signature text,expected_hash text,changes jsonb)
returns void language plpgsql set search_path=pg_catalog as $patch$
declare definition text;actual_hash text;item jsonb;needle text;
begin
 select pg_get_functiondef(oid),encode(extensions.digest(prosrc,'sha256'),'hex')
  into strict definition,actual_hash from pg_proc where oid=signature::regprocedure;
 if actual_hash is distinct from expected_hash then
  raise exception 'GOOGLE_RETIREMENT_SOURCE_BASELINE_MISMATCH: %',signature;end if;
 for item in select value from jsonb_array_elements(changes) loop
  needle:=item->>0;
  if needle='' or (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
   raise exception 'GOOGLE_RETIREMENT_SOURCE_ANCHOR_MISMATCH: %',signature;end if;
  definition:=replace(definition,needle,item->>1);
 end loop;
 execute definition;
end;
$patch$;

select pg_temp.patch_google_retirement_v1('public.submit_production_hole_score(jsonb)',
 'ea54f252db5c4ac7bb59f74c97c247ab52bb83c9ace9e9bc6e1da9bd5fd31f60', $changes$[
  [
    "insert into scoring_authority.google_outbox_events (\n    tournament_id, match_id, match_revision, hole_number, hole_revision,\n    mutation_key, event_type, payload, payload_hash\n  ) values (\n    '2026', target_match, next_match_revision, target_hole, next_hole_revision,\n    mutation_identity, 'HOLE_SCORE_UPSERTED', result_value, payload_hash_value\n  );",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.future_production_submit_hole_score_v1(jsonb)',
 '022d794fd8c825864df056f72b3b270e8bc5e5389dee49db3b36775d5cd4c603', $changes$[
  [
    "insert into scoring_authority.google_outbox_events (\n    tournament_id, match_id, match_revision, hole_number, hole_revision,\n    mutation_key, event_type, payload, payload_hash\n  ) values (target_tournament, target_match, next_match_revision, target_hole,\n    next_hole_revision, mutation_identity, 'HOLE_SCORE_UPSERTED', result_value, payload_hash_value);",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.mutate_production_match_control(jsonb)',
 'f0df704b9885344265256b5adb0acb3469b2dd59857cfb712e1f761cd554fb19', $changes$[
  [
    "insert into scoring_authority.google_outbox_events (\n    tournament_id, match_id, match_revision, mutation_key,\n    event_type, payload, payload_hash\n  ) values (\n    '2026', target_match, next_match_revision, mutation_identity,\n    event_type, result_value, payload_hash_value\n  );",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.future_production_mutate_match_control_v1(jsonb)',
 '03da0c4cb3ed48f42e21d0dd736c153b729de8a0b258d75677c1176c68db186c', $changes$[
  [
    "insert into scoring_authority.google_outbox_events\n    (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)\n  values (target_tournament, target_match, next_match_revision, mutation_identity,\n    event_type, result_value, payload_hash_value);",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.finalize_production_match(jsonb)',
 '386b74b9250203331ada325dc02b6105710b4eb50033db02cdd3b097223c08d0', $changes$[
  [
    "insert into scoring_authority.google_outbox_events (\n    tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash\n  ) values ('2026', target_match, next_revision, mutation_identity, 'MATCH_FINALIZED', result_value, payload_hash_value);",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.future_production_finalize_match_v1(jsonb)',
 'e9a251f920ca4488f3e78d877eb454e739c4a7d52d5b3f6495ce2d2f14bfffd5', $changes$[
  [
    "insert into scoring_authority.google_outbox_events\n    (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)\n  values (target_tournament, target_match, next_revision, mutation_identity,\n    'MATCH_FINALIZED', result_value, payload_hash_value);",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.reopen_production_match(jsonb)',
 '7df9a45dc81a182ef939573c82e5d362ff87a84a3131773bf1926e5396d055d1', $changes$[
  [
    "insert into scoring_authority.google_outbox_events (\n    tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash\n  ) values ('2026', target_match, next_revision, mutation_identity, 'MATCH_REOPENED', result_value, payload_hash_value);",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.future_production_reopen_match_v1(jsonb)',
 'd81f798353bf20ce5851d11e70da90380709944ac0ec1d41dccc97abdc04934e', $changes$[
  [
    "insert into scoring_authority.google_outbox_events\n    (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)\n  values (target_tournament, target_match, next_revision, mutation_identity,\n    'MATCH_REOPENED', result_value, payload_hash_value);",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('scoring_authority.capture_finalized_scorecard_snapshot(text,text)',
 '8017557063a1915d7c2aa4befd774d95736adf419c8a99a90505456a3614f7be', $changes$[
  [
    "insert into scoring_authority.scorecard_archive_jobs (\n      tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,\n      source_fingerprint, archive_payload_hash\n    ) values (\n      existing_row.tournament_id, existing_row.match_id, existing_row.snapshot_id, existing_row.snapshot_revision,\n      existing_row.match_revision, 'SCORECARD_ARCHIVE_UPSERT', existing_row.source_fingerprint, existing_row.payload_hash\n    ) on conflict (match_id, event_type, match_revision) do nothing;",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "insert into scoring_authority.scorecard_archive_jobs (\n    tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,\n    source_fingerprint, archive_payload_hash\n  ) values (\n    match_row.tournament_id, match_row.match_id, new_snapshot_id, next_snapshot_revision, match_row.match_revision,\n    'SCORECARD_ARCHIVE_UPSERT', source_hash, payload_hash_value\n  );",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "insert into scoring_authority.scorecard_archive_checkpoints (\n    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,\n    finalized_match_revision, source_fingerprint, archive_payload_hash, status,\n    last_error_code, last_error_safe, verified_at\n  ) values (\n    match_row.match_id, match_row.tournament_id, new_snapshot_id, next_snapshot_revision,\n    match_row.match_revision, source_hash, payload_hash_value, 'PENDING', null, null, null\n  ) on conflict (match_id) do update set\n    tournament_id = excluded.tournament_id, current_snapshot_id = excluded.current_snapshot_id,\n    finalized_snapshot_revision = excluded.finalized_snapshot_revision,\n    finalized_match_revision = excluded.finalized_match_revision,\n    source_fingerprint = excluded.source_fingerprint, archive_payload_hash = excluded.archive_payload_hash,\n    expected_logical_identities = '[]'::jsonb, google_row_numbers = '[]'::jsonb,\n    google_readback_hash = null, status = 'PENDING', last_job_id = null,\n    last_error_code = null, last_error_safe = null, verified_at = null, updated_at = now();",
    "-- Google runtime retired: external delivery is not canonical authority."
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('scoring_authority.invalidate_finalized_scorecard_snapshot(text,bigint,text)',
 '25de755e366adb09452b30e7c70b3b3d63139a2c890f7234ed3204b49beab35f', $changes$[
  [
    "insert into scoring_authority.scorecard_archive_jobs (\n    tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,\n    source_fingerprint, archive_payload_hash\n  ) values (\n    match_row.tournament_id, match_row.match_id, snapshot_row.snapshot_id, snapshot_row.snapshot_revision,\n    target_match_revision, 'SCORECARD_ARCHIVE_INVALIDATE', snapshot_row.source_fingerprint, snapshot_row.payload_hash\n  ) on conflict (match_id, event_type, match_revision) do nothing;",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "insert into scoring_authority.scorecard_archive_checkpoints (\n    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,\n    finalized_match_revision, source_fingerprint, archive_payload_hash, status,\n    last_error_code, last_error_safe, verified_at\n  ) values (\n    match_row.match_id, match_row.tournament_id, snapshot_row.snapshot_id, snapshot_row.snapshot_revision,\n    target_match_revision, snapshot_row.source_fingerprint, snapshot_row.payload_hash,\n    'PENDING_INVALIDATION', null, null, null\n  ) on conflict (match_id) do update set\n    finalized_match_revision = excluded.finalized_match_revision, status = 'PENDING_INVALIDATION',\n    last_error_code = null, last_error_safe = null, verified_at = null, updated_at = now();",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "'FINALIZED_SCORECARD_ARCHIVE_INVALIDATION_QUEUED'",
    "'FINALIZED_SCORECARD_SNAPSHOT_INVALIDATED'"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.mutate_production_future_year_administration_v1(jsonb)',
 'cc4067b15e88ad89549bf4fa3c416f2cf3be1437d8f7405f3896d18a6799b938', $changes$[
  [
    "insert into production_control.future_match_google_compatibility_jobs_v1 (\n        tournament_id, match_id, requirement_class\n      )\n      select match_value.tournament_id, match_value.match_id,\n        'REQUIRED_FOR_ROLLBACK_EVIDENCE'\n      from production_control.future_match_definitions_v1 match_value\n      where match_value.tournament_id = target_id\n        and match_value.round_number = target_round;",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "select target_id, scope.project_ref, scope.project_url, null,\n      'ANNUAL_RESOURCE_REQUIRED', 1, 'PROVISIONING_REQUIRED', actor_player",
    "select target_id, scope.project_ref, scope.project_url, scope.google_workbook_id,\n      'CURRENT_RESOURCE_BOUND', 1, 'RETIRED', actor_player"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.mutate_production_future_runtime_v2(jsonb)',
 '9d1efa27468fbf9be9b7255245d7a08cd0e4e645ea4b99ec9354cf7a44553c4c', $changes$[
  [
    "insert into scoring_authority.google_match_checkpoints (\n      match_id, last_supabase_match_revision, google_match_revision,\n      google_hole_revisions\n    ) select value.match_id, 0, 0, '{}'::jsonb\n    from production_control.future_match_definitions_v1 value\n    where value.tournament_id = target_id;",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "update production_control.future_match_google_compatibility_jobs_v1 value\n    set writer_installed = false,\n      -- The exact writer manifest depends on configured tee/pairing fields and\n      -- is therefore bound by the leased claim operation after preparation.\n      -- Migration 064's immutable false-only writer guard remains in force;\n      -- do not claim the compatibility writer is installed until replacing\n      -- that guard is separately authorized and certified.\n      expected_manifest_fingerprint = null,\n      status = 'PROVISIONING_REQUIRED', available_at = pg_catalog.clock_timestamp(),\n      updated_at = pg_catalog.clock_timestamp()\n    where value.tournament_id = target_id;",
    "-- Google runtime retired: external delivery is not canonical authority."
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.bind_pending_annual_jobs_v1()',
 'c4a9e73b2cdff9ff50ba30a43f273f2c8f71fe00a49ce569cddd1c06c51c755a', $changes$[
  [
    "update scoring_authority.google_outbox_events set\n      runtime_generation_id = new.runtime_generation_id\n    where tournament_id = new.tournament_id\n      and runtime_generation_id is null and status <> 'DELIVERED';",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "update scoring_authority.scorecard_archive_jobs set\n      runtime_generation_id = new.runtime_generation_id\n    where tournament_id = new.tournament_id\n      and runtime_generation_id is null\n      and status not in ('VERIFIED', 'SUPERSEDED');",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "update scoring_authority.odds_google_mirror_jobs set\n      runtime_generation_id = new.runtime_generation_id\n    where tournament_id = new.tournament_id\n      and runtime_generation_id is null;",
    "-- Google runtime retired: external delivery is not canonical authority."
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.read_production_scoring_authority(jsonb)',
 '25d2e2634429afec8a879bf97284a801d701791cefa71da116d634afc8c12576', $changes$[
  [
    "(select count(*) from scoring_authority.google_outbox_events where tournament_id = '2026' and status <> 'DELIVERED')",
    "0 /* external Google delivery retired */"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.future_production_read_scoring_authority_v1(jsonb)',
 '9ad752b78f793fb90c5fdf7d53d07f5258b1a855c37b888368c2e86e125a48ff', $changes$[
  [
    "(select pg_catalog.count(*) from scoring_authority.google_outbox_events\n        where tournament_id = target_tournament and status <> 'DELIVERED')",
    "0 /* external Google delivery retired */"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.future_year_readiness_v1(text)',
 'e06fbccb8a62962d17cb619bd77c7be4c7b6695c168ba182613fac90784f8614', $changes$[
  [
    "select pg_catalog.count(*)::integer into compatibility_pending\n  from production_control.future_match_google_compatibility_jobs_v1 job\n  where job.tournament_id = target_tournament\n    and job.status not in ('CERTIFIED', 'NOT_REQUIRED');",
    "compatibility_pending := 0; -- External compatibility is not required."
  ],
  [
    "  if compatibility_pending > 0 then\n    blockers := blockers || pg_catalog.jsonb_build_array(\n      pg_catalog.jsonb_build_object(\n        'code', 'GOOGLE_COMPATIBILITY_PROVISIONING_REQUIRED',\n        'section', 'Matches',\n        'message', compatibility_pending::text ||\n          ' match archive compatibility records still need certification.'\n      )\n    );\n  end if;",
    ""
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.future_runtime_readiness_before_identity_v1(text)',
 '6c69d9890ea4b1c3495a0612f18aeafba3533c5885edb4dd602a1718ee412ba6', $changes$[
  [
    "select pg_catalog.count(*)::integer into compat_count\n  from production_control.future_match_google_compatibility_jobs_v1 value\n  where value.tournament_id = target_tournament\n    and value.status in ('CERTIFIED', 'NOT_REQUIRED');",
    "compat_count := 0; -- Zero required Google certifications; not a fabricated PASS."
  ],
  [
    "  if compat_count <> match_count then\n    blockers := blockers || pg_catalog.jsonb_build_array(\n      pg_catalog.jsonb_build_object('code',\n        'FUTURE_GOOGLE_COMPATIBILITY_NOT_CERTIFIED',\n        'section', 'Compatibility',\n        'message', 'Downstream Google compatibility is not certified.')\n    );\n  end if;",
    ""
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.assert_annual_scoring_runtime_pre_side_games_v1(jsonb,text,text)',
 'a5e48808a486c7675b05c7a7d757e43518413ca5f05c49af9f946f8931249ebc', $changes$[
  [
    "  if pg_catalog.to_regclass(\n       'production_control.future_google_writer_targets_v2'\n     ) is null then\n    raise exception using errcode = '55000',\n      message = 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED';\n  end if;\n  execute $writer$\n    select pg_catalog.jsonb_build_object(\n      'writerGenerationId', value.writer_generation_id,\n      'destinationWorkbookId', value.destination_workbook_id,\n      'targetContractFingerprint', value.target_contract_fingerprint\n    )\n    from production_control.future_google_writer_targets_v2 value\n    where value.tournament_id = $1 and value.contract_status = 'CERTIFIED'\n  $writer$ into certified_writer using pointer.tournament_id;",
    "-- Google runtime retired; canonical authority checks remain below."
  ],
  [
    "     or certified_writer is null\n     or input->>'expected_google_writer_generation_id' is distinct from\n       certified_writer->>'writerGenerationId'\n     or input->>'annual_destination_workbook_id' is distinct from\n       certified_writer->>'destinationWorkbookId'\n     or input->>'expected_google_target_contract_fingerprint' is distinct from\n       certified_writer->>'targetContractFingerprint'\n     or annual.google_writer_generation_id::text is distinct from\n       certified_writer->>'writerGenerationId'\n     or annual.destination_workbook_id is distinct from\n       certified_writer->>'destinationWorkbookId'\n     or annual.google_target_contract_fingerprint is distinct from\n       certified_writer->>'targetContractFingerprint'\n     or generation.pointer_revision <> pointer.pointer_revision",
    "     or generation.pointer_revision <> pointer.pointer_revision"
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.ensure_annual_side_game_runtime_v1(text,uuid,uuid,uuid,boolean)',
 '2645006c29f0db407370854140a2d0471200f46f6a3e60fbe40f3d0841819f06', $changes$[
  [
    "select value.* into strict writer\n  from production_control.future_google_writer_targets_v2 value\n  where value.tournament_id = target_tournament_id\n    and value.contract_status = 'CERTIFIED';",
    "-- Google runtime retired: external delivery is not canonical authority."
  ],
  [
    "    'contractVersion', 'production-annual-side-game-resource-v1',",
    "    'contractVersion', 'production-annual-side-game-resource-v2-google-retired',"
  ],
  [
    "    'admissionGenerationId', generation.admission_generation_id,\n    'googleWriterGenerationId', writer.writer_generation_id,\n    'googleTargetFingerprint', writer.target_contract_fingerprint",
    "    'admissionGenerationId', generation.admission_generation_id,\n    'externalGoogleDelivery', 'RETIRED'"
  ],
  [
    "     or resource.source_workbook_id is distinct from\n       writer.destination_workbook_id",
    ""
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)',
 '944168cefe4dc00327b04ca79e9102d6bc93f555ac35c08e95aef6618a73d394', $changes$[
  [
    "perform production_control\n    .assert_future_google_writer_live_implementation_v2(\n      target_tournament_id\n    );",
    "-- Google runtime retired: external delivery is not canonical authority."
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.activate_production_annual_scoring_transition_v1(jsonb)',
 'c27b10b427a3cfb72eead47c5f4c105ab93bcfc30e2d9fb44cb35b3b2a29b423', $changes$[
  [
    "  if pg_catalog.to_regclass(\n       'production_control.future_google_writer_targets_v2'\n     ) is null then\n    raise exception using errcode = '55000',\n      message = 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED';\n  end if;",
    ""
  ],
  [
    "  execute $writer$\n    select pg_catalog.jsonb_build_object(\n      'writerGenerationId', value.writer_generation_id,\n      'destinationWorkbookId', value.destination_workbook_id,\n      'targetContractFingerprint', value.target_contract_fingerprint\n    )\n    from production_control.future_google_writer_targets_v2 value\n    where value.tournament_id = $1 and value.contract_status = 'CERTIFIED'\n  $writer$ into certified_writer using successor.tournament_id;\n  if certified_writer is null\n     or input->>'expected_google_writer_generation_id' is distinct from\n       certified_writer->>'writerGenerationId'\n     or input->>'annual_destination_workbook_id' is distinct from\n       certified_writer->>'destinationWorkbookId'\n     or input->>'expected_google_target_contract_fingerprint' is distinct from\n       certified_writer->>'targetContractFingerprint' then\n    raise exception using errcode = '55000',\n      message = 'PRODUCTION_ANNUAL_GOOGLE_DESTINATION_REQUIRED';\n  end if;",
    ""
  ],
  [
    "    (certified_writer->>'writerGenerationId')::uuid,\n    certified_writer->>'destinationWorkbookId',\n    certified_writer->>'targetContractFingerprint',",
    "    null, null, null, -- Retired optional destination metadata; never fabricated certification."
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.annual_scoring_predecessor_certificate_pre_side_games_v1(text)',
 '885366792116eea62866dfac9f6722cfa352182749000424359128c6a3b635fc', $changes$[
  [
    "select pg_catalog.count(*)::integer into unresolved_outbox\n  from scoring_authority.google_outbox_events value\n  where value.tournament_id = target_tournament_id\n    and value.status <> 'DELIVERED';",
    "unresolved_outbox := 0; -- Retired external delivery is not required work."
  ],
  [
    "select pg_catalog.count(*)::integer into unresolved_archive\n  from scoring_authority.scorecard_archive_jobs value\n  where value.tournament_id = target_tournament_id\n    and value.status not in ('VERIFIED', 'SUPERSEDED');",
    "unresolved_archive := 0; -- Canonical snapshots already committed; export is retired."
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.advance_annual_scoring_transition_v1(uuid,jsonb)',
 'cc0fe42d8eec7714353b12a0874fefdbe484e85a5294373eb88cfd4325be51ec', $changes$[
  [
    "select pg_catalog.count(*)::integer into unresolved_outbox\n    from scoring_authority.google_outbox_events value\n    where value.tournament_id = pointer.tournament_id\n      and value.status <> 'DELIVERED';",
    "unresolved_outbox := 0; -- Retired external delivery is not required work."
  ],
  [
    "select pg_catalog.count(*)::integer into unresolved_archive\n    from scoring_authority.scorecard_archive_jobs value\n    where value.tournament_id = pointer.tournament_id\n      and value.status not in ('VERIFIED', 'SUPERSEDED');",
    "unresolved_archive := 0; -- Canonical snapshots already committed; export is retired."
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.close_annual_scoring_predecessor_pre_derived_workers_v1(jsonb,text)',
 '07e6677f553e1b87d28fe87ae845a4d03156d3c2f9602c8515cc4ae16ed4b6c6', $changes$[
  [
    "\n     or exists (\n       select 1 from scoring_authority.google_outbox_events value\n       where value.tournament_id = pointer.tournament_id\n         and value.status <> 'DELIVERED'\n     )",
    ""
  ],
  [
    "\n     or exists (\n       select 1 from scoring_authority.scorecard_archive_jobs value\n       where value.tournament_id = pointer.tournament_id\n         and value.status not in ('VERIFIED', 'SUPERSEDED')\n     )",
    ""
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('public.abort_production_annual_scoring_transition_v1(jsonb)',
 '0cb67eb07a275cc3ebbf01e98dd0ac36b457a0fc510820e9c9c9a96849ee3d84', $changes$[
  [
    "\n       or exists (\n         select 1 from scoring_authority.google_outbox_events value\n         where value.tournament_id = pointer.tournament_id\n           and value.status <> 'DELIVERED'\n       )",
    ""
  ],
  [
    "\n       or exists (\n         select 1 from scoring_authority.scorecard_archive_jobs value\n         where value.tournament_id = pointer.tournament_id\n           and value.status not in ('VERIFIED', 'SUPERSEDED')\n       )",
    ""
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.annual_scoring_predecessor_certificate_pre_derived_workers_v1(text)',
 '2a5f0cfc188c2dbe6910a38e9296d8493c744077103a021f930353ad39eee6fa', $changes$[
  [
    "select pg_catalog.count(*)::integer into odds_mirror_rows\n  from scoring_authority.odds_google_mirror_jobs value\n  where value.tournament_id = target_tournament_id\n    and value.status not in ('SUCCEEDED', 'SUPERSEDED');",
    "odds_mirror_rows := 0; -- External mirror retired."
  ],
  [
    "      +\n      (select pg_catalog.count(*)\n       from scoring_authority.odds_google_mirror_jobs value\n       where value.tournament_id = target_tournament_id\n         and value.status not in ('SUCCEEDED', 'SUPERSEDED')\n         and value.runtime_generation_id is distinct from runtime_generation)",
    ""
  ],
  [
    "  if odds_mirror_rows <> 0 then\n    blockers := blockers || pg_catalog.jsonb_build_array(\n      'PREDECESSOR_ODDS_RETIRED_MIRROR_PRESENT'\n    );\n  end if;",
    ""
  ]
]$changes$::jsonb);

select pg_temp.patch_google_retirement_v1('production_control.annual_side_game_implementation_manifest_v1()',
 '7c6d777ef9204b8cea9f2d8921083363788bef325c89ea24e4597eb690f1c72f', $changes$[
  [
    "return baseline||jsonb_build_object('scoreDerivedDeliveryContract'",
    "return baseline||jsonb_build_object('googleRuntimeContract','google-runtime-retired-v1','scoreDerivedDeliveryContract'"
  ]
]$changes$::jsonb);

drop function pg_temp.patch_google_retirement_v1(text,text,jsonb);
-- Remove only automatic provider delivery binding. Existing jobs/claims are
-- retained as historical evidence, never relabeled DELIVERED or VERIFIED.
drop trigger google_outbox_annual_generation_v1 on scoring_authority.google_outbox_events;
drop trigger scorecard_archive_annual_generation_v1 on scoring_authority.scorecard_archive_jobs;
drop trigger odds_google_mirror_annual_generation_v1 on scoring_authority.odds_google_mirror_jobs;
drop trigger sync_future_google_writer_binding_v2 on production_control.future_runtime_match_bindings_v2;

-- Service endpoints for retired workers cannot resume historical delivery.
revoke all on function public.adopt_production_future_google_destination_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.certify_production_future_google_writer_target_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.claim_production_future_google_compatibility_job_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.claim_production_future_match_google_compatibility_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.claim_production_future_match_google_compatibility_v2(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.claim_production_google_outbox(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.claim_production_google_outbox_event(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.claim_production_scorecard_archive_job(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.complete_production_future_google_compatibility_job_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.complete_production_future_match_google_compatibility_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.complete_production_future_match_google_compatibility_v2(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.complete_production_google_outbox(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.complete_production_scorecard_archive_job(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.fail_production_future_google_compatibility_job_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.fail_production_future_match_google_compatibility_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.fail_production_future_match_google_compatibility_v2(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.fail_production_google_outbox(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.fail_production_scorecard_archive_job(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_claim_google_outbox_event_pre_generation_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_claim_google_outbox_event_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_claim_google_outbox_pre_generation_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_claim_google_outbox_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_claim_scorecard_archive_job_pre_generation_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_claim_scorecard_archive_job_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_complete_google_outbox_pre_generation_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_complete_google_outbox_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_complete_scorecard_archive_job_pre_generation(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_complete_scorecard_archive_job_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_fail_google_outbox_pre_generation_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_fail_google_outbox_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_fail_scorecard_archive_job_pre_generation_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.future_production_fail_scorecard_archive_job_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.read_production_annual_google_destination_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.resolve_production_future_match_google_compatibility_v2(jsonb) from public,anon,authenticated,service_role;

-- Installation-only metadata transition; restore the exact immutable guard in the same transaction.
alter table production_control.annual_scoring_rpc_allowlist_v1
 disable trigger production_annual_scoring_rpc_allowlist_immutable_v1;
update production_control.annual_scoring_rpc_allowlist_v1 set enabled=false
 where operation_name in('claim_production_google_outbox','claim_production_google_outbox_event',
 'complete_production_google_outbox','fail_production_google_outbox',
 'claim_production_scorecard_archive_job','complete_production_scorecard_archive_job',
 'fail_production_scorecard_archive_job');
alter table production_control.annual_scoring_rpc_allowlist_v1
 enable trigger production_annual_scoring_rpc_allowlist_immutable_v1;

comment on table scoring_authority.google_outbox_events is
 'Historical external delivery evidence. Google runtime retired by phase2c1; no current producer/worker or completion obligation. Preserve historical status/payload; not scoring authority.';
comment on table scoring_authority.scorecard_archive_jobs is
 'Historical external report-delivery evidence. Canonical finalized_scorecard_snapshots remain required and independent. No current external delivery obligation.';
comment on table scoring_authority.scorecard_archive_checkpoints is
 'Historical Google external-readback evidence; not current canonical snapshot readiness.';
comment on table production_control.future_match_google_compatibility_jobs_v1 is
 'Historical Google destination certification evidence. No current tournament-readiness obligation or automatic producer.';

commit;
