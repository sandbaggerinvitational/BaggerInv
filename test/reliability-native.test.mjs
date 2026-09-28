import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repositoryRoot, 'tools', 'reliability', 'native-never-again');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
}

test('NA-2026-006 reproduces the Build 10 SQLite fractional timestamp CAS failure after process termination', {
  skip: process.platform !== 'darwin' && 'the exact native repository requires macOS Foundation and SDK SQLite',
  timeout: 180_000,
}, () => {
  const result = run(path.join(fixtureRoot, 'run-sqlite-reproduction.sh'), ['defect']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const lines = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].command, 'prepare');
  assert.equal(lines[0].databaseHeader, 'SQLite format 3');
  assert.equal(lines[0].journalMode.toLowerCase(), 'wal');
  assert.equal(lines[1].command, 'reopen-defect');
  assert.equal(lines[1].realSQLite, true);
  assert.equal(lines[1].differentProcess, true);
  assert.notEqual(lines[1].pid, lines[1].preparePID);
  assert.equal(lines[1].expectedRecordEqualsStored, false);
  assert.equal(lines[1].observedError, 'concurrentModification');
  assert.ok(lines[1].dateDeltaNanoseconds > 0);
});

test('NA-2026-006 reloads a persisted accepted acknowledgement and compares matching Official evidence through the Build 10 coordinator', {
  skip: !process.env.BAGGER_NATIVE_BUILD10_ROOT && 'set BAGGER_NATIVE_BUILD10_ROOT to the exact pinned Build 10 checkout',
  timeout: 900_000,
}, () => {
  const args = [
    '--native-root', process.env.BAGGER_NATIVE_BUILD10_ROOT,
  ];
  if (process.env.BAGGER_NATIVE_SIMULATOR_DESTINATION) {
    args.push('--destination', process.env.BAGGER_NATIVE_SIMULATOR_DESTINATION);
  }
  if (process.env.BAGGER_NATIVE_PACKAGE_CACHE) {
    args.push('--package-cache', process.env.BAGGER_NATIVE_PACKAGE_CACHE);
  }
  const result = run(path.join(fixtureRoot, 'run-canonical-reconciliation-harness.sh'), args, {
    maxBuffer: 40 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout.match(/\*\* TEST SUCCEEDED \*\*/g)?.length, 2);

  const prepareMatch = result.stdout.match(/NA006_CANONICAL_PREPARE (\{[^\n]+\})/);
  const recoverMatch = result.stdout.match(/NA006_CANONICAL_RECOVER (\{[^\n]+\})/);
  assert.ok(prepareMatch, 'missing persisted acknowledgement evidence');
  assert.ok(recoverMatch, 'missing canonical reconciliation evidence');
  const prepare = JSON.parse(prepareMatch[1]);
  const recover = JSON.parse(recoverMatch[1]);
  assert.equal(prepare.state, 'acknowledged');
  assert.equal(prepare.accepted, true);
  assert.equal(prepare.refreshPending, true);
  assert.equal(prepare.persistenceFailure, true);
  assert.equal(prepare.canonicalGrossMatchesIntent, true);
  assert.equal(prepare.databaseHeader, 'SQLite format 3');
  assert.equal(prepare.journalMode.toLowerCase(), 'wal');
  assert.equal(recover.differentProcess, true);
  assert.notEqual(recover.pid, recover.preparePID);
  assert.equal(recover.canonicalGrossMatchesIntent, true);
  assert.equal(recover.extraScorePostsDuringRecovery, 0);
  assert.equal(recover.receiptAccepted, true);
  assert.equal(recover.receiptMutationMatches, true);
  assert.equal(recover.recordsAfter, 0);
  assert.equal(recover.unresolvedAfter, 0);
  assert.equal(recover.persistenceFailure, false);
});

test('NA-2026-007 reproduces the Build 10 authenticated shell reset in a simulator when a pinned checkout is supplied', {
  skip: !process.env.BAGGER_NATIVE_BUILD10_ROOT && 'set BAGGER_NATIVE_BUILD10_ROOT to the exact pinned Build 10 checkout',
  timeout: 900_000,
}, () => {
  const args = [
    '--native-root', process.env.BAGGER_NATIVE_BUILD10_ROOT,
    '--mode', 'reproduce',
  ];
  if (process.env.BAGGER_NATIVE_SIMULATOR_DESTINATION) {
    args.push('--destination', process.env.BAGGER_NATIVE_SIMULATOR_DESTINATION);
  }
  if (process.env.BAGGER_NATIVE_PACKAGE_CACHE) {
    args.push('--package-cache', process.env.BAGGER_NATIVE_PACKAGE_CACHE);
  }
  const result = run(path.join(fixtureRoot, 'run-shell-harness.sh'), args);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /TodayFallbackAuditTests/);
  assert.match(result.stdout, /\*\* TEST SUCCEEDED \*\*/);
});
