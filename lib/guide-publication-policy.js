// Shared presentation requirements, not scoring or Tournament Setup authority.
const clean = (value) => String(value ?? "").trim();
export const OPTIONAL_GUIDE_DOMAINS = Object.freeze([
  "overview", "timelineRows", "ruleBook", "dining", "localGuide", "importantContacts",
]);
export const GUIDE_OVERVIEW_PUBLICATION_FIELDS = Object.freeze([
  ["Tournament Name", "Name"], ["Tournament Edition", "Annual"],
  ["Tournament Dates", "Dates"], ["Destination", "Location"], ["Time Zone", "Timezone"],
]);
export function guideOverviewPublicationIssues(row = {}) {
  const issues = GUIDE_OVERVIEW_PUBLICATION_FIELDS
    .filter((aliases) => !aliases.some((key) => clean(row[key])))
    .map((aliases) => ({ field: aliases[0], message: `Complete ${aliases[0]} before publication.` }));
  const zone = clean(row["Time Zone"] || row.Timezone);
  if (zone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0); }
    catch { issues.push({ field: "Time Zone", message: "Use a valid tournament timezone." }); }
  }
  const start = clean(row["Start Date"]), end = clean(row["End Date"]);
  // Display dates are required; optional structured bounds must form a pair.
  // Never infer operational dates or timezone from display copy.
  if (Boolean(start) !== Boolean(end) || (start && end && start > end)) {
    issues.push({ field: "Start Date / End Date", message: "Supply both structured dates in chronological order, or leave both blank." });
  }
  return issues;
}

export function guideDestinationAvailable(content, icon) {
  const has = (key) => Array.isArray(content[key]) && content[key].length > 0;
  return ({ schedule: has("schedule"), courses: has("courses"),
    rules: has("ruleBook") || has("tournamentRules"), dining: has("dining"),
    local: has("localGuide"), contacts: has("importantContacts") })[icon] === true;
}
