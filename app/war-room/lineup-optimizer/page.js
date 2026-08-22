export const dynamic = "force-dynamic";
import { Header, Footer } from "../../components";
import { prepareWarRoomInput } from "../../../lib/war-room-input-service";
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
    data = (await prepareWarRoomInput({ scope: "lineup" })).consumerData;
  } catch (e) {
    error = e.message || "Unable to load lineup data.";
  }

  return <main><Header /><LineupOptimizer initialData={data} loadError={error} /><Footer /></main>;
}
