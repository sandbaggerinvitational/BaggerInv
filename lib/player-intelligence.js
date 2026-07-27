import { buildPlayerHoleByHoleAnalytics } from "./hole-by-hole-analytics.js";
import { buildMatchProgressionAnalytics } from "./match-progression.js";
import { buildScorecardRecordLeaderboards } from "./scorecard-record-leaderboards.js";

const COMPLETE_STATUSES = new Set(["COMPLETE", "VERIFIED"]);
const clean = (value) => String(value ?? "").trim();
const same = (a, b) =>
  Boolean(clean(a)) &&
  clean(a).toUpperCase() === clean(b).toUpperCase();
const finite = (value) => Number.isFinite(Number(value));
const mean = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
    : null;
const rounded = (value, places = 2) =>
  value === null ? null : Number(value.toFixed(places));

function participantIds(card) {
  return [...new Set([
    card.playerId,
    ...(card.participantPlayerIds || []),
  ].map(clean).filter(Boolean))];
}

function includesPlayer(card, playerId) {
  return participantIds(card).some((id) => same(id, playerId));
}

function eligibleScorecards(scorecards) {
  return scorecards.filter((card) =>
    COMPLETE_STATUSES.has(clean(card.status).toUpperCase()) &&
    card.completedHoleCount === 18
  );
}

function competitionRank(rows, playerId, valueFor, direction = "highest") {
  const eligible = rows
    .map((row) => ({
      id: row.playerId || row.player?.["Player ID"],
      value: valueFor(row),
    }))
    .filter((row) => row.id && finite(row.value))
    .sort((a, b) =>
      direction === "lowest"
        ? Number(a.value) - Number(b.value)
        : Number(b.value) - Number(a.value)
    );
  const index = eligible.findIndex((row) => same(row.id, playerId));
  if (index < 0) return null;
  const value = eligible[index].value;
  return 1 + eligible.filter((row, rowIndex) =>
    rowIndex < index &&
    Number(row.value) !== Number(value)
  ).length;
}

function recordText(record = {}) {
  return `${record.wins || 0}-${record.losses || 0}-${record.halves || 0}`;
}

function segmentText(segment = {}) {
  return `${segment.won || 0}-${segment.lost || 0}-${segment.halved || 0}`;
}

function scorecardValue(card, format) {
  if (format === "BB") return finite(card.netTotals?.total) ? Number(card.netTotals.total) : null;
  return finite(card.total) ? Number(card.total) : null;
}

function formatPerformance(playerId, stats, completeCards) {
  const definitions = [
    { code: "BB", label: "Best Ball", scoringLabel: "Average Net Score" },
    { code: "SC", label: "Scramble", scoringLabel: "Team Average Score" },
    { code: "SI", label: "Singles", scoringLabel: "Average Gross Score" },
  ];
  return definitions.map((definition) => {
    const cards = completeCards.filter((card) =>
      card.format === definition.code &&
      includesPlayer(card, playerId) &&
      (definition.code === "SC" ? card.scoreType === "TEAM" : card.scoreType === "INDIVIDUAL")
    );
    return {
      ...definition,
      record: stats.records[definition.code],
      recordDisplay: recordText(stats.records[definition.code]),
      winPercentage: stats.percentages[definition.code],
      scoringAverage: rounded(mean(
        cards.map((card) => scorecardValue(card, definition.code)).filter(finite)
      )),
      scoringSample: cards.length,
    };
  }).sort((a, b) =>
    Number(b.winPercentage || 0) - Number(a.winPercentage || 0) ||
    Number(b.record?.matches || 0) - Number(a.record?.matches || 0)
  );
}

function tournamentHistory(playerId, stats, completeCards) {
  const timelineByYear = new Map(
    stats.careerTimeline.map((season) => [Number(season.year), season])
  );
  return stats.seasons
    .filter((season) => season.overall.matches > 0 || timelineByYear.get(Number(season.year))?.attended)
    .map((season) => {
      const year = Number(season.year);
      const performances = completeCards.filter((card) =>
        Number(card.year) === year &&
        includesPlayer(card, playerId) &&
        (card.scoreType === "INDIVIDUAL" || card.format === "SC")
      );
      return {
        year,
        finish: timelineByYear.get(year)?.result || "Completed",
        teamName: season.teamResolved ? season.teamName : "",
        teamLogo: season.teamResolved ? season.teamLogo : "",
        teamColor: season.teamResolved ? season.teamColor : "",
        record: season.overall,
        recordDisplay: recordText(season.overall),
        points: season.overall.points,
        averageScore: rounded(mean(
          performances.map((card) => card.total).filter(finite)
        )),
        scorecardSample: performances.length,
      };
    })
    .sort((a, b) => a.year - b.year);
}

function ownsRecord(entry, playerId) {
  return same(entry.playerId, playerId) ||
    (entry.playerIds || []).some((id) => same(id, playerId));
}

function currentRecordHolders({
  playerId,
  officialRecords,
  scorecardRecords,
  progressionRecords,
}) {
  const held = [];
  const official = [
    ["career-points", "Career Points", officialRecords.points, (row) => row.stats.records.overall.points],
    ["match-wins", "Match Wins", officialRecords.wins, (row) => row.stats.records.overall.wins],
    ["win-percentage", "Point Win Percentage", officialRecords.percentage, (row) => row.stats.percentages.overall],
    ["championships", "Bagger Championships", officialRecords.championships, (row) => row.stats.championships.length],
    ["appearances", "Tournament Appearances", officialRecords.appearances, (row) => row.stats.appearances.length],
  ];
  for (const [slug, title, rows, valueFor] of official) {
    if (!rows.length) continue;
    const top = valueFor(rows[0]);
    if (rows.some((row) =>
      same(row.player["Player ID"], playerId) &&
      Number(valueFor(row)) === Number(top)
    )) held.push({ slug, title, href: `/records/${slug}` });
  }
  for (const record of [...scorecardRecords, ...progressionRecords]) {
    if (record.winners.some((entry) => ownsRecord(entry, playerId))) {
      held.push({ slug: record.slug, title: record.title, href: `/records/${record.slug}` });
    }
  }
  return [...new Map(held.map((record) => [record.slug, record])).values()]
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Player-profile intelligence is an orchestration layer over the official,
 * scorecard, Records, and Match Progression services. It does not recalculate
 * any of those source metrics independently.
 */
export function buildPlayerIntelligence({
  playerId,
  stats,
  allPlayerStats,
  officialRecords,
  scorecards = [],
  ghostMatchExclusions = new Set(),
}) {
  const completeCards = eligibleScorecards(scorecards);
  const names = Object.fromEntries(allPlayerStats.map(({ player }) => [
    player["Player ID"],
    player["Display Name"],
  ]));
  const holePlayers = buildPlayerHoleByHoleAnalytics(scorecards, { playerNames: names });
  const hole = holePlayers.find((row) => same(row.playerId, playerId)) || {
    sample: { completeScorecards: 0, scoringHoles: 0, matchPlayHoles: 0 },
    holesWon: 0,
    holesLost: 0,
    holesHalved: 0,
    holeDifferential: 0,
    birdies: 0,
    eagles: 0,
    averageGrossScore: null,
    averageNetScore: null,
  };
  const progression = buildMatchProgressionAnalytics(scorecards, {
    ghostMatchExclusions,
  });
  const progressionPlayer = progression.player(playerId) || {
    largestLeadHeld: 0,
    largestComebackCompleted: 0,
    matchesWonAfterTrailing: 0,
    largestLeadBlown: 0,
    mostConsecutiveHolesWon: 0,
    mostConsecutiveHolesLost: 0,
    frontNine: { won: 0, lost: 0, halved: 0 },
    backNine: { won: 0, lost: 0, halved: 0 },
    closing: { won: 0, lost: 0, halved: 0 },
    totalClosingHolesWon: 0,
  };
  const scorecardCatalog = buildScorecardRecordLeaderboards(scorecards, {
    playerNames: names,
    ghostMatchExclusions,
  });

  const rankings = {
    careerPoints: competitionRank(
      officialRecords.points,
      playerId,
      (row) => row.stats.records.overall.points
    ),
    matchWins: competitionRank(
      officialRecords.wins,
      playerId,
      (row) => row.stats.records.overall.wins
    ),
    winPercentage: competitionRank(
      officialRecords.percentage,
      playerId,
      (row) => row.stats.percentages.overall
    ),
    holeDifferential: competitionRank(
      holePlayers,
      playerId,
      (row) => row.sample.matchPlayHoles ? row.holeDifferential : null
    ),
    averageGross: competitionRank(
      holePlayers,
      playerId,
      (row) => row.sample.completeScorecards ? row.averageGrossScore : null,
      "lowest"
    ),
    birdies: competitionRank(
      holePlayers,
      playerId,
      (row) => row.sample.scoringHoles ? row.birdies : null
    ),
  };

  return {
    official: {
      record: stats.records.overall,
      recordDisplay: recordText(stats.records.overall),
      winPercentage: stats.percentages.overall,
      careerPoints: stats.records.overall.points,
      appearances: stats.appearances.length,
      championships: stats.championships.length,
      runnerUps: stats.careerTimeline.filter((season) => season.result === "Runner-Up").length,
    },
    hole,
    progression: {
      ...progressionPlayer,
      frontNineRecord: segmentText(progressionPlayer.frontNine),
      backNineRecord: segmentText(progressionPlayer.backNine),
      closingRecord: segmentText(progressionPlayer.closing),
    },
    rankings,
    rankingRows: [
      { key: "careerPoints", label: "Career Points", rank: rankings.careerPoints, href: "/records/career-points" },
      { key: "matchWins", label: "Match Wins", rank: rankings.matchWins, href: "/records/match-wins" },
      { key: "winPercentage", label: "Win Percentage", rank: rankings.winPercentage, href: "/records/win-percentage" },
      { key: "holeDifferential", label: "Hole Differential", rank: rankings.holeDifferential, href: "/records/highest-hole-differential" },
      { key: "birdies", label: "Birdies", rank: rankings.birdies, href: "/records/career-most-birdies" },
      { key: "averageGross", label: "Average Gross", rank: rankings.averageGross, href: "/records/career-lowest-average-score" },
    ],
    tournamentHistory: tournamentHistory(playerId, stats, completeCards),
    formats: formatPerformance(playerId, stats, completeCards),
    recordsHeld: currentRecordHolders({
      playerId,
      officialRecords,
      scorecardRecords: scorecardCatalog.records,
      progressionRecords: progression.records,
    }),
  };
}

export const PLAYER_INTELLIGENCE_COMPLETE_STATUSES = Object.freeze([
  ...COMPLETE_STATUSES,
]);
