const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

export function canonicalPublicCourseId(value, aliases = {}) {
  const courseId = upper(value);
  return upper(aliases?.[courseId]) || courseId;
}

function canonicalCourseRow(row = {}, aliases = {}) {
  const courseId = canonicalPublicCourseId(
    row["Course ID"] ?? row.courseId ?? row.course_id ?? row.id,
    aliases,
  );
  return courseId ? { ...row, "Course ID": courseId } : null;
}

function mergePublishedFields(existing = {}, next = {}) {
  const merged = { ...existing };
  for (const [field, value] of Object.entries(next)) {
    if (clean(value)) merged[field] = value;
  }
  return merged;
}

/**
 * Rebuild the original all-host public directory from the two certified
 * Supabase projections. Historical appearances establish the complete venue
 * set; the current Guide contributes the latest presentation fields.
 */
export function publicCourseDirectory(historicalModel = {}, guideContent = {}) {
  const aliases = historicalModel.aliases || {};
  const courses = new Map();
  for (const source of [historicalModel.allAppearances || [], guideContent.courses || []]) {
    for (const candidate of source) {
      const course = canonicalCourseRow(candidate, aliases);
      if (!course) continue;
      const courseId = course["Course ID"];
      courses.set(courseId, mergePublishedFields(courses.get(courseId), course));
    }
  }
  return [...courses.values()].sort((left, right) =>
    clean(left.Course).localeCompare(clean(right.Course)) ||
    clean(left["Course ID"]).localeCompare(clean(right["Course ID"])),
  );
}

/**
 * Feed the existing course-detail presentation model with canonical aliases,
 * every historical appearance, and current Guide course/hole presentation.
 */
export function publicCourseDetailContent(historicalModel = {}, guideContent = {}) {
  const aliases = historicalModel.aliases || {};
  const canonicalRows = (rows = []) => rows
    .map((row) => canonicalCourseRow(row, aliases))
    .filter(Boolean);
  return {
    ...guideContent,
    courses: canonicalRows(guideContent.courses),
    courseArchive: canonicalRows(historicalModel.allAppearances),
    courseHoles: canonicalRows([
      ...(historicalModel.completedHoleRows || []),
      ...(guideContent.courseHoles || []),
    ]),
  };
}

export function canonicalPublicCourseScorecards(scorecards = [], aliases = {}) {
  return scorecards.map((scorecard) => ({
    ...scorecard,
    courseId: canonicalPublicCourseId(scorecard.courseId, aliases),
  }));
}

export function canonicalPublicCourseHoles(holes = [], aliases = {}) {
  return holes.map((hole) => ({
    ...hole,
    courseId: canonicalPublicCourseId(hole.courseId, aliases),
  }));
}
