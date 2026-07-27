export const dynamic = "force-dynamic";
import { Header, Footer } from "../components";
import { refreshHistoricalData, getAllPlayerStats, getPartnershipStats, getHeadToHead } from "../../lib/stats";
import { loadPredictionSheets } from "../../lib/prediction-data";
import WarRoom from "./WarRoom";
import { pageMetadata } from "../../lib/seo";
import { buildScorecardAnalytics } from "../../lib/scorecard-analytics";
import { currentTournamentYear, getTeamContext } from "../../lib/tournament-context";

export const metadata = pageMetadata({
  title: "Match Intelligence | Sandbagger Invitational",
  description: "Build SBI matchups and understand the deterministic evidence behind every prediction.",
  path: "/war-room",
});

function compactWarRoomScorecard(scorecard) {
  return {
    matchId: scorecard.matchId,
    year: scorecard.year,
    format: scorecard.format,
    courseId: scorecard.courseId,
    tee: scorecard.tee,
    playerId: scorecard.playerId,
    playerName: scorecard.playerName,
    teamId: scorecard.teamId,
    teamName: scorecard.teamName,
    participantPlayerIds: scorecard.participantPlayerIds,
    scoreType: scorecard.scoreType,
    holes: scorecard.holes.map(({ holeNumber, score, par, yardage, strokeIndex, toPar }) => ({
      holeNumber, score, par, yardage, strokeIndex, toPar,
    })),
    frontNine: scorecard.frontNine,
    backNine: scorecard.backNine,
    total: scorecard.total,
    totalToPar: scorecard.totalToPar,
  };
}

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
    const sheets=await loadPredictionSheets();
    const scorecardAnalytics=buildScorecardAnalytics({
      roundScorecards: sheets.roundScorecards,
      matches: sheets.matches,
      courseHoles: sheets.holes,
      courses: sheets.courses,
      teamNames: sheets.teamNames,
      players: sheets.players,
    });
    await refreshHistoricalData();
    const historical={};
    for(const {player,stats} of getAllPlayerStats()) historical[player["Player ID"]]=stats;
    const partnerships={};
    for(const row of getPartnershipStats().byMatches) partnerships[row.key]={record:row.record,byFormat:row.byFormat,percentage:row.percentage};
    const ids=Object.keys(historical); const headToHead={};
    for(let i=0;i<ids.length;i+=1) for(let j=i+1;j<ids.length;j+=1) headToHead[`${ids[i]}|${ids[j]}`]=getHeadToHead(ids[i],ids[j]);
    const year=currentTournamentYear(sheets);
    const teams=getTeamContext(sheets, year);
    const currentPlayerIds=new Set([...teams.team1.players, ...teams.team2.players].map((player) => player.id));
    const relevantScorecards=scorecardAnalytics.usableScorecards.filter((scorecard) =>
      (scorecard.playerId && currentPlayerIds.has(scorecard.playerId)) ||
      scorecard.participantPlayerIds?.some((playerId) => currentPlayerIds.has(playerId))
    );
    data={
      sheets,historical,partnerships,headToHead,
      scorecardAnalytics: {
        scorecards: relevantScorecards.map(compactWarRoomScorecard),
        report: scorecardAnalytics.report,
      },
    };
  } catch(e){ error=e.message || "Unable to load prediction data."; }
  return <main><Header/><WarRoom initialData={data} loadError={error} initialSelection={initialSelection}/><Footer/></main>;
}
