import { guideParticipantProjection } from "./guide-participant-adapter.js";
import { readGuideProjection } from "./guide-supabase.js";
import { MOBILE_API_VERSION, MobileApiError } from "./mobile-api-v1.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";
import { GUIDE_PROJECTION_SCHEMA_VERSION } from "./tournament-guide-projection.js";

export const MOBILE_GUIDE_CONTRACT_VERSION = "guide-v1";
export const MOBILE_GUIDE_PUBLICATION_STATES = Object.freeze(["UNPUBLISHED", "PUBLISHED"]);
export const MOBILE_GUIDE_LIMITS = Object.freeze({ responseBytes: 786_432 });

const clean = (value) => String(value ?? "").trim();
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const FORMAT = new Set(["BB", "SC", "SI"]);
const compareText = (left, right) => clean(left).localeCompare(clean(right), "en", { numeric: true, sensitivity: "base" });

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

function requireValue(condition) {
  if (!condition) throw unavailable();
}

function boundedArray(value, maximum) {
  requireValue(Array.isArray(value) && value.length <= maximum);
  return value;
}

function scalarText(value, { required = false, maxLength = 20_000 } = {}) {
  if (value === null || value === undefined || value === "") {
    requireValue(!required);
    return null;
  }
  requireValue(["string", "number", "boolean"].includes(typeof value));
  const result = clean(value);
  requireValue((!required || result.length > 0) && result.length <= maxLength);
  requireValue(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result));
  requireValue(!/<(?:script|style|iframe|object|embed)\b/i.test(result));
  requireValue(!/<\/?[a-z][^>]*>/i.test(result));
  return result || null;
}

function identifier(value) {
  const result = scalarText(value, { required: true, maxLength: 160 });
  requireValue(ID.test(result));
  return result;
}

function integer(value, { nullable = false, minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || clean(value) === "") {
    requireValue(nullable);
    return null;
  }
  const result = Number(value);
  requireValue(Number.isSafeInteger(result) && result >= minimum && result <= maximum);
  return result;
}

function finiteNumber(value, { nullable = false, minimum = 0, maximum = Number.MAX_VALUE } = {}) {
  if (value === null || value === undefined || clean(value) === "") {
    requireValue(nullable);
    return null;
  }
  const result = Number(value);
  requireValue(Number.isFinite(result) && result >= minimum && result <= maximum);
  return result;
}

function booleanValue(value, { nullable = false } = {}) {
  if (value === null || value === undefined || clean(value) === "") {
    requireValue(nullable);
    return null;
  }
  if (typeof value === "boolean") return value;
  const normalized = clean(value).toLowerCase();
  if (["true", "yes", "y", "1", "required"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "open seating"].includes(normalized)) return false;
  throw unavailable();
}

function timestamp(value) {
  const source = scalarText(value, { required: true, maxLength: 64 });
  const parsed = Date.parse(source);
  requireValue(Number.isFinite(parsed));
  return new Date(parsed).toISOString();
}

function timeZone(value) {
  const source = scalarText(value, { required: true, maxLength: 100 });
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: source });
    return source;
  } catch {
    throw unavailable();
  }
}

function formatCode(value) {
  const source = clean(value).toUpperCase();
  const result = /BEST\s*BALL|FOUR.?BALL/.test(source) ? "BB"
    : /SCRAMBLE/.test(source) ? "SC"
    : /SINGLES?/.test(source) ? "SI"
    : source;
  requireValue(FORMAT.has(result));
  return result;
}

function safeEmail(value) {
  const source = scalarText(value, { maxLength: 254 });
  if (!source) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source) ? source : null;
}

function safePhone(value) {
  const source = scalarText(value, { maxLength: 80 });
  if (!source || /[\r\n\t]/.test(source)) return null;
  const match = source.match(/^(\+?[0-9() .,#-]+)(?: *(?:x|ext\.?) *[0-9]{1,8})?$/i);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, "");
  return digits.length >= 3 && digits.length <= 15 ? source : null;
}

function safeExternalUrl(value) {
  const source = scalarText(value, { maxLength: 2_048 });
  if (!source || /\s/.test(source) || /^(?:javascript|data|vbscript|file):/i.test(source)) return null;
  const candidate = /^https:\/\//i.test(source)
    ? source
    : /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#][^\s]*)?$/i.test(source)
      ? `https://${source}`
      : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname || url.port) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeAssetKey(value) {
  const source = scalarText(value, { maxLength: 240 });
  if (!source || source.startsWith("/") || source.includes("\\") || source.includes(":")) return null;
  const segments = source.split("/");
  if (!segments.length || segments.some((segment) => !segment || segment === "." || segment === ".." ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))) return null;
  return source;
}

function stableId(product, values) {
  return `${product}:${scoringShadowPayloadHash({ product, values }).slice(0, 24)}`;
}

function optionalInteger(value, options = {}) {
  return integer(value, { ...options, nullable: true });
}

function optionalNumber(value, options = {}) {
  return finiteNumber(value, { ...options, nullable: true });
}

function sortOrder(value) {
  return integer(value, { minimum: 0, maximum: 100_000 });
}

function tournamentDto(content = {}, identity = {}) {
  const value = content.tournamentIdentity || {};
  const tournamentId = identifier(value.id);
  requireValue(tournamentId === clean(identity.tournamentId));
  const year = integer(value.year, { minimum: 1900, maximum: 2200 });
  const identityYear = Number(identity.context?.tournament?.year);
  if (Number.isSafeInteger(identityYear)) requireValue(year === identityYear);
  return {
    tournamentId,
    year,
    name: scalarText(value.name, { required: true, maxLength: 240 }),
    editionTitle: scalarText(value.editionTitle, { maxLength: 240 }),
    dates: scalarText(value.dates, { maxLength: 240 }),
    location: scalarText(value.location, { maxLength: 500 }),
    timeZone: timeZone(value.timeZone),
    logoAssetKey: safeAssetKey(value.logoFileName),
    heroAssetKey: safeAssetKey(value.heroImageFileName),
    mobileHeroAssetKey: safeAssetKey(value.mobileHeroImageFileName),
  };
}

function overviewDto(row = {}) {
  const sectionId = identifier(row["Section ID"]);
  const slug = scalarText(row["Section Slug"], { required: true, maxLength: 120 })?.toLowerCase();
  requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug));
  return {
    sectionId,
    slug,
    title: scalarText(row["Section Name"], { maxLength: 240 }),
    body: scalarText(row.Description, { required: true, maxLength: 20_000 }),
    sortOrder: sortOrder(row["Display Order"]),
  };
}

function ruleItemDto(row = {}) {
  return {
    ruleId: identifier(row["Rule ID"]),
    category: scalarText(row.Category, { required: true, maxLength: 160 }),
    subcategory: scalarText(row.Subcategory, { maxLength: 160 }),
    title: scalarText(row.Title, { required: true, maxLength: 300 }),
    body: scalarText(row.Body, { required: true, maxLength: 20_000 }),
    sortOrder: sortOrder(row["Display Order"]),
    effectiveYear: optionalInteger(row["Effective Year"], { minimum: 1900, maximum: 2200 }),
    important: booleanValue(row.Important, { nullable: true }) === true,
  };
}

function roundFormatDto(row = {}, catalog = {}) {
  const format = formatCode(row.Format);
  const catalogFormat = formatCode(catalog["Format ID"] || catalog.Format);
  requireValue(format === catalogFormat);
  return {
    roundNumber: integer(row.Round, { minimum: 1, maximum: 99 }),
    format,
    name: scalarText(catalog.Name, { required: true, maxLength: 160 }),
    teamSize: optionalInteger(row["Team Size"] || catalog["Team Size"], { minimum: 1, maximum: 8 }),
    pointsAvailable: optionalNumber(row["Points Available"], { minimum: 0, maximum: 100 }),
    frontNineUsed: booleanValue(row["Front 9 Used"], { nullable: true }),
    frontNinePoints: optionalNumber(row["Front 9 Points"], { minimum: 0, maximum: 100 }),
    backNineUsed: booleanValue(row["Back 9 Used"], { nullable: true }),
    backNinePoints: optionalNumber(row["Back 9 Points"], { minimum: 0, maximum: 100 }),
    overallUsed: booleanValue(row["Overall Used"], { nullable: true }),
    overallPoints: optionalNumber(row["Overall Points"], { minimum: 0, maximum: 100 }),
    description: scalarText(row.Description || catalog.Description, { maxLength: 20_000 }),
    rules: scalarText(row.Rules || catalog.Rules, { maxLength: 20_000 }),
    handicapAllocation: scalarText(row["Handicap Allocation"] || catalog["Handicap Allocation"], { maxLength: 2_000 }),
    handicap: scalarText(row.Handicap || catalog.Handicap, { maxLength: 2_000 }),
    handicapRules: scalarText(row["Handicap Rules"] || catalog["Handicap Rules"], { maxLength: 5_000 }),
    playingHandicap: scalarText(row["Playing Handicap"] || catalog["Playing Handicap"], { maxLength: 2_000 }),
    scoringFormat: scalarText(row["Scoring Format"] || catalog["Scoring Format"], { maxLength: 2_000 }),
    scoring: scalarText(row.Scoring || catalog.Scoring, { maxLength: 2_000 }),
    matchFormat: scalarText(row["Match Format"] || catalog["Match Format"], { maxLength: 2_000 }),
  };
}

function rulesDto(content = {}) {
  const ruleBook = boundedArray(content.ruleBook, 300);
  const tournamentRules = boundedArray(content.tournamentRules, 12);
  const rounds = boundedArray(content.rounds, 12);
  const catalog = new Map(rounds.map((row) => [formatCode(row["Format ID"] || row.Format), row]));
  requireValue(catalog.size === rounds.length);
  const roundFormats = tournamentRules.map((row) => {
    const format = formatCode(row.Format);
    requireValue(catalog.has(format));
    return roundFormatDto(row, catalog.get(format));
  });
  requireValue(new Set(roundFormats.map((row) => row.roundNumber)).size === roundFormats.length);
  return {
    roundFormats: roundFormats.sort((left, right) => left.roundNumber - right.roundNumber),
    items: ruleBook.map(ruleItemDto).sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.ruleId, right.ruleId)),
  };
}

function coursePresentationDto(row = {}) {
  const city = scalarText(row.City, { maxLength: 160 });
  const state = scalarText(row.State, { maxLength: 160 });
  return {
    name: scalarText(row.Course || row["Course Name"] || row["Full Course Name"], { required: true, maxLength: 300 }),
    city,
    state,
    location: scalarText(row.Destination, { maxLength: 300 }) || [city, state].filter(Boolean).join(", ") || null,
    yearOpened: optionalInteger(row["Year Opened"], { minimum: 1700, maximum: 2200 }),
    designer: scalarText(row.Designer, { maxLength: 300 }),
    website: safeExternalUrl(row.Website),
    directionsUrl: safeExternalUrl(row["GPS Link"]),
    logoAssetKey: safeAssetKey(row["Course Logo"]),
    profileAssetKey: safeAssetKey(row["Course Profile Image"]),
    overview: scalarText(row["Course Overview"] || row.Overview || row.Description, { maxLength: 20_000 }),
    playingTips: scalarText(row["Playing Tips"] || row.Tips, { maxLength: 20_000 }),
    signatureHoles: scalarText(row["Signature Holes"] || row["Signature Hole"], { maxLength: 20_000 }),
    history: scalarText(row.History || row["Course History"] || row["Course Notes"] || row.Notes, { maxLength: 20_000 }),
  };
}

function holeDto(row = {}) {
  return {
    holeNumber: integer(row["Hole Number"], { minimum: 1, maximum: 18 }),
    par: integer(row.Par, { minimum: 1, maximum: 9 }),
    yardage: optionalInteger(row.Yardage, { minimum: 1, maximum: 1_500 }),
    strokeIndex: integer(row["Stroke Index"], { minimum: 1, maximum: 18 }),
  };
}

function assignmentDto(row = {}, holes = []) {
  const courseId = identifier(row["Course ID"]).toUpperCase();
  const roundNumber = integer(row.Round, { minimum: 1, maximum: 99 });
  const tee = scalarText(row["Tee Played"], { required: true, maxLength: 160 });
  const courseHoles = holes.filter((hole) => clean(hole["Course ID"]).toUpperCase() === courseId.toUpperCase() &&
    clean(hole.Tee).toUpperCase() === tee.toUpperCase()).map(holeDto)
    .sort((left, right) => left.holeNumber - right.holeNumber);
  requireValue(courseHoles.length === 18 &&
    courseHoles.every((hole, index) => hole.holeNumber === index + 1) &&
    new Set(courseHoles.map((hole) => hole.strokeIndex)).size === 18);
  const assignment = {
    assignmentId: `${courseId}:R${roundNumber}`.length <= 160
      ? `${courseId}:R${roundNumber}`
      : stableId("course-assignment", [courseId, roundNumber]),
    roundNumber,
    format: formatCode(row.Format),
    tee,
    rating: finiteNumber(row.Rating, { minimum: 1, maximum: 100 }),
    slope: integer(row.Slope, { minimum: 1, maximum: 300 }),
    par: integer(row.Par, { minimum: 1, maximum: 200 }),
    yardage: optionalInteger(row.Yardage, { minimum: 1, maximum: 20_000 }),
    holes: courseHoles,
  };
  requireValue(assignment.par === courseHoles.reduce((total, hole) => total + hole.par, 0));
  const holeYardages = courseHoles.map((hole) => hole.yardage);
  if (holeYardages.every((yardage) => yardage !== null)) {
    requireValue(assignment.yardage === holeYardages.reduce((total, yardage) => total + yardage, 0));
  } else {
    requireValue(assignment.yardage === null);
  }
  return assignment;
}

function coursesDto(content = {}) {
  const sourceCourses = boundedArray(content.courses, 144);
  const sourceHoles = boundedArray(content.courseHoles, 2_592);
  const grouped = new Map();
  const canonicalAssignmentKeys = new Set();
  for (const row of sourceCourses) {
    const courseId = identifier(row["Course ID"]).toUpperCase();
    const tee = scalarText(row["Tee Played"], { required: true, maxLength: 160 });
    canonicalAssignmentKeys.add(`${courseId.toUpperCase()}\u0000${tee.toUpperCase()}`);
    const presentation = coursePresentationDto(row);
    const existing = grouped.get(courseId);
    if (existing) requireValue(JSON.stringify(existing.presentation) === JSON.stringify(presentation));
    else grouped.set(courseId, { presentation, rows: [] });
    grouped.get(courseId).rows.push(row);
  }
  requireValue(sourceHoles.every((hole) => canonicalAssignmentKeys.has(
    `${identifier(hole["Course ID"]).toUpperCase()}\u0000${scalarText(hole.Tee, { required: true, maxLength: 160 }).toUpperCase()}`,
  )));
  const courses = [...grouped.entries()].map(([courseId, value]) => {
    requireValue(value.rows.length <= 12);
    const assignments = value.rows.map((row) => assignmentDto(row, sourceHoles))
      .sort((left, right) => left.roundNumber - right.roundNumber);
    requireValue(new Set(assignments.map((row) => row.assignmentId)).size === assignments.length);
    return { courseId, ...value.presentation, assignments };
  }).sort((left, right) => left.assignments[0].roundNumber - right.assignments[0].roundNumber ||
    compareText(left.courseId, right.courseId));
  requireValue(courses.length <= 12 && courses.every((course) => course.assignments.length > 0));
  return courses;
}

function diningDto(row = {}) {
  const year = integer(row.Year, { minimum: 1900, maximum: 2200 });
  const day = scalarText(row.Day, { required: true, maxLength: 160 });
  const meal = scalarText(row.Meal, { required: true, maxLength: 240 });
  return {
    diningId: stableId("dining", [year, day, meal]),
    year,
    day,
    meal,
    cuisine: scalarText(row.Cuisine, { maxLength: 240 }),
    startTime: scalarText(row["Start Time"], { maxLength: 80 }),
    endTime: scalarText(row["End Time"], { maxLength: 80 }),
    location: scalarText(row.Location, { required: true, maxLength: 500 }),
    dressCode: scalarText(row["Dress Code"], { maxLength: 500 }),
    reservationRequired: booleanValue(row["Reservations Required"], { nullable: true }),
    notes: scalarText(row.Notes, { maxLength: 10_000 }),
    sortOrder: sortOrder(row["Sort Order"]),
  };
}

function localGuideDto(row = {}) {
  const year = integer(row.Year, { minimum: 1900, maximum: 2200 });
  const category = scalarText(row.Section, { required: true, maxLength: 200 });
  const title = scalarText(row.Title, { required: true, maxLength: 300 });
  return {
    entryId: stableId("local", [year, category, title]),
    year,
    category,
    title,
    description: scalarText(row.Description, { maxLength: 20_000 }),
    address: scalarText(row.Address, { maxLength: 1_000 }),
    phone: safePhone(row.Phone),
    website: safeExternalUrl(row.Website),
    sortOrder: sortOrder(row["Sort Order"]),
  };
}

function contactDto(row = {}) {
  const year = integer(row.Year, { minimum: 1900, maximum: 2200 });
  const category = scalarText(row.Category, { required: true, maxLength: 200 });
  const name = scalarText(row.Name, { required: true, maxLength: 300 });
  return {
    contactId: stableId("contact", [year, category, name]),
    year,
    category,
    name,
    role: scalarText(row.Role, { maxLength: 300 }),
    phone: safePhone(row.Phone),
    textEnabled: booleanValue(row["Text Enabled"], { nullable: true }) === true,
    email: safeEmail(row.Email),
    website: safeExternalUrl(row.Website),
    sortOrder: sortOrder(row["Sort Order"]),
  };
}

function emptyGuideData(tournamentId) {
  return {
    contractVersion: MOBILE_GUIDE_CONTRACT_VERSION,
    tournamentId,
    publicationState: "UNPUBLISHED",
    publishedAt: null,
    tournament: null,
    overview: [],
    rules: { roundFormats: [], items: [] },
    courses: [],
    dining: [],
    localGuide: [],
    contacts: [],
  };
}

export function mobileGuideDataFromProjection(read = {}, identity = {}, dependencies = {}) {
  const tournamentId = identifier(identity?.tournamentId);
  requireValue(identifier(identity?.playerId) && identity.context?.membership?.active === true);
  const payload = read?.payload || read || {};
  if (payload?.ok === false) {
    if (clean(payload.code) === "GUIDE_PROJECTION_NOT_PUBLISHED") return emptyGuideData(tournamentId);
    throw unavailable();
  }
  requireValue(payload?.ok === true && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data));
  const authorityTournamentId = clean(payload.data.tournament?.tournament_id);
  requireValue(authorityTournamentId === tournamentId);
  const authorityYear = integer(payload.data.tournament?.tournament_year, { minimum: 1900, maximum: 2200 });
  const identityYear = Number(identity.context?.tournament?.year);
  if (Number.isSafeInteger(identityYear)) requireValue(authorityYear === identityYear);
  requireValue(payload.data.content?.schemaVersion === GUIDE_PROJECTION_SCHEMA_VERSION);
  requireValue(integer(payload.data.content?.content?.tournamentIdentity?.year, { minimum: 1900, maximum: 2200 }) === authorityYear);
  requireValue(Number.isSafeInteger(payload.data.projection_revision) && payload.data.projection_revision > 0);
  requireValue(Number.isSafeInteger(payload.data.publication_sequence) && payload.data.publication_sequence > 0);
  requireValue(/^[0-9a-f]{64}$/.test(clean(payload.data.delivery_fingerprint)));
  const projection = (dependencies.guideParticipantProjection || guideParticipantProjection)(read);
  const content = projection?.content;
  requireValue(content && typeof content === "object" && !Array.isArray(content));
  const overview = boundedArray(content.overview, 100);
  const dining = boundedArray(content.dining, 100);
  const localGuide = boundedArray(content.localGuide, 200);
  const contacts = boundedArray(content.importantContacts, 100);
  const publishedAt = timestamp(payload.data.published_at);
  const data = {
    contractVersion: MOBILE_GUIDE_CONTRACT_VERSION,
    tournamentId,
    publicationState: "PUBLISHED",
    publishedAt,
    tournament: tournamentDto(content, identity),
    overview: overview.map(overviewDto)
      .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.sectionId, right.sectionId)),
    rules: rulesDto(content),
    courses: coursesDto(content),
    dining: dining.map(diningDto)
      .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.day, right.day) || compareText(left.meal, right.meal)),
    localGuide: localGuide.map(localGuideDto)
      .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.category, right.category) || compareText(left.title, right.title)),
    contacts: contacts.map(contactDto)
      .sort((left, right) => left.sortOrder - right.sortOrder || compareText(left.category, right.category) || compareText(left.name, right.name)),
  };
  for (const collection of [data.overview, data.rules.items, data.dining, data.localGuide, data.contacts]) {
    const idName = collection === data.overview ? "sectionId"
      : collection === data.rules.items ? "ruleId"
      : collection === data.dining ? "diningId"
      : collection === data.localGuide ? "entryId" : "contactId";
    requireValue(new Set(collection.map((row) => row[idName])).size === collection.length);
  }
  requireValue(Buffer.byteLength(JSON.stringify(data), "utf8") <= MOBILE_GUIDE_LIMITS.responseBytes);
  return data;
}

export function mobileGuideRepresentationRevision(data = {}) {
  return scoringShadowPayloadHash({ product: "mobile-guide-v1", data });
}

export async function mobileGuideResult(identity, {
  env = process.env,
  now = new Date(),
  dependencies = {},
} = {}) {
  let read;
  try {
    read = await (dependencies.readGuideProjection || readGuideProjection)({
      tournamentId: identity?.tournamentId,
      surface: "guide",
      env,
    });
  } catch {
    throw unavailable();
  }
  const data = mobileGuideDataFromProjection(read, identity, dependencies);
  const revision = mobileGuideRepresentationRevision(data);
  const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  requireValue(Number.isFinite(Date.parse(generatedAt)));
  const body = {
    ok: true,
    apiVersion: MOBILE_API_VERSION,
    data,
    meta: { generatedAt, revision },
  };
  requireValue(Buffer.byteLength(JSON.stringify(body), "utf8") <=
    MOBILE_GUIDE_LIMITS.responseBytes);
  return {
    status: 200,
    revision,
    body,
  };
}
