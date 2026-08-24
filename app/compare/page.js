export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../lib/stats";
import { Header, Footer } from "../components";
import {
  getHeadToHead,
  getRecords,
} from "../../lib/stats";
import CompareTool from "./CompareTool";
import { pageMetadata } from "../../lib/seo";
import { loadScorecardAnalytics } from "../../lib/scorecard-data";
import {
  buildHeadToHeadComparison,
  buildPlayerComparisonProfiles,
} from "../../lib/player-comparison";
import { isSupabaseSecondaryHistory } from "../../lib/secondary-history-read-source";
import { loadSecondaryHistoryModel } from "../../lib/secondary-history-service";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";

export const metadata = pageMetadata({
  title: "Compare Sandbaggers | Sandbagger Invitational",
  description: "Compare Sandbagger Invitational player records, ratings, formats, and head-to-head performance.",
  path: "/compare",
});

export default async function ComparePage({ searchParams }) {
  const env = await applicationPageEnvironment();
  const useSupabase = isSupabaseSecondaryHistory(env);
  const secondaryHistory = useSupabase ? await loadSecondaryHistoryModel({ env }) : null;
  const scorecardPromise = useSupabase
    ? Promise.resolve(secondaryHistory.scorecardAnalytics)
    : loadScorecardAnalytics();
  if (!useSupabase) await refreshHistoricalData();
  const params = await searchParams;
  const officialRecords = useSupabase
    ? secondaryHistory.calculations.getRecords()
    : getRecords();
  const scorecardAnalytics = await scorecardPromise;
  const comparison = buildPlayerComparisonProfiles({
    allPlayerStats: officialRecords.all,
    scorecards: scorecardAnalytics.scorecards,
    ghostMatchExclusions: scorecardAnalytics.ghostMatchExclusions,
  });
  const players = comparison.profiles;

  const headToHead = {};
  for (let oneIndex = 0; oneIndex < players.length; oneIndex += 1) {
    for (let twoIndex = oneIndex + 1; twoIndex < players.length; twoIndex += 1) {
      const one = players[oneIndex];
      const two = players[twoIndex];
      headToHead[`${one.id}|${two.id}`] = buildHeadToHeadComparison({
        playerAId: one.id,
        playerBId: two.id,
        official: useSupabase
          ? secondaryHistory.calculations.getHeadToHead(one.id, two.id)
          : getHeadToHead(one.id, two.id),
        scorecards: comparison.scorecards,
        progressionMatches: comparison.progressionMatches,
      });
    }
  }

  return (
    <main data-secondary-history-source={useSupabase ? "supabase" : "google"}>
      <Header />

      <CompareTool
        players={players}
        headToHead={headToHead}
        initialPlayerOne={params?.player1 ?? ""}
        initialPlayerTwo={params?.player2 ?? ""}
      />

      <Footer />
    </main>
  );
}
