// Proof layers: SQL, FAILURE_INJECTION, local diagnostics, real Calcutta worker protocol.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { sql, sqlResult, jsonLiteral, timedSqlSamples,
  destroyIsolatedCluster, createDatabase } from "./support/reliability/postgres17.mjs";
import { createEligibleHistoryFixture, cloneEligibleHistoryDatabase,
  compatibilityVariants, compatibilitySql, historicalFingerprintSpySql,
  seedCompatibilityVariant, seedCalcuttaProcessorConfiguration, seedNetSkinsProcessorConfiguration
} from "./support/reliability/phase2-eligible-history.mjs";
import { benchmarkOperations, reusableScoreInput } from "./support/reliability/benchmark-operations.mjs";
import { validateBenchmarkResult } from "./support/reliability/benchmark-result-validation.mjs";
import { runtimeScope, syntheticDirector } from "./support/reliability/synthetic-tournament.mjs";
import { calculateProductionFullNetCalcutta, FULL_NET_CALCUTTA_ENGINE,
  calculateProductionFullNetSkins, FULL_NET_SKINS_ENGINE } from "../lib/production-full-net.js";

const mode = process.env.BAGGER_PHASE2_ELIGIBLE_MODE || "baseline";
assert.ok(["baseline", "candidate"].includes(mode));
const candidate = mode === "candidate";

const scoreSql = `select public.submit_production_hole_score(${jsonLiteral(reusableScoreInput)})`;
const scoreOperation = { id: "score-write", coverage: "ACTUAL_RPC_ROLLBACK" };
const validateScore = value => validateBenchmarkResult(scoreOperation, value);
const calcuttaReadSql = benchmarkOperations.find(value => value.id === "calcutta-read").sql;
function validateFreshness(value, { compatible, stale, updating }) {
  assert.equal(value.ok, true);
  assert.equal(value.data.freshness.lifecycle_compatible, compatible);
  assert.equal(value.data.freshness.stale, stale);
  assert.equal(value.data.freshness.updating, updating);
  assert.equal(value.data.published, true);
  return value.data;
}
const summary = values => {
  const ordered = [...values].sort((a,b)=>a-b);
  return { sampleCount: values.length, minMs: ordered[0],
    medianMs: ordered[Math.floor(ordered.length / 2)], maxMs: ordered.at(-1) };
};

test(`Phase2 eligible-history ${mode} proves receipt branches and accepted score risk`, {
  timeout: 360000,
}, async t => {
  const fixture = await createEligibleHistoryFixture({ candidate });
  const measurements = [], processorEvidence = [];
  try {
    for (const scale of [1, 10]) {
      for (const variant of compatibilityVariants) {
        await t.test(`${scale}x ${variant.name}`, () => {
          const { database, binding } = cloneEligibleHistoryDatabase(fixture, scale, variant.name);
          const { cluster } = fixture;
          const helperSql = compatibilitySql(binding);
          const validateBoolean = output => assert.equal(output, variant.compatible ? "t" : "f");
          // A spy raises if either unbounded historical fingerprint is entered.
          // Error abort/connection close rolls back the replacement definitions.
          const injected = sqlResult(cluster, database,
            `begin; ${historicalFingerprintSpySql} ${helperSql}; rollback;`, { role: "" });
          if (variant.eligible && variant.compatible) {
            assert.notEqual(injected.status, 0);
            assert.match(injected.stderr, /PHASE2_ELIGIBLE_HISTORY_EVALUATED/);
          } else if (!variant.eligible) {
            assert.equal(injected.status, 0);
            assert.equal(injected.stdout.trim(), "f");
          } else if (injected.status !== 0) {
            assert.match(injected.stderr, /PHASE2_ELIGIBLE_HISTORY_EVALUATED/);
          } else {
            assert.equal(injected.stdout.trim(), "f");
          }
          const scoreInjected = sqlResult(cluster, database,
            `begin; ${historicalFingerprintSpySql} ${scoreSql}; rollback;`);
          if (variant.eligible && !candidate) {
            assert.notEqual(scoreInjected.status, 0,
              "baseline score still enters historical work for an eligible receipt");
            assert.match(scoreInjected.stderr, /PHASE2_ELIGIBLE_HISTORY_EVALUATED/);
          } else {
            assert.equal(scoreInjected.status, 0);
            validateScore(scoreInjected.stdout.trim());
          }
          const beforeRead = validateFreshness(JSON.parse(sql(cluster, database, calcuttaReadSql)),
            { compatible: variant.compatible, stale: !variant.compatible, updating: false });
          // Every case performs a genuine new canonical mutation and becomes
          // incompatible afterwards. A valid prior receipt cannot bless a score.
          const result = sql(cluster, database, `begin;
            ${scoreSql}; ${helperSql};
            select jsonb_build_object('active_jobs',(select count(*) from
              scoring_authority.calcutta_v1_recalculation_jobs where status in ('PENDING','RUNNING')),
              'mutation_receipts',(select count(*) from scoring_authority.score_mutations
              where mutation_key='${reusableScoreInput.mutation_key}'),
              'pending_intents',${candidate ? "(select count(*) from scoring_authority.score_derived_intents_v1 where status='PENDING')" : "0"});
            ${calcuttaReadSql};
            rollback;`).split("\n");
          assert.equal(result.length, 4);
          validateScore(result[0]);
          assert.equal(result[1], "f");
          assert.deepEqual(JSON.parse(result[2]), { active_jobs: candidate ? 0 : 1,
            mutation_receipts: 1, pending_intents: candidate ? 2 : 0 });
          const afterRead = validateFreshness(JSON.parse(result[3]),
            { compatible: false, stale: true, updating: true });
          for (const key of ["configuration_revision", "auction_revision", "publication_revision",
            "configuration_fingerprint", "auction_fingerprint", "publication_state", "market"]) {
            assert.deepEqual(afterRead[key], beforeRead[key], `score preserves financial ${key}`);
          }
          assert.equal(sql(cluster, database, helperSql), variant.compatible ? "t" : "f",
            "rollback restores compatibility and canonical state");
          // One warmup per path; no concurrent work, no changed measured SQL.
          timedSqlSamples(cluster, database, helperSql, 1, { validateResult: validateBoolean });
          timedSqlSamples(cluster, database, scoreSql, 1, { validateResult: validateScore });
          const compatibility = timedSqlSamples(cluster, database, helperSql, 3,
            { validateResult: validateBoolean });
          const score = timedSqlSamples(cluster, database, scoreSql, 3,
            { validateResult: validateScore });
          measurements.push({ scale, variant: variant.name,
            eligible: variant.eligible, compatibleBeforeScore: variant.compatible,
            helperEnteredHistoricalFingerprint: injected.status !== 0,
            scoreEnteredHistoricalFingerprint: scoreInjected.status !== 0,
            compatibility: summary(compatibility), score: summary(score),
            measuredAcceptedScoreSamples: score.length });
        });
      }
    }
    if (candidate) await t.test("actual Calcutta claim, unchanged calculator and completion preserve financial output", () => {
      const results = [];
      for (const kind of ["baseline", "candidate"]) {
        const database = `p2_processor_${kind}`;
        createDatabase(fixture.cluster, database, { template:
          (kind === "baseline" ? fixture.baselineDatabases : fixture.databases)[1] });
        seedCalcuttaProcessorConfiguration(fixture.cluster, database);
        seedCompatibilityVariant(fixture.cluster, database, "current_compatible");
        const result = runCalcuttaProcessorProof(fixture.cluster, database, kind);
        results.push(result.payload);
        processorEvidence.push(result.evidence);
      }
      assert.deepEqual(results[1], results[0], "baseline/candidate exact financial engine payload parity");
    });
    if (candidate) await t.test("actual Net Skins claim, unchanged calculator and completion preserve financial output", () => {
      const results = [];
      for (const kind of ["baseline", "candidate"]) {
        const database = `p2_skins_processor_${kind}`;
        createDatabase(fixture.cluster, database, { template:
          (kind === "baseline" ? fixture.baselineDatabases : fixture.databases)[1] });
        seedNetSkinsProcessorConfiguration(fixture.cluster, database);
        const result = runNetSkinsProcessorProof(fixture.cluster, database, kind);
        results.push(result.payload);
        processorEvidence.push(result.evidence);
      }
      assert.deepEqual(results[1], results[0], "baseline/candidate exact Net Skins engine payload parity");
    });
    t.diagnostic(JSON.stringify({ ...fixture.metadata, mode, measurements, processorEvidence }));
  } finally { await destroyIsolatedCluster(fixture.cluster); }
});


function runCalcuttaProcessorProof(cluster, database, kind) {
  const call = (name, input) => {
    const value = JSON.parse(sql(cluster, database, `select public.${name}(${jsonLiteral(input)})`));
    assert.equal(value.ok, true, `local processor ${name} must acknowledge success`);
    return value;
  };
  const before = validateFreshness(call("read_production_calcutta_v1", reusableScoreInput),
    { compatible: true, stale: false, updating: false });
  validateScore(sql(cluster, database, scoreSql)); // committed canonical write
  const during = validateFreshness(call("read_production_calcutta_v1", reusableScoreInput),
    { compatible: false, stale: true, updating: true });
  const current = JSON.parse(sql(cluster, database,
    "select to_jsonb(c) from scoring_authority.calcutta_v1_current c where tournament_id='2026'"));
  const workerBase = runtimeScope({ player_id: syntheticDirector.playerId,
    authorization: { tournament_id: "2026", player_id: syntheticDirector.playerId,
      auth_user_id: syntheticDirector.authUserId, role: "DIRECTOR" },
    contract_version: "production-calcutta-v1", worker_id: "phase2-eligible-processor", lease_seconds: 60,
    expected_configuration_revision: current.configuration_revision,
    expected_configuration_fingerprint: current.configuration_fingerprint,
    expected_auction_revision: current.auction_revision,
    expected_auction_fingerprint: current.auction_fingerprint });
  if (kind === "candidate") {
    const claimSql = `select public.claim_production_calcutta_v1_recalculation(${jsonLiteral({ ...workerBase, request_fingerprint: "6".repeat(64) })})`;
    const staleActivation = sqlResult(cluster, database, `begin;
      update production_control.cutover_activation_state set activation_revision=140 where scope_key='BAGGER_INV_PRODUCTION';
      ${claimSql}; rollback;`);
    assert.notEqual(staleActivation.status, 0);
    assert.match(staleActivation.stderr, /PRODUCTION_CALCUTTA_ACTIVATION_REVISION_CONFLICT/);
    const stalePointer = sqlResult(cluster, database, `begin; set local session_replication_role=replica;
      update production_control.current_tournament_pointer_v1 set tournament_id='2099',tournament_year=2099;
      set local session_replication_role=origin; ${claimSql}; rollback;`);
    assert.notEqual(stalePointer.status, 0);
    assert.match(stalePointer.stderr, /POINTER_CHANGED/);
    // Synthetic activation-only transition: no hosted release/admission claim.
    const freshActivation = JSON.parse(sql(cluster, database, `begin;
      update production_control.cutover_activation_state set activation_revision=140 where scope_key='BAGGER_INV_PRODUCTION';
      select public.claim_production_calcutta_v1_recalculation(${jsonLiteral({ ...workerBase,
        expected_activation_revision: 140, request_fingerprint: "7".repeat(64) })}); rollback;`));
    assert.equal(freshActivation.ok, true);
    assert.equal(freshActivation.job.activation_revision, 140);
    assert.equal(sql(cluster, database, "select count(*) from scoring_authority.score_derived_intents_v1 where family='CALCUTTA' and status='PENDING'"), "1");
  }
  const claimInput = { ...workerBase, request_fingerprint: "b".repeat(64) };
  const claimed = call("claim_production_calcutta_v1_recalculation", claimInput);
  assert.ok(claimed.job?.job_id && claimed.job.claim_token && claimed.calculation_input);
  const job = claimed.job;
  assert.equal(job.activation_revision, 139);
  assert.equal(job.source_fingerprint, sql(cluster, database,
    "select production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))"));
  const claimReplay = call("claim_production_calcutta_v1_recalculation", claimInput);
  assert.equal(claimReplay.idempotent, true);
  assert.deepEqual(claimReplay.job, job, "same claim key retains exact job and lease");
  const calculated = calculateProductionFullNetCalcutta({ tournament: claimed.calculation_input.tournament,
    configuration: { ...claimed.calculation_input.configuration,
      configuration_fingerprint: job.configuration_fingerprint } }, claimed.calculation_input.core_view);
  assert.equal(calculated.calcutta.available, true);
  assert.equal(calculated.calcutta.golfers.length, 24);
  assert.equal(calculated.calcutta.pot, 24000);
  assert.deepEqual(calculated.calcutta.completedRounds, [1, 2]);
  const completeInput = { ...workerBase, job_id: job.job_id, claim_token: job.claim_token,
    expected_result_revision: job.expected_result_revision,
    configuration_fingerprint: job.configuration_fingerprint,
    auction_fingerprint: job.auction_fingerprint, expected_source_fingerprint: job.source_fingerprint,
    engine_version: FULL_NET_CALCUTTA_ENGINE, result_state: calculated.resultState,
    result_payload: calculated.calcutta, request_fingerprint: "c".repeat(64) };
  const advancedScore = { ...reusableScoreInput, hole_number: 2, expected_match_revision: 1,
    expected_hole_revision: 0, mutation_key: "90000000-0000-4000-8000-000000000102" };
  const staleCompletion = sqlResult(cluster, database, `begin;
    select public.submit_production_hole_score(${jsonLiteral(advancedScore)});
    select public.complete_production_calcutta_v1_recalculation(${jsonLiteral(completeInput)}); rollback;`);
  assert.notEqual(staleCompletion.status, 0);
  validateScore(staleCompletion.stdout.trim());
  assert.match(staleCompletion.stderr, /PRODUCTION_CALCUTTA_(JOB_LEASE_REQUIRED|SOURCE_REVISION_CONFLICT)/);
  const completed = call("complete_production_calcutta_v1_recalculation", completeInput);
  assert.equal(completed.publication_state, before.publication_state);
  const replay = call("complete_production_calcutta_v1_recalculation", completeInput);
  assert.equal(replay.idempotent, true);
  const readback = JSON.parse(sql(cluster, database, `select jsonb_build_object(
    'status',(select status from scoring_authority.calcutta_v1_recalculation_jobs
      where job_id='${job.job_id}'::uuid),
    'current_results',(select count(*) from scoring_authority.calcutta_v1_result_revisions where is_current),
    'result_count',(select count(*) from scoring_authority.calcutta_v1_result_revisions),
    'payload',(select engine_result_payload from scoring_authority.calcutta_v1_result_revisions where is_current),
    'source',(select source_fingerprint from scoring_authority.calcutta_v1_result_revisions where is_current))`));
  assert.equal(readback.status, "SUCCEEDED");
  assert.equal(readback.current_results, 1);
  assert.equal(readback.result_count, 408, "completion replay must not append another result");
  assert.deepEqual(readback.payload, calculated.calcutta);
  assert.equal(readback.source, job.source_fingerprint);
  const after = validateFreshness(call("read_production_calcutta_v1", reusableScoreInput),
    { compatible: false, stale: false, updating: false });
  assert.equal(after.result_revision, before.result_revision + 1);
  for (const field of ["market", "publication_state", "publication_revision", "auction_revision",
    "configuration_revision", "configuration_fingerprint", "auction_fingerprint"]) {
    assert.deepEqual(during[field], before[field], `queued score preserves financial ${field}`);
    assert.deepEqual(after[field], before[field], `completion preserves financial ${field}`);
  }
  let intentSummary = null;
  if (kind === "candidate") {
    intentSummary = JSON.parse(sql(cluster, database, `select jsonb_build_object(
      'calcutta_succeeded',(select count(*) from scoring_authority.score_derived_intents_v1
        where family='CALCUTTA' and status='SUCCEEDED'),
      'calcutta_unresolved',(select count(*) from scoring_authority.score_derived_intents_v1
        where family='CALCUTTA' and status<>'SUCCEEDED'))`));
    assert.deepEqual(intentSummary, { calcutta_succeeded: 1, calcutta_unresolved: 0 });
  }
  return { payload: calculated.calcutta, evidence: {
    mode: kind, domain: "CALCUTTA", status: "PASS", path: "COMMITTED_SCORE_PUBLIC_CLAIM_UNCHANGED_JS_ENGINE_PUBLIC_COMPLETE_READBACK",
    engine: FULL_NET_CALCUTTA_ENGINE, resultState: calculated.resultState,
    golferCount: calculated.calcutta.golfers.length, exactClaimReplay: true,
    completionReplayAddedResults: 0, publicationChanged: false,
    sourceBoundAtClaimAndCompletion: true, staleCompletionRejected: true,
    staleActivationAndPointerDenied: kind === "candidate", syntheticCurrentActivationMaterialized: kind === "candidate",
    financialStatePreserved: true,
    enginePayloadSha256: createHash("sha256").update(JSON.stringify(readback.payload)).digest("hex"),
    intentSummary, limitations: ["Synthetic 24000 pot and ownership; no real financial records",
      "Public SQL claims and actual unchanged JS engine; not HTTP transport or hosted admission proof",
      "Activation/pointer tests mutate local fixture metadata, not a real protected release transition"] } };
}


function runNetSkinsProcessorProof(cluster, database, kind) {
  const call = (name, input) => {
    const value = JSON.parse(sql(cluster, database, `select public.${name}(${jsonLiteral(input)})`));
    assert.equal(value.ok, true, `local processor ${name} must acknowledge success`);
    return value;
  };
  const authority = JSON.parse(sql(cluster, database, `select jsonb_build_object(
    'match',m.match_revision,'permission',m.permission_revision,
    'hole',h.hole_revision,'gross1',h.team_1_gross_scores,'gross2',h.team_2_gross_scores)
    from scoring_authority.matches m join scoring_authority.hole_scores h using(match_id)
    where m.match_id='2026-R1-1' and h.hole_number=1`));
  const input = runtimeScope({ match_id: "2026-R1-1", hole_number: 1,
    mutation_key: "90000000-0000-4000-8000-000000000101",
    expected_match_revision: authority.match, expected_hole_revision: authority.hole,
    team_1_gross_scores: authority.gross1.map(value=>value+1), team_2_gross_scores: authority.gross2,
    authorization: { tournament_id: "2026", match_id: "2026-R1-1",
      player_id: syntheticDirector.playerId, auth_user_id: syntheticDirector.authUserId,
      role: "DIRECTOR", permission_revision: authority.permission } });
  validateScore(JSON.stringify(call("submit_production_hole_score", input)));
  const current = JSON.parse(sql(cluster, database, `select to_jsonb(c)
    from scoring_authority.net_skins_v1_configuration_current c where tournament_id='2026'`));
  const workerBase = runtimeScope({ expected_configuration_revision: current.configuration_revision,
    worker_id: "phase2-skins-processor", lease_seconds: 60 });
  const claimInput = { ...workerBase, request_fingerprint: "d".repeat(64) };
  const claim = call("claim_production_net_skins_v1_recalculation", claimInput);
  assert.ok(claim.job?.job_id && claim.job.claim_token && claim.calculation_input);
  const job = claim.job;
  assert.equal(job.round_number, 1);
  assert.equal(job.source_fingerprint, sql(cluster, database,
    "select production_control.net_skins_v1_hash(production_control.net_skins_v1_round_source_revision('2026',1))"));
  const replayClaim = call("claim_production_net_skins_v1_recalculation", claimInput);
  assert.equal(replayClaim.idempotent, true);
  assert.deepEqual(replayClaim.job, job);
  const calculated = calculateProductionFullNetSkins(claim.calculation_input);
  const payload = calculated.netSkins.rounds.find(round => Number(round.round) === 1);
  assert.ok(payload);
  assert.equal(payload.finalized, false, "synthetic Live match cannot produce Official financial output");
  assert.ok(payload.fullNetDetail.length > 0);
  const completeInput = { ...workerBase, job_id: job.job_id, claim_token: job.claim_token,
    expected_result_revision: job.expected_result_revision, source_fingerprint: job.source_fingerprint,
    engine_version: FULL_NET_SKINS_ENGINE, result_state: "PROVISIONAL",
    result_payload: payload, request_fingerprint: "e".repeat(64) };
  call("complete_production_net_skins_v1_recalculation", completeInput);
  assert.equal(call("complete_production_net_skins_v1_recalculation", completeInput).idempotent, true);
  const stored = JSON.parse(sql(cluster, database, `select jsonb_build_object(
    'status',(select status from scoring_authority.net_skins_v1_recalculation_jobs where job_id='${job.job_id}'::uuid),
    'count',(select count(*) from scoring_authority.net_skins_v1_result_revisions),
    'payload',(select engine_result_payload from scoring_authority.net_skins_v1_result_revisions where round_number=1 and is_current),
    'state',(select result_state from scoring_authority.net_skins_v1_result_revisions where round_number=1 and is_current),
    'source',(select source_fingerprint from scoring_authority.net_skins_v1_result_revisions where round_number=1 and is_current))`));
  assert.equal(stored.status, "SUCCEEDED");
  assert.equal(stored.count, 3);
  assert.equal(stored.state, "PROVISIONAL");
  assert.deepEqual(stored.payload, payload);
  assert.equal(stored.source, job.source_fingerprint);
  const publicRead = call("read_production_net_skins_v1", runtimeScope());
  const round = publicRead.data.rounds.find(row => row.round_number === 1);
  assert.equal(round.state, "IN_PROGRESS");
  assert.equal(round.freshness.stale, true);
  assert.equal(round.result_payload, null, "provisional output stays withheld from Official-only participant view");
  assert.equal(round.official_results, null);
  const currentAfter = JSON.parse(sql(cluster, database, `select to_jsonb(c)
    from scoring_authority.net_skins_v1_configuration_current c where tournament_id='2026'`));
  assert.equal(currentAfter.configuration_revision, current.configuration_revision);
  let intentSummary = null;
  if (kind === "candidate") {
    intentSummary = JSON.parse(sql(cluster, database, `select jsonb_build_object(
      'skins_succeeded',(select count(*) from scoring_authority.score_derived_intents_v1 where family='NET_SKINS' and status='SUCCEEDED'),
      'skins_unresolved',(select count(*) from scoring_authority.score_derived_intents_v1 where family='NET_SKINS' and status<>'SUCCEEDED'))`));
    assert.deepEqual(intentSummary, { skins_succeeded: 1, skins_unresolved: 0 });
  }
  return { payload, evidence: { mode: kind, domain: "NET_SKINS", status: "PASS",
    path: "COMMITTED_SCORE_PUBLIC_CLAIM_UNCHANGED_JS_ENGINE_PUBLIC_COMPLETE_READBACK",
    engine: FULL_NET_SKINS_ENGINE, resultState: "PROVISIONAL", exactClaimReplay: true,
    completionReplayAddedResults: 0, sourceBoundAtClaimAndCompletion: true,
    provisionalResultsWithheld: true, financialConfigurationPreserved: true, intentSummary,
    enginePayloadSha256: createHash("sha256").update(JSON.stringify(stored.payload)).digest("hex"),
    limitations: ["Synthetic opt-ins and Live fixture state; no real entry funds or Reopen proof",
      "Public SQL claims and actual unchanged JS engine; not HTTP transport or hosted admission proof"] } };
}
