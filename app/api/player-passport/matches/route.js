import { NextResponse } from "next/server";
import { authorizePassportMatch, readPlayerPassportMatches, withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write.js";
import { createScoringSession, scoringSessionCookie } from "../../../../lib/scoring-access.js";
import { playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { getTournamentData } from "../../../live/sheetData.js";
import { playerPerformanceRows, rankPlayerRows } from "../../../../lib/mobile-leaderboards.js";
import { playerRoundPerformance } from "../../../../lib/player-round-performance.js";
import { initializeParticipantTournament } from "../../../../lib/participant-initialization.js";
import { withNormalizedReadDiagnostics } from "../../../../lib/google-sheets-server-read.js";

export const dynamic = "force-dynamic";

function passport(request) {
  return verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
}

export async function GET(request) {
  let session;
  try {
    session = passport(request);
  } catch {
    return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
  }
  try {
    const measured = await withWorkbookWriteDiagnostics("participant-match-initialization", () =>
      withNormalizedReadDiagnostics("GET /api/player-passport/matches", () => initializeParticipantTournament(session))
    );
    const initialized = measured.result.result;
    console.info("Participant match workbook access", {
      normalized: measured.result.diagnostics,
      authenticated: measured.diagnostics,
    });
    const data = initialized.personalized;
    try {
      const tournamentData = initialized.tournamentData;
      const standings = rankPlayerRows(
        playerPerformanceRows(tournamentData.leaderboard || [], tournamentData.scoreLeaderboard || [], tournamentData.rounds || []),
        "points"
      );
      const standing = standings.find((row) => String(row.id) === String(data.player.id));
      if (standing && data.snapshot) data.snapshot.standing = standing.displayRank;
      data.roundPerformance = playerRoundPerformance(tournamentData, data);
    } catch {
      // Identity and match data remain useful when optional standings are unavailable.
    }
    return NextResponse.json({ data });
  } catch (error) {
    if (/no longer active|not active in this tournament/i.test(String(error?.message || ""))) {
      return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
    }
    console.error("Player Passport match freshness temporarily unavailable", {
      route: "GET /api/player-passport/matches",
      signedPassportValid: true,
      stage: "tournament-workbook-read",
      reason: error?.message || String(error),
    });
    return NextResponse.json(
      { error: "Tournament information is temporarily unavailable. Please try again.", transient: true },
      { status: 503, headers: { "retry-after": "1" } }
    );
  }
}

export async function POST(request) {
  let session;
  try {
    session = passport(request);
  } catch {
    return NextResponse.json({ error: "This match is not available for Player Passport scoring." }, { status: 403 });
  }
  try {
    const { matchId, viewFinalScorecard = false } = await request.json();
    const access = await authorizePassportMatch(session, matchId, { allowFinal: viewFinalScorecard === true });
    const token = createScoringSession({ scope: "match", matchId: access.matchId, accessVersion: access.accessVersion, scorerName: access.player.name, readOnly: access.readOnly });
    const response = NextResponse.json({ authorized: true });
    response.cookies.set(scoringSessionCookie(token));
    return response;
  } catch (error) {
    if (/not available|not active|not assigned/i.test(String(error?.message || ""))) {
      return NextResponse.json({ error: "This match is not available for Player Passport scoring." }, { status: 403 });
    }
    console.error("Player Passport scoring authorization temporarily unavailable", {
      route: "POST /api/player-passport/matches",
      signedPassportValid: true,
      stage: "match-authorization-workbook-read",
      reason: error?.message || String(error),
    });
    return NextResponse.json(
      { error: "Scoring is temporarily unavailable. Please try again.", transient: true },
      { status: 503, headers: { "retry-after": "1" } }
    );
  }
}
