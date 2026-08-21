import { guideContentWithCanonicalCourses, timelineFromGuideProjection } from "./tournament-guide-projection.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function participantDiningRows(rows = []) {
  return rows.map((row) => {
    const reservation = clean(row?.["Reservations Required"]).toLowerCase();
    if (!["false", "no", "n", "0", "open seating"].includes(reservation)) return { ...row };
    return { ...row, "Reservations Required": "" };
  });
}

/**
 * Unwrap the persisted Guide projection without exposing its administrative
 * envelope to participant consumers. This accepts both a raw RPC result and
 * the RPC data object so all foreground routes share one translation rule.
 */
export function guideParticipantProjection(input = {}) {
  const payload = input?.payload || input || {};
  const data = payload?.data || payload || {};
  const persisted = data?.content && typeof data.content === "object" ? data.content : data;
  const storedContent = persisted?.content && typeof persisted.content === "object" ? persisted.content : persisted;
  const canonicalContent = guideContentWithCanonicalCourses(
    storedContent && typeof storedContent === "object" ? storedContent : {},
    Array.isArray(data.course_context) ? data.course_context : [],
  );
  const content = {
    ...(canonicalContent && typeof canonicalContent === "object" ? canonicalContent : {}),
    dining: participantDiningRows(canonicalContent?.dining || []),
  };
  return {
    content,
    metadata: {
      source: "supabase",
      revision: number(data.projection_revision),
      publicationSequence: number(data.publication_sequence),
      contentFingerprint: clean(data.delivery_fingerprint || data.content_fingerprint),
      publishedAt: clean(data.published_at),
      queryMs: number(data.query_ms),
    },
  };
}

function courseId(row = {}) {
  return clean(row["Course ID"] || row.courseId || row.course_id || row.id).toUpperCase();
}

function courseRound(row = {}) {
  return number(row.Round ?? row.round ?? row.round_number, 0);
}

function coursePresentation(row = {}) {
  const name = clean(row.Course || row["Course Name"] || row["Full Course Name"]);
  const city = clean(row.City);
  const state = clean(row.State);
  return {
    id: courseId(row),
    round: courseRound(row),
    name,
    logo: clean(row["Course Logo"]),
    location: clean(row.Destination) || [city, state].filter(Boolean).join(", "),
    description: clean(row["Course Overview"] || row.Overview || row.Description),
    profileImage: clean(row["Course Profile Image"]),
  };
}

export function guideCoursePresentation(contentOrProjection = {}, targetCourseId = "", targetRound = 0) {
  const { content } = guideParticipantProjection(contentOrProjection);
  const id = clean(targetCourseId).toUpperCase();
  if (!id) return null;
  const candidates = (content.courses || []).filter((row) => courseId(row) === id);
  const requestedRound = number(targetRound, 0);
  const row = (requestedRound ? candidates.find((candidate) => courseRound(candidate) === requestedRound) : null) || candidates[0];
  return row ? coursePresentation(row) : null;
}

/**
 * Apply presentation-only Guide fields. Canonical identity, tee, rating,
 * slope, par, yardage, handicap and hole configuration are deliberately left
 * untouched because the Guide projection is not a scoring authority.
 */
export function applyGuideCoursePresentation(course = {}, contentOrProjection = {}, options = {}) {
  const id = clean(course.id || course.courseId || course.course_id || options.courseId);
  const projected = guideCoursePresentation(contentOrProjection, id, options.round);
  if (!projected) return { ...course };
  return {
    ...course,
    ...(projected.name ? { name: projected.name } : {}),
    ...(projected.logo ? { logo: projected.logo } : {}),
    ...(projected.location ? { location: projected.location } : {}),
    ...(projected.description ? { description: projected.description } : {}),
    ...(projected.profileImage ? { profileImage: projected.profileImage } : {}),
  };
}

export function applyGuideCoursesToTournament(data = {}, contentOrProjection = {}) {
  return {
    ...data,
    rounds: (data.rounds || []).map((round) => {
      const matches = (round.matches || []).map((match) => ({
        ...match,
        course: applyGuideCoursePresentation(match.course || {}, contentOrProjection, { round: match.round || round.number }),
      }));
      const canonicalRoundCourse = round.course || matches[0]?.course || {};
      return {
        ...round,
        course: applyGuideCoursePresentation(canonicalRoundCourse, contentOrProjection, { round: round.number }),
        matches,
      };
    }),
  };
}

export function applyGuideCourseToGameCenter(data = {}, contentOrProjection = {}) {
  const round = data.match?.round;
  const matchCourse = applyGuideCoursePresentation(data.match?.course || {}, contentOrProjection, { round });
  const displayCourse = applyGuideCoursePresentation({
    ...(data.display?.course || {}),
    id: data.match?.course?.id || data.display?.course?.id,
  }, contentOrProjection, { round });
  return {
    ...data,
    match: { ...(data.match || {}), course: matchCourse },
    display: {
      ...(data.display || {}),
      courseName: displayCourse.name || data.display?.courseName || "",
      course: displayCourse,
    },
  };
}

export function applyGuideCoursesToMyMatch(data = {}, contentOrProjection = {}) {
  return {
    ...data,
    matches: (data.matches || []).map((match) => {
      const projected = guideCoursePresentation(contentOrProjection, match.courseId, match.round);
      if (!projected) return { ...match };
      return {
        ...match,
        ...(projected.name ? { course: projected.name } : {}),
        ...(projected.logo ? { courseLogo: projected.logo } : {}),
        ...(projected.location ? { courseLocation: projected.location } : {}),
        ...(projected.description ? { courseDescription: projected.description } : {}),
      };
    }),
  };
}

export function applyGuideProjectionToHome(data = {}, contentOrProjection = {}, options = {}) {
  const unwrapped = guideParticipantProjection(contentOrProjection);
  const liveData = applyGuideCoursesToTournament(data.liveData || {}, unwrapped);
  const participant = applyGuideCoursesToMyMatch(data.participant || {}, unwrapped);
  const timeline = timelineFromGuideProjection(unwrapped.content, {
    tournament: liveData.tournament,
    tournamentStatus: liveData.tournament?.status,
    timeZone: liveData.tournament?.timeZone,
    rounds: liveData.rounds || [],
    now: options.now || new Date(),
    previewDate: options.previewDate || "",
    previewEnabled: Boolean(options.previewEnabled),
  });
  // Home intentionally publishes only events explicitly marked for Home. The
  // Guide schedule still retains the full itinerary/timeline contract.
  const events = (timeline.events || []).filter((event) => event.displayOnHome);
  return {
    ...data,
    participant,
    liveData: {
      ...liveData,
      timeline: { ...timeline, events },
      schedule: events,
    },
    presentation: {
      ...(data.presentation || {}),
      guide: unwrapped.metadata,
      scheduleAvailable: timeline.available === true,
    },
  };
}
