const DEFAULT_EMPTY_STATE = "No qualifying recorded performance yet.";

export const SCORECARD_RECORD_ELIGIBILITY = {
  "lowest-individual-round": { unit: "STROKES" },
  "lowest-individual-front-nine": { unit: "STROKES" },
  "lowest-individual-back-nine": { unit: "STROKES" },
  "lowest-singles-round": { unit: "STROKES" },
  "most-individual-birdies": { minimumValue: 1, unit: "BIRDIES", emptyState: "No recorded birdies yet." },
  "most-individual-eagles": { minimumValue: 1, unit: "EAGLES", emptyState: "No recorded eagles yet." },
  "most-consecutive-individual-birdies": {
    minimumValue: 2, unit: "BIRDIES", emptyState: "No recorded streak of two or more birdies yet.",
  },
  "best-individual-closing-stretch": {
    unit: "STROKES", emptyState: "No complete recorded score on Holes 16–18 yet.",
  },
  "most-team-birdies": { minimumValue: 1, unit: "BIRDIES", emptyState: "No recorded team birdies yet." },
  "most-consecutive-team-birdies": {
    minimumValue: 2, unit: "BIRDIES", emptyState: "No recorded team streak of two or more birdies yet.",
  },
  "lowest-scramble-round": { unit: "STROKES" },
  "lowest-scramble-front-nine": { unit: "STROKES" },
  "lowest-scramble-back-nine": { unit: "STROKES" },
  "lowest-best-ball-team-round": { unit: "STROKES" },
  "lowest-best-ball-front-nine": { unit: "STROKES" },
  "lowest-best-ball-back-nine": { unit: "STROKES" },
  "career-most-birdies": { minimumValue: 1, unit: "BIRDIES", emptyState: "No recorded birdies yet." },
  "career-most-eagles": { minimumValue: 1, unit: "EAGLES", emptyState: "No recorded eagles yet." },
  "career-most-pars": { minimumValue: 1, unit: "PARS", emptyState: "No recorded pars yet." },
  "most-holes-won": { unit: "HOLES" },
  "most-holes-halved": { unit: "HOLES" },
  "most-front-nine-holes-won": { unit: "HOLES" },
  "most-back-nine-holes-won": { unit: "HOLES" },
  "most-closing-holes-won": { unit: "HOLES" },
  "most-lead-changes": {
    minimumValue: 1, unit: "LEAD_CHANGES", emptyState: "No recorded match with a lead change yet.",
  },
  "most-consecutive-holes-won-match": {
    minimumValue: 2, unit: "HOLES", emptyState: "No recorded streak of two or more holes won yet.",
  },
  "most-consecutive-holes-halved": {
    minimumValue: 2, unit: "HOLES", emptyState: "No recorded streak of two or more halved holes yet.",
  },
  "largest-comeback": {
    minimumValue: 1, unit: "HOLES", emptyState: "No recorded comeback from one or more holes down yet.",
  },
  "largest-lead": { unit: "HOLES" },
  "largest-lead-blown": {
    minimumValue: 1, unit: "HOLES", emptyState: "No recorded lead of one or more holes blown yet.",
  },
  "most-holes-won-one-match": { unit: "HOLES" },
  "most-holes-lost-one-match": { unit: "HOLES" },
  "best-closing-stretch-match": { unit: "HOLES" },
  "best-front-nine-match": {
    minimumValue: 1,
    unit: "HOLES",
    title: "Most Front-Nine Holes Won in a Match",
    emptyState: "No recorded front-nine holes won yet.",
  },
  "best-back-nine-match": {
    minimumValue: 1,
    unit: "HOLES",
    title: "Most Back-Nine Holes Won in a Match",
    emptyState: "No recorded back-nine holes won yet.",
  },
};

export function recordEligibility(slug) {
  return SCORECARD_RECORD_ELIGIBILITY[slug] || {};
}

export function filterEligibleRecordEntries(slug, entries = []) {
  const rule = recordEligibility(slug);
  return entries.filter((entry) => {
    if (entry?.value === null || entry?.value === undefined || String(entry.value).trim() === "") {
      return false;
    }
    const value = Number(entry?.value);
    if (!Number.isFinite(value)) return false;
    if (Number.isFinite(rule.minimumValue) && value < rule.minimumValue) return false;
    if (Number.isFinite(rule.maximumValue) && value > rule.maximumValue) return false;
    return true;
  });
}

export function recordEmptyState(slug) {
  return recordEligibility(slug).emptyState || DEFAULT_EMPTY_STATE;
}

export function recordUnit(slug) {
  return recordEligibility(slug).unit || "";
}

export function formatRecordUnit(value, unit) {
  const plural = Math.abs(Number(value)) !== 1;
  if (unit === "STROKES") return plural ? "strokes" : "stroke";
  if (unit === "HOLES") return plural ? "holes" : "hole";
  if (unit === "BIRDIES") return plural ? "birdies" : "birdie";
  if (unit === "EAGLES") return plural ? "eagles" : "eagle";
  if (unit === "PARS") return plural ? "pars" : "par";
  if (unit === "LEAD_CHANGES") return plural ? "lead changes" : "lead change";
  return "";
}
