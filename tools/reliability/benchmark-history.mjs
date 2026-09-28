#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createDatabase, createIsolatedCluster, destroyIsolatedCluster, jsonLiteral,
  repositoryRoot, sql, sqlFile, sqlResult, timedSqlSamples,
} from "../../test/support/reliability/postgres17.mjs";
import {
  installCertifiedSqlRepairs, installRelease139FunctionCandidates,
  installRelease139Schema, release139Sha,
} from "../../test/support/reliability/release139-schema.mjs";
import { seedSyntheticSideGameHistory, supportedScaleFactors, targetCounts } from "../../test/support/reliability/synthetic-history.mjs";
import { seedSyntheticArchivedYears } from "../../test/support/reliability/synthetic-archived-years.mjs";
import { seedSyntheticTournament } from "../../test/support/reliability/synthetic-tournament.mjs";
import { benchmarkOperations, reusableScoreInput } from "../../test/support/reliability/benchmark-operations.mjs";
import { attachBenchmarkEvidence } from "../../test/support/reliability/benchmark-evidence.mjs";
import { validateBenchmarkResult } from "../../test/support/reliability/benchmark-result-validation.mjs";
import {
  benchmarkDatabaseForOperation, initializeBenchmarkScaleVariants,
} from "../../test/support/reliability/benchmark-fixtures.mjs";
import { measurementEnvironment, measurementResourceSnapshot } from "../../test/support/reliability/measurement-metadata.mjs";
import { extractSqlFunction } from "../../test/support/reliability/sql-source.mjs";

function parseOptions(argv) {
  const allowed = new Set(["--samples", "--scales", "--output"]);
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    assert.ok(allowed.has(name), `Unsupported benchmark option: ${name || "<empty>"}`);
    assert.ok(value && !value.startsWith("--"), `${name} requires a value`);
    assert.ok(!parsed.has(name), `${name} may be specified only once`);
    parsed.set(name, value);
  }
  return parsed;
}

const options = parseOptions(process.argv.slice(2));
const outputValue = options.get("--output") ||
  "docs/reliability/performance/BENCHMARK-RESULTS.json";
const outputFile = path.resolve(repositoryRoot, outputValue);
const performanceRoot = path.join(repositoryRoot, "docs", "reliability", "performance");
assert.ok(outputFile.startsWith(`${performanceRoot}${path.sep}`),
  "--output must remain inside docs/reliability/performance");
const outputDirectory = path.dirname(outputFile);
const samples = Number(options.get("--samples") || process.env.BAGGER_RELIABILITY_SAMPLES || 30);
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 100);
const scaleFactors = (options.get("--scales") || supportedScaleFactors.join(",")).split(",")
  .map(Number);
assert.ok(scaleFactors.length > 0 && scaleFactors.every((scale) =>
  supportedScaleFactors.includes(scale)), "--scales must be a comma-separated subset of 1,2,5,10");

function percentile(values, p) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil((p / 100) * ordered.length) - 1];
}

function summary(values) {
  return {
    samples: values.length,
    minMs: Math.min(...values),
    medianMs: percentile(values, 50),
    p95Ms: values.length >= 20 ? percentile(values, 95) : null,
    p95Status: values.length >= 20 ? "MEASURED" : "INSUFFICIENT_SAMPLE",
    p99Ms: values.length >= 100 ? percentile(values, 99) : null,
    p99Status: values.length >= 100 ? "MEASURED" : "INSUFFICIENT_SAMPLE",
    maxMs: Math.max(...values),
  };
}

function explain(cluster, database, statement, setup = "") {
  const text = sql(cluster, database,
    `begin; ${setup} explain (analyze,buffers,format json) ${statement}; rollback;`);
  const plan = JSON.parse(text)[0];
  return { planningMs: plan["Planning Time"], executionMs: plan["Execution Time"], plan: plan.Plan };
}

function safeProbe(cluster, database, operation) {
  const result = sqlResult(cluster, database,
    `begin; ${operation.setupSql || ""} ${operation.sql}; rollback;`);
  if (result.status !== 0 || result.error) {
    return { runnable: false, limitation: "SQL preflight did not complete successfully.",
      semanticValidation: { preflight: "FAILED", samples: "NOT_RUN", validatedSamples: 0 } };
  }
  try {
    const semantic = validateBenchmarkResult(operation, result.stdout);
    return { runnable: true, semantic,
      semanticValidation: { preflight: "PASSED", samples: "NOT_RUN", validatedSamples: 0 } };
  } catch (error) {
    return { runnable: false, semantic: null, limitation: error.message,
      semanticValidation: { preflight: "FAILED", samples: "NOT_RUN", validatedSamples: 0 } };
  }
}

function measureOperation(cluster, database, operation) {
  const probe = safeProbe(cluster, database, operation);
  if (!probe.runnable) return { ...operation, ...probe, successCount: 0,
    failureCount: 1, measurements: null };
  const representativePlan = explain(cluster, database, operation.sql, operation.setupSql).plan;
  const values = timedSqlSamples(cluster, database, operation.sql, samples, {
    setup: operation.setupSql || "",
    validateResult: output => validateBenchmarkResult(operation, output),
  });
  return { ...operation, ...probe, successCount: values.length, failureCount: 0,
    semanticValidation: { preflight: "PASSED", samples: "EVERY_SAMPLE_VALIDATED", validatedSamples: values.length },
    measurements: summary(values), representativePlan };
}

function installOldCompatibility(cluster, database) {
  const filename = path.join(repositoryRoot, "supabase", "production_migrations",
    "202609090097_production_late_r3_initialization_v1.sql");
  const definition = extractSqlFunction(filename,
    "create function production_control.late_r3_result_compatible_v1(")
    .replace(/^create function/i, "create or replace function");
  sql(cluster, database, definition, { role: "" });
}

function compatibilityStatement() {
  return `select production_control.late_r3_result_compatible_v1(
    (select result_id from scoring_authority.calcutta_v1_result_revisions where is_current),
    production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))
  )`;
}

function stableFixtureDocument(cluster, database) {
  return sql(cluster, database, `select jsonb_build_object(
    'resource',(select jsonb_build_object('scopeKey',scope_key,
      'currentTournamentId',current_tournament_id,'scoringAuthority',scoring_authority,
      'scoringIngressEnabled',scoring_ingress_enabled,'workersEnabled',workers_enabled)
      from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION'),
    'setupRevision',production_control.tournament_setup_revision_v1('2026'),
    'rounds',(select jsonb_agg(jsonb_build_object('round',round_number,
      'format',format,'status',status,'allowance',handicap_allowance) order by round_number)
      from scoring_authority.rounds where tournament_id='2026'),
    'matches',(select jsonb_agg(jsonb_build_object('id',match_id,'round',round_number,
      'format',format,'status',status,'snapshot',scoring_snapshot_id,
      'matchRevision',match_revision,'permissionRevision',permission_revision,
      'scoredHoles',scored_holes) order by match_id)
      from scoring_authority.matches where tournament_id='2026'),
    'participants',(select jsonb_agg(jsonb_build_object('matchId',match_id,
      'playerId',player_id,'teamSide',team_side,'slot',player_slot,
      'handicapRevisionId',handicap_revision_id,'finalStrokes',final_strokes)
      order by match_id,team_side,player_slot)
      from scoring_authority.match_participants where match_id like '2026-%'),
    'currentInputs',jsonb_build_object(
      'handicapRevisionId',(select revision_id from scoring_authority.handicap_revision_current
        where tournament_id='2026'),
      'calcutta',(select jsonb_build_object('configurationRevisionId',configuration_revision_id,
        'configurationFingerprint',configuration_fingerprint,'auctionRevisionId',auction_revision_id,
        'auctionFingerprint',auction_fingerprint,'state',state)
        from scoring_authority.calcutta_v1_current where tournament_id='2026'),
      'netSkins',(select jsonb_build_object('configurationRevisionId',configuration_revision_id,
        'configurationRevision',configuration_revision,'state',state)
        from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026'),
      'odds',(select jsonb_build_object('currentSnapshotId',current_snapshot_id,
        'publicationRevision',publication_revision,'publicationAuthority',publication_authority,
        'publicationState',publication_state,'freshness',freshness)
        from scoring_authority.odds_publication_current where tournament_id='2026')),
    'counts',jsonb_build_object(
      'tournaments',(select count(*) from scoring_authority.tournaments),
      'players',(select count(*) from scoring_authority.players),
      'matches',(select count(*) from scoring_authority.matches),
      'participants',(select count(*) from scoring_authority.match_participants),
      'scores',(select count(*) from scoring_authority.hole_scores),
      'calcuttaResults',(select count(*) from scoring_authority.calcutta_v1_result_revisions),
      'netSkinsResults',(select count(*) from scoring_authority.net_skins_v1_result_revisions),
      'oddsInputs',(select count(*) from scoring_authority.odds_input_configurations)))`, { role: "" });
}

function stableFixtureDigest(cluster, database) {
  const document = stableFixtureDocument(cluster, database);
  return createHash("sha256").update(document).digest("hex");
}

function verifyFixtureDeterminism(cluster) {
  const databases = ["rel139_determinism_a", "rel139_determinism_b"];
  const digests = [];
  for (const database of databases) {
    createDatabase(cluster, database, { template: "rel139_template" });
    seedSyntheticSideGameHistory(cluster, database, 1);
    installCertifiedSqlRepairs(cluster, database);
    seedSyntheticArchivedYears(cluster, database, 1);
    digests.push(stableFixtureDigest(cluster, database));
  }
  assert.equal(digests[0], digests[1], "independent scale-1 fixture reseeds must be semantically identical");
  return {
    status: "PASS",
    independentDatabaseCount: databases.length,
    scale: 1,
    semanticSha256: digests[0],
    included: ["stable identifiers", "current authority inputs", "lifecycle state", "row counts"],
    excluded: ["created_at", "updated_at", "effective_at", "configured_at", "other volatile timestamps"],
  };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const cluster = await createIsolatedCluster();
  const results = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    release: 139,
    sha: release139Sha,
    environment: "LOCAL_SOCKET_ONLY_POSTGRESQL_17",
    productionClone: false,
    fixtureLabel: "Production-shaped synthetic, not a Production clone",
    samplesPerOperation: samples,
    semanticValidation: "EVERY_TIMED_RESULT_VALIDATED_AFTER_TIMING",
    p99Policy: "null with INSUFFICIENT_SAMPLE unless samples >= 100",
    substitutions: [
      "Hosted scoring admission/provider attestation replaced by a fail-closed local scope assertion.",
      "Hosted maintenance release capability proof replaced by a fail-closed local read-scope assertion.",
    ],
    processorBoundary: "Side-game calculation rows measure participant read or SQL input assembly only; claim, JavaScript calculate, and complete are separate and are not represented as end-to-end timings.",
    scales: [],
  };
  try {
    createDatabase(cluster, "rel139_template");
    await installRelease139Schema(cluster, "rel139_template");
    installRelease139FunctionCandidates(cluster, "rel139_template");
    seedSyntheticTournament(cluster, "rel139_template");
    results.environmentDetails = measurementEnvironment(cluster, "rel139_template");
    results.fixtureDeterminism = verifyFixtureDeterminism(cluster);
    for (const scale of scaleFactors) {
      const {
        primaryDatabase: database, preparationDatabase, counts, archivedCounts,
        preparationArchivedCounts, preparationFixture,
      } = initializeBenchmarkScaleVariants(cluster, scale);
      const resourcesBefore = measurementResourceSnapshot(cluster, database);

      const operations = benchmarkOperations.map((operation) => {
        const selected = benchmarkDatabaseForOperation(operation.id, {
          primaryDatabase: database, preparationDatabase,
        });
        return measureOperation(cluster, selected.database, {
          ...operation,
          fixtureVariant: operation.fixtureVariant || selected.fixtureVariant,
        });
      });

      const fixedCompatibility = measureOperation(cluster, database, {
        id: "late-r3-compatibility-fixed", label: "fixed bounded compatibility",
        coverage: "ACTUAL_SQL_FUNCTION", sql: compatibilityStatement(),
      });
      installOldCompatibility(cluster, database);
      const oldCompatibility = measureOperation(cluster, database, {
        id: "late-r3-compatibility-old", label: "old unbounded compatibility",
        coverage: "ACTUAL_SQL_FUNCTION", sql: compatibilityStatement(),
      });
      const oldScore = measureOperation(cluster, database,
        benchmarkOperations.find((operation) => operation.id === "score-write"));
      sqlFile(cluster, database, path.join(repositoryRoot, "supabase", "production_migrations",
        "202609270120_bounded_late_r3_result_compatibility_v1.sql"), { role: "" });
      const fixedScore = measureOperation(cluster, database,
        benchmarkOperations.find((operation) => operation.id === "score-write"));

      results.scales.push({ scale, expectedCounts: targetCounts(scale), actualCounts: counts,
        resourcesBefore, resourcesAfter: measurementResourceSnapshot(cluster, database),
        archivedCounts, preparationArchivedCounts, preparationFixture,
        operations, comparison: { oldCompatibility, fixedCompatibility, oldScore, fixedScore } });
    }
    results.reusableScoreInvocation = {
      sql: `BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SELECT public.submit_production_hole_score(${jsonLiteral(reusableScoreInput)}); ROLLBACK;`,
      note: "Use a fresh database clone or reset the deterministic mutation between enabled/disabled telemetry samples.",
    };
    attachBenchmarkEvidence(results);
    await writeFile(outputFile,
      `${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await destroyIsolatedCluster(cluster);
  }
  process.stdout.write(`${outputFile}\n`);
}

await main();
