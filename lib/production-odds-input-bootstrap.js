import { createHash } from "node:crypto";

import { buildCompletedHistoryPresentation } from "./completed-history-presentation-adapter.js";
import { buildSecondaryHistoryModel } from "./secondary-history-model.js";
import { createHistoricalStatsModel, ELO_K, ELO_START, SBR_CATEGORIES } from "./stats.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";

export const PRODUCTION_ODDS_INPUT_BOOTSTRAP_CONTRACT =
  "production-odds-input-bootstrap-v1";
export const PRODUCTION_ODDS_INPUT_BOOTSTRAP_OPERATION =
  "ODDS_INPUT_CONFIGURATION_BOOTSTRAP";
export const PRODUCTION_ODDS_INPUT_BOOTSTRAP_ACTOR =
  "step10b-production-shadow-bootstrap";
export const PRODUCTION_ODDS_RATINGS_CONTRACT =
  "sandbagger-ratings-existing-engine-v1";

const EXPECTED_COMPLETED_YEARS = Object.freeze([
  2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
]);
const clean = (value) => String(value ?? "").trim();
const integer = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Math.trunc(Number(value))
  : fallback;
const list = (value) => Array.isArray(value) ? value : [];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function productionOddsCanonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function productionOddsFingerprint(value, { serialized = false } = {}) {
  const input = serialized ? String(value) : productionOddsCanonicalJson(value);
  return createHash("sha256").update(input).digest("hex");
}

function fail(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function assertExactProductionArtifact(artifact = {}) {
  if (clean(artifact.environment).toUpperCase() !== "PRODUCTION"
      || clean(artifact.project_ref) !== PRODUCTION_SUPABASE_PROJECT_REF
      || clean(artifact.project_url) !== PRODUCTION_SUPABASE_URL
      || clean(artifact.source_workbook_id) !== PRODUCTION_GOOGLE_WORKBOOK_ID) {
    fail(
      "PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED",
      "Odds bootstrap preparation requires the exact Production shadow artifact.",
    );
  }
  if (artifact.safety?.google_reads_only !== true
      || Number(artifact.safety?.supabase_requests) !== 0
      || Number(artifact.safety?.google_writes) !== 0
      || artifact.safety?.scoring_ingress_enabled !== false
      || artifact.safety?.google_mirror_enabled !== false
      || artifact.safety?.public_read_source_changed !== false) {
    fail(
      "PRODUCTION_ODDS_DORMANT_SOURCE_REQUIRED",
      "The Production shadow artifact does not prove the dormant read-only safety contract.",
    );
  }
  const { artifact_fingerprint: artifactFingerprint, ...fingerprintedArtifact } = artifact;
  if (productionOddsFingerprint(fingerprintedArtifact) !== clean(artifactFingerprint).toLowerCase()) {
    fail(
      "PRODUCTION_ODDS_SHADOW_ARTIFACT_FINGERPRINT_MISMATCH",
      "The Production shadow artifact fingerprint is invalid.",
    );
  }
}

function assertProjectionEnvelope(envelope = {}, domain, contractVersion) {
  if (clean(envelope.environment).toUpperCase() !== "PRODUCTION"
      || clean(envelope.project_ref) !== PRODUCTION_SUPABASE_PROJECT_REF
      || clean(envelope.project_url) !== PRODUCTION_SUPABASE_URL
      || clean(envelope.source_workbook_id) !== PRODUCTION_GOOGLE_WORKBOOK_ID
      || clean(envelope.tournament_id) !== PRODUCTION_TOURNAMENT_ID
      || integer(envelope.tournament_year) !== PRODUCTION_TOURNAMENT_YEAR
      || clean(envelope.domain).toUpperCase() !== domain
      || clean(envelope.contract_version) !== contractVersion
      || clean(envelope.validation_status).toUpperCase() !== "VALID") {
    fail(
      "PRODUCTION_ODDS_PROJECTION_RESOURCE_REQUIRED",
      `The ${domain} projection is not the certified Production envelope.`,
    );
  }
  const sourceJson = productionOddsCanonicalJson(envelope.source_payload);
  const payloadJson = productionOddsCanonicalJson(envelope.payload);
  if (productionOddsFingerprint(sourceJson, { serialized: true }) !== clean(envelope.source_fingerprint).toLowerCase()
      || productionOddsFingerprint(payloadJson, { serialized: true }) !== clean(envelope.payload_fingerprint).toLowerCase()) {
    fail(
      "PRODUCTION_ODDS_PROJECTION_FINGERPRINT_MISMATCH",
      `${domain} canonical evidence does not match its fingerprint.`,
    );
  }
}

function completedViews(artifact = {}) {
  const rows = [...list(artifact.completed_history)]
    .sort((left, right) => integer(left.year) - integer(right.year));
  const years = rows.map((row) => integer(row.year));
  if (years.join(",") !== EXPECTED_COMPLETED_YEARS.join(",")) {
    fail(
      "PRODUCTION_ODDS_COMPLETE_HISTORY_REQUIRED",
      "Odds bootstrap requires the complete certified Production 2017-2025 sequence.",
      { years },
    );
  }
  return rows.map((row) => {
    const envelope = row.input_template || {};
    if (clean(envelope.environment).toUpperCase() !== "PRODUCTION"
        || clean(envelope.project_ref) !== PRODUCTION_SUPABASE_PROJECT_REF
        || clean(envelope.source_workbook_id) !== PRODUCTION_GOOGLE_WORKBOOK_ID
        || integer(envelope.tournament_year) !== integer(row.year)
        || clean(envelope.source_fingerprint).toLowerCase() !== clean(row.source_fingerprint).toLowerCase()
        || clean(envelope.payload_fingerprint).toLowerCase() !== clean(row.payload_fingerprint).toLowerCase()
        || !envelope.payload) {
      fail(
        "PRODUCTION_ODDS_HISTORY_EVIDENCE_MISMATCH",
        `Production completed-History evidence is invalid for ${row.year}.`,
      );
    }
    // The completed-History fingerprint intentionally names the certified
    // source contract before its mechanical database-envelope translation,
    // not the translated `payload` object below. The enclosing shadow
    // artifact fingerprint authenticates this exact translated envelope.
    return buildCompletedHistoryPresentation({
      ...envelope.payload,
      revision: {
        source_fingerprint: clean(row.source_fingerprint).toLowerCase(),
        payload_fingerprint: clean(row.payload_fingerprint).toLowerCase(),
        correction_registry_version: clean(envelope.correction_set_version),
      },
    });
  });
}

function sourceSheetRecords(source = {}, sheetName) {
  const sheet = list(source.sheets).find((row) => clean(row.sheet) === sheetName);
  return list(sheet?.records);
}

function currentView(artifact = {}, playerProjection = {}) {
  const envelope = artifact.current_tournament?.input_template || {};
  const payload = envelope.payload || {};
  if (clean(envelope.environment).toUpperCase() !== "PRODUCTION"
      || clean(envelope.project_ref) !== PRODUCTION_SUPABASE_PROJECT_REF
      || clean(envelope.project_url) !== PRODUCTION_SUPABASE_URL
      || clean(envelope.source_workbook_id) !== PRODUCTION_GOOGLE_WORKBOOK_ID
      || clean(envelope.tournament_id) !== PRODUCTION_TOURNAMENT_ID
      || integer(envelope.tournament_year) !== PRODUCTION_TOURNAMENT_YEAR
      || clean(envelope.import_contract_version) !== "production-current-shadow-v2"
      || clean(envelope.source_fingerprint).toLowerCase()
        !== clean(artifact.current_tournament?.source_fingerprint).toLowerCase()
      || clean(envelope.payload_fingerprint).toLowerCase()
        !== clean(artifact.current_tournament?.payload_fingerprint).toLowerCase()) {
    fail(
      "PRODUCTION_ODDS_CURRENT_SHADOW_EVIDENCE_REQUIRED",
      "Odds bootstrap requires the exact certified Production current-shadow V2 envelope.",
    );
  }
  const payloadJson = productionOddsCanonicalJson(payload);
  if (productionOddsFingerprint(payloadJson, { serialized: true })
      !== clean(envelope.payload_fingerprint).toLowerCase()) {
    fail(
      "PRODUCTION_ODDS_CURRENT_PAYLOAD_FINGERPRINT_MISMATCH",
      "Production current-shadow payload fingerprint is invalid.",
    );
  }

  const profiles = new Map(list(playerProjection.players).map((row) => [
    clean(row.player_id),
    { ...(row.public_profile || {}), "Player ID": clean(row.player_id) },
  ]));
  const memberships = list(payload.tournament_players);
  const teams = list(payload.teams)
    .sort((left, right) => integer(left.team_side) - integer(right.team_side))
    .map((team) => {
      const side = integer(team.team_side);
      const roster = memberships
        .filter((row) => integer(row.team_side) === side && clean(row.participation_status).toUpperCase() === "ACTIVE")
        .sort((left, right) => clean(left.player_id).localeCompare(clean(right.player_id)))
        .map((row) => ({
          playerId: clean(row.player_id),
          player: profiles.get(clean(row.player_id)) || { "Player ID": clean(row.player_id) },
          handicap: row.source_payload?.["Tournament Handicap"] ?? null,
        }));
      return {
        id: clean(team.team_id),
        side: `Team ${side}`,
        sideNumber: side,
        name: clean(team.name),
        captainId: clean(team.source_payload?.Captain),
        roster,
      };
    });
  const courseRows = sourceSheetRecords(envelope.source_payload, "Courses")
    .filter((row) => integer(row.Year) === PRODUCTION_TOURNAMENT_YEAR)
    .map((row) => ({ ...row }));
  const coursesById = new Map(courseRows.map((row) => [clean(row["Course ID"]), row]));
  const participantsByMatch = new Map();
  for (const participant of list(payload.match_participants)) {
    const matchId = clean(participant.match_id);
    if (!participantsByMatch.has(matchId)) participantsByMatch.set(matchId, []);
    participantsByMatch.get(matchId).push(participant);
  }
  const snapshotsByMatch = new Map(list(payload.snapshots).map((row) => [clean(row.match_id), row]));
  const matches = list(payload.matches).map((match) => {
    const matchId = clean(match.match_id);
    const participants = (participantsByMatch.get(matchId) || [])
      .sort((left, right) => integer(left.team_side) - integer(right.team_side)
        || integer(left.player_slot) - integer(right.player_slot));
    const snapshot = snapshotsByMatch.get(matchId) || {};
    const playersForSide = (side) => participants
      .filter((row) => integer(row.team_side) === side)
      .map((row) => ({ id: clean(row.player_id) }));
    return {
      id: matchId,
      lifecycle: clean(match.status).toUpperCase(),
      status: clean(match.status).toUpperCase(),
      round: integer(match.round_number),
      format: clean(match.format).toUpperCase(),
      team1Players: playersForSide(1),
      team2Players: playersForSide(2),
      course: coursesById.get(clean(snapshot.course_id)) || { "Course ID": clean(snapshot.course_id) },
    };
  });
  return {
    source: "supabase",
    year: PRODUCTION_TOURNAMENT_YEAR,
    tournament: {
      id: PRODUCTION_TOURNAMENT_ID,
      ...payload.tournament,
      courses: courseRows,
    },
    players: [...profiles.values()].sort((left, right) =>
      clean(left["Player ID"]).localeCompare(clean(right["Player ID"]))),
    teams,
    rounds: list(payload.rounds).map((row) => ({
      round: integer(row.round_number),
      number: integer(row.round_number),
      format: clean(row.format).toUpperCase(),
    })),
    matches,
    analytics: { scorecards: [] },
  };
}

export function canonicalProductionPairingSequence(currentPayload = {}) {
  const participantsByMatch = new Map();
  for (const participant of list(currentPayload.match_participants)) {
    const matchId = clean(participant.match_id);
    if (!participantsByMatch.has(matchId)) participantsByMatch.set(matchId, []);
    participantsByMatch.get(matchId).push({
      player_id: clean(participant.player_id),
      team_side: integer(participant.team_side),
      player_slot: integer(participant.player_slot),
    });
  }
  const snapshotsByMatch = new Map(list(currentPayload.snapshots)
    .map((snapshot) => [clean(snapshot.match_id), snapshot]));
  return list(currentPayload.matches).map((match) => {
    const matchId = clean(match.match_id);
    const snapshot = snapshotsByMatch.get(matchId) || {};
    return {
      match_id: matchId,
      round_number: integer(match.round_number),
      format: clean(match.format).toUpperCase(),
      status: clean(match.status).toUpperCase(),
      course_id: clean(snapshot.course_id),
      tee: clean(snapshot.tee),
      participants: (participantsByMatch.get(matchId) || []).sort((left, right) =>
        left.team_side - right.team_side || left.player_slot - right.player_slot
          || left.player_id.localeCompare(right.player_id)),
    };
  }).sort((left, right) => left.round_number - right.round_number
    || left.match_id.localeCompare(right.match_id));
}

/**
 * Prepare, but never apply, the one-time dormant Production Odds input row.
 * The injected model factory exists only for deterministic unit testing; the
 * default is the same request-local calculation engine used by History/War Room.
 */
export function buildProductionOddsInputBootstrap({
  shadowArtifact,
  predictionSettingsEnvelope,
  playerEditorialEnvelope,
  statsEngineSourceSha256,
  repositorySha = "",
} = {}, { createCalculations = createHistoricalStatsModel } = {}) {
  assertExactProductionArtifact(shadowArtifact);
  assertProjectionEnvelope(
    predictionSettingsEnvelope,
    "PREDICTION_SETTINGS",
    "prediction-settings-v1",
  );
  assertProjectionEnvelope(
    playerEditorialEnvelope,
    "PLAYER_EDITORIAL",
    "player-public-profile-v1",
  );
  if (clean(statsEngineSourceSha256).toLowerCase().match(/^[0-9a-f]{64}$/) === null) {
    fail(
      "PRODUCTION_ODDS_ENGINE_SOURCE_FINGERPRINT_REQUIRED",
      "The exact unchanged stats engine source fingerprint is required.",
    );
  }
  const settingsPayload = predictionSettingsEnvelope.payload || {};
  if (list(settingsPayload.settings).length < 30
      || Object.keys(settingsPayload.canonical_settings || {}).length !== 30
      || Object.keys(settingsPayload.effective_settings || {}).length !== 30
      || clean(settingsPayload.settings_contract_version) !== "prediction-settings-v1"
      || clean(settingsPayload.source_tab) !== "Prediction Settings") {
    fail(
      "PRODUCTION_ODDS_COMPLETE_SETTINGS_REQUIRED",
      "Odds bootstrap requires the complete typed 30-key Production settings contract.",
    );
  }
  const settingsJson = productionOddsCanonicalJson(settingsPayload.settings);
  const effectiveSettingsJson = productionOddsCanonicalJson(settingsPayload.effective_settings);
  if (productionOddsFingerprint(settingsJson, { serialized: true })
        !== clean(settingsPayload.settings_fingerprint).toLowerCase()
      || productionOddsFingerprint(effectiveSettingsJson, { serialized: true })
        !== clean(settingsPayload.effective_settings_fingerprint).toLowerCase()) {
    fail(
      "PRODUCTION_ODDS_SETTINGS_FINGERPRINT_MISMATCH",
      "The Production Prediction Settings fingerprint is invalid.",
    );
  }

  const completed = completedViews(shadowArtifact);
  const current = currentView(shadowArtifact, playerEditorialEnvelope.payload);
  const historicalModel = buildSecondaryHistoryModel({
    completedViews: completed,
    currentView: current,
    playerProjection: playerEditorialEnvelope.payload,
  }, { createCalculations });
  const historicalRatings = Object.fromEntries(historicalModel.calculations.getAllPlayerStats()
    .map(({ player, stats }) => [clean(player?.["Player ID"]), {
      sandbaggerRatings: stable(stats?.sandbaggerRatings || {}),
    }])
    .filter(([playerId]) => playerId)
    .sort(([left], [right]) => left.localeCompare(right)));
  if (Object.keys(historicalRatings).length !== list(playerEditorialEnvelope.payload?.players).length) {
    fail(
      "PRODUCTION_ODDS_RATINGS_IDENTITY_DIVERGENCE",
      "Every certified Production player must have one deterministic ratings entry.",
      {
        ratings: Object.keys(historicalRatings).length,
        players: list(playerEditorialEnvelope.payload?.players).length,
      },
    );
  }
  const currentEnvelope = shadowArtifact.current_tournament.input_template;
  const pairingSequence = canonicalProductionPairingSequence(currentEnvelope.payload);
  if (!pairingSequence.length) {
    fail(
      "PRODUCTION_ODDS_PAIRING_SEQUENCE_REQUIRED",
      "The Production current-shadow match order is required even when pairings are pending.",
    );
  }

  const ratingsJson = productionOddsCanonicalJson(historicalRatings);
  const pairingJson = productionOddsCanonicalJson(pairingSequence);
  const ratingsFingerprint = productionOddsFingerprint(ratingsJson, { serialized: true });
  const pairingFingerprint = productionOddsFingerprint(pairingJson, { serialized: true });
  const sourceEvidence = {
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    completed_history: shadowArtifact.completed_history.map((row) => ({
      year: integer(row.year),
      source_fingerprint: clean(row.source_fingerprint).toLowerCase(),
      payload_fingerprint: clean(row.payload_fingerprint).toLowerCase(),
      correction_registry_version: clean(row.input_template?.correction_set_version),
    })),
    current_tournament: {
      source_fingerprint: clean(currentEnvelope.source_fingerprint).toLowerCase(),
      payload_fingerprint: clean(currentEnvelope.payload_fingerprint).toLowerCase(),
      import_contract_version: clean(currentEnvelope.import_contract_version),
    },
    current_pairing_sequence: pairingSequence,
    prediction_settings: {
      source_fingerprint: clean(predictionSettingsEnvelope.source_fingerprint).toLowerCase(),
      payload_fingerprint: clean(predictionSettingsEnvelope.payload_fingerprint).toLowerCase(),
      contract_version: clean(predictionSettingsEnvelope.contract_version),
    },
    player_editorial: {
      source_fingerprint: clean(playerEditorialEnvelope.source_fingerprint).toLowerCase(),
      payload_fingerprint: clean(playerEditorialEnvelope.payload_fingerprint).toLowerCase(),
      contract_version: clean(playerEditorialEnvelope.contract_version),
    },
    ratings_engine: {
      contract_version: PRODUCTION_ODDS_RATINGS_CONTRACT,
      source_sha256: clean(statsEngineSourceSha256).toLowerCase(),
      repository_sha: clean(repositorySha),
      start_rating: ELO_START,
      k_factor: ELO_K,
      categories: SBR_CATEGORIES.map((row) => ({ id: row.id, format: row.format || null })),
      canonical_history_fingerprint: clean(historicalModel.diagnostics?.fingerprint),
    },
  };
  const sourceCanonicalJson = productionOddsCanonicalJson(sourceEvidence);
  const sourceFingerprint = productionOddsFingerprint(sourceCanonicalJson, { serialized: true });
  const configuration = {
    settings: settingsPayload.settings,
    historical_ratings: historicalRatings,
    canonical_settings: settingsPayload.canonical_settings,
    effective_settings: settingsPayload.effective_settings,
    settings_fingerprint: clean(settingsPayload.settings_fingerprint).toLowerCase(),
    effective_settings_fingerprint: clean(settingsPayload.effective_settings_fingerprint).toLowerCase(),
    ratings_fingerprint: ratingsFingerprint,
    pairing_fingerprint: pairingFingerprint,
    settings_contract_version: "prediction-settings-v1",
    ratings_contract_version: PRODUCTION_ODDS_RATINGS_CONTRACT,
    pairing_contract_version: "production-current-pairing-sequence-v1",
    validation_status: "VALID",
  };
  const bundleIdentity = {
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    configuration_revision: 1,
    source_fingerprint: sourceFingerprint,
    settings_fingerprint: configuration.settings_fingerprint,
    effective_settings_fingerprint: configuration.effective_settings_fingerprint,
    ratings_fingerprint: ratingsFingerprint,
    pairing_fingerprint: pairingFingerprint,
    ratings_contract_version: PRODUCTION_ODDS_RATINGS_CONTRACT,
  };
  const bundleCanonicalJson = productionOddsCanonicalJson(bundleIdentity);
  const bundleFingerprint = productionOddsFingerprint(bundleCanonicalJson, { serialized: true });
  const payload = { ...configuration, bundle_fingerprint: bundleFingerprint };
  const payloadCanonicalJson = productionOddsCanonicalJson(payload);
  const payloadFingerprint = productionOddsFingerprint(payloadCanonicalJson, { serialized: true });
  const requestEvidence = {
    actor_id: PRODUCTION_ODDS_INPUT_BOOTSTRAP_ACTOR,
    environment: "PRODUCTION",
    operation: PRODUCTION_ODDS_INPUT_BOOTSTRAP_OPERATION,
    payload_fingerprint: payloadFingerprint,
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_fingerprint: sourceFingerprint,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    bootstrap_contract_version: PRODUCTION_ODDS_INPUT_BOOTSTRAP_CONTRACT,
  };
  const requestCanonicalJson = productionOddsCanonicalJson(requestEvidence);
  return {
    ...requestEvidence,
    request_fingerprint: productionOddsFingerprint(requestCanonicalJson, { serialized: true }),
    request_canonical_json: requestCanonicalJson,
    source_evidence: sourceEvidence,
    source_canonical_json: sourceCanonicalJson,
    payload,
    payload_canonical_json: payloadCanonicalJson,
    settings_canonical_json: settingsJson,
    effective_settings_canonical_json: effectiveSettingsJson,
    ratings_canonical_json: ratingsJson,
    pairing_canonical_json: pairingJson,
    bundle_canonical_json: bundleCanonicalJson,
    diagnostics: {
      completed_years: EXPECTED_COMPLETED_YEARS,
      player_count: Object.keys(historicalRatings).length,
      rated_player_count: Object.values(historicalRatings)
        .filter((row) => Object.keys(row.sandbaggerRatings || {}).length > 0).length,
      match_count: pairingSequence.length,
      paired_participant_count: pairingSequence.reduce((sum, row) => sum + row.participants.length, 0),
      pairing_state: clean(currentEnvelope.payload?.pairing_contract?.state),
      settings_count: list(settingsPayload.settings).length,
      canonical_setting_count: Object.keys(settingsPayload.canonical_settings).length,
      effective_setting_count: Object.keys(settingsPayload.effective_settings).length,
      calculation_engine_reused: true,
      calculation_or_publication_performed: false,
      google_write: false,
      scoring_ingress: "DISABLED",
      public_read_source_changed: false,
    },
  };
}
