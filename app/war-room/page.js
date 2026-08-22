export const dynamic = "force-dynamic";
import { Header, Footer } from "../components";
import { prepareWarRoomInput } from "../../lib/war-room-input-service";
import WarRoom from "./WarRoom";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Match Intelligence | Sandbagger Invitational",
  description: "Build SBI matchups and understand the deterministic evidence behind every prediction.",
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
    data = (await prepareWarRoomInput({ scope: "war-room" })).consumerData;
  } catch(e){ error=e.message || "Unable to load prediction data."; }
  return <main><Header/><WarRoom initialData={data} loadError={error} initialSelection={initialSelection}/><Footer/></main>;
}
