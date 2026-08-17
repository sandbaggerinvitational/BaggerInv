const clean = (value) => String(value ?? "").trim();
const normalizedId = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const finite = (value) => value !== null && value !== undefined && clean(value) !== "" && Number.isFinite(Number(value));

function rowValue(row, ...fields) {
  const field = fields.find((candidate) => Object.prototype.hasOwnProperty.call(row || {}, candidate));
  return field ? row[field] : null;
}

function completeCourseHoleSet(rows = []) {
  const holeNumbers = rows.map((row) => Number(rowValue(row, "Hole Number")));
  const strokeIndexes = rows.map((row) => Number(rowValue(row, "Stroke Index")));
  return rows.length === 18 &&
    holeNumbers.every((value) => Number.isInteger(value) && value >= 1 && value <= 18) &&
    new Set(holeNumbers).size === 18 &&
    rows.every((row) => finite(rowValue(row, "Par"))) &&
    strokeIndexes.every((value) => Number.isInteger(value) && value >= 1 && value <= 18) &&
    new Set(strokeIndexes).size === 18;
}

/**
 * Completed 2024 presentation rows use archived tee labels while the migrated
 * Course Holes rows retain their canonical scoring-tee labels. When a Course
 * ID has exactly one complete 18-hole scoring set, expose that existing set
 * under the archived display label for the read-only presentation projection.
 * Ambiguous or incomplete evidence is deliberately left unresolved.
 */
export function buildCanonicalHistoryCourseHoleAliases({
  year,
  courses = [],
  courseHoles = [],
} = {}) {
  const targetYear = Number(year);
  const aliases = [];
  const audit = [];

  for (const course of courses.filter((row) => Number(rowValue(row, "Year")) === targetYear)) {
    const courseId = clean(rowValue(course, "Course ID"));
    const displayTee = clean(rowValue(course, "Tee", "Tee Played", "Tee Name"));
    if (!courseId || !displayTee) continue;

    const sameCourse = courseHoles.filter((row) => normalizedId(rowValue(row, "Course ID")) === normalizedId(courseId));
    const exact = sameCourse.filter((row) => clean(rowValue(row, "Tee")).toUpperCase() === displayTee.toUpperCase());
    if (completeCourseHoleSet(exact)) {
      audit.push({ courseId, displayTee, sourceTee: displayTee, state: "EXACT", rows: 18 });
      continue;
    }

    const rowsByTee = new Map();
    for (const row of sameCourse) {
      const tee = clean(rowValue(row, "Tee"));
      if (!tee) continue;
      if (!rowsByTee.has(tee.toUpperCase())) rowsByTee.set(tee.toUpperCase(), { tee, rows: [] });
      rowsByTee.get(tee.toUpperCase()).rows.push(row);
    }
    const candidates = [...rowsByTee.values()].filter(({ rows }) => completeCourseHoleSet(rows));
    if (candidates.length !== 1) {
      audit.push({
        courseId,
        displayTee,
        sourceTee: null,
        state: candidates.length ? "AMBIGUOUS" : "UNSUPPORTED",
        rows: 0,
      });
      continue;
    }

    aliases.push(...candidates[0].rows.map((row) => ({ ...row, Tee: displayTee })));
    audit.push({
      courseId,
      displayTee,
      sourceTee: candidates[0].tee,
      state: "ALIASED",
      rows: candidates[0].rows.length,
    });
  }

  return {
    courseHoles: [...courseHoles, ...aliases],
    aliases,
    audit,
  };
}

function scorecardIdentity(scorecard) {
  return [
    clean(scorecard?.matchId),
    clean(scorecard?.scoreType).toUpperCase(),
    normalizedId(scorecard?.playerId || scorecard?.teamId),
  ].join("|");
}

/**
 * Applies the canonical shadow projection only when every scoring identity in
 * the 2024 Best Ball or Singles round has complete, hole-level Net evidence.
 */
export function selectCanonical2024NetPresentationScorecards({
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
  if (targetYear !== 2024 || ![1, 3].includes(targetRound)) return base;
  const projected = projectedScorecards.filter((scorecard) =>
    Number(scorecard?.year) === targetYear && Number(scorecard?.round) === targetRound
  );
  const baseIdentities = new Set(base.map(scorecardIdentity));
  const projectedIdentities = new Set(projected.map(scorecardIdentity));
  const sameIdentities = base.length > 0 &&
    base.length === projected.length &&
    baseIdentities.size === projectedIdentities.size &&
    [...baseIdentities].every((identity) => projectedIdentities.has(identity));
  const completeNet = projected.every((scorecard) =>
    scorecard?.netAvailable === true &&
    finite(scorecard?.netTotals?.total) &&
    Array.isArray(scorecard?.holes) &&
    scorecard.holes.length === 18 &&
    scorecard.holes.every((hole) => finite(hole?.netScore)) &&
    scorecard?.matchNetScoring?.available === true
  );
  return sameIdentities && completeNet ? projected : base;
}

/**
 * Tournament-wide 2024 individual statistics use only the 24 Best Ball player
 * rounds and 24 Singles player rounds. The selection fails closed unless both
 * rounds retain complete canonical gross, par, and hole-relative evidence.
 * Scramble pairing cards are intentionally excluded from this population.
 */
export function selectCanonical2024IndividualStatisticScorecards({
  scorecards = [],
  projectedScorecards = [],
} = {}) {
  const selected = [1, 3].flatMap((round) =>
    selectCanonical2024NetPresentationScorecards({
      year: 2024,
      round,
      scorecards,
      projectedScorecards,
    })
  );
  const countByRound = new Map([1, 3].map((round) => [
    round,
    selected.filter((scorecard) => Number(scorecard?.round) === round).length,
  ]));
  const identities = new Set(selected.map(scorecardIdentity));
  const completeEvidence = selected.length === 48 &&
    countByRound.get(1) === 24 &&
    countByRound.get(3) === 24 &&
    identities.size === 48 &&
    selected.every((scorecard) =>
      clean(scorecard?.scoreType).toUpperCase() === "INDIVIDUAL" &&
      ((Number(scorecard?.round) === 1 && clean(scorecard?.format).toUpperCase() === "BB") ||
        (Number(scorecard?.round) === 3 && clean(scorecard?.format).toUpperCase() === "SI")) &&
      Number(scorecard?.completedHoleCount) === 18 &&
      finite(scorecard?.total) &&
      Array.isArray(scorecard?.holes) &&
      scorecard.holes.length === 18 &&
      scorecard.holes.every((hole) => finite(hole?.score) && finite(hole?.par) && finite(hole?.toPar))
    );
  return completeEvidence ? selected : [];
}

function individualEvidence(scorecards, year, round) {
  const targetYear = Number(year);
  const targetRound = round === null || round === undefined ? null : Number(round);
  return scorecards.filter((scorecard) =>
    Number(scorecard?.year) === targetYear &&
    (targetRound === null || Number(scorecard?.round) === targetRound) &&
    clean(scorecard?.scoreType).toUpperCase() === "INDIVIDUAL" &&
    ["BB", "SI"].includes(clean(scorecard?.format).toUpperCase()) &&
    Number(scorecard?.completedHoleCount) === 18 &&
    finite(scorecard?.total)
  );
}

function uniqueHolders(scorecards = []) {
  const seen = new Set();
  return scorecards.map((scorecard) => ({
    id: `${clean(scorecard.matchId)}-${normalizedId(scorecard.playerId || scorecard.playerName)}`,
    name: clean(scorecard.playerName || scorecard.playerId),
    subtitle: "",
    matchId: clean(scorecard.matchId),
    playerId: clean(scorecard.playerId),
  })).filter((holder) => {
    const identity = normalizedId(holder.playerId || holder.name);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/** Holder-only projection for accepted gross statistic values. */
export function buildHistoricalIndividualStatisticHolders({
  year,
  round = null,
  scorecards = [],
  acceptedValues = {},
} = {}) {
  const cards = individualEvidence(scorecards, year, round);
  const valueFor = {
    lowestRound: (scorecard) => scorecard.total,
    lowestFrontNine: (scorecard) => scorecard.frontNine,
    lowestBackNine: (scorecard) => scorecard.backNine,
  };
  return Object.fromEntries(Object.entries(valueFor).map(([key, select]) => {
    const accepted = Number(acceptedValues[key]);
    const holders = Number.isFinite(accepted)
      ? uniqueHolders(cards.filter((scorecard) => Number(select(scorecard)) === accepted))
      : [];
    return [key, holders];
  }));
}

/** Uses the existing scorecard birdie metric to preserve all canonical ties. */
export function buildHistoricalIndividualBirdieHolders({
  year,
  round = null,
  scorecards = [],
  acceptedValue,
} = {}) {
  const accepted = Number(acceptedValue);
  if (!Number.isFinite(accepted)) return [];
  const grouped = new Map();
  for (const scorecard of individualEvidence(scorecards, year, round)) {
    const birdies = Number(scorecard?.metrics?.birdies?.value);
    const identity = normalizedId(scorecard?.playerId || scorecard?.playerName);
    if (!identity || !Number.isFinite(birdies)) continue;
    const current = grouped.get(identity) || { birdies: 0, cards: [] };
    current.birdies += birdies;
    current.cards.push(scorecard);
    grouped.set(identity, current);
  }
  return [...grouped.values()]
    .filter((entry) => entry.birdies === accepted)
    .flatMap((entry) => uniqueHolders(entry.cards).slice(0, 1));
}

export function combineHistoricalHolders(...collections) {
  const seen = new Set();
  return collections.flat().filter((holder) => {
    const identity = clean(holder?.id) || `${normalizedId(holder?.name)}|${normalizedId(holder?.subtitle)}`;
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function historicalHolderText(holders = []) {
  return holders.map((holder) => clean(holder?.name)).filter(Boolean).join(" · ");
}

export function historicalHolderContext(holders = []) {
  return [...new Set(holders.map((holder) => clean(holder?.subtitle)).filter(Boolean))].join(" · ");
}

export function omitMeaninglessHistoricalBirdieLeader({ year, value }) {
  return Number(year) === 2024 && Number(value) === 0;
}
