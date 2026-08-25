import "server-only";

import { createHash } from "node:crypto";

import {
  GUIDE_PARTICIPANT_CONTENT_POLICIES,
  GUIDE_PROJECTION_SCHEMA_VERSION,
  GUIDE_PROJECTION_SHEETS,
  buildGuideProjection,
} from "./tournament-guide-projection.js";
import {
  DRAFT_CONTRACT_VERSION,
  DRAFT_SOURCE_TABS,
  buildDraftProjection,
} from "./draft-contract.js";
import {
  PREDICTION_SETTINGS_CONTRACT_VERSION,
  PREDICTION_SETTINGS_SOURCE_TAB,
  buildPredictionSettingsProjection,
} from "./prediction-settings-contract.js";
import {
  PRODUCTION_CANONICAL_HOSTNAME,
  PRODUCTION_VERCEL_PROJECT_NAME,
} from "./production-shadow-candidate.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import {
  PRODUCTION_VERCEL_PROJECT_ID,
  withProductionGoogleServiceAccountCredentials,
} from "./google-service-account-credential-context.js";
import {
  assertProductionCutoverActivation,
} from "./production-cutover-activation-contract.js";
import { readWorkbookSheetsByName, withWorkbookWriteDiagnostics } from "./google-sheets-write.js";
import { canonicalJson } from "./scoring-shadow.js";
import { recordDataAuthorityTransport } from "./data-authority-request.js";

const clean = (value) => String(value ?? "").trim();
const sha256 = (value, { serialized = false } = {}) => createHash("sha256")
  .update(serialized ? String(value) : canonicalJson(value))
  .digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PRODUCTION_DIRECTOR_PROJECTION_SYNC_CONTRACT =
  "production-director-projection-sync-v1";

export const PRODUCTION_DIRECTOR_PROJECTION_SPECS = Object.freeze({
  GUIDE: Object.freeze({
    contractVersion: GUIDE_PROJECTION_SCHEMA_VERSION,
    sourceTabs: Object.freeze([...GUIDE_PROJECTION_SHEETS]),
    requiredPhase: "READ_CUTOVER",
    googleOperation: "GUIDE_SYNCHRONIZATION",
    readRpc: "read_production_guide_projection",
  }),
  DRAFT: Object.freeze({
    contractVersion: DRAFT_CONTRACT_VERSION,
    sourceTabs: Object.freeze([...DRAFT_SOURCE_TABS]),
    requiredPhase: "READ_CUTOVER",
    googleOperation: "DRAFT_SYNCHRONIZATION",
    readRpc: "read_production_draft_projection",
  }),
  PREDICTION_SETTINGS: Object.freeze({
    contractVersion: PREDICTION_SETTINGS_CONTRACT_VERSION,
    sourceTabs: Object.freeze([PREDICTION_SETTINGS_SOURCE_TAB]),
    requiredPhase: "ODDS_WAR_ROOM",
    googleOperation: "PREDICTION_SETTINGS_SYNCHRONIZATION",
    readRpc: "read_production_prediction_settings",
  }),
});

function syncError(code, message, status = 503, diagnostics = undefined) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (diagnostics !== undefined) error.diagnostics = diagnostics;
  return error;
}

function specFor(domain) {
  const normalized = clean(domain).toUpperCase();
  const spec = PRODUCTION_DIRECTOR_PROJECTION_SPECS[normalized];
  if (!spec) throw syncError("PRODUCTION_DIRECTOR_SYNC_DOMAIN_NOT_ALLOWED", "The requested Production synchronization domain is not allowed.", 400);
  return { domain: normalized, spec };
}

function rpcHeaders(secret) {
  const headers = { apikey: secret, "content-type": "application/json" };
  if (!secret.startsWith("sb_secret_")) headers.authorization = `Bearer ${secret}`;
  return headers;
}

async function productionRpc(functionName, input, {
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20_000,
} = {}) {
  const secret = clean(env.PRODUCTION_SUPABASE_SECRET_KEY);
  if (!secret) throw syncError("PRODUCTION_DIRECTOR_SYNC_TRANSPORT_UNAVAILABLE", "The Production synchronization transport is unavailable.");
  recordDataAuthorityTransport("supabase", { adapter: "production-director-projection-sync" });
  const response = await fetchImpl(`${PRODUCTION_SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: rpcHeaders(secret),
    body: JSON.stringify({ input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw syncError("PRODUCTION_DIRECTOR_SYNC_RPC_FAILED", `Production synchronization RPC failed (${response.status}).`, response.status, {
      functionName,
      providerCode: clean(payload?.code),
    });
  }
  return payload;
}

function exactScope({ activation, domain, actorAuthUserId, actorPlayerId, extra = {} }) {
  return {
    ...extra,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    deployment_commit: activation.resources.commitSha,
    cutover_phase: activation.phase,
    read_contract: "ACTIVE_CUTOVER",
    operation_authority: "GOOGLE_DIRECTOR_SYNC",
    domain,
    actor_auth_user_id: clean(actorAuthUserId).toLowerCase(),
    actor_player_id: clean(actorPlayerId),
  };
}

function requireActor({ actorAuthUserId, actorPlayerId }) {
  if (!UUID.test(clean(actorAuthUserId)) || !clean(actorPlayerId)) {
    throw syncError("PRODUCTION_ACTIVE_DIRECTOR_SYNC_ENTITLEMENT_REQUIRED", "An active Production Director identity is required.", 403);
  }
}

function records(sheet = {}) {
  return (sheet.records || []).map((entry) => entry?.record || entry || {});
}

function structuredSheet(sheet = {}) {
  return {
    headers: Array.isArray(sheet.headers) ? sheet.headers.map(clean) : [],
    records: records(sheet),
  };
}

function normalizePredictionSettingsSheet(sheet = {}) {
  const headers = Array.isArray(sheet.headers) ? sheet.headers.map(clean) : [];
  if (headers[0] === "Setting" && headers[1] === "Value") return records(sheet);
  const settingPrefix = "Setting ";
  const valuePrefix = "Value ";
  if (!headers[0]?.startsWith(settingPrefix) || !headers[1]?.startsWith(valuePrefix) ||
      !clean(headers[0].slice(settingPrefix.length)) || !clean(headers[1].slice(valuePrefix.length))) {
    throw syncError("PRODUCTION_PREDICTION_SETTINGS_HEADER_AMBIGUOUS", "Production Prediction Settings headers are not recognized.", 422);
  }
  const canonicalHeaders = ["Setting", "Value", ...headers.slice(2)];
  const first = Object.fromEntries(canonicalHeaders.map((header, index) => [header,
    index === 0 ? clean(headers[0].slice(settingPrefix.length))
      : index === 1 ? clean(headers[1].slice(valuePrefix.length)) : null]));
  return [first, ...(sheet.records || []).map((entry) => {
    const row = entry?.record || entry || {};
    return Object.fromEntries(canonicalHeaders.map((header, index) => [header, row[headers[index]] ?? null]));
  })];
}

function draftHistory(context = {}) {
  const playerMap = Object.fromEntries((context.players || []).map((player) => {
    const source = player.source_payload || {};
    return [clean(player.player_id), {
      ...source,
      "Player ID": clean(player.player_id),
      "Display Name": clean(player.display_name),
      First: clean(source.First || source.first_name),
      Last: clean(source.Last || source.last_name),
      "Photo Filename": clean(source["Photo Filename"] || source.photo_filename),
    }];
  }).filter(([playerId]) => playerId));
  const roster = Array.isArray(context.roster) ? context.roster : [];
  const teams = Array.isArray(context.teams) ? context.teams : [];
  const tournaments = new Map((context.tournaments || []).map((tournament) => {
    const tournamentId = clean(tournament.tournament_id);
    const year = Number(tournament.tournament_year);
    const tournamentTeams = teams.filter((team) => clean(team.tournament_id) === tournamentId).map((team) => {
      const source = team.source_payload || {};
      const identity = team.presentation_identity || {};
      return {
        id: clean(team.team_id),
        side: clean(team.team_side),
        name: clean(team.name),
        logo: clean(team.logo_key || source["Logo Filename"] || source.Logo),
        primaryColor: clean(identity.primary_color || source["Primary Color"]),
        secondaryColor: clean(identity.secondary_color || source["Secondary Color"]),
        captainId: clean(team.captain_player_id),
        roster: roster.filter((row) => clean(row.tournament_id) === tournamentId && clean(row.team_id) === clean(team.team_id))
          .map((row) => ({ player: playerMap[clean(row.player_id)] || null })),
      };
    });
    return [year, { id: tournamentId, year, teams: tournamentTeams, team1: tournamentTeams[0] || null, team2: tournamentTeams[1] || null }];
  }));
  const handicaps = new Map(roster.map((row) => [`${Number(row.tournament_year)}:${clean(row.player_id)}`, row.tournament_handicap]));
  return {
    getTournament: (year) => tournaments.get(Number(year)) || null,
    getPlayerMap: () => playerMap,
    getTournamentHandicap: (playerId, year) => handicaps.get(`${Number(year)}:${clean(playerId)}`) ?? null,
  };
}

function commonEnvelope({ domain, spec, actorPlayerId, sourcePayload, payload, validationDiagnostics = {}, extra = {} }) {
  const sourceCanonicalJson = canonicalJson(sourcePayload);
  const payloadCanonicalJson = canonicalJson(payload);
  return {
    domain,
    contract_version: spec.contractVersion,
    source_tabs: [...spec.sourceTabs],
    source_fingerprint: sha256(sourceCanonicalJson, { serialized: true }),
    payload_fingerprint: sha256(payloadCanonicalJson, { serialized: true }),
    requested_by: `Production Director ${clean(actorPlayerId)}`,
    validation_status: "VALID",
    validation_diagnostics: validationDiagnostics,
    source_payload: sourcePayload,
    payload,
    source_canonical_json: sourceCanonicalJson,
    payload_canonical_json: payloadCanonicalJson,
    ...extra,
  };
}

export function buildProductionDirectorProjectionEnvelope({
  domain,
  sheets = {},
  canonicalContext = {},
  actorPlayerId,
  correctionReason = "",
} = {}) {
  const selected = specFor(domain);
  if (selected.domain === "GUIDE") {
    const courseContext = canonicalContext.canonical_course_context;
    if (!Array.isArray(courseContext) || !courseContext.length) {
      throw syncError("PRODUCTION_GUIDE_CANONICAL_COURSE_CONTEXT_REQUIRED", "The canonical Production Guide course context is unavailable.", 422);
    }
    const guideSheets = Object.fromEntries(selected.spec.sourceTabs.map((tab) => [tab, structuredSheet(sheets[tab])]));
    const projection = buildGuideProjection({
      sheets: guideSheets,
      tournament: { id: PRODUCTION_TOURNAMENT_ID, year: PRODUCTION_TOURNAMENT_YEAR },
      approvedTournamentId: PRODUCTION_TOURNAMENT_ID,
      canonicalCourseContext: courseContext,
      participantContentPolicy: GUIDE_PARTICIPANT_CONTENT_POLICIES.ALLOW_VALID_EMPTY_PRE_TOURNAMENT,
    });
    const payload = { schemaVersion: projection.schemaVersion, content: projection.content };
    return commonEnvelope({
      ...selected,
      actorPlayerId,
      sourcePayload: JSON.parse(projection.sourceCanonicalJson),
      payload,
      validationDiagnostics: { ...projection.validation, sourceCounts: projection.sourceCounts },
      extra: {
        content_fingerprint: projection.contentFingerprint,
        content_canonical_json: projection.contentCanonicalJson,
        source_metadata: { google_read_only: true, canonical_course_context_supplied: true },
      },
    });
  }

  if (selected.domain === "PREDICTION_SETTINGS") {
    const projection = buildPredictionSettingsProjection({
      tournamentId: PRODUCTION_TOURNAMENT_ID,
      tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
      sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
      rows: normalizePredictionSettingsSheet(sheets[PREDICTION_SETTINGS_SOURCE_TAB]),
      requestedBy: `Production Director ${clean(actorPlayerId)}`,
    });
    const payload = {
      settings: projection.settings,
      settings_fingerprint: projection.settings_fingerprint,
      canonical_settings: projection.canonical_settings,
      effective_settings: projection.effective_settings,
      effective_settings_fingerprint: projection.effective_settings_fingerprint,
      settings_contract_version: projection.settings_contract_version,
      source_tab: projection.source_tab,
    };
    return commonEnvelope({
      ...selected,
      actorPlayerId,
      sourcePayload: { sourceTab: projection.source_tab, rows: projection.settings },
      payload,
      validationDiagnostics: projection.validation_diagnostics,
      extra: {
        settings_canonical_json: canonicalJson(payload.settings),
        effective_settings_canonical_json: canonicalJson(payload.effective_settings),
        source_metadata: { google_read_only: true },
      },
    });
  }

  const projection = buildDraftProjection({
    settingsRows: records(sheets["Draft Settings"]),
    pickRows: records(sheets["Draft Picks"]),
    history: draftHistory(canonicalContext),
    sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    requestedBy: `Production Director ${clean(actorPlayerId)}`,
  });
  const reason = clean(correctionReason);
  const drafts = projection.drafts.map((draft) => Number(draft.tournament_year) < PRODUCTION_TOURNAMENT_YEAR && reason
    ? { ...draft, correction_reason: reason }
    : draft);
  const payload = { drafts, synchronization_fingerprint: projection.synchronization_fingerprint };
  const sourcePayload = { drafts: drafts.map((draft) => ({
    tournament_year: draft.tournament_year,
    source_settings: draft.source_settings,
    source_picks: draft.source_picks,
  })) };
  return commonEnvelope({
    ...selected,
    actorPlayerId,
    sourcePayload,
    payload,
    validationDiagnostics: { draftCount: drafts.length, years: drafts.map((draft) => draft.tournament_year) },
  });
}

export function productionDirectorProjectionFreshness({ stored, source } = {}) {
  if (!stored) return { status: "UNAVAILABLE", reason: "NO_CERTIFIED_PROJECTION" };
  if (!source) return { status: "UNKNOWN", reason: "SOURCE_NOT_CHECKED" };
  return clean(stored.source_fingerprint) === clean(source.source_fingerprint)
    ? { status: "CURRENT", reason: "SOURCE_FINGERPRINT_MATCH" }
    : {
        status: "STALE",
        reason: "NEWER_OR_DIFFERENT_GOOGLE_SOURCE",
        storedSourceFingerprint: clean(stored.source_fingerprint),
        sourceFingerprint: clean(source.source_fingerprint),
      };
}

function googleCredentialResources() {
  return {
    supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
    googleWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournamentId: PRODUCTION_TOURNAMENT_ID,
    tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
    vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
    vercelProjectName: PRODUCTION_VERCEL_PROJECT_NAME,
    canonicalHostname: PRODUCTION_CANONICAL_HOSTNAME,
  };
}

async function readGoogleSource({ spec, env, dependencies }) {
  const credentialRunner = dependencies.withProductionGoogleCredentials || withProductionGoogleServiceAccountCredentials;
  const sheetsReader = dependencies.readWorkbookSheetsByName || readWorkbookSheetsByName;
  const diagnosticsRunner = dependencies.withWorkbookWriteDiagnostics || withWorkbookWriteDiagnostics;
  const read = await credentialRunner({
    env,
    operation: spec.googleOperation,
    resources: googleCredentialResources(),
  }, () => diagnosticsRunner(`production-${spec.googleOperation.toLowerCase()}`, () =>
    sheetsReader([...spec.sourceTabs], { fresh: true })));
  if (Number(read?.diagnostics?.workbookWrites || 0) !== 0) {
    throw syncError("PRODUCTION_DIRECTOR_SYNC_GOOGLE_WRITE_DETECTED", "A Production synchronization source read attempted a Google write.");
  }
  return read;
}

export async function inspectProductionDirectorProjectionSynchronization({
  domain,
  actorAuthUserId,
  actorPlayerId,
  correctionReason = "",
  env = process.env,
  dependencies = {},
} = {}) {
  requireActor({ actorAuthUserId, actorPlayerId });
  const selected = specFor(domain);
  const activation = assertProductionCutoverActivation({ env, requiredPhase: selected.spec.requiredPhase });
  const rpc = dependencies.productionRpc || productionRpc;
  const contextInput = exactScope({ activation, domain: selected.domain, actorAuthUserId, actorPlayerId });
  const context = await rpc("read_production_director_sync_context", contextInput, { env, ...dependencies });
  if (!context?.ok || Number(context.activation_revision) < 0 || context.domain !== selected.domain) {
    throw syncError("PRODUCTION_DIRECTOR_SYNC_CONTEXT_UNAVAILABLE", "Production synchronization context is unavailable.");
  }
  const google = await readGoogleSource({ spec: selected.spec, env, dependencies });
  const source = buildProductionDirectorProjectionEnvelope({
    domain: selected.domain,
    sheets: google.result,
    canonicalContext: context.canonical_context || {},
    actorPlayerId,
    correctionReason,
  });
  return {
    ok: true,
    domain: selected.domain,
    requiredPhase: selected.spec.requiredPhase,
    activationRevision: Number(context.activation_revision),
    activation,
    context,
    source,
    freshness: productionDirectorProjectionFreshness({ stored: context.current_projection, source }),
    googleRead: {
      tabs: [...selected.spec.sourceTabs],
      sheetsApiCalls: Number(google.diagnostics?.sheetsApiCalls || 0),
      httpRequests: Number(google.diagnostics?.httpRequests || 0),
      writerOperations: Number(google.diagnostics?.workbookWrites || 0),
    },
    fallbackUsed: false,
  };
}

export async function synchronizeProductionDirectorProjection(options = {}) {
  const inspected = await inspectProductionDirectorProjectionSynchronization(options);
  const selected = specFor(inspected.domain);
  const rpc = options.dependencies?.productionRpc || productionRpc;
  const input = exactScope({
    activation: inspected.activation,
    domain: inspected.domain,
    actorAuthUserId: options.actorAuthUserId,
    actorPlayerId: options.actorPlayerId,
    extra: {
      ...inspected.source,
      expected_activation_revision: inspected.activationRevision,
    },
  });
  const imported = await rpc("synchronize_production_director_projection", input, {
    env: options.env || process.env,
    ...(options.dependencies || {}),
  });
  if (!imported?.ok) {
    throw syncError(clean(imported?.code || "PRODUCTION_DIRECTOR_SYNC_FAILED"), "The Production projection could not be synchronized.", 503);
  }
  const readbackInput = exactScope({
    activation: inspected.activation,
    domain: inspected.domain,
    actorAuthUserId: options.actorAuthUserId,
    actorPlayerId: options.actorPlayerId,
    extra: { contract_version: selected.spec.contractVersion, source_tabs: [...selected.spec.sourceTabs] },
  });
  const readback = await rpc(selected.spec.readRpc, readbackInput, {
    env: options.env || process.env,
    ...(options.dependencies || {}),
  });
  const stored = readback?.data;
  const readbackParity = Boolean(stored &&
    clean(stored.source_fingerprint) === inspected.source.source_fingerprint &&
    clean(stored.payload_fingerprint) === inspected.source.payload_fingerprint);
  if (!readbackParity) {
    throw syncError("PRODUCTION_DIRECTOR_SYNC_READBACK_PARITY_FAILED", "The Production synchronization read-back did not match its certified source.", 503, {
      domain: inspected.domain,
      changed: imported.changed === true,
      duplicate: imported.duplicate === true,
    });
  }
  return {
    ok: true,
    domain: inspected.domain,
    changed: imported.changed === true,
    duplicate: imported.duplicate === true,
    revisionId: clean(imported.revision_id || stored.revision_id),
    revisionNumber: Number(imported.revision_number || stored.revision_number),
    sourceFingerprint: inspected.source.source_fingerprint,
    payloadFingerprint: inspected.source.payload_fingerprint,
    freshness: { status: "CURRENT", reason: "SYNCHRONIZED_SOURCE_FINGERPRINT" },
    readbackParity,
    googleRead: inspected.googleRead,
    fallbackUsed: false,
    googleWrite: false,
  };
}
