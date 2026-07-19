export const dynamic = "force-dynamic";

import { Header, Footer } from "../../components";
import { refreshHistoricalData, getAllPlayerStats, getPartnershipStats, getHeadToHead } from "../../../lib/stats";
import { loadPredictionSheets } from "../../../lib/prediction-data";
import MatchSimulator from "./MatchSimulator";

export const metadata = { title: "Match Simulator | Sandbagger Invitational" };

export default async function MatchSimulatorPage() {
  let data = null;
  let error = "";
  try {
    const sheets = await loadPredictionSheets();
    await refreshHistoricalData();
    const historical = {};
    for (const { player, stats } of getAllPlayerStats()) historical[player["Player ID"]] = stats;
    const partnerships = {};
    for (const row of getPartnershipStats().byMatches) partnerships[row.key] = { record: row.record, byFormat: row.byFormat, percentage: row.percentage };
    const ids = Object.keys(historical);
    const headToHead = {};
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) headToHead[`${ids[i]}|${ids[j]}`] = getHeadToHead(ids[i], ids[j]);
    }
    data = { sheets, historical, partnerships, headToHead };
  } catch (caughtError) {
    error = caughtError.message || "Unable to load simulation data.";
  }
  return <main><Header /><MatchSimulator initialData={data} loadError={error} /><Footer /></main>;
}
