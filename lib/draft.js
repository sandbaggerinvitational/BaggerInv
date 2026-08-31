import { loadDraftSheets } from "./google-sheets-data.js";
import {
  getPlayerMap,
  getTournament,
  getTournamentHandicap,
  getTournaments,
} from "./stats.js";
import { buildDraftPresentation } from "./draft-contract.js";
import { deriveDraftState } from "./draft-state.js";
import { requireDraftReadSource } from "./draft-read-source.js";
import { readDraftsFromSupabase } from "./draft-service.js";

export { deriveDraftState } from "./draft-state.js";

const defaultHistory = { getPlayerMap, getTournament, getTournamentHandicap, getTournaments };

async function googleDrafts(options = {}) {
  const history = options.history || defaultHistory;
  const sheets = await (options.loadDraftSheets || loadDraftSheets)();
  return (sheets.settings || [])
    .map((settings) => buildDraftPresentation(settings, sheets.picks || [], history))
    .filter(Boolean)
    .sort((left, right) => right.year - left.year);
}

export async function getDrafts(options = {}) {
  const source = requireDraftReadSource(options.env || process.env);
  return source.resolved === "supabase"
    ? readDraftsFromSupabase({ scope: "YEARS", ...options })
    : googleDrafts(options);
}

export async function getDraftByYear(year, options = {}) {
  const source = requireDraftReadSource(options.env || process.env);
  if (source.resolved === "supabase") {
    return (await readDraftsFromSupabase({ scope: "YEAR", year: Number(year), ...options }))[0] || null;
  }
  return (await googleDrafts(options)).find((draft) => draft.year === Number(year)) || null;
}

export async function getCurrentDraft(options = {}) {
  const source = requireDraftReadSource(options.env || process.env);
  if (source.resolved === "supabase") {
    const tournamentId = String(options.tournamentId || "").trim();
    const currentScope = tournamentId
      ? { scope: "YEAR", year: Number(tournamentId) }
      : { scope: "CURRENT" };
    return (await readDraftsFromSupabase({ ...currentScope, ...options }))[0] || null;
  }
  const history = options.history || defaultHistory;
  const currentYear = history.getTournaments()[0]?.year;
  return currentYear ? (await googleDrafts(options)).find((draft) => draft.year === Number(currentYear)) || null : null;
}

export async function getPlayerDrafts(playerId, options = {}) {
  const source = requireDraftReadSource(options.env || process.env);
  if (source.resolved === "supabase") {
    return readDraftsFromSupabase({ scope: "PLAYER", playerId, ...options });
  }
  return (await googleDrafts(options)).filter((draft) =>
    draft.picks.some((pick) => pick.player?.id === String(playerId || "").trim())
  );
}

export async function getDraftYears(options = {}) {
  return (await getDrafts(options)).map((draft) => draft.year);
}
