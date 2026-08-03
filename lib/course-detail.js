import { structureItineraryDetails } from "./tournament-guide-schedule.js";

const clean = (value) => String(value ?? "").trim();
const roundNumber = (value) => {
  const parsed = Number(clean(value).match(/\d+/)?.[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const FORMAT_NAMES = { BB: "Best Ball", SC: "Scramble", SI: "Singles" };

function mergeRecords(base, active) {
  const merged = { ...(base || {}) };
  for (const [field, value] of Object.entries(active || {})) if (clean(value)) merged[field] = value;
  return merged;
}

function matchesCourse(row, courseId) {
  return clean(row?.["Course ID"]).toUpperCase() === clean(courseId).toUpperCase();
}

function contentValue(course, fields) {
  for (const field of fields) if (clean(course?.[field])) return clean(course[field]);
  return "";
}

function courseImages(course) {
  const fields = Object.keys(course || {}).filter((field) => /(?:profile image|gallery|course photo|photo \d+|image \d+)/i.test(field));
  return [...new Set(fields.flatMap((field) => clean(course[field]).split(/\s*[|,]\s*/)).filter(Boolean))];
}

function detailSection(sections, label) {
  return sections.find((section) => section.label === label)?.text || "";
}

export function courseDetailModel(courseId, content = {}) {
  const active = (content.courses || []).find((course) => matchesCourse(course, courseId));
  const archived = (content.courseArchive || []).find((course) => matchesCourse(course, courseId));
  if (!active && !archived) return null;
  const course = mergeRecords(archived, active);
  const round = roundNumber(course.Round);
  const liveRound = (content.liveRounds || []).find((item) => Number(item.number) === round);
  const formatCode = clean(course.Format).toUpperCase();
  const format = liveRound?.format || FORMAT_NAMES[formatCode] || clean(course.Format);
  const itinerary = (content.schedule || []).find((event) => roundNumber(event["Round ID"] || event.Title) === round);
  const itinerarySections = structureItineraryDetails(itinerary?.Details);
  const tee = clean(course["Tee Played"] || liveRound?.course?.tee);
  const holeRows = (content.courseHoles || []).filter((hole) => matchesCourse(hole, courseId) &&
    (!tee || !clean(hole.Tee) || clean(hole.Tee).toLowerCase() === tee.toLowerCase())
  ).sort((left, right) => Number(left["Hole Number"]) - Number(right["Hole Number"]));
  const facts = [
    ["Par", course.Par], ["Yardage", course.Yardage], ["Slope", course.Slope],
    ["Course Rating", course.Rating], ["Architect", course.Designer], ["Opened", course["Year Opened"]],
  ].filter(([, value]) => clean(value));
  const experience = [
    ["Course Overview", contentValue(course, ["Course Overview", "Overview", "Description"])],
    ["Playing Tips", contentValue(course, ["Playing Tips", "Tips"])],
    ["Signature Holes", contentValue(course, ["Signature Holes", "Signature Hole"])],
    ["Course Notes", contentValue(course, ["Course Notes", "Notes"])],
  ].filter(([, value]) => value);
  const tournamentDetails = [
    ["Round Assignment", round ? `Round ${round}` : ""],
    ["Format", format],
    ["Tee Assignment", tee ? `${tee} Tees` : ""],
    ["First Tee Time", liveRound?.matches?.find((match) => clean(match.teeTime))?.teeTime || clean(itinerary?.["Start Time"])],
    ["Dress Code", clean(course["Dress Code"]) || detailSection(itinerarySections, "Dress Code")],
    ["Walking Caddies", detailSection(itinerarySections, "Caddies")],
    ["Net Skins", detailSection(itinerarySections, "Net Skins")],
  ].filter(([, value]) => value);
  const competitionNotes = itinerarySections.filter((section) => !["Dress Code", "Caddies", "Net Skins"].includes(section.label));
  return {
    course,
    active: Boolean(active),
    round,
    format,
    tee,
    location: [course.City, course.State].filter(Boolean).join(", "),
    subtitle: [round ? `Round ${round}` : "", format].filter(Boolean).join(" • "),
    facts,
    tournamentDetails,
    competitionNotes,
    experience,
    images: courseImages(course),
    holes: holeRows,
    website: clean(course.Website),
  };
}
