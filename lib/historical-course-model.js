import { createHash } from "node:crypto";

import { summarizeCourseHoles } from "./scorecard-analytics.js";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const list = (value) => Array.isArray(value) ? value : [];
const integer = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function roundNumber(course = {}) {
  const value = course.round ?? course.Round ?? course.round_number;
  const parsed = Number(clean(value).replace(/\D/g, ""));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function yearNumber(course = {}, fallback = null) {
  return integer(course.year ?? course.Year, fallback);
}

function appearanceRow(course = {}, year) {
  const round = roundNumber(course);
  return {
    ...course,
    Year: yearNumber(course, year),
    Round: round ? `Round ${round}` : course.Round,
    round,
    "Course ID": upper(course["Course ID"] ?? course.courseId ?? course.course_id),
    "Source Course ID": upper(course["Source Course ID"] ?? course.sourceCourseId ?? course.source_course_id),
  };
}

function holeRows(appearance) {
  const year = yearNumber(appearance);
  const round = roundNumber(appearance);
  const courseId = upper(appearance["Course ID"]);
  const tee = clean(appearance["Tee Played"] ?? appearance.tee);
  return list(appearance.holeDefinitions ?? appearance.hole_definitions).map((hole) => ({
    Year: year,
    Round: round,
    "Course ID": courseId,
    Tee: tee,
    "Hole Number": integer(hole.hole_number ?? hole.holeNumber ?? hole["Hole Number"]),
    Yardage: integer(hole.yardage ?? hole.Yardage),
    Par: integer(hole.par ?? hole.Par),
    "Stroke Index": integer(hole.stroke_index ?? hole.strokeIndex ?? hole["Stroke Index"]),
  }));
}

function tournamentArchiveRow(view = {}) {
  const courses = list(view.tournament?.courses);
  return {
    Year: Number(view.year),
    year: Number(view.year),
    Destination: clean(view.tournament?.Destination ?? view.tournament?.destination),
    ...Object.fromEntries(courses.map((course) => [`Course ${roundNumber(course)}`, upper(course["Course ID"])])),
  };
}

function currentCourses(currentView = {}) {
  return list(currentView.tournament?.courses).map((course) => appearanceRow(course, 2026));
}

function canonicalCourseId(model, requestedId) {
  const requested = upper(requestedId);
  return model.aliases[requested] || requested;
}

function courseIdentity(model, requestedId) {
  const courseId = canonicalCourseId(model, requestedId);
  const appearances = model.allAppearances
    .filter((course) => upper(course["Course ID"]) === courseId)
    .sort((left, right) => yearNumber(right) - yearNumber(left) || (roundNumber(right) || 0) - (roundNumber(left) || 0));
  if (!appearances.length) return null;
  return { ...appearances[0], appearances };
}

/** Build the shared immutable presentation input from certified Supabase views. */
export function buildHistoricalCourseModel({ completedViews = [], currentView = {} } = {}) {
  const completed = [...completedViews].sort((left, right) => Number(left.year) - Number(right.year));
  if (completed.map((view) => Number(view.year)).join(",") !== "2017,2018,2019,2020,2021,2022,2023,2024,2025") {
    throw new Error("Historical courses require the complete certified 2017-2025 sequence.");
  }
  if (Number(currentView?.year) !== 2026 || currentView?.source !== "supabase") {
    throw new Error("Historical courses require the certified 2026 Supabase History view.");
  }

  const completedAppearances = completed.flatMap((view) =>
    list(view.tournament?.courses).map((course) => appearanceRow(course, Number(view.year)))
  );
  const stableCourseIds = new Set(completedAppearances.map((course) => upper(course["Course ID"])).filter(Boolean));
  if (completedAppearances.length !== 27 || stableCourseIds.size !== 26) {
    throw new Error("The certified completed-course identity contract is incomplete.");
  }

  const aliases = {};
  for (const appearance of completedAppearances) {
    const canonicalId = upper(appearance["Course ID"]);
    const sourceId = upper(appearance["Source Course ID"]);
    if (sourceId && canonicalId && sourceId !== canonicalId) aliases[sourceId] = canonicalId;
  }
  if (aliases.PDC02 !== "PDC01") {
    throw new Error("The certified 2023 Pete Dye course alias is missing.");
  }

  const completedHoleRows = completedAppearances.flatMap(holeRows);
  const invalidConfigurations = completedAppearances.filter((appearance) => {
    const count = holeRows(appearance).length;
    return count !== 0 && count !== 18;
  });
  if (invalidConfigurations.length) {
    throw new Error("Historical course-hole evidence contains a partial configuration.");
  }

  const completedScorecards = completed.flatMap((view) => list(view.analytics?.scorecards));
  const completedHoleValues = completedScorecards.reduce((total, scorecard) =>
    total + list(scorecard.holes).filter((hole) => hole.score !== null && hole.score !== undefined).length, 0);
  if (completedScorecards.length !== 180 || completedHoleValues !== 3078) {
    throw new Error("The certified completed scorecard evidence contract is incomplete.");
  }
  const currentScorecards = list(currentView.analytics?.scorecards);
  const allScorecards = [...completedScorecards, ...currentScorecards];
  const courseHoleSummaries = summarizeCourseHoles(
    allScorecards.filter((scorecard) => upper(scorecard.status) !== "MISSING")
  );
  const current = currentCourses(currentView);
  const allAppearances = [...completedAppearances, ...current];
  const archiveTournaments = completed.map(tournamentArchiveRow);
  const model = {
    source: "supabase",
    completedViews: completed,
    currentView,
    completedAppearances,
    currentAppearances: current,
    allAppearances,
    completedHoleRows,
    completedScorecards,
    currentScorecards,
    allScorecards,
    courseHoleSummaries,
    aliases: Object.freeze(aliases),
    archiveContent: {
      tournament: { year: 2026 },
      courses: [],
      courseArchive: completedAppearances,
      courseArchiveTournaments: archiveTournaments,
      courseHoles: completedHoleRows,
    },
  };
  return Object.freeze({
    ...model,
    diagnostics: Object.freeze({
      contract: "historical-course-presentation-v1",
      completedAppearances: completedAppearances.length,
      stableCompletedCourses: stableCourseIds.size,
      completedHoleConfigurations: completedAppearances.filter((appearance) => holeRows(appearance).length === 18).length,
      completedScorecards: completedScorecards.length,
      completedHoleValues,
      currentScorecards: currentScorecards.length,
      analyticsHoleRows: courseHoleSummaries.length,
      aliasCount: Object.keys(aliases).length,
      fingerprint: fingerprint({ completedAppearances, completedScorecards, currentScorecards }),
      googleForegroundRequests: 0,
      noFallback: true,
    }),
  });
}

export function historicalCourseArchiveContent(model = {}) {
  if (model.source !== "supabase" || !model.archiveContent) throw new Error("Historical course archive is unavailable.");
  return model.archiveContent;
}

export function historicalCourseProfileInput(model = {}, { courseId } = {}) {
  const canonicalId = canonicalCourseId(model, courseId);
  const course = courseIdentity(model, canonicalId);
  if (!course) return null;
  return {
    canonicalCourseId: canonicalId,
    course,
    content: model.archiveContent,
  };
}

export function historicalCourseHoleInput(model = {}, { courseId, holeNumber, tee = "" } = {}) {
  const canonicalId = canonicalCourseId(model, courseId);
  const course = courseIdentity(model, canonicalId);
  const number = Number(holeNumber);
  if (!course || !Number.isInteger(number) || number < 1 || number > 18) return null;
  const candidates = list(model.courseHoleSummaries).filter((hole) =>
    upper(hole.courseId) === canonicalId && Number(hole.holeNumber) === number
  );
  const requestedTee = clean(tee);
  const hole = candidates.find((candidate) =>
    requestedTee && clean(candidate.tee).toLowerCase() === requestedTee.toLowerCase()
  ) || candidates[0] || null;
  return { canonicalCourseId: canonicalId, course, hole, candidates };
}
