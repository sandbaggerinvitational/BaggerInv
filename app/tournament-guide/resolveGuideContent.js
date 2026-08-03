import { getCourses, getTournaments, refreshHistoricalData } from "../../lib/stats";
import { isTransientGoogleError } from "../../lib/google-api-reliability";
import { validateTournamentGuideHeaders } from "../../lib/tournament-guide-content";
import { getTournamentData } from "../live/sheetData";

let pending;
let lastGood;
let lastGoodAt = 0;
const reportedSchemaIssues = new Set();

function reportSchemaIssues(diagnostics) {
  for (const [moduleName, module] of Object.entries(diagnostics).filter(([, item]) => !item.valid)) {
    for (const [sheetName, sheet] of Object.entries(module.sheets).filter(([, item]) => !item.valid)) {
      const key = `${moduleName}:${sheetName}:${sheet.missing.join("|")}`;
      if (reportedSchemaIssues.has(key)) continue;
      reportedSchemaIssues.add(key);
      console.warn("Tournament Guide workbook schema mismatch", {
        module: moduleName,
        sheet: sheetName,
        missingColumns: sheet.missing,
      });
    }
  }
}

async function loadGuideContent() {
  const [liveData] = await Promise.all([getTournamentData(), refreshHistoricalData()]);
  const tournament = getTournaments().find((item) => Number(item.year) === Number(liveData?.tournament?.year)) || getTournaments()[0];
  if (!tournament) throw new Error("Tournament Guide could not resolve the current tournament.");
  const guide = liveData.guide || {};
  const diagnostics = validateTournamentGuideHeaders(guide.headers);
  reportSchemaIssues(diagnostics);
  return {
    tournament,
    liveTournament: liveData.tournament,
    liveRounds: liveData.rounds || [],
    timelineNow: liveData.timeline?.effectiveNow || new Date().toISOString(),
    overview: guide.sections || [],
    schedule: guide.itinerary || [],
    courses: guide.courses || [],
    courseArchive: getCourses(),
    ruleBook: guide.ruleBook || [],
    tournamentRules: guide.tournamentRules || [],
    rounds: guide.rounds || [],
    dining: guide.dining || [],
    localGuide: guide.localGuide || [],
    courseHoles: guide.courseHoles || [],
    diagnostics,
  };
}

export async function resolveTournamentGuideContent() {
  if (pending) return pending;
  pending = loadGuideContent().then((content) => {
    lastGood = content;
    lastGoodAt = Date.now();
    return content;
  }).catch((error) => {
    if (isTransientGoogleError(error) && lastGood && Date.now() - lastGoodAt < 60_000) return lastGood;
    throw error;
  }).finally(() => { pending = undefined; });
  return pending;
}
