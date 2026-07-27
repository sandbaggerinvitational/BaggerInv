import { confidenceForPartnership, deterministicPartnershipSummary, mean, finite } from "./team-intelligence-utils.js";

const clean = (value) => String(value ?? "").trim();
const keyFor = (a, b) => [clean(a), clean(b)].sort().join("|");
const recordPercentage = (record) => record?.matches ? (record.wins + record.halves * .5) / record.matches * 100 : null;
const participantIds = (match, side) => side === "A" ? match.sideA.playerIds : match.sideB.playerIds;

function progressionForPair(progressionMatches, one, two) {
  return progressionMatches.filter((match) =>
    ["A", "B"].some((side) => {
      const ids = participantIds(match, side);
      return ids.includes(one) && ids.includes(two);
    })
  );
}

function pairSide(match, one, two) {
  return ["A", "B"].find((side) => {
    const ids = participantIds(match, side);
    return ids.includes(one) && ids.includes(two);
  });
}

export function buildPartnershipIntelligence({
  partnershipRows = [],
  progressionMatches = [],
  scorecards = [],
  tournaments = [],
  tournamentMatches = [],
  players = [],
}) {
  const playerMap = Object.fromEntries(players.map((player) => [player.id, player]));
  const officialMap = Object.fromEntries(partnershipRows.map((row) => [row.key, row]));
  const pairKeys = new Set(Object.keys(officialMap));
  for (const match of progressionMatches) {
    for (const side of ["A", "B"]) {
      const ids = participantIds(match, side);
      if (ids.length === 2 && match.format !== "SI") pairKeys.add(keyFor(ids[0], ids[1]));
    }
  }
  const rows = [];
  for (const key of pairKeys) {
    const [one, two] = key.split("|");
    if (!playerMap[one] || !playerMap[two]) continue;
    const official = officialMap[key];
    const progression = progressionForPair(progressionMatches, one, two);
    let won = 0, lost = 0, halved = 0, frontWon = 0, frontLost = 0, backWon = 0, backLost = 0, closingWon = 0, closingLost = 0, largestLead = 0, largestComeback = 0, longest = 0;
    for (const match of progression) {
      const side = pairSide(match, one, two);
      if (!side) continue;
      won += match.holesWon[side];
      lost += match.holesLost[side];
      halved += match.holesHalved;
      frontWon += match.frontNine?.[side]?.won || 0;
      frontLost += match.frontNine?.[side]?.lost || 0;
      backWon += match.backNine?.[side]?.won || 0;
      backLost += match.backNine?.[side]?.lost || 0;
      closingWon += match.closing[side].won;
      closingLost += match.closing[side].lost;
      largestLead = Math.max(largestLead, match.largestLead[side]);
      longest = Math.max(longest, match.longestHolesWon[side]);
      if (match.winnerSide === side) largestComeback = Math.max(largestComeback, match.largestComeback);
    }
    const formats = ["BB", "SC"].map((format) => ({
      format,
      record: official?.byFormat?.[format] || { wins: 0, losses: 0, halves: 0, matches: 0, points: 0 },
      winPercentage: recordPercentage(official?.byFormat?.[format]),
      progressionMatches: progression.filter((match) => match.format === format).length,
    }));
    const bestFormat = [...formats].filter((row) => row.record.matches).sort((a, b) =>
      (b.winPercentage ?? -1) - (a.winPercentage ?? -1) || b.record.matches - a.record.matches
    )[0]?.format || null;
    const years = [...new Set(tournamentMatches.filter((match) => {
      const sides = [
        [match["Team 1 Player 1"], match["Team 1 Player 2"]],
        [match["Team 2 Player 1"], match["Team 2 Player 2"]],
      ];
      return sides.some((ids) => ids.includes(one) && ids.includes(two));
    }).map((match) => Number(match.Year)).filter(Number.isFinite))];
    const sharedMatchIds = new Set(tournamentMatches.filter((match) => [
      [match["Team 1 Player 1"], match["Team 1 Player 2"]],
      [match["Team 2 Player 1"], match["Team 2 Player 2"]],
    ].some((ids) => ids.includes(one) && ids.includes(two))).map((match) => clean(match["Match ID"])));
    const sharedCards = scorecards.filter((card) => sharedMatchIds.has(clean(card.matchId)) && ["COMPLETE", "VERIFIED"].includes(clean(card.status).toUpperCase()));
    const individualCards = sharedCards.filter((card) => card.scoreType === "INDIVIDUAL" && [one, two].includes(clean(card.playerId)));
    const teamCards = sharedCards.filter((card) => card.scoreType === "TEAM");
    const birdies = individualCards.reduce((total, card) => total + (card.holes || []).filter((hole) =>
      finite(hole.score) && finite(hole.par) && Number(hole.score) === Number(hole.par) - 1
    ).length, 0) + teamCards.reduce((total, card) => total + (card.holes || []).filter((hole) =>
      finite(hole.score) && finite(hole.par) && Number(hole.score) === Number(hole.par) - 1
    ).length, 0);
    const grossAverage = mean(teamCards.map((card) => card.total).filter(finite));
    const netRows = new Map();
    for (const card of sharedCards) {
      for (const row of card.matchNetScoring?.rows || []) {
        if (!finite(row?.netTotals?.total)) continue;
        const ids = row.playerIds || (row.playerId ? [row.playerId] : []);
        if (ids.length && !ids.some((id) => [one, two].includes(clean(id)))) continue;
        netRows.set(`${card.matchId}|${row.side}|${row.type || row.label || ""}`, Number(row.netTotals.total));
      }
    }
    const netAverage = mean([...netRows.values()]);
    const timeline = years.sort((a, b) => b - a).map((year) => {
      const tournament = tournaments.find((item) => item.year === year);
      const team = tournament?.teams?.find((item) => item.roster?.some((row) => row.player?.["Player ID"] === one) && item.roster?.some((row) => row.player?.["Player ID"] === two));
      const matches = tournamentMatches.filter((match) => Number(match.Year) === year && [
        [match["Team 1 Player 1"], match["Team 1 Player 2"]],
        [match["Team 2 Player 1"], match["Team 2 Player 2"]],
      ].some((ids) => ids.includes(one) && ids.includes(two)));
      return { year, team: team ? { id: team.id, name: team.name, logo: team.logo } : null, formats: [...new Set(matches.map((match) => match.Format))], matchIds: matches.map((match) => match["Match ID"]) };
    });
    const confidence = confidenceForPartnership({ matches: official?.record?.matches || 0, scorecards: progression.length });
    const strengths = [];
    if ((official?.byFormat?.BB?.matches || 0) >= 2 && recordPercentage(official.byFormat.BB) >= 60) strengths.push("Strong Best Ball Pair");
    if ((official?.byFormat?.SC?.matches || 0) >= 2 && recordPercentage(official.byFormat.SC) >= 60) strengths.push("Strong Scramble Pair");
    if (won - lost > 0) strengths.push("Positive Hole Differential");
    if (closingWon - closingLost > 0) strengths.push("Strong Closing Pair");
    if (largestComeback > 0) strengths.push("Comeback Pair");
    const tendencies = [];
    if (bestFormat) tendencies.push(`Best in ${bestFormat === "BB" ? "Best Ball" : "Scramble"}`);
    if (closingWon > closingLost) tendencies.push("Stronger Late in Matches");
    if (confidence === "LOW") tendencies.push("Limited Historical Sample");
    const row = {
      key, playerOne: playerMap[one], playerTwo: playerMap[two],
      record: official?.record || { wins: 0, losses: 0, halves: 0, matches: 0, points: 0 },
      winPercentage: recordPercentage(official?.record), formats, bestFormat,
      recordedTeamRounds: progression.length,
      holesWon: progression.length ? won : null, holesLost: progression.length ? lost : null,
      holesHalved: progression.length ? halved : null, holeDifferential: progression.length ? won - lost : null,
      frontNineRecord: progression.length ? { won: frontWon, lost: frontLost, halved: Math.max(0, progression.length * 9 - frontWon - frontLost) } : null,
      backNineRecord: progression.length ? { won: backWon, lost: backLost, halved: Math.max(0, progression.length * 9 - backWon - backLost) } : null,
      closingDifferential: progression.length ? closingWon - closingLost : null,
      birdies: sharedCards.length ? birdies : null,
      averageTeamGross: grossAverage,
      averageTeamNet: netAverage,
      largestLead: progression.length ? largestLead : null, largestComeback: progression.length ? largestComeback : null,
      mostConsecutiveHolesWon: progression.length ? longest : null,
      yearsPlayedTogether: years.length, timeline, strengths: strengths.slice(0, 3), tendencies: tendencies.slice(0, 2), confidence,
    };
    row.summary = deterministicPartnershipSummary(row);
    rows.push(row);
  }
  return rows.sort((a, b) => b.record.matches - a.record.matches || (b.winPercentage ?? -1) - (a.winPercentage ?? -1));
}

export function buildTeamAggregate(team, profilesById) {
  const roster = (team?.roster || team?.players || []).map((row) => {
    const id = row.player?.["Player ID"] || row.id;
    return profilesById[id];
  }).filter(Boolean);
  const aggregate = (path) => mean(roster.map((player) => path(player)).filter(finite));
  const sum = (path) => roster.reduce((total, player) => total + (finite(path(player)) ? Number(path(player)) : 0), 0);
  return {
    id: team?.id || team?.side, name: team?.name || team?.side, logo: team?.logo || "", roster,
    rosterSize: roster.length,
    scoringCoverage: roster.filter((player) => player.scorecard.sample.completeScorecards > 0).length,
    averageHandicap: aggregate((player) => player.handicap),
    averageRating: aggregate((player) => player.rating),
    careerPoints: sum((player) => player.official.points),
    championships: sum((player) => player.official.championships),
    appearances: sum((player) => player.official.appearances),
    winPercentage: aggregate((player) => player.official.winPercentage),
    holeDifferential: sum((player) => player.scorecard.holeDifferential),
    birdies: sum((player) => player.scorecard.birdies),
    averageGross: aggregate((player) => player.scorecard.averageGrossScore),
    averageNet: aggregate((player) => player.scorecard.averageNetScore),
    birdieRate: aggregate((player) => player.scorecard.birdieRate),
    parRate: aggregate((player) => player.scorecard.parRate),
    bogeyRate: aggregate((player) => player.scorecard.bogeyRate),
    doubleRate: aggregate((player) => player.scorecard.doubleBogeyOrWorseRate),
    par3: aggregate((player) => player.scorecard.averagePar3Score),
    par4: aggregate((player) => player.scorecard.averagePar4Score),
    par5: aggregate((player) => player.scorecard.averagePar5Score),
    front: aggregate((player) => player.scorecard.averageFrontNineScore),
    back: aggregate((player) => player.scorecard.averageBackNineScore),
    largestLead: Math.max(0, ...roster.map((player) => player.progression.largestLeadHeld || 0)),
    largestComeback: Math.max(0, ...roster.map((player) => player.progression.largestComebackCompleted || 0)),
    closingWon: sum((player) => player.progression.closing?.won),
  };
}
