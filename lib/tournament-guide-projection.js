import { createHash } from "node:crypto";

import { isPublished, isTruthy } from "./tournament-guide.js";
import { normalizeTournamentTimeline } from "./tournament-timeline.js";

const clean = (value) => String(value ?? "").trim();

export const GUIDE_PROJECTION_SCHEMA_VERSION = "guide-projection-v1";
export const PREVIEW_GUIDE_TOURNAMENT_ID = "2026";

export const GUIDE_PROJECTION_SHEETS = Object.freeze([
  "Tournaments",
  "Guide Sections",
  "Tournament Itinerary",
  "Tournament Timeline",
  "Rule Book",
  "Tournament Rules",
  "Rounds",
  "Dining",
  "Local Guide",
  "Important Contacts",
  "Courses",
]);

const SCORING_CRITICAL_COURSE_FIELDS = new Set([
  "Tee Played", "Slope", "Rating", "Yardage", "Par",
]);

// These allowlists are also the participant privacy boundary. In particular,
// Important Contacts cannot leak a newly added Director-only workbook column.
const FIELDS = Object.freeze({
  tournaments: [
    "Tournament ID", "Year", "Tournament Year", "Tournament Name", "Name",
    "Tournament Edition", "Annual", "Tournament Dates", "Dates", "Start Date",
    "End Date", "Destination", "Location", "Time Zone", "Timezone",
    "Tournament Logo", "Tournament Logo Filename", "Logo Filename", "Annual Image",
    "Hero Image", "Hero Image Filename", "Homepage Image", "Mobile Hero Image",
    "Mobile Hero Image Filename", "Homepage Mobile Hero Image",
  ],
  overview: [
    "Section ID", "Tournament ID", "Tournament Year", "Year", "Section Name",
    "Section Slug", "Description", "Display Order", "Status", "Published",
  ],
  schedule: [
    "Event ID", "Tournament ID", "Tournament Year", "Year", "Event Date",
    "Day Label", "Start Time", "End Time", "Event Type", "Title", "Subtitle",
    "Location", "Details", "Round ID", "Course ID", "Display Order", "Status",
    "Published", "Featured",
  ],
  timeline: [
    "Year", "Tournament Day", "Event Date", "Start Time", "End Time", "Event Type",
    "Title", "Subtitle", "Location", "Display on Home", "Notification Minutes",
    "Sort Order", "Status Override",
  ],
  ruleBook: [
    "Rule ID", "Tournament ID", "Tournament Year", "Year", "Category", "Subcategory",
    "Title", "Body", "Display Order", "Status", "Published", "Effective Year", "Important",
  ],
  tournamentRules: [
    "Tournament ID", "Year", "Round", "Format", "Team Size", "Points Available",
    "Front 9 Used", "Back 9 Used", "Overall Used", "Front 9 Points", "Back 9 Points",
    "Overall Points", "Description", "Rules", "Handicap Allocation", "Handicap",
    "Handicap Rules", "Playing Handicap", "Scoring Format", "Scoring", "Match Format",
  ],
  rounds: [
    "Format ID", "Name", "Team Size", "Description", "Rules", "Handicap Allocation",
    "Handicap", "Handicap Rules", "Playing Handicap", "Scoring Format", "Scoring",
    "Match Format",
  ],
  dining: [
    "Year", "Day", "Meal", "Cuisine", "Start Time", "End Time", "Location",
    "Dress Code", "Reservations Required", "Reservation Required", "Notes", "Sort Order",
  ],
  localGuide: [
    "Year", "Section", "Title", "Description", "Address", "Phone", "Website", "Sort Order",
  ],
  contacts: [
    "Year", "Category", "Name", "Role", "Phone", "Text Enabled", "Email", "Website", "Sort Order",
  ],
  courses: [
    "Course ID", "Tournament ID", "Year", "Round", "Format", "Course", "Course Name",
    "Full Course Name", "City", "State", "Destination", "Tee Played", "Slope", "Rating",
    "Yardage", "Par", "Year Opened", "Designer", "Website", "Course Logo",
    "Course Profile Image", "GPS Link", "Course Overview", "Overview", "Description",
    "Playing Tips", "Tips", "Signature Holes", "Signature Hole", "History",
    "Course History", "Course Notes", "Notes",
  ],
  courseHoles: ["Course ID", "Tee", "Hole Number", "Yardage", "Par", "Stroke Index"],
});

const LINK_FIELDS = new Set(["Website", "GPS Link"]);
const ASSET_FIELDS = new Set([
  "Course Logo", "Course Profile Image", "Tournament Logo", "Tournament Logo Filename", "Logo Filename", "Annual Image",
  "Hero Image", "Hero Image Filename", "Homepage Image", "Mobile Hero Image", "Mobile Hero Image Filename", "Homepage Mobile Hero Image",
]);

const HEADER_REQUIREMENTS = Object.freeze({
  Tournaments: [["Tournament ID", "Year"], ["Tournament Name", "Name"]],
  "Guide Sections": ["Section ID", ["Tournament ID", "Tournament Year", "Year"], "Section Slug", "Description", "Display Order", ["Status", "Published"]],
  "Tournament Itinerary": ["Event ID", ["Tournament ID", "Tournament Year", "Year"], "Event Date", "Day Label", "Start Time", "Event Type", "Title", "Display Order", ["Status", "Published"]],
  // Timeline status override is optional in the existing consumer contract;
  // absent values are derived from the canonical round/tournament lifecycle.
  "Tournament Timeline": ["Year", "Tournament Day", "Event Date", "Start Time", "End Time", "Event Type", "Title", "Subtitle", "Location", "Display on Home", "Notification Minutes", "Sort Order"],
  "Rule Book": ["Rule ID", ["Tournament ID", "Tournament Year", "Year"], "Category", "Title", "Body", "Display Order", ["Status", "Published"]],
  "Tournament Rules": [["Tournament ID", "Year"], "Round", "Format", "Points Available"],
  Rounds: ["Format ID", "Name", "Team Size"],
  Dining: ["Year", "Day", "Meal", "Cuisine", "Start Time", "End Time", "Location", "Dress Code", ["Reservations Required", "Reservation Required"], "Notes", "Sort Order"],
  // Older/current CMS rows legitimately omit Sort Order. The current UI
  // preserves source order in that case, so the projection does the same.
  "Local Guide": ["Year", "Section", "Title", "Description", "Address", "Phone", "Website"],
  "Important Contacts": ["Year", "Category", "Name", "Role", "Phone", "Text Enabled", "Email", "Website", "Sort Order"],
  Courses: ["Course ID", ["Tournament ID", "Year"], "Round", "Format", ["Course", "Course Name"], "City", "State"],
});

export class GuideProjectionValidationError extends Error {
  constructor(issues, validationIssues = []) {
    super(`Guide projection validation failed: ${issues.join("; ")}`);
    this.name = "GuideProjectionValidationError";
    this.code = "GUIDE_PROJECTION_INVALID";
    this.issues = [...issues];
    const detailsByMessage = new Map(validationIssues.map((issue) => [clean(issue?.message || issue?.reason), issue]));
    this.validationIssues = this.issues.map((message) => {
      const detail = detailsByMessage.get(clean(message)) || {};
      return {
        ...inferredValidationIssue(message),
        ...detail,
        message,
        reason: clean(detail.reason || message),
      };
    });
  }
}

function inferredValidationSource(message) {
  const source = [...GUIDE_PROJECTION_SHEETS]
    .sort((left, right) => right.length - left.length)
    .find((name) => clean(message).startsWith(name));
  if (source) return source;
  if (/^canonical (?:course|Course)/.test(clean(message))) return "Canonical Course Context";
  if (/^tournament\b/i.test(clean(message))) return "Tournaments";
  return "Guide validation";
}

function inferredValidationField(message) {
  const source = clean(message);
  const missing = source.match(/\b(?:is|are) missing (.+)$/i)?.[1];
  if (missing) return clean(missing);
  const invalid = source.match(/\bhas (?:an )?invalid (.+)$/i)?.[1];
  if (invalid) return clean(invalid.replace(/^approved-tournament date$/i, "Event Date").replace(/^start time$/i, "Start Time").replace(/^end time$/i, "End Time"));
  if (/\bformat does not match/i.test(source)) return "Format";
  if (/\btee does not match/i.test(source)) return "Tee Played";
  if (/\bSlope does not match/i.test(source)) return "Slope";
  if (/\bRating does not match/i.test(source)) return "Rating";
  if (/\bPar does not match/i.test(source)) return "Par";
  if (/unknown canonical Course ID/i.test(source)) return "Course ID";
  return "";
}

function inferredValidationEntity(message) {
  const source = clean(message);
  const row = source.match(/\brow (\d+)\b/i)?.[1];
  if (row) return `Row ${row}`;
  const course = source.match(/^Courses\s+(\S+)/i)?.[1] || source.match(/^canonical course assignment\s+(\S+)/i)?.[1];
  if (course) return course;
  const duplicate = source.match(/duplicate logical identity\s+(.+)$/i)?.[1];
  return clean(duplicate);
}

function inferredValidationIssue(message) {
  return {
    source: inferredValidationSource(message),
    entity: inferredValidationEntity(message),
    field: inferredValidationField(message),
    reason: clean(message),
  };
}

function plainText(value) {
  return clean(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function optionalLink(value) {
  const source = plainText(value);
  if (!source || /^(?:javascript|data|vbscript):/i.test(source)) return "";
  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      return ["http:", "https:"].includes(url.protocol) ? source : "";
    } catch {
      return "";
    }
  }
  // Existing Guide helpers add https:// to bare domains at interaction time.
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#][^\s]*)?$/i.test(source) ? source : "";
}

function optionalAsset(value) {
  const source = plainText(value);
  if (!source || /^(?:javascript|data|vbscript):/i.test(source)) return "";
  if (/^https?:\/\//i.test(source)) return optionalLink(source);
  return /^[a-z0-9][a-z0-9._/-]*$/i.test(source) ? source : "";
}

function safeEmail(value) {
  const source = plainText(value);
  return !source || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source) ? source : "";
}

function normalizeDate(value) {
  const source = plainText(value);
  const googleDate = source.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})/);
  if (googleDate) {
    const year = Number(googleDate[1]);
    const month = Number(googleDate[2]) + 1;
    const day = Number(googleDate[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const direct = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) {
    const year = Number(direct[1]);
    const month = Number(direct[2]);
    const day = Number(direct[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "";
    return `${direct[1]}-${direct[2]}-${direct[3]}`;
  }
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

function validTime(value) {
  const source = plainText(value);
  if (!source) return false;
  const match = source.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return false;
  return match[3] ? hour >= 1 && hour <= 12 : hour >= 0 && hour <= 23;
}

function numberOrText(value) {
  const source = plainText(value);
  if (!source) return "";
  const parsed = Number(source.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : source;
}

function projectRow(record, fields) {
  return Object.fromEntries(fields.map((field) => {
    const value = record?.[field];
    if (LINK_FIELDS.has(field)) return [field, optionalLink(value)];
    if (ASSET_FIELDS.has(field)) return [field, optionalAsset(value)];
    if (field === "Email") return [field, safeEmail(value)];
    return [field, plainText(value)];
  }));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function canonicalGuideJson(value) {
  return JSON.stringify(stableValue(value));
}

export function guideProjectionHash(value) {
  const source = typeof value === "string" ? value : canonicalGuideJson(value);
  return createHash("sha256").update(source).digest("hex");
}

function compareText(left, right) {
  return clean(left).localeCompare(clean(right), "en", { numeric: true, sensitivity: "base" });
}

function orderValue(row, field) {
  const value = Number(clean(row?.[field]));
  return Number.isFinite(value) ? value : 9999;
}

function sortBy(rows, orderField, identity) {
  return [...rows].sort((left, right) =>
    orderValue(left, orderField) - orderValue(right, orderField) || compareText(identity(left), identity(right))
  );
}

function strictTournamentMatch(record, tournament) {
  const expectedId = clean(tournament?.id);
  const expectedYear = clean(tournament?.year);
  const sourceId = clean(record?.["Tournament ID"]);
  const sourceYears = [record?.["Tournament Year"], record?.Year].map(clean).filter(Boolean);
  if (sourceId && ![expectedId, expectedYear].includes(sourceId)) return false;
  if (sourceYears.some((year) => year !== expectedYear)) return false;
  return Boolean(sourceId || sourceYears.length);
}

function activeRecords(records, tournament) {
  return (records || []).filter((record) => strictTournamentMatch(record, tournament));
}

function publishedRecords(records, tournament) {
  return activeRecords(records, tournament).filter(isPublished).filter((record) => !isTruthy(record.Sensitive));
}

function participantContactRecords(records, tournament) {
  return activeRecords(records, tournament).filter((record) => {
    const sensitive = ["true", "yes", "y", "1"].includes(clean(record?.Sensitive).toLowerCase());
    const visibility = clean(record?.Visibility || record?.Audience).toLowerCase();
    return !sensitive && !/director|admin|private|internal/.test(visibility);
  });
}

function duplicateIssues(name, rows, identity) {
  const seen = new Set();
  const issues = [];
  for (const row of rows) {
    const key = clean(identity(row)).toUpperCase();
    if (!key) continue;
    if (seen.has(key)) issues.push(`${name} contains duplicate logical identity ${key}`);
    seen.add(key);
  }
  return issues;
}

function requiredIssues(name, rows, fields) {
  const issues = [];
  rows.forEach((row, index) => {
    for (const field of fields) {
      const alternatives = Array.isArray(field) ? field : [field];
      if (!alternatives.some((candidate) => clean(row?.[candidate]))) {
        issues.push(`${name} row ${index + 1} is missing ${alternatives.join(" or ")}`);
      }
    }
  });
  return issues;
}

function orderIssues(name, rows, field) {
  return rows.flatMap((row, index) => {
    const source = clean(row?.[field]);
    const value = Number(source);
    return source && Number.isFinite(value) && value >= 0 ? [] : [`${name} row ${index + 1} has invalid ${field}`];
  });
}

function numericYear(value) {
  const parsed = Number(clean(value).match(/\d{4}/)?.[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalCourseRow(context) {
  return {
    "Course ID": plainText(context?.["Course ID"] ?? context?.courseId ?? context?.id),
    Round: plainText(context?.Round ?? context?.round),
    Format: plainText(context?.Format ?? context?.format),
    "Tee Played": plainText(context?.["Tee Played"] ?? context?.tee),
    Slope: numberOrText(context?.Slope ?? context?.slope),
    Rating: numberOrText(context?.Rating ?? context?.rating),
    Yardage: numberOrText(context?.Yardage ?? context?.yardage),
    Par: numberOrText(context?.Par ?? context?.par),
  };
}

function roundNumber(value) {
  const parsed = Number(clean(value).match(/\d+/)?.[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCode(value) {
  const normalized = clean(value).toUpperCase();
  if (/BEST\s*BALL|FOUR.?BALL/.test(normalized)) return "BB";
  if (/SCRAMBLE/.test(normalized)) return "SC";
  if (/SINGLES?/.test(normalized)) return "SI";
  return normalized;
}

function canonicalCourseAssignments(contexts = []) {
  return contexts.flatMap((context) => {
    const course = canonicalCourseRow(context);
    const rounds = Array.isArray(context?.rounds) && context.rounds.length
      ? context.rounds
      : [{ round_number: course.Round, format: course.Format }];
    return rounds.map((round) => ({
      ...course,
      Round: roundNumber(round?.round_number ?? round?.round ?? course.Round),
      Format: formatCode(round?.format ?? course.Format),
    }));
  }).filter((course) => course["Course ID"] && course.Round);
}

function courseAssignmentKey(row) {
  return `${clean(row?.["Course ID"]).toUpperCase()}:${roundNumber(row?.Round)}`;
}

function ensureSourceOrder(rows, field) {
  return (rows || []).map((row, index) => clean(row?.[field]) ? row : { ...row, [field]: index + 1 });
}

function coursePresentationRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([field]) => !SCORING_CRITICAL_COURSE_FIELDS.has(field)));
}

function canonicalHoleRow(hole, courseId, tee) {
  return {
    "Course ID": plainText(hole?.["Course ID"] ?? hole?.courseId ?? courseId),
    Tee: plainText(hole?.Tee ?? hole?.tee ?? tee),
    "Hole Number": numberOrText(hole?.["Hole Number"] ?? hole?.holeNumber ?? hole?.hole_number),
    Yardage: numberOrText(hole?.Yardage ?? hole?.yardage),
    Par: numberOrText(hole?.Par ?? hole?.par),
    "Stroke Index": numberOrText(hole?.["Stroke Index"] ?? hole?.strokeIndex ?? hole?.stroke_index),
  };
}

function normalizeCanonicalCourses(contexts = []) {
  const courses = contexts.map(canonicalCourseRow).filter((course) => course["Course ID"]);
  const holes = contexts.flatMap((context) => {
    const course = canonicalCourseRow(context);
    return (context?.holes || []).map((hole) => canonicalHoleRow(hole, course["Course ID"], course["Tee Played"]));
  });
  return { courses, holes };
}

function sourceSheetRows(sheets, name, issues) {
  if (!Object.hasOwn(sheets || {}, name) || !Array.isArray(sheets[name])) {
    issues.push(`${name} source is missing`);
    return [];
  }
  return sheets[name];
}

function headerIssues(name, rows) {
  const headers = new Set(Object.keys(rows?.[0] || {}));
  return (HEADER_REQUIREMENTS[name] || []).flatMap((requirement) => {
    const choices = Array.isArray(requirement) ? requirement : [requirement];
    return choices.some((choice) => headers.has(choice)) ? [] : [`${name} headers are missing ${choices.join(" or ")}`];
  });
}

function tournamentIdentity(row, canonicalTournament) {
  const year = Number(canonicalTournament.year);
  return {
    id: clean(canonicalTournament.id),
    year,
    name: plainText(row["Tournament Name"] || row.Name || canonicalTournament.name),
    editionTitle: plainText(row["Tournament Edition"] || row.Annual || canonicalTournament.editionTitle),
    dates: plainText(row["Tournament Dates"] || row.Dates || canonicalTournament.dates),
    location: plainText(row.Destination || row.Location || canonicalTournament.location),
    timeZone: plainText(row["Time Zone"] || row.Timezone || canonicalTournament.timeZone) || "America/Chicago",
    logoFileName: optionalAsset(
      row["Annual Image"] || row["Tournament Logo"] || row["Tournament Logo Filename"] || row["Logo Filename"] || canonicalTournament.logoFileName
    ),
    heroImageFileName: optionalAsset(
      row["Hero Image"] || row["Hero Image Filename"] || row["Homepage Image"] || canonicalTournament.heroImageFileName
    ),
    mobileHeroImageFileName: optionalAsset(
      row["Mobile Hero Image"] || row["Mobile Hero Image Filename"] || row["Homepage Mobile Hero Image"] || canonicalTournament.mobileHeroImageFileName
    ),
  };
}

function projectionHeaders(rows) {
  return rows.length ? Object.keys(rows[0]) : [];
}

export function buildGuideProjection({
  sheets = {},
  tournament,
  approvedTournamentId = PREVIEW_GUIDE_TOURNAMENT_ID,
  canonicalCourseContext = [],
} = {}) {
  const issues = [];
  const validationDetails = new Map();
  const rememberValidationDetail = (message, detail) => validationDetails.set(clean(message), { message, ...detail });
  const validationValue = (value) => clean(value) || "(blank)";
  const canonicalTournament = {
    ...(tournament || {}),
    id: clean(tournament?.id),
    year: Number(tournament?.year),
  };
  const approvedId = clean(approvedTournamentId);
  if (!approvedId || canonicalTournament.id !== approvedId) {
    issues.push(`tournament ${canonicalTournament.id || "(missing)"} is not the approved tournament ${approvedId || "(missing)"}`);
  }
  if (!Number.isInteger(canonicalTournament.year) || canonicalTournament.year !== numericYear(approvedId)) {
    issues.push(`tournament year ${canonicalTournament.year || "(missing)"} does not match approved tournament ${approvedId}`);
  }
  if (canonicalTournament.year === 3026 || numericYear(approvedId) === 3026) {
    issues.push("synthetic tournament 3026 is forbidden");
  }

  const source = Object.fromEntries(GUIDE_PROJECTION_SHEETS.map((name) => [name, sourceSheetRows(sheets, name, issues)]));
  for (const [name, rows] of Object.entries(source)) issues.push(...headerIssues(name, rows));
  const activeTournamentRows = activeRecords(source.Tournaments, canonicalTournament);
  if (activeTournamentRows.length !== 1) {
    issues.push(`Tournaments must contain exactly one approved tournament row; found ${activeTournamentRows.length}`);
  }
  const identityRow = projectRow(activeTournamentRows[0] || {}, FIELDS.tournaments);
  const identity = tournamentIdentity(identityRow, canonicalTournament);

  const overview = sortBy(
    publishedRecords(source["Guide Sections"], canonicalTournament).map((row) => projectRow(row, FIELDS.overview)),
    "Display Order",
    (row) => row["Section ID"],
  );
  const publishedScheduleRows = publishedRecords(source["Tournament Itinerary"], canonicalTournament);
  const schedule = sortBy(
    publishedScheduleRows.map((row) => {
      const projected = projectRow(row, FIELDS.schedule);
      projected["Event Date"] = normalizeDate(projected["Event Date"]);
      return projected;
    }),
    "Display Order",
    (row) => row["Event ID"],
  );
  const activeTimelineRows = activeRecords(source["Tournament Timeline"], canonicalTournament);
  const timelineRows = sortBy(
    activeTimelineRows.map((row) => {
      const projected = projectRow(row, FIELDS.timeline);
      projected["Event Date"] = normalizeDate(projected["Event Date"]);
      return projected;
    }),
    "Sort Order",
    (row) => `${row["Event Date"]}:${row["Start Time"]}:${row.Title}`,
  );
  const ruleBook = sortBy(
    publishedRecords(source["Rule Book"], canonicalTournament).map((row) => projectRow(row, FIELDS.ruleBook)),
    "Display Order",
    (row) => row["Rule ID"],
  );
  const tournamentRules = sortBy(
    activeRecords(source["Tournament Rules"], canonicalTournament).map((row) => projectRow(row, FIELDS.tournamentRules)),
    "Round",
    (row) => `${row.Round}:${row.Format}`,
  );
  const rounds = [...source.Rounds.map((row) => projectRow(row, FIELDS.rounds))]
    .sort((left, right) => compareText(left["Format ID"], right["Format ID"]));
  const dining = sortBy(
    ensureSourceOrder(activeRecords(source.Dining, canonicalTournament), "Sort Order").map((row) => {
      const projected = projectRow(row, FIELDS.dining);
      projected["Reservations Required"] ||= projected["Reservation Required"];
      delete projected["Reservation Required"];
      return projected;
    }),
    "Sort Order",
    (row) => `${row.Day}:${row.Meal}`,
  );
  const localGuide = sortBy(
    ensureSourceOrder(activeRecords(source["Local Guide"], canonicalTournament), "Sort Order").map((row) => projectRow(row, FIELDS.localGuide)),
    "Sort Order",
    (row) => `${row.Section}:${row.Title}`,
  );
  const importantContacts = sortBy(
    participantContactRecords(source["Important Contacts"], canonicalTournament).map((row) => projectRow(row, FIELDS.contacts)),
    "Sort Order",
    (row) => `${row.Category}:${row.Name}`,
  );

  const canonicalCourses = normalizeCanonicalCourses(canonicalCourseContext);
  const canonicalAssignments = canonicalCourseAssignments(canonicalCourseContext);
  for (const context of canonicalCourseContext) {
    if (context?.configuration_consistent === false || context?.configurationConsistent === false) {
      issues.push(`canonical Course ID ${canonicalCourseRow(context)["Course ID"] || "(missing)"} has inconsistent scoring configuration`);
    }
  }
  const courseRows = activeRecords(source.Courses, canonicalTournament).map((row) => projectRow(row, FIELDS.courses));
  const courses = courseRows.map((sourceCourse) => ({
    ...coursePresentationRow(sourceCourse),
    Course: sourceCourse.Course || sourceCourse["Course Name"] || sourceCourse["Full Course Name"] || sourceCourse["Course ID"],
  })).sort((left, right) => orderValue(left, "Round") - orderValue(right, "Round") || compareText(left["Course ID"], right["Course ID"]));

  for (const [name, rows, fields] of [
    ["Guide Sections", overview, ["Section ID", "Section Slug", "Description", "Display Order"]],
    ["Tournament Itinerary", schedule, ["Event ID", "Event Date", "Day Label", "Start Time", "Event Type", "Title", "Display Order"]],
    ["Tournament Timeline", timelineRows, ["Year", "Event Date", "Start Time", "Title"]],
    ["Rule Book", ruleBook, ["Rule ID", "Category", "Title", "Body", "Display Order"]],
    ["Tournament Rules", tournamentRules, ["Round", "Format", "Points Available"]],
    ["Rounds", rounds, ["Format ID", "Name", "Team Size"]],
    // Breakfast/open-seating items may intentionally omit a time; the existing
    // Dining presentation renders them without inventing one.
    ["Dining", dining, ["Year", "Day", "Meal", "Location", "Sort Order"]],
    ["Local Guide", localGuide, ["Year", "Section", "Title", "Sort Order"]],
    ["Important Contacts", importantContacts, ["Year", "Category", "Name", "Sort Order"]],
    ["Courses", courses, ["Course ID", ["Year", "Tournament ID"], "Round", "Format", ["Course", "Course Name"]]],
  ]) issues.push(...requiredIssues(name, rows, fields));

  if (!overview.length) issues.push("Guide Sections has no published participant content");
  if (!schedule.length) issues.push("Tournament Itinerary has no published participant content");
  if (!timelineRows.length) issues.push("Tournament Timeline has no approved tournament content");
  if (!ruleBook.length) issues.push("Rule Book has no published participant content");
  if (!courses.length) issues.push("Courses has no approved tournament content");
  if (!tournamentRules.length) issues.push("Tournament Rules has no approved tournament content");
  if (!rounds.length) issues.push("Rounds has no format content");
  if (!dining.length) issues.push("Dining has no approved tournament content");
  if (!localGuide.length) issues.push("Local Guide has no approved tournament content");
  if (!importantContacts.length) issues.push("Important Contacts has no participant-visible approved tournament content");

  issues.push(
    ...duplicateIssues("Guide Sections", overview, (row) => row["Section ID"]),
    ...duplicateIssues("Tournament Itinerary", schedule, (row) => row["Event ID"]),
    ...duplicateIssues("Tournament Timeline", timelineRows, (row) => `${row["Event Date"]}:${row["Start Time"]}:${row.Title}`),
    ...duplicateIssues("Rule Book", ruleBook, (row) => row["Rule ID"]),
    ...duplicateIssues("Tournament Rules", tournamentRules, (row) => `${row.Round}:${row.Format}`),
    ...duplicateIssues("Rounds", rounds, (row) => row["Format ID"]),
    ...duplicateIssues("Dining", dining, (row) => `${row.Day}:${row.Meal}`),
    ...duplicateIssues("Local Guide", localGuide, (row) => `${row.Section}:${row.Title}`),
    ...duplicateIssues("Important Contacts", importantContacts, (row) => `${row.Category}:${row.Name}`),
    ...duplicateIssues("Courses", courses, (row) => `${row["Course ID"]}:${row.Round}`),
  );
  for (const [name, rows, field] of [
    ["Guide Sections", overview, "Display Order"],
    ["Tournament Itinerary", schedule, "Display Order"],
    ["Tournament Timeline", timelineRows, "Sort Order"],
    ["Rule Book", ruleBook, "Display Order"],
    ["Dining", dining, "Sort Order"],
    ["Local Guide", localGuide, "Sort Order"],
    ["Important Contacts", importantContacts, "Sort Order"],
  ]) issues.push(...orderIssues(name, rows, field));

  for (const event of [...schedule, ...timelineRows]) {
    const itineraryEvent = schedule.includes(event);
    const sourceName = itineraryEvent ? "Tournament Itinerary" : "Tournament Timeline";
    const entity = clean(event["Event ID"] || event.Title || "event");
    const sourceRows = itineraryEvent ? publishedScheduleRows : activeTimelineRows;
    const sourceEvent = sourceRows.find((row) => clean(row["Event ID"] || row.Title) === entity) || {};
    if (!event["Event Date"] || numericYear(event["Event Date"]) !== canonicalTournament.year) {
      const message = `${entity} has an invalid approved-tournament date`;
      issues.push(message);
      rememberValidationDetail(message, {
        source: sourceName,
        entity,
        field: "Event Date",
        currentValue: validationValue(sourceEvent["Event Date"]),
        expectedValue: `A valid ${canonicalTournament.year} tournament date`,
        valueSafe: true,
      });
    }
    if (!validTime(event["Start Time"])) {
      const message = `${entity} has an invalid start time`;
      issues.push(message);
      rememberValidationDetail(message, {
        source: sourceName,
        entity,
        field: "Start Time",
        currentValue: validationValue(sourceEvent["Start Time"]),
        expectedValue: "A valid tournament time",
        valueSafe: true,
      });
    }
    if (event["End Time"] && !validTime(event["End Time"])) {
      const message = `${entity} has an invalid end time`;
      issues.push(message);
      rememberValidationDetail(message, {
        source: sourceName,
        entity,
        field: "End Time",
        currentValue: validationValue(sourceEvent["End Time"]),
        expectedValue: "A valid tournament time or a blank optional end time",
        valueSafe: true,
      });
    }
  }

  const knownCourseIds = new Set(canonicalCourses.courses.map((course) => course["Course ID"].toUpperCase()));
  if (!knownCourseIds.size) issues.push("canonical course context is empty");
  const assignmentsByKey = new Map(canonicalAssignments.map((assignment) => [courseAssignmentKey(assignment), assignment]));
  for (const sourceCourse of courseRows) {
    const key = courseAssignmentKey(sourceCourse);
    const canonical = assignmentsByKey.get(key);
    if (!canonical) {
      const message = `Courses contains unknown canonical assignment ${key}`;
      issues.push(message);
      rememberValidationDetail(message, {
        source: "Courses",
        entity: `${validationValue(sourceCourse["Course ID"])} · Round ${roundNumber(sourceCourse.Round) || "(missing)"}`,
        field: "Course ID / Round",
        currentValue: key,
        expectedValue: "An existing canonical 2026 Course ID/Round assignment",
        valueSafe: true,
      });
      continue;
    }
    const sourceFormat = formatCode(sourceCourse.Format);
    if (sourceFormat && sourceFormat !== canonical.Format) {
      const message = `Courses ${key} format does not match canonical configuration`;
      issues.push(message);
      rememberValidationDetail(message, {
        source: "Courses",
        entity: `${sourceCourse["Course ID"]} · Round ${roundNumber(sourceCourse.Round)}`,
        field: "Format",
        currentValue: validationValue(sourceCourse.Format),
        expectedValue: validationValue(canonical.Format),
        valueSafe: true,
      });
    }
    const sourceTee = clean(sourceCourse["Tee Played"]);
    if (sourceTee && sourceTee.toUpperCase() !== clean(canonical["Tee Played"]).toUpperCase()) {
      const message = `Courses ${key} tee does not match canonical scoring configuration`;
      issues.push(message);
      rememberValidationDetail(message, {
        source: "Courses",
        entity: `${sourceCourse["Course ID"]} · Round ${roundNumber(sourceCourse.Round)}`,
        field: "Tee Played",
        currentValue: validationValue(sourceCourse["Tee Played"]),
        expectedValue: validationValue(canonical["Tee Played"]),
        valueSafe: true,
      });
    }
    // Google yardage is presentation copy and can represent a published total
    // that differs from the immutable scoring-tee hole sum. It never becomes
    // scoring authority, so only rating/slope/par are consistency assertions.
    for (const field of ["Slope", "Rating", "Par"]) {
      const sourceValue = Number(sourceCourse[field]);
      const canonicalValue = Number(canonical[field]);
      if (clean(sourceCourse[field]) && Number.isFinite(sourceValue) && Number.isFinite(canonicalValue) && sourceValue !== canonicalValue) {
        const message = `Courses ${key} ${field} does not match canonical scoring configuration`;
        issues.push(message);
        rememberValidationDetail(message, {
          source: "Courses",
          entity: `${sourceCourse["Course ID"]} · Round ${roundNumber(sourceCourse.Round)}`,
          field,
          currentValue: validationValue(sourceCourse[field]),
          expectedValue: validationValue(canonical[field]),
          valueSafe: true,
        });
      }
    }
  }
  for (const assignment of canonicalAssignments) {
    const key = courseAssignmentKey(assignment);
    const count = courseRows.filter((row) => courseAssignmentKey(row) === key).length;
    if (count !== 1) {
      const message = `canonical course assignment ${key} requires exactly one presentation row; found ${count}`;
      issues.push(message);
      rememberValidationDetail(message, {
        source: "Courses",
        entity: `${assignment["Course ID"]} · Round ${roundNumber(assignment.Round)}`,
        field: "Course ID / Round",
        currentValue: `${count} Google row${count === 1 ? "" : "s"}`,
        expectedValue: "Exactly 1 Google Courses row",
        valueSafe: true,
      });
    }
  }
  for (const event of schedule) {
    if (event["Course ID"] && !knownCourseIds.has(event["Course ID"].toUpperCase())) {
      const message = `Tournament Itinerary references unknown canonical Course ID ${event["Course ID"]}`;
      issues.push(message);
      rememberValidationDetail(message, {
        source: "Tournament Itinerary",
        entity: clean(event["Event ID"] || event.Title || "event"),
        field: "Course ID",
        currentValue: validationValue(event["Course ID"]),
        expectedValue: [...knownCourseIds].sort().join(", ") || "A canonical 2026 Course ID",
        valueSafe: true,
      });
    }
  }
  for (const context of canonicalCourseContext) {
    const canonical = canonicalCourseRow(context);
    const holes = (context?.holes || []).map((hole) => canonicalHoleRow(hole, canonical["Course ID"], canonical["Tee Played"]));
    const numbers = holes.map((hole) => Number(hole["Hole Number"])).sort((left, right) => left - right);
    if (holes.length !== 18 || numbers.some((number, index) => number !== index + 1)) {
      issues.push(`canonical Course ID ${canonical["Course ID"] || "(missing)"} / ${canonical["Tee Played"] || "(missing tee)"} must have holes 1 through 18 exactly once`);
    }
  }

  const sourceContent = {
    tournament: identityRow,
    overview,
    schedule,
    timelineRows,
    courses: courseRows.sort((left, right) => orderValue(left, "Round") - orderValue(right, "Round") || compareText(left["Course ID"], right["Course ID"])),
    ruleBook,
    tournamentRules,
    rounds,
    dining,
    localGuide,
    importantContacts,
  };
  const sourceCanonicalJson = canonicalGuideJson({ tournamentId: canonicalTournament.id, source: sourceContent });
  if (issues.length) {
    const uniqueIssues = [...new Set(issues)];
    const error = new GuideProjectionValidationError(uniqueIssues, uniqueIssues.map((message) => validationDetails.get(clean(message))).filter(Boolean));
    error.sourceFingerprint = guideProjectionHash(sourceCanonicalJson);
    throw error;
  }

  const headers = {
    "Tournament Itinerary": projectionHeaders(schedule),
    Courses: projectionHeaders(courses),
    "Guide Sections": projectionHeaders(overview),
    "Rule Book": projectionHeaders(ruleBook),
    "Tournament Rules": projectionHeaders(tournamentRules),
    Rounds: projectionHeaders(rounds),
    Dining: projectionHeaders(dining),
    "Local Guide": projectionHeaders(localGuide),
    "Important Contacts": projectionHeaders(importantContacts),
    "Tournament Timeline": projectionHeaders(timelineRows),
  };
  const content = {
    tournament: identityRow,
    tournamentIdentity: identity,
    overview,
    schedule,
    timelineRows,
    courses,
    ruleBook,
    tournamentRules,
    rounds,
    dining,
    localGuide,
    importantContacts,
    headers,
  };
  const contentFingerprint = guideProjectionHash(content);
  const contentCanonicalJson = canonicalGuideJson(content);
  const payload = { schemaVersion: GUIDE_PROJECTION_SCHEMA_VERSION, content };
  const payloadCanonicalJson = canonicalGuideJson(payload);
  return {
    schemaVersion: GUIDE_PROJECTION_SCHEMA_VERSION,
    tournamentId: canonicalTournament.id,
    tournamentYear: canonicalTournament.year,
    sourceFingerprint: guideProjectionHash(sourceCanonicalJson),
    contentFingerprint,
    payloadHash: guideProjectionHash(payloadCanonicalJson),
    sourceCanonicalJson,
    contentCanonicalJson,
    payloadCanonicalJson,
    validation: { valid: true, issues: [] },
    sourceCounts: Object.fromEntries(Object.entries(sourceContent).filter(([, value]) => Array.isArray(value)).map(([name, value]) => [name, value.length])),
    content,
  };
}

function contextsWithAssignments(contexts = []) {
  return contexts.flatMap((context) => {
    const rounds = Array.isArray(context?.rounds) && context.rounds.length
      ? context.rounds
      : [{ round_number: context?.round_number ?? context?.round, format: context?.format }];
    return rounds.map((round) => ({ ...context, assignmentRound: roundNumber(round?.round_number ?? round?.round), assignmentFormat: formatCode(round?.format ?? context?.format) }));
  });
}

/**
 * Merge the current immutable scoring context into CMS presentation rows at
 * read time. No scoring-critical value is persisted in a Guide revision.
 */
export function guideContentWithCanonicalCourses(content = {}, courseContexts = []) {
  const assignments = contextsWithAssignments(courseContexts);
  const courses = (content.courses || []).map((presentation) => {
    const id = clean(presentation["Course ID"]).toUpperCase();
    const round = roundNumber(presentation.Round);
    const context = assignments.find((candidate) => clean(candidate.course_id || candidate.courseId).toUpperCase() === id && (!round || candidate.assignmentRound === round))
      || assignments.find((candidate) => clean(candidate.course_id || candidate.courseId).toUpperCase() === id);
    if (!context) return { ...presentation };
    const holes = Array.isArray(context.holes) ? context.holes : [];
    const yardages = holes.map((hole) => Number(hole.yardage)).filter((value) => Number.isFinite(value) && value > 0);
    return {
      ...presentation,
      Round: context.assignmentRound || presentation.Round,
      Format: context.assignmentFormat || presentation.Format,
      "Tee Played": clean(context.tee),
      Rating: context.rating ?? "",
      Slope: context.slope ?? "",
      Par: context.par ?? (holes.length ? holes.reduce((sum, hole) => sum + Number(hole.par || 0), 0) : ""),
      Yardage: yardages.length === holes.length && holes.length ? yardages.reduce((sum, value) => sum + value, 0) : "",
    };
  });
  const courseHoles = courseContexts.flatMap((context) => (context?.holes || []).map((hole) => canonicalHoleRow(
    hole,
    context.course_id || context.courseId,
    context.tee,
  ))).sort((left, right) => compareText(left["Course ID"], right["Course ID"]) || Number(left["Hole Number"]) - Number(right["Hole Number"]));
  return { ...content, courses, courseHoles };
}

export function timelineFromGuideProjection(projection, options = {}) {
  const content = projection?.content || projection || {};
  const tournament = options.tournament || content.tournamentIdentity || {};
  return normalizeTournamentTimeline({
    rows: content.timelineRows || [],
    activeYear: tournament.year,
    tournamentStatus: options.tournamentStatus || tournament.status,
    timeZone: options.timeZone || tournament.timeZone || "America/Chicago",
    rounds: options.rounds || [],
    sheetState: "ready",
    now: options.now || new Date(),
    previewDate: options.previewDate || "",
    previewEnabled: Boolean(options.previewEnabled),
  });
}
