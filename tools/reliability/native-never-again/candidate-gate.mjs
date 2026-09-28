import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixtureRoot = path.join(repositoryRoot, 'tools', 'reliability', 'native-never-again');

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

test('NA-2026-006 candidate gate requires the real-SQLite compare-and-swap transition to survive termination and reopen', {
  timeout: 180_000,
}, () => {
  assert.equal(process.platform, 'darwin', 'the native tournament gate requires a macOS executor');
  const candidateRoot = process.env.BAGGER_NATIVE_CANDIDATE_ROOT;
  assert.ok(candidateRoot, 'BAGGER_NATIVE_CANDIDATE_ROOT is required; the tournament gate cannot test vendored Build 10 as a candidate');
  const result = run(path.join(fixtureRoot, 'run-sqlite-reproduction.sh'), ['fixed', candidateRoot]);
  assert.equal(result.status, 0, [
    'EXPECTED RED until the native timestamp persistence defect is corrected.',
    result.stdout,
    result.stderr,
  ].join('\n'));
  const lines = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.at(-1).command, 'verify-fixed');
  assert.equal(lines.at(-1).observedError, 'none');
  assert.equal(lines.at(-1).differentProcess, true);
  assert.equal(lines.at(-1).realSQLite, true);
});

test('NA-2026-007 candidate gate requires feature failure to preserve the authenticated shell and destination', {
  timeout: 900_000,
}, () => {
  const candidateRoot = process.env.BAGGER_NATIVE_CANDIDATE_ROOT;
  assert.ok(candidateRoot, 'BAGGER_NATIVE_CANDIDATE_ROOT is required; the tournament gate cannot skip simulator evidence');
  const args = ['--native-root', candidateRoot, '--mode', 'candidate'];
  if (process.env.BAGGER_NATIVE_SIMULATOR_DESTINATION) {
    args.push('--destination', process.env.BAGGER_NATIVE_SIMULATOR_DESTINATION);
  }
  if (process.env.BAGGER_NATIVE_PACKAGE_CACHE) {
    args.push('--package-cache', process.env.BAGGER_NATIVE_PACKAGE_CACHE);
  }
  const result = run(path.join(fixtureRoot, 'run-shell-harness.sh'), args);
  assert.equal(result.status, 0, [
    'EXPECTED RED against Build 10 until authenticated shell and destination preservation are corrected.',
    result.stdout,
    result.stderr,
  ].join('\n'));
  assert.match(result.stdout, /NativeShellPreservationExpectedRedTests/);
  assert.match(result.stdout, /\*\* TEST SUCCEEDED \*\*/);
});
