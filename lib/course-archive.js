const clean = (value) => String(value ?? "").trim();

export function canonicalCourseId(value) {
  return clean(value).toUpperCase();
}

export function courseRoundNumber(value) {
  const round = Number(clean(value).replace(/\D/g, ""));
  return Number.isInteger(round) && round > 0 ? round : null;
}

export function courseRoundLabel(value) {
  const round = courseRoundNumber(value);
  return round ? `Round ${round}` : "";
}

export function currentTournamentCourses(courses = []) {
  const unique = new Map();
  for (const course of courses) {
    const id = canonicalCourseId(course?.["Course ID"]);
    if (id && !unique.has(id)) unique.set(id, course);
  }
  return [...unique.values()].sort((left, right) =>
    (courseRoundNumber(left?.Round) ?? Number.MAX_SAFE_INTEGER) -
      (courseRoundNumber(right?.Round) ?? Number.MAX_SAFE_INTEGER) ||
    clean(left?.Course).localeCompare(clean(right?.Course))
  );
}

function historicalAssignments(tournament = {}) {
  return Object.entries(tournament)
    .map(([field, value]) => {
      const match = field.match(/^Course\s+(\d+)$/i);
      return match && canonicalCourseId(value)
        ? { round: Number(match[1]), courseId: canonicalCourseId(value) }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.round - right.round);
}

function courseIdentityFingerprint(course = {}) {
  return [course.Course, course.City, course.State]
    .map((value) => clean(value).toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

function courseEvidenceKey(year, round) {
  return `${year}|${round}`;
}

export function buildHistoricalCourseArchive({ tournaments = [], courses = [], currentYear } = {}) {
  const activeYear = Number(currentYear);
  const completedTournaments = tournaments
    .filter((tournament) => {
      const year = Number(tournament?.year ?? tournament?.Year);
      return Number.isInteger(year) && (!Number.isInteger(activeYear) || year < activeYear);
    })
    .sort((left, right) => Number(right?.year ?? right?.Year) - Number(left?.year ?? left?.Year));

  const courseById = new Map();
  const evidenceByRound = new Map();
  for (const course of courses) {
    const id = canonicalCourseId(course?.["Course ID"]);
    if (id && !courseById.has(id)) courseById.set(id, course);
    const year = Number(course?.Year);
    const round = courseRoundNumber(course?.Round);
    if (!Number.isInteger(year) || !round) continue;
    const key = courseEvidenceKey(year, round);
    if (!evidenceByRound.has(key)) evidenceByRound.set(key, []);
    evidenceByRound.get(key).push(course);
  }

  const unresolved = [];
  const accidentalDuplicates = [];
  const normalizedAliases = [];
  const seenAppearances = new Set();
  const groups = [];
  let canonicalAssignments = 0;

  for (const tournament of completedTournaments) {
    const year = Number(tournament?.year ?? tournament?.Year);
    const appearances = [];
    for (const assignment of historicalAssignments(tournament)) {
      canonicalAssignments += 1;
      const appearanceKey = `${year}|${assignment.round}|${assignment.courseId}`;
      if (seenAppearances.has(appearanceKey)) {
        accidentalDuplicates.push({ year, round: assignment.round, courseId: assignment.courseId, source: "Tournaments" });
        continue;
      }
      seenAppearances.add(appearanceKey);

      const canonicalCourse = courseById.get(assignment.courseId);
      const evidenceRows = evidenceByRound.get(courseEvidenceKey(year, assignment.round)) || [];
      if (evidenceRows.length > 1) {
        accidentalDuplicates.push({
          year,
          round: assignment.round,
          courseId: assignment.courseId,
          source: "Courses",
          sourceCourseIds: evidenceRows.map((row) => canonicalCourseId(row?.["Course ID"])),
        });
      }
      const evidence = evidenceRows.find((row) => canonicalCourseId(row?.["Course ID"]) === assignment.courseId) || evidenceRows[0];
      if (!canonicalCourse || !evidence) {
        unresolved.push({
          year,
          round: assignment.round,
          courseId: assignment.courseId,
          issue: !canonicalCourse ? "Canonical Course ID does not resolve" : "No Year/Round course evidence",
        });
        continue;
      }

      const evidenceId = canonicalCourseId(evidence?.["Course ID"]);
      if (evidenceId !== assignment.courseId) {
        if (courseIdentityFingerprint(evidence) !== courseIdentityFingerprint(canonicalCourse)) {
          unresolved.push({
            year,
            round: assignment.round,
            courseId: assignment.courseId,
            sourceCourseId: evidenceId,
            issue: "Year/Round course evidence conflicts with the canonical Tournament Course ID",
          });
          continue;
        }
        normalizedAliases.push({
          year,
          round: assignment.round,
          sourceCourseId: evidenceId,
          canonicalCourseId: assignment.courseId,
          course: clean(canonicalCourse.Course),
        });
      }

      appearances.push({
        ...canonicalCourse,
        "Course ID": assignment.courseId,
        Year: year,
        Round: assignment.round,
        round: assignment.round,
        destination: clean(tournament?.Destination),
      });
    }
    appearances.sort((left, right) => left.round - right.round);
    if (appearances.length) {
      groups.push({
        year,
        destination: clean(tournament?.Destination),
        appearances,
      });
    }
  }

  const renderedAppearances = groups.flatMap((group) => group.appearances);
  const appearancesByCourse = new Map();
  for (const appearance of renderedAppearances) {
    const id = canonicalCourseId(appearance["Course ID"]);
    if (!appearancesByCourse.has(id)) appearancesByCourse.set(id, []);
    appearancesByCourse.get(id).push({ year: appearance.Year, round: appearance.round });
  }
  const repeatedCourses = [...appearancesByCourse.entries()]
    .filter(([, appearances]) => appearances.length > 1)
    .map(([courseId, appearances]) => ({
      courseId,
      course: clean(courseById.get(courseId)?.Course),
      appearances,
    }));

  return {
    groups,
    audit: {
      completedYears: groups.map((group) => group.year),
      canonicalAssignments,
      renderedAppearances: renderedAppearances.length,
      uniqueCanonicalCourses: appearancesByCourse.size,
      repeatedCourses,
      normalizedAliases,
      accidentalDuplicates,
      unresolved,
    },
  };
}
