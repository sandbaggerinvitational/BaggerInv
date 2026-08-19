const clean = (value) => String(value ?? "").trim();

export const GUIDE_FORMATS = Object.freeze(["BB", "SC", "SI"]);
export const GUIDE_FORMAT_NAMES = Object.freeze({ BB: "Best Ball", SC: "Scramble", SI: "Singles" });

const FORMAT_TERMS = Object.freeze({
  BB: ["best ball", "four-ball", "four ball", "fourball"],
  SC: ["scramble"],
  SI: ["singles", "single match"],
});

export function guideFormatCode(value) {
  const normalized = clean(value).toUpperCase();
  if (/BEST\s*BALL|FOUR.?BALL/.test(normalized)) return "BB";
  if (/SCRAMBLE/.test(normalized)) return "SC";
  if (/SINGLES?/.test(normalized)) return "SI";
  return normalized;
}

function searchableRule(rule) {
  return Object.values(rule || {}).join(" ").toLowerCase();
}

/** Assign each source rule to at most one format presentation. A rule that
 * explicitly spans formats stays in Competition Rules instead of repeating. */
export function rulesPresentationModel(ruleBook = []) {
  const byFormat = Object.fromEntries(GUIDE_FORMATS.map((format) => [format, []]));
  const remaining = [];
  for (const rule of ruleBook) {
    const text = searchableRule(rule);
    const formats = GUIDE_FORMATS.filter((format) => FORMAT_TERMS[format].some((term) => text.includes(term)));
    if (formats.length === 1) byFormat[formats[0]].push(rule);
    else remaining.push(rule);
  }
  return { byFormat, remaining };
}

function roundNumber(value) {
  const parsed = Number(clean(value).match(/\d+/)?.[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Current Supabase course/round context exposes format identity, but not the
 * Google Rules point or handicap definitions. Validate only comparable facts.
 */
export function rulesCurrentContextParity({ liveRounds = [], tournamentRules = [], formats = [] } = {}) {
  const issues = [];
  const catalog = new Set(formats.map((row) => guideFormatCode(row["Format ID"] || row.Format)).filter(Boolean));
  for (const liveRound of liveRounds) {
    const number = roundNumber(liveRound.number ?? liveRound.Round);
    const currentFormat = guideFormatCode(liveRound.format ?? liveRound.Format);
    const configured = tournamentRules.find((row) => roundNumber(row.Round) === number);
    const configuredFormat = guideFormatCode(configured?.Format);
    if (!configured) issues.push(`Round ${number} has no Tournament Rules configuration.`);
    else if (currentFormat && configuredFormat !== currentFormat) {
      issues.push(`Round ${number} format is ${currentFormat} in current scoring context and ${configuredFormat || "missing"} in Tournament Rules.`);
    }
    if (currentFormat && !catalog.has(currentFormat)) issues.push(`Round ${number} format ${currentFormat} is missing from the Rounds catalog.`);
  }
  return {
    format: issues.length ? "DEFECT_FOUND" : "PASS",
    points: "NOT_STRUCTURALLY_COMPARABLE",
    handicap: "NOT_STRUCTURALLY_COMPARABLE",
    issues,
  };
}
