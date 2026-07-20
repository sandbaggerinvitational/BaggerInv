import { loadPredictionSheets } from "./prediction-data";
import { refreshHistoricalData, getAllPlayerStats } from "./stats";

export async function loadOddsInputs() {
  const sheets = await loadPredictionSheets();
  await refreshHistoricalData();
  const historical = {};
  for (const { player, stats } of getAllPlayerStats()) historical[player["Player ID"]] = stats;
  return { sheets, historical };
}
