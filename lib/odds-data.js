import { loadPredictionSheets } from "./prediction-data";
import { refreshHistoricalData, getAllPlayerStats } from "./stats";
import { currentTournamentYear } from "./tournament-context";
import { bindOfficialProjectionMatches } from "./odds-pairing-source";

export async function loadOddsInputs() {
  const loadedSheets = await loadPredictionSheets();
  const sheets = bindOfficialProjectionMatches(loadedSheets, currentTournamentYear(loadedSheets));
  await refreshHistoricalData();
  const historical = {};
  for (const { player, stats } of getAllPlayerStats()) historical[player["Player ID"]] = stats;
  return { sheets, historical };
}
