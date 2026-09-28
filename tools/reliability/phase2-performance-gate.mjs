// UNIT/PERFORMANCE artifact gate. No database target or benchmark execution.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCALES = [1, 2, 5, 10];
const VARIANTS = [
  'none', 'current_compatible', 'current_incompatible_consumed',
  'current_incompatible_financial', 'stale_source', 'stale_result_binding',
  'superseded_result', 'multiple_receipts',
];
const FORBIDDEN = /calcutta_v1_(result_revisions|recalculation_jobs)|net_skins_v1_(result_revisions|recalculation_jobs)|competition_recalculation_jobs|late_r3_calcutta_compatibility/;
const FLOOR_MS = 1;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const nonempty = value => typeof value === 'string' && value.length > 0;
const sha = (value, size) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value);
const ordered = value => object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]))
  : Array.isArray(value) ? value.map(ordered) : value;
const canonical = value => JSON.stringify(ordered(value));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p / 100) - 1];
const close = (a, b) => Math.abs(a - b) <= 1e-9;
const spread = medians => Math.max(...medians) - Math.min(...medians);

export function evaluateScorePerformance(before, after, eligibleBefore, eligibleAfter) {
  const failures = [], missing = [], observations = [], eligibleObservations = [];
  const add = (condition, code, target = failures) => {
    if (!condition) target.push(code);
    return condition;
  };

  function summary(row, label, minimumSamples, requireMin = true) {
    if (!add(object(row), `${label}_SUMMARY_MISSING`, missing)) return false;
    let valid = true;
    const check = (condition, code) => { if (!add(condition, `${label}_${code}`)) valid = false; };
    check(positiveInteger(row.samples), 'INVALID_SAMPLE_COUNT');
    check(Number.isSafeInteger(row.successCount) && row.successCount >= 0 &&
      Number.isSafeInteger(row.failureCount) && row.failureCount >= 0 &&
      row.successCount + row.failureCount === row.samples, 'INVALID_OUTCOME_COUNTS');
    check(row.failureCount === 0 && row.successCount === row.samples, 'SEMANTIC_FAILURE');
    for (const field of ['p50Ms', 'p95Ms', 'maxMs', ...(requireMin ? ['minMs'] : [])]) {
      check(finite(row[field]), `INVALID_${field}`);
    }
    check(row.p50Ms <= row.p95Ms && row.p95Ms <= row.maxMs &&
      (!requireMin || row.minMs <= row.p50Ms), 'UNORDERED_PERCENTILES');
    if (row.samples >= 1000) {
      check(finite(row.p99Ms) && row.p95Ms <= row.p99Ms && row.p99Ms <= row.maxMs, 'INVALID_P99');
    } else {
      check(row.p99Ms === null && typeof row.p99Status === 'string' &&
        /INSUFFICIENT_SAMPLE/.test(row.p99Status), 'UNSUPPORTED_P99');
    }
    if (positiveInteger(row.samples) && row.samples < minimumSamples) {
      missing.push(`${label}_SAMPLE_REQUIREMENT_${minimumSamples}`);
    }
    return valid;
  }

  function batches(row, label, eligible) {
    if (!add(Array.isArray(row.batches) && row.batches.length >= 3,
      `${label}_BATCH_EVIDENCE_MISSING`, missing)) return null;
    const values = [], medians = [];
    let valid = true;
    for (const [index, batch] of row.batches.entries()) {
      const samples = eligible ? batch : batch?.valuesMs;
      if (!add(Array.isArray(samples) && samples.length > 0 && samples.every(finite),
        `${label}_BATCH_${index}_INVALID_VALUES`)) { valid = false; continue; }
      if (!eligible && !summary(batch, `${label}_BATCH_${index}`, 20)) valid = false;
      if (!eligible && (batch.samples !== samples.length ||
        !close(batch.p50Ms, percentile(samples, 50)) ||
        !close(batch.p95Ms, percentile(samples, 95)) ||
        !close(batch.minMs, Math.min(...samples)) || !close(batch.maxMs, Math.max(...samples)))) {
        failures.push(`${label}_BATCH_${index}_SUMMARY_MISMATCH`); valid = false;
      }
      values.push(...samples); medians.push(percentile(samples, 50));
    }
    if (!valid || !values.length) return null;
    if (!add(values.length === row.samples && close(row.p50Ms, percentile(values, 50)) &&
      close(row.p95Ms, percentile(values, 95)) && close(row.maxMs, Math.max(...values)) &&
      (eligible || close(row.minMs, Math.min(...values))) &&
      (row.samples < 1000 || close(row.p99Ms, percentile(values, 99))),
    `${label}_AGGREGATE_SUMMARY_MISMATCH`)) return null;
    return spread(medians);
  }

  function plan(row, label, candidate, eligible) {
    const artifact = eligible ? row.planArtifact : row.queryPlanArtifact;
    const coverage = add(nonempty(artifact) && /^evidence\/[A-Za-z0-9_.-]+\.json$/.test(artifact),
      `${label}_PLAN_REFERENCE_MISSING`, missing);
    const count = add(positiveInteger(row.nestedSqlExecutions), `${label}_PLAN_EXECUTIONS_INVALID`);
    const relations = add(Array.isArray(row.derivedRelationsOnScorePath) &&
      row.derivedRelationsOnScorePath.every(value => typeof value === 'string' && /^[a-z0-9_]+$/.test(value)),
    `${label}_PLAN_RELATIONS_MISSING`, missing);
    if (candidate && relations && row.derivedRelationsOnScorePath.some(value => FORBIDDEN.test(value))) {
      failures.push(`${label}_DERIVED_HISTORY_ON_SCORE_PATH`);
    }
    return coverage && count && relations;
  }

  function identity(artifact, label, mode, eligible) {
    if (!add(object(artifact), `${label}_ARTIFACT_MISSING`, missing)) return false;
    add(artifact.schemaVersion === 1, `${label}_SCHEMA_VERSION_INVALID`);
    add(artifact.mode === mode, `${label}_MODE_INVALID`);
    add(artifact.production === false && artifact.environment === 'LOCAL_SOCKET_ONLY_POSTGRESQL_17',
      `${label}_ENVIRONMENT_NOT_ISOLATED`);
    add(nonempty(artifact.fixtureVersion) && nonempty(eligible ? artifact.seed : artifact.fixtureSeed),
      `${label}_FIXTURE_IDENTITY_MISSING`, missing);
    add(sha(artifact.baseSha, 40), `${label}_BASE_SHA_MISSING`, missing);
    if (!eligible) add(sha(artifact.executionHead, 40), `${label}_EXECUTION_SHA_MISSING`, missing);
    add(mode === 'after' ? sha(artifact.candidateMigrationSha256, 64)
      : artifact.candidateMigrationSha256 === null, `${label}_MIGRATION_IDENTITY_INVALID`);
    add(object(artifact.environmentDetails) && nonempty(artifact.environmentDetails.databaseVersion) &&
      object(artifact.environmentDetails.databaseSettings) && Object.keys(artifact.environmentDetails.databaseSettings).length > 0 &&
      object(artifact.environmentDetails.host), `${label}_ENVIRONMENT_DETAILS_MISSING`, missing);
    return true;
  }

  function compareIdentity(b, a, label, eligible) {
    if (!object(b) || !object(a)) return;
    for (const field of ['fixtureVersion', eligible ? 'seed' : 'fixtureSeed', 'baseSha', 'environment']) {
      add(b[field] === a[field], `${label}_${field}_MISMATCH`);
    }
    for (const field of ['databaseVersion', 'databaseSettings', 'host']) {
      if (b.environmentDetails?.[field] !== undefined && a.environmentDetails?.[field] !== undefined) {
        add(canonical(b.environmentDetails[field]) === canonical(a.environmentDetails[field]),
          `${label}_${field}_MISMATCH`);
      }
    }
  }

  function scaleMap(artifact, label) {
    const result = new Map();
    if (!add(Array.isArray(artifact?.scales), `${label}_SCALES_MISSING`, missing)) return result;
    for (const row of artifact.scales) {
      if (!add(object(row) && SCALES.includes(row.scale), `${label}_INVALID_SCALE`)) continue;
      if (!add(!result.has(row.scale), `${label}_${row.scale}x_DUPLICATE_SCALE`)) continue;
      result.set(row.scale, row);
    }
    for (const scale of SCALES) add(result.has(scale), `${label}_${scale}x_MISSING`, missing);
    return result;
  }

  function sameCounts(b, a, label) {
    for (const field of ['counts', 'archivedCounts']) {
      const valid = add(object(b?.[field]) && Object.keys(b[field]).length > 0 &&
        object(a?.[field]) && Object.keys(a[field]).length > 0, `${label}_${field}_MISSING`, missing);
      if (valid) add([...Object.values(b[field]), ...Object.values(a[field])].every(value =>
        Number.isSafeInteger(value) && value >= 0), `${label}_${field}_INVALID_COUNTS`);
      if (valid) add(canonical(b[field]) === canonical(a[field]), `${label}_${field}_MISMATCH`);
    }
  }

  function measurePair(b, a, label, eligible) {
    if (!b || !a) return null;
    const bv = summary(b, `${label}_BEFORE`, eligible ? 30 : 1000, !eligible);
    const av = summary(a, `${label}_AFTER`, eligible ? 30 : 1000, !eligible);
    const bs = bv ? batches(b, `${label}_BEFORE`, eligible) : null;
    const as = av ? batches(a, `${label}_AFTER`, eligible) : null;
    if (!bv || !av || bs === null || as === null) return null;
    const toleranceMs = Math.max(b.p95Ms * 0.25, bs * 3, FLOOR_MS);
    add(a.p95Ms <= b.p95Ms + toleranceMs, `${label}_UNEXPLAINED_TAIL_REGRESSION`);
    if (as > Math.max(FLOOR_MS, a.p50Ms * 0.5)) missing.push(`${label}_CANDIDATE_VARIANCE_REQUIRES_REPEAT`);
    return { beforeP50Ms: b.p50Ms, afterP50Ms: a.p50Ms, beforeP95Ms: b.p95Ms,
      afterP95Ms: a.p95Ms, toleranceMs, baselineBatchMedianSpreadMs: bs, candidateBatchMedianSpreadMs: as };
  }

  function historyGate(rows, label) {
    const first = rows.find(row => row.scale === 1);
    if (!first || rows.length !== SCALES.length) {
      missing.push(`${label}_HISTORY_COMPARISON_INCOMPLETE`); return;
    }
    const noiseMs = Math.max(FLOOR_MS, first.afterP50Ms * 0.5,
      3 * Math.max(...rows.map(row => row.candidateBatchMedianSpreadMs)));
    for (const row of rows) {
      row.historyAllowanceMs = noiseMs;
      add(row.afterP50Ms <= first.afterP50Ms + noiseMs, `${label}_${row.scale}x_IRRELEVANT_HISTORY_GROWTH`);
    }
  }

  identity(before, 'COMMON_BEFORE', 'before', false);
  identity(after, 'COMMON_AFTER', 'after', false);
  compareIdentity(before, after, 'COMMON', false);
  const commonBefore = scaleMap(before, 'COMMON_BEFORE');
  const commonAfter = scaleMap(after, 'COMMON_AFTER');
  for (const scale of SCALES) {
    const b = commonBefore.get(scale), a = commonAfter.get(scale), label = `COMMON_${scale}x`;
    if (!b || !a) continue;
    sameCounts(b, a, label);
    add(b.rollbackVerified === true && a.rollbackVerified === true, `${label}_ROLLBACK_NOT_VERIFIED`, missing);
    plan(b, `${label}_BEFORE`, false, false); plan(a, `${label}_AFTER`, true, false);
    const measured = measurePair(b, a, label, false);
    if (measured) observations.push({ scale, ...measured });
  }
  historyGate(observations, 'COMMON');

  if (eligibleBefore === undefined && eligibleAfter === undefined) {
    missing.push('ELIGIBLE_HISTORY_EVIDENCE_REQUIRED');
  } else {
    identity(eligibleBefore, 'ELIGIBLE_BEFORE', 'before', true);
    identity(eligibleAfter, 'ELIGIBLE_AFTER', 'after', true);
    compareIdentity(eligibleBefore, eligibleAfter, 'ELIGIBLE', true);
    for (const [artifact, common, label] of [[eligibleBefore, before, 'BEFORE'], [eligibleAfter, after, 'AFTER']]) {
      if (!object(artifact) || !object(common)) continue;
      add(nonempty(common.fixtureVersion) && nonempty(artifact.fixtureVersion) &&
        artifact.fixtureVersion.startsWith(`${common.fixtureVersion}+`) &&
        artifact.seed === common.fixtureSeed && artifact.baseSha === common.baseSha &&
        artifact.candidateMigrationSha256 === common.candidateMigrationSha256,
      `ELIGIBLE_${label}_COMMON_IDENTITY_MISMATCH`);
    }
    const eBefore = scaleMap(eligibleBefore, 'ELIGIBLE_BEFORE');
    const eAfter = scaleMap(eligibleAfter, 'ELIGIBLE_AFTER');
    for (const scale of SCALES) {
      const b = eBefore.get(scale), a = eAfter.get(scale), label = `ELIGIBLE_${scale}x`;
      if (!b || !a) continue;
      sameCounts(b, a, label);
      const branchMaps = [];
      for (const [row, suffix] of [[b, 'BEFORE'], [a, 'AFTER']]) {
        const map = new Map(); branchMaps.push(map);
        if (!add(Array.isArray(row.branches), `${label}_${suffix}_BRANCHES_MISSING`, missing)) continue;
        for (const branch of row.branches) {
          if (!add(object(branch) && VARIANTS.includes(branch.variant), `${label}_${suffix}_INVALID_BRANCH`)) continue;
          if (!add(!map.has(branch.variant), `${label}_${suffix}_${branch.variant}_DUPLICATE_BRANCH`)) continue;
          map.set(branch.variant, branch);
        }
        for (const variant of VARIANTS) add(map.has(variant), `${label}_${suffix}_${variant}_MISSING`, missing);
      }
      for (const variant of VARIANTS) {
        const prior = branchMaps[0].get(variant), next = branchMaps[1].get(variant);
        if (!prior || !next) continue;
        const branchLabel = `${label}_${variant}`;
        add(typeof prior.eligible === 'boolean' && typeof next.eligible === 'boolean' &&
          typeof prior.compatibleBefore === 'boolean' && typeof next.compatibleBefore === 'boolean' &&
          prior.eligible === next.eligible && prior.compatibleBefore === next.compatibleBefore &&
          next.eligible === !['none', 'stale_result_binding', 'superseded_result'].includes(variant) &&
          next.compatibleBefore === ['current_compatible', 'multiple_receipts'].includes(variant),
        `${branchLabel}_BINDING_MISMATCH`);
        if (scale === 1 || scale === 10) {
          plan(prior, `${branchLabel}_BEFORE`, false, true); plan(next, `${branchLabel}_AFTER`, true, true);
        }
        const measured = measurePair(prior, next, branchLabel, true);
        if (measured) eligibleObservations.push({ scale, variant, ...measured });
      }
    }
    for (const variant of VARIANTS) historyGate(eligibleObservations.filter(row => row.variant === variant), `ELIGIBLE_${variant}`);
  }

  return {
    schemaVersion: 2,
    result: failures.length ? 'FAIL' : missing.length ? 'PARTIAL' : 'PASS',
    scope: 'AUTOMATED_LOCAL_SCORE_HISTORY_STRUCTURE_AND_VARIANCE_GATE',
    approved: false,
    thresholdStatus: 'PROPOSED_LOCAL_ENGINEERING_GATE_NOT_PRODUCTION_SLO',
    failures: [...new Set(failures)], missing: [...new Set(missing)], observations, eligibleObservations,
    coverage: { commonScaleCount: observations.length, eligibleBranchScaleCount: eligibleObservations.length,
      requiredEligibleBranchScaleCount: 32, fullQueryPlanIndexReview: 'NOT_PROVEN',
      statementTimeoutHeadroom: 'NOT_PROVEN', productionCapacity: 'NOT_PROVEN' },
    rationale: 'Every claimed sample and plan family needs complete, consistent evidence. Candidate history growth is compared at all four scales against 1x using the greater of 50% of its median, three times candidate batch-median spread, or a conservative 1 ms local scheduling floor. Excess candidate variance requires repetition. Tail regression uses baseline batch variance, 25% of baseline p95, or 1 ms. These proposed tolerances require owner review and never approve a replacement baseline.',
    limitations: [
      'PASS covers only automated artifact structure, forbidden derived-history families, and measured local variance/latency comparisons.',
      'Plan references and recorded nested relation families are checked; full plans, indexes, rows scanned, and arbitrary query-plan regressions still require independent review.',
      'Rollback evidence retains its originating artifact scope; cardinality checks are not complete state-hash proof.',
      'Eligible p95 is a local empirical estimate from 30 samples per branch. Eligible p99 is NOT PROVEN.',
      'No Production capacity, durable COMMIT, client compatibility, physical scoring, or Tournament Ready certification.',
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (![4, 6].includes(process.argv.length)) throw new Error('Expected two or four local JSON artifact paths: common before/after and optional eligible before/after');
  const inputs = [];
  for (const file of process.argv.slice(2)) {
    if (!/\.json$/.test(file) || /^[a-z]+:\/\//i.test(file)) throw new Error('Local JSON artifacts required');
    inputs.push(JSON.parse(await readFile(file, 'utf8')));
  }
  const result = evaluateScorePerformance(...inputs);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.result !== 'PASS') process.exitCode = 1;
}
