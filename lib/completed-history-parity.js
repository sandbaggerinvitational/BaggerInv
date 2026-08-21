import {
  completedHistoryFingerprint,
  completedHistoryImportEnvelope,
} from "./completed-history-contract.js";

function project(actual, expected) {
  if (Array.isArray(expected)) return Array.isArray(actual) ? actual.map((item, index) => project(item, expected[index])) : actual;
  if (expected && typeof expected === "object") {
    return Object.fromEntries(Object.keys(expected).map((key) => [key, project(actual?.[key], expected[key])]));
  }
  return actual ?? null;
}

function keyed(rows, key) {
  return new Map((rows || []).map((row) => [key(row), row]));
}

function compareArray(expectedRows, actualRows, key) {
  const actualByKey = keyed(actualRows, key);
  const normalizedExpected = [...expectedRows].sort((left, right) => key(left).localeCompare(key(right)));
  const normalizedActual = normalizedExpected.map((expected) => project(actualByKey.get(key(expected)), expected));
  const expectedFingerprint = completedHistoryFingerprint(normalizedExpected);
  const actualFingerprint = completedHistoryFingerprint(normalizedActual);
  return {
    pass: expectedRows.length === (actualRows || []).length && expectedFingerprint === actualFingerprint,
    expectedCount: expectedRows.length,
    actualCount: (actualRows || []).length,
    expectedFingerprint,
    actualFingerprint,
  };
}

export function compareCompletedHistoryYearRead(canonical = {}, readResult = {}) {
  const expected = completedHistoryImportEnvelope(canonical, {
    authorization: {
      authorized: true,
      scope: "COMPLETED_HISTORY_IMPORT",
      actor_id: canonical.requested_by,
      authorization_id: "parity-only",
      authorized_at: "2000-01-01T00:00:00.000Z",
    },
  }).payload;
  const actual = readResult?.data || readResult;
  const expectedPlayers = expected.players.map((row) => ({
    player_id: row.player_id,
    display_name: row.display_name,
  }));
  const expectedCourses = expected.courses.map((row) => ({
    course_id: row.course_id,
    canonical_name: row.canonical_name,
    canonical_location: row.canonical_location,
  }));
  const expectedRevision = {
    tournament_id: String(canonical.source_year),
    tournament_year: Number(canonical.source_year),
    source_workbook_id: canonical.source_workbook_id,
    source_fingerprint: canonical.source_fingerprint,
    payload_fingerprint: canonical.payload_fingerprint,
    import_contract_version: canonical.contract_version,
    correction_set_version: canonical.correction_set_version,
    importer_version: canonical.importer_version,
    source_counts: canonical.counts,
  };
  const sectionResults = {
    revision: (() => {
      const actualValue = project(actual?.revision, expectedRevision);
      const expectedFingerprint = completedHistoryFingerprint(expectedRevision);
      const actualFingerprint = completedHistoryFingerprint(actualValue);
      const databasePayloadFingerprint = String(actual?.revision?.database_payload_fingerprint || "");
      const pass = expectedFingerprint === actualFingerprint &&
        /^[0-9a-f]{64}$/.test(databasePayloadFingerprint) &&
        Number(actual?.revision?.revision_number) > 0 &&
        ["INITIAL_IMPORT", "CORRECTION"].includes(actual?.revision?.operation);
      return {
        pass,
        expectedFingerprint,
        actualFingerprint,
        databasePayloadFingerprint,
        revisionNumber: Number(actual?.revision?.revision_number || 0),
        operation: actual?.revision?.operation || null,
      };
    })(),
    tournament: (() => {
      const expectedValue = expected.tournament;
      const actualValue = project(actual?.tournament, expectedValue);
      const expectedFingerprint = completedHistoryFingerprint(expectedValue);
      const actualFingerprint = completedHistoryFingerprint(actualValue);
      return { pass: expectedFingerprint === actualFingerprint, expectedFingerprint, actualFingerprint };
    })(),
    players: compareArray(expectedPlayers, actual?.players, (row) => String(row.player_id)),
    teams: compareArray(expected.teams, actual?.teams, (row) => String(row.team_id)),
    roster: compareArray(expected.roster, actual?.roster, (row) => String(row.player_id)),
    rounds: compareArray(expected.rounds, actual?.rounds, (row) => String(row.round_number).padStart(2, "0")),
    courses: compareArray(expectedCourses, actual?.courses, (row) => String(row.course_id)),
    courseAppearances: compareArray(expected.course_appearances, actual?.course_appearances, (row) => String(row.appearance_id)),
    matches: compareArray(expected.matches, actual?.matches, (row) => String(row.match_id)),
    matchParticipants: compareArray(expected.match_participants, actual?.match_participants, (row) => `${row.match_id}|${row.team_side}|${row.player_slot}`),
    scorecards: compareArray(expected.scorecards, actual?.scorecards, (row) => String(row.scorecard_id)),
    awards: compareArray(expected.awards, actual?.awards, (row) => String(row.award_id)),
    recordEligibility: compareArray(expected.record_eligibility, actual?.record_eligibility, (row) => `${row.match_id}|${row.player_id}`),
    corrections: compareArray(expected.corrections, actual?.corrections, (row) => String(row.correction_id)),
  };
  const differences = Object.entries(sectionResults).filter(([, result]) => !result.pass).map(([section]) => section);
  return {
    pass: differences.length === 0,
    year: Number(canonical.source_year),
    sourceFingerprint: canonical.source_fingerprint,
    payloadFingerprint: canonical.payload_fingerprint,
    differences,
    sections: sectionResults,
  };
}
