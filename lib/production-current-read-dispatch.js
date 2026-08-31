import "server-only";

import { PRODUCTION_TOURNAMENT_ID } from "./production-foundation-resource-contract.js";
import { readProductionCurrentTournamentRuntime } from "./production-current-tournament-runtime.js";

const clean = (value) => String(value ?? "").trim();

// These names mean "the tournament selected by the Production pointer" in
// application code. Explicit history/year reads are deliberately absent: in
// particular, the immutable HISTORY_2026 route must never follow this list.
export const PRODUCTION_POINTER_CURRENT_READ_RPCS = Object.freeze([
  "authorize_match_access",
  "read_calcutta_configuration_view",
  "read_championship_odds_inputs",
  "read_competition_derived_state",
  "read_current_guide_projection",
  "read_game_center_view",
  "read_leaderboards_core_view",
  "read_match_authorization_matrix",
  "read_my_match_view",
  "read_net_skins_input_view",
  "read_net_skins_result_view",
  "read_participant_home_view",
  "read_participant_identity_context",
  "read_production_calcutta_v1",
  "read_production_net_skins_v1",
  "read_published_odds_view",
  "read_preview_draft_view",
  "read_tournament_live_view",
  "read_tournament_secondary_view",
].sort());

const CURRENT_READ_RPC_SET = new Set(PRODUCTION_POINTER_CURRENT_READ_RPCS);

function dispatchError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/**
 * Resolve one pointer-sensitive Production read on the server. The frozen
 * 2026 branch returns the caller body unchanged so its installed RPC and
 * request shape remain byte-for-byte compatible. A future branch carries the
 * exact annual tuple to the database, which rechecks it under the shared
 * pointer-transition lock before reading any canonical facts.
 */
export async function resolveProductionCurrentReadDispatch(
  functionName,
  body = {},
  {
    env = process.env,
    readRuntime = readProductionCurrentTournamentRuntime,
  } = {},
) {
  const name = clean(functionName);
  if (!CURRENT_READ_RPC_SET.has(name)) {
    return Object.freeze({ pointerAware: false, body, annualRuntimeInput: null });
  }
  // The same logical Draft RPC also serves explicit YEAR/YEARS/PLAYER history
  // reads. Only CURRENT follows the annual pointer; explicit scopes remain
  // year/player addressed and never change when Production advances.
  if (name === "read_preview_draft_view" &&
      clean(body?.target_scope).toUpperCase() !== "CURRENT") {
    return Object.freeze({ pointerAware: false, body, annualRuntimeInput: null });
  }
  const runtime = await readRuntime({}, { env });
  if (runtime.tournamentId === PRODUCTION_TOURNAMENT_ID) {
    return Object.freeze({
      pointerAware: true,
      frozen2026: true,
      body,
      annualRuntimeInput: null,
      runtime,
    });
  }
  if (!runtime.runtimeGenerationId || !runtime.authorityGenerationId ||
      !runtime.admissionGenerationId) {
    throw dispatchError(
      "PRODUCTION_CURRENT_READ_GENERATION_REQUIRED",
      "The current Production tournament read generation is unavailable.",
    );
  }
  const annualRuntimeInput = Object.freeze({
    expected_current_tournament_id: runtime.tournamentId,
    expected_pointer_revision: runtime.pointerRevision,
    expected_runtime_generation_id: runtime.runtimeGenerationId,
    expected_annual_authority_generation_id: runtime.authorityGenerationId,
    expected_annual_admission_generation_id: runtime.admissionGenerationId,
  });
  // Current-surface caller targets are legacy routing hints, not authority.
  // Replace even a stale 2026/default hint only after the server has resolved
  // the pointer. The database repeats this selection under its transition
  // lock, so a client can neither select a year nor win a pointer race.
  const dispatchedBody = Object.freeze({
    ...body,
    target_tournament_id: runtime.tournamentId,
  });
  return Object.freeze({
    pointerAware: true,
    frozen2026: false,
    body: dispatchedBody,
    annualRuntimeInput,
    runtime,
  });
}
