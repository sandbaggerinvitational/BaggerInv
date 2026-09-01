function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function naturalList(items) {
  if (items.length < 2) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function publicGuideOverviewFallback(content = {}) {
  const available = [
    ["the schedule", count(content.schedule)],
    ["rules", count(content.ruleBook) || count(content.tournamentRules)],
    ["dining", count(content.dining)],
    ["local information", count(content.localGuide)],
    ["important contacts", count(content.importantContacts)],
  ].filter(([, present]) => present).map(([label]) => label);

  return available.length
    ? `Explore ${naturalList(available)} for Sandbagger Invitational week.`
    : "Your published resource for Sandbagger Invitational week.";
}
