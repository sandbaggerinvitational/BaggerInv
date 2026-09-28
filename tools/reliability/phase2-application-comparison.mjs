// UNIT evidence comparison. A matching failure count alone is not a regression gate.
import assert from 'node:assert/strict';

export function compareApplicationEvidence(baseline, candidate) {
  for (const [mode, artifact] of [['baseline', baseline], ['candidate', candidate]]) {
    assert.equal(artifact.mode, mode);
    assert.equal(artifact.selectionCount, 493);
    assert.match(artifact.manifestSha256, /^[a-f0-9]{64}$/);
    assert.ok(Array.isArray(artifact.failures));
    for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
      assert.ok(Number.isSafeInteger(artifact.counts?.[key]) && artifact.counts[key] >= 0);
    }
    assert.equal(artifact.counts.tests, artifact.counts.pass + artifact.counts.fail + artifact.counts.cancelled + artifact.counts.skipped + artifact.counts.todo);
    assert.equal(artifact.error, null);
    assert.equal(artifact.counts.cancelled, 0);
    assert.equal(artifact.failures.length, artifact.counts.fail);
    assert.equal(new Set(artifact.failures.map(f => f.name)).size, artifact.failures.length);
    assert.ok(artifact.failures.every(f => typeof f.name === 'string' && typeof f.diagnostic === 'string'));
  }
  assert.equal(baseline.head, '184b5c65a8e63784e1af8d38121fa2e16a015628');
  assert.equal(baseline.manifestSha256, candidate.manifestSha256);
  const before = new Map(baseline.failures.map(f => [f.name, f.diagnostic]));
  const after = new Map(candidate.failures.map(f => [f.name, f.diagnostic]));
  const newFailureNames = [...after.keys()].filter(name => !before.has(name)).sort();
  const resolvedFailureNames = [...before.keys()].filter(name => !after.has(name)).sort();
  const sameFailureNames = [...after.keys()].filter(name => before.has(name)).sort();
  const changedDiagnostics = sameFailureNames.filter(name => before.get(name) !== after.get(name));
  const coverageChanged = baseline.counts.tests !== candidate.counts.tests || baseline.counts.skipped !== candidate.counts.skipped || baseline.counts.todo !== candidate.counts.todo;
  return {
    schemaVersion: 2,
    result: newFailureNames.length || coverageChanged ? 'FAIL' : changedDiagnostics.length || resolvedFailureNames.length ? 'REVIEW_REQUIRED' : 'NO_NEW_REGRESSIONS',
    baselineCounts: baseline.counts, candidateCounts: candidate.counts,
    newFailureNames, resolvedFailureNames, sameFailureNames, changedDiagnostics,
    coverageChanged, selectionCount: 493, selectionHashMatches: true,
    limitation: 'Existing failures remain failures. Changed diagnostics require review; no blanket pre-existing exemption.',
  };
}
