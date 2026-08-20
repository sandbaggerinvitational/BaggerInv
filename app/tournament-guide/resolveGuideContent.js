import { requireGuideReadSource } from "../../lib/guide-read-source.js";
import { readGuideProjection } from "../../lib/guide-supabase.js";
import { guideParticipantProjection } from "../../lib/guide-participant-adapter.js";
import { readTournamentLiveView, tournamentLiveDataFromSupabaseView } from "../../lib/tournament-live-supabase.js";
import { timelineFromGuideProjection } from "../../lib/tournament-guide-projection.js";

let legacyResolver;

async function resolveGoogleGuideContent() {
  if (!legacyResolver) legacyResolver = import("./resolveGuideContentGoogle.js");
  return (await legacyResolver).resolveGoogleTournamentGuideContent();
}

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function liveRounds(courseContext = []) {
  return courseContext.flatMap((course) => (course.rounds || []).map((round) => ({
    number: number(round.round_number),
    label: round.name || `Round ${number(round.round_number)}`,
    format: round.format || "",
    status: round.status || "Upcoming",
    course: { id: course.course_id, tee: course.tee },
    matches: [],
  }))).sort((left, right) => left.number - right.number);
}

function tournamentStatus(rounds = []) {
  const statuses = rounds.map((round) => String(round.status || "").trim().toLowerCase());
  if (statuses.length && statuses.every((status) => ["final", "complete", "completed"].includes(status))) return "Final";
  if (statuses.some((status) => ["final", "complete", "completed", "live", "active", "in progress", "in-progress"].includes(status))) return "Live";
  return "Upcoming";
}

function guideLifecycle(liveView = {}, canonicalLive = null, fallbackRounds = []) {
  const presentation = liveView?.tournament_presentation?.presentation || {};
  const tournamentPresentation = presentation.tournament || {};
  const status = String(tournamentPresentation.status || canonicalLive?.tournament?.status || "Upcoming").trim();
  const currentRound = number(tournamentPresentation.currentRound || canonicalLive?.tournament?.currentRound, 0);
  const final = /^(?:final|complete|completed)$/i.test(status);
  const live = /^(?:live|active|in progress|in-progress)$/i.test(status);
  const rounds = (canonicalLive?.rounds || fallbackRounds).map((round) => ({
    ...round,
    status: final ? "Complete"
      : live && currentRound && number(round.number) < currentRound ? "Complete"
      : live && number(round.number) === currentRound ? "Live"
      : "Upcoming",
  }));
  const timeline = presentation.timeline || {};
  return {
    rounds,
    tournament: canonicalLive?.tournament ? {
      ...canonicalLive.tournament,
      status,
      ...(currentRound ? { currentRound } : {}),
    } : null,
    previewNow: timeline.previewDateActive === true ? timeline.effectiveNow || "" : "",
  };
}

export function contentFromSupabase(payload = {}, liveView = null) {
  const data = payload.data || {};
  const stored = guideParticipantProjection({ payload }).content;
  const fallbackRounds = liveRounds(data.course_context || []);
  const fallbackTournament = {
    id: data.tournament?.tournament_id || stored.tournamentIdentity?.id || "2026",
    year: number(data.tournament?.tournament_year || stored.tournamentIdentity?.year, 2026),
    name: data.tournament?.name || stored.tournamentIdentity?.name || "",
    dates: stored.tournamentIdentity?.dates || "",
    location: stored.tournamentIdentity?.location || "",
    timeZone: stored.tournamentIdentity?.timeZone || "America/Chicago",
    status: tournamentStatus(fallbackRounds),
  };
  const canonicalLive = liveView ? tournamentLiveDataFromSupabaseView(liveView.data || liveView) : null;
  const lifecycle = guideLifecycle(liveView?.data || liveView || {}, canonicalLive, fallbackRounds);
  const rounds = lifecycle.rounds;
  const liveTournament = lifecycle.tournament || fallbackTournament;
  const timeline = timelineFromGuideProjection(stored, {
    tournament: liveTournament,
    rounds,
    previewDate: process.env.PREVIEW_TIMELINE_DATE,
    previewEnabled: process.env.VERCEL_ENV === "preview",
  });
  return {
    tournament: { ...stored.tournament, year: liveTournament.year },
    tournamentIdentity: stored.tournamentIdentity || liveTournament,
    liveTournament,
    liveRounds: rounds,
    timelineNow: lifecycle.previewNow || timeline.effectiveNow || new Date().toISOString(),
    overview: stored.overview || [],
    schedule: stored.schedule || [],
    courses: stored.courses || [],
    courseArchive: [],
    ruleBook: stored.ruleBook || [],
    tournamentRules: stored.tournamentRules || [],
    rounds: stored.rounds || [],
    dining: stored.dining || [],
    localGuide: stored.localGuide || [],
    importantContacts: stored.importantContacts || [],
    courseHoles: stored.courseHoles || [],
    diagnostics: stored.diagnostics || {},
    projection: {
      source: "supabase",
      revision: number(data.projection_revision),
      fingerprint: data.delivery_fingerprint || data.content_fingerprint || "",
      publishedAt: data.published_at || "",
      queryMs: number(data.query_ms),
      googleRequests: 0,
    },
  };
}

export async function resolveTournamentGuideContent({ surface = "guide" } = {}) {
  const source = requireGuideReadSource(process.env, surface === "course" ? "course" : "guide");
  if (source.source.resolved === "google") return resolveGoogleGuideContent();
  const [read, liveRead] = await Promise.all([
    readGuideProjection({ surface }),
    surface === "guide" ? readTournamentLiveView(source.tournamentId) : Promise.resolve(null),
  ]);
  if (!read.payload?.ok) {
    const error = new Error("Tournament Guide is temporarily unavailable.");
    error.code = read.payload?.code || "GUIDE_PROJECTION_UNAVAILABLE";
    throw error;
  }
  if (surface === "guide" && !liveRead?.payload?.ok) {
    const error = new Error("Tournament Guide is temporarily unavailable.");
    error.code = liveRead?.payload?.code || "TOURNAMENT_PROJECTION_UNAVAILABLE";
    throw error;
  }
  return contentFromSupabase(read.payload, liveRead?.payload?.data || null);
}
