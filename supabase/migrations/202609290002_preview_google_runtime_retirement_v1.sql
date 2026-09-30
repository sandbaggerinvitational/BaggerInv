-- Closure of the independently installed Preview track, not a Production migration.
-- Retains canonical transactions, snapshots, receipts, audits and historical jobs.
-- Local proof only; hosted installation requires separate owner authorization.
begin;
create function pg_temp.retire_preview_google(signature text, expected_hash text, changes jsonb)
returns void language plpgsql set search_path=pg_catalog as $patch$
declare definition text; actual_hash text; item jsonb; needle text;
begin
 select pg_get_functiondef(oid), encode(extensions.digest(prosrc,'sha256'),'hex')
 into strict definition,actual_hash from pg_proc where oid=signature::regprocedure;
 if actual_hash is distinct from expected_hash then raise exception 'PREVIEW_RETIREMENT_BASELINE_MISMATCH: %',signature; end if;
 for item in select value from jsonb_array_elements(changes) loop
  needle:=item->>0;
  if needle='' or (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
   raise exception 'PREVIEW_RETIREMENT_ANCHOR_MISMATCH: %',signature; end if;
  definition:=replace(definition,needle,item->>1);
 end loop;
 execute definition;
end;
$patch$;

select pg_temp.retire_preview_google('public.submit_hole_score_authoritative_phase2_inner(jsonb)',
 '1fc9daed11bef0effa938bfe01a1f8c0370685429a284106539d245aed20dc61', $changes$[
  [
    "  insert into scoring_authority.google_outbox_events (tournament_id, match_id, match_revision, hole_number, hole_revision,\n    mutation_key, event_type, payload, payload_hash)\n  values (match_row.tournament_id, target_match, next_match_revision, target_hole, next_hole_revision, mutation_identity,\n    'HOLE_SCORE_UPSERTED', result_value, payload_hash_value);",
    "  -- External Google delivery is retired; canonical authority and audit remain."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.retire_preview_google('public.finalize_match_authoritative_phase2_inner(jsonb)',
 '22c4a1515ec5f2b9ca3dc110ee031818fe187ce1f6b1ad20b8f901ecb3a35515', $changes$[
  [
    "  insert into scoring_authority.google_outbox_events (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)\n  values (match_row.tournament_id, target_match, next_revision, mutation_identity, 'MATCH_FINALIZED', result_value, payload_hash_value);",
    "  -- External Google delivery is retired; canonical authority and audit remain."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.retire_preview_google('public.reopen_match_authoritative_phase2_inner(jsonb)',
 'e55c751eab48e4a149ee3b609328b6c7aac39e1f4b6d1e4d8a639a771b6384d1', $changes$[
  [
    "  insert into scoring_authority.google_outbox_events (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)\n  values (match_row.tournament_id, target_match, next_revision, mutation_identity, 'MATCH_REOPENED', result_value, payload_hash_value);",
    "  -- External Google delivery is retired; canonical authority and audit remain."
  ],
  [
    "'google_outbox_created', true",
    "'google_outbox_created', false"
  ]
]$changes$::jsonb);

select pg_temp.retire_preview_google('scoring_authority.capture_finalized_scorecard_snapshot(text,text)',
 '8d47c20d2af8912c44b5bdc895c6f5ed8a1be4e394ff8fe369137f5b22e513ea', $changes$[
  [
    "  insert into scoring_authority.scorecard_archive_jobs (\n      tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,\n      source_fingerprint, archive_payload_hash\n    ) values (\n      existing_row.tournament_id, existing_row.match_id, existing_row.snapshot_id, existing_row.snapshot_revision,\n      existing_row.match_revision, 'SCORECARD_ARCHIVE_UPSERT', existing_row.source_fingerprint, existing_row.payload_hash\n    ) on conflict (match_id, event_type, match_revision) do nothing;",
    "  -- External Google delivery is retired; canonical authority and audit remain."
  ],
  [
    "  insert into scoring_authority.scorecard_archive_jobs (\n    tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,\n    source_fingerprint, archive_payload_hash\n  ) values (\n    match_row.tournament_id, match_row.match_id, new_snapshot_id, next_snapshot_revision, match_row.match_revision,\n    'SCORECARD_ARCHIVE_UPSERT', source_hash, payload_hash_value\n  );",
    "  -- External Google delivery is retired; canonical authority and audit remain."
  ],
  [
    "  insert into scoring_authority.scorecard_archive_checkpoints (\n    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,\n    finalized_match_revision, source_fingerprint, archive_payload_hash, status,\n    last_error_code, last_error_safe, verified_at\n  ) values (\n    match_row.match_id, match_row.tournament_id, new_snapshot_id, next_snapshot_revision,\n    match_row.match_revision, source_hash, payload_hash_value, 'PENDING', null, null, null\n  ) on conflict (match_id) do update set\n    tournament_id = excluded.tournament_id, current_snapshot_id = excluded.current_snapshot_id,\n    finalized_snapshot_revision = excluded.finalized_snapshot_revision,\n    finalized_match_revision = excluded.finalized_match_revision,\n    source_fingerprint = excluded.source_fingerprint, archive_payload_hash = excluded.archive_payload_hash,\n    expected_logical_identities = '[]'::jsonb, google_row_numbers = '[]'::jsonb,\n    google_readback_hash = null, status = 'PENDING', last_job_id = null,\n    last_error_code = null, last_error_safe = null, verified_at = null, updated_at = now();",
    "  -- External Google delivery is retired; canonical authority and audit remain."
  ]
]$changes$::jsonb);

select pg_temp.retire_preview_google('scoring_authority.invalidate_finalized_scorecard_snapshot(text,bigint,text)',
 '25de755e366adb09452b30e7c70b3b3d63139a2c890f7234ed3204b49beab35f', $changes$[
  [
    "  insert into scoring_authority.scorecard_archive_jobs (\n    tournament_id, match_id, snapshot_id, snapshot_revision, match_revision, event_type,\n    source_fingerprint, archive_payload_hash\n  ) values (\n    match_row.tournament_id, match_row.match_id, snapshot_row.snapshot_id, snapshot_row.snapshot_revision,\n    target_match_revision, 'SCORECARD_ARCHIVE_INVALIDATE', snapshot_row.source_fingerprint, snapshot_row.payload_hash\n  ) on conflict (match_id, event_type, match_revision) do nothing;",
    "  -- External Google delivery is retired; canonical authority and audit remain."
  ],
  [
    "  insert into scoring_authority.scorecard_archive_checkpoints (\n    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,\n    finalized_match_revision, source_fingerprint, archive_payload_hash, status,\n    last_error_code, last_error_safe, verified_at\n  ) values (\n    match_row.match_id, match_row.tournament_id, snapshot_row.snapshot_id, snapshot_row.snapshot_revision,\n    target_match_revision, snapshot_row.source_fingerprint, snapshot_row.payload_hash,\n    'PENDING_INVALIDATION', null, null, null\n  ) on conflict (match_id) do update set\n    finalized_match_revision = excluded.finalized_match_revision, status = 'PENDING_INVALIDATION',\n    last_error_code = null, last_error_safe = null, verified_at = null, updated_at = now();",
    "  -- External Google delivery is retired; canonical authority and audit remain."
  ],
  [
    "'FINALIZED_SCORECARD_ARCHIVE_INVALIDATION_QUEUED'",
    "'FINALIZED_SCORECARD_SNAPSHOT_INVALIDATED'"
  ]
]$changes$::jsonb);

-- Preserve historical queue rows but prevent automatic or authenticated replay.
do $revoke$
declare value regprocedure;
begin
 for value in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (
  'claim_preview_google_outbox','claim_preview_google_outbox_event',
  'complete_preview_google_outbox','fail_preview_google_outbox',
  'claim_preview_scorecard_archive_job','complete_preview_scorecard_archive_job',
  'fail_preview_scorecard_archive_job','backfill_preview_finalized_scorecard_archives',
  'configure_preview_scorecard_archive_worker')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',value); end loop;
end;
$revoke$;
create function public.read_preview_director_capabilities_v1()
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('ok',true,'contract','preview-director-canonical-controls-v1',
  'google_runtime','RETIRED','actions',jsonb_build_array('finalize','reopen'));
$$;
revoke all on function public.read_preview_director_capabilities_v1() from public,anon,authenticated;
grant execute on function public.read_preview_director_capabilities_v1() to service_role;
-- Bounded receipt resolution for the authenticated server's Director command.
-- The existing compound primary key supplies the lookup; no history scan.
create function public.read_preview_director_operation_v1(input jsonb)
returns jsonb language plpgsql stable security definer
set search_path=scoring_authority,public,extensions,pg_temp as $$
declare receipt scoring_authority.score_mutations%rowtype; target_match scoring_authority.matches%rowtype;
begin
 if input#>>'{authorization,role}' is distinct from 'DIRECTOR'
  or coalesce((input#>>'{authorization,passport_verified}')::boolean,false) is not true
  or coalesce(input#>>'{authorization,player_id}','')='' then
  return jsonb_build_object('ok',false,'code','DIRECTOR_REQUIRED'); end if;
 select * into target_match from scoring_authority.matches where match_id=input->>'match_id';
 if not found or target_match.tournament_id is distinct from input#>>'{authorization,tournament_id}' then
  return jsonb_build_object('ok',false,'code','UNAUTHORIZED'); end if;
 select * into receipt from scoring_authority.score_mutations
 where match_id=target_match.match_id and mutation_key=input->>'mutation_key';
 if not found then return jsonb_build_object('ok',true,'committed',false); end if;
 if receipt.actor_id is distinct from input#>>'{authorization,player_id}'
  or receipt.mutation_type is distinct from upper(input->>'action') then
  return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT'); end if;
 return jsonb_build_object('ok',true,'committed',true,'receipt',receipt.result || jsonb_build_object('idempotent',true));
end;
$$;
revoke all on function public.read_preview_director_operation_v1(jsonb) from public,anon,authenticated;
grant execute on function public.read_preview_director_operation_v1(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
