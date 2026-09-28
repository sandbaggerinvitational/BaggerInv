#!/usr/bin/env node
// Real SQL queue/claim/complete and unchanged JS engines, in disposable DBs.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createIsolatedCluster, createDatabase, destroyIsolatedCluster,
  sql, jsonLiteral, openSqlSession, repositoryRoot } from "../../test/support/reliability/postgres17.mjs";
import { installRelease139Schema, installRelease139FunctionCandidates,
  installCertifiedSqlRepairs } from "../../test/support/reliability/release139-schema.mjs";
import { seedSyntheticTournament, runtimeScope, syntheticDirector } from "../../test/support/reliability/synthetic-tournament.mjs";
import { seedSyntheticSideGameHistory } from "../../test/support/reliability/synthetic-history.mjs";
import { seedSyntheticArchivedYears } from "../../test/support/reliability/synthetic-archived-years.mjs";
import { measurementEnvironment } from "../../test/support/reliability/measurement-metadata.mjs";
import { FIXTURE_VERSION, FIXTURE_SEED } from "../../test/support/reliability/benchmark-evidence.mjs";
import {
  championshipOddsResilienceFixture,
  RESILIENCE_PHASE,
  RESILIENCE_PUBLISHED_AT,
} from "../../test/fixtures/championship-odds-resilience.mjs";
import {
  buildOddsCalculationInvocation,
  processOddsCalculationJob,
} from "../../lib/championship-odds-resilience.js";
import {
  productionOddsCalculationDependencies,
  productionOddsCalculationRequestInput,
} from "../../lib/production-odds-calculation-contract.js";
import { buildProductionOddsRehearsalInputs } from "../../lib/production-odds-rehearsal-fixture.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../../lib/production-foundation-resource-contract.js";
import { calculateProductionFullNetCalcutta, calculateProductionFullNetSkins,
  FULL_NET_CALCUTTA_ENGINE, FULL_NET_SKINS_ENGINE } from "../../lib/production-full-net.js";

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--samples"), "Only --samples is supported; no database target accepted");
const samples = args.length ? Number(args[1]) : 30;
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 100);
const scope = runtimeScope({ player_id: syntheticDirector.playerId,
  authorization: { tournament_id: "2026", player_id: syntheticDirector.playerId,
    auth_user_id: syntheticDirector.authUserId, role: "DIRECTOR" } });
const fp = value => value.repeat(64);
const oddsCommit = "a".repeat(40);
const oddsCandidateHostname = "bagger-reliability-local-fixture.vercel.app";
const oddsEnvironment = Object.freeze({
  VERCEL_ENV: "preview",
  VERCEL_URL: oddsCandidateHostname,
  VERCEL_BRANCH_URL: oddsCandidateHostname,
  VERCEL_GIT_COMMIT_SHA: oddsCommit,
  VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: oddsCandidateHostname,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: oddsCommit,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID:
    "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "local-fixture-credential-never-sent",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "local-fixture-publishable-key",
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "local-fixture-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET:
    "local-fixture-rate-limit-secret-never-sent",
  PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "false",
  PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "false",
  SUPABASE_SCORING_MIRROR_ENABLED: "false",
  ODDS_PUBLICATION_AUTHORITY: "google",
  PRODUCTION_STEP11_EXTERNAL_GOOGLE_WRITES_ENABLED: "false",
  PRODUCTION_STEP11_ODDS_REHEARSAL_ENABLED: "true",
  PRODUCTION_STEP11_ODDS_REHEARSAL_SECRET:
    "local-fixture-rehearsal-secret-never-sent",
});
const percentile = (values, percent) => [...values].sort((a,b) => a-b)[Math.ceil(values.length * percent / 100)-1] ?? null;
const summarize = values => ({ sampleCount: values.length, p50Ms: percentile(values, 50),
  p95Ms: values.length >= 20 ? percentile(values, 95) : null,
  p99Ms: values.length >= 100 ? percentile(values, 99) : null,
  p95Status: values.length >= 20 ? "MEASURED" : "INSUFFICIENT_SAMPLE",
  p99Status: values.length >= 100 ? "MEASURED" : "INSUFFICIENT_SAMPLE",
  maxMs: values.length ? Math.max(...values) : null });

function installProcessorFixture(cluster, database) {
  // Explicit synthetic financial and opt-in rules, separate from the retained
  // cardinality fixture. No real ownership, purchase or entry records are used.
  sql(cluster, database, `begin; set local session_replication_role=replica;
    update scoring_authority.calcutta_v1_configuration_revisions set configuration_manifest=
      jsonb_build_object('point_structure',jsonb_build_array(
        jsonb_build_object('place',1,'round_1_award',10,'round_2_award',20,'round_3_award',30),
        jsonb_build_object('place',2,'round_1_award',5,'round_2_award',10,'round_3_award',15)),
        'payout_structure',jsonb_build_array(jsonb_build_object('place',1,
          'round_1_fraction',0.1,'round_2_fraction',0.1,'round_3_fraction',0.1,'overall_fraction',0.7)))
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.calcutta_v1_current where tournament_id='2026');
    update scoring_authority.calcutta_v1_configuration_revisions set
      configuration_fingerprint=production_control.calcutta_v1_hash(configuration_manifest)
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.calcutta_v1_current where tournament_id='2026');
    update scoring_authority.calcutta_v1_current c set configuration_fingerprint=r.configuration_fingerprint
    from scoring_authority.calcutta_v1_configuration_revisions r where r.configuration_revision_id=c.configuration_revision_id;
    insert into production_control.net_skins_entry_revisions_v1(tournament_id,round_number,revision,
      request_id,request_hash,field_fingerprint,configured,entries,actor_player_id,actor_auth_user_id,created_at,response)
    select '2026',rn,1,md5('processor-entry:'||rn)::uuid,repeat('d',64),
      production_control.tournament_setup_hash_v1(production_control.net_skins_entry_field_v1('2026',rn)),true,
      (select jsonb_agg(item||'{"entered":true}'::jsonb) from jsonb_array_elements(production_control.net_skins_entry_field_v1('2026',rn)) item),
      '${syntheticDirector.playerId}','${syntheticDirector.authUserId}','2026-08-01T00:00:00Z','{}'
    from generate_series(1,2) rn;
    update scoring_authority.net_skins_v1_configuration_revisions set
      configuration_manifest=production_control.full_net_skins_manifest_v2('2026',array[1,2],'{"1":1,"2":1}')
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026');
    update scoring_authority.net_skins_v1_configuration_revisions set
      configuration_fingerprint=production_control.net_skins_v1_hash(configuration_manifest)
    where configuration_revision_id=(select configuration_revision_id from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026');
    delete from scoring_authority.net_skins_configuration_entries
    where tournament_id='2026';
    delete from scoring_authority.net_skins_configurations
    where tournament_id='2026';
    with manifest as (
      select configuration_revision,configuration_manifest
      from scoring_authority.net_skins_v1_configuration_revisions
      where configuration_revision_id=(select configuration_revision_id
        from scoring_authority.net_skins_v1_configuration_current
        where tournament_id='2026')
    ), rounds as (
      select manifest.configuration_revision,item.round_value
      from manifest cross join lateral
        jsonb_array_elements(manifest.configuration_manifest->'rounds')
          as item(round_value)
    )
    insert into scoring_authority.net_skins_configurations(
      tournament_id,round_number,format,enabled,entry_type,buy_in_per_entry,
      expected_pot,completion_rule,payout_rounding,tie_rule,
      configuration_revision,configuration_fingerprint,source_workbook_id,
      imported_by,imported_at,approved_at,updated_at)
    select '2026',(round_value->>'round_number')::integer,
      round_value->>'format',true,round_value->>'entry_type',
      (round_value->>'buy_in_per_entry')::numeric,
      (round_value->>'expected_pot')::numeric,round_value->>'completion_rule',
      round_value->>'payout_rounding',round_value->>'tie_rule',
      configuration_revision,round_value->>'configuration_fingerprint',
      '${PRODUCTION_GOOGLE_WORKBOOK_ID}','reliability-fixture',
      clock_timestamp(),clock_timestamp(),clock_timestamp()
    from rounds;
    with manifest as (
      select configuration_manifest
      from scoring_authority.net_skins_v1_configuration_revisions
      where configuration_revision_id=(select configuration_revision_id
        from scoring_authority.net_skins_v1_configuration_current
        where tournament_id='2026')
    ), entries as (
      select round_item.round_value,entry_item.entry_value
      from manifest
      cross join lateral jsonb_array_elements(configuration_manifest->'rounds')
        as round_item(round_value)
      cross join lateral jsonb_array_elements(round_item.round_value->'entries')
        as entry_item(entry_value)
    )
    insert into scoring_authority.net_skins_configuration_entries(
      tournament_id,round_number,entry_id,match_number,format,
      player_id_1,player_id_2,team_handicap,buy_in,eligible,source_payload)
    select '2026',(round_value->>'round_number')::integer,
      entry_value->>'entry_id',entry_value->>'match_number',
      round_value->>'format',entry_value->>'player_id_1',
      nullif(entry_value->>'player_id_2',''),
      nullif(entry_value->>'team_handicap','')::numeric,
      (entry_value->>'buy_in')::numeric,
      coalesce((entry_value->>'eligible')::boolean,false),
      jsonb_build_object(
        'Entry Revision',entry_value->'entry_revision',
        'Entry Key',entry_value->>'entry_key',
        'Entry Binding Fingerprint',entry_value->>'binding_fingerprint',
        'Canonical Match ID',entry_value->>'match_id',
        'Net Handicap Basis','production-full-course-handicap-v1',
        'Individual Stroke Allocation',
          entry_value->>'individual_stroke_allocation')
    from entries;
    update scoring_authority.odds_input_configurations set
      source_workbook_id='${PRODUCTION_GOOGLE_WORKBOOK_ID}',
      source_fingerprint='${fp("4")}', settings_fingerprint='${fp("1")}',
      ratings_fingerprint='${fp("2")}', pairing_fingerprint='${fp("3")}',
      bundle_fingerprint='${fp("6")}',
      canonical_settings=(select jsonb_object_agg('setting_'||n,n order by n) from generate_series(1,30)n),
      effective_settings=(select jsonb_object_agg('setting_'||n,n order by n) from generate_series(1,30)n),
      effective_settings_fingerprint='${fp("5")}',
      settings_contract_version='prediction-settings-v1', validation_status='VALID'
    where tournament_id='2026' and is_current;
    update production_control.resource_scope set workers_enabled=true
    where scope_key='BAGGER_INV_PRODUCTION';
    update production_control.odds_calculation_runtime set
      enabled=true, operation_mode='STEP11_REHEARSAL',
      cutover_phase='ODDS_WAR_ROOM', deployment_commit='${oddsCommit}',
      activation_revision=139, candidate_hostname='${oddsCandidateHostname}',
      configured_by='reliability-fixture', configured_at=clock_timestamp()
    where scope_key='BAGGER_INV_PRODUCTION';
    update production_control.worker_controls set enabled=true,
      scheduler_installed=false, google_writes_allowed=false
    where worker_name='ODDS_CALCULATION';
    update production_control.worker_contracts set operation_allowed=true,
      scheduler_installed=false, authoritative_write_allowed=false
    where worker_name='ODDS_CALCULATION';
    commit;`, { role: "" });
}

async function loadOddsConfiguration(session) {
  const configuration = JSON.parse(await session.query(`select to_jsonb(value)
    from scoring_authority.odds_input_configurations value
    where tournament_id='2026' and is_current`));
  return {
    id: configuration.id,
    configuration_revision: Number(configuration.configuration_revision),
    source_fingerprint: configuration.source_fingerprint,
    bundle_fingerprint: configuration.bundle_fingerprint,
    settings_fingerprint: configuration.settings_fingerprint,
    effective_settings_fingerprint: configuration.effective_settings_fingerprint,
    ratings_fingerprint: configuration.ratings_fingerprint,
    pairing_fingerprint: configuration.pairing_fingerprint,
  };
}

async function runSideGameSample(session, domain) {
  await session.query("begin");
  const phases = {};
  const timed = async (name, operation) => { const start = performance.now(); const value = await operation(); phases[name] = (phases[name] || 0) + performance.now()-start; return value; };
  const call = async (name, input) => {
    const value = JSON.parse(await session.query(`select public.${name}(${jsonLiteral(input)})`));
    assert.equal(value.ok, true, `${name}: ${value.code}`); return value;
  };
  let originalError;
  try {
    const current = JSON.parse(await session.query(domain === "CALCUTTA"
      ? "select to_jsonb(c) from scoring_authority.calcutta_v1_current c where tournament_id='2026'"
      : "select to_jsonb(c) from scoring_authority.net_skins_v1_configuration_current c where tournament_id='2026'"));
    const name = domain === "CALCUTTA" ? "calcutta" : "net_skins";
    const workerBase = { ...scope, expected_configuration_revision: current.configuration_revision,
      worker_id: "synthetic-benchmark-worker", lease_seconds: 60,
      ...(domain === "CALCUTTA" ? { contract_version: "production-calcutta-v1",
        expected_configuration_fingerprint: current.configuration_fingerprint,
        expected_auction_revision: current.auction_revision,
        expected_auction_fingerprint: current.auction_fingerprint } : {}) };
    const queueBase = { ...scope, expected_configuration_revision: current.configuration_revision,
      ...(domain === "CALCUTTA" ? { contract_version: "production-calcutta-v1",
        expected_configuration_fingerprint: current.configuration_fingerprint,
        expected_auction_revision: current.auction_revision,
        expected_auction_fingerprint: current.auction_fingerprint } : {}) };
    const started = performance.now();
    await timed("queue", () => call(`enqueue_production_${name}_v1_recalculation`, {
      ...queueBase, round_numbers: [1], reason: "SYNTHETIC_BENCHMARK",
      requested_by: "synthetic-benchmark", request_fingerprint: fp("a") }));
    const claimed = await timed("claim", () => call(`claim_production_${name}_v1_recalculation`, {
      ...workerBase, request_fingerprint: fp("b") }));
    assert.ok(claimed.job, "A real job must be claimed; EMPTY is not a processor benchmark");
    const job = claimed.job;
    const calculated = await timed("calculate", async () => domain === "CALCUTTA"
      ? calculateProductionFullNetCalcutta({ tournament: claimed.calculation_input.tournament,
        configuration: { ...claimed.calculation_input.configuration, configuration_fingerprint: job.configuration_fingerprint } },
        claimed.calculation_input.core_view || claimed.calculation_input.core || claimed.calculation_input.canonical_core)
      : calculateProductionFullNetSkins(claimed.calculation_input));
    const payload = domain === "CALCUTTA" ? calculated.calcutta : calculated.netSkins.rounds.find(round => Number(round.round) === Number(job.round_number));
    assert.ok(payload, "Calculator must produce the claimed result");
    const resultState = domain === "CALCUTTA" ? calculated.resultState
      : payload.finalized === true ? "OFFICIAL" : "PROVISIONAL";
    const completionInput = domain === "CALCUTTA" ? {
      ...queueBase, worker_id: workerBase.worker_id,
      job_id: job.job_id, claim_token: job.claim_token,
      expected_result_revision: job.expected_result_revision,
      configuration_fingerprint: job.configuration_fingerprint,
      auction_fingerprint: job.auction_fingerprint,
      expected_source_fingerprint: job.source_fingerprint,
      engine_version: FULL_NET_CALCUTTA_ENGINE, result_state: resultState,
      result_payload: payload, request_fingerprint: fp("c"),
    } : {
      ...queueBase, worker_id: workerBase.worker_id,
      job_id: job.job_id, claim_token: job.claim_token,
      expected_result_revision: job.expected_result_revision,
      source_fingerprint: job.source_fingerprint,
      engine_version: FULL_NET_SKINS_ENGINE, result_state: resultState,
      result_payload: payload, request_fingerprint: fp("c"),
    };
    const completed = await timed("complete", () => call(
      `complete_production_${name}_v1_recalculation`, completionInput));
    await timed("canonical_readback", async () => {
      const status = await session.query(`select status from scoring_authority.${name}_v1_recalculation_jobs where job_id='${job.job_id}'`);
      assert.equal(status, "SUCCEEDED");
    });
    phases.total = performance.now()-started;
    return { phases, code: completed.code, resultState, explicitTimedSqlCalls: 4 };
  } catch (error) { originalError = error; throw error; }
  finally { try { await session.query("rollback"); } catch (error) { if (!originalError) throw error; } }
}

async function runOddsSample(session) {
  await session.query("begin");
  const phases = {};
  const sqlCalls = { queue: 0, claim: 0, checkpoint: 0, complete: 0, fail: 0,
    canonical_readback: 0 };
  const timed = async (name, operation) => {
    const start = performance.now();
    const value = await operation();
    phases[name] = (phases[name] || 0) + performance.now()-start;
    return value;
  };
  const call = async (name, input, stage) => timed(stage, async () => {
    sqlCalls[stage] += 1;
    const value = JSON.parse(await session.query(
      `select public.${name}(${jsonLiteral(input)})`,
    ));
    assert.equal(value.ok, true, `${name}: ${value.code}`);
    return value;
  });
  let originalError;
  try {
    // Switch only this rolled-back sample from the synthetic cutover fixture to
    // the calculation-only Step 11 contract. Setup is deliberately untimed.
    await session.query(`update production_control.resource_scope set
      current_tournament_read_authority='GOOGLE', scoring_authority='GOOGLE',
      scoring_ingress_enabled=false, google_writes_enabled=false,
      odds_publication_enabled=false
      where scope_key='BAGGER_INV_PRODUCTION';
      update production_control.cutover_activation_state set
      state='STAGED', expected_deployment_commit='${oddsCommit}',
      expected_vercel_project_id='prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU',
      expected_source_fingerprint='${fp("7")}',
      current_authority='GOOGLE', scoring_ingress_enabled=false
      where scope_key='BAGGER_INV_PRODUCTION'`);
    const configuration = await loadOddsConfiguration(session);
    const requestInput = await timed("prepare", async () => {
      const rawInputs = {
        ...championshipOddsResilienceFixture(),
        configuration,
        metadata: {
          settingsFingerprint: configuration.settings_fingerprint,
          sourceRevision: { currentTournamentRevision: 139 },
          sourceFingerprint: configuration.source_fingerprint,
          pairingFingerprint: configuration.pairing_fingerprint,
          configurationRevision: configuration.configuration_revision,
        },
      };
      const inputs = buildProductionOddsRehearsalInputs(rawInputs, {
        scope: productionOddsCalculationRequestInputScope(),
      });
      const invocation = buildOddsCalculationInvocation({
        inputs, phase: RESILIENCE_PHASE, iterations: 10_000,
        requestedBy: "synthetic-benchmark", outputTimestamp: RESILIENCE_PUBLISHED_AT,
      });
      return productionOddsCalculationRequestInput({
        invocation, configuration, env: oddsEnvironment,
      });
    });
    const started = performance.now();
    const requested = await call(
      "request_production_odds_calculation_job", requestInput, "queue",
    );
    assert.ok(requested.job, "A real Odds job must be queued");
    const dependencies = productionOddsCalculationDependencies(
      oddsEnvironment,
      async (functionName, input) => {
        const stage = functionName.startsWith("claim_") ? "claim"
          : functionName.startsWith("checkpoint_") ? "checkpoint"
          : functionName.startsWith("complete_") ? "complete" : "fail";
        return { payload: await call(functionName, input, stage) };
      },
    );
    const completed = await timed("worker_total", () => processOddsCalculationJob(
      requestInput.job_id,
      { workerId: "synthetic-benchmark-worker", dependencies },
    ));
    phases.worker_non_sql = Math.max(0, phases.worker_total -
      (phases.claim || 0) - (phases.checkpoint || 0) -
      (phases.complete || 0) - (phases.fail || 0));
    await call("read_production_odds_calculation_jobs", {
      ...productionOddsCalculationRequestInputScope(), job_id: requestInput.job_id,
    }, "canonical_readback").then((readback) => {
      const job = (readback.jobs || []).find((value) => value.job_id === requestInput.job_id);
      assert.equal(job?.status, "SUCCEEDED");
      assert.equal(job?.publication_status, "REHEARSAL_ONLY");
    });
    phases.total = performance.now()-started;
    return {
      phases, code: "ODDS_CALCULATION_SUCCEEDED", resultState: "REHEARSAL_ONLY",
      explicitTimedSqlCalls: Object.values(sqlCalls).reduce((total, value) => total + value, 0),
      checkpointCount: completed.checkpoints,
    };
  } catch (error) { originalError = error; throw error; }
  finally { try { await session.query("rollback"); } catch (error) { if (!originalError) throw error; } }
}

function productionOddsCalculationRequestInputScope() {
  return {
    environment: "PRODUCTION", project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: "2026", tournament_year: 2026,
    deployment_commit: oddsCommit,
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    canonical_domain: "https://baggerinv.com",
    worker_name: "ODDS_CALCULATION", operation_mode: "STEP11_REHEARSAL",
    cutover_phase: "ODDS_WAR_ROOM", candidate_hostname: oddsCandidateHostname,
  };
}

const cluster = await createIsolatedCluster();
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), fixtureVersion: FIXTURE_VERSION,
  fixtureSeed: FIXTURE_SEED, proofLayer: "INTEGRATION", production: false, operations: [],
  limitations: ["Local SQL protocol plus unchanged JS engines; provider admission substitutions apply.",
    "BEGIN/fixture lookup/ROLLBACK excluded from total; durable COMMIT/network/API authorization not measured.",
    "Synthetic current financial/entry configuration is a documented processor fixture variant.",
    "Calcutta and Net Skins use four explicit timed SQL calls per sample. Odds uses request, claim, checkpoint, completion and readback calls; the observed count is recorded per operation.",
    "Nested function statements, rows examined and provider-side admission behavior are unmeasured."] };
try {
  createDatabase(cluster, "processors_template");
  await installRelease139Schema(cluster, "processors_template");
  installRelease139FunctionCandidates(cluster, "processors_template");
  seedSyntheticTournament(cluster, "processors_template");
  result.environment = measurementEnvironment(cluster, "processors_template");
  for (const scale of [1, 2, 5, 10]) {
    const database = `processors_${scale}`;
    createDatabase(cluster, database, { template: "processors_template" });
    seedSyntheticSideGameHistory(cluster, database, scale);
    installCertifiedSqlRepairs(cluster, database);
    seedSyntheticArchivedYears(cluster, database, scale);
    installProcessorFixture(cluster, database);
    for (const domain of ["CALCUTTA", "NET_SKINS", "ODDS"]) {
      const session = openSqlSession(cluster, database);
      const measured = [];
      let failure = null;
      try { for (let n = 0; n < samples; n++) measured.push(await (
        domain === "ODDS" ? runOddsSample(session) : runSideGameSample(session, domain)
      )); }
      catch (error) { failure = String(error.message).slice(0, 2000); }
      finally { await session.close(); }
      const phaseNames = domain === "ODDS"
        ? ["prepare","queue","claim","checkpoint","complete","worker_total","worker_non_sql","canonical_readback","total"]
        : ["queue","claim","calculate","complete","canonical_readback","total"];
      const phases = Object.fromEntries(phaseNames
        .map(phase => [phase, summarize(measured.map(entry => entry.phases[phase]))]));
      const explicitCounts = measured.map(entry => entry.explicitTimedSqlCalls);
      const checkpointCounts = measured.map(entry => entry.checkpointCount)
        .filter(value => Number.isInteger(value));
      const resultStates = [...new Set(measured.map(entry => entry.resultState)
        .filter(Boolean))];
      result.operations.push({ benchmarkId: `BENCH-${domain}-PROCESSOR`,
        operation: domain === "ODDS"
          ? "ODDS request→claim→checkpointed calculation→complete→readback"
          : `${domain} queue→claim→calculate→complete→readback`,
        fixtureVersion: FIXTURE_VERSION, fixtureSeed: FIXTURE_SEED,
        historyScale: scale, environment: result.environment,
        requestedSampleCount: samples, sampleCount: measured.length,
        successCount: measured.length, failureCount: failure ? 1 : 0,
        result: failure ? "FAILED_PREFLIGHT_OR_SAMPLE" : "MEASURED", failure, phases,
        resultStates,
        ...(domain === "ODDS" ? {
          executionMode: "STEP11_REHEARSAL",
          publicationStatus: "REHEARSAL_ONLY",
          publicationCreated: false,
          mirrorCreated: false,
        } : {}),
        queryCount: null, queryCountStatus: "UNKNOWN_NESTED_STATEMENTS_UNMEASURED",
        explicitTimedSqlCalls: explicitCounts.length && new Set(explicitCounts).size === 1
          ? explicitCounts[0] : null,
        checkpointCount: checkpointCounts.length && new Set(checkpointCounts).size === 1
          ? checkpointCounts[0] : null,
        rowsExamined: null, rowsExaminedStatus: "UNKNOWN_NO_PLAN_OR_EXECUTOR_COUNTER",
        databaseTime: { serverOnlyMs: null, serverOnlyStatus: "UNKNOWN",
          sqlProtocolPhases: domain === "ODDS"
            ? ["queue","claim","checkpoint","complete","canonical_readback"]
            : ["queue","claim","complete","canonical_readback"] } });
      process.stdout.write(`PROCESSOR ${scale}x ${domain}: ${measured.length}/${samples}${failure ? ` ${failure}` : " PASS"}\n`);
    }
  }
} finally { await destroyIsolatedCluster(cluster); }
const output = path.join(repositoryRoot, "docs/reliability/performance/SIDEGAME-PROCESSORS.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2)+"\n");
process.exitCode = result.operations.some(operation => operation.failureCount) ? 1 : 0;
