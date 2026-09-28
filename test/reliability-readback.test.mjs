import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { verifyR3PreparationReadback } from '../tools/reliability/preparation-readback.mjs';

const pairFingerprint = '7d4972d7e59c2177b9a0d9f941abd7af3ff0fb106c2f8f019136c0cec85c32a6';
const protectedFingerprint = '5ddb11258bcd7c3faee5b7933363cb95a4e96548c6d27095a93b7cc3a3bcccdb';
const handicapRevisionId = '7d02cc22-c634-4502-91e1-1d54d4e0edf9';
const operationId = '90000000-0000-4000-8000-000000000009';
const dependencies = Object.freeze({
  netSkins: 3,
  odds: 7,
  calcuttaConfiguration: 2,
  calcuttaAuction: 37,
  calcuttaPublication: 41,
  calcuttaResult: 231,
});
const matchIds = Array.from({ length: 12 }, (_, index) => `2026-R3-${index + 1}`);
const golferIds = Array.from({ length: 24 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
const fingerprint = (value) => createHash('sha256').update(value).digest('hex');
const preparedConfigurationFingerprints = Object.fromEntries(
  matchIds.map((matchId) => [matchId, fingerprint(`prepared:${matchId}:setup48:hi13`)])
);

// Offline evidence-consistency fixture. No live RPC/readback is performed.
function fixture() {
  const pairings = matchIds.map((matchId, index) => ({
    matchId,
    playerIds: [golferIds[index * 2], golferIds[index * 2 + 1]],
    participants: [1, 2].map((teamSide) => ({
      playerId: golferIds[index * 2 + teamSide - 1], teamSide, playerSlot: 1,
    })),
    courseId: 'synthetic-r3-course',
    teeId: 'synthetic-r3-tee',
  }));
  const expected = {
    operationId,
    tournamentId: '2026',
    roundNumber: 3,
    setupRevision: 48,
    handicapRevision: 13,
    handicapRevisionId,
    pairingFingerprint: pairFingerprint,
    protectedFingerprint,
    dependencies: { ...dependencies },
    matchIds: [...matchIds],
    golferIds: [...golferIds],
    preparedConfigurationFingerprints: { ...preparedConfigurationFingerprints },
    pairings: structuredClone(pairings),
  };
  const operation = {
    acknowledgement: 'ACKNOWLEDGED',
    ok: true,
    recoveryClass: 'PREPARE_EXISTING_R3_PAIRINGS_WITH_COMPATIBLE_DEPENDENCIES',
    operationId,
    round: 3,
    setupRevision: 48,
    handicapRevision: 13,
    pairingFingerprint: pairFingerprint,
    protectedHash: protectedFingerprint,
    postStateHash: fingerprint('canonical-post-state'),
    dependencies: { ...dependencies },
    matchIds: [...matchIds],
    golferIds: [...golferIds],
    ready: 12,
    upcoming: 12,
    live: 0,
    access: 0,
    leases: 0,
    scores: 0,
    results: 0,
  };
  const contexts = pairings.map((pairing) => ({
    ...structuredClone(pairing),
    tournamentId: '2026',
    roundNumber: 3,
    current: true,
    snapshotId: `${pairing.matchId}:S2`,
    snapshotRevision: 2,
    setupRevision: 48,
    preparedSetupRevision: 48,
    handicapRevisionId,
    preparedConfigurationFingerprint: preparedConfigurationFingerprints[pairing.matchId],
    status: 'UPCOMING',
    format: 'SI',
  }));
  const readiness = matchIds.map((matchId) => ({ matchId, status: 'READY', ready: true }));
  const canonical = {
    tournamentId: '2026',
    roundNumber: 3,
    pairingFingerprint: pairFingerprint,
    protectedFingerprint,
    contextStateHash: operation.postStateHash,
    dependencies: { ...dependencies },
    handicap: { revisionNumber: 13, revisionId: handicapRevisionId, current: true },
    pairings,
    contexts,
    readiness,
    counts: { ready: 12, upcoming: 12, live: 0, access: 0, leases: 0, scores: 0, results: 0 },
  };
  return { expected, operation, canonical };
}

test('NA-2026-017 rejects acknowledged 12-pairing preparation with placeholder zero readiness and no current contexts', () => {
  const input = fixture();
  input.operation.ready = 0;
  input.canonical.contexts = [];
  input.canonical.readiness = [];

  const result = verifyR3PreparationReadback(input);
  assert.equal(result.accepted, false);
  assert.equal(result.code, 'R3_OPERATION_COUNT_MISMATCH');
  assert.deepEqual(result.observed, {
    acknowledged: true,
    operationReady: 0,
    canonicalPairings: 12,
    canonicalCurrentContexts: 0,
    canonicalHandicapRevision: 13,
    canonicalReady: 0,
  });
  assert.ok(result.blockers.some(({ code }) => code === 'R3_CANONICAL_CONTEXT_DATASET_MISMATCH'));
  assert.ok(result.blockers.some(({ code }) => code === 'R3_CANONICAL_READINESS_DATASET_MISMATCH'));
});

test('NA-2026-017 accepts only exact canonical 12-pairing, current-context, HI 13, READY readback', () => {
  const result = verifyR3PreparationReadback(fixture());
  assert.deepEqual(result, {
    accepted: true,
    code: 'R3_PREPARATION_CANONICAL_READBACK_ACCEPTED',
    blockers: [],
    observed: {
      acknowledged: true,
      operationReady: 12,
      canonicalPairings: 12,
      canonicalCurrentContexts: 12,
      canonicalHandicapRevision: 13,
      canonicalReady: 12,
    },
  });
});

test('NA-2026-017 rejects stale operation revisions, fingerprint drift, substituted data sets, and noncurrent context', () => {
  const mutations = [
    ['operation revision', (input) => { input.operation.setupRevision = 47; }, 'R3_OPERATION_REVISION_MISMATCH'],
    ['operation fingerprint', (input) => { input.operation.pairingFingerprint = '0'.repeat(64); }, 'R3_OPERATION_FINGERPRINT_MISMATCH'],
    ['operation match set', (input) => { input.operation.matchIds[11] = '2026-R3-99'; }, 'R3_OPERATION_DATASET_MISMATCH'],
    ['dependency revision', (input) => { input.canonical.dependencies.odds = 8; }, 'R3_CANONICAL_DEPENDENCY_MISMATCH'],
    ['HI revision', (input) => { input.canonical.handicap.revisionNumber = 12; }, 'R3_CANONICAL_HANDICAP_MISMATCH'],
    ['pairing player set', (input) => { input.canonical.pairings[0].playerIds[0] = 'P99'; }, 'R3_CANONICAL_PAIRING_DATASET_MISMATCH'],
    ['context fingerprint', (input) => { input.canonical.contexts[0].preparedConfigurationFingerprint = 'f'.repeat(64); }, 'R3_CANONICAL_CONTEXT_DATASET_MISMATCH'],
    ['noncurrent context', (input) => { input.canonical.contexts[0].current = false; }, 'R3_CANONICAL_CONTEXT_DATASET_MISMATCH'],
    ['readiness set', (input) => { input.canonical.readiness[0].matchId = '2026-R3-99'; }, 'R3_CANONICAL_READINESS_DATASET_MISMATCH'],
  ];

  for (const [label, mutate, code] of mutations) {
    const input = fixture();
    mutate(input);
    const result = verifyR3PreparationReadback(input);
    assert.equal(result.accepted, false, label);
    assert.ok(result.blockers.some((blocker) => blocker.code === code), label);
  }
});

test('NA-2026-017 CLI exits nonzero for placeholder readback and zero for exact canonical readback', () => {
  const tool = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tools/reliability/preparation-readback.mjs');
  const rejected = fixture();
  rejected.operation.ready = 0;
  rejected.canonical.contexts = [];
  rejected.canonical.readiness = [];
  const rejectedRun = spawnSync(process.execPath, [tool], {
    input: JSON.stringify(rejected),
    encoding: 'utf8',
  });
  assert.equal(rejectedRun.status, 1, rejectedRun.stderr);
  assert.equal(JSON.parse(rejectedRun.stdout).accepted, false);

  const acceptedRun = spawnSync(process.execPath, [tool], {
    input: JSON.stringify(fixture()),
    encoding: 'utf8',
  });
  assert.equal(acceptedRun.status, 0, acceptedRun.stderr);
  assert.equal(JSON.parse(acceptedRun.stdout).accepted, true);
});


test('NA-2026-017 rejects missing reviewed identity and dependency or pairing bindings', () => {
  const mutations = [
    ['missing operation IDs', (input) => { delete input.expected.operationId; delete input.operation.operationId; }],
    ['malformed operation IDs', (input) => { input.expected.operationId = input.operation.operationId = 'unknown'; }],
    ['empty dependency objects', (input) => { input.expected.dependencies = {}; input.operation.dependencies = {}; input.canonical.dependencies = {}; }],
    ['missing reviewed dependency', (input) => { delete input.expected.dependencies.calcuttaResult; }],
    ['invalid reviewed revision', (input) => { input.expected.dependencies.odds = -1; }],
    ['missing reviewed pairs', (input) => { delete input.expected.pairings; }],
    ['missing reviewed course', (input) => { delete input.expected.pairings[0].courseId; }],
    ['missing reviewed tee', (input) => { delete input.expected.pairings[0].teeId; }],
    ['missing reviewed participant', (input) => { input.expected.pairings[0].participants.pop(); }],
  ];
  for (const [label, mutate] of mutations) {
    const input = fixture(); mutate(input);
    const result = verifyR3PreparationReadback(input);
    assert.equal(result.accepted, false, label);
    assert.ok(result.blockers.some(({ code }) => code === 'R3_EXPECTED_SCOPE_INVALID'), label);
  }
});

test('NA-2026-017 rejects per-match pairing and context drift despite unchanged declared fingerprints', () => {
  for (const collection of ['pairings', 'contexts']) {
    for (const [label, mutate] of [
      ['golfer moved between matches', (rows) => {
        [rows[0].playerIds[0], rows[1].playerIds[0]] = [rows[1].playerIds[0], rows[0].playerIds[0]];
        [rows[0].participants[0].playerId, rows[1].participants[0].playerId] =
          [rows[1].participants[0].playerId, rows[0].participants[0].playerId];
      }],
      ['team sides reversed', (rows) => { rows[0].participants[0].teamSide = 2; rows[0].participants[1].teamSide = 1; }],
      ['wrong player slot', (rows) => { rows[0].participants[0].playerSlot = 2; }],
      ['wrong course', (rows) => { rows[0].courseId = 'different-course'; }],
      ['wrong tee', (rows) => { rows[0].teeId = 'different-tee'; }],
      ['missing participants', (rows) => { delete rows[0].participants; }],
    ]) {
      const input = fixture(); mutate(input.canonical[collection]);
      const result = verifyR3PreparationReadback(input);
      assert.equal(result.accepted, false, `${collection}: ${label}`);
      const expectedCode = collection === 'pairings' ? 'R3_CANONICAL_PAIRING_DATASET_MISMATCH' : 'R3_CANONICAL_CONTEXT_DATASET_MISMATCH';
      assert.ok(result.blockers.some(({ code }) => code === expectedCode), `${collection}: ${label}`);
    }
  }
});

test('NA-2026-017 requires independent canonical lifecycle counts despite a successful receipt', () => {
  for (const key of ['ready', 'upcoming', 'live', 'access', 'leases', 'scores', 'results']) {
    const input = fixture();
    input.canonical.counts[key] = ['ready', 'upcoming'].includes(key) ? 11 : 1;
    const result = verifyR3PreparationReadback(input);
    assert.equal(result.accepted, false, key);
    assert.ok(result.blockers.some(({ code }) => code === 'R3_CANONICAL_COUNT_MISMATCH'), key);
  }
  const missing = fixture(); delete missing.canonical.counts;
  assert.equal(verifyR3PreparationReadback(missing).accepted, false);
});
