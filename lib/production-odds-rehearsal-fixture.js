import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

export const PRODUCTION_ODDS_REHEARSAL_FIXTURE_CONTRACT =
  "production-odds-step11-rehearsal-fixture-v1";
export const PRODUCTION_ODDS_PAIRING_EVIDENCE_CONTRACT =
  "production-current-pairing-evidence-v1";

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

export function productionOddsPairingEvidenceFromCurrentState(currentState = {}) {
  const entries = Array.isArray(currentState.matches) ? currentState.matches : [];
  const sequence = entries.map((entry = {}) => {
    const match = entry.match || {};
    const snapshot = entry.snapshot || {};
    return {
      match_id: clean(match.match_id),
      round_number: number(match.round_number),
      format: clean(match.format).toUpperCase(),
      status: clean(match.status).toUpperCase(),
      course_id: clean(snapshot.course_id),
      tee: clean(snapshot.tee),
      participants: (Array.isArray(entry.participants) ? entry.participants : [])
        .map((participant = {}) => ({
          player_id: clean(participant.player_id),
          team_side: number(participant.team_side),
          player_slot: number(participant.player_slot),
        }))
        .sort((left, right) => left.team_side - right.team_side ||
          left.player_slot - right.player_slot || left.player_id.localeCompare(right.player_id)),
    };
  }).sort((left, right) => left.round_number - right.round_number ||
    left.match_id.localeCompare(right.match_id));
  const activity = entries.map((entry = {}) => {
    const match = entry.match || {};
    const status = clean(match.status).toUpperCase();
    return {
      match_id: clean(match.match_id),
      status,
      active: !["", "SCHEDULED", "UPCOMING"].includes(status),
      scoring_locked: match.scoring_locked === true,
      scored_holes: number(match.scored_holes),
      score_rows: Array.isArray(entry.scores) ? entry.scores.length : 0,
      finalized: status === "FINAL" || Boolean(match.finalized_at),
    };
  }).sort((left, right) => left.match_id.localeCompare(right.match_id));
  return {
    contractVersion: PRODUCTION_ODDS_PAIRING_EVIDENCE_CONTRACT,
    sequence,
    sequenceFingerprint: scoringShadowPayloadHash(sequence),
    activity,
    activityFingerprint: scoringShadowPayloadHash(activity),
  };
}

function assertedPairingEvidence(inputs = {}, originalMatches = []) {
  const evidence = inputs.metadata?.productionPairingEvidence;
  if (!evidence || typeof evidence !== "object") {
    fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_EVIDENCE_REQUIRED",
      "certified-production-pairing-evidence-required");
  }
  const sequence = Array.isArray(evidence.sequence) ? evidence.sequence : [];
  const activity = Array.isArray(evidence.activity) ? evidence.activity : [];
  const configuredFingerprint = clean(inputs.configuration?.pairing_fingerprint).toLowerCase();
  if (evidence.contractVersion !== PRODUCTION_ODDS_PAIRING_EVIDENCE_CONTRACT ||
      !/^[0-9a-f]{64}$/.test(clean(evidence.sequenceFingerprint).toLowerCase()) ||
      !/^[0-9a-f]{64}$/.test(clean(evidence.activityFingerprint).toLowerCase()) ||
      scoringShadowPayloadHash(sequence) !== clean(evidence.sequenceFingerprint).toLowerCase() ||
      scoringShadowPayloadHash(activity) !== clean(evidence.activityFingerprint).toLowerCase() ||
      configuredFingerprint !== clean(evidence.sequenceFingerprint).toLowerCase() ||
      sequence.length !== originalMatches.length || activity.length !== originalMatches.length) {
    fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_EVIDENCE_MISMATCH",
      "production-pairing-evidence-fingerprint-mismatch");
  }
  const sequenceByMatch = new Map();
  const activityByMatch = new Map();
  for (const row of sequence) {
    const id = clean(row.match_id);
    if (!id || sequenceByMatch.has(id)) {
      fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_EVIDENCE_MISMATCH",
        "unique-production-pairing-evidence-required");
    }
    sequenceByMatch.set(id, row);
  }
  for (const row of activity) {
    const id = clean(row.match_id);
    if (!id || activityByMatch.has(id)) {
      fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_EVIDENCE_MISMATCH",
        "unique-production-pairing-activity-required");
    }
    activityByMatch.set(id, row);
  }
  for (const match of originalMatches) {
    const id = matchId(match);
    const source = sequenceByMatch.get(id);
    const matchActivity = activityByMatch.get(id);
    const participants = [];
    for (const side of [1, 2]) {
      for (const slot of [1, 2]) {
        const idValue = clean(match[participantField(side, slot)]);
        if (idValue) participants.push({ player_id: idValue, team_side: side, player_slot: slot });
      }
    }
    if (!source || !matchActivity || number(source.round_number) !== matchRound(match) ||
        clean(source.format).toUpperCase() !== clean(match.Format || match.format).toUpperCase() ||
        clean(source.status).toUpperCase() !== clean(match["Match Status"]).toUpperCase() ||
        clean(matchActivity.status).toUpperCase() !== clean(source.status).toUpperCase() ||
        !clean(source.course_id) || !clean(source.tee) ||
        scoringShadowPayloadHash(source.participants || []) !== scoringShadowPayloadHash(participants)) {
      fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_EVIDENCE_MISMATCH",
        "runtime-pairings-do-not-match-certified-source-evidence");
    }
  }
  return { evidence, sequenceByMatch, activityByMatch };
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

function completeRoundPairings(roundRows, roster, diagnostics, pairingEvidence) {
  const ordered = [...roundRows].sort((left, right) => matchId(left).localeCompare(matchId(right)));
  if (!ordered.length || ordered.some((row) => !matchId(row))) {
    fail("PRODUCTION_ODDS_REHEARSAL_MATCH_SCOPE_REQUIRED", "stable-production-match-ids-required");
  }
  const slots = roster[1].length / ordered.length;
  if (!Number.isInteger(slots) || ![1, 2].includes(slots)) {
    fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_SHAPE_UNSUPPORTED", "one-or-two-player-match-shape-required");
  }
  if (slots === 1 && ordered.some((row) =>
    clean(row[participantField(1, 2)]) || clean(row[participantField(2, 2)]))) {
    fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_SHAPE_UNSUPPORTED",
      "singles-second-player-slots-forbidden");
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
  if (populated === values.length) {
    for (const side of [1, 2]) {
      const assignments = ordered.flatMap((row) =>
        Array.from({ length: slots }, (_, index) => clean(row[participantField(side, index + 1)])));
      if (!exactRoster(assignments, roster[side])) {
        fail("PRODUCTION_ODDS_REHEARSAL_CANONICAL_PAIRINGS_INVALID", `team-${side}-pairings-do-not-match-roster`);
      }
    }
    diagnostics.canonicalRounds += 1;
    diagnostics.fixedSourceSlots += populated;
    return;
  }

  if (populated > 0) {
    if (!pairingEvidence) {
      fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_EVIDENCE_REQUIRED",
        "partial-production-pairings-require-certified-evidence");
    }
    for (const row of ordered) {
      const activity = pairingEvidence.activityByMatch.get(matchId(row));
      if (!activity || activity.active === true || activity.scoring_locked === true ||
          number(activity.scored_holes) !== 0 || number(activity.score_rows) !== 0 ||
          activity.finalized === true || !["", "SCHEDULED", "UPCOMING"].includes(clean(activity.status).toUpperCase())) {
        fail("PRODUCTION_ODDS_REHEARSAL_PARTIAL_PAIRINGS_ACTIVE",
          "partial-production-pairings-must-be-dormant");
      }
    }
    for (const side of [1, 2]) {
      const fixed = ordered.flatMap((row) => Array.from({ length: slots }, (_, index) =>
        clean(row[participantField(side, index + 1)])).filter(Boolean));
      if (new Set(fixed).size !== fixed.length || fixed.some((id) => !roster[side].includes(id))) {
        fail("PRODUCTION_ODDS_REHEARSAL_PARTIAL_PAIRINGS_INVALID",
          `team-${side}-fixed-pairings-invalid`);
      }
      const available = roster[side].filter((id) => !fixed.includes(id));
      let availableIndex = 0;
      for (const row of ordered) {
        for (let slot = 1; slot <= slots; slot += 1) {
          const field = participantField(side, slot);
          if (!clean(row[field])) {
            row[field] = available[availableIndex];
            availableIndex += 1;
            diagnostics.syntheticSlots += 1;
          }
        }
      }
      const assignments = ordered.flatMap((row) =>
        Array.from({ length: slots }, (_, index) => clean(row[participantField(side, index + 1)])));
      if (availableIndex !== available.length || !exactRoster(assignments, roster[side])) {
        fail("PRODUCTION_ODDS_REHEARSAL_PARTIAL_PAIRINGS_INVALID",
          `team-${side}-completed-pairings-do-not-match-roster`);
      }
    }
    diagnostics.fixedSourceSlots += populated;
    diagnostics.partialRounds += 1;
    diagnostics.syntheticRounds += 1;
    return;
  }

  for (let matchIndex = 0; matchIndex < ordered.length; matchIndex += 1) {
    for (const side of [1, 2]) {
      for (let slot = 1; slot <= slots; slot += 1) {
        ordered[matchIndex][participantField(side, slot)] =
          roster[side][matchIndex * slots + slot - 1];
        diagnostics.syntheticSlots += 1;
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
 * publications, mirrors, or Google. Certified dormant partial pairings keep
 * every supplied slot fixed and synthesize only their missing calculation slots.
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
  for (const rows of roundMap.values()) {
    const formats = [...new Set(rows.map((row) =>
      clean(row.Format || row.format).toUpperCase()))];
    const expectedSlots = formats[0] === "SI" ? 1
      : ["BB", "SC"].includes(formats[0]) ? 2 : 0;
    const slots = roster[1].length / rows.length;
    if (formats.length !== 1 || expectedSlots === 0 || slots !== expectedSlots ||
        !Number.isInteger(slots) || ![1, 2].includes(slots) ||
        (slots === 1 && rows.some((row) =>
          clean(row[participantField(1, 2)]) || clean(row[participantField(2, 2)])))) {
      fail("PRODUCTION_ODDS_REHEARSAL_PAIRING_SHAPE_UNSUPPORTED",
        "one-or-two-player-match-shape-required");
    }
  }
  const hasPartialPairings = [...roundMap.values()].some((rows) => {
    const slots = roster[1].length / rows.length;
    if (!Number.isInteger(slots) || ![1, 2].includes(slots)) return true;
    const populated = rows.flatMap((row) => [1, 2].flatMap((side) => [1, 2]
      .slice(0, slots).map((slot) => clean(row[participantField(side, slot)])))).filter(Boolean).length;
    const total = rows.length * 2 * slots;
    return populated > 0 && populated < total;
  });
  const pairingEvidence = hasPartialPairings
    ? assertedPairingEvidence(inputs, originalMatches)
    : null;
  const diagnostics = {
    canonicalRounds: 0,
    syntheticRounds: 0,
    partialRounds: 0,
    fixedSourceSlots: 0,
    syntheticSlots: 0,
  };
  for (const rows of roundMap.values()) {
    completeRoundPairings(rows, roster, diagnostics, pairingEvidence);
  }

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
    pairingMode: diagnostics.partialRounds > 0
      ? "SYNTHETIC_MISSING_PAIRINGS_WITH_FIXED_SOURCE_SLOTS"
      : diagnostics.syntheticRounds > 0 ? "SYNTHETIC_PENDING_PAIRINGS"
      : "CANONICAL_COMPLETE_PAIRINGS_COPY",
    canonicalPairingFingerprint: clean(inputs.configuration?.pairing_fingerprint ||
      inputs.metadata?.pairingFingerprint),
    canonicalEnginePairingFingerprint,
    rehearsalEnginePairingFingerprint,
    rosterFingerprint: scoringShadowPayloadHash(roster),
    canonicalPairingEvidenceContract: pairingEvidence?.evidence?.contractVersion || "",
    canonicalPairingEvidenceFingerprint:
      pairingEvidence?.evidence?.sequenceFingerprint || "",
    canonicalPairingActivityFingerprint:
      pairingEvidence?.evidence?.activityFingerprint || "",
    fixedSourceSlots: diagnostics.fixedSourceSlots,
    syntheticSlots: diagnostics.syntheticSlots,
    partialRounds: diagnostics.partialRounds,
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
