import { notFound } from "next/navigation";
import { readLiveScoringMatch } from "../../lib/google-sheets-write.js";
import { getTournamentData } from "../live/sheetData.js";
import { requireGameCenterReadSource } from "../../lib/game-center-read-source.js";
import { gameCenterDataFromSupabaseView, readGameCenterView } from "../../lib/game-center-supabase.js";
import {
  gameCenterHoles,
  gameCenterNavigation,
  gameCenterPoints,
  gameCenterState,
  gameCenterStats,
  gameCenterUserTeamSide,
  finalMatchSummary,
  liveMatchResult,
  officialMatchResult,
} from "../../lib/game-center.js";

const clean = (value) => String(value ?? "").trim();

export async function getGameCenterData(matchId, currentPlayerId = "") {
  const id = clean(matchId);
  if (!id) notFound();

  const source = requireGameCenterReadSource();
  if (source.resolved === "supabase") {
    const startedAt = performance.now();
    const read = await readGameCenterView(id);
    if (!read.payload?.ok) {
      if (read.payload?.code === "MATCH_NOT_FOUND") notFound();
      const error = new Error("Game Center Supabase read failed.");
      error.code = read.payload?.code || "GAME_CENTER_SUPABASE_READ_FAILED";
      throw error;
    }
    const scoring = gameCenterDataFromSupabaseView(read.payload.data, currentPlayerId);
    const match = scoring.match;
    const teamNames = scoring.display.teamNames;
    const points = gameCenterPoints(match, scoring.holeScores);
    const state = gameCenterState(match, scoring.holeScores);
    const storedResult = officialMatchResult(match, teamNames);
    const result = liveMatchResult(match, scoring.holeScores, teamNames);
    return {
      tournament: scoring.tournament,
      match,
      display: scoring.display,
      holes: scoring.holes,
      points,
      stats: gameCenterStats(scoring.holes),
      state,
      result,
      finalSummary: finalMatchSummary(match, scoring.holeScores, teamNames),
      storedResult,
      resultConflict: state === "final" && Boolean(storedResult) && storedResult.toUpperCase() !== result.toUpperCase(),
      navigation: scoring.navigation,
      permissions: scoring.permissions,
      userTeamSide: gameCenterUserTeamSide(match, currentPlayerId),
      canConfirm: scoring.canConfirm,
      readDiagnostics: {
        source: "supabase",
        postgresQueryMs: scoring.queryMs,
        supabaseRequestMs: read.durationMs,
        gameCenterAssemblyMs: Math.round(performance.now() - startedAt),
        googleRequests: 0,
      },
    };
  }

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
  const storedResult = officialMatchResult(match, teamNames);
  const result = liveMatchResult(match, scoring.holeScores, teamNames);

  return {
    tournament: tournamentData.tournament,
    match,
    display: scoring.display,
    holes,
    points,
    stats: gameCenterStats(holes),
    state,
    result,
    finalSummary: finalMatchSummary(match, scoring.holeScores, teamNames),
    storedResult,
    resultConflict: state === "final" && Boolean(storedResult) && storedResult.toUpperCase() !== result.toUpperCase(),
    navigation: gameCenterNavigation(tournamentData.rounds, id),
    userTeamSide: gameCenterUserTeamSide(match, currentPlayerId),
    canConfirm: scoring.canConfirm,
    readDiagnostics: { source: "google" },
  };
}
