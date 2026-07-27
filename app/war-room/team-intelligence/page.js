export const dynamic = "force-dynamic";
import { Header, Footer } from "../../components";
import {
  refreshHistoricalData,
  getPartnershipStats,
  getRecords,
  getTournaments,
  getTournamentMatches,
  getHeadToHead,
} from "../../../lib/stats";
import { loadPredictionSheets } from "../../../lib/prediction-data";
import { loadScorecardAnalytics } from "../../../lib/scorecard-data";
import { buildPlayerComparisonProfiles } from "../../../lib/player-comparison";
import { buildPartnershipIntelligence, buildTeamAggregate } from "../../../lib/team-intelligence";
import TeamIntelligence from "./TeamIntelligence";
import { pageMetadata } from "../../../lib/seo";

export const metadata = pageMetadata({
  title: "Team Intelligence & Lineup Lab | Sandbagger Invitational",
  description: "Analyze SBI partnerships, compare historical teams, and build opponent-aware tournament lineups.",
  path: "/war-room/team-intelligence",
});

const TOOL_KEYS = new Set(["lineup-lab", "partnership-analyzer", "team-comparison", "historical-rankings"]);

export default async function TeamIntelligencePage({ searchParams }) {
  let data = null;
  let error = "";
  const params = await searchParams;
  const initialTool = TOOL_KEYS.has(params?.tool) ? params.tool : "lineup-lab";
  try {
    const [sheets, scorecardAnalytics] = await Promise.all([
      loadPredictionSheets(),
      loadScorecardAnalytics(),
      refreshHistoricalData(),
    ]).then(([sheetData, analytics]) => [sheetData, analytics]);
    const officialRecords = getRecords();
    const comparison = buildPlayerComparisonProfiles({
      allPlayerStats: officialRecords.all,
      scorecards: scorecardAnalytics.scorecards,
      ghostMatchExclusions: scorecardAnalytics.ghostMatchExclusions,
    });
    const tournaments = getTournaments();
    const tournamentMatches = tournaments.flatMap((tournament) => getTournamentMatches(tournament.year));
    const officialPartnerships = getPartnershipStats().byMatches;
    const partnerships = buildPartnershipIntelligence({
      partnershipRows: officialPartnerships,
      progressionMatches: comparison.progressionMatches,
      scorecards: comparison.scorecards,
      tournaments,
      tournamentMatches,
      players: comparison.profiles,
    });
    const profilesById = Object.fromEntries(comparison.profiles.map((player) => [player.id, player]));
    const seasons = tournaments.map((tournament) => ({
      year: tournament.year,
      teams: tournament.teams.map((team) => buildTeamAggregate(team, profilesById)),
    })).filter((season) => season.teams.length);
    const historical = {};
    for (const { player, stats } of officialRecords.all) historical[player["Player ID"]] = stats;
    const partnershipPredictionMap = Object.fromEntries(officialPartnerships.map((row) => [
      row.key,
      { record: row.record, byFormat: row.byFormat, percentage: row.percentage },
    ]));
    const ids = Object.keys(historical);
    const headToHead = {};
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) headToHead[`${ids[i]}|${ids[j]}`] = getHeadToHead(ids[i], ids[j]);
    }
    data = {
      sheets,
      players: comparison.profiles,
      partnerships,
      seasons,
      historical,
      partnershipPredictionMap,
      headToHead,
    };
  } catch (caught) {
    console.error("Failed loading Team Intelligence", caught);
    error = caught?.message || "Unable to load Team Intelligence.";
  }
  return <main><Header /><TeamIntelligence initialData={data} loadError={error} initialTool={initialTool} /><Footer /></main>;
}
