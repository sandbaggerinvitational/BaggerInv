import { NextResponse } from "next/server";
import { authorizePassportMatch, readPlayerPassportMatches, withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write.js";
import { MATCH_ACCESS_ACTIONS, authorizeMatchAccess } from "../../../../lib/match-authorization-supabase.js";
import { requireMatchAuthorizationSource } from "../../../../lib/match-authorization-source.js";
import { createScoringSession, scoringSessionCookie } from "../../../../lib/scoring-access.js";
import { playerPassportEffectivePlayerId, playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
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
  const startedAt = performance.now();
  let session;
  try {
    session = passport(request);
  } catch {
    return NextResponse.json({ error: "This match is not available for Player Passport scoring." }, { status: 403 });
  }
  let source;
  try { source = requireMatchAuthorizationSource(); }
  catch (error) {
    console.error("Match authorization configuration unavailable", { code: error?.code || "", message: error?.message || String(error) });
    return NextResponse.json({ error: "Scorecard authorization is temporarily unavailable.", code: "AUTHORIZATION_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const { matchId, viewFinalScorecard = false } = await request.json();
    const action = viewFinalScorecard === true ? MATCH_ACCESS_ACTIONS.VIEW_FINAL_SCORECARD : MATCH_ACCESS_ACTIONS.START_SCORING;
    let access;
    let postgresMs = 0;
    let serviceMs = 0;
    if (source.resolved === "supabase") {
      const playerId = playerPassportEffectivePlayerId(session);
      const authorized = await authorizeMatchAccess({ tournamentId: session.tournamentId, playerId, matchId, action });
      if (!authorized.payload || typeof authorized.payload.allowed !== "boolean") throw Object.assign(new Error("Supabase match authorization returned no decision."), { code: "AUTHORIZATION_UNAVAILABLE" });
      if (!authorized.payload.allowed) {
        const status = ["NOT_MATCH_PARTICIPANT", "TOURNAMENT_MEMBERSHIP_INACTIVE"].includes(authorized.payload.code) ? 403 : 409;
        console.info("Supabase match authorization denied", { action, matchId, playerId, code: authorized.payload.code });
        return NextResponse.json({
          error: action === MATCH_ACCESS_ACTIONS.VIEW_FINAL_SCORECARD
            ? "This final scorecard is not available for this Player Passport."
            : "This match is not available for Player Passport scoring.",
          code: authorized.payload.code,
        }, { status, headers: { "X-Match-Authorization-Source": "supabase", "X-Match-Authorization-Google-Requests": "0" } });
      }
      postgresMs = Number(authorized.payload.query_ms || 0);
      serviceMs = Number(authorized.durationMs || 0);
      access = {
        player: { id: authorized.payload.player_id, name: authorized.payload.player_display_name || authorized.payload.player_id },
        matchId: authorized.payload.match_id,
        accessVersion: Number(authorized.payload.permission_revision || authorized.payload.match_permission_revision || 0),
        readOnly: authorized.payload.read_only === true,
      };
    } else {
      access = await authorizePassportMatch(session, matchId, { allowFinal: viewFinalScorecard === true });
    }
    const token = createScoringSession({ scope: "match", matchId: access.matchId, tournamentId: session.tournamentId,
      accessVersion: access.accessVersion, scorerName: access.player.name, playerId: access.player.id, readOnly: access.readOnly });
    const totalMs = performance.now() - startedAt;
    console.info("Player Passport match authorization", { source: source.resolved, action, matchId: access.matchId,
      playerId: access.player.id, readOnly: access.readOnly, postgresMs, serviceMs, totalMs, googleRequests: source.resolved === "supabase" ? 0 : null });
    const response = NextResponse.json({ authorized: true, action, readOnly: access.readOnly,
      permissionRevision: access.accessVersion, source: source.resolved });
    response.cookies.set(scoringSessionCookie(token));
    response.headers.set("Server-Timing", `postgres;dur=${postgresMs.toFixed(1)}, supabase;dur=${serviceMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    response.headers.set("X-Match-Authorization-Source", source.resolved);
    if (source.resolved === "supabase") response.headers.set("X-Match-Authorization-Google-Requests", "0");
    return response;
  } catch (error) {
    if (source.resolved === "supabase") {
      console.error("Supabase match authorization unavailable", { route: "POST /api/player-passport/matches",
        signedPassportValid: true, stage: "match-authorization-supabase-read", code: error?.code || "AUTHORIZATION_UNAVAILABLE",
        reason: error?.message || String(error) });
      return NextResponse.json({ error: "Scorecard authorization is temporarily unavailable.", code: "AUTHORIZATION_UNAVAILABLE" },
        { status: 503, headers: { "X-Match-Authorization-Source": "supabase", "X-Match-Authorization-Google-Requests": "0" } });
    }
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
