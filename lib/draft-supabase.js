import { scoringShadowRpc } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();

export function importDraftProjection(input, options = {}) {
  return scoringShadowRpc("import_preview_draft_projection", { input }, {
    ...options,
    timeoutMs: options.timeoutMs || 20_000,
  });
}

export function readDraftProjection({ scope = "YEARS", year = null, playerId = "" } = {}, options = {}) {
  return scoringShadowRpc("read_preview_draft_view", {
    target_scope: clean(scope).toUpperCase(),
    target_year: Number.isInteger(Number(year)) ? Number(year) : null,
    target_player_id: clean(playerId) || null,
  }, {
    ...options,
    timeoutMs: options.timeoutMs || 12_000,
  });
}
