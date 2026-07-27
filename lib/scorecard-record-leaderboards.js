import {
  calculateScorecardMetrics,
  summarizeCourseHoles,
} from "./scorecard-analytics.js";
import { buildPlayerHoleByHoleAnalytics } from "./hole-by-hole-analytics.js";

const COMPLETE_STATUSES = new Set(["COMPLETE", "VERIFIED"]);
const clean = (value) => String(value ?? "").trim();
const finite = (value) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== "" &&
  Number.isFinite(Number(value));
const mean = (values) => values.length
  ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
  : null;
const formatName = (format) =>
  format === "BB" ? "Best Ball" : format === "SC" ? "Scramble" : format === "SI" ? "Singles" : format || "";

function consecutiveBirdies(holes = [], field = "toPar") {
  let longest = 0;
  let current = 0;
  for (const hole of holes) {
    if (hole[field] === -1) {
      current += 1;
      longest = Math.max(longest, current);
    } else current = 0;
  }
  return longest;
}

function performanceEntry(scorecard, value, entityType = "PLAYER") {
  return {
    entityType,
    value: finite(value) ? Number(value) : null,
    playerId: scorecard.playerId,
    playerSlug: scorecard.playerSlug,
    playerName: scorecard.playerName || scorecard.playerId,
    teamId: scorecard.teamId || scorecard.sideTeamId,
    teamName: scorecard.teamName,
    playerIds: scorecard.participantPlayerIds || (scorecard.playerId ? [scorecard.playerId] : []),
    playerNames: scorecard.participantNames || (scorecard.playerName ? [scorecard.playerName] : []),
    matchId: scorecard.matchId,
    year: scorecard.year,
    round: scorecard.round,
    format: scorecard.format,
    formatName: formatName(scorecard.format),
    courseId: scorecard.courseId,
    courseName: scorecard.courseName,
  };
}

function bestBallTeamPerformances(scorecards) {
  const byMatch = new Map();
  for (const card of scorecards.filter((item) => item.format === "BB")) {
    if (!byMatch.has(card.matchId)) byMatch.set(card.matchId, []);
    byMatch.get(card.matchId).push(card);
  }
  const rows = [];
  for (const cards of byMatch.values()) {
    const scoring = cards[0]?.matchNetScoring;
    for (const teamRow of scoring?.rows || []) {
      if (teamRow.type !== "BEST_BALL_NET" || !teamRow.available || !finite(teamRow.netTotals?.total)) continue;
      const sideCards = cards.filter((card) => card.side === teamRow.side);
      if (sideCards.length < 2 || sideCards.some((card) => card.completedHoleCount !== 18)) continue;
      const base = sideCards[0];
      rows.push({
        entityType: "TEAM_PERFORMANCE",
        teamId: teamRow.teamId || base.sideTeamId,
        teamName: teamRow.name,
        playerIds: sideCards.map((card) => card.playerId).filter(Boolean),
        playerNames: sideCards.map((card) => card.playerName || card.playerId).filter(Boolean),
        matchId: base.matchId,
        year: base.year,
        round: base.round,
        format: "BB",
        formatName: "Best Ball",
        courseId: base.courseId,
        courseName: base.courseName,
        holes: teamRow.holes,
        total: teamRow.netTotals.total,
        totalToPar: teamRow.netTotals.toPar,
        frontNine: teamRow.netTotals.frontNine,
        backNine: teamRow.netTotals.backNine,
      });
    }
  }
  return rows;
}

function definition({
  slug,
  title,
  group,
  direction,
  entries,
  decimals = 0,
  signed = false,
  entityType = "PLAYER",
  aggregate = false,
}) {
  const eligible = entries
    .filter((entry) => finite(entry.value))
    .sort((a, b) => {
      const difference = direction === "lowest" ? a.value - b.value : b.value - a.value;
      if (difference) return difference;
      return clean(a.playerName || a.teamName).localeCompare(clean(b.playerName || b.teamName));
    });
  const bestValue = eligible[0]?.value;
  return {
    slug,
    title,
    group,
    direction,
    decimals,
    signed,
    entityType,
    aggregate,
    entries: eligible,
    winners: eligible.filter((entry) => entry.value === bestValue),
  };
}

/**
 * Scorecard-only record catalog. Every leaderboard entry carries its source
 * identity so team performances are never modeled as golfers.
 */
export function buildScorecardRecordLeaderboards(
  scorecards = [],
  { playerNames = {}, ghostMatchExclusions = new Set() } = {}
) {
  const complete = scorecards.filter((card) =>
    COMPLETE_STATUSES.has(clean(card.status).toUpperCase()) &&
    card.completedHoleCount === 18
  );
  const individuals = complete.filter((card) => card.scoreType === "INDIVIDUAL" && card.playerId);
  const singles = individuals.filter((card) => card.format === "SI");
  const scramble = complete.filter((card) =>
    card.scoreType === "TEAM" && card.format === "SC" && card.teamId
  );
  const bestBall = bestBallTeamPerformances(individuals);
  const advanced = buildPlayerHoleByHoleAnalytics(scorecards, {
    playerNames,
    ghostMatchExclusions,
  });

  const individualMetric = (valueFor) => individuals.map((card) =>
    performanceEntry(card, valueFor(card))
  );
  const teamMetric = (cards, valueFor) => cards.map((card) => ({
    ...(card.entityType
      ? card
      : performanceEntry(card, valueFor(card), "TEAM_PERFORMANCE")),
    value: finite(valueFor(card)) ? Number(valueFor(card)) : null,
  }));
  const careerMetric = (field, sampleField) => advanced
    .filter((player) => player.sample[sampleField] > 0 && finite(player[field]))
    .map((player) => {
      const sourceCard = individuals.find((card) => card.playerId === player.playerId);
      return {
      entityType: "PLAYER",
      value: Number(player[field]),
      playerId: player.playerId,
      playerName: player.playerName,
      playerSlug: sourceCard?.playerSlug,
      aggregate: true,
      };
    });
  const closing = (card) => {
    const holes = card.holes.filter((hole) => hole.holeNumber >= 16 && finite(hole.score));
    return holes.length === 3 ? holes.reduce((sum, hole) => sum + Number(hole.score), 0) : null;
  };
  const birdies = (card) => card.holes.filter((hole) => hole.toPar === -1).length;
  const eagles = (card) => card.holes.filter((hole) => finite(hole.toPar) && hole.toPar <= -2).length;
  const parAverage = (card, par) => mean(card.holes.filter((hole) => hole.par === par && finite(hole.score)).map((hole) => hole.score));

  const records = [
    definition({ slug: "lowest-individual-round", title: "Lowest Recorded Individual Round", group: "individual", direction: "lowest", entries: individualMetric((card) => card.total) }),
    definition({ slug: "lowest-individual-to-par", title: "Lowest Individual Round to Par", group: "individual", direction: "lowest", signed: true, entries: individualMetric((card) => card.totalToPar) }),
    definition({ slug: "lowest-individual-front-nine", title: "Lowest Individual Front Nine", group: "individual", direction: "lowest", entries: individualMetric((card) => card.frontNine) }),
    definition({ slug: "lowest-individual-back-nine", title: "Lowest Individual Back Nine", group: "individual", direction: "lowest", entries: individualMetric((card) => card.backNine) }),
    definition({ slug: "most-individual-birdies", title: "Most Birdies in an Individual Round", group: "individual", direction: "highest", entries: individualMetric(birdies) }),
    definition({ slug: "most-individual-eagles", title: "Most Eagles in an Individual Round", group: "individual", direction: "highest", entries: individualMetric(eagles) }),
    definition({ slug: "most-consecutive-individual-birdies", title: "Most Consecutive Birdies by an Individual", group: "individual", direction: "highest", entries: individualMetric((card) => calculateScorecardMetrics(card).longestBirdieStreak.value) }),
    definition({ slug: "best-individual-closing-stretch", title: "Best Individual Closing Stretch", group: "individual", direction: "lowest", entries: individualMetric(closing) }),
    definition({ slug: "lowest-singles-round", title: "Lowest Singles Round", group: "individual", direction: "lowest", entries: singles.map((card) => performanceEntry(card, card.total)) }),
    definition({ slug: "career-par-3-average", title: "Best Career Par-3 Average", group: "individual", direction: "lowest", decimals: 2, aggregate: true, entries: careerMetric("averagePar3Score", "scoringHoles") }),
    definition({ slug: "career-par-4-average", title: "Best Career Par-4 Average", group: "individual", direction: "lowest", decimals: 2, aggregate: true, entries: careerMetric("averagePar4Score", "scoringHoles") }),
    definition({ slug: "career-par-5-average", title: "Best Career Par-5 Average", group: "individual", direction: "lowest", decimals: 2, aggregate: true, entries: careerMetric("averagePar5Score", "scoringHoles") }),

    definition({ slug: "lowest-scramble-round", title: "Lowest Scramble Round", group: "team", direction: "lowest", entityType: "TEAM_PERFORMANCE", entries: teamMetric(scramble, (card) => card.total) }),
    definition({ slug: "lowest-scramble-to-par", title: "Lowest Scramble Round to Par", group: "team", direction: "lowest", entityType: "TEAM_PERFORMANCE", signed: true, entries: teamMetric(scramble, (card) => card.totalToPar) }),
    definition({ slug: "lowest-scramble-front-nine", title: "Lowest Scramble Front Nine", group: "team", direction: "lowest", entityType: "TEAM_PERFORMANCE", entries: teamMetric(scramble, (card) => card.frontNine) }),
    definition({ slug: "lowest-scramble-back-nine", title: "Lowest Scramble Back Nine", group: "team", direction: "lowest", entityType: "TEAM_PERFORMANCE", entries: teamMetric(scramble, (card) => card.backNine) }),
    definition({ slug: "lowest-best-ball-team-round", title: "Lowest Best Ball Team Round", group: "team", direction: "lowest", entityType: "TEAM_PERFORMANCE", entries: teamMetric(bestBall, (card) => card.total) }),
    definition({ slug: "lowest-best-ball-team-to-par", title: "Lowest Best Ball Team Round to Par", group: "team", direction: "lowest", entityType: "TEAM_PERFORMANCE", signed: true, entries: teamMetric(bestBall, (card) => card.totalToPar) }),
    definition({ slug: "lowest-best-ball-front-nine", title: "Lowest Best Ball Front Nine", group: "team", direction: "lowest", entityType: "TEAM_PERFORMANCE", entries: teamMetric(bestBall, (card) => card.frontNine) }),
    definition({ slug: "lowest-best-ball-back-nine", title: "Lowest Best Ball Back Nine", group: "team", direction: "lowest", entityType: "TEAM_PERFORMANCE", entries: teamMetric(bestBall, (card) => card.backNine) }),
    definition({ slug: "most-team-birdies", title: "Most Team Birdies in a Round", group: "team", direction: "highest", entityType: "TEAM_PERFORMANCE", entries: teamMetric(scramble, birdies) }),
    definition({ slug: "most-consecutive-team-birdies", title: "Most Consecutive Team Birdies", group: "team", direction: "highest", entityType: "TEAM_PERFORMANCE", entries: teamMetric(scramble, (card) => consecutiveBirdies(card.holes)) }),

    definition({ slug: "career-most-birdies", title: "Career Most Birdies", group: "advanced", direction: "highest", aggregate: true, entries: careerMetric("birdies", "scoringHoles") }),
    definition({ slug: "career-most-eagles", title: "Career Most Eagles", group: "advanced", direction: "highest", aggregate: true, entries: careerMetric("eagles", "scoringHoles") }),
    definition({ slug: "career-most-pars", title: "Career Most Pars", group: "advanced", direction: "highest", aggregate: true, entries: careerMetric("pars", "scoringHoles") }),
    definition({ slug: "career-lowest-average-score", title: "Lowest Career Average Score", group: "advanced", direction: "lowest", decimals: 2, aggregate: true, entries: careerMetric("averageGrossScore", "completeScorecards") }),
    definition({ slug: "career-lowest-average-net", title: "Lowest Career Average Net Score", group: "advanced", direction: "lowest", decimals: 2, aggregate: true, entries: careerMetric("averageNetScore", "completeScorecards") }),
    definition({ slug: "advanced-par-3-average", title: "Lowest Par-3 Average", group: "advanced", direction: "lowest", decimals: 2, aggregate: true, entries: careerMetric("averagePar3Score", "scoringHoles") }),
    definition({ slug: "advanced-par-4-average", title: "Lowest Par-4 Average", group: "advanced", direction: "lowest", decimals: 2, aggregate: true, entries: careerMetric("averagePar4Score", "scoringHoles") }),
    definition({ slug: "advanced-par-5-average", title: "Lowest Par-5 Average", group: "advanced", direction: "lowest", decimals: 2, aggregate: true, entries: careerMetric("averagePar5Score", "scoringHoles") }),
    definition({ slug: "most-holes-won", title: "Most Holes Won", group: "match-play", direction: "highest", aggregate: true, entries: careerMetric("holesWon", "matchPlayHoles") }),
    definition({ slug: "most-holes-halved", title: "Most Holes Halved", group: "match-play", direction: "highest", aggregate: true, entries: careerMetric("holesHalved", "matchPlayHoles") }),
    definition({ slug: "highest-hole-differential", title: "Highest Hole Differential", group: "match-play", direction: "highest", signed: true, aggregate: true, entries: careerMetric("holeDifferential", "matchPlayHoles") }),
    definition({ slug: "most-front-nine-holes-won", title: "Most Front-Nine Holes Won", group: "match-play", direction: "highest", aggregate: true, entries: careerMetric("frontNineHolesWon", "matchPlayHoles") }),
    definition({ slug: "most-back-nine-holes-won", title: "Most Back-Nine Holes Won", group: "match-play", direction: "highest", aggregate: true, entries: careerMetric("backNineHolesWon", "matchPlayHoles") }),
    definition({ slug: "most-closing-holes-won", title: "Most Closing Holes Won (16–18)", group: "match-play", direction: "highest", aggregate: true, entries: careerMetric("closingHolesWon", "matchPlayHoles") }),
  ];

  const holeEntries = summarizeCourseHoles(complete)
    .filter((hole) => finite(hole.averageToPar?.value))
    .map((hole) => {
      const matchingCard = complete.find((card) =>
        card.courseId === hole.courseId && clean(card.tee).toUpperCase() === clean(hole.tee).toUpperCase()
      );
      return {
        entityType: "COURSE_HOLE",
        value: Number(hole.averageToPar.value),
        name: `${matchingCard?.courseName || "Recorded Course"} · Hole ${hole.holeNumber}`,
        courseId: hole.courseId,
        courseName: matchingCard?.courseName || "",
        holeNumber: hole.holeNumber,
        tee: hole.tee,
      };
    });
  records.push(
    definition({ slug: "hardest-historical-hole", title: "Hardest Historical Hole", group: "course-hole", direction: "highest", decimals: 2, signed: true, entityType: "COURSE_HOLE", entries: holeEntries }),
    definition({ slug: "easiest-historical-hole", title: "Easiest Historical Hole", group: "course-hole", direction: "lowest", decimals: 2, signed: true, entityType: "COURSE_HOLE", entries: holeEntries })
  );

  return {
    records,
    bySlug: Object.fromEntries(records.map((record) => [record.slug, record])),
    groups: {
      individual: records.filter((record) => record.group === "individual"),
      team: records.filter((record) => record.group === "team"),
      advanced: records.filter((record) => record.group === "advanced"),
      matchPlay: records.filter((record) => record.group === "match-play"),
      courseHole: records.filter((record) => record.group === "course-hole"),
    },
  };
}

export function scorecardLeaderboardRows(record) {
  return record.entries.map((entry, index) => ({
    id: `${record.slug}-${entry.matchId || entry.playerId || entry.teamId || entry.name}-${entry.side || ""}-${index}`,
    entityType: entry.entityType,
    name: entry.playerName || entry.teamName || entry.name || "Recorded performance",
    slug: entry.playerSlug || "",
    subtitle: entry.entityType === "TEAM_PERFORMANCE" ? entry.playerNames.join(" & ") : "",
    value: entry.value,
    valueDisplay: formatRecordValue(entry.value, record),
    year: entry.year ?? "",
    round: entry.round ? `Round ${entry.round}` : "",
    format: entry.formatName || "",
    course: entry.courseName || "",
  }));
}

export function formatRecordValue(value, record) {
  if (!finite(value)) return "—";
  const numeric = Number(value);
  const rendered = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(record.decimals ?? 1);
  return record.signed && numeric > 0 ? `+${rendered}` : rendered;
}
