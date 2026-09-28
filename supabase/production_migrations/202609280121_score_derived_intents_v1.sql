-- Phase 2: keep derived source construction outside canonical score transactions.
-- Non-score match/round lifecycle triggers retain their existing enqueue behavior.
-- A same-transaction COMPETITION intent identifies the match update after a hole
-- write without changing the canonical RPC or introducing a client-controlled flag.
-- Candidate only. Production deployment requires separate owner authorization.
begin;

do $preconditions$
begin
  if exists (select 1 from production_control.annual_side_game_runtime_certifications_v1) then
    raise exception using errcode = '55000',
      message = 'SCORE_DERIVED_INTENTS_EXISTING_ANNUAL_CERTIFICATION_REQUIRES_REVIEW';
  end if;
end;
$preconditions$;

-- The canonical receipt guard must still reject unrestored writer rehearsals.
-- Isolated 0/100/1000 restored-row fixtures showed the exact predicate scanning
-- 25/250 buffers before this index and one buffer after. Retain the global
-- guard's semantics; only exclude irrelevant restored history from its plan.
create index google_writer_fence_rehearsals_unrestored_idx
  on production_control.google_writer_fence_rehearsals (run_id)
  where status = 'RUNNING' or (status = 'FAILED' and not restoration_confirmed);

create table scoring_authority.score_derived_intents_v1 (
  intent_id uuid primary key default extensions.gen_random_uuid(),
  contract_version text not null default 'score-derived-intent-v1'
    check (contract_version = 'score-derived-intent-v1'),
  tournament_id text not null references scoring_authority.tournaments(tournament_id),
  match_id text not null check (length(match_id) between 1 and 120),
  round_number integer check (round_number between 1 and 3),
  source_transaction bigint not null,
  family text not null check (family in ('CALCUTTA', 'NET_SKINS', 'COMPETITION')),
  reason text not null check (length(reason) between 1 and 120),
  canonical_revision jsonb not null check (
    jsonb_typeof(canonical_revision) = 'object' and
    octet_length(canonical_revision::text) <= 2048),
  runtime_generation_id uuid,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RETRYABLE', 'SUCCEEDED', 'DEAD_LETTER')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_sqlstate text check (last_sqlstate ~ '^[A-Z0-9]{5}$'),
  created_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique (tournament_id, match_id, source_transaction, family),
  check (status not in ('PENDING', 'RETRYABLE') or attempts < 5),
  check ((status = 'SUCCEEDED') = (completed_at is not null))
);

-- No history traversal when finding ready work or checking the close fence.
create index score_derived_intents_ready_v1
  on scoring_authority.score_derived_intents_v1
    (tournament_id, family, available_at, created_at, intent_id)
  where status in ('PENDING', 'RETRYABLE');
create index score_derived_intents_unresolved_v1
  on scoring_authority.score_derived_intents_v1 (tournament_id)
  where status <> 'SUCCEEDED';
alter table scoring_authority.score_derived_intents_v1 enable row level security;
revoke all on scoring_authority.score_derived_intents_v1
  from public, anon, authenticated, service_role;

create function production_control.append_score_derived_intent_v1(
  target text, target_match text, target_round integer, family_value text,
  reason_value text, revision_value jsonb, generation_value uuid default null
) returns void language plpgsql security definer set search_path = pg_catalog as $append$
begin
  insert into scoring_authority.score_derived_intents_v1 as stored (
    tournament_id, match_id, round_number, source_transaction, family,
    reason, canonical_revision, runtime_generation_id
  ) values (
    target, target_match, target_round, txid_current(), family_value,
    reason_value, revision_value, generation_value
  ) on conflict (tournament_id, match_id, source_transaction, family)
  do update set reason = excluded.reason,
    canonical_revision = stored.canonical_revision || excluded.canonical_revision,
    status = 'PENDING', attempts = 0, last_sqlstate = null,
    completed_at = null, available_at = clock_timestamp(),
    updated_at = clock_timestamp();
end;
$append$;

create function production_control.score_derived_intents_pending_v1(target text)
returns boolean language sql stable security definer set search_path = pg_catalog as $pending$
  select exists (select 1 from scoring_authority.score_derived_intents_v1
    where tournament_id = target and status <> 'SUCCEEDED')
$pending$;

-- Private helper. Existing worker claims authenticate exact current runtime
-- and input before calling this function; there is no new exposed RPC.
create function production_control.flush_score_derived_intents_v1(
  target text, family_value text, maximum integer default 8
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $flush$
declare
  intent scoring_authority.score_derived_intents_v1%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  generation uuid;
  activation_revision_value bigint;
  engine text;
  processed integer := 0;
  failed integer := 0;
  error_state text;
  error_states jsonb := '[]'::jsonb;
  current_revision jsonb;
  ready_at timestamptz := clock_timestamp();
begin
  if family_value not in ('CALCUTTA', 'NET_SKINS', 'COMPETITION')
     or maximum is null or maximum not between 1 and 8 then
    raise exception using errcode = '22023', message = 'SCORE_DERIVED_INTENT_SCOPE_INVALID';
  end if;
  perform pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key());
  select * into strict pointer from production_control.current_tournament_pointer_v1
    where scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id is distinct from target then
    raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_POINTER_CHANGED';
  end if;
  if target = '2026' then
    if not exists (select 1 from scoring_authority.ingress_gates
      where tournament_id = target and state = 'OPEN' and authority = 'SUPABASE') then
      raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_ADMISSION_CLOSED';
    end if;
  else
    select runtime_generation_id into generation
      from production_control.annual_scoring_runtime_authorities_v1
      where tournament_id = target and authority_status = 'ACTIVE' and admission_state = 'OPEN';
    if generation is null then
      raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_RUNTIME_REQUIRED';
    end if;
  end if;
  select activation_revision into strict activation_revision_value
    from production_control.cutover_activation_state where scope_key = 'BAGGER_INV_PRODUCTION';
  for intent in select * from scoring_authority.score_derived_intents_v1 value
    where value.tournament_id = target and value.family = family_value
      and value.status in ('PENDING', 'RETRYABLE') and value.available_at <= ready_at
    order by value.available_at, value.created_at, value.intent_id
    for update skip locked limit maximum
  loop
    begin
      if intent.runtime_generation_id is distinct from generation then
        raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_GENERATION_CHANGED';
      end if;
      if family_value = 'CALCUTTA' then
        if target = '2026' then
          perform production_control.enqueue_production_calcutta_v1(
            intent.reason, 'score-derived-intent-v1', false, null, null);
        else
          perform production_control.enqueue_annual_calcutta_v1(
            target, generation, activation_revision_value,
            intent.reason, 'score-derived-intent-v1', false, null, null);
        end if;
      elsif family_value = 'NET_SKINS' then
        if target = '2026' then
          perform production_control.enqueue_production_net_skins_v1_round(
            intent.round_number, intent.reason, 'score-derived-intent-v1');
        else
          perform production_control.enqueue_annual_net_skins_v1_round(
            target, generation, intent.round_number, intent.reason, 'score-derived-intent-v1');
        end if;
      else
        -- Current canonical authority is read by the existing processors.
        -- This revision is provenance, never an alternative score snapshot.
        select jsonb_build_object('matchId', value.match_id,
          'matchRevision', value.match_revision, 'status', value.status,
          'scorecardComplete', value.scorecard_complete,
          'resultWinner', value.result_winner)
          into current_revision from scoring_authority.matches value
          where value.match_id = intent.match_id and value.tournament_id = target;
        foreach engine in array array['TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES',
          'TOURNAMENT_INTELLIGENCE', 'PROJECTION_EDITORIAL', 'TOURNAMENT_FINAL_RECAP'] loop
          insert into scoring_authority.competition_recalculation_jobs (
            tournament_id, round_number, engine_key, status,
            requested_source_revision, requested_at, started_at, completed_at,
            last_error_code, last_error_safe, runtime_generation_id,
            claim_token, claimed_by, lease_expires_at, updated_at
          ) values (target, 0, engine, 'PENDING', jsonb_build_object(
              'reason', intent.reason, 'revision', coalesce(current_revision, '{}'::jsonb),
              'intentRevision', intent.canonical_revision,
              'transactional', true, 'derivedIntentId', intent.intent_id),
            clock_timestamp(), null, null, null, null, generation,
            null, null, null, clock_timestamp())
          on conflict (tournament_id, round_number, engine_key) do update set
            status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
            requested_at = excluded.requested_at, started_at = null, completed_at = null,
            last_error_code = null, last_error_safe = null,
            runtime_generation_id = excluded.runtime_generation_id,
            claim_token = null, claimed_by = null, lease_expires_at = null,
            updated_at = excluded.updated_at;
        end loop;
      end if;
      update scoring_authority.score_derived_intents_v1 set status = 'SUCCEEDED',
        attempts = attempts + 1, last_sqlstate = null,
        completed_at = clock_timestamp(), updated_at = clock_timestamp()
        where intent_id = intent.intent_id;
      processed := processed + 1;
    exception when others then
      get stacked diagnostics error_state = returned_sqlstate;
      if not error_states ? error_state then
        error_states := error_states || jsonb_build_array(error_state);
      end if;
      update scoring_authority.score_derived_intents_v1
        set attempts = attempts + 1,
          status = case when attempts + 1 >= 5 then 'DEAD_LETTER' else 'RETRYABLE' end,
          last_sqlstate = error_state,
          available_at = clock_timestamp() + make_interval(secs => least(300, power(2, attempts + 1)::integer)),
          updated_at = clock_timestamp()
        where intent_id = intent.intent_id;
      failed := failed + 1;
    end;
  end loop;
  if processed + failed > 0 then
    raise log 'BAGGER_OPERATIONAL_EVENT %', jsonb_build_object(
      'schema_version', 'score-derived-intent-worker-v1',
      'domain', family_value, 'operation', 'SCORE_DERIVED_INTENT_FLUSH',
      'processed', processed, 'failed', failed, 'maximum', maximum,
      'database_error_classes', error_states,
      'outcome', case when failed > 0 then 'DERIVED_WORK_RETRY_REQUIRED' else 'MATERIALIZED' end);
  end if;
  return jsonb_build_object('processed', processed, 'failed', failed,
    'maximum', maximum, 'family', family_value);
end;
$flush$;

revoke all on function production_control.append_score_derived_intent_v1(text,text,integer,text,text,jsonb,uuid)
  from public, anon, authenticated, service_role;
revoke all on function production_control.score_derived_intents_pending_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function production_control.flush_score_derived_intents_v1(text,text,integer)
  from public, anon, authenticated, service_role;

-- Exact source-hash checked patches and manifest binding follow below.

create function pg_temp.patch_score_derived_source_v1(signature text, expected_hash text, patches jsonb)
returns void language plpgsql set search_path = pg_catalog as $patch$
declare definition text; source_hash text; item jsonb; needle text; replacement text;
begin
  select pg_get_functiondef(oid), encode(extensions.digest(prosrc, 'sha256'), 'hex')
    into strict definition, source_hash from pg_proc where oid = signature::regprocedure;
  if source_hash <> expected_hash then
    raise exception 'SCORE_DERIVED_SOURCE_BASELINE_MISMATCH: %', signature;
  end if;
  for item in select value from jsonb_array_elements(patches) loop
    needle := item->>0; replacement := item->>1;
    if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
      raise exception 'SCORE_DERIVED_SOURCE_ANCHOR_MISMATCH: %', signature;
    end if;
    definition := replace(definition, needle, replacement);
  end loop;
  execute definition;
end;
$patch$;

select pg_temp.patch_score_derived_source_v1('scoring_authority.enqueue_production_calcutta_v1_change()',
  'c77385d8ec926979a794fa1dafef95884346b8d53cc5fe69911cdb8cb04c39e1',
  $changes$[
  [
    "    perform production_control.enqueue_production_calcutta_v1(\n      case\n        when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'\n        when tg_table_name = 'rounds'\n          then 'CANONICAL_ROUND_LIFECYCLE_CHANGED'\n        else 'CANONICAL_MATCH_LIFECYCLE_CHANGED'\n      end,\n      'production-calcutta-v1-trigger', false, null, null\n    );",
    "    if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (\n      select 1 from scoring_authority.score_derived_intents_v1 intent\n      where intent.tournament_id = target_tournament\n        and intent.match_id = row_payload->>'match_id'\n        and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then\n    perform production_control.append_score_derived_intent_v1(\n      target_tournament, coalesce(row_payload->>'match_id', 'ROUND:' || (row_payload->>'round_number')),\n      coalesce((row_payload->>'round_number')::integer, (select round_number from scoring_authority.matches where match_id = target_match_id)),\n      'CALCUTTA', case when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'\n        when tg_table_name = 'rounds' then 'CANONICAL_ROUND_LIFECYCLE_CHANGED' else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,\n      jsonb_strip_nulls(jsonb_build_object('matchRevision', row_payload->'match_revision',\n        'holeNumber', row_payload->'hole_number', 'holeRevision', row_payload->'hole_revision',\n        'mutationKey', row_payload->'mutation_key')), null\n    );\n    else\n    perform production_control.enqueue_production_calcutta_v1(\n      case\n        when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'\n        when tg_table_name = 'rounds'\n          then 'CANONICAL_ROUND_LIFECYCLE_CHANGED'\n        else 'CANONICAL_MATCH_LIFECYCLE_CHANGED'\n      end,\n      'production-calcutta-v1-trigger', false, null, null\n    );\n    end if;"
  ],
  [
    "  perform production_control.enqueue_annual_calcutta_v1(\n    target_tournament, generation.runtime_generation_id,\n    activation.activation_revision,\n    case\n      when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'\n      when tg_table_name = 'rounds'\n        then 'CANONICAL_ROUND_LIFECYCLE_CHANGED'\n      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED'\n    end,\n    'production-calcutta-v1-trigger', false, null, null\n  );",
    "    if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (\n      select 1 from scoring_authority.score_derived_intents_v1 intent\n      where intent.tournament_id = target_tournament\n        and intent.match_id = row_payload->>'match_id'\n        and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then\n  perform production_control.append_score_derived_intent_v1(\n      target_tournament, coalesce(row_payload->>'match_id', 'ROUND:' || (row_payload->>'round_number')),\n      coalesce((row_payload->>'round_number')::integer, (select round_number from scoring_authority.matches where match_id = target_match_id)),\n      'CALCUTTA', case when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'\n        when tg_table_name = 'rounds' then 'CANONICAL_ROUND_LIFECYCLE_CHANGED' else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,\n      jsonb_strip_nulls(jsonb_build_object('matchRevision', row_payload->'match_revision',\n        'holeNumber', row_payload->'hole_number', 'holeRevision', row_payload->'hole_revision',\n        'mutationKey', row_payload->'mutation_key')), generation.runtime_generation_id\n    );\n    else\n  perform production_control.enqueue_annual_calcutta_v1(\n    target_tournament, generation.runtime_generation_id,\n    activation.activation_revision,\n    case\n      when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED'\n      when tg_table_name = 'rounds'\n        then 'CANONICAL_ROUND_LIFECYCLE_CHANGED'\n      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED'\n    end,\n    'production-calcutta-v1-trigger', false, null, null\n  );\n    end if;"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('scoring_authority.enqueue_production_net_skins_v1_change()',
  '89eabb43d8d9ec47f9fafa431b6010cdff3602708383ba35fbc4d4651347605e',
  $changes$[
  [
    "  perform production_control.enqueue_production_net_skins_v1_round(\n    match_value.round_number,\n    case when tg_table_name = 'hole_scores'\n      then 'CANONICAL_SCORE_CHANGED'\n      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,\n    'production-net-skins-v1-trigger'\n  );",
    "  if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (\n    select 1 from scoring_authority.score_derived_intents_v1 intent\n    where intent.tournament_id = match_value.tournament_id\n      and intent.match_id = target_match_id\n      and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then\n  if exists (select 1 from scoring_authority.net_skins_v1_configuration_revisions revision\n    cross join lateral jsonb_array_elements(revision.configuration_manifest->'rounds') configured\n    where revision.configuration_revision_id = current_value.configuration_revision_id\n      and (configured->>'round_number')::integer = match_value.round_number) then\n    perform production_control.append_score_derived_intent_v1(\n      match_value.tournament_id, target_match_id, match_value.round_number, 'NET_SKINS',\n      case when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED' else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,\n      jsonb_strip_nulls(jsonb_build_object('matchRevision', match_value.match_revision,\n        'holeNumber', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'hole_number' else null end,\n        'holeRevision', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'hole_revision' else null end,\n        'mutationKey', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'mutation_key' else null end)), null\n    );\n  end if;\n  else\n  perform production_control.enqueue_production_net_skins_v1_round(\n    match_value.round_number,\n    case when tg_table_name = 'hole_scores'\n      then 'CANONICAL_SCORE_CHANGED'\n      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,\n    'production-net-skins-v1-trigger'\n  );\n  end if;"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('scoring_authority.enqueue_annual_net_skins_v1_change()',
  '0b71d53e29a6f6a5bad0dcdec08f38945bac315338506440dc074a8786508dbc',
  $changes$[
  [
    "  perform production_control.enqueue_annual_net_skins_v1_round(\n    match_value.tournament_id, generation.runtime_generation_id,\n    match_value.round_number,\n    case when tg_table_name = 'hole_scores'\n      then 'CANONICAL_SCORE_CHANGED'\n      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,\n    'production-net-skins-v1-trigger'\n  );",
    "  if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (\n    select 1 from scoring_authority.score_derived_intents_v1 intent\n    where intent.tournament_id = match_value.tournament_id\n      and intent.match_id = target_match_id\n      and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then\n  if exists (select 1 from scoring_authority.net_skins_v1_configuration_revisions revision\n    cross join lateral jsonb_array_elements(revision.configuration_manifest->'rounds') configured\n    where revision.configuration_revision_id = current_value.configuration_revision_id\n      and (configured->>'round_number')::integer = match_value.round_number) then\n    perform production_control.append_score_derived_intent_v1(\n      match_value.tournament_id, target_match_id, match_value.round_number, 'NET_SKINS',\n      case when tg_table_name = 'hole_scores' then 'CANONICAL_SCORE_CHANGED' else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,\n      jsonb_strip_nulls(jsonb_build_object('matchRevision', match_value.match_revision,\n        'holeNumber', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'hole_number' else null end,\n        'holeRevision', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'hole_revision' else null end,\n        'mutationKey', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'mutation_key' else null end)), generation.runtime_generation_id\n    );\n  end if;\n  else\n  perform production_control.enqueue_annual_net_skins_v1_round(\n    match_value.tournament_id, generation.runtime_generation_id,\n    match_value.round_number,\n    case when tg_table_name = 'hole_scores'\n      then 'CANONICAL_SCORE_CHANGED'\n      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,\n    'production-net-skins-v1-trigger'\n  );\n  end if;"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('scoring_authority.enqueue_annual_derived_v1_change()',
  'a61f604a60772d2a96ba21ee0d04cbc85fecbacf4e236ea2533248d3411b5bb9',
  $changes$[
  [
    "  foreach engine_value in array engine_values loop",
    "  if tg_table_name = 'hole_scores' or (tg_table_name = 'matches' and exists (\n    select 1 from scoring_authority.score_derived_intents_v1 intent\n    where intent.tournament_id = target_tournament and intent.match_id = target_match\n      and intent.source_transaction = txid_current() and intent.family = 'COMPETITION')) then\n    perform production_control.append_score_derived_intent_v1(\n      target_tournament, target_match,\n      (select round_number from scoring_authority.matches where match_id = target_match),\n      'COMPETITION', reason_value, revision_value || jsonb_strip_nulls(jsonb_build_object(\n        'mutationKey', case when tg_table_name = 'hole_scores' then (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->'mutation_key' else null end)), runtime_generation\n    );\n    return case when tg_op = 'DELETE' then old else new end;\n  end if;\n  foreach engine_value in array engine_values loop"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('public.claim_production_calcutta_v1_recalculation(jsonb)',
  '2a632f90d117b9c4039f3227d7283a9ffae53adadc635e7e08c741e83dc885d3',
  $changes$[
  [
    "  update scoring_authority.calcutta_v1_recalculation_jobs\n  set status = case when attempts >= 5",
    "  perform production_control.flush_score_derived_intents_v1('2026', 'CALCUTTA', 8);\n\n  update scoring_authority.calcutta_v1_recalculation_jobs\n  set status = case when attempts >= 5"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('public.claim_production_net_skins_v1_recalculation(jsonb)',
  '580b1c3587019a1884003feebb4b7302f919f1fbf856317e9bba24d75e63a6ba',
  $changes$[
  [
    "  update scoring_authority.net_skins_v1_recalculation_jobs\n  set status = case when attempts >= 5",
    "  perform production_control.flush_score_derived_intents_v1('2026', 'NET_SKINS', 8);\n\n  update scoring_authority.net_skins_v1_recalculation_jobs\n  set status = case when attempts >= 5"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('public.future_production_claim_calcutta_recalculation_v1(jsonb)',
  '371206c5ec0812f77120baaf980da0cc9a49c61f51adcd7b87fddb3fa9ee614f',
  $changes$[
  [
    "  update scoring_authority.calcutta_v1_recalculation_jobs set\n    status = case when attempts >= 5",
    "  perform production_control.flush_score_derived_intents_v1(target, 'CALCUTTA', 8);\n\n  update scoring_authority.calcutta_v1_recalculation_jobs set\n    status = case when attempts >= 5"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('public.future_production_claim_net_skins_recalculation_v1(jsonb)',
  'c1765219c75a1644eed6cd95ab675633a25501042fd3bfab8ef406747dd4b0d8',
  $changes$[
  [
    "  update scoring_authority.net_skins_v1_recalculation_jobs set\n    status = case when attempts >= 5",
    "  perform production_control.flush_score_derived_intents_v1(target, 'NET_SKINS', 8);\n\n  update scoring_authority.net_skins_v1_recalculation_jobs set\n    status = case when attempts >= 5"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('public.claim_competition_derived_jobs(jsonb)',
  'aa90208adbeab75bb1fae9c5290325ab83fe5fa981abe34c04f16fffd2a2c68b',
  $changes$[
  [
    "  legacy_input := input || pg_catalog.jsonb_build_object(",
    "  if btrim(coalesce(input->>'worker_id', '')) <> '' then\n    perform production_control.flush_score_derived_intents_v1('2026', 'COMPETITION', 8);\n  end if;\n  legacy_input := input || pg_catalog.jsonb_build_object("
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('public.claim_intelligence_derived_bundle(jsonb)',
  'd59644d4030b0b96598c59ae9851764587d022fe0f382d0f72074826859e0d83',
  $changes$[
  [
    "  legacy_input := input || pg_catalog.jsonb_build_object(",
    "  if btrim(coalesce(input->>'worker_id', '')) <> '' then\n    perform production_control.flush_score_derived_intents_v1('2026', 'COMPETITION', 8);\n  end if;\n  legacy_input := input || pg_catalog.jsonb_build_object("
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('public.future_production_claim_competition_derived_jobs_v1(jsonb)',
  '0221367dfac84c9beac9ec9e369d623ce72a5f169a702945ea5e3ca952771706',
  $changes$[
  [
    "  update scoring_authority.competition_recalculation_jobs value set\n    status = 'FAILED'",
    "  perform production_control.flush_score_derived_intents_v1(target, 'COMPETITION', 8);\n  update scoring_authority.competition_recalculation_jobs value set\n    status = 'FAILED'"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('public.future_production_claim_intelligence_derived_bundle_v1(jsonb)',
  '64900562d142286036217ed4c80fbc051d7b5fc8cba5d729c329418f051083ae',
  $changes$[
  [
    "  perform 1\n  from scoring_authority.competition_recalculation_jobs value",
    "  perform production_control.flush_score_derived_intents_v1(target, 'COMPETITION', 8);\n  perform 1\n  from scoring_authority.competition_recalculation_jobs value"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('production_control.close_annual_scoring_predecessor_v1(jsonb,text)',
  'a501abe35f463405927a1d4bfd067d304204f5faf7829809d2936bc7d56481c6',
  $changes$[
  [
    "  perform pg_catalog.pg_advisory_xact_lock(\n    production_control.scoring_admission_lock_key()\n  );",
    "  perform pg_catalog.pg_advisory_xact_lock(\n    production_control.scoring_admission_lock_key()\n  );\n  if production_control.score_derived_intents_pending_v1(target_tournament_id) then\n    raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENTS_DRAIN_REQUIRED';\n  end if;"
  ]
]$changes$::jsonb);


select pg_temp.patch_score_derived_source_v1('production_control.annual_scoring_predecessor_certificate_v1(text)',
  'fef7de2383ef8162773e4925db823a22e7f39d3df84c3f8b70961dcef0485756',
  $changes$[
  [
    "  fingerprint_value := production_control.future_runtime_hash_v2(",
    "  if production_control.score_derived_intents_pending_v1(target_tournament_id) then\n    blockers := blockers || jsonb_build_array('PREDECESSOR_SCORE_DERIVED_INTENTS_PENDING');\n  end if;\n  fingerprint_value := production_control.future_runtime_hash_v2("
  ]
]$changes$::jsonb);

-- Preserve existing stale/updating presentation while durable work awaits materialization.

select pg_temp.patch_score_derived_source_v1('public.read_production_calcutta_frozen_2026_v1(jsonb)',
  'e2e4977ed8ac7af750f9991b7f65a32fa9a7b613f33760fa78e776b0ec3f0c3c',
  $changes$[
  [
    "    updating_value := job_value.job_id is not null\n      and job_value.status in ('PENDING', 'RUNNING');",
    "    updating_value := (job_value.job_id is not null\n      and job_value.status in ('PENDING', 'RUNNING'))\n      or exists (select 1 from scoring_authority.score_derived_intents_v1 intent\n        where intent.tournament_id = '2026' and intent.family = 'CALCUTTA'\n          and intent.status in ('PENDING', 'RETRYABLE'));"
  ]
]$changes$::jsonb);

select pg_temp.patch_score_derived_source_v1('production_control.read_annual_calcutta_v1(text,text,uuid)',
  'bc8f552016bb958a82b374393a35a6ab6697734337880472f6cd8453e708e25a',
  $changes$[
  [
    "    updating := job_value.job_id is not null\n      and job_value.status in ('PENDING', 'RUNNING');",
    "    updating := (job_value.job_id is not null\n      and job_value.status in ('PENDING', 'RUNNING'))\n      or exists (select 1 from scoring_authority.score_derived_intents_v1 intent\n        where intent.tournament_id = target and intent.family = 'CALCUTTA'\n          and intent.status in ('PENDING', 'RETRYABLE'));"
  ]
]$changes$::jsonb);

-- An existing certified future runtime may not silently change its code manifest.
-- The precondition above requires explicit review/re-certification before install.
alter function production_control.annual_side_game_implementation_manifest_v1()
  rename to annual_side_game_implementation_manifest_pre_score_intents_v1;
create function production_control.annual_side_game_implementation_manifest_v1()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $manifest$
declare baseline jsonb; helper_manifest jsonb; expected_count integer; valid_count integer;
  table_manifest jsonb; index_manifest jsonb;
begin
  baseline := production_control.annual_side_game_implementation_manifest_pre_score_intents_v1();
  select jsonb_agg(jsonb_build_object('signature', signature, 'source', p.prosrc,
      'securityDefiner', p.prosecdef, 'volatility', p.provolatile,
      'configuration', p.proconfig, 'acl', p.proacl) order by signature),
    count(*)::integer, count(*) filter (where p.prosecdef
      and p.proconfig = array['search_path=pg_catalog']::text[]
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('service_role', p.oid, 'EXECUTE'))::integer
    into helper_manifest, expected_count, valid_count
  from (values
    ('production_control.append_score_derived_intent_v1(text,text,integer,text,text,jsonb,uuid)'),
    ('production_control.flush_score_derived_intents_v1(text,text,integer)'),
    ('production_control.score_derived_intents_pending_v1(text)'),
    ('production_control.annual_side_game_implementation_manifest_pre_score_intents_v1()')
  ) required(signature) left join pg_proc p on p.oid = to_regprocedure(signature);
  if expected_count <> 4 or valid_count <> 4 then
    raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_HELPER_SECURITY_REQUIRED';
  end if;
  select jsonb_build_object('rls', relrowsecurity, 'acl', relacl,
      'constraints', (select jsonb_agg(pg_get_constraintdef(oid) order by conname)
        from pg_constraint where conrelid = table_row.oid))
    into table_manifest from pg_class table_row
    where table_row.oid = 'scoring_authority.score_derived_intents_v1'::regclass
      and relrowsecurity
      and not has_table_privilege('anon', table_row.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_table_privilege('authenticated', table_row.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_table_privilege('service_role', table_row.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if table_manifest is null then
    raise exception using errcode = '55000', message = 'SCORE_DERIVED_INTENT_TABLE_SECURITY_REQUIRED';
  end if;
  select jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text)
    into index_manifest from pg_index
    where indrelid = 'scoring_authority.score_derived_intents_v1'::regclass;
  return baseline || jsonb_build_object('scoreDerivedIntentContract', 'score-derived-intent-v1',
    'scoreDerivedIntentHelpers', helper_manifest, 'scoreDerivedIntentTable', table_manifest,
    'scoreDerivedIntentIndexes', index_manifest);
end;
$manifest$;
revoke all on function production_control.annual_side_game_implementation_manifest_v1()
  from public, anon, authenticated, service_role;
revoke all on function production_control.annual_side_game_implementation_manifest_pre_score_intents_v1()
  from public, anon, authenticated, service_role;

drop function pg_temp.patch_score_derived_source_v1(text,text,jsonb);
comment on table scoring_authority.score_derived_intents_v1 is
  'Durable score-derived demand; same-transaction family coalescing; current source is resolved by existing workers. Retain unresolved/dead-letter rows until reviewed recovery; archive succeeded history only outside Tournament Mode.';
comment on function production_control.flush_score_derived_intents_v1(text,text,integer) is
  'Private existing-worker seam; at most 8 intents; materialization and acknowledgement atomic. SQL cancellation aborts this worker transaction and leaves prior committed score and pending demand intact.';
commit;
