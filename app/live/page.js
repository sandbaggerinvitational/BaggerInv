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
import { requireNetSkinsReadSource } from "../../lib/net-skins-read-source";
import { redirect } from "next/navigation";
import { isLegacyCalcuttaModule } from "../../lib/leaderboards-navigation";

export const metadata = pageMetadata({
  title: "Match Center | Sandbagger Invitational",
  description: "Round-by-round Sandbagger Invitational results and team scoring.",
  path: "/live",
});

export default async function LivePage({ searchParams }) {
  const query = await searchParams;
  const view = String(query?.view || "").trim();
  const leaderboardTab = String(query?.tab || "").trim();
  const leaderboardModule = String(query?.module || "").trim();
  if (view === "leaderboards" && (isLegacyCalcuttaModule(leaderboardTab) || isLegacyCalcuttaModule(leaderboardModule))) redirect("/live?view=calcutta");
  const requestedLeaderboardModule = leaderboardTab || leaderboardModule;
  if (view === "leaderboards" && requestedLeaderboardModule === "net-skins") redirect("/live?view=leaderboards&tab=skins");
  const source = requireTournamentReadSource();
  if (source.resolved === "supabase" && ["points", "scores"].includes(view)) redirect("/live?view=leaderboards");
  if (source.resolved === "supabase" && view && !["leaderboards", "calcutta"].includes(view)) redirect("/live");
  const leaderboardsSource = requireLeaderboardsCoreReadSource();
  const netSkinsSource = requireNetSkinsReadSource();
  const netSkinsReadSource = netSkinsSource.resolved;
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
