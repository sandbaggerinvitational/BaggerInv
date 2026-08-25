import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

export const PRODUCTION_ODDS_REHEARSAL_FIXTURE_CONTRACT =
  "production-odds-step11-rehearsal-fixture-v1";

const clean = (value) => String(value ?? "").trim();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clone = (value) => JSON.parse(JSON.stringify(value));

function fail(code, reason) {
  const error = new Error(`Production Odds rehearsal fixture is unavailable (${reason}).`);
  error.code = code;
  error.status = 503;
  error.reason = reason;
  throw error;
}

function playerId(row = {}) {
  return clean(row["Player ID"] || row.player_id || row.id);
}

function teamSide(row = {}) {
  const raw = clean(row["Team Side"] || row.team_side || row.side);
  const parsed = Number(raw.replace(/\D/g, ""));
  return parsed === 1 || parsed === 2 ? parsed : 0;
}

function matchId(row = {}) {
  return clean(row["Match ID"] || row.match_id || row.id);
}

function matchRound(row = {}) {
  return number(clean(row.Round || row.round_number).replace(/\D/g, ""));
}

function participantField(side, slot) {
  return `Team ${side} Player ${slot}`;
}

function pairingProjection(rows = []) {
  return [...rows]
    .map((row) => ({
      matchId: matchId(row),
      round: matchRound(row),
      format: clean(row.Format || row.format).toUpperCase(),
      course: clean(row.Course || row.course),
      tee: clean(row.Tee || row.tee),
      team1: [1, 2].map((slot) => clean(row[participantField(1, slot)])).filter(Boolean),
      team2: [1, 2].map((slot) => clean(row[participantField(2, slot)])).filter(Boolean),
    }))
    .sort((left, right) => left.round - right.round || left.matchId.localeCompare(right.matchId));
}

function rosterBySide(sheets = {}) {
  const roster = { 1: [], 2: [] };
  for (const row of sheets.handicaps || []) {
    const id = playerId(row);
    const side = teamSide(row);
    if (id && side) roster[side].push(id);
  }
  for (const side of [1, 2]) {
    roster[side] = [...new Set(roster[side])].sort((left, right) => left.localeCompare(right));
    if (!roster[side].length) {
      fail("PRODUCTION_ODDS_REHEARSAL_ROSTER_REQUIRED", `team-${side}-roster-required`);
    }
  }
  if (roster[1].length !== roster[2].length) {
    fail("PRODUCTION_ODDS_REHEARSAL_ROSTER_MISMATCH", "balanced-production-rosters-required");
  }
  return roster;
}

function exactRoster(assignments, roster) {
  return assignments.length === roster.length &&
    [...assignments].sort((left, right) => left.localeCompare(right)).join("\n") === roster.join("\n");
}

function completeRoundPairings(roundRows, roster, diagnostics) {
  const ordered = [...roundRows].sort((left, right) => matchId(left).localeCompare(matchId(right)));
  if (!ordered.length || ordered.some((row) => !matchId(row))) {
    fail("PRODUCTION_ODDS_REHEARSAL_MATCH_SCOPE_REQUIRED", "stable-production-match-ids-required");
  }
  const slots = roster[1].length / ordered.length;
  if (!Number.isInteger(slots) || ![1, 2].includes(slots)) {
    fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_SHAPE_UNSUPPORTED", "one-or-two-player-match-shape-required");
  }

  const values = [];
  for (const row of ordered) {
    for (const side of [1, 2]) {
      for (let slot = 1; slot <= slots; slot += 1) {
        values.push(clean(row[participantField(side, slot)]));
      }
    }
  }
  const populated = values.filter(Boolean).length;
  if (populated !== 0 && populated !== values.length) {
    fail("PRODUCTION_ODDS_REHEARSAL_PARTIAL_PAIRINGS_UNSUPPORTED", "partial-production-pairings-must-fail-closed");
  }

  if (populated === values.length) {
    for (const side of [1, 2]) {
      const assignments = ordered.flatMap((row) =>
        Array.from({ length: slots }, (_, index) => clean(row[participantField(side, index + 1)])));
      if (!exactRoster(assignments, roster[side])) {
        fail("PRODUCTION_ODDS_REHEARSAL_CANONICAL_PAIRINGS_INVALID", `team-${side}-pairings-do-not-match-roster`);
      }
    }
    diagnostics.canonicalRounds += 1;
    return;
  }

  for (let matchIndex = 0; matchIndex < ordered.length; matchIndex += 1) {
    for (const side of [1, 2]) {
      for (let slot = 1; slot <= slots; slot += 1) {
        ordered[matchIndex][participantField(side, slot)] =
          roster[side][matchIndex * slots + slot - 1];
      }
    }
  }
  diagnostics.syntheticRounds += 1;
}

function fixtureScope(scope = {}) {
  if (clean(scope.operation_mode) !== "STEP11_REHEARSAL" ||
      clean(scope.environment).toUpperCase() !== "PRODUCTION" ||
      clean(scope.tournament_id) !== PRODUCTION_TOURNAMENT_ID ||
      clean(scope.source_workbook_id) !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      !/^[0-9a-f]{40}$/.test(clean(scope.deployment_commit).toLowerCase()) ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(clean(scope.candidate_hostname).toLowerCase())) {
    fail("PRODUCTION_ODDS_REHEARSAL_EXACT_SCOPE_REQUIRED", "exact-step11-candidate-scope-required");
  }
  return {
    candidateSha: clean(scope.deployment_commit).toLowerCase(),
    candidateHostname: clean(scope.candidate_hostname).toLowerCase(),
  };
}

/**
 * Build a calculation-only pairing fixture from Production roster/match facts.
 * This function is deliberately pure: it cannot write pairings, scoring,
 * publications, mirrors, or Google. Partial official pairings fail closed.
 */
export function buildProductionOddsRehearsalInputs(inputs = {}, { scope } = {}) {
  const exact = fixtureScope(scope);
  const prepared = clone(inputs);
  const originalMatches = clone(prepared.sheets?.matches || []);
  if (!originalMatches.length) {
    fail("PRODUCTION_ODDS_REHEARSAL_MATCHES_REQUIRED", "production-match-structure-required");
  }
  const tournamentId = clean(prepared.sheets?.tournaments?.[0]?.["Tournament ID"] ||
    prepared.sheets?.tournaments?.[0]?.Year);
  if (tournamentId !== PRODUCTION_TOURNAMENT_ID) {
    fail("PRODUCTION_ODDS_REHEARSAL_TOURNAMENT_REQUIRED", "exact-production-tournament-required");
  }

  const roster = rosterBySide(prepared.sheets || {});
  const roundMap = new Map();
  for (const row of prepared.sheets.matches || []) {
    const round = matchRound(row);
    if (!round) fail("PRODUCTION_ODDS_REHEARSAL_ROUND_REQUIRED", "positive-production-round-required");
    if (!roundMap.has(round)) roundMap.set(round, []);
    roundMap.get(round).push(row);
  }
  const diagnostics = { canonicalRounds: 0, syntheticRounds: 0 };
  for (const rows of roundMap.values()) completeRoundPairings(rows, roster, diagnostics);

  const canonicalEnginePairingFingerprint = scoringShadowPayloadHash(pairingProjection(originalMatches));
  const rehearsalEnginePairingFingerprint = scoringShadowPayloadHash(
    pairingProjection(prepared.sheets.matches),
  );
  const fixturePayload = {
    contractVersion: PRODUCTION_ODDS_REHEARSAL_FIXTURE_CONTRACT,
    namespace: `STEP11_ODDS_${exact.candidateSha}_${rehearsalEnginePairingFingerprint.slice(0, 16)}`,
    candidateSha: exact.candidateSha,
    candidateHostname: exact.candidateHostname,
    tournamentId: PRODUCTION_TOURNAMENT_ID,
    sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    pairingMode: diagnostics.syntheticRounds > 0
      ? "SYNTHETIC_PENDING_PAIRINGS"
      : "CANONICAL_COMPLETE_PAIRINGS_COPY",
    canonicalPairingFingerprint: clean(inputs.configuration?.pairing_fingerprint ||
      inputs.metadata?.pairingFingerprint),
    canonicalEnginePairingFingerprint,
    rehearsalEnginePairingFingerprint,
    rosterFingerprint: scoringShadowPayloadHash(roster),
    canonicalPairingsMutated: false,
    databasePairingWrites: 0,
    externalGoogleWrites: 0,
    publicationEligible: false,
    mirrorEligible: false,
  };
  const fixtureFingerprint = scoringShadowPayloadHash(fixturePayload);
  prepared.metadata = {
    ...(prepared.metadata || {}),
    canonicalPairingFingerprint: clean(inputs.metadata?.pairingFingerprint),
    pairingFingerprint: rehearsalEnginePairingFingerprint,
    productionRehearsalFixture: { ...fixturePayload, fixtureFingerprint },
  };
  return prepared;
}

export function productionOddsRehearsalFixtureEvidence(inputSnapshot = {}, scope = {}) {
  const fixture = inputSnapshot?.metadata?.productionRehearsalFixture;
  if (!fixture || typeof fixture !== "object") {
    fail("PRODUCTION_ODDS_REHEARSAL_FIXTURE_REQUIRED", "rehearsal-fixture-required");
  }
  const { fixtureFingerprint, ...payload } = fixture;
  const fingerprint = clean(fixtureFingerprint).toLowerCase();
  const exact = fixtureScope(scope);
  if (fixture.contractVersion !== PRODUCTION_ODDS_REHEARSAL_FIXTURE_CONTRACT ||
      fixture.candidateSha !== exact.candidateSha ||
      fixture.candidateHostname !== exact.candidateHostname ||
      fixture.tournamentId !== PRODUCTION_TOURNAMENT_ID ||
      fixture.sourceWorkbookId !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      fixture.canonicalPairingsMutated !== false ||
      Number(fixture.databasePairingWrites) !== 0 ||
      Number(fixture.externalGoogleWrites) !== 0 ||
      fixture.publicationEligible !== false || fixture.mirrorEligible !== false ||
      !/^[0-9a-f]{64}$/.test(fingerprint) ||
      scoringShadowPayloadHash(payload) !== fingerprint) {
    fail("PRODUCTION_ODDS_REHEARSAL_FIXTURE_INVALID", "rehearsal-fixture-evidence-mismatch");
  }
  return Object.freeze({
    contract: fixture.contractVersion,
    fingerprint,
    namespace: clean(fixture.namespace),
    canonicalPairingFingerprint: clean(fixture.canonicalPairingFingerprint),
    rehearsalPairingFingerprint: clean(fixture.rehearsalEnginePairingFingerprint),
  });
}
