const text = (record) => Object.values(record || {}).join(" ").toLowerCase();
const firstValue = (records, fields) => fields.map((field) => records.find((record) => record?.[field])?.[field]).find(Boolean);

export function formatRuleSummary(formatCode, sources, points) {
  const records = sources.filter(Boolean);
  const combined = records.map(text).join(" ");
  const configuredHandicap = firstValue(records, ["Handicap Allocation", "Handicap", "Handicap Rules", "Playing Handicap"]);
  const scrambleAllocation = combined.match(/(\d{1,3})%\s+of\s+the\s+low\s+handicap\s+and\s+(\d{1,3})%\s+of\s+the\s+high\s+handicap/i);
  const standardAllocation = combined.match(/(\d{1,3})%\s+handicap\s+allocation/i);
  const handicap = configuredHandicap
    || (scrambleAllocation ? `${scrambleAllocation[1]}% / ${scrambleAllocation[2]}% Team Handicap` : "")
    || (standardAllocation ? `${standardAllocation[1]}% Handicap Allocation` : "");
  const configuredScoring = firstValue(records, ["Scoring Format", "Scoring", "Match Format"]);
  const genericScoring = combined.match(/\b(match\s+play|stroke\s+play)\b/i)?.[1];
  const scoring = configuredScoring
    || (/nassau\s+scoring/i.test(combined) ? "Nassau Match Play" : "")
    || (formatCode === "SI" && /18-hole\s+match/i.test(combined) ? "18-Hole Match Play" : "")
    || (genericScoring ? `${genericScoring.charAt(0).toUpperCase()}${genericScoring.slice(1)}` : "");
  return [points !== null && points !== undefined && points !== "" ? `${points} Points` : "", handicap, scoring].filter(Boolean);
}
