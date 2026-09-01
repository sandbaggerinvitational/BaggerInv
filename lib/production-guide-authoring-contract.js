import {
  GUIDE_PARTICIPANT_CONTENT_POLICIES,
  GUIDE_PROJECTION_SCHEMA_VERSION,
  GuideProjectionValidationError,
  buildGuideProjection,
  canonicalGuideJson,
  guideProjectionHash,
} from "./tournament-guide-projection.js";

export const PRODUCTION_GUIDE_AUTHORING_CONTRACT =
  "production-guide-authoring-v1";

export const PRODUCTION_GUIDE_ITEM_STATUSES = Object.freeze([
  "Draft",
  "Published",
  "Archived",
  "Cancelled",
]);

export const PRODUCTION_GUIDE_TIMELINE_STATUSES = Object.freeze([
  "",
  "Upcoming",
  "Live",
  "Completed",
  "Complete",
  "Delayed",
  "Cancelled",
  "Canceled",
]);

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

const TOURNAMENT_FIELDS = Object.freeze([
  "Tournament ID", "Year", "Tournament Year", "Tournament Name", "Name",
  "Tournament Edition", "Annual", "Tournament Dates", "Dates", "Start Date",
  "End Date", "Destination", "Location", "Time Zone", "Timezone",
  "Tournament Logo", "Tournament Logo Filename", "Logo Filename", "Annual Image",
  "Hero Image", "Hero Image Filename", "Homepage Image", "Mobile Hero Image",
  "Mobile Hero Image Filename", "Homepage Mobile Hero Image",
]);

const SECTION_FIELDS = Object.freeze([
  "Section ID", "Tournament ID", "Tournament Year", "Year", "Section Name",
  "Section Slug", "Description", "Display Order", "Status", "Published",
]);

const ITINERARY_FIELDS = Object.freeze([
  "Event ID", "Tournament ID", "Tournament Year", "Year", "Event Date",
  "Day Label", "Start Time", "End Time", "Event Type", "Title", "Subtitle",
  "Location", "Details", "Round ID", "Course ID", "Display Order", "Status",
  "Published", "Featured",
]);

const TIMELINE_FIELDS = Object.freeze([
  "Year", "Tournament Day", "Event Date", "Start Time", "End Time", "Event Type",
  "Title", "Subtitle", "Location", "Display on Home", "Notification Minutes",
  "Sort Order", "Status Override",
]);

const RULE_BOOK_FIELDS = Object.freeze([
  "Rule ID", "Tournament ID", "Tournament Year", "Year", "Category", "Subcategory",
  "Title", "Body", "Display Order", "Status", "Published", "Effective Year", "Important",
]);

const TOURNAMENT_RULE_FIELDS = Object.freeze([
  "Tournament ID", "Year", "Round", "Format", "Team Size", "Points Available",
  "Front 9 Used", "Back 9 Used", "Overall Used", "Front 9 Points", "Back 9 Points",
  "Overall Points", "Description", "Rules", "Handicap Allocation", "Handicap",
  "Handicap Rules", "Playing Handicap", "Scoring Format", "Scoring", "Match Format",
]);

const ROUND_FIELDS = Object.freeze([
  "Format ID", "Name", "Team Size", "Description", "Rules", "Handicap Allocation",
  "Handicap", "Handicap Rules", "Playing Handicap", "Scoring Format", "Scoring",
  "Match Format",
]);

const DINING_FIELDS = Object.freeze([
  "Year", "Day", "Meal", "Cuisine", "Start Time", "End Time", "Location",
  "Dress Code", "Reservations Required", "Reservation Required", "Notes", "Sort Order",
]);

const LOCAL_GUIDE_FIELDS = Object.freeze([
  "Year", "Section", "Title", "Description", "Address", "Phone", "Website", "Sort Order",
]);

const CONTACT_FIELDS = Object.freeze([
  "Year", "Category", "Name", "Role", "Phone", "Text Enabled", "Email", "Website", "Sort Order",
]);

// Scoring-critical course fields deliberately do not appear here. The Guide
// authoring surface can select a canonical Course/Round assignment but cannot
// write tee, rating, slope, par, yardage, holes, or any operational assignment.
const COURSE_FIELDS = Object.freeze([
  "Course ID", "Tournament ID", "Year", "Round", "Format", "Course", "Course Name",
  "Full Course Name", "City", "State", "Destination", "Year Opened", "Designer",
  "Website", "Course Logo", "Course Profile Image", "GPS Link", "Course Overview",
  "Overview", "Description", "Playing Tips", "Tips", "Signature Holes", "Signature Hole",
  "History", "Course History", "Course Notes", "Notes",
]);

const field = (key, label, type = "text", options = {}) => Object.freeze({
  key,
  label,
  type,
  ...options,
});

function domain({ key, label, source, cardinality = "many", fields, required = [], identity }) {
  return Object.freeze({
    key,
    label,
    source,
    cardinality,
    fields: Object.freeze(fields),
    required: Object.freeze(required),
    identity,
  });
}

export const PRODUCTION_GUIDE_AUTHORING_DOMAINS = Object.freeze([
  domain({
    key: "tournament", label: "Overview", source: "Tournaments", cardinality: "one",
    fields: TOURNAMENT_FIELDS.map((key) => field(key, key,
      /(?:Image|Logo)/.test(key) ? "asset" : /Date$/.test(key) ? "date" : "text")),
    required: ["Tournament ID", ["Year", "Tournament Year"], ["Tournament Name", "Name"]],
    identity: (row) => row["Tournament ID"] || row.Year,
  }),
  domain({
    key: "overview", label: "Sections", source: "Guide Sections",
    fields: SECTION_FIELDS.map((key) => field(key, key,
      key === "Description" ? "textarea" : key === "Status" ? "status" : key === "Display Order" ? "order" : "text")),
    required: ["Section ID", "Section Slug", "Description", "Display Order"],
    identity: (row) => row["Section ID"],
  }),
  domain({
    key: "schedule", label: "Schedule / Itinerary", source: "Tournament Itinerary",
    fields: ITINERARY_FIELDS.map((key) => field(key, key,
      key === "Event Date" ? "date" : /Time$/.test(key) ? "time" : key === "Details" ? "textarea" :
        key === "Status" ? "status" : key === "Display Order" ? "order" : "text")),
    required: ["Event ID", "Event Date", "Day Label", "Start Time", "Event Type", "Title", "Display Order"],
    identity: (row) => row["Event ID"],
  }),
  domain({
    key: "timelineRows", label: "Timeline", source: "Tournament Timeline",
    fields: TIMELINE_FIELDS.map((key) => field(key, key,
      key === "Event Date" ? "date" : /Time$/.test(key) ? "time" : key === "Sort Order" ? "order" : "text")),
    required: ["Year", "Event Date", "Start Time", "Title", "Sort Order"],
    identity: (row) => `${row["Event Date"]}:${row["Start Time"]}:${row.Title}`,
  }),
  domain({
    key: "ruleBook", label: "Rule Book", source: "Rule Book",
    fields: RULE_BOOK_FIELDS.map((key) => field(key, key,
      key === "Body" ? "textarea" : key === "Status" ? "status" : key === "Display Order" ? "order" : "text")),
    required: ["Rule ID", "Category", "Title", "Body", "Display Order"],
    identity: (row) => row["Rule ID"],
  }),
  domain({
    key: "tournamentRules", label: "Tournament Rules", source: "Tournament Rules",
    fields: TOURNAMENT_RULE_FIELDS.map((key) => field(key, key, /Description|Rules|Scoring/.test(key) ? "textarea" : "text")),
    required: ["Round", "Format", "Points Available"],
    identity: (row) => `${row.Round}:${row.Format}`,
  }),
  domain({
    key: "rounds", label: "Rounds", source: "Rounds",
    fields: ROUND_FIELDS.map((key) => field(key, key, /Description|Rules|Scoring/.test(key) ? "textarea" : "text")),
    required: ["Format ID", "Name", "Team Size"],
    identity: (row) => row["Format ID"],
  }),
  domain({
    key: "dining", label: "Dining", source: "Dining",
    fields: DINING_FIELDS.map((key) => field(key, key,
      /Time$/.test(key) ? "time" : key === "Notes" ? "textarea" : key === "Sort Order" ? "order" : "text")),
    required: ["Year", "Day", "Meal", "Location", "Sort Order"],
    identity: (row) => `${row.Day}:${row.Meal}`,
  }),
  domain({
    key: "localGuide", label: "Local Guide", source: "Local Guide",
    fields: LOCAL_GUIDE_FIELDS.map((key) => field(key, key,
      key === "Description" ? "textarea" : key === "Website" ? "url" : key === "Phone" ? "phone" : key === "Sort Order" ? "order" : "text")),
    required: ["Year", "Section", "Title", "Sort Order"],
    identity: (row) => `${row.Section}:${row.Title}`,
  }),
  domain({
    key: "importantContacts", label: "Important Contacts", source: "Important Contacts",
    fields: CONTACT_FIELDS.map((key) => field(key, key,
      key === "Email" ? "email" : key === "Website" ? "url" : key === "Phone" ? "phone" : key === "Sort Order" ? "order" : "text")),
    required: ["Year", "Category", "Name", "Sort Order"],
    identity: (row) => `${row.Category}:${row.Name}`,
  }),
  domain({
    key: "courses", label: "Courses", source: "Courses",
    fields: COURSE_FIELDS.map((key) => field(key, key,
      ["Website", "GPS Link"].includes(key) ? "url" : /Logo|Image/.test(key) ? "asset" :
        /Overview|Description|Tips|History|Notes/.test(key) ? "textarea" : "text")),
    required: ["Course ID", ["Year", "Tournament ID"], "Round", "Format", ["Course", "Course Name"]],
    identity: (row) => `${row["Course ID"]}:${row.Round}`,
  }),
]);

const DOMAIN_BY_KEY = new Map(PRODUCTION_GUIDE_AUTHORING_DOMAINS.map((value) => [value.key, value]));
const TOP_LEVEL_KEYS = new Set([
  ...PRODUCTION_GUIDE_AUTHORING_DOMAINS.map((value) => value.key),
  // These are derived read fields from guide-projection-v1. Accepting and
  // discarding them lets a Director start from the current projection without
  // granting authority over those derived values.
  "tournamentIdentity",
  "headers",
]);
const ITEM_STATUSES = new Map(PRODUCTION_GUIDE_ITEM_STATUSES.map((value) => [upper(value), value]));
const TIMELINE_STATUSES = new Map(PRODUCTION_GUIDE_TIMELINE_STATUSES.map((value) => [upper(value), value]));
const BOOLEAN_FIELDS = new Set([
  "Published", "Featured", "Display on Home", "Important", "Text Enabled",
  "Reservations Required", "Reservation Required", "Front 9 Used", "Back 9 Used", "Overall Used",
]);
const ORDER_FIELDS = new Set(["Display Order", "Sort Order"]);
const URL_FIELDS = new Set(["Website", "GPS Link"]);
const ASSET_FIELDS = new Set([
  "Tournament Logo", "Tournament Logo Filename", "Logo Filename", "Annual Image",
  "Hero Image", "Hero Image Filename", "Homepage Image", "Mobile Hero Image",
  "Mobile Hero Image Filename", "Homepage Mobile Hero Image", "Course Logo", "Course Profile Image",
]);
const DATE_FIELDS = new Set(["Event Date"]);
const TIME_FIELDS = new Set(["Start Time", "End Time"]);
const SAFE_ITEM_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|<[^>]*>/;
const VALID_LINK = /^(?:https?:\/\/[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#][^\s]*)?)$/i;
const VALID_ASSET = /^(?:https?:\/\/[^\s]+|[a-z0-9][a-z0-9._/-]*)$/i;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PHONE = /^\+?[0-9().\-\s]{3,32}(?:\s*(?:x|ext\.?)\s*\d{1,6})?$/i;
const MAX_AUTHORING_BYTES = 1_500_000;
const MAX_TEXTAREA_BYTES = 20_000;
const MAX_TEXT_BYTES = 2_000;
const MAX_IDENTIFIER_BYTES = 128;
const MAX_LINK_BYTES = 2_048;
const MAX_EMAIL_BYTES = 320;
const MAX_PHONE_BYTES = 64;
const COLLECTION_LIMITS = Object.freeze({
  overview: 100,
  schedule: 500,
  timelineRows: 500,
  ruleBook: 500,
  tournamentRules: 100,
  rounds: 100,
  dining: 300,
  localGuide: 500,
  importantContacts: 200,
  courses: 100,
});
const LONG_TEXT_FIELDS = /(?:Description|Details|Body|Rules|Notes|Overview|Tips|History|Handicap|Scoring|Match Format)/i;
const IDENTIFIER_FIELDS = /(?:^| )(?:ID|Slug)$|^Round$|^Format$|^Format ID$|^Status$/i;
const textEncoder = new TextEncoder();

function guideError(code, message, issues = []) {
  const error = new Error(message);
  error.code = code;
  error.status = 422;
  error.diagnostics = { issues };
  return error;
}

function issue(source, field, reason, entity = "") {
  return Object.freeze({ source, entity, field, reason });
}

function record(value, code, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw guideError(code, message);
  }
  return value;
}

function exactYear(value) {
  const year = Number(value);
  if (!Number.isSafeInteger(year) || year < 2000 || year > 2200 || String(year) !== clean(value)) {
    throw guideError("GUIDE_TOURNAMENT_REQUIRED", "Select a valid tournament year.");
  }
  return year;
}

function rejectUnknownKeys(value, allowed, source) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    throw guideError(
      "GUIDE_FIELD_NOT_ALLOWED",
      `${source} contains unsupported authoring fields.`,
      unknown.map((key) => issue(source, key, "This field is not part of the certified Guide contract.")),
    );
  }
}

function byteLength(value) {
  return textEncoder.encode(String(value ?? "")).length;
}

function scalarLimit(fieldName) {
  if (fieldName === "Email") return MAX_EMAIL_BYTES;
  if (fieldName === "Phone") return MAX_PHONE_BYTES;
  if (URL_FIELDS.has(fieldName) || ASSET_FIELDS.has(fieldName)) return MAX_LINK_BYTES;
  if (IDENTIFIER_FIELDS.test(fieldName)) return MAX_IDENTIFIER_BYTES;
  if (LONG_TEXT_FIELDS.test(fieldName)) return MAX_TEXTAREA_BYTES;
  return MAX_TEXT_BYTES;
}

function safeScalar(value, source, fieldName, entity) {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value) === false) {
    throw guideError(
      "GUIDE_FIELD_VALUE_INVALID",
      `${source} contains an invalid ${fieldName} value.`,
      [issue(source, fieldName, "Use a plain text value.", entity)],
    );
  }
  const result = clean(value);
  if (byteLength(result) > scalarLimit(fieldName)) {
    throw guideError(
      "GUIDE_CONTENT_TOO_LARGE",
      `${source} contains content that is too large.`,
      [issue(source, fieldName, "Shorten this Guide value before saving.", entity)],
    );
  }
  if (UNSAFE_TEXT.test(result)) {
    throw guideError(
      "GUIDE_UNSAFE_CONTENT",
      `${source} contains unsafe markup or control characters.`,
      [issue(source, fieldName, "HTML, scripts, and control characters are not allowed.", entity)],
    );
  }
  return result;
}

function normalizedBoolean(value, source, fieldName, entity) {
  const result = upper(value);
  if (!result) return "";
  if (["TRUE", "YES", "Y", "1"].includes(result)) return "TRUE";
  if (["FALSE", "NO", "N", "0"].includes(result)) return "FALSE";
  throw guideError(
    "GUIDE_BOOLEAN_INVALID",
    `${source} contains an invalid ${fieldName} value.`,
    [issue(source, fieldName, "Choose Yes or No.", entity)],
  );
}

function normalizedOrder(value, source, fieldName, entity, fallback = "") {
  const result = clean(value || fallback);
  const number = Number(result);
  if (!result || !Number.isFinite(number) || number < 0) {
    throw guideError(
      "GUIDE_ORDER_INVALID",
      `${source} contains an invalid display order.`,
      [issue(source, fieldName, "Use a non-negative number.", entity)],
    );
  }
  return String(number);
}

function validDate(value, year) {
  const source = clean(value);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(source);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(source);
  const google = /^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/.exec(source);
  const parsedYear = Number(iso?.[1] || slash?.[3] || google?.[1]);
  const month = Number(iso?.[2] || slash?.[1] || (google ? Number(google[2]) + 1 : 0));
  const day = Number(iso?.[3] || slash?.[2] || google?.[3]);
  if (!parsedYear || parsedYear !== year || !month || !day) return false;
  const date = new Date(Date.UTC(parsedYear, month - 1, day));
  return date.getUTCFullYear() === parsedYear &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validTime(value) {
  const source = clean(value);
  if (!source) return false;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(source);
  if (!match || Number(match[2]) > 59) return false;
  return match[3] ? Number(match[1]) >= 1 && Number(match[1]) <= 12 : Number(match[1]) <= 23;
}

function validateLink(value, source, fieldName, entity) {
  if (!value) return;
  if (!VALID_LINK.test(value)) {
    throw guideError(
      "GUIDE_URL_INVALID",
      `${source} contains an invalid URL.`,
      [issue(source, fieldName, "Use an HTTP(S) URL or a valid bare domain.", entity)],
    );
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname) throw new Error("invalid");
    } catch {
      throw guideError(
        "GUIDE_URL_INVALID",
        `${source} contains an invalid URL.`,
        [issue(source, fieldName, "Use an HTTP(S) URL or a valid bare domain.", entity)],
      );
    }
  }
}

function validateAsset(value, source, fieldName, entity) {
  if (!value) return;
  const lower = value.toLowerCase();
  let traversal = /^(?:javascript|data|vbscript|file):/.test(lower) ||
    value.startsWith("/") || value.startsWith("\\") || value.includes("\\") ||
    /^[a-z]:[\\/]/i.test(value);
  const pathValue = /^https?:\/\//i.test(value)
    ? value.replace(/^https?:\/\/[^/]+/i, "")
    : value;
  for (const segment of pathValue.split(/[/?#]/)) {
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { traversal = true; }
    if (decoded === "..") traversal = true;
  }
  if (traversal || !VALID_ASSET.test(value)) {
    throw guideError(
      "GUIDE_ASSET_INVALID",
      `${source} contains an invalid asset reference.`,
      [issue(source, fieldName, "Use an existing relative asset path or an HTTP(S) URL.", entity)],
    );
  }
  if (/^https?:\/\//i.test(value)) validateLink(value, source, fieldName, entity);
}

function stableItemId(domainKey, identity, supplied = "") {
  const value = clean(supplied);
  if (value && !SAFE_ITEM_ID.test(value)) {
    throw guideError("GUIDE_STABLE_ID_INVALID", "A Guide item has an invalid stable identity.");
  }
  if (value) return value;
  const logical = upper(identity);
  if (!logical) return "";
  return `${domainKey}:${guideProjectionHash(`${domainKey}:${logical}`).slice(0, 24)}`;
}

function requiredValue(row, requirement) {
  const fields = Array.isArray(requirement) ? requirement : [requirement];
  return fields.some((key) => clean(row[key]));
}

function assertScope(row, domainKey, targetTournamentId, targetYear, source, entity) {
  const suppliedId = clean(row["Tournament ID"]);
  const suppliedYears = [row["Tournament Year"], row.Year].map(clean).filter(Boolean);
  if ((suppliedId && ![targetTournamentId, String(targetYear)].includes(suppliedId)) ||
      suppliedYears.some((value) => Number(value) !== targetYear)) {
    throw guideError(
      "GUIDE_TOURNAMENT_SCOPE_MISMATCH",
      `${source} must belong to the selected tournament.`,
      [issue(source, "Tournament / Year", `Use tournament ${targetTournamentId}.`, entity)],
    );
  }
  if (["overview", "schedule", "ruleBook"].includes(domainKey)) row["Tournament ID"] = targetTournamentId;
  if (["timelineRows", "tournamentRules", "dining", "localGuide", "importantContacts", "courses"].includes(domainKey)) {
    row.Year = String(targetYear);
  }
}

function normalizeRow(sourceValue, spec, index, targetTournamentId, targetYear) {
  const source = record(sourceValue, "GUIDE_ITEM_INVALID", `${spec.label} item ${index + 1} is invalid.`);
  const allowed = new Set([...spec.fields.map((value) => value.key), "itemId"]);
  rejectUnknownKeys(source, allowed, spec.source);
  const provisionalEntity = clean(spec.identity(source)) || `Item ${index + 1}`;
  const row = Object.fromEntries(spec.fields.map(({ key }) => {
    let value = safeScalar(source[key], spec.source, key, provisionalEntity);
    if (BOOLEAN_FIELDS.has(key)) value = normalizedBoolean(value, spec.source, key, provisionalEntity);
    if (ORDER_FIELDS.has(key) && (value || ["dining", "localGuide"].includes(spec.key))) {
      value = normalizedOrder(value, spec.source, key, provisionalEntity, index + 1);
    }
    if (URL_FIELDS.has(key)) validateLink(value, spec.source, key, provisionalEntity);
    if (ASSET_FIELDS.has(key)) validateAsset(value, spec.source, key, provisionalEntity);
    if (key === "Email" && value && !VALID_EMAIL.test(value)) {
      throw guideError(
        "GUIDE_EMAIL_INVALID",
        `${spec.source} contains an invalid email address.`,
        [issue(spec.source, key, "Use a valid participant-safe email address.", provisionalEntity)],
      );
    }
    if (key === "Phone" && value && (!VALID_PHONE.test(value) || value.replace(/\D/g, "").length < 3)) {
      throw guideError(
        "GUIDE_PHONE_INVALID",
        `${spec.source} contains an invalid phone number.`,
        [issue(spec.source, key, "Use a participant-safe phone number.", provisionalEntity)],
      );
    }
    if (DATE_FIELDS.has(key) && value && !validDate(value, targetYear)) {
      throw guideError(
        "GUIDE_DATE_INVALID",
        `${spec.source} contains an invalid tournament date.`,
        [issue(spec.source, key, `Use a real ${targetYear} tournament date.`, provisionalEntity)],
      );
    }
    if (TIME_FIELDS.has(key) && value && !validTime(value)) {
      throw guideError(
        "GUIDE_TIME_INVALID",
        `${spec.source} contains an invalid time.`,
        [issue(spec.source, key, "Use a supported 12-hour or 24-hour clock time.", provisionalEntity)],
      );
    }
    return [key, value];
  }));

  assertScope(row, spec.key, targetTournamentId, targetYear, spec.source, provisionalEntity);
  if (["overview", "schedule", "ruleBook"].includes(spec.key)) {
    const status = ITEM_STATUSES.get(upper(row.Status || (normalizedBoolean(row.Published, spec.source, "Published", provisionalEntity) === "TRUE" ? "Published" : "Draft")));
    if (!status) {
      throw guideError(
        "GUIDE_STATUS_INVALID",
        `${spec.source} contains an unsupported publication status.`,
        [issue(spec.source, "Status", `Choose ${PRODUCTION_GUIDE_ITEM_STATUSES.join(", ")}.`, provisionalEntity)],
      );
    }
    row.Status = status;
    row.Published = "";
  }
  if (spec.key === "timelineRows") {
    const status = TIMELINE_STATUSES.get(upper(row["Status Override"]));
    if (status === undefined) {
      throw guideError(
        "GUIDE_TIMELINE_STATUS_INVALID",
        "Tournament Timeline contains an unsupported status override.",
        [issue(spec.source, "Status Override", "Use an existing Guide timeline status.", provisionalEntity)],
      );
    }
    row["Status Override"] = status;
  }
  if (spec.key === "overview") {
    const slug = clean(row["Section Slug"]).toLowerCase();
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw guideError(
        "GUIDE_SECTION_SLUG_INVALID",
        "A Guide Section contains an invalid slug.",
        [issue(spec.source, "Section Slug", "Use lowercase letters, numbers, and single hyphens.", provisionalEntity)],
      );
    }
    row["Section Slug"] = slug;
  }
  for (const requirement of spec.required) {
    if (!requiredValue(row, requirement)) {
      const fields = Array.isArray(requirement) ? requirement : [requirement];
      throw guideError(
        "GUIDE_REQUIRED_FIELD_MISSING",
        `${spec.source} is missing a required field.`,
        [issue(spec.source, fields.join(" or "), "Complete this required Guide field.", provisionalEntity)],
      );
    }
  }
  const identity = clean(spec.identity(row));
  const itemId = stableItemId(spec.key, identity, source.itemId);
  if (!itemId) {
    throw guideError("GUIDE_STABLE_ID_REQUIRED", `${spec.source} requires a stable item identity.`);
  }
  return Object.freeze({ itemId, ...row });
}

function normalizeTournament(sourceValue, targetTournamentId, targetYear) {
  const spec = DOMAIN_BY_KEY.get("tournament");
  const source = record(sourceValue, "GUIDE_TOURNAMENT_PRESENTATION_REQUIRED", "Tournament Guide overview is required.");
  rejectUnknownKeys(source, new Set(spec.fields.map((value) => value.key)), spec.source);
  const row = Object.fromEntries(spec.fields.map(({ key }) => {
    const value = safeScalar(source[key], spec.source, key, targetTournamentId);
    if (ASSET_FIELDS.has(key)) validateAsset(value, spec.source, key, targetTournamentId);
    return [key, value];
  }));
  assertScope(row, "tournament", targetTournamentId, targetYear, spec.source, targetTournamentId);
  row["Tournament ID"] = targetTournamentId;
  row.Year = String(targetYear);
  for (const requirement of spec.required) {
    if (!requiredValue(row, requirement)) {
      const fields = Array.isArray(requirement) ? requirement : [requirement];
      throw guideError(
        "GUIDE_REQUIRED_FIELD_MISSING",
        "Tournament Guide overview is incomplete.",
        [issue(spec.source, fields.join(" or "), "Complete this required Guide field.", targetTournamentId)],
      );
    }
  }
  for (const key of ["Start Date", "End Date"]) {
    if (row[key] && !validDate(row[key], targetYear)) {
      throw guideError(
        "GUIDE_DATE_INVALID",
        "Tournament Guide overview contains an invalid date.",
        [issue(spec.source, key, `Use a real ${targetYear} tournament date.`, targetTournamentId)],
      );
    }
  }
  return Object.freeze(row);
}

function duplicateIdentity(rows, spec) {
  const seen = new Set();
  const itemIds = new Set();
  for (const row of rows) {
    const identity = upper(spec.identity(row));
    if (seen.has(identity)) {
      throw guideError(
        "GUIDE_LOGICAL_ID_DUPLICATE",
        `${spec.source} contains a duplicate logical identity.`,
        [issue(spec.source, "Identity", "Each Guide item identity must be unique.", identity)],
      );
    }
    seen.add(identity);
    const itemId = upper(row.itemId);
    if (itemIds.has(itemId)) {
      throw guideError(
        "GUIDE_STABLE_ID_DUPLICATE",
        `${spec.source} contains a duplicate stable item identity.`,
        [issue(spec.source, "itemId", "Each Guide item must retain a unique stable identity.")],
      );
    }
    itemIds.add(itemId);
  }
}

function assertUniqueSectionSlugs(rows) {
  const seen = new Set();
  for (const row of rows) {
    const slug = upper(row["Section Slug"]);
    if (seen.has(slug)) {
      throw guideError(
        "GUIDE_SECTION_SLUG_DUPLICATE",
        "Guide Section slugs must be unique.",
        [issue("Guide Sections", "Section Slug", "Choose a unique participant route slug.")],
      );
    }
    seen.add(slug);
  }
}

function canonicalRoundReferences(canonicalCourseContext = [], canonicalRounds = []) {
  const references = new Map();
  const add = (round, format = "", id = "") => {
    const roundNumber = clean(round).match(/\d+/)?.[0] || "";
    for (const key of [clean(id), clean(round), roundNumber].filter(Boolean)) {
      references.set(upper(key), { round: roundNumber || clean(round), format: upper(format) });
    }
  };
  for (const value of canonicalRounds || []) {
    add(value?.round_number ?? value?.roundNumber ?? value?.round, value?.format,
      value?.round_id ?? value?.roundId ?? value?.id);
  }
  for (const context of canonicalCourseContext || []) {
    const rounds = Array.isArray(context?.rounds) && context.rounds.length
      ? context.rounds
      : [context];
    for (const value of rounds) {
      add(value?.round_number ?? value?.roundNumber ?? value?.round ?? context?.round,
        value?.format ?? context?.format, value?.round_id ?? value?.roundId);
    }
  }
  return references;
}

function assertCanonicalReferences(content, canonicalCourseContext, canonicalRounds) {
  const rounds = canonicalRoundReferences(canonicalCourseContext, canonicalRounds);
  if (!rounds.size) {
    throw guideError("GUIDE_CANONICAL_CONTEXT_REQUIRED", "Canonical Guide round and course references are unavailable.");
  }
  const courseIds = new Set((canonicalCourseContext || []).map((value) =>
    upper(value?.course_id ?? value?.courseId ?? value?.["Course ID"] ?? value?.id)).filter(Boolean));
  for (const row of content.schedule) {
    const roundId = upper(row["Round ID"]);
    if (roundId && !rounds.has(roundId)) {
      throw guideError(
        "GUIDE_ROUND_REFERENCE_INVALID",
        "Tournament Itinerary references an unknown canonical Round ID.",
        [issue("Tournament Itinerary", "Round ID", "Select an existing tournament round.", row["Event ID"])],
      );
    }
    const courseId = upper(row["Course ID"]);
    if (courseId && !courseIds.has(courseId)) {
      throw guideError(
        "GUIDE_COURSE_REFERENCE_INVALID",
        "Tournament Itinerary references an unknown canonical Course ID.",
        [issue("Tournament Itinerary", "Course ID", "Select an existing tournament course.", row["Event ID"])],
      );
    }
  }
  for (const row of content.tournamentRules) {
    const reference = rounds.get(upper(row.Round)) || rounds.get(clean(row.Round).match(/\d+/)?.[0] || "");
    if (!reference) {
      throw guideError(
        "GUIDE_ROUND_REFERENCE_INVALID",
        "Tournament Rules references an unknown canonical round.",
        [issue("Tournament Rules", "Round", "Select an existing tournament round.", row.itemId)],
      );
    }
    if (reference.format && upper(row.Format) !== reference.format) {
      throw guideError(
        "GUIDE_RULE_SCORING_CONFLICT",
        "Tournament Rules format copy conflicts with canonical scoring facts.",
        [issue("Tournament Rules", "Format", "Match the canonical round format; scoring configuration was not changed.", row.itemId)],
      );
    }
  }
  for (const row of content.courses) {
    if (!courseIds.has(upper(row["Course ID"]))) {
      throw guideError(
        "GUIDE_COURSE_REFERENCE_INVALID",
        "Courses presentation references an unknown canonical Course ID.",
        [issue("Courses", "Course ID", "Select an existing tournament course.", row.itemId)],
      );
    }
  }
}

function sheetsFromContent(content) {
  return Object.fromEntries(PRODUCTION_GUIDE_AUTHORING_DOMAINS.map((spec) => [
    spec.source,
    {
      headers: spec.fields.map((value) => value.key),
      records: spec.cardinality === "one" ? [content[spec.key]] : content[spec.key],
    },
  ]));
}

function projectionIssues(error) {
  if (!(error instanceof GuideProjectionValidationError)) return [];
  return (error.validationIssues || []).map((value) => Object.freeze({
    source: clean(value.source || "Guide validation"),
    entity: clean(value.entity),
    field: clean(value.field),
    reason: clean(value.reason || value.message),
  }));
}

export function normalizeProductionGuideAuthoring({
  content,
  targetTournamentId,
  targetTournamentYear,
  canonicalCourseContext = [],
  canonicalRounds = [],
} = {}) {
  const source = record(content, "GUIDE_CONTENT_REQUIRED", "A complete Tournament Guide draft is required.");
  let serializedSource;
  try { serializedSource = JSON.stringify(source); }
  catch { throw guideError("GUIDE_CONTENT_TOO_LARGE", "Tournament Guide content could not be safely bounded."); }
  if (byteLength(serializedSource) > MAX_AUTHORING_BYTES) {
    throw guideError("GUIDE_CONTENT_TOO_LARGE", "Tournament Guide content exceeds the bounded authoring limit.");
  }
  rejectUnknownKeys(source, TOP_LEVEL_KEYS, "Tournament Guide");
  const tournamentId = clean(targetTournamentId);
  const tournamentYear = exactYear(targetTournamentYear ?? tournamentId);
  if (tournamentId !== String(tournamentYear)) {
    throw guideError("GUIDE_TOURNAMENT_SCOPE_MISMATCH", "The Guide target must use the exact tournament/year scope.");
  }
  const authoringContent = {
    tournament: normalizeTournament(source.tournament, tournamentId, tournamentYear),
  };
  for (const spec of PRODUCTION_GUIDE_AUTHORING_DOMAINS.filter((value) => value.cardinality === "many")) {
    if (!Array.isArray(source[spec.key])) {
      throw guideError("GUIDE_CONTENT_COLLECTION_REQUIRED", `${spec.label} content must be a complete list.`);
    }
    if (source[spec.key].length > COLLECTION_LIMITS[spec.key]) {
      throw guideError(
        "GUIDE_COLLECTION_TOO_LARGE",
        `${spec.label} contains too many items.`,
        [issue(spec.source, "Items", `Use no more than ${COLLECTION_LIMITS[spec.key]} items.`)],
      );
    }
    authoringContent[spec.key] = Object.freeze(source[spec.key].map((value, index) =>
      normalizeRow(value, spec, index, tournamentId, tournamentYear)));
    duplicateIdentity(authoringContent[spec.key], spec);
  }
  assertUniqueSectionSlugs(authoringContent.overview);
  assertCanonicalReferences(authoringContent, canonicalCourseContext, canonicalRounds);

  let projection;
  try {
    projection = buildGuideProjection({
      sheets: sheetsFromContent(authoringContent),
      tournament: { id: tournamentId, year: tournamentYear },
      approvedTournamentId: tournamentId,
      canonicalCourseContext: canonicalCourseContext.map((value) => ({
        ...value,
        courseId: value?.courseId ?? value?.course_id ?? value?.["Course ID"] ?? value?.id,
        round: value?.round ?? value?.round_number ?? value?.roundNumber,
      })),
      participantContentPolicy: GUIDE_PARTICIPANT_CONTENT_POLICIES.ALLOW_VALID_EMPTY_PRE_TOURNAMENT,
    });
  } catch (error) {
    if (!(error instanceof GuideProjectionValidationError)) throw error;
    throw guideError(
      "GUIDE_VALIDATION_FAILED",
      "Tournament Guide content needs review before it can be staged.",
      projectionIssues(error),
    );
  }
  const projectionPayload = Object.freeze({
    schemaVersion: GUIDE_PROJECTION_SCHEMA_VERSION,
    content: projection.content,
  });
  const authoringCanonicalJson = canonicalGuideJson(authoringContent);
  if (byteLength(authoringCanonicalJson) > MAX_AUTHORING_BYTES) {
    throw guideError("GUIDE_CONTENT_TOO_LARGE", "Tournament Guide content exceeds the bounded authoring limit.");
  }
  return Object.freeze({
    contractVersion: PRODUCTION_GUIDE_AUTHORING_CONTRACT,
    tournamentId,
    tournamentYear,
    authoringContent: Object.freeze(authoringContent),
    authoringCanonicalJson,
    authoringContentFingerprint: guideProjectionHash(authoringCanonicalJson),
    projectionPayload,
    projectionPayloadCanonicalJson: projection.payloadCanonicalJson,
    projectionPayloadHash: projection.payloadHash,
    contentCanonicalJson: projection.contentCanonicalJson,
    contentFingerprint: projection.contentFingerprint,
    validation: Object.freeze({
      ...projection.validation,
      valid: true,
      sourceCounts: projection.sourceCounts,
    }),
  });
}

export function productionGuideAuthoringPayloadHash(value) {
  return guideProjectionHash({
    contractVersion: PRODUCTION_GUIDE_AUTHORING_CONTRACT,
    value,
  });
}

export function productionGuideCanonicalReferenceFingerprint({
  canonicalRounds = [],
  canonicalCourseContext = [],
} = {}) {
  return guideProjectionHash({ canonicalRounds, canonicalCourseContext });
}

export function productionGuideReferenceSummary(canonicalCourseContext = [], canonicalRounds = []) {
  const rounds = [...canonicalRoundReferences(canonicalCourseContext, canonicalRounds).values()]
    .filter((value, index, all) => value.round && all.findIndex((candidate) => candidate.round === value.round) === index)
    .sort((left, right) => Number(left.round) - Number(right.round));
  const courses = (canonicalCourseContext || []).map((value) => ({
    courseId: clean(value?.course_id ?? value?.courseId ?? value?.["Course ID"] ?? value?.id),
    rounds: (Array.isArray(value?.rounds) ? value.rounds : [value]).map((round) => ({
      round: clean(round?.round_number ?? round?.roundNumber ?? round?.round),
      format: clean(round?.format ?? value?.format),
    })),
  })).filter((value) => value.courseId);
  return Object.freeze({ rounds: Object.freeze(rounds), courses: Object.freeze(courses) });
}
