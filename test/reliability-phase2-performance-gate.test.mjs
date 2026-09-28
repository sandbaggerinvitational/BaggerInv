// Proof layer: UNIT. Artifact-gate behavior only; no database or runtime performance proof.
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateScorePerformance } from '../tools/reliability/phase2-performance-gate.mjs';

const scales = [1, 2, 5, 10];
const variants = ['none', 'current_compatible', 'current_incompatible_consumed',
  'current_incompatible_financial', 'stale_source', 'stale_result_binding',
  'superseded_result', 'multiple_receipts'];
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p / 100) - 1];
const stats = values => ({ samples: values.length, successCount: values.length, failureCount: 0,
  p50Ms: percentile(values, 50), p95Ms: percentile(values, 95),
  p99Ms: values.length >= 1000 ? percentile(values, 99) : null,
  p99Status: values.length >= 1000 ? 'LOCAL_EMPIRICAL_ESTIMATE_10_TAIL_SAMPLES' : 'NOT_PROVEN_INSUFFICIENT_SAMPLE',
  minMs: Math.min(...values), maxMs: Math.max(...values) });
function row(scale, median, eligible = false) {
  const size = eligible ? 10 : 200, count = eligible ? 3 : 5;
  const batches = Array.from({ length: count }, (_, index) => {
    const values = Array.from({ length: size }, (_, i) => median + index * 0.001 + (i >= size * 0.9 ? 0.1 : 0));
    return eligible ? values : { ...stats(values), valuesMs: values };
  });
  const values = batches.flatMap(batch => eligible ? batch : batch.valuesMs);
  return { scale, ...stats(values), batches, rollbackVerified: true,
    counts: { scores: scale * 432, receipts: scale * 432 },
    archivedCounts: { years: scale, scores: scale * 432 },
    nestedSqlExecutions: 82, derivedRelationsOnScorePath: [],
    queryPlanArtifact: `evidence/plans-${scale}x.json` };
}
function artifact(mode, eligible = false, median = mode === 'before' ? 20 : 0.55) {
  const value = { schemaVersion: 1, mode, generatedAt: '2026-09-28T12:00:00Z',
    baseSha: '1'.repeat(40), executionHead: '1'.repeat(40), production: false,
    fixtureVersion: eligible ? 'fixture-v1+eligible-v2' : 'fixture-v1',
    fixtureSeed: 'seed-v1', seed: 'seed-v1',
    candidateMigrationSha256: mode === 'after' ? '2'.repeat(64) : null,
    environment: 'LOCAL_SOCKET_ONLY_POSTGRESQL_17',
    environmentDetails: { databaseVersion: '17.9', databaseSettings: { fsync: 'off', work_mem: '4MB' },
      host: { platform: 'darwin', architecture: 'arm64', cpuModel: 'fixture-cpu', logicalCpus: 10, totalMemoryBytes: 1024 } },
    scales: scales.map(scale => row(scale, median)) };
  if (eligible) value.scales = scales.map(scale => ({ scale,
    counts: { scores: scale * 432, receipts: scale * 432 },
    archivedCounts: { years: scale, scores: scale * 432 },
    branches: variants.map(variant => ({ ...row(scale, median, true), variant,
      eligible: !['none', 'stale_result_binding', 'superseded_result'].includes(variant),
      compatibleBefore: ['current_compatible', 'multiple_receipts'].includes(variant),
      planArtifact: `evidence/eligible-${scale}x-${variant}.json` })) }));
  return value;
}
const inputs = () => [artifact('before'), artifact('after'), artifact('before', true), artifact('after', true)];
const evaluate = values => evaluateScorePerformance(...values);

test('complete common and 32-branch evidence passes only the unapproved automated scope', () => {
  const result = evaluate(inputs());
  assert.equal(result.result, 'PASS');
  assert.equal(result.approved, false);
  assert.equal(result.coverage.commonScaleCount, 4);
  assert.equal(result.coverage.eligibleBranchScaleCount, 32);
  assert.equal(result.coverage.fullQueryPlanIndexReview, 'NOT_PROVEN');
  assert.equal(result.coverage.statementTimeoutHeadroom, 'NOT_PROVEN');
  assert.match(result.scope, /AUTOMATED_LOCAL/);
  assert.match(result.thresholdStatus, /PROPOSED/);
});

test('common-only evidence remains PARTIAL rather than hiding eligible-history gaps', () => {
  const [before, after] = inputs();
  const result = evaluateScorePerformance(before, after);
  assert.equal(result.result, 'PARTIAL');
  assert.ok(result.missing.includes('ELIGIBLE_HISTORY_EVIDENCE_REQUIRED'));
});

test('gate rejects missing, null, nonnumeric, nonfinite and unordered measured fields', () => {
  for (const field of ['samples', 'successCount', 'failureCount', 'p50Ms', 'p95Ms', 'p99Ms', 'minMs', 'maxMs']) {
    for (const bad of [undefined, null, '1', NaN, Infinity, -1]) {
      const values = inputs(); values[1].scales[0][field] = bad;
      assert.notEqual(evaluate(values).result, 'PASS', `${field}=${String(bad)}`);
    }
  }
  const values = inputs(); values[1].scales[0].p95Ms = 0;
  assert.equal(evaluate(values).result, 'FAIL');
});

test('gate rejects incomplete and inconsistent batch evidence', () => {
  for (const mutate of [
    row => { delete row.batches; },
    row => { row.batches.pop(); },
    row => { row.batches[0].valuesMs[0] = Infinity; },
    row => { row.batches[0].samples -= 1; },
    row => { row.p50Ms += 0.001; },
  ]) {
    const values = inputs(); mutate(values[1].scales[0]);
    assert.notEqual(evaluate(values).result, 'PASS');
  }
});

test('gate rejects missing plans and forbidden derived history on the common score path', () => {
  for (const mutate of [
    row => { delete row.queryPlanArtifact; },
    row => { delete row.derivedRelationsOnScorePath; },
    row => { row.nestedSqlExecutions = 0; },
    row => { row.derivedRelationsOnScorePath = ['calcutta_v1_recalculation_jobs']; },
    row => { row.derivedRelationsOnScorePath = ['late_r3_calcutta_compatibility_v1']; },
  ]) {
    const values = inputs(); mutate(values[1].scales[0]);
    assert.notEqual(evaluate(values).result, 'PASS');
  }
});

test('four distinct required history scales cannot be omitted, duplicated or substituted', () => {
  for (const mutate of [
    artifact => { artifact.scales.pop(); },
    artifact => { artifact.scales[3].scale = 1; },
    artifact => { artifact.scales[3].scale = 100; },
  ]) {
    const values = inputs(); mutate(values[1]);
    assert.notEqual(evaluate(values).result, 'PASS');
  }
});

test('provenance, environment, fixture counts and candidate identity must match', () => {
  for (const mutate of [
    artifact => { artifact.fixtureVersion = 'other'; },
    artifact => { artifact.fixtureSeed = 'other'; },
    artifact => { artifact.mode = 'before'; },
    artifact => { artifact.production = true; },
    artifact => { delete artifact.candidateMigrationSha256; },
    artifact => { artifact.environmentDetails.databaseVersion = '18.0'; },
    artifact => { artifact.environmentDetails.databaseSettings.fsync = 'on'; },
    artifact => { artifact.environmentDetails.host.cpuModel = 'other'; },
    artifact => { artifact.scales[0].counts.receipts += 1; },
  ]) {
    const values = inputs(); mutate(values[1]);
    assert.notEqual(evaluate(values).result, 'PASS');
  }
});

test('low common-path sample count cannot become p99 proof', () => {
  const values = inputs(); const candidate = values[1].scales[0];
  const samples = candidate.batches[0].valuesMs.slice(0, 30);
  Object.assign(candidate, stats(samples), { batches: [0, 1, 2].map(() => ({ ...stats(samples.slice(0, 10)), valuesMs: samples.slice(0, 10) })) });
  assert.notEqual(evaluate(values).result, 'PASS');
});

test('small bounded local changes are tolerated without accepting eighteen-fold history growth', () => {
  const bounded = inputs(); bounded[1].scales[3] = row(10, 0.8);
  assert.equal(evaluate(bounded).result, 'PASS');
  const exploded = inputs(); exploded[1].scales[3] = row(10, 10);
  const result = evaluate(exploded);
  assert.equal(result.result, 'FAIL');
  assert.ok(result.failures.includes('COMMON_10x_IRRELEVANT_HISTORY_GROWTH'));
});

test('history growth at intermediate scales is not hidden by a fast ten-times result', () => {
  const values = inputs(); values[1].scales[1] = row(2, 5);
  assert.ok(evaluate(values).failures.includes('COMMON_2x_IRRELEVANT_HISTORY_GROWTH'));
});

test('material tail regression fails independently of forbidden-history detection', () => {
  const values = inputs(); values[1].scales[0] = row(1, 30);
  assert.ok(evaluate(values).failures.includes('COMMON_1x_UNEXPLAINED_TAIL_REGRESSION'));
});

test('eligible evidence requires every one of the 32 branch-scale cases on both sides', () => {
  for (const target of [2, 3]) {
    const values = inputs(); values[target].scales[0].branches.pop();
    assert.equal(evaluate(values).result, 'PARTIAL');
  }
  const missingPair = inputs(); missingPair[3] = undefined;
  assert.equal(evaluate(missingPair).result, 'PARTIAL');
});

test('eligible before and after require plan coverage at one-times and ten-times scale', () => {
  for (const target of [2, 3]) {
    for (const index of [0, 3]) {
      const values = inputs(); delete values[target].scales[index].branches[0].planArtifact;
      assert.equal(evaluate(values).result, 'PARTIAL');
    }
  }
});

test('eligible branch historical work cannot hide behind a fast common path', () => {
  const values = inputs();
  values[3].scales[3].branches[1].derivedRelationsOnScorePath = ['calcutta_v1_result_revisions'];
  assert.equal(evaluate(values).result, 'FAIL');
});

test('eligible identity, binding, duplicates and missing timing evidence fail closed', () => {
  for (const mutate of [
    artifact => { artifact.candidateMigrationSha256 = '3'.repeat(64); },
    artifact => { artifact.seed = 'different'; },
    artifact => { artifact.scales[0].branches[0].eligible = true; },
    artifact => { artifact.scales[0].branches[1].variant = 'none'; },
    artifact => { delete artifact.scales[0].branches[0].p95Ms; },
    artifact => { artifact.scales[0].branches[0].p99Ms = 2; },
    artifact => { artifact.scales[0].branches[0].batches[0][0] = NaN; },
  ]) {
    const values = inputs(); mutate(values[3]);
    assert.notEqual(evaluate(values).result, 'PASS');
  }
});

test('eligible history growth is evaluated separately for each branch', () => {
  const values = inputs();
  const original = values[3].scales[3].branches[1];
  values[3].scales[3].branches[1] = { ...original, ...row(10, 10, true) };
  const result = evaluate(values);
  assert.ok(result.failures.includes('ELIGIBLE_current_compatible_10x_IRRELEVANT_HISTORY_GROWTH'));
});

test('malformed root artifacts cannot become an automated PASS', () => {
  for (const value of [null, undefined, [], {}, 'artifact']) {
    assert.notEqual(evaluateScorePerformance(value, value).result, 'PASS');
  }
});

// Unstable measurements must not inflate the allowed history growth into a PASS.
test('excess candidate batch variance requires a repeat even with valid summaries', () => {
  const values = inputs(), candidate = values[1].scales[0];
  candidate.batches[4] = row(1, 5).batches[4];
  Object.assign(candidate, stats(candidate.batches.flatMap(batch => batch.valuesMs)));
  const result = evaluate(values);
  assert.equal(result.result, 'PARTIAL');
  assert.ok(result.missing.includes('COMMON_1x_CANDIDATE_VARIANCE_REQUIRES_REPEAT'));
});
