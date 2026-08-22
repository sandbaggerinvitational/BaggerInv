import { COURSE_GUIDE_CONTENT } from "./course-guide-content.js";

const clean = (value) => String(value ?? "").trim();

function mergeRecords(base, active) {
  const merged = { ...(base || {}) };
  for (const [field, value] of Object.entries(active || {})) if (clean(value)) merged[field] = value;
  return merged;
}

function matchesCourse(row, courseId) {
  return clean(row?.["Course ID"]).toUpperCase() === clean(courseId).toUpperCase();
}

function roundNumber(row = {}) {
  const value = row.round ?? row.Round ?? row.round_number;
  const parsed = Number(clean(value).replace(/\D/g, ""));
  return Number.isInteger(parsed) ? parsed : null;
}

function yearNumber(row = {}) {
  const parsed = Number(row.year ?? row.Year);
  return Number.isInteger(parsed) ? parsed : null;
}

function matchesContext(row, context = {}) {
  const year = Number(context.year);
  const round = Number(context.round);
  return (!Number.isInteger(year) || yearNumber(row) === year) &&
    (!Number.isInteger(round) || roundNumber(row) === round);
}

function contentValue(course, fields) {
  for (const field of fields) if (clean(course?.[field])) return clean(course[field]);
  return "";
}

function courseImages(course) {
  const fields = Object.keys(course || {}).filter((field) => /(?:profile image|gallery|course photo|photo \d+|image \d+)/i.test(field));
  return [...new Set(fields.flatMap((field) => clean(course[field]).split(/\s*[|,]\s*/)).filter(Boolean))];
}

export function courseDetailModel(courseId, content = {}, context = {}) {
  const active = (content.courses || []).find((course) => matchesCourse(course, courseId));
  const archivedCandidates = (content.courseArchive || [])
    .filter((course) => matchesCourse(course, courseId))
    .sort((left, right) => (yearNumber(right) || 0) - (yearNumber(left) || 0) || (roundNumber(right) || 0) - (roundNumber(left) || 0));
  const contextRequested = Number.isInteger(Number(context.year)) || Number.isInteger(Number(context.round));
  const archived = contextRequested
    ? archivedCandidates.find((course) => matchesContext(course, context))
    : archivedCandidates[0];
  if (!active && !archived) return null;
  const course = mergeRecords(archived, active);
  const tee = clean(course["Tee Played"]);
  const courseHoleRows = (content.courseHoles || []).filter((hole) =>
    matchesCourse(hole, courseId) && (!contextRequested || matchesContext(hole, context))
  );
  const teeHoleRows = tee
    ? courseHoleRows.filter((hole) => clean(hole.Tee).toLowerCase() === tee.toLowerCase())
    : [];
  const holeRows = (teeHoleRows.length ? teeHoleRows : courseHoleRows.filter((hole) => !tee || !clean(hole.Tee)))
    .sort((left, right) => Number(left["Hole Number"]) - Number(right["Hole Number"]));
  const facts = [
    ["Par", course.Par], ["Yardage", course.Yardage], ["Slope", course.Slope],
    ["Course Rating", course.Rating], ["Architect", course.Designer], ["Opened", course["Year Opened"]],
  ].filter(([, value]) => clean(value));
  const staticContent = COURSE_GUIDE_CONTENT[clean(course["Course ID"]).toUpperCase()] || {};
  const experience = [
    ["Course Overview", contentValue(course, ["Course Overview", "Overview", "Description"]) || staticContent.overview],
    ["Playing Tips", contentValue(course, ["Playing Tips", "Tips"]) || staticContent.tips],
    ["Signature Holes", contentValue(course, ["Signature Holes", "Signature Hole"]) || staticContent.signature],
    ["Course History", contentValue(course, ["History", "Course History", "Course Notes", "Notes"]) || staticContent.history],
  ].filter(([, value]) => value);
  return {
    course,
    active: Boolean(active),
    tee,
    location: [course.City, course.State].filter(Boolean).join(", "),
    facts,
    experience,
    images: courseImages(course),
    holes: holeRows,
    website: clean(course.Website),
    appearances: archivedCandidates,
  };
}
