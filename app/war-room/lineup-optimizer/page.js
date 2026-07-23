export const dynamic = "force-dynamic";
import { Header, Footer } from "../../components";
import { refreshHistoricalData, getAllPlayerStats, getPartnershipStats, getHeadToHead } from "../../../lib/stats";
import { loadPredictionSheets } from "../../../lib/prediction-data";
import LineupOptimizer from "./LineupOptimizer";
import { pageMetadata } from "../../../lib/seo";

export const metadata = pageMetadata({
  title: "Lineup Optimizer | Sandbagger Invitational",
  description: "Rank the best legal Sandbagger Invitational pairings against every possible opponent combination.",
  path: "/war-room/lineup-optimizer",
});

export default async function LineupOptimizerPage() {
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
  } catch (e) {
    error = e.message || "Unable to load lineup data.";
  }

  return <main><Header /><LineupOptimizer initialData={data} loadError={error} /><Footer /></main>;
}
