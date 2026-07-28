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

export const metadata = pageMetadata({
  title: "Compare Sandbaggers | Sandbagger Invitational",
  description: "Compare Sandbagger Invitational player records, ratings, formats, and head-to-head performance.",
  path: "/compare",
});

export default async function ComparePage({ searchParams }) {
  const scorecardPromise = loadScorecardAnalytics();
  await refreshHistoricalData();
  const params = await searchParams;
  const officialRecords = getRecords();
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
        official: getHeadToHead(one.id, two.id),
        scorecards: comparison.scorecards,
        progressionMatches: comparison.progressionMatches,
      });
    }
  }

  return (
    <main>
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
