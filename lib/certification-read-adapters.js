// Logical aliases preserve existing public read DTOs, never a Production
// resource envelope. The database gateway owns contracts and provenance.
import { certificationProjectionRpc } from "./certification-runtime-server.js";
import { adaptProductionShadowCandidatePayload } from "./production-shadow-read-adapters.js";

const SURFACES = Object.freeze({read_tournament_live_view:"TOURNAMENT_LIVE",read_leaderboards_core_view:"LEADERBOARDS",
  read_participant_home_view:"PARTICIPANT_HOME",read_my_match_view:"MY_MATCH",read_game_center_view:"GAME_CENTER",
  read_match_authorization_matrix:"MATCH_AUTHORIZATION",read_net_skins_input_view:"NET_SKINS_INPUT",read_net_skins_result_view:"NET_SKINS_RESULT",
  read_calcutta_configuration_view:"CALCUTTA_CONFIGURATION",read_published_odds_view:"PUBLISHED_ODDS",
  read_championship_odds_inputs:"ODDS_INPUT",read_participant_identity_context:"PARTICIPANT_IDENTITY",read_competition_derived_state:"COMPETITION_DERIVED"});
const clean = value => String(value ?? "").trim();
export async function certificationReadAliasRpc(name, body = {}, options = {}) {
  let operation, payload = {}, adapter = "IDENTITY", request;
  const input = body.input || {}, target = clean(body.target_tournament_id || input.target_tournament_id);
  for (const source of [body, input]) {
    if (Object.keys(source).some(key => /^(?:resource|deployment|authorization|environment|project_ref|project_url|source_workbook_id|target_source_workbook_id|actor_auth_user_id|actor_player_id|resource_id|context_token|expected_context_token)$/.test(key) && source[key] !== null && source[key] !== undefined && source[key] !== "")) {
      throw Object.assign(new Error("Certification read payload contains authority."), {code:"CERTIFICATION_INPUT_INVALID",status:400});
    }
  }
  if (name === "read_production_calcutta_v1") {
    // Server-resolved participant only; no reviewer, target authority or generic
    // financial read. SQL applies the unchanged shipping publication projection.
    if (Object.keys(body).some(key => key !== "input") || Object.keys(input).some(key => key !== "player_id")
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(clean(input.player_id))) {
      throw Object.assign(new Error("Certification Calcutta reader identity is required."), {code:"CERTIFICATION_INPUT_INVALID",status:400});
    }
    operation = "READS.PUBLISHED_CALCUTTA"; payload = {player_id: clean(input.player_id)};
  } else if (Object.hasOwn(SURFACES, name)) {
    operation = "READS.CURRENT_VIEW"; payload = {surface: SURFACES[name], ...(target ? {target_tournament_id: target} : {})};
    if (["PARTICIPANT_HOME","MY_MATCH","PARTICIPANT_IDENTITY"].includes(payload.surface)) payload.player_id = clean(body.target_player_id || input.player_id);
    if (payload.surface === "GAME_CENTER") payload.match_id = clean(body.target_match_id);
    if (payload.surface === "COMPETITION_DERIVED") payload.engine_keys = body.target_engine_keys || input.engine_keys || [];
  } else if (["read_preview_2026_historical_view","read_canonical_2026_historical_view"].includes(name)) {
    operation = "READS.HISTORY_2026"; adapter = "HISTORY_2026";
    payload = {...(target ? {target_tournament_id: target} : {})};
  } else if (name === "read_preview_completed_history") {
    operation = "READS.COMPLETED_HISTORY"; payload = {mode: clean(input.mode || input.scope || "YEARS").toUpperCase(), ...(input.tournament_year ? {tournament_year: Number(input.tournament_year)} : {})};
  } else if (name === "read_canonical_closed_tournament_view") {
    operation = "READS.CLOSED_TOURNAMENT"; payload = {target_tournament_id:target};
  } else if (name === "read_canonical_closed_history_2026_bundle") {
    operation = "READS.CLOSED_HISTORY_2026";
    payload = {target_tournament_id:target,
      include_tournament_player_metadata:body.include_tournament_player_metadata};
  } else if (name === "read_current_guide_projection") {
    operation = "READS.GUIDE"; adapter = "GUIDE_PROJECTION"; payload = {...(target ? {target_tournament_id: target} : {})};
  } else if (name === "read_preview_draft_view") {
    operation = "READS.DRAFT"; adapter = "DRAFT_PROJECTION";
    request = {scope: clean(body.target_scope || "YEARS").toUpperCase(), year: body.target_year ?? null, playerId: clean(body.target_player_id)};
    payload = {target_scope: request.scope, target_year: request.year, target_player_id: request.playerId || null, ...(target ? {target_tournament_id: target} : {})};
  } else if (name === "read_preview_secondary_history_players") {
    operation = "READS.PLAYER_EDITORIAL"; adapter = "PLAYER_EDITORIAL";
  } else if (name === "read_production_prediction_settings") {
    operation = "READS.PREDICTION_SETTINGS";
  } else {
    throw Object.assign(new Error("Certification does not admit this legacy RPC."), {code:"CERTIFICATION_LEGACY_RPC_FORBIDDEN",status:403});
  }
  const result = await certificationProjectionRpc(operation, payload, {env: options.env, context: options.certificationContext},
    {...options.certificationDependencies, ...(options.fetchImpl ? {fetchImpl: options.fetchImpl} : {}), ...(options.timeoutMs ? {timeoutMs: options.timeoutMs} : {})});
  if (operation === "READS.CLOSED_HISTORY_2026" && result.payload?.ok === true) {
    const data = result.payload.data;
    if (!data || !data.history?.ok || !data.guide?.ok) {
      throw Object.assign(new Error("Canonical closed History bundle is incomplete."), {code:"CERTIFICATION_HISTORY_RESPONSE_INVALID",status:503});
    }
    return {...result,payload:{...result.payload,data:{...data,
      history:adaptProductionShadowCandidatePayload(data.history,{adapter:"HISTORY_2026"}),
      guide:adaptProductionShadowCandidatePayload(data.guide,{adapter:"GUIDE_PROJECTION"})}}};
  }
  return {...result, payload: adaptProductionShadowCandidatePayload(result.payload, {adapter,request})};
}
