import { buildCanonicalHistoryCourseHoleAliases } from "./history-2024-net-projection.js";
import { reconstructMatchProgression } from "./match-progression.js";

const TARGET_YEAR = 2023;
const clean = (value) => String(value ?? "").trim();
const normalizedId = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const finite = (value) => value !== null && value !== undefined && clean(value) !== "" && Number.isFinite(Number(value));

function value(row, ...fields) {
  const field = fields.find((candidate) => Object.prototype.hasOwnProperty.call(row || {}, candidate));
  return field ? row[field] : null;
}

function firstValue(row, ...fields) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(row || {}, field)) continue;
    const candidate = row[field];
    if (clean(candidate)) return candidate;
  }
  return null;
}

function roundNumber(row) {
  return Number(clean(value(row, "Round", "round")).replace(/\D/g, ""));
}

function formatCode(row) {
  const format = clean(value(row, "Format", "format")).toUpperCase();
  if (["BB", "BEST BALL", "BESTBALL", "2 VS 2"].includes(format)) return "BB";
  if (["SC", "SCRAMBLE", "2-MAN SCRAMBLE", "2 MAN SCRAMBLE"].includes(format)) return "SC";
  if (["SI", "SINGLES", "SINGLE"].includes(format)) return "SI";
  return format;
}

function completeCourseHoleSet(rows = []) {
  const holeNumbers = rows.map((row) => Number(value(row, "Hole Number")));
  const ranks = rows.map((row) => Number(value(row, "Stroke Index")));
  return rows.length === 18 &&
    new Set(holeNumbers).size === 18 &&
    holeNumbers.every((hole) => Number.isInteger(hole) && hole >= 1 && hole <= 18) &&
    rows.every((row) => finite(value(row, "Par"))) &&
    new Set(ranks).size === 18 &&
    ranks.every((rank) => Number.isInteger(rank) && rank >= 1 && rank <= 18);
}

function courseHoleRows(courseHoles, courseId, tee) {
  return courseHoles.filter((row) =>
    normalizedId(value(row, "Course ID")) === normalizedId(courseId) &&
    clean(value(row, "Tee")).toUpperCase() === clean(tee).toUpperCase()
  );
}

/**
 * The migrated Round Scorecards archive can retain a stale Course ID while
 * its Year/Round/Format still identifies one canonical archive course. This
 * projection changes no source row: it substitutes that unique course only
 * when its archive tee resolves to one complete 18-hole scoring set and the
 * source Course ID does not identify another compatible course assignment.
 */
export function buildCanonical2023ScorecardContextProjection({
  roundScorecards = [],
  courses = [],
  courseHoles = [],
} = {}) {
  const holeResolution = buildCanonicalHistoryCourseHoleAliases({
    year: TARGET_YEAR,
    courses,
    courseHoles,
  });
  const yearCourses = courses.filter((row) => Number(value(row, "Year", "year")) === TARGET_YEAR);
  const yearScorecards = roundScorecards.filter((row) => Number(value(row, "Year", "year")) === TARGET_YEAR);
  const courseByRoundFormat = new Map();
  const audit = [];

  for (const round of [...new Set(yearScorecards.map(roundNumber))].filter(Boolean).sort((a, b) => a - b)) {
    const roundCards = yearScorecards.filter((row) => roundNumber(row) === round);
    const formats = [...new Set(roundCards.map(formatCode))].filter(Boolean);
    for (const format of formats) {
      const cards = roundCards.filter((row) => formatCode(row) === format);
      const candidates = yearCourses.filter((course) => roundNumber(course) === round && formatCode(course) === format);
      const sourceCourseIds = [...new Set(cards.map((row) => clean(value(row, "Course ID", "courseId"))).filter(Boolean))];
      if (candidates.length !== 1) {
        audit.push({ round, format, sourceCourseIds, state: candidates.length ? "AMBIGUOUS_COURSE" : "UNSUPPORTED_COURSE" });
        continue;
      }

      const course = candidates[0];
      const courseId = clean(value(course, "Course ID", "courseId"));
      const tee = clean(value(course, "Tee", "Tee Played", "Tee Name", "tee"));
      const scoringRows = courseHoleRows(holeResolution.courseHoles, courseId, tee);
      if (!courseId || !tee || !completeCourseHoleSet(scoringRows)) {
        audit.push({ round, format, sourceCourseIds, courseId, tee, state: "UNSUPPORTED_SCORING_SET", rows: scoringRows.length });
        continue;
      }

      const exact = sourceCourseIds.length === 1 && normalizedId(sourceCourseIds[0]) === normalizedId(courseId);
      const sourceIdentifiesCompatibleAssignment = sourceCourseIds.some((sourceCourseId) =>
        yearCourses.some((candidate) =>
          normalizedId(value(candidate, "Course ID")) === normalizedId(sourceCourseId) &&
          roundNumber(candidate) === round &&
          formatCode(candidate) === format
        )
      );
      const safelyResolved = exact || (sourceCourseIds.length === 1 && !sourceIdentifiesCompatibleAssignment);
      if (!safelyResolved) {
        audit.push({ round, format, sourceCourseIds, courseId, tee, state: "AMBIGUOUS_SOURCE_CONTEXT", rows: scoringRows.length });
        continue;
      }

      courseByRoundFormat.set(`${round}|${format}`, courseId);
      audit.push({
        round,
        format,
        sourceCourseIds,
        courseId,
        tee,
        state: exact ? "EXACT" : "RESOLVED_BY_ROUND_CONTEXT",
        rows: scoringRows.length,
        parComplete: scoringRows.every((row) => finite(value(row, "Par"))),
        rankComplete: completeCourseHoleSet(scoringRows),
      });
    }
  }

  const projectedRoundScorecards = roundScorecards.map((row) => {
    if (Number(value(row, "Year", "year")) !== TARGET_YEAR) return row;
    const courseId = courseByRoundFormat.get(`${roundNumber(row)}|${formatCode(row)}`);
    return courseId ? { ...row, "Course ID": courseId } : row;
  });

  return {
    projectedRoundScorecards,
    courseHoles: holeResolution.courseHoles,
    audit,
    teeAudit: holeResolution.audit,
  };
}

function scorecardIdentity(scorecard) {
  return [
    clean(scorecard?.matchId),
    clean(scorecard?.scoreType).toUpperCase(),
    normalizedId(scorecard?.playerId || scorecard?.teamId),
  ].join("|");
}

function isMissing(scorecard) {
  return clean(scorecard?.status).toUpperCase() === "MISSING";
}

function completeNetEvidence(scorecard) {
  return ["COMPLETE", "VERIFIED"].includes(clean(scorecard?.status).toUpperCase()) &&
    Number(scorecard?.completedHoleCount) === 18 &&
    finite(scorecard?.total) &&
    scorecard?.netAvailable === true &&
    finite(scorecard?.strokesReceived) &&
    finite(scorecard?.netTotals?.total) &&
    Array.isArray(scorecard?.holes) &&
    scorecard.holes.length === 18 &&
    scorecard.holes.every((hole) =>
      finite(hole?.score) && finite(hole?.par) && finite(hole?.strokeIndex) && finite(hole?.netScore)
    );
}

/** Fail closed unless every recorded scoring identity keeps complete Net evidence. */
export function selectCanonical2023NetPresentationScorecards({
  year,
  round,
  scorecards = [],
  projectedScorecards = [],
} = {}) {
  const targetYear = Number(year);
  const targetRound = Number(round);
  const base = scorecards.filter((scorecard) =>
    Number(scorecard?.year) === targetYear && Number(scorecard?.round) === targetRound
  );
  if (targetYear !== TARGET_YEAR) return base;
  const projected = projectedScorecards.filter((scorecard) =>
    Number(scorecard?.year) === targetYear && Number(scorecard?.round) === targetRound
  );
  const baseIdentities = new Set(base.map(scorecardIdentity));
  const projectedIdentities = new Set(projected.map(scorecardIdentity));
  const sameIdentities = base.length > 0 &&
    base.length === projected.length &&
    baseIdentities.size === projectedIdentities.size &&
    [...baseIdentities].every((identity) => projectedIdentities.has(identity));
  const completeRecordedEvidence = projected.every((scorecard) =>
    isMissing(scorecard) || completeNetEvidence(scorecard)
  );
  const missingParity = base.every((scorecard) =>
    isMissing(scorecard) === isMissing(projected.find((candidate) => scorecardIdentity(candidate) === scorecardIdentity(scorecard)))
  );
  return sameIdentities && completeRecordedEvidence && missingParity ? projected : base;
}

/** Tournament records use all recorded Best Ball and Singles individual rounds. */
export function selectCanonical2023IndividualStatisticScorecards({
  scorecards = [],
  projectedScorecards = [],
} = {}) {
  const selected = [1, 3].flatMap((round) =>
    selectCanonical2023NetPresentationScorecards({
      year: TARGET_YEAR,
      round,
      scorecards,
      projectedScorecards,
    })
  ).filter((scorecard) => !isMissing(scorecard));
  const eligibleSourceIdentities = new Set(scorecards.filter((scorecard) =>
    Number(scorecard?.year) === TARGET_YEAR &&
    [1, 3].includes(Number(scorecard?.round)) &&
    clean(scorecard?.scoreType).toUpperCase() === "INDIVIDUAL" &&
    !isMissing(scorecard)
  ).map(scorecardIdentity));
  const selectedIdentities = new Set(selected.map(scorecardIdentity));
  const complete = selected.length > 0 &&
    selected.length === eligibleSourceIdentities.size &&
    selectedIdentities.size === eligibleSourceIdentities.size &&
    [...eligibleSourceIdentities].every((identity) => selectedIdentities.has(identity)) &&
    selected.every((scorecard) =>
      clean(scorecard?.scoreType).toUpperCase() === "INDIVIDUAL" &&
      ((Number(scorecard?.round) === 1 && clean(scorecard?.format).toUpperCase() === "BB") ||
        (Number(scorecard?.round) === 3 && clean(scorecard?.format).toUpperCase() === "SI")) &&
      completeNetEvidence(scorecard)
    );
  return complete ? selected : [];
}

function officialWinner(match) {
  const winner = clean(firstValue(match, "Matchup Winner", "matchupWinner", "18-Hole Winner", "overallWinner")).toUpperCase();
  if (["TEAM 1", "TEAM1", "1"].includes(winner)) return "A";
  if (["TEAM 2", "TEAM2", "2"].includes(winner)) return "B";
  if (["HALVED", "HALF", "TIE", "TIED"].includes(winner)) return null;
  return undefined;
}

/**
 * Unsafe Hole Winner/Progression evidence is explicitly suppressed when the
 * existing reconstruction conflicts with the official historical result.
 */
export function reconcileCanonical2023ScorecardPresentation({ scorecards = [], matches = [] } = {}) {
  const matchById = new Map(matches.map((match) => [clean(value(match, "Match ID", "matchId", "id")), match]));
  const cardsByMatch = new Map();
  for (const scorecard of scorecards) {
    if (!cardsByMatch.has(clean(scorecard?.matchId))) cardsByMatch.set(clean(scorecard?.matchId), []);
    cardsByMatch.get(clean(scorecard?.matchId)).push(scorecard);
  }
  const stateByMatch = new Map();
  for (const [matchId, cards] of cardsByMatch) {
    const progressionCards = cards.map((scorecard) => scorecard.historyProgressionMatchNetScoring
      ? { ...scorecard, matchNetScoring: scorecard.historyProgressionMatchNetScoring }
      : scorecard);
    const progression = reconstructMatchProgression(progressionCards);
    const official = officialWinner(matchById.get(matchId));
    const supported = Boolean(progression) && official !== undefined;
    const reconciled = supported && progression.winnerSide === official;
    stateByMatch.set(matchId, { supported, reconciled });
  }
  return scorecards.map((scorecard) => {
    const state = stateByMatch.get(clean(scorecard?.matchId));
    if (!state?.supported) return scorecard;
    return state.reconciled
      ? { ...scorecard, historyProgressionReconciled: true }
      : {
        ...scorecard,
        historyProgressionSuppressed: true,
        matchNetScoring: {
          ...scorecard.matchNetScoring,
          holeWinners: [],
        },
      };
  });
}
