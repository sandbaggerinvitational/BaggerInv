import { scoringShadowRpc } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();

export function importDraftProjection(input, options = {}) {
  return scoringShadowRpc("import_preview_draft_projection", { input }, {
    ...options,
    timeoutMs: options.timeoutMs || 20_000,
  });
}

export function readDraftProjection({ scope = "YEARS", year = null, playerId = "", tournamentId = "" } = {}, options = {}) {
  const targetYear = clean(year);
  return scoringShadowRpc("read_preview_draft_view", {
    target_scope: clean(scope).toUpperCase(),
    target_year: targetYear && Number.isInteger(Number(targetYear)) ? Number(targetYear) : null,
    target_player_id: clean(playerId) || null,
    target_tournament_id: clean(tournamentId) || null,
  }, {
    ...options,
    timeoutMs: options.timeoutMs || 12_000,
  });
}
