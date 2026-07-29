import { notFound } from "next/navigation";
import { readLiveScoringMatch } from "../../lib/google-sheets-write.js";
import { getTournamentData } from "../live/sheetData.js";
import {
  gameCenterHoles,
  gameCenterPoints,
  gameCenterState,
  gameCenterStats,
  liveMatchResult,
  officialMatchResult,
} from "../../lib/game-center.js";

const clean = (value) => String(value ?? "").trim();

export async function getGameCenterData(matchId) {
  const id = clean(matchId);
  if (!id) notFound();

  const [tournamentData, scoring] = await Promise.all([
    getTournamentData(),
    readLiveScoringMatch(id),
  ]);
  const summary = tournamentData.rounds
    .flatMap((round) => round.matches)
    .find((match) => match.id === id);
  if (!summary) notFound();

  const match = { ...scoring.match, ...summary, id };
  const teamNames = scoring.display.teamNames;
  const holes = gameCenterHoles(scoring.holeScores, scoring.courseHoles);
  const points = gameCenterPoints(match, scoring.holeScores);
  const state = gameCenterState(match, scoring.holeScores);

  return {
    tournament: tournamentData.tournament,
    match,
    display: scoring.display,
    holes,
    points,
    stats: gameCenterStats(holes),
    state,
    result: state === "final"
      ? officialMatchResult(match, teamNames)
      : liveMatchResult(match, scoring.holeScores, teamNames),
    canConfirm: scoring.canConfirm,
  };
}
