import { buildGameCenterPresentationImport } from "./game-center-supabase.js";
import { buildParticipantHomePresentationImport } from "./participant-home-supabase.js";
import {
  productionCurrentShadowSourceFingerprint,
} from "./production-shadow-payload-preparation.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import { canonicalJson, scoringShadowPayloadHash } from "./scoring-shadow.js";
import { normalizeTournamentTimeline } from "./tournament-timeline.js";

export const PRODUCTION_PRESENTATION_SHADOW_CONTRACT =
  "production-presentation-shadow-v1";
export const PRODUCTION_PRESENTATION_SHADOW_OPERATION =
  "PRODUCTION_PRESENTATION_SHADOW_IMPORT";
export const PRODUCTION_PRESENTATION_SHADOW_RPC =
  "import_production_presentation_shadow_v1";

export const PRODUCTION_PRESENTATION_SOURCE_TABS = Object.freeze([
  "Tournaments",
  "Live Tournaments",
  "Players",
  "Handicaps",
  "Team Names",
  "Courses",
  "Live Matches",
  "Matches",
  "Tournament Timeline",
  "Net Skins",
  "Calcutta Purchases",
  "Calcutta Ownership",
  "Calcutta Point Structure",
  "Calcutta Payout",
]);

const PREVIEW_PROJECT_REF = "idgigvjjqkfbqjeredpb";
const PREVIEW_WORKBOOK_ID = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const clean = (value) => String(value ?? "").trim();
const integer = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Math.trunc(Number(value))
  : fallback;
const numeric = (value, fallback = null) => Number.isFinite(Number(value))
  ? Number(value)
  : fallback;
const truthy = (value) => value === true || /^(?:true|yes|1|active|open)$/i.test(clean(value));

function canonicalTimestamp(value) {
  const source = clean(value);
  if (!source) return "";
  const parsed = new Date(source);
  if (!Number.isFinite(parsed.getTime())) {
    fail(
      "PRODUCTION_PRESENTATION_SOURCE_TIMESTAMP_INVALID",
      "Production presentation source timestamps must be valid ISO-compatible values.",
    );
  }
  return parsed.toISOString();
}

function fail(code, message, diagnostics) {
  const error = new Error(message);
  error.code = code;
  if (diagnostics !== undefined) error.diagnostics = diagnostics;
  throw error;
}

function records(source = {}, tab = "") {
  return (source?.[tab]?.records || []).map((entry) => entry?.record || entry || {});
}

function structured(headers = [], rows = []) {
  return {
    headers: Array.isArray(headers) ? headers.map(clean) : [],
    records: rows.map((record) => ({ record })),
  };
}

function currentRows(source, tab) {
  if (tab === "Players") return records(source, tab);
  return records(source, tab).filter((row) =>
    integer(row.Year || row["Tournament ID"]) === PRODUCTION_TOURNAMENT_YEAR
      || clean(row["Tournament ID"]) === PRODUCTION_TOURNAMENT_ID
  );
}

function sourceSheet(source, tab, rows) {
  return {
    sheet: tab,
    headers: Array.isArray(source?.[tab]?.headers) ? source[tab].headers.map(clean) : [],
    records: rows,
  };
}

function sourceForTab(currentSource, projectionSource, tab) {
  if (currentSource?.[tab]) return currentSource;
  if (projectionSource?.[tab]) return projectionSource;
  return {};
}

function currentSourceRows(currentSource, projectionSource, tab) {
  return currentRows(sourceForTab(currentSource, projectionSource, tab), tab);
}

function canonicalPresentationSource(currentSource, projectionSource, currentShadowEvidence) {
  return {
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    current_shadow: {
      import_run_id: clean(currentShadowEvidence.importRunId),
      source_fingerprint: clean(currentShadowEvidence.sourceFingerprint).toLowerCase(),
      database_fingerprint: clean(currentShadowEvidence.databaseFingerprint).toLowerCase(),
    },
    sheets: PRODUCTION_PRESENTATION_SOURCE_TABS.map((tab) => {
      const source = sourceForTab(currentSource, projectionSource, tab);
      return sourceSheet(source, tab, currentRows(source, tab));
    }),
  };
}

function assertExactResources(resource = {}) {
  if (clean(resource.projectRef || PRODUCTION_SUPABASE_PROJECT_REF) !== PRODUCTION_SUPABASE_PROJECT_REF
      || clean(resource.projectUrl || PRODUCTION_SUPABASE_URL) !== PRODUCTION_SUPABASE_URL
      || clean(resource.workbookId || PRODUCTION_GOOGLE_WORKBOOK_ID) !== PRODUCTION_GOOGLE_WORKBOOK_ID
      || clean(resource.tournamentId || PRODUCTION_TOURNAMENT_ID) !== PRODUCTION_TOURNAMENT_ID
      || Number(resource.tournamentYear || PRODUCTION_TOURNAMENT_YEAR) !== PRODUCTION_TOURNAMENT_YEAR) {
    fail(
      "PRODUCTION_PRESENTATION_EXACT_RESOURCE_REQUIRED",
      "Presentation preparation requires the exact dormant Production resources.",
    );
  }
}

function assertNoPreview(value) {
  const serialized = JSON.stringify(value);
  if (serialized.includes(PREVIEW_PROJECT_REF) || serialized.includes(PREVIEW_WORKBOOK_ID)) {
    fail(
      "PREVIEW_RESOURCE_CONTAMINATION",
      "Production presentation input contains a Preview resource identity.",
    );
  }
}

function assertCurrentShadowEvidence(currentSource, evidence = {}) {
  const freshSourceFingerprint = productionCurrentShadowSourceFingerprint(currentSource);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(evidence.importRunId))
      || !/^[0-9a-f]{64}$/i.test(clean(evidence.sourceFingerprint))
      || !/^[0-9a-f]{64}$/i.test(clean(evidence.databaseFingerprint))) {
    fail(
      "PRODUCTION_PRESENTATION_CURRENT_SHADOW_EVIDENCE_REQUIRED",
      "A certified current-shadow import run and fingerprints are required.",
    );
  }
  if (freshSourceFingerprint !== clean(evidence.sourceFingerprint).toLowerCase()) {
    fail(
      "PRODUCTION_PRESENTATION_CURRENT_SOURCE_CHANGED",
      "Production Google changed after the certified current-shadow import.",
      { fresh_source_fingerprint: freshSourceFingerprint, expected_source_fingerprint: clean(evidence.sourceFingerprint).toLowerCase() },
    );
  }
  return freshSourceFingerprint;
}

function playerView(playerId, playerById, captains) {
  const id = clean(playerId);
  if (!id) return null;
  const row = playerById.get(id) || {};
  return {
    id,
    name: clean(row["Display Name"] || `${clean(row.First)} ${clean(row.Last)}`) || id,
    slug: clean(row.Slug),
    photo: clean(row["Photo Filename"]),
    captain: captains.has(id),
  };
}

function productionHomeLiveData({ currentSource, projectionSource, gameRows }) {
  const tournaments = currentSourceRows(currentSource, projectionSource, "Tournaments");
  const liveTournaments = currentSourceRows(currentSource, projectionSource, "Live Tournaments");
  const players = currentSourceRows(currentSource, projectionSource, "Players");
  const handicaps = currentSourceRows(currentSource, projectionSource, "Handicaps");
  const teamRows = currentSourceRows(currentSource, projectionSource, "Team Names");
  const liveMatches = currentSourceRows(currentSource, projectionSource, "Live Matches");
  const archivedMatches = currentSourceRows(currentSource, projectionSource, "Matches");
  const timelineRows = currentSourceRows(currentSource, projectionSource, "Tournament Timeline");
  const currentNetSkins = currentSourceRows(currentSource, projectionSource, "Net Skins");
  const currentCalcutta = [
    "Calcutta Purchases", "Calcutta Ownership", "Calcutta Point Structure", "Calcutta Payout",
  ].flatMap((tab) => currentSourceRows(currentSource, projectionSource, tab));

  if (currentNetSkins.length || currentCalcutta.length) {
    fail(
      "PRODUCTION_PRESENTATION_CONFIGURED_MODULE_DERIVATION_REQUIRED",
      "Configured Net Skins or Calcutta presentation requires its separately certified derived-state contract.",
      { net_skins_rows: currentNetSkins.length, calcutta_rows: currentCalcutta.length },
    );
  }

  const tournamentRow = tournaments[0] || {};
  const liveTournament = liveTournaments[0] || {};
  const playerById = new Map(players.map((row) => [clean(row["Player ID"]), row]));
  const rosterIds = [...new Set(handicaps.map((row) => clean(row["Player ID"])).filter(Boolean))];
  if (rosterIds.length !== 24 || rosterIds.some((playerId) => !playerById.has(playerId))) {
    fail(
      "PRODUCTION_PRESENTATION_ROSTER_REQUIRED",
      "Production Home presentation requires the complete 24-player Production roster.",
      { roster_count: rosterIds.length, unresolved_player_ids: rosterIds.filter((playerId) => !playerById.has(playerId)) },
    );
  }
  const captains = new Set(teamRows.flatMap((row) => [clean(row.Captain), clean(row["Captain Player ID"])]).filter(Boolean));
  const playerRows = rosterIds.map((playerId) => playerView(playerId, playerById, captains));
  const archiveById = new Map(archivedMatches.map((row) => [clean(row["Match ID"]), row]));
  const gameById = new Map(gameRows.map((row) => [row.match_id, row]));
  const rounds = [...new Set(liveMatches.map((row) => integer(row.Round)).filter(Boolean))]
    .sort((left, right) => left - right)
    .map((roundNumber) => ({
      number: roundNumber,
      matches: liveMatches
        .filter((row) => integer(row.Round) === roundNumber)
        .sort((left, right) => integer(left.Match) - integer(right.Match))
        .map((row) => {
          const matchId = clean(row["Match ID"]);
          const archive = archiveById.get(matchId) || {};
          const final = /^final/i.test(clean(row["Match Status"] || archive["Match Status"]))
            || Boolean(clean(row["Finalized At"] || archive["Finalized At"] || archive["Final Result"]));
          const playersFor = (side) => [1, 2]
            .map((slot) => playerView(row[`Team ${side} Player ${slot}`], playerById, captains))
            .filter(Boolean);
          return {
            id: matchId,
            team1Players: playersFor(1),
            team2Players: playersFor(2),
            team1PlayingHcp: numeric(row["Team 1 Playing HCP"] ?? row["Team 1 Playing Handicap"]),
            team2PlayingHcp: numeric(row["Team 2 Playing HCP"] ?? row["Team 2 Playing Handicap"]),
            team1Stroke: numeric(row["Team 1 Stroke"] ?? row["Team 1 Strokes"]),
            team2Stroke: numeric(row["Team 2 Stroke"] ?? row["Team 2 Strokes"]),
            currentHole: integer(row["Current Hole"]),
            archiveFinal: final,
            course: { id: clean(row["Course ID"]), name: clean(gameById.get(matchId)?.course_name) },
          };
        }),
    }));
  const status = clean(liveTournament["Tournament Status"] || tournamentRow["Tournament Status"] || "Upcoming");
  const timeZone = clean(tournamentRow["Time Zone"] || "America/Chicago");
  const sourceNow = new Date(clean(liveTournament["Last Updated"] || tournamentRow["Updated At"]) || "2026-01-01T00:00:00.000Z");
  const timeline = normalizeTournamentTimeline({
    rows: timelineRows,
    activeYear: PRODUCTION_TOURNAMENT_YEAR,
    tournamentStatus: status,
    timeZone,
    rounds,
    sheetState: timelineRows.length ? "ready" : "empty",
    now: Number.isFinite(sourceNow.getTime()) ? sourceNow : new Date("2026-01-01T00:00:00.000Z"),
    previewEnabled: false,
  });
  return {
    tournament: {
      id: PRODUCTION_TOURNAMENT_ID,
      year: PRODUCTION_TOURNAMENT_YEAR,
      name: clean(tournamentRow["Tournament Name"] || "Sandbagger Invitational"),
      location: clean(tournamentRow.Destination || tournamentRow.Location),
      logo: clean(tournamentRow["Tournament Logo Filename"] || tournamentRow["Logo Filename"]),
      status,
      configuredStatus: status,
      statusMode: clean(tournamentRow["Status Mode"] || "Automatic"),
      currentRound: integer(liveTournament["Current Round"] || tournamentRow["Current Round"], 1),
      startDate: clean(tournamentRow["Start Date"]),
      startTime: clean(tournamentRow["Start Time"]),
      timeZone,
      edition: clean(tournamentRow["Tournament Edition"] || tournamentRow.Annual),
      dates: clean(tournamentRow.Dates),
      liveMessage: clean(liveTournament["Live Message"]),
      lastUpdated: clean(liveTournament["Last Updated"] || tournamentRow["Updated At"]),
      tieAdvantageSide: null,
    },
    timeline,
    rounds,
    players: playerRows,
    netSkins: { rounds: [] },
    calcutta: null,
  };
}

function productionGamePresentation(currentSource) {
  const sheets = {};
  for (const tab of ["Live Matches", "Tournaments", "Team Names", "Courses"]) {
    sheets[tab] = structured(currentSource?.[tab]?.headers, currentRows(currentSource, tab));
  }
  const result = buildGameCenterPresentationImport({
    sheets,
    sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    requestedBy: "step10b-production-presentation-shadow",
  });
  const sourceMatches = currentRows(currentSource, "Live Matches");
  const matchById = new Map(sourceMatches
    .map((row) => [clean(row["Match ID"]), row]));
  const ordinalById = new Map();
  const roundMatchOrder = {};
  for (const roundNumber of [...new Set(sourceMatches.map((row) => integer(row.Round)).filter(Boolean))].sort((left, right) => left - right)) {
    const ordered = sourceMatches
      .filter((row) => integer(row.Round) === roundNumber)
      .sort((left, right) => integer(left.Match) - integer(right.Match)
        || clean(left["Match ID"]).localeCompare(clean(right["Match ID"])));
    const sourceMatchNumbers = ordered.map((row) => integer(row.Match));
    if (sourceMatchNumbers.some((value) => !value)
        || new Set(sourceMatchNumbers).size !== ordered.length) {
      fail(
        "PRODUCTION_PRESENTATION_NUMERIC_MATCH_ORDER_REQUIRED",
        `Round ${roundNumber} requires unique numeric Production Match values.`,
      );
    }
    ordered.forEach((row, index) => ordinalById.set(clean(row["Match ID"]), index + 1));
    roundMatchOrder[String(roundNumber)] = ordered.map((_, index) => index + 1);
  }
  const rows = result.rows.map((row) => {
    const match = matchById.get(row.match_id) || {};
    const matchNumber = ordinalById.get(row.match_id) || 0;
    if (!matchNumber) {
      fail(
        "PRODUCTION_PRESENTATION_NUMERIC_MATCH_ORDER_REQUIRED",
        `Match ${row.match_id || "(missing)"} requires a per-round numeric Production ordinal.`,
      );
    }
    if (!clean(row.course_name)) {
      fail(
        "PRODUCTION_PRESENTATION_COURSE_NAME_REQUIRED",
        `Match ${row.match_id} requires its Production Google course name.`,
      );
    }
    return {
      ...row,
      display_match_number: String(matchNumber),
      match_sort_order: matchNumber,
      source_updated_at: canonicalTimestamp(row.source_updated_at),
    };
  }).sort((left, right) => {
    const leftMatch = matchById.get(left.match_id) || {};
    const rightMatch = matchById.get(right.match_id) || {};
    return integer(leftMatch.Round) - integer(rightMatch.Round)
      || left.match_sort_order - right.match_sort_order
      || left.match_id.localeCompare(right.match_id);
  });
  if (rows.length !== 24 || new Set(rows.map((row) => row.match_id)).size !== 24) {
    fail(
      "PRODUCTION_PRESENTATION_COMPLETE_MATCH_SET_REQUIRED",
      "Production presentation requires all 24 Production matches exactly once.",
      { rows: rows.length, distinct_matches: new Set(rows.map((row) => row.match_id)).size },
    );
  }
  return { rows, roundMatchOrder };
}

export function prepareProductionPresentationShadowImport({
  currentSource = {},
  projectionSource = {},
  currentShadowEvidence = {},
  actor = "step10b-production-presentation-shadow",
  resource = {},
} = {}) {
  assertExactResources(resource);
  if (!clean(actor)) {
    fail("PRODUCTION_PRESENTATION_ACTOR_REQUIRED", "Production presentation import actor is required.");
  }
  assertCurrentShadowEvidence(currentSource, currentShadowEvidence);
  const gamePresentation = productionGamePresentation(currentSource);
  const gameCenterRows = gamePresentation.rows;
  const homeLiveData = productionHomeLiveData({ currentSource, projectionSource, gameRows: gameCenterRows });
  const home = buildParticipantHomePresentationImport({
    liveData: homeLiveData,
    sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    requestedBy: clean(actor),
  });
  const payload = {
    game_center_rows: gameCenterRows,
    participant_home_presentation: home.presentation,
  };
  const sourcePayload = canonicalPresentationSource(currentSource, projectionSource, currentShadowEvidence);
  const sourceCanonicalJson = canonicalJson(sourcePayload);
  const payloadCanonicalJson = canonicalJson(payload);
  const sourceFingerprint = scoringShadowPayloadHash(sourcePayload);
  const payloadFingerprint = scoringShadowPayloadHash(payload);
  const request = {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    operation: PRODUCTION_PRESENTATION_SHADOW_OPERATION,
    contract_version: PRODUCTION_PRESENTATION_SHADOW_CONTRACT,
    requested_by: clean(actor),
    current_shadow_import_run_id: clean(currentShadowEvidence.importRunId),
    current_shadow_source_fingerprint: clean(currentShadowEvidence.sourceFingerprint).toLowerCase(),
    current_shadow_database_fingerprint: clean(currentShadowEvidence.databaseFingerprint).toLowerCase(),
    source_fingerprint: sourceFingerprint,
    payload_fingerprint: payloadFingerprint,
  };
  const input = {
    ...request,
    source_tabs: [...PRODUCTION_PRESENTATION_SOURCE_TABS],
    request_fingerprint: scoringShadowPayloadHash(request),
    request_canonical_json: canonicalJson(request),
    source_fingerprint: sourceFingerprint,
    payload_fingerprint: payloadFingerprint,
    source_canonical_json: sourceCanonicalJson,
    payload_canonical_json: payloadCanonicalJson,
    source_payload: sourcePayload,
    payload,
    safety: {
      shadow_only: true,
      authoritative: false,
      scoring_authority: "GOOGLE",
      participant_identity_authority: "PASSPORT",
      scoring_ingress_enabled: false,
      public_reads_enabled: false,
      workers_enabled: false,
      google_reads: true,
      google_writes: 0,
      outbox_events: 0,
      archive_jobs: 0,
      mirror_jobs: 0,
    },
  };
  assertNoPreview(input);
  return {
    rpc: PRODUCTION_PRESENTATION_SHADOW_RPC,
    input,
    diagnostics: {
      game_center_rows: gameCenterRows.length,
      round_match_order: gamePresentation.roundMatchOrder,
      course_names: [...new Set(gameCenterRows.map((row) => row.course_name))],
      home_roster_players: Object.keys(home.presentation.leaderboardsPlayers || {}).length,
      timeline_events: home.presentation.timeline?.events?.length || 0,
      net_skins_configured: false,
      calcutta_configured: false,
    },
  };
}
