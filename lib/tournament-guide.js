const clean = (value) => String(value ?? "").trim();

// Keep public visibility rules in one server-safe module so every Guide view
// applies the same tournament, publication, sensitivity, and ordering policy.

export const GUIDE_SECTION_ORDER = [
  ["overview", "Overview"],
  ["itinerary", "Itinerary"],
  ["rules", "Rules"],
  ["golf-genius", "Golf Genius"],
  ["calcutta-skins", "Calcutta & Skins"],
  ["important-information", "Important Information"],
];

export function isTruthy(value) {
  return value === true || ["true", "yes", "y", "1"].includes(clean(value).toLowerCase());
}

export function isPublished(record) {
  return clean(record?.Status).toLowerCase() === "published";
}

export function displayOrder(record) {
  const value = Number(record?.["Display Order"]);
  return Number.isFinite(value) ? value : 9999;
}

export function recordMatchesTournament(record, tournament) {
  const value = clean(record?.["Tournament ID"]);
  return Boolean(value) && [clean(tournament?.id), clean(tournament?.year)].includes(value);
}

export function publicGuideRecords(records, tournament, { allowSensitive = false } = {}) {
  return (records || [])
    .filter((record) => recordMatchesTournament(record, tournament))
    .filter(isPublished)
    .filter((record) => allowSensitive || !isTruthy(record.Sensitive))
    .sort((a, b) => displayOrder(a) - displayOrder(b));
}

export function sectionSlug(value) {
  const normalized = clean(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (normalized === "calcutta-and-skins" || normalized === "calcutta-skins") return "calcutta-skins";
  if (normalized === "important" || normalized === "information") return "important-information";
  return normalized;
}

export function informationForSection(records, slug) {
  return (records || []).filter((record) => sectionSlug(record.Section) === slug);
}

export function paragraphs(value) {
  return clean(value).split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

export function groupBy(records, field) {
  return (records || []).reduce((groups, record) => {
    const key = clean(record[field]) || "General";
    if (!groups[key]) groups[key] = [];
    groups[key].push(record);
    return groups;
  }, {});
}

export function visibleGuideSections(data) {
  const availability = {
    overview: true,
    itinerary: Boolean(data.itinerary?.length),
    rules: Boolean(data.rules?.length),
    "golf-genius": Boolean(informationForSection(data.information, "golf-genius").length),
    "calcutta-skins": Boolean(informationForSection(data.information, "calcutta-skins").length),
    "important-information": Boolean(informationForSection(data.information, "important-information").length),
  };
  return GUIDE_SECTION_ORDER.filter(([slug]) => availability[slug]);
}
