export const dynamic = "force-dynamic";
import { Header, Footer } from "../../components";
import { prepareWarRoomInput } from "../../../lib/war-room-input-service";
import TeamIntelligence from "./TeamIntelligence";
import { pageMetadata } from "../../../lib/seo";

export const metadata = pageMetadata({
  title: "Team Intelligence & Lineup Lab | Sandbagger Invitational",
  description: "Analyze SBI partnerships, compare historical teams, and build opponent-aware tournament lineups.",
  path: "/war-room/team-intelligence",
});

const TOOL_KEYS = new Set(["lineup-lab", "partnership-analyzer", "team-comparison", "historical-rankings"]);

export default async function TeamIntelligencePage({ searchParams }) {
  let data = null;
  let error = "";
  const params = await searchParams;
  const initialTool = TOOL_KEYS.has(params?.tool) ? params.tool : "lineup-lab";
  try {
    data = (await prepareWarRoomInput({ scope: "team-intelligence" })).consumerData;
  } catch (caught) {
    console.error("Failed loading Team Intelligence", caught);
    error = caught?.message || "Unable to load Team Intelligence.";
  }
  return <main><Header /><TeamIntelligence initialData={data} loadError={error} initialTool={initialTool} /><Footer /></main>;
}
