#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const RECOVERY_CLASS = 'PREPARE_EXISTING_R3_PAIRINGS_WITH_COMPATIBLE_DEPENDENCIES';
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DEPENDENCY_KEYS = Object.freeze([
  'netSkins', 'odds', 'calcuttaConfiguration', 'calcuttaAuction',
  'calcuttaPublication', 'calcuttaResult',
]);
const PREPARED_COUNTS = Object.freeze({
  ready: 12, upcoming: 12, live: 0, access: 0, leases: 0, scores: 0, results: 0,
});

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), 'en'));
}

function sameSet(actual, expected) {
  return Array.isArray(actual) && Array.isArray(expected) &&
    actual.length === expected.length &&
    JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function exactObject(actual, expected) {
  return actual && typeof actual === 'object' && !Array.isArray(actual) &&
    expected && typeof expected === 'object' && !Array.isArray(expected) &&
    JSON.stringify(Object.fromEntries(Object.entries(actual).sort())) ===
      JSON.stringify(Object.fromEntries(Object.entries(expected).sort()));
}

function validDependencies(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    sameSet(Object.keys(value), DEPENDENCY_KEYS) &&
    DEPENDENCY_KEYS.every((key) => Number.isSafeInteger(value[key]) && value[key] > 0);
}

function participantBindings(value) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((row) =>
    !row || !IDENTIFIER.test(row.playerId || '') ||
    ![1, 2].includes(row.teamSide) || row.playerSlot !== 1) ||
    new Set(value.map((row) => row.playerId)).size !== 2 ||
    new Set(value.map((row) => row.teamSide)).size !== 2) return null;
  return value.map(({ playerId, teamSide, playerSlot }) => ({ playerId, teamSide, playerSlot }))
    .sort((left, right) => left.teamSide - right.teamSide);
}

function sameParticipants(actual, expected) {
  const observed = participantBindings(actual);
  const reviewed = participantBindings(expected);
  return observed !== null && reviewed !== null && JSON.stringify(observed) === JSON.stringify(reviewed);
}

function matchesReviewedPairing(actual, expected) {
  return Boolean(actual && expected &&
    actual.matchId === expected.matchId &&
    actual.courseId === expected.courseId && actual.teeId === expected.teeId &&
    sameSet(actual.playerIds, expected.playerIds) &&
    sameParticipants(actual.participants, expected.participants));
}

function issue(blockers, code, detail) {
  blockers.push({ code, detail });
}

export function verifyR3PreparationReadback({ expected, operation, canonical }) {
  const blockers = [];
  if (!expected || !operation || !canonical) {
    return {
      accepted: false,
      code: 'R3_READBACK_INPUT_REQUIRED',
      blockers: [{ code: 'R3_READBACK_INPUT_REQUIRED', detail: 'expected, operation, and canonical are required' }],
    };
  }

  const matchIds = Array.isArray(expected.matchIds) ? expected.matchIds : [];
  const golferIds = Array.isArray(expected.golferIds) ? expected.golferIds : [];
  const preparedFingerprints = expected.preparedConfigurationFingerprints || {};
  const reviewedPairings = Array.isArray(expected.pairings) ? expected.pairings : [];
  const reviewedByMatch = new Map(reviewedPairings.filter(Boolean).map((row) => [row.matchId, row]));
  const validReviewedPairings = reviewedPairings.length === 12 &&
    sameSet(reviewedPairings.map((row) => row?.matchId), matchIds) &&
    sameSet(reviewedPairings.flatMap((row) => Array.isArray(row?.playerIds) ? row.playerIds : []), golferIds) &&
    reviewedPairings.every((row) => row && IDENTIFIER.test(row.courseId || '') &&
      IDENTIFIER.test(row.teeId || '') && participantBindings(row.participants) !== null &&
      sameSet(row.playerIds, row.participants.map((participant) => participant.playerId)));
  if (!UUID.test(expected.operationId || '') || !validDependencies(expected.dependencies) ||
      !validReviewedPairings || expected.tournamentId !== '2026' || expected.roundNumber !== 3 ||
      expected.setupRevision !== 48 || expected.handicapRevision !== 13 ||
      !UUID.test(expected.handicapRevisionId || '') ||
      !SHA256.test(expected.pairingFingerprint || '') ||
      !SHA256.test(expected.protectedFingerprint || '') ||
      matchIds.length !== 12 || new Set(matchIds).size !== 12 || matchIds.some((id) => !IDENTIFIER.test(id)) ||
      golferIds.length !== 24 || new Set(golferIds).size !== 24 || golferIds.some((id) => !IDENTIFIER.test(id)) ||
      Object.keys(preparedFingerprints).length !== 12 ||
      matchIds.some((id) => !SHA256.test(preparedFingerprints[id] || ''))) {
    issue(blockers, 'R3_EXPECTED_SCOPE_INVALID', 'expected scope must bind a valid operation ID, all six dependency revisions, 2026 R3, setup 48, HI 13, and exact match/player/team/course/tee bindings and context fingerprints');
  }

  if (operation.acknowledgement !== 'ACKNOWLEDGED' || operation.ok !== true) {
    issue(blockers, 'R3_OPERATION_NOT_ACKNOWLEDGED', 'the mutation outcome is not an acknowledged success');
  }
  if (!UUID.test(operation.operationId || '') ||
      operation.recoveryClass !== RECOVERY_CLASS || operation.operationId !== expected.operationId) {
    issue(blockers, 'R3_OPERATION_IDENTITY_MISMATCH', 'operation class or operation ID differs from the reviewed request');
  }
  if (operation.round !== expected.roundNumber ||
      operation.setupRevision !== expected.setupRevision ||
      operation.handicapRevision !== expected.handicapRevision) {
    issue(blockers, 'R3_OPERATION_REVISION_MISMATCH', 'operation revisions differ from the reviewed request');
  }
  if (operation.pairingFingerprint !== expected.pairingFingerprint ||
      operation.protectedHash !== expected.protectedFingerprint ||
      !SHA256.test(operation.postStateHash || '')) {
    issue(blockers, 'R3_OPERATION_FINGERPRINT_MISMATCH', 'operation fingerprints do not bind the reviewed pairing, protected state, and post-state');
  }
  if (!sameSet(operation.matchIds || [], matchIds) || !sameSet(operation.golferIds || [], golferIds)) {
    issue(blockers, 'R3_OPERATION_DATASET_MISMATCH', 'operation receipt does not contain the exact 12-match and 24-golfer sets');
  }
  if (!exactObject(operation.dependencies, expected.dependencies)) {
    issue(blockers, 'R3_OPERATION_DEPENDENCY_MISMATCH', 'operation dependency revisions differ from the reviewed set');
  }
  for (const [name, value] of Object.entries(PREPARED_COUNTS)) {
    if (operation[name] !== value) {
      issue(blockers, 'R3_OPERATION_COUNT_MISMATCH', `${name} must equal ${value}; observed ${operation[name]}`);
    }
  }

  // These are independently collected canonical counts, never copied from the
  // acknowledgement. This offline verifier cannot authenticate their origin.
  if (!exactObject(canonical.counts, PREPARED_COUNTS)) {
    issue(blockers, 'R3_CANONICAL_COUNT_MISMATCH', 'canonical readback must independently confirm 12 READY/UPCOMING and zero live matches, access, leases, scores, and results');
  }

  if (canonical.tournamentId !== expected.tournamentId || canonical.roundNumber !== expected.roundNumber) {
    issue(blockers, 'R3_CANONICAL_SCOPE_MISMATCH', 'canonical readback is not the reviewed tournament and round');
  }
  if (canonical.pairingFingerprint !== expected.pairingFingerprint ||
      canonical.protectedFingerprint !== expected.protectedFingerprint ||
      canonical.contextStateHash !== operation.postStateHash) {
    issue(blockers, 'R3_CANONICAL_FINGERPRINT_MISMATCH', 'canonical readback does not match receipt fingerprints');
  }
  if (!exactObject(canonical.dependencies, expected.dependencies)) {
    issue(blockers, 'R3_CANONICAL_DEPENDENCY_MISMATCH', 'canonical dependency revisions differ from the reviewed set');
  }
  if (canonical.handicap?.revisionNumber !== expected.handicapRevision ||
      canonical.handicap?.revisionId !== expected.handicapRevisionId ||
      canonical.handicap?.current !== true) {
    issue(blockers, 'R3_CANONICAL_HANDICAP_MISMATCH', 'canonical current handicap revision is not the reviewed HI 13');
  }

  const pairings = Array.isArray(canonical.pairings) ? canonical.pairings : [];
  const pairingMatchIds = pairings.map((row) => row?.matchId);
  const pairingGolferIds = pairings.flatMap((row) => Array.isArray(row?.playerIds) ? row.playerIds : []);
  if (pairings.length !== 12 || !sameSet(pairingMatchIds, matchIds) ||
      pairings.some((row) => !matchesReviewedPairing(row, reviewedByMatch.get(row?.matchId))) ||
      !sameSet(pairingGolferIds, golferIds)) {
    issue(blockers, 'R3_CANONICAL_PAIRING_DATASET_MISMATCH', 'canonical pairings must match every reviewed match/player/team/course/tee binding');
  }

  const contexts = Array.isArray(canonical.contexts) ? canonical.contexts : [];
  if (contexts.length !== 12 || !sameSet(contexts.map((row) => row?.matchId), matchIds) ||
      contexts.some((row) =>
        !matchesReviewedPairing(row, reviewedByMatch.get(row?.matchId)) ||
        row.tournamentId !== expected.tournamentId || row.roundNumber !== expected.roundNumber ||
        row.current !== true ||
        row.snapshotId !== `${row.matchId}:S2` ||
        row.snapshotRevision !== 2 ||
        row.setupRevision !== expected.setupRevision ||
        row.preparedSetupRevision !== expected.setupRevision ||
        row.handicapRevisionId !== expected.handicapRevisionId ||
        row.preparedConfigurationFingerprint !== preparedFingerprints[row.matchId] ||
        row.status !== 'UPCOMING' ||
        row.format !== 'SI')) {
    issue(blockers, 'R3_CANONICAL_CONTEXT_DATASET_MISMATCH', 'all 12 matches must point to current S2 contexts bound to exact participants/teams/course/tee, 2026 R3, setup 48, HI 13, preparation fingerprints, UPCOMING, and SI');
  }

  const readiness = Array.isArray(canonical.readiness) ? canonical.readiness : [];
  if (readiness.length !== 12 || !sameSet(readiness.map((row) => row?.matchId), matchIds) ||
      readiness.some((row) => row?.status !== 'READY' || row?.ready !== true)) {
    issue(blockers, 'R3_CANONICAL_READINESS_DATASET_MISMATCH', 'all 12 exact matches must read back READY');
  }

  return {
    accepted: blockers.length === 0,
    code: blockers.length === 0 ? 'R3_PREPARATION_CANONICAL_READBACK_ACCEPTED' : blockers[0].code,
    blockers,
    observed: {
      acknowledged: operation.acknowledgement === 'ACKNOWLEDGED' && operation.ok === true,
      operationReady: operation.ready,
      canonicalPairings: pairings.length,
      canonicalCurrentContexts: contexts.filter((row) => row?.current === true).length,
      canonicalHandicapRevision: canonical.handicap?.revisionNumber ?? null,
      canonicalReady: readiness.filter((row) => row?.status === 'READY' && row?.ready === true).length,
    },
  };
}

async function readInput() {
  const file = process.argv[2];
  return JSON.parse(file ? await readFile(file, 'utf8') : await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = verifyR3PreparationReadback(await readInput());
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.accepted) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`preparation-readback: ${error.message}\n`);
    process.exitCode = 2;
  }
}
