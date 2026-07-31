import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "../../components.js";
import { PLAYER_PASSPORT_COOKIE } from "../../../lib/player-passport.js";
import { inspectPlayerPassportToken } from "../../../lib/player-passport-server.js";
import { isTournamentDirector } from "../../../lib/player-role.js";
import DirectorDashboard from "./DirectorDashboard.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournament Director | Sandbagger Invitational", robots: { index: false, follow: false } };

export default async function DirectorPage() {
  const store = await cookies();
  const result = await inspectPlayerPassportToken(store.get(PLAYER_PASSPORT_COOKIE)?.value || "");
  if (result.status !== "active" || !isTournamentDirector(result.identity)) redirect("/home");
  return <main><Header homeHref="/home" /><DirectorDashboard directorName={result.identity.player.name} /></main>;
}
