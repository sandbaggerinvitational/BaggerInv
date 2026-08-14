export const dynamic = "force-dynamic";
import { Header, Footer } from "../components";
import MatchCenter from "./MatchCenter";
import LeaderboardsSupabaseRead from "./LeaderboardsSupabaseRead";
import TournamentSupabaseRead from "./TournamentSupabaseRead";
import { getTournamentData } from "./sheetData";
import { pageMetadata } from "../../lib/seo";
import PreviewModeBadge from "../PreviewModeBadge";
import styles from "./tournament-dashboard.module.css";
import { workbookInitializationMessage } from "../../lib/tournament-workbook-initialization";
import { requireTournamentReadSource } from "../../lib/tournament-read-source";
import { requireLeaderboardsCoreReadSource } from "../../lib/leaderboards-core-read-source";
import { netSkinsReadEnvironment } from "../../lib/net-skins-read-source";
import { redirect } from "next/navigation";

export const metadata = pageMetadata({
  title: "Match Center | Sandbagger Invitational",
  description: "Round-by-round Sandbagger Invitational results and team scoring.",
  path: "/live",
});

export default async function LivePage({ searchParams }) {
  const query = await searchParams;
  const view = String(query?.view || "").trim();
  const leaderboardModule = String(query?.tab || query?.module || "").trim();
  if (view === "leaderboards" && leaderboardModule === "calcutta") redirect("/live?view=calcutta");
  if (view === "leaderboards" && leaderboardModule === "net-skins") redirect("/live?view=leaderboards&tab=skins");
  const source = requireTournamentReadSource();
  const leaderboardsSource = requireLeaderboardsCoreReadSource();
  const netSkinsSource = netSkinsReadEnvironment();
  const netSkinsReadSource = netSkinsSource.previewDeployment && netSkinsSource.requested === "supabase" ? "supabase" : netSkinsSource.resolved;
  const supabaseLeaderboards = leaderboardsSource.resolved === "supabase" && view === "leaderboards";
  const supabaseTournament = source.resolved === "supabase" && (!view || view === "calcutta");
  let data;
  let error = "";

  if (!supabaseTournament && !supabaseLeaderboards) {
    try {
      data = await getTournamentData();
    } catch (caughtError) {
      console.error(caughtError);
      error = workbookInitializationMessage(
        caughtError,
        "Tournament data is temporarily unavailable. Confirm the normalized tournament workbook is configured for this environment."
      );
    }
  }

  return (
    <main>
      <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
      <Header homeHref="/home" />
      {supabaseTournament ? <TournamentSupabaseRead initialView={view} /> : supabaseLeaderboards
        ? <LeaderboardsSupabaseRead previewMode={process.env.VERCEL_ENV === "preview"} netSkinsReadSource={netSkinsReadSource} />
        : <MatchCenter initialData={data} loadError={error} previewMode={process.env.VERCEL_ENV === "preview"} />}
      <div className={styles.tournamentFooter}><Footer /></div>
    </main>
  );
}
