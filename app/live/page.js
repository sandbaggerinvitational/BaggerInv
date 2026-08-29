export const dynamic = "force-dynamic";
import { Header, Footer } from "../components";
import MatchCenter from "./MatchCenter";
import TournamentSupabaseRead from "./TournamentSupabaseRead";
import { getTournamentData } from "./sheetData";
import { pageMetadata } from "../../lib/seo";
import PreviewModeBadge from "../PreviewModeBadge";
import { workbookInitializationMessage } from "../../lib/tournament-workbook-initialization";
import { requireTournamentReadSource } from "../../lib/tournament-read-source";
import { redirect } from "next/navigation";
import { isLegacyCalcuttaModule } from "../../lib/leaderboards-navigation";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";

export const metadata = pageMetadata({
  title: "Match Center | Sandbagger Invitational",
  description: "Round-by-round Sandbagger Invitational results and team scoring.",
  path: "/live",
});

export default async function LivePage({ searchParams, participantPresentation = false }) {
  const env = await applicationPageEnvironment();
  const query = await searchParams;
  const view = String(query?.view || "").trim();
  const leaderboardTab = String(query?.tab || "").trim();
  const leaderboardModule = String(query?.module || "").trim();
  const explicitPwaEntry = String(query?.source || "").trim() === "shortcut";
  if (explicitPwaEntry) {
    const params = new URLSearchParams({ source: "shortcut" });
    const safeOption = (value) => /^[a-z0-9-]{1,40}$/i.test(value);
    if (leaderboardTab && safeOption(leaderboardTab)) params.set("tab", leaderboardTab);
    if (leaderboardModule && safeOption(leaderboardModule)) params.set("module", leaderboardModule);
    if (view === "leaderboards") redirect(`/app/leaderboards?${params}`);
    if (view === "calcutta") params.set("view", "calcutta");
    redirect(`/app/tournament?${params}`);
  }
  if (view === "leaderboards" && (isLegacyCalcuttaModule(leaderboardTab) || isLegacyCalcuttaModule(leaderboardModule))) redirect("/live?view=calcutta");
  const requestedLeaderboardModule = leaderboardTab || leaderboardModule;
  if (view === "leaderboards" && requestedLeaderboardModule === "net-skins") redirect("/live?view=leaderboards&tab=skins");
  const source = requireTournamentReadSource(env);
  const supabaseTournament = source.resolved === "supabase";
  let data;
  let error = "";

  if (!supabaseTournament) {
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
      {participantPresentation ? null : <Header />}
      {supabaseTournament
        ? <TournamentSupabaseRead initialView={view} presentation={participantPresentation ? "participant" : "public"} />
        : <MatchCenter initialData={data} loadError={error} previewMode={process.env.VERCEL_ENV === "preview"} />}
      {participantPresentation ? null : <Footer />}
    </main>
  );
}
