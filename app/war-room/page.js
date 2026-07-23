export const dynamic = "force-dynamic";
import { Header, Footer } from "../components";
import { refreshHistoricalData, getAllPlayerStats, getPartnershipStats, getHeadToHead } from "../../lib/stats";
import { loadPredictionSheets } from "../../lib/prediction-data";
import WarRoom from "./WarRoom";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Matchup Lab | Sandbagger Invitational",
  description: "Build Sandbagger Invitational matchups and evaluate the competitive edges behind every pairing.",
  path: "/war-room",
});

export default async function WarRoomPage({ searchParams }) {
  const query = await searchParams;
  const legacyPlayers = String(query?.players || "").split(",").filter(Boolean);
  const initialSelection = {
    format: String(query?.format || "").toUpperCase(),
    tee: String(query?.tee || ""),
    players: [query?.p1, query?.p2, query?.p3, query?.p4]
      .map((value) => String(value || ""))
      .filter(Boolean),
  };
  if (!initialSelection.players.length) initialSelection.players = legacyPlayers;
  let data=null, error="";
  try {
    const sheets=await loadPredictionSheets();
    await refreshHistoricalData();
    const historical={};
    for(const {player,stats} of getAllPlayerStats()) historical[player["Player ID"]]=stats;
    const partnerships={};
    for(const row of getPartnershipStats().byMatches) partnerships[row.key]={record:row.record,byFormat:row.byFormat,percentage:row.percentage};
    const ids=Object.keys(historical); const headToHead={};
    for(let i=0;i<ids.length;i+=1) for(let j=i+1;j<ids.length;j+=1) headToHead[`${ids[i]}|${ids[j]}`]=getHeadToHead(ids[i],ids[j]);
    data={sheets,historical,partnerships,headToHead};
  } catch(e){ error=e.message || "Unable to load prediction data."; }
  return <main><Header/><WarRoom initialData={data} loadError={error} aiConfigured={Boolean(process.env.OPENAI_API_KEY)} initialSelection={initialSelection}/><Footer/></main>;
}
