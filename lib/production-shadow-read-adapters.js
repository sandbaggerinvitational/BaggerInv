import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";

const clean = (value) => String(value ?? "").trim();
const integer = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Math.trunc(Number(value))
  : fallback;

export const PRODUCTION_SHADOW_CANDIDATE_PROJECTION_CONTRACTS = Object.freeze({
  GUIDE: Object.freeze({
    rpc: "read_production_guide_projection",
    contractVersion: "guide-projection-v1",
    sourceTabs: Object.freeze(["Tournaments", "Guide Sections", "Tournament Itinerary", "Tournament Timeline", "Rule Book", "Tournament Rules", "Rounds", "Dining", "Local Guide", "Important Contacts", "Courses"]),
  }),
  PLAYER_EDITORIAL: Object.freeze({
    rpc: "read_production_player_editorial",
    contractVersion: "player-public-profile-v1",
    sourceTabs: Object.freeze(["Players"]),
  }),
  DRAFT: Object.freeze({
    rpc: "read_production_draft_projection",
    contractVersion: "draft-projection-v1",
    sourceTabs: Object.freeze(["Draft Settings", "Draft Picks"]),
  }),
});

export function productionCandidateReadScope(extra = {}) {
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    ...extra,
  };
}

function projectionInput(domain) {
  const contract = PRODUCTION_SHADOW_CANDIDATE_PROJECTION_CONTRACTS[domain];
  return productionCandidateReadScope({
    domain,
    contract_version: contract.contractVersion,
    source_tabs: [...contract.sourceTabs],
  });
}

function currentSurface(surface, extra = {}) {
  const targetTournamentId = clean(extra.target_tournament_id);
  const futureRuntime = Boolean(targetTournamentId) &&
    targetTournamentId !== PRODUCTION_TOURNAMENT_ID;
  return {
    // The installed 2026 cutover reader is intentionally frozen. Annual
    // runtimes use a separate pointer-aware RPC so a future target can never
    // be smuggled through the immutable 2026 transport contract.
    functionName: futureRuntime
      ? "read_production_future_current_view_v1"
      : "read_production_candidate_current_view",
    body: { input: productionCandidateReadScope({ surface, ...extra }) },
    adapter: surface === "HISTORY_2026" ? "HISTORY_2026" : "IDENTITY",
  };
}

/**
 * Translate the existing certified Supabase read adapters onto the dormant
 * Production-shadow read surface.  This table contains reads only.  Any RPC
 * absent from this table is rejected by scoringShadowRpc before transport.
 */
export function productionShadowCandidateRpcTranslation(functionName, body = {}) {
  const input = body?.input || {};
  const targetTournamentId = clean(body.target_tournament_id || input.target_tournament_id);
  const target = targetTournamentId ? { target_tournament_id: targetTournamentId } : {};
  switch (clean(functionName)) {
    case "read_tournament_live_view":
      return currentSurface("TOURNAMENT_LIVE", target);
    case "read_leaderboards_core_view":
      return currentSurface("LEADERBOARDS", target);
    case "read_preview_2026_historical_view":
      return currentSurface("HISTORY_2026");
    case "read_participant_home_view":
      return currentSurface("PARTICIPANT_HOME", { ...target, player_id: clean(body.target_player_id) });
    case "read_my_match_view":
      return currentSurface("MY_MATCH", { ...target, player_id: clean(body.target_player_id) });
    case "read_game_center_view":
      return currentSurface("GAME_CENTER", { ...target, match_id: clean(body.target_match_id) });
    case "read_match_authorization_matrix":
      return currentSurface("MATCH_AUTHORIZATION", target);
    case "read_net_skins_input_view":
      return currentSurface("NET_SKINS_INPUT", target);
    case "read_net_skins_result_view":
      return currentSurface("NET_SKINS_RESULT", target);
    case "read_calcutta_configuration_view":
      return currentSurface("CALCUTTA_CONFIGURATION", target);
    case "read_published_odds_view":
      return currentSurface("PUBLISHED_ODDS", target);
    case "read_championship_odds_inputs":
      return currentSurface("ODDS_INPUT", target);
    case "read_participant_identity_context":
      return currentSurface("PARTICIPANT_IDENTITY", { ...target, player_id: clean(body.target_player_id || input.player_id) });
    case "read_competition_derived_state":
      return currentSurface("COMPETITION_DERIVED", {
        ...target,
        engine_keys: Array.isArray(body.target_engine_keys) ? body.target_engine_keys
          : Array.isArray(input.engine_keys) ? input.engine_keys : [],
      });
    case "read_preview_completed_history":
      return {
        functionName: "read_production_candidate_completed_history",
        body: { input: productionCandidateReadScope({
          mode: clean(input.mode || input.scope || "YEARS").toUpperCase(),
          ...(input.tournament_year ? { tournament_year: integer(input.tournament_year) } : {}),
        }) },
        adapter: "IDENTITY",
      };
    case "read_current_guide_projection":
      if (targetTournamentId && targetTournamentId !== PRODUCTION_TOURNAMENT_ID) {
        return {
          ...currentSurface("GUIDE_PROJECTION", target),
          adapter: "GUIDE_PROJECTION",
        };
      }
      return {
        functionName: PRODUCTION_SHADOW_CANDIDATE_PROJECTION_CONTRACTS.GUIDE.rpc,
        body: { input: projectionInput("GUIDE") },
        adapter: "GUIDE_PROJECTION",
      };
    case "read_preview_draft_view":
      return {
        functionName: PRODUCTION_SHADOW_CANDIDATE_PROJECTION_CONTRACTS.DRAFT.rpc,
        body: { input: projectionInput("DRAFT") },
        adapter: "DRAFT_PROJECTION",
        request: {
          scope: clean(body.target_scope || "YEARS").toUpperCase(),
          year: body.target_year == null ? null : integer(body.target_year),
          playerId: clean(body.target_player_id),
        },
      };
    case "read_preview_secondary_history_players":
      return {
        functionName: PRODUCTION_SHADOW_CANDIDATE_PROJECTION_CONTRACTS.PLAYER_EDITORIAL.rpc,
        body: { input: projectionInput("PLAYER_EDITORIAL") },
        adapter: "PLAYER_EDITORIAL",
      };
    default:
      return null;
  }
}

function adaptGuideProjection(payload = {}) {
  if (!payload.ok || !payload.data) return payload;
  const data = payload.data;
  return {
    ...payload,
    data: {
      ...data,
      content: data.payload || {},
      projection_revision: integer(data.revision_number),
      publication_sequence: integer(data.revision_number),
      content_fingerprint: clean(data.payload_fingerprint),
      delivery_fingerprint: clean(data.payload_fingerprint),
      published_at: clean(data.imported_at),
      query_ms: 0,
    },
  };
}

function adaptPlayerEditorial(payload = {}) {
  if (!payload.ok || !payload.data) return payload;
  const data = payload.data;
  return {
    ...payload,
    data: {
      ...(data.payload || {}),
      contract_version: data.contract_version,
      revision_id: data.revision_id,
      revision_number: data.revision_number,
      source_workbook_id: data.source_workbook_id,
      source_fingerprint: data.source_fingerprint,
      payload_fingerprint: data.payload_fingerprint,
      validation_status: data.validation_status,
      synchronized_at: data.imported_at,
    },
  };
}

function adaptDraftProjection(payload = {}, request = {}) {
  if (!payload.ok || !payload.data) return payload;
  const data = payload.data;
  const all = Array.isArray(data.payload?.drafts) ? data.payload.drafts : [];
  const currentYear = Math.max(...all.map((row) => integer(row.tournament_year)), 0);
  const scope = clean(request.scope || "YEARS").toUpperCase();
  const selected = all.filter((row) => {
    if (scope === "YEAR") return integer(row.tournament_year) === integer(request.year, -1);
    if (scope === "CURRENT") return integer(row.tournament_year) === currentYear;
    if (scope === "PLAYER") return (row.picks || []).some((pick) => clean(pick.player_id) === clean(request.playerId));
    return scope === "YEARS";
  }).map((row) => ({
    ...row,
    year: integer(row.tournament_year),
    normalized_picks: Array.isArray(row.normalized_picks) ? row.normalized_picks : row.picks || [],
    contract_version: data.contract_version,
    revision_id: data.revision_id,
    revision_number: data.revision_number,
    previous_revision_id: data.previous_revision_id,
    synchronized_at: data.imported_at,
    synchronized_by: data.imported_by,
  }));
  return {
    ...payload,
    data: {
      contract_version: data.contract_version,
      validation_status: data.validation_status,
      source_workbook_id: data.source_workbook_id,
      source_fingerprint: data.source_fingerprint,
      payload_fingerprint: data.payload_fingerprint,
      revision_id: data.revision_id,
      revision_number: data.revision_number,
      drafts: selected,
    },
  };
}

function adaptHistory2026(payload = {}) {
  if (!payload.ok || !payload.data) return payload;
  const data = payload.data;
  const matches = (data.matches || []).map((entry) => ({
    ...entry,
    scoring_snapshot: {
      ...(entry.snapshot || {}),
      format: entry.snapshot?.format || entry.match?.format,
      hole_definitions: Array.isArray(entry.snapshot?.hole_definitions)
        ? entry.snapshot.hole_definitions
        : entry.holes || [],
    },
  }));
  const finalMatches = matches.filter((entry) => clean(entry.match?.status).toUpperCase() === "FINAL").length;
  return {
    ...payload,
    data: {
      ...data,
      matches,
      home_presentation: data.home_presentation || data.tournament_presentation || {},
      finalized_snapshots: Array.isArray(data.finalized_snapshots) ? data.finalized_snapshots : [],
      source_fingerprint: clean(data.source_fingerprint || data.source_revision?.fingerprint || data.tournament_presentation?.source_fingerprint),
      counts: {
        players: (data.players || []).length,
        rounds: (data.rounds || []).length,
        teams: (data.teams || []).length,
        matches: matches.length,
        final_matches: finalMatches,
        live_matches: matches.length - finalMatches,
        current_finalized_snapshots: (data.finalized_snapshots || []).length,
      },
    },
  };
}

export function adaptProductionShadowCandidatePayload(payload, translation) {
  switch (translation?.adapter) {
    case "GUIDE_PROJECTION": return adaptGuideProjection(payload);
    case "PLAYER_EDITORIAL": return adaptPlayerEditorial(payload);
    case "DRAFT_PROJECTION": return adaptDraftProjection(payload, translation.request);
    case "HISTORY_2026": return adaptHistory2026(payload);
    default: return payload;
  }
}
