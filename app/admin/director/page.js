import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "../../components.js";
import { PLAYER_PASSPORT_COOKIE } from "../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../lib/player-passport-server.js";
import DirectorDashboard from "./DirectorDashboard.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournament Director | Sandbagger Invitational", robots: { index: false, follow: false } };

export default async function DirectorPage() {
  const store = await cookies();
  const result = await inspectTournamentDirectorToken(store.get(PLAYER_PASSPORT_COOKIE)?.value || "");
  if (["inactive", "forbidden"].includes(result.status)) redirect("/home");
  return <main><Header homeHref="/home" /><DirectorDashboard directorName={result.identity?.actor?.name || "Tournament Director"} /></main>;
}
