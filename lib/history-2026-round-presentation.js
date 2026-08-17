import { reconstructMatchProgression } from "./match-progression.js";

const clean = (value) => String(value ?? "").trim();
const finite = (value) => value !== null && value !== undefined && clean(value) !== "" && Number.isFinite(Number(value));
const unique = (values) => [...new Set(values.map(clean).filter(Boolean))];

function completeTeamScorecard(scorecard) {
  return clean(scorecard?.scoreType).toUpperCase() === "TEAM" &&
    Number(scorecard?.completedHoleCount) === 18 &&
    Array.isArray(scorecard?.holes) &&
    scorecard.holes.length === 18 &&
    scorecard.holes.every((hole) => finite(hole?.score));
}

function pairingHolder(scorecard) {
  const names = unique(scorecard?.participantNames || []);
  if (names.length !== 2) return null;
  return {
    id: `${clean(scorecard?.matchId)}-${Number(scorecard?.side) || clean(scorecard?.teamId)}`,
    name: names.join(" & "),
    subtitle: clean(scorecard?.teamName),
    matchId: clean(scorecard?.matchId),
    side: Number(scorecard?.side) || null,
  };
}

function tiedHolders(scorecards, acceptedValue, valueFor) {
  if (!finite(acceptedValue)) return [];
  const seen = new Set();
  return scorecards
    .filter((scorecard) => Number(valueFor(scorecard)) === Number(acceptedValue))
    .map(pairingHolder)
    .filter((holder) => {
      if (!holder || seen.has(holder.id)) return false;
      seen.add(holder.id);
      return true;
    });
}

/**
 * Resolve holder names for 2026 Scramble statistics from the canonical TEAM
 * scorecard identity. Accepted statistic values remain owned by the existing
 * scorecard analytics; this helper only attaches the two golfers and team.
 */
export function build2026ScrambleRoundStatisticHolders({
  scorecards = [],
  acceptedValues = {},
} = {}) {
  const complete = scorecards.filter((scorecard) =>
    Number(scorecard?.year) === 2026 &&
    Number(scorecard?.round) === 2 &&
    clean(scorecard?.format).toUpperCase() === "SC" &&
    completeTeamScorecard(scorecard)
  );
  return {
    birdieLeader: tiedHolders(complete, acceptedValues.birdieLeader, (scorecard) => scorecard?.metrics?.birdies?.value),
    lowestFrontNine: tiedHolders(complete, acceptedValues.lowestFrontNine, (scorecard) => scorecard?.frontNine),
    lowestBackNine: tiedHolders(complete, acceptedValues.lowestBackNine, (scorecard) => scorecard?.backNine),
    lowestTeamRound: tiedHolders(complete, acceptedValues.lowestTeamRound, (scorecard) => scorecard?.total),
  };
}

/**
 * Select the lowest complete 2026 Best Ball side total from the net-best-ball
 * rows already produced by the canonical scoring model. No scores are derived
 * here: incomplete/unavailable rows are excluded and tied pairings are kept.
 */
export function build2026BestBallLowestTeamRound(scorecards = []) {
  const byMatchAndSide = new Map();
  const bestBallCards = scorecards.filter((scorecard) =>
    Number(scorecard?.year) === 2026 &&
    Number(scorecard?.round) === 1 &&
    clean(scorecard?.format).toUpperCase() === "BB" &&
    clean(scorecard?.scoreType).toUpperCase() === "INDIVIDUAL"
  );

  for (const scorecard of bestBallCards) {
    const side = Number(scorecard?.side);
    const row = scorecard?.matchNetScoring?.rows?.find((candidate) => Number(candidate?.side) === side);
    const holes = Array.isArray(row?.holes) ? row.holes : [];
    if (!side || !row?.available || holes.length !== 18 || holes.some((hole) => !finite(hole?.netScore)) || !finite(row?.netTotals?.total)) continue;
    const key = `${clean(scorecard?.matchId)}|${side}`;
    if (!byMatchAndSide.has(key)) byMatchAndSide.set(key, { row, cards: [] });
    byMatchAndSide.get(key).cards.push(scorecard);
  }

  const candidates = [...byMatchAndSide.entries()].map(([key, entry]) => {
    const names = unique(entry.cards.map((scorecard) => scorecard?.playerName));
    if (names.length !== 2) return null;
    return {
      value: Number(entry.row.netTotals.total),
      holder: {
        id: key.replace("|", "-"),
        name: names.join(" & "),
        subtitle: clean(entry.row.name || entry.cards[0]?.teamName),
        matchId: clean(entry.cards[0]?.matchId),
        side: Number(entry.cards[0]?.side) || null,
      },
    };
  }).filter(Boolean);
  const value = candidates.length ? Math.min(...candidates.map((candidate) => candidate.value)) : null;
  return {
    value,
    sampleSize: candidates.length,
    holders: value === null ? [] : candidates.filter((candidate) => candidate.value === value).map((candidate) => candidate.holder),
    label: candidates.length
      ? `Based on ${candidates.length} complete Best Ball team rounds`
      : "",
  };
}

function matchPlayMarginLabel(finalMargin = {}) {
  if (!finalMargin?.winnerSide) return "";
  if (Number(finalMargin.holesRemaining) > 0) {
    return `${Number(finalMargin.lead)} & ${Number(finalMargin.holesRemaining)}`;
  }
  return `${Number(finalMargin.lead)} UP`;
}

/**
 * Present a FINAL match from its already-normalized canonical hole winners.
 * LIVE matches deliberately do not use this helper.
 */
export function build2026CanonicalFinalResult(scorecards = []) {
  const progression = reconstructMatchProgression(scorecards);
  if (!progression) return null;
  if (!progression.winnerSide) {
    return { text: "Match halved", holder: "", result: "Halved", progression };
  }
  const identity = progression.winnerSide === "A" ? progression.sideA : progression.sideB;
  const names = unique(identity?.playerNames || []);
  const holder = names.join(" & ") || clean(identity?.teamName);
  if (!holder) return null;
  const verb = names.length === 1 ? "wins" : "win";
  const result = matchPlayMarginLabel(progression.finalMargin);
  return result ? { text: `${holder} ${verb} ${result}`, holder, result, progression } : null;
}
