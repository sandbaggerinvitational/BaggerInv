import { leadersRoundContext, mobilePlayerIntelligence, requireLeadersBounds, playerLeadersProjectionSource } from "./mobile-v1-leaders-intelligence.js";
import { mobilePlayerRoundPerformance } from "./mobile-v1-player-round-performance.js";
import { mobileR1RoundCompetition } from "./mobile-v1-r1-round-competition.js";
import { mobileR2PairCompetition } from "./mobile-v1-r2-pair-competition.js";
import { mobileR3RoundCompetition } from "./mobile-v1-r3-round-competition.js";
import { isCanonicalReviewer } from './mobile-reviewer-identity.js';
import { requireHomeReadSource } from "./home-read-source.js";
import { participantHomeDataFromSupabaseView, readParticipantHomeView } from "./participant-home-supabase.js";
import { requireTournamentReadSource } from "./tournament-read-source.js";
import { readTournamentLiveView, tournamentLiveDataFromSupabaseView } from "./tournament-live-supabase.js";
import { requireLeaderboardsCoreReadSource } from "./leaderboards-core-read-source.js";
import { leaderboardsCoreDataFromSupabaseView, readLeaderboardsCoreView } from "./leaderboards-core-supabase.js";
import { playerPerformanceRows, rankPlayerRows, teamStandings } from "./mobile-leaderboards.js";
import { readGuideProjection } from "./guide-supabase.js";
import { applyGuideCoursesToTournament, applyGuideProjectionToHome, guideParticipantProjection } from "./guide-participant-adapter.js";
import { isOfficialMatchResult, roundStatus } from "./live-tournament.js";
import { tournamentDateTime, publishedTournamentTimeZone } from "./tournament-timeline.js";
import { MobileApiError, MOBILE_API_VERSION } from "./mobile-api-v1.js";
import { requireOpaqueMatchID } from "./mobile-opaque-match-id.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();
const numeric = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
  ? null : Number(value);
const generatedAt = (now) => (now instanceof Date ? now : new Date(now || Date.now())).toISOString();

export const MOBILE_MATCHES_LIMITS = Object.freeze({
  matches: 64,
  participantsPerSide: 2,
  responseBytes: 262_144,
});

function canonicalNumber(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  return result;
}

function canonicalStrokes(value) {
  const result = canonicalNumber(value);
  if (result !== null && (!Number.isSafeInteger(result) || result < 0)) {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  return result;
}

function requireMatchesValue(value) {
  if (!value) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
}

function requireSupabaseSource(check) {
  try {
    if (check().resolved !== "supabase") throw new Error("source mismatch");
  } catch {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
}

function successfulRead(read) {
  if (!read?.payload?.ok || !read.payload.data) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  return read.payload.data;
}

function timeZone(value) {
  const candidate = clean(value) || "America/Chicago";
  try { new Intl.DateTimeFormat("en-US", { timeZone: candidate }); return candidate; }
  catch { return "America/Chicago"; }
}

// Schedule and Guide already resolve wall-clock times from the published
// Guide identity. Native match summaries must use that same timezone instead
// of the retained Home/Tournament presentation's historical default.
function publishedTimeZone(read, fallback) {
  const { content } = guideParticipantProjection(read);
  return publishedTournamentTimeZone(content, fallback);
}

function localTime(value) {
  const source = clean(value);
  if (!source) return null;
  const match = source.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const period = clean(match[4]).toUpperCase();
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function calendarDate(value) {
  return clean(value).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null;
}

function eventDto(row = {}, zone = "America/Chicago") {
  const date = calendarDate(row["Event Date"] ?? row.date);
  const startLabel = clean(row["Start Time"] ?? row.startTime);
  const endLabel = clean(row["End Time"] ?? row.endTime);
  const start = date && startLabel ? tournamentDateTime(date, startLabel, zone)?.toISOString() || null : null;
  const end = date && endLabel ? tournamentDateTime(date, endLabel, zone)?.toISOString() || null : null;
  return {
    eventId: clean(row["Event ID"] ?? row.id) || null,
    date,
    startAt: start,
    endAt: end,
    localStartTime: localTime(startLabel),
    localEndTime: localTime(endLabel),
    title: clean(row.Title ?? row.title),
    subtitle: clean(row.Subtitle ?? row.subtitle) || null,
    location: clean(row.Location ?? row.location) || null,
    type: clean(row["Event Type"] ?? row.type) || null,
  };
}

function publishedSchedule(guideRead, zone) {
  const projection = guideParticipantProjection(guideRead);
  return {
    events: (projection.content.schedule || []).map((row) => eventDto(row, zone))
      .filter((row) => row.date && row.startAt && row.title)
      .sort((left, right) => left.startAt.localeCompare(right.startAt) || clean(left.eventId).localeCompare(clean(right.eventId))),
    metadata: projection.metadata,
    tournament: projection.content.tournamentIdentity || projection.content.tournament || {},
  };
}

function teamDto(team = {}) {
  const teamId = clean(team.id);
  return teamId ? { teamId, name: clean(team.name || teamId) } : null;
}

function playerDto(player = {}, team = null) {
  return {
    playerId: clean(player.id || player.playerId),
    displayName: clean(player.name || player.displayName || player.id || player.playerId),
    team: team || (clean(player.teamName) ? { teamId: null, name: clean(player.teamName) } : null),
  };
}

function tournamentDto(tournament = {}) {
  return {
    tournamentId: clean(tournament.id),
    name: clean(tournament.name || tournament.id),
    year: numeric(tournament.year),
    status: clean(tournament.status) || null,
    currentRound: numeric(tournament.currentRound),
    timeZone: timeZone(tournament.timeZone),
  };
}

function normalizedStatus(value) {
  const status = clean(value).toUpperCase();
  if (["FINAL", "FINALIZED", "COMPLETE", "COMPLETED"].includes(status)) return "completed";
  if (["LIVE", "ACTIVE", "IN PROGRESS", "IN-PROGRESS"].includes(status)) return "inProgress";
  return "scheduled";
}

function matchResult(match = {}) {
  if (normalizedStatus(match.status) !== "completed") return null;
  const source = match.result || {};
  return {
    summary: clean(source.officialResult || source.label || match.finalResult || match.displayResult) || null,
    winner: clean(source.winner || match.matchupWinner || match.overallWinner) || null,
    teamOnePoints: numeric(source.teamOnePoints ?? match.team1Points),
    teamTwoPoints: numeric(source.teamTwoPoints ?? match.team2Points),
  };
}

function participant(player = {}, side, authenticatedPlayerId, {
  includeMatchIntelligence = false,
  includeStrokes = true,
} = {}) {
  const playerId = clean(player.id);
  const value = {
    playerId,
    displayName: clean(player.name || playerId),
    teamSide: side,
    isAuthenticatedPlayer: playerId === authenticatedPlayerId,
  };
  if (includeMatchIntelligence) {
    value.playingHandicap = canonicalNumber(player.playingHcp);
    value.courseHandicap = includeStrokes ? canonicalNumber(player.courseHandicap) : null;
    value.strokesReceived = includeStrokes ? canonicalStrokes(player.stroke) : null;
  }
  return value;
}

function matchDto(match = {}, round = {}, authenticatedPlayerId = "", zone = "America/Chicago", {
  includeMatchIntelligence = false,
  teamOneId = null,
  teamTwoId = null,
} = {}) {
  const scramble = clean(match.format).toUpperCase() === "SC";
  const teamOne = (match.team1Players || []).map((row) => participant(row, 1, authenticatedPlayerId, {
    includeMatchIntelligence,
    includeStrokes: !scramble,
  }));
  const teamTwo = (match.team2Players || []).map((row) => participant(row, 2, authenticatedPlayerId, {
    includeMatchIntelligence,
    includeStrokes: !scramble,
  }));
  if (includeMatchIntelligence) {
    requireMatchesValue(teamOne.length <= MOBILE_MATCHES_LIMITS.participantsPerSide);
    requireMatchesValue(teamTwo.length <= MOBILE_MATCHES_LIMITS.participantsPerSide);
  }
  const ownSide = teamOne.some((row) => row.isAuthenticatedPlayer) ? 1
    : teamTwo.some((row) => row.isAuthenticatedPlayer) ? 2 : null;
  const teeLabel = clean(match.teeTime);
  const side = (number, name, participants, teamId, playingHandicap, strokesReceived) => {
    const canonicalTeamId = clean(teamId);
    if (includeMatchIntelligence) requireMatchesValue(canonicalTeamId);
    return {
      side: number,
      ...(includeMatchIntelligence ? {
        teamId: canonicalTeamId,
        playingHandicap: scramble ? canonicalNumber(playingHandicap) : null,
        strokesReceived: scramble ? canonicalStrokes(strokesReceived) : null,
      } : {}),
      name: clean(name) || null,
      participants,
    };
  };
  return {
    matchId: requireOpaqueMatchID(match.id ?? match.matchId),
    ...(includeMatchIntelligence ? { displayMatchNumber: clean(match.match) || null } : {}),
    round: {
      roundNumber: numeric(match.round ?? round.number),
      name: clean(round.label) || null,
      format: clean(match.formatName || match.format || round.format) || null,
    },
    status: normalizedStatus(match.status),
    course: clean(match.course?.id || match.courseId || match.course) ? {
      courseId: clean(match.course?.id || match.courseId) || null,
      name: clean(match.course?.name || match.course) || null,
      tee: clean(match.course?.tee || match.tee) || null,
    } : null,
    teeTime: teeLabel ? { localTime: localTime(teeLabel), label: teeLabel, timeZone: zone } : null,
    teams: [
      side(1, match.team1Name, teamOne, teamOneId, match.team1PlayingHcp, match.team1Stroke),
      side(2, match.team2Name, teamTwo, teamTwoId, match.team2PlayingHcp, match.team2Stroke),
    ],
    authenticatedPlayer: {
      involved: ownSide !== null,
      teamSide: ownSide,
      partnerPlayerIds: ownSide === null ? [] : (ownSide === 1 ? teamOne : teamTwo)
        .filter((row) => !row.isAuthenticatedPlayer).map((row) => row.playerId),
      opponentPlayerIds: ownSide === null ? [] : (ownSide === 1 ? teamTwo : teamOne).map((row) => row.playerId),
    },
    progress: normalizedStatus(match.status) === "inProgress" ? { currentHole: numeric(match.currentHole) } : null,
    result: matchResult(match),
  };
}

function response(data, revision, now) {
  return {
    status: 200,
    revision: clean(revision),
    body: {
      ok: true,
      apiVersion: MOBILE_API_VERSION,
      data,
      meta: { generatedAt: generatedAt(now), revision: clean(revision) || null },
    },
  };
}

function standingsRowDto(row = {}, tournament = {}) {
  return {
    rank: numeric(row.rank),
    teamId: clean(row.side === 1 ? tournament.teamOne?.id : tournament.teamTwo?.id),
    name: clean(row.name),
    points: numeric(row.points),
    record: clean(row.record),
    remainingMatches: numeric(row.remaining),
  };
}

function mobileRoundStatus(round = {}, tournament = {}) {
  const canonical = roundStatus(round, tournament.status, tournament.currentRound);
  if (canonical === "Complete") return "final";
  if (canonical === "Live") return "inProgress";
  return "upcoming";
}

export function mobileRoundStandings(rounds = [], tournament = {}, standings = teamStandings) {
  const roundNumbers = rounds.map((round) => numeric(round.number));
  if (roundNumbers.some((roundNumber) => !Number.isSafeInteger(roundNumber) || roundNumber < 1) ||
      new Set(roundNumbers).size !== roundNumbers.length) {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  return [...rounds]
    .sort((left, right) => numeric(left.number) - numeric(right.number))
    .map((round) => {
      const officialMatches = (round.matches || []).filter(isOfficialMatchResult);
      const rows = standings(rounds, tournament, String(round.number), {
        requireOfficialResults: true,
      }).map((row) => standingsRowDto(row, tournament));
      return {
        roundNumber: numeric(round.number),
        roundName: clean(round.label),
        status: mobileRoundStatus(round, tournament),
        teamStandings: officialMatches.length ? rows : rows.map((row) => ({ ...row, rank: null, points: null })),
      };
    });
}

export async function mobileTodayResult(identity, { env = process.env, now, dependencies = {} } = {}) {
  requireSupabaseSource(() => (dependencies.requireHomeReadSource || requireHomeReadSource)(env));
  if (isCanonicalReviewer(identity.context)) {
    const matches=await mobileMatchesResult(identity,{env,now,dependencies});
    const guide=await (dependencies.readGuideProjection || readGuideProjection)({tournamentId:identity.tournamentId,surface:"guide",env});
    const tournament=matches.body.data.tournament;
    const data={tournament,observer:{subjectId:identity.authUserId},player:null,currentMatch:null,
      immediateSchedule:publishedSchedule(guide,tournament.timeZone).events.filter(e=>(e.endAt||e.startAt)>=generatedAt(now)).slice(0,3)};
    return response(data,scoringShadowPayloadHash({product:"mobile-today-observer-v1",data}),now);
  }
  const readHome = dependencies.readParticipantHomeView || readParticipantHomeView;
  const readGuide = dependencies.readGuideProjection || readGuideProjection;
  let homeRead;
  let guideRead;
  try {
    [homeRead, guideRead] = await Promise.all([
      readHome({ tournamentId: identity.tournamentId, playerId: identity.playerId }, { env }),
      readGuide({ tournamentId: identity.tournamentId, surface: "guide", env }),
    ]);
  } catch { throw new MobileApiError("MOBILE_API_UNAVAILABLE"); }
  const readAt = now || new Date();
  let home = (dependencies.participantHomeDataFromSupabaseView || participantHomeDataFromSupabaseView)(successfulRead(homeRead));
  home = (dependencies.applyGuideProjectionToHome || applyGuideProjectionToHome)(home, guideRead, { now: readAt });
  const tournament = tournamentDto({ ...home.liveData?.tournament,
    timeZone: publishedTimeZone(guideRead, home.liveData?.tournament?.timeZone) });
  const schedule = publishedSchedule(guideRead, tournament.timeZone);
  const matches = (home.liveData?.rounds || []).flatMap((round) => (round.matches || [])
    .map((match) => matchDto({ ...match,
      team1Name: home.liveData?.tournament?.teamOne?.name,
      team2Name: home.liveData?.tournament?.teamTwo?.name,
    }, round, identity.playerId, tournament.timeZone)))
    .filter((match) => match.authenticatedPlayer.involved);
  const selected = matches.find((match) => match.status === "inProgress")
    || matches.find((match) => match.status === "scheduled")
    || [...matches].reverse().find((match) => match.status === "completed") || null;
  const data = {
    tournament,
    player: playerDto(home.player, teamDto(identity.context?.team)),
    currentMatch: selected,
    immediateSchedule: schedule.events.filter((event) => (event.endAt || event.startAt) >= generatedAt(readAt)).slice(0, 3),
  };
  // Validate the complete participant-visible representation, including Guide
  // content and time-filtered events. Exclude timestamps and upstream revision
  // churn so an unchanged representation can still receive a legitimate 304.
  return response(data, scoringShadowPayloadHash({ product: "mobile-today-v1", data }), readAt);
}

export async function mobileMatchesResult(identity, { env = process.env, now, dependencies = {} } = {}) {
  requireSupabaseSource(() => (dependencies.requireTournamentReadSource || requireTournamentReadSource)(env));
  const readLive = dependencies.readTournamentLiveView || readTournamentLiveView;
  const readGuide = dependencies.readGuideProjection || readGuideProjection;
  let liveRead;
  let guideRead;
  try {
    [liveRead, guideRead] = await Promise.all([
      readLive(identity.tournamentId, { env }),
      readGuide({ tournamentId: identity.tournamentId, surface: "course", env }),
    ]);
  } catch { throw new MobileApiError("MOBILE_API_UNAVAILABLE"); }
  let live = (dependencies.tournamentLiveDataFromSupabaseView || tournamentLiveDataFromSupabaseView)(successfulRead(liveRead), { mobileContract: true });
  live = (dependencies.applyGuideCoursesToTournament || applyGuideCoursesToTournament)(live, guideRead);
  const tournament = tournamentDto({ ...live.tournament,
    timeZone: publishedTimeZone(guideRead, live.tournament?.timeZone) });
  const matches = (live.rounds || []).flatMap((round) => (round.matches || []).map((match) =>
    matchDto({ ...match, team1Name: live.tournament?.teamOne?.name, team2Name: live.tournament?.teamTwo?.name },
      round, identity.playerId, tournament.timeZone, {
        includeMatchIntelligence: true,
        teamOneId: live.tournament?.teamOne?.id,
        teamTwoId: live.tournament?.teamTwo?.id,
      })));
  requireMatchesValue(matches.length <= MOBILE_MATCHES_LIMITS.matches);
  const data = { tournament, matches };
  const result = response(data, scoringShadowPayloadHash({
    product: "mobile-matches-v1",
    sourceRevision: clean(live.revision),
    data,
  }), now);
  requireMatchesValue(Buffer.byteLength(JSON.stringify(result.body), "utf8") <= MOBILE_MATCHES_LIMITS.responseBytes);
  return result;
}

export async function mobileLeadersResult(identity, { env = process.env, now, dependencies = {} } = {}) {
  requireSupabaseSource(() => (dependencies.requireLeaderboardsCoreReadSource || requireLeaderboardsCoreReadSource)(env));
  let read;
  try { read = await (dependencies.readLeaderboardsCoreView || readLeaderboardsCoreView)(identity.tournamentId, { env }); }
  catch { throw new MobileApiError("MOBILE_API_UNAVAILABLE"); }
  const leaders = (dependencies.leaderboardsCoreDataFromSupabaseView || leaderboardsCoreDataFromSupabaseView)(successfulRead(read));
  if (leaders.slotVerification?.pass === false) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  const teams = (dependencies.teamStandings || teamStandings)(leaders.rounds || [], leaders.tournament || {}, "overall", {
    requireOfficialResults: true,
  })
    .map((row) => standingsRowDto(row, leaders.tournament));
  const rounds = mobileRoundStandings(leaders.rounds || [], leaders.tournament || {}, dependencies.teamStandings || teamStandings);
  const players = (dependencies.rankPlayerRows || rankPlayerRows)(
    (dependencies.playerPerformanceRows || playerPerformanceRows)(leaders.leaderboard || [], leaders.scoreLeaderboard || [], leaders.rounds || []), "points",
  ).map((row) => ({ rank: numeric(row.displayRank), playerId: clean(row.id), displayName: clean(row.player),
    team: { teamId: clean(row.teamSide === 1 ? leaders.tournament?.teamOne?.id : leaders.tournament?.teamTwo?.id), name: clean(row.team) },
    points: numeric(row.points), record: clean(row.record) }));
  const data = { tournament: tournamentDto(leaders.tournament), teamStandings: teams,
    roundStandings: rounds, playerStandings: players };
  // The authenticated Production read uses the same canonical server projections
  // as the approved native Players UI. No Preview identity or client ranking.
  const source = playerLeadersProjectionSource(successfulRead(read), identity);
  data.roundStandings = rounds.map((round) => ({ ...round,
    ...leadersRoundContext(leaders.rounds.find((value) => Number(value.number) === round.roundNumber)) }));
  data.playerIntelligence = mobilePlayerIntelligence(leaders, source, identity);
  data.playerRoundPerformance = mobilePlayerRoundPerformance(leaders, source, identity);
  data.r1RoundCompetition = mobileR1RoundCompetition(leaders, source, identity);
  data.r2PairCompetition = mobileR2PairCompetition(leaders, source, identity, data.playerRoundPerformance);
  data.r3RoundCompetition = mobileR3RoundCompetition(leaders, source, identity, data.playerRoundPerformance);

  const result = response(data, scoringShadowPayloadHash({
    product: "mobile-leaders-v1",
    sourceRevision: clean(leaders.revision),
    data,
  }), now);
  requireLeadersBounds(result.body);
  return result;
}

export async function mobileScheduleResult(identity, { env = process.env, now, dependencies = {} } = {}) {
  let read;
  try { read = await (dependencies.readGuideProjection || readGuideProjection)({ tournamentId: identity.tournamentId, surface: "guide", env }); }
  catch { throw new MobileApiError("MOBILE_API_UNAVAILABLE"); }
  successfulRead(read);
  const zone = publishedTimeZone(read, identity.context?.tournament?.timeZone);
  const schedule = publishedSchedule(read, zone);
  const data = { tournamentId: identity.tournamentId, timeZone: zone, events: schedule.events };
  return response(data, scoringShadowPayloadHash({ product: "mobile-schedule-v1", data }), now);
}
