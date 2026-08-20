import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizePassportMatch, withWorkbookWriteDiagnostics } from "../../../../lib/google-sheets-write.js";
import { MATCH_ACCESS_ACTIONS, authorizeMatchAccess } from "../../../../lib/match-authorization-supabase.js";
import { requireMatchAuthorizationSource } from "../../../../lib/match-authorization-source.js";
import { createScoringSession, scoringSessionCookie } from "../../../../lib/scoring-access.js";
import { playerPassportEffectivePlayerId, playerPassportTokenFromRequest, verifyPlayerPassportSession } from "../../../../lib/player-passport.js";
import { playerRoundPerformance, playerTournamentPerformance, playerTournamentSummary } from "../../../../lib/player-round-performance.js";
import { initializeParticipantTournament } from "../../../../lib/participant-initialization.js";
import { withNormalizedReadDiagnostics } from "../../../../lib/google-sheets-server-read.js";
import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { participantIdentityPublicError, resolveSupabaseParticipantIdentity } from "../../../../lib/participant-identity-resolver.js";
import { myMatchDataFromSupabaseView, readMyMatchView } from "../../../../lib/my-match-supabase.js";
import { leaderboardsCoreDataFromSupabaseView, readLeaderboardsCoreView } from "../../../../lib/leaderboards-core-supabase.js";
import { playerProfileFromLeaderboardsCore } from "../../../../lib/player-presentation.js";

export const dynamic = "force-dynamic";

function passport(request) {
  return verifyPlayerPassportSession(playerPassportTokenFromRequest(request));
}

async function participant(request) {
  const authority = requireParticipantIdentityAuthority();
  if (authority.resolved === "supabase") {
    const resolved = await resolveSupabaseParticipantIdentity({ request, cookieStore: await cookies() });
    return { authority, resolved, playerId: resolved.playerId, tournamentId: resolved.tournamentId,
      scorerName: resolved.displayName, previewMode: resolved.previewMode };
  }
  const session = passport(request);
  return { authority, session, playerId: playerPassportEffectivePlayerId(session), tournamentId: session.tournamentId,
    scorerName: "", previewMode: false };
}

const duration = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function participantReadHeaders(identity, timings = {}, extra = {}) {
  const sessionMs = duration(identity?.resolved?.timings?.sessionVerificationMs);
  const contextMs = duration(identity?.resolved?.timings?.participantContextMs || identity?.resolved?.timings?.impersonationLeaseMs);
  const values = [
    ["session", sessionMs],
    ["identity-context", contextMs],
    ["identity", timings.identityMs],
    ["my-match", timings.myMatchMs],
    ["leaderboards-core", timings.leaderboardsCoreMs],
    ["postgres", timings.postgresMs],
    ["core-adaptation", timings.coreAdaptationMs],
    ["portrait-profile", timings.portraitMs],
    ["tournament-summary", timings.summaryMs],
    ["round-performance", timings.roundPerformanceMs],
    ["total", timings.totalMs],
  ].filter(([, value]) => duration(value) > 0);
  return {
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Participant-Identity-Authority": identity?.authority?.resolved || "passport",
    "X-Participant-Identity-Google-Requests": identity?.authority?.resolved === "supabase" ? "0" : "",
    "Server-Timing": values.map(([name, value]) => `${name};dur=${duration(value).toFixed(1)}`).join(", "),
    ...extra,
  };
}

export async function GET(request) {
  const startedAt = performance.now();
  const profileView = new URL(request.url).searchParams.get("view") === "player";
  let identity;
  const identityStartedAt = performance.now();
  try {
    identity = await participant(request);
  } catch (error) {
    if (error?.code) {
      const safe = participantIdentityPublicError(error);
      return NextResponse.json({ error: safe.message, code: safe.code }, { status: safe.status });
    }
    return NextResponse.json({ error: "Player Passport is not active." }, { status: 401 });
  }
  const identityMs = performance.now() - identityStartedAt;
  try {
    if (identity.authority.resolved === "supabase") {
      if (!profileView) {
        const myMatchStartedAt = performance.now();
        const read = await readMyMatchView({ tournamentId: identity.tournamentId, playerId: identity.playerId });
        const myMatchMs = performance.now() - myMatchStartedAt;
        if (!read.payload?.ok) throw Object.assign(new Error("Participant match context is unavailable."), { code: read.payload?.code });
        const data = myMatchDataFromSupabaseView(read.payload.data);
        const totalMs = performance.now() - startedAt;
        return NextResponse.json({ data }, { headers: participantReadHeaders(identity, {
          identityMs, myMatchMs, postgresMs: data.queryMs, totalMs,
        }, { "X-Player-Performance-Source": "not-requested" }) });
      }

      const coreStartedAt = performance.now();
      const leaderboardsRead = await readLeaderboardsCoreView(identity.tournamentId);
      const leaderboardsCoreMs = performance.now() - coreStartedAt;
      if (!leaderboardsRead.payload?.ok) {
        throw Object.assign(new Error("Leaderboards core state is unavailable."), { code: leaderboardsRead.payload?.code });
      }
      const adaptationStartedAt = performance.now();
      const tournamentData = leaderboardsCoreDataFromSupabaseView(leaderboardsRead.payload.data, {
        includeCurrentMatchLifecycle: true,
      });
      const coreAdaptationMs = performance.now() - adaptationStartedAt;
      if (!tournamentData.slotVerification.pass) {
        throw Object.assign(new Error("Canonical player-slot attribution did not validate."), {
          code: "LEADERBOARDS_PLAYER_SLOT_DIVERGENCE",
        });
      }
      const portraitStartedAt = performance.now();
      const data = playerProfileFromLeaderboardsCore(tournamentData, identity);
      const portraitMs = performance.now() - portraitStartedAt;
      const summaryStartedAt = performance.now();
      const summary = playerTournamentSummary(tournamentData, data);
      const summaryMs = performance.now() - summaryStartedAt;
      const roundsStartedAt = performance.now();
      const rounds = playerRoundPerformance(tournamentData, data);
      const roundPerformanceMs = performance.now() - roundsStartedAt;
      data.snapshot = summary.snapshot;
      data.tournamentSummary = summary.summary;
      data.roundPerformance = rounds;
      const totalMs = performance.now() - startedAt;
      const timings = {
        identityMs,
        leaderboardsCoreMs,
        postgresMs: tournamentData.queryMs,
        coreAdaptationMs,
        portraitMs,
        summaryMs,
        roundPerformanceMs,
        totalMs,
      };
      console.info("Player profile performance", {
        source: "supabase-leaderboards-core",
        playerId: identity.playerId,
        ...timings,
        supabaseServiceMs: duration(leaderboardsRead.durationMs),
        standingsCalculationMs: duration(tournamentData.calculationMs),
        clientRequests: 1,
        googleRequests: 0,
      });
      return NextResponse.json({
        active: true,
        identityAuthority: "supabase",
        previewMode: identity.previewMode,
        data,
      }, { headers: participantReadHeaders(identity, timings, {
        "X-Player-Performance-Source": "supabase-leaderboards-core",
        "X-Player-Profile-Read-Topology": "identity+leaderboards-core",
      }) });
    }
    const measured = await withWorkbookWriteDiagnostics("participant-match-initialization", () =>
      withNormalizedReadDiagnostics("GET /api/player-passport/matches", () => initializeParticipantTournament(identity.session))
    );
    const initialized = measured.result.result;
    console.info("Participant match workbook access", {
      normalized: measured.result.diagnostics,
      authenticated: measured.diagnostics,
    });
    const data = initialized.personalized;
    try {
      const tournamentData = initialized.tournamentData;
      const performance = playerTournamentPerformance(tournamentData, data);
      if (performance.snapshot) data.snapshot = { ...(data.snapshot || {}), ...performance.snapshot };
      data.tournamentSummary = performance.summary;
      data.roundPerformance = performance.rounds;
    } catch {
      // Identity and match data remain useful when optional standings are unavailable.
    }
    return NextResponse.json({ active: true, previewMode: identity.previewMode, data });
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
  let identity;
  try {
    identity = await participant(request);
  } catch (error) {
    const safe = participantIdentityPublicError(error);
    return NextResponse.json({ error: safe.message, code: safe.code }, { status: safe.status });
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
      const playerId = identity.playerId;
      const authorized = await authorizeMatchAccess({ tournamentId: identity.tournamentId, playerId, matchId, action });
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
      if (identity.authority.resolved === "supabase") throw Object.assign(new Error("Supabase identity requires Supabase match authorization."), { code: "AUTHORIZATION_SOURCE_MISMATCH" });
      access = await authorizePassportMatch(identity.session, matchId, { allowFinal: viewFinalScorecard === true });
    }
    const token = createScoringSession({ scope: "match", matchId: access.matchId, tournamentId: identity.tournamentId,
      accessVersion: access.accessVersion, scorerName: access.player.name, playerId: access.player.id, readOnly: access.readOnly,
      identityAuthority: identity.authority.resolved });
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
        identityAuthority: identity?.authority?.resolved || "unknown", stage: "match-authorization-supabase-read", code: error?.code || "AUTHORIZATION_UNAVAILABLE",
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
