import { buildPlayerHoleByHoleAnalytics } from "./hole-by-hole-analytics.js";
import { buildMatchProgressionAnalytics } from "./match-progression.js";
import { COMPARISON_INSIGHT_CONFIG } from "./player-comparison-utils.js";

const COMPLETE_STATUSES = new Set(["COMPLETE", "VERIFIED"]);
const clean = (value) => String(value ?? "").trim();
const same = (a, b) =>
  Boolean(clean(a)) &&
  clean(a).toUpperCase() === clean(b).toUpperCase();
const finite = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));
const mean = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
    : null;
const rounded = (value, places = 2) =>
  value === null ? null : Number(value.toFixed(places));
const inverseRecord = (record = {}) => ({
  wins: record.losses || 0,
  losses: record.wins || 0,
  halves: record.halves || 0,
  matches: record.matches || 0,
  points: record.points || 0,
});
const participantIds = (card) => [...new Set([
  card.playerId,
  ...(card.participantPlayerIds || []),
].map(clean).filter(Boolean))];
const includesPlayer = (card, playerId) =>
  participantIds(card).some((id) => same(id, playerId));
const sideForPlayer = (match, playerId) => {
  if (match.sideA.playerIds.some((id) => same(id, playerId))) return "A";
  if (match.sideB.playerIds.some((id) => same(id, playerId))) return "B";
  return null;
};
const otherSide = (side) => side === "A" ? "B" : "A";
const completeCards = (scorecards) => scorecards.filter((card) =>
  COMPLETE_STATUSES.has(clean(card.status).toUpperCase()) &&
  card.completedHoleCount === 18
);

function competitionRank(rows, playerId, valueFor, direction = "higher") {
  const eligible = rows
    .map((row) => ({ id: row.id, value: valueFor(row) }))
    .filter((row) => row.id && finite(row.value))
    .sort((a, b) => direction === "lower"
      ? a.value - b.value
      : b.value - a.value);
  const index = eligible.findIndex((row) => same(row.id, playerId));
  if (index < 0) return null;
  return 1 + eligible.slice(0, index)
    .filter((row) => row.value !== eligible[index].value).length;
}

function formatScorecardPerformance(playerId, format, cards, progressionMatches) {
  const playerCards = cards.filter((card) =>
    card.format === format && includesPlayer(card, playerId)
  );
  const byMatch = new Map();
  for (const card of playerCards) {
    if (!card.matchId || byMatch.has(card.matchId)) continue;
    const row = card.matchNetScoring?.rows?.find((item) => {
      if (item.side !== card.side) return false;
      if (format === "SI") return same(item.playerId, playerId);
      return true;
    });
    let gross = null;
    let net = null;
    if (format === "BB") net = finite(row?.netTotals?.total) ? Number(row.netTotals.total) : null;
    if (format === "SC") {
      const teamCard = playerCards.find((item) =>
        item.matchId === card.matchId && item.scoreType === "TEAM"
      );
      gross = finite(teamCard?.total) ? Number(teamCard.total) : null;
      net = finite(teamCard?.netTotals?.total) ? Number(teamCard.netTotals.total) : null;
    }
    if (format === "SI") {
      const individual = playerCards.find((item) =>
        item.matchId === card.matchId && same(item.playerId, playerId)
      );
      gross = finite(individual?.total) ? Number(individual.total) : null;
      net = finite(individual?.netTotals?.total) ? Number(individual.netTotals.total) : null;
    }
    byMatch.set(card.matchId, { gross, net });
  }
  const relevantProgression = progressionMatches.filter((match) =>
    match.format === format && Boolean(sideForPlayer(match, playerId))
  );
  const holeDifferential = relevantProgression.reduce((total, match) => {
    const side = sideForPlayer(match, playerId);
    return total + match.holesWon[side] - match.holesLost[side];
  }, 0);
  return {
    recordedMatches: new Set([
      ...byMatch.keys(),
      ...relevantProgression.map((match) => match.matchId),
    ]).size,
    grossAverage: rounded(mean([...byMatch.values()].map((row) => row.gross).filter(finite))),
    netAverage: rounded(mean([...byMatch.values()].map((row) => row.net).filter(finite))),
    holeDifferential: relevantProgression.length ? holeDifferential : null,
  };
}

function playerProfile(row, hole, progression, cards, progressionMatches) {
  const { player, stats } = row;
  const id = player["Player ID"];
  const seasons = [...stats.seasons].sort((a, b) => Number(b.year) - Number(a.year));
  const currentSeason = seasons.find((season) => season.teamResolved) || seasons[0] || {};
  const official = stats.records.overall;
  const formats = Object.fromEntries(["BB", "SC", "SI"].map((format) => [
    format,
    {
      record: stats.records[format],
      winPercentage: stats.percentages[format],
      points: stats.records[format].points,
      ...formatScorecardPerformance(id, format, cards, progressionMatches),
    },
  ]));
  return {
    id,
    name: player["Display Name"],
    slug: player.slug,
    photo: player["Photo Filename"] || "",
    handicap: finite(currentSeason.handicap) ? Number(currentSeason.handicap) : null,
    rating: stats.sandbaggerRatings?.OVERALL?.rating ?? null,
    team: currentSeason.teamResolved ? {
      name: currentSeason.teamName,
      logo: currentSeason.teamLogo,
      color: currentSeason.teamColor,
    } : null,
    official: {
      record: official,
      winPercentage: stats.percentages.overall,
      points: official.points,
      championships: stats.championships.length,
      runnerUps: stats.careerTimeline.filter((season) => season.result === "Runner-Up").length,
      appearances: stats.appearances.length,
    },
    scorecard: hole,
    progression,
    formats,
  };
}

function percentileQualifies(profiles, player, field, direction = "higher") {
  const eligible = profiles
    .filter((profile) =>
      profile.scorecard.sample.completeScorecards >= COMPARISON_INSIGHT_CONFIG.minimumScoringRounds &&
      finite(profile.scorecard[field])
    )
    .sort((a, b) => direction === "lower"
      ? a.scorecard[field] - b.scorecard[field]
      : b.scorecard[field] - a.scorecard[field]);
  const index = eligible.findIndex((profile) => same(profile.id, player.id));
  return index >= 0 &&
    index < Math.max(1, Math.ceil(eligible.length * COMPARISON_INSIGHT_CONFIG.topPercentile));
}

function generateInsights(profile, profiles) {
  const strengths = [];
  const tendencies = [];
  const score = profile.scorecard;
  const addStrength = (condition, label) => {
    if (condition && !strengths.includes(label)) strengths.push(label);
  };
  addStrength(percentileQualifies(profiles, profile, "averagePar3Score", "lower"), "Strong Par-3 Scorer");
  addStrength(percentileQualifies(profiles, profile, "averagePar4Score", "lower"), "Strong Par-4 Scorer");
  addStrength(percentileQualifies(profiles, profile, "averagePar5Score", "lower"), "Strong Par-5 Scorer");
  addStrength(percentileQualifies(profiles, profile, "birdieRate", "higher"), "Birdie Producer");
  addStrength(percentileQualifies(profiles, profile, "bogeyRate", "lower"), "Bogey Avoider");
  addStrength(score.sample.matchPlayHoles > 0 && score.holeDifferential > 0, "Positive Hole Differential");
  addStrength(profile.progression.largestComebackCompleted > 0, "Comeback Performer");

  const eligibleFormats = Object.entries(profile.formats)
    .filter(([, format]) => format.record.matches >= COMPARISON_INSIGHT_CONFIG.minimumFormatMatches)
    .sort((a, b) => b[1].winPercentage - a[1].winPercentage);
  if (
    eligibleFormats[0] &&
    (!eligibleFormats[1] ||
      eligibleFormats[0][1].winPercentage - eligibleFormats[1][1].winPercentage >=
        COMPARISON_INSIGHT_CONFIG.specialistGap)
  ) {
    const label = { BB: "Best Ball", SC: "Scramble", SI: "Singles" }[eligibleFormats[0][0]];
    addStrength(true, `${label} Specialist`);
    tendencies.push(`Best historical format is ${label}`);
  }
  if (
    finite(score.averageFrontNineScore) &&
    finite(score.averageBackNineScore) &&
    Math.abs(score.averageFrontNineScore - score.averageBackNineScore) >=
      COMPARISON_INSIGHT_CONFIG.nineHoleGap
  ) {
    tendencies.push(
      score.averageBackNineScore < score.averageFrontNineScore
        ? "Tends to score better on the back nine"
        : "Tends to score better on the front nine"
    );
  }
  if (score.sample.completeScorecards < COMPARISON_INSIGHT_CONFIG.minimumScoringRounds) {
    tendencies.push("Limited recorded scorecard sample");
  } else if (finite(score.birdieRate) && finite(score.doubleBogeyOrWorseRate)) {
    tendencies.push(
      score.birdieRate >= 12 && score.doubleBogeyOrWorseRate >= 8
        ? "Higher birdie production with more scoring volatility"
        : "Steadier recorded scoring profile"
    );
  }
  return {
    strengths: strengths.slice(0, COMPARISON_INSIGHT_CONFIG.maximumStrengths),
    tendencies: tendencies.slice(0, COMPARISON_INSIGHT_CONFIG.maximumTendencies),
  };
}

function directMatch(match, playerAId, playerBId) {
  const sideA = sideForPlayer(match, playerAId);
  const sideB = sideForPlayer(match, playerBId);
  return sideA && sideB && sideA !== sideB;
}

function scoringForDirectMeetings(cards, matchIds, playerId) {
  const relevant = cards.filter((card) =>
    matchIds.has(card.matchId) &&
    card.scoreType === "INDIVIDUAL" &&
    same(card.playerId, playerId)
  );
  let birdies = 0;
  for (const card of relevant) {
    birdies += (card.holes || []).filter((hole) =>
      finite(hole.score) && finite(hole.par) && Number(hole.score) === Number(hole.par) - 1
    ).length;
  }
  return {
    birdies,
    averageGross: rounded(mean(relevant.map((card) => card.total).filter(finite))),
  };
}

export function buildHeadToHeadComparison({
  playerAId,
  playerBId,
  official,
  scorecards,
  progressionMatches,
}) {
  const directProgression = progressionMatches.filter((match) =>
    directMatch(match, playerAId, playerBId)
  );
  const matchIds = new Set([
    ...(official?.meetings || []).map((meeting) => meeting.matchId),
    ...directProgression.map((match) => match.matchId),
  ]);
  if (!matchIds.size) return null;
  const sideSummary = (playerId) => {
    let holesWon = 0;
    let holesLost = 0;
    let holesHalved = 0;
    let largestLead = 0;
    let largestComeback = 0;
    for (const match of directProgression) {
      const side = sideForPlayer(match, playerId);
      holesWon += match.holesWon[side];
      holesLost += match.holesLost[side];
      holesHalved += match.holesHalved;
      largestLead = Math.max(largestLead, match.largestLead[side]);
      if (match.winnerSide === side) largestComeback = Math.max(largestComeback, match.largestComeback);
    }
    const hasProgression = directProgression.length > 0;
    return {
      holesWon: hasProgression ? holesWon : null,
      holesLost: hasProgression ? holesLost : null,
      holesHalved: hasProgression ? holesHalved : null,
      holeDifferential: hasProgression ? holesWon - holesLost : null,
      largestLead: directProgression.length ? largestLead : null,
      largestComeback: directProgression.length ? largestComeback : null,
      ...scoringForDirectMeetings(scorecards, matchIds, playerId),
    };
  };
  const meetings = official?.meetings || [];
  const pointsA = meetings.reduce((sum, meeting) => sum + (Number(meeting.pointsOne) || 0), 0);
  const pointsB = meetings.reduce((sum, meeting) => sum + (Number(meeting.pointsTwo) || 0), 0);
  const latest = [...meetings].sort((a, b) =>
    Number(b.year) - Number(a.year) || Number(b.round) - Number(a.round)
  )[0] || directProgression.sort((a, b) =>
    Number(b.year) - Number(a.year) || Number(b.round) - Number(a.round)
  )[0];
  return {
    officialRecordA: official?.overall || { wins: 0, losses: 0, halves: 0, matches: 0 },
    officialRecordB: inverseRecord(official?.overall),
    pointsA,
    pointsB,
    playerA: sideSummary(playerAId),
    playerB: sideSummary(playerBId),
    mostRecent: latest ? {
      year: latest.year,
      round: latest.round,
      format: latest.format,
      matchId: latest.matchId,
    } : null,
    formats: [...new Set([
      ...meetings.map((meeting) => meeting.format),
      ...directProgression.map((match) => match.format),
    ])],
  };
}

/**
 * Comparison orchestration over the shared official, scorecard, and progression
 * services. UI components consume this normalized result and do no analytics.
 */
export function buildPlayerComparisonProfiles({
  allPlayerStats,
  scorecards = [],
  ghostMatchExclusions = new Set(),
}) {
  const cards = completeCards(scorecards);
  const names = Object.fromEntries(allPlayerStats.map(({ player }) => [
    player["Player ID"],
    player["Display Name"],
  ]));
  const holes = buildPlayerHoleByHoleAnalytics(cards, { playerNames: names });
  const holesByPlayer = new Map(holes.map((row) => [clean(row.playerId).toUpperCase(), row]));
  const progression = buildMatchProgressionAnalytics(cards, { ghostMatchExclusions });
  const emptyHole = (id, name) => ({
    playerId: id,
    playerName: name,
    sample: { completeScorecards: 0, scoringHoles: 0, matchPlayHoles: 0 },
    totalHolesPlayed: 0,
    holesWon: 0,
    holesLost: 0,
    holesHalved: 0,
    holeDifferential: 0,
    birdies: 0,
    eagles: 0,
    pars: 0,
    bogeys: 0,
    doubleBogeysOrWorse: 0,
    averageGrossScore: null,
    averageNetScore: null,
    averagePar3Score: null,
    averagePar4Score: null,
    averagePar5Score: null,
    averageFrontNineScore: null,
    averageBackNineScore: null,
    birdieRate: null,
    parRate: null,
    bogeyRate: null,
    doubleBogeyOrWorseRate: null,
  });
  const emptyProgression = {
    matches: 0,
    largestLeadHeld: null,
    largestComebackCompleted: null,
    matchesWonAfterTrailing: null,
    mostLeadChangesExperienced: null,
    totalLeadChangesExperienced: null,
    mostConsecutiveHolesWon: null,
    totalClosingHolesWon: null,
    frontNine: { won: 0, lost: 0, halved: 0 },
    backNine: { won: 0, lost: 0, halved: 0 },
    closing: { won: 0, lost: 0, halved: 0 },
  };
  const profiles = allPlayerStats.map((row) => {
    const id = row.player["Player ID"];
    return playerProfile(
      row,
      holesByPlayer.get(clean(id).toUpperCase()) || emptyHole(id, row.player["Display Name"]),
      progression.player(id) || emptyProgression,
      cards,
      progression.matches
    );
  });
  for (const profile of profiles) {
    profile.currentRanking = competitionRank(
      profiles,
      profile.id,
      (row) => row.official.points
    );
    profile.insights = generateInsights(profile, profiles);
  }
  return { profiles, scorecards: cards, progressionMatches: progression.matches };
}
