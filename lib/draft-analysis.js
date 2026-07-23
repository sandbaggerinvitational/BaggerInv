import { readOddsSnapshots } from "./google-sheets-write.js";
import {
  getSandbaggerRatings,
  getTournament,
  getTournamentMatches,
  getTournamentPlayerLeaderboard,
} from "./stats.js";
import { isOfficialMatchResult, isLiveMatch } from "./live-tournament.js";
import { draftValueScore, relativeDraftResults } from "./draft-value.js";

export { draftValueScore, relativeDraftResults } from "./draft-value.js";

const clean = (value) => String(value ?? "").trim();
const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

function rankedPositions(rows, valueFor, direction = "desc") {
  const sorted = [...rows].sort((a, b) => {
    const left = valueFor(a);
    const right = valueFor(b);
    const difference = direction === "asc" ? left - right : right - left;
    return difference || clean(a.player?.name || a.name).localeCompare(
      clean(b.player?.name || b.name)
    );
  });
  const positions = new Map();
  let previous = null;
  sorted.forEach((row, index) => {
    const value = valueFor(row);
    const position = previous !== null && value === previous
      ? positions.get(sorted[index - 1].player?.id || sorted[index - 1].id)
      : index + 1;
    positions.set(row.player?.id || row.id, position);
    previous = value;
  });
  return positions;
}

function teamForSnapshot(draft, row) {
  const bySide = draft.teams.find((team) =>
    Number(clean(team.side).replace(/\D/g, "")) === Number(row.side)
  );
  if (bySide) return bySide;
  return draft.teams.find(
    (team) => clean(team.name).toLowerCase() === clean(row.name).toLowerCase()
  ) || null;
}

function ratingProjection(draft) {
  const ratings = getSandbaggerRatings().byCategory.OVERALL || [];
  const ratingMap = new Map(
    ratings.map((row) => [clean(row.player?.["Player ID"]), Number(row.rating)])
  );
  const players = draft.picks
    .filter((pick) => pick.player)
    .map((pick) => ({
      id: pick.player.id,
      name: pick.player.name,
      rating: ratingMap.get(pick.player.id) || 1500,
    }));
  const expected = rankedPositions(players, (row) => row.rating);
  const teamRatings = draft.rosters.map(({ team, picks }) => ({
    team,
    rating: picks.length
      ? picks.reduce((sum, pick) => sum + (ratingMap.get(pick.player.id) || 1500), 0) / picks.length
      : 1500,
  }));
  const first = teamRatings[0]?.rating || 1500;
  const second = teamRatings[1]?.rating || 1500;
  const probability = 100 / (1 + Math.pow(10, (second - first) / 400));
  return {
    source: "Sandbagger Ratings",
    expected,
    teams: teamRatings.map((row, index) => ({
      team: row.team,
      probability: index === 0 ? probability : 100 - probability,
    })),
  };
}

function oddsProjection(draft, snapshots) {
  const snapshot = snapshots
    .filter((item) => item.year === draft.year && item.phase === "Pre-Tournament")
    .sort((a, b) => clean(a.publishedAt).localeCompare(clean(b.publishedAt)))
    .at(-1);
  if (!snapshot?.teams?.length || !snapshot?.players?.length) return null;
  const projectedPlayers = snapshot.players
    .filter((row) => draft.picks.some((pick) => pick.playerId === row.id))
    .map((row) => ({ ...row, player: { id: row.id, name: row.name } }));
  return {
    source: "Pre-Tournament Odds",
    expected: rankedPositions(
      projectedPlayers,
      (row) => Number(row.averageFinish) || 999,
      "asc"
    ),
    teams: snapshot.teams.map((row) => ({
      team: teamForSnapshot(draft, row),
      probability: Number(row.probability) || 0,
      expectedPoints: Number(row.expectedPoints) || 0,
    })).filter((row) => row.team),
  };
}

function lifecycle(tournament, matches, leaderboard) {
  const configured = clean(
    tournament?.["Tournament Status"] || tournament?.Status
  ).toLowerCase();
  const final = Boolean(
    tournament?.championTeam ||
    clean(tournament?.["Final Score"]) ||
    ["final", "complete", "completed"].includes(configured)
  );
  if (final) return "final";
  if (
    ["live", "in progress", "in-progress"].includes(configured) ||
    matches.some((match) => isOfficialMatchResult(match) || isLiveMatch(match)) ||
    leaderboard.length
  ) return "live";
  return "projected";
}

function teamPerformance(draft, leaderboard) {
  const playerRows = new Map(leaderboard.map((row) => [row.id, row]));
  return draft.rosters.map(({ team, picks }) => ({
    team,
    points: picks.reduce(
      (sum, pick) => sum + (Number(playerRows.get(pick.player.id)?.points) || 0),
      0
    ),
  }));
}

function playerMetrics(draft, leaderboard, expected) {
  const leaderboardPositions = rankedPositions(
    leaderboard.map((row) => ({
      id: row.id,
      name: row.player?.["Display Name"] || row.id,
      points: Number(row.points) || 0,
    })),
    (row) => row.points
  );
  const standings = new Map(leaderboard.map((row) => [row.id, row]));
  return draft.picks.filter((pick) => pick.player).map((pick) => {
    const projected = expected.get(pick.player.id);
    const finish = leaderboardPositions.get(pick.player.id);
    return {
      ...pick,
      expectedPosition: projected,
      finish,
      points: Number(standings.get(pick.player.id)?.points) || 0,
      projectedValue: Number.isFinite(projected)
        ? pick.pickNumber - projected
        : null,
      dvs: draftValueScore(pick.pickNumber, finish),
      liveVariance: Number.isFinite(projected) && Number.isFinite(finish)
        ? projected - finish
        : null,
    };
  });
}

function extreme(players, field, direction = "max") {
  return [...players]
    .filter((row) => Number.isFinite(row[field]))
    .sort((a, b) =>
      direction === "max" ? b[field] - a[field] : a[field] - b[field]
    )[0] || null;
}

function displayPlayer(row, valueType) {
  if (!row) return null;
  return {
    name: row.player.name,
    pick: row.pickNumber,
    expectedPosition: row.expectedPosition,
    finish: row.finish,
    points: row.points,
    value: valueType === "projected"
      ? row.projectedValue
      : valueType === "live"
        ? row.liveVariance
        : row.dvs,
    valueLabel: valueType === "live" ? "vs projection" : "DVS",
  };
}

function draftGrades({ state, projections, teamResults, players, winner }) {
  const inputs = projections.teams.map((projection) => {
    const performance = teamResults.find((row) => row.team.id === projection.team.id);
    const rosterPlayers = players.filter((row) => row.team?.id === projection.team.id);
    const averageDvs = rosterPlayers.length
      ? rosterPlayers.reduce((sum, row) => sum + (row.dvs || 0), 0) / rosterPlayers.length
      : 0;
    const averageProjectedValue = rosterPlayers.length
      ? rosterPlayers.reduce((sum, row) => sum + (row.projectedValue || 0), 0) / rosterPlayers.length
      : 0;
    let strength = projection.probability;
    if (state === "live") {
      const total = teamResults.reduce((sum, row) => sum + row.points, 0);
      const share = total ? performance.points / total : projection.probability / 100;
      strength = share * 100 + clamp(averageDvs * 2, -12, 12);
    }
    if (state === "final") {
      const total = teamResults.reduce((sum, row) => sum + row.points, 0);
      const share = total ? performance.points / total : 0.5;
      strength = share * 100 + clamp(averageDvs * 2, -12, 12);
      if (winner?.id === projection.team.id) strength += 8;
    }
    return {
      id: projection.team.id,
      team: projection.team,
      captain: projection.team.captain,
      strength,
      objective: state === "projected" ? averageProjectedValue : averageDvs,
      points: performance?.points || 0,
      averageDvs: Number(averageDvs.toFixed(1)),
    };
  });
  return relativeDraftResults(inputs);
}

function analystSummary({ state, favorite, leader, value, reach }) {
  if (state === "projected") {
    return `${favorite.team.name} enters tournament week with the stronger projected draft, backed by a ${favorite.probability.toFixed(1)}% championship outlook. ${value?.player.name || "The roster"} supplies the clearest value relative to draft position, while ${reach?.player.name || "the opposing board"} carries the largest early-pick risk.`;
  }
  if (state === "live") {
    const reversal = favorite.team.id !== leader.team.id;
    return `${leader.team.name} currently owns the stronger producing draft${reversal ? ` after beginning behind ${favorite.team.name} in the pre-tournament projection` : ", matching the pre-tournament favorite"}. ${value?.player.name || "Its leading performers"} has created the biggest positive separation from expected value so far.`;
  }
  return `${leader.team.name} produced the tournament's best draft class. ${value?.player.name || "Its late-round selections"} delivered the strongest return against draft position, while ${reach?.player.name || "the opposing early board"} finished with the largest negative Draft Value Score.`;
}

export async function getDraftAnalysis(draft) {
  if (!draft || draft.state !== "complete") return null;
  const tournament = getTournament(draft.year);
  if (!tournament) return null;
  const matches = getTournamentMatches(draft.year);
  const leaderboard = getTournamentPlayerLeaderboard(draft.year);
  const snapshots = await readOddsSnapshots();
  const projections = oddsProjection(draft, snapshots) || ratingProjection(draft);
  const state = lifecycle(tournament, matches, leaderboard);
  const players = playerMetrics(draft, leaderboard, projections.expected);
  const teamResults = teamPerformance(draft, leaderboard);
  const projectedFavorite = [...projections.teams].sort(
    (a, b) => b.probability - a.probability
  )[0];
  const resultLeader = [...teamResults].sort(
    (a, b) => b.points - a.points
  )[0];
  const finalWinner = tournament.championTeam
    ? draft.teams.find((team) => team.id === tournament.championTeam.id)
    : null;
  const leader = state === "projected"
    ? projectedFavorite
    : {
        team: finalWinner || resultLeader?.team || projectedFavorite.team,
        points: finalWinner
          ? teamResults.find((row) => row.team.id === finalWinner.id)?.points || 0
          : resultLeader?.points || 0,
      };
  const projectedValue = extreme(players, "projectedValue");
  const projectedReach = extreme(players, "projectedValue", "min");
  const actualValue = extreme(players, state === "live" ? "liveVariance" : "dvs");
  const actualReach = extreme(players, state === "live" ? "liveVariance" : "dvs", "min");
  const grades = draftGrades({
    state,
    projections,
    teamResults,
    players,
    winner: finalWinner || leader.team,
  });
  const projectedBest = [...grades].sort((a, b) => b.score - a.score)[0];

  return {
    year: draft.year,
    state,
    source: projections.source,
    projectedFavorite,
    projectedBest: {
      team: projectedBest.team,
      score: projectedBest.score,
    },
    leader,
    projectedValue: displayPlayer(projectedValue, "projected"),
    projectedReach: displayPlayer(projectedReach, "projected"),
    value: displayPlayer(state === "projected" ? projectedValue : actualValue, state),
    reach: displayPlayer(state === "projected" ? projectedReach : actualReach, state),
    grades,
    summary: analystSummary({
      state,
      favorite: projectedFavorite,
      leader,
      value: state === "projected" ? projectedValue : actualValue,
      reach: state === "projected" ? projectedReach : actualReach,
    }),
  };
}
