// Client-safe presentation helpers. Readiness is advisory; server + SQL remain
// the publication gate. No operational Setup fields are written or inferred.
import { guideOverviewPublicationIssues } from "./guide-publication-policy.js";
const clean = (value) => String(value ?? "").trim();
export function guideOverviewForEditor(value = {}) {
  value = value && typeof value === "object" ? value : {};
  return { ...value,
    "Tournament Name": clean(value["Tournament Name"]) || clean(value.Name),
    "Tournament Edition": clean(value["Tournament Edition"]) || clean(value.Annual),
    "Tournament Dates": clean(value["Tournament Dates"]) || clean(value.Dates),
  };
}

export const GUIDE_READINESS_DOMAINS = [
  ["overview", "Guide Sections", ["Section ID", "Section Name", "Section Slug", "Description", "Display Order"], true],
  ["schedule", "Guide Itinerary", ["Event ID", "Event Date", "Day Label", "Start Time", "Event Type", "Title", "Display Order"], true],
  ["timelineRows", "Home Timeline", ["Event Date", "Start Time", "Title", "Sort Order"]],
  ["ruleBook", "Rule Book", ["Rule ID", "Category", "Title", "Body", "Display Order"], true],
  ["dining", "Dining", ["Day", "Meal", "Location", "Sort Order"]],
  ["localGuide", "Local Guide", ["Section", "Title", "Sort Order"]],
  ["importantContacts", "Important Contacts", ["Category", "Name", "Sort Order"]],
];

export function guideDraftReadiness(content = {}) {
  const domains = GUIDE_READINESS_DOMAINS.map(([key, label, required, status]) => {
    const rows = content[key] || [];
    const eligible = status ? rows.filter((row) => clean(row.Status).toUpperCase() === "PUBLISHED" || (!clean(row.Status) && /^(true|yes|1)$/i.test(clean(row.Published)))) : rows;
    const incomplete = rows.some((row) => required.some((field) => !clean(row[field])));
    const requiredDomain = key === "schedule";
    const complete = !incomplete && (!requiredDomain || eligible.length > 0);
    return { key, label, required: requiredDomain, count: rows.length, complete,
      state: !rows.length ? requiredDomain ? "Needs at least one published event" : "Not used"
        : !complete ? "Needs attention" : `${rows.length} item${rows.length === 1 ? "" : "s"}` };
  });
  const overviewComplete = guideOverviewPublicationIssues(content.tournament).length === 0;
  return { overviewComplete, domains, complete: overviewComplete && domains.every((domain) => domain.complete) };
}

export function guideRoundLabel(value) {
  const number = clean(value).match(/^(?:round\s*)?(\d+)$/i)?.[1];
  return number ? `Round ${Number(number)}` : clean(value);
}
