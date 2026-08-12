import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "../../../components.js";
import { PLAYER_PASSPORT_COOKIE } from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";
import GameCenterReadinessClient from "./GameCenterReadinessClient.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Game Center Readiness | Sandbagger Invitational", robots: { index: false, follow: false } };

export default async function GameCenterReadinessPage() {
  const store = await cookies();
  const result = await inspectTournamentDirectorToken(store.get(PLAYER_PASSPORT_COOKIE)?.value || "");
  if (result.status !== "active") redirect("/home");
  return <main><Header homeHref="/home" /><GameCenterReadinessClient /></main>;
}
