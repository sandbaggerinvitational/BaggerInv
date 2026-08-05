import { formatPlayerPoints, formatTeamPoints } from "./formatters.js";
import { isLiveMatch, isOfficialMatchResult } from "./live-tournament.js";
import { formatOfficialMatchResult } from "./match-result.js";
import { playerPerformanceRows, teamStandings, tournamentInsights } from "./mobile-leaderboards.js";

const clean = (value) => String(value ?? "").trim();
const final = (match) => isOfficialMatchResult(match);
const pointWord = (value) => Number(value) === 1 ? "point" : "points";
const minute = 60_000;

export const STORY_SCOPE = Object.freeze({
  currentTournament: "CURRENT_TOURNAMENT",
  // V1.1 may register HISTORICAL or CAREER providers. V1.0 deliberately
  // has no provider for either scope.
});

export const STORY_PRIORITY = Object.freeze({
  champion: 1000,
  roundClinched: 900,
  firstFinal: 830,
  closestLiveMatch: 800,
  comeback: 780,
  firstLead: 760,
  momentum: 740,
  teamRace: 700,
  finalGroups: 670,
  watchThis: 650,
  hotPlayer: 610,
  undefeated: 540,
  scoringPace: 410,
  netSkins: 500,
  general: 300,
});

function timestamp(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function freshness(value, now, event = "update") {
  const updatedAt = timestamp(value);
  if (!updatedAt) return { updatedAt: null, freshnessLabel: "", freshnessBoost: 0 };
  const ageMinutes = Math.max(0, Math.floor((now - updatedAt) / minute));
  if (event === "final" && ageMinutes <= 10) return { updatedAt, freshnessLabel: "Just Finalized", freshnessBoost: 28 };
  if (event === "clinch" && ageMinutes <= 30) return { updatedAt, freshnessLabel: "Recently Clinched", freshnessBoost: 24 };
  if (ageMinutes <= 1) return { updatedAt, freshnessLabel: "NEW", freshnessBoost: 20 };
  if (ageMinutes < 60) return { updatedAt, freshnessLabel: `Updated ${ageMinutes} min ago`, freshnessBoost: Math.max(2, 14 - Math.floor(ageMinutes / 5)) };
  return { updatedAt, freshnessLabel: "", freshnessBoost: 0 };
}

function story({ id, category, icon, label, headline, detail, basePriority = STORY_PRIORITY.general, accessibleLabel = "", updatedAt, now, event }) {
  const recent = freshness(updatedAt, now, event);
  return {
    id,
    category,
    scope: STORY_SCOPE.currentTournament,
    icon,
    label,
    headline,
    detail,
    priorityScore: basePriority + recent.freshnessBoost,
    priority: basePriority + recent.freshnessBoost,
    updatedAt: recent.updatedAt,
    freshnessLabel: recent.freshnessLabel,
    accessibleLabel: accessibleLabel || `${label}: ${headline} ${detail}`,
  };
}

function scopedValue(record, fields) {
  for (const field of fields) {
    const value = clean(record?.[field]);
    if (value) return value;
  }
  return "";
}

function belongsToCurrentTournament(record, tournament) {
  const activeId = clean(tournament?.id);
  const activeYear = clean(tournament?.year);
  const recordId = scopedValue(record, ["tournamentId", "Tournament ID", "tournament"]);
  const recordYear = scopedValue(record, ["year", "Year", "tournamentYear"]);
  if (activeId && recordId && recordId !== activeId) return false;
  if (activeYear && recordYear && recordYear !== activeYear) return false;
  return true;
}

function currentTournamentView(data) {
  const tournament = data.tournament || {};
  const rounds = (data.rounds || [])
    .filter((round) => belongsToCurrentTournament(round, tournament))
    .map((round) => ({
      ...round,
      matches: (round.matches || []).filter((match) => belongsToCurrentTournament(match, tournament)),
    }));
  return {
    tournament,
    rounds,
    leaderboard: (data.leaderboard || []).filter((row) => belongsToCurrentTournament(row, tournament)),
    scoreLeaderboard: (data.scoreLeaderboard || []).filter((row) => belongsToCurrentTournament(row, tournament)),
    netSkins: !data.netSkins?.year || !tournament.year || Number(data.netSkins.year) === Number(tournament.year)
      ? (data.netSkins || { rounds: [] })
      : { rounds: [] },
  };
}

function teamName(side, tournament) {
  return Number(side) === 1 ? tournament?.teamOne?.name : tournament?.teamTwo?.name;
}

function winnerSide(match) {
  const winner = clean(match?.matchupWinner || match?.overallWinner).toLowerCase();
  if (["team 1", "team1", "1"].includes(winner)) return 1;
  if (["team 2", "team2", "2"].includes(winner)) return 2;
  return 0;
}

function matchNumber(match) {
  return match.match || match.matchNumber || "—";
}

function matchLabel(match) {
  return `Round ${match.round || "—"} · Match ${matchNumber(match)}`;
}

function matchUpdatedAt(match) {
  return match.finalizedAt || match.updatedAt || "";
}

function normalizedHoleResults(match) {
  const source = match?.holeResults || match?.holeScores || match?.holes || [];
  const unique = new Map();
  for (const row of source) {
    const hole = Number(row?.holeNumber ?? row?.hole ?? row?.["Hole Number"]);
    const raw = clean(row?.winner ?? row?.holeWinner ?? row?.["Hole Winner"]).toLowerCase();
    if (!Number.isInteger(hole) || hole < 1 || hole > 18) continue;
    const side = ["team 1", "team1", "1", "a"].includes(raw) ? 1 : ["team 2", "team2", "2", "b"].includes(raw) ? 2 : 0;
    if (!side && !["halved", "half", "tie", "tied"].includes(raw)) continue;
    unique.set(hole, { hole, side, updatedAt: row?.updatedAt || row?.["Updated At"] || "" });
  }
  return [...unique.values()].sort((left, right) => left.hole - right.hole);
}

function progression(match) {
  let position = 0;
  return normalizedHoleResults(match).map((result) => {
    if (result.side === 1) position += 1;
    if (result.side === 2) position -= 1;
    return { ...result, position, leaderSide: position > 0 ? 1 : position < 0 ? 2 : 0, lead: Math.abs(position) };
  });
}

function completedRoundStories(rounds, tournament, now) {
  return rounds.flatMap((round) => {
    const matches = round?.matches || [];
    if (!matches.length || !matches.every(final)) return [];
    const one = matches.reduce((sum, match) => sum + (Number(match.team1Points) || 0), 0);
    const two = matches.reduce((sum, match) => sum + (Number(match.team2Points) || 0), 0);
    const label = round.label || `Round ${round.number}`;
    const latest = Math.max(...matches.map((match) => timestamp(matchUpdatedAt(match)) || 0));
    if (one === two) return [story({
      id: `round-${round.number}`, category: "round", icon: "🤝", label: "Round Complete", headline: `${label} finished level.`,
      detail: `Neither team gave an inch in a ${formatTeamPoints(one)}–${formatTeamPoints(two)} finish.`,
      basePriority: STORY_PRIORITY.roundClinched + Number(round.number || 0), updatedAt: latest || "", now, event: "clinch",
    })];
    const winner = teamName(one > two ? 1 : 2, tournament);
    return winner ? [story({
      id: `round-${round.number}`, category: "round", icon: "🏆", label: "Round Clinched", headline: `${winner} clinched ${label}.`,
      detail: `The ${formatTeamPoints(one)}–${formatTeamPoints(two)} round score moved the tournament race forward.`,
      basePriority: STORY_PRIORITY.roundClinched + Number(round.number || 0), updatedAt: latest || "", now, event: "clinch",
    })] : [];
  });
}

function championStory(tournament, now) {
  const complete = /^(final|complete)$/i.test(clean(tournament?.status)) || /^final$/i.test(clean(tournament?.currentRound));
  if (!complete) return null;
  const one = Number(tournament?.teamOne?.score) || 0;
  const two = Number(tournament?.teamTwo?.score) || 0;
  if (one === two) return story({ id: "champion-tie", category: "champion", icon: "🏆", label: "Tournament Complete", headline: "The tournament finishes tied.", detail: `${formatTeamPoints(one)}–${formatTeamPoints(two)} after every match.`, basePriority: STORY_PRIORITY.champion, updatedAt: tournament.lastUpdated, now, event: "final" });
  const winner = teamName(one > two ? 1 : 2, tournament);
  return winner ? story({ id: "champion", category: "champion", icon: "🎉", label: "Tournament Champion", headline: `${winner} win the Sandbagger Invitational.`, detail: `${formatTeamPoints(one)}–${formatTeamPoints(two)} is the final tournament score.`, basePriority: STORY_PRIORITY.champion, updatedAt: tournament.lastUpdated, now, event: "final" }) : null;
}

function upcomingStories(rounds, now) {
  const openingRound = rounds.find((round) => (round?.matches || []).length) || rounds[0];
  if (!openingRound) return [story({ id: "welcome", category: "upcoming", icon: "🏆", label: "Welcome", headline: "The Sandbagger Invitational is ready for its next chapter.", detail: "Tournament moments will appear as official play begins.", basePriority: STORY_PRIORITY.general, now })];
  const matches = openingRound.matches || [];
  const teeTime = clean(matches.find((match) => clean(match.teeTime))?.teeTime);
  const roundLabel = openingRound.label || `Round ${openingRound.number}`;
  if (matches.length) return [story({ id: "pairings-released", category: "upcoming", icon: "👀", label: "Pairings Released", headline: `${roundLabel} is set.`, detail: `${matches.length} match${matches.length === 1 ? "" : "es"}${teeTime ? ` begin at ${teeTime}` : " are ready for the opening tee"}.`, basePriority: STORY_PRIORITY.general + 20, now })];
  return [story({ id: "opening-round", category: "upcoming", icon: "⛳", label: "Up Next", headline: `${roundLabel} begins soon.`, detail: "The first tournament story is waiting to be written.", basePriority: STORY_PRIORITY.general, now })];
}

function firstFinalStory(matches, tournament, now) {
  const decided = matches.filter(final);
  if (decided.length !== 1) return null;
  const match = decided[0];
  const side = winnerSide(match);
  if (!side) return story({ id: "first-final", category: "result", icon: "⚡", label: "First Result", headline: `${matchLabel(match)} is the first match in the books.`, detail: "The tournament has its opening result.", basePriority: STORY_PRIORITY.firstFinal, updatedAt: matchUpdatedAt(match), now, event: "final" });
  const winner = teamName(side, tournament);
  return winner ? story({ id: "first-final", category: "result", icon: "⚡", label: "First Result", headline: `${winner} put the first result on the board.`, detail: `${matchLabel(match)} is the tournament's first finalized match.`, basePriority: STORY_PRIORITY.firstFinal, updatedAt: matchUpdatedAt(match), now, event: "final" }) : null;
}

function liveLead(match) {
  const steps = progression(match);
  if (steps.length) return steps.at(-1).lead;
  const text = clean(match.liveStatusText || match.statusText || match.result);
  if (/all square|halved|tied/i.test(text)) return 0;
  const parsed = text.match(/(\d+(?:\.\d+)?)\s*up/i);
  if (parsed) return Number(parsed[1]);
  const one = Number(match.team1HolesWon);
  const two = Number(match.team2HolesWon);
  return Number.isFinite(one) && Number.isFinite(two) ? Math.abs(one - two) : null;
}

function throughHole(match) {
  return progression(match).at(-1)?.hole || Number(match.currentHole) || 0;
}

function closestMatchStory(matches, now) {
  const candidates = matches.filter(isLiveMatch).map((match) => ({ match, lead: liveLead(match), through: throughHole(match) }))
    .filter((item) => item.lead !== null && item.through > 0)
    .sort((left, right) => left.lead - right.lead || right.through - left.through || Number(matchNumber(left.match) || 0) - Number(matchNumber(right.match) || 0));
  const closest = candidates[0];
  if (!closest) return null;
  const position = closest.lead === 0 ? "All Square" : `only ${closest.lead} UP`;
  return story({ id: "closest-match", category: "live", icon: "👀", label: "Closest Match", headline: `${matchLabel(closest.match)} is ${position} through ${closest.through}.`, detail: "Every remaining hole carries tournament pressure.", basePriority: STORY_PRIORITY.closestLiveMatch + closest.through, updatedAt: matchUpdatedAt(closest.match), now });
}

function liveFieldStory(matches, now) {
  const live = matches.filter(isLiveMatch);
  if (live.length >= 3) return story({ id: "watch-live-field", category: "live-field", icon: "👀", label: "Watch This", headline: `${live.length} matches remain live.`, detail: "The tournament is still being decided across the course.", basePriority: STORY_PRIORITY.watchThis + live.length, updatedAt: live.map(matchUpdatedAt).sort().at(-1), now });
  if (live.length > 0 && live.length <= 2) return story({ id: "final-groups", category: "live-field", icon: "⛳", label: "Final Groups", headline: `Only ${live.length === 1 ? "one match remains" : "two matches remain"} on the course.`, detail: "The final live result is coming into focus.", basePriority: STORY_PRIORITY.finalGroups + (2 - live.length), updatedAt: live.map(matchUpdatedAt).sort().at(-1), now });
  return null;
}

function matchMomentumStories(matches, tournament, now) {
  const candidates = [];
  for (const match of matches.filter(isLiveMatch)) {
    const steps = progression(match);
    if (steps.length < 2) continue;
    const latest = steps.at(-1);
    const side = latest.side;
    const name = teamName(side, tournament);
    if (!name) continue;

    let tail = 0;
    for (let index = steps.length - 1; index >= 0 && steps[index].side === side; index -= 1) tail += 1;
    const lastFive = steps.slice(-5).filter((step) => step.side === side).length;
    if (tail >= 3) candidates.push(story({ id: `momentum-${match.id}`, category: "momentum", icon: "🔥", label: "Momentum", headline: `${name} have won ${tail} consecutive holes.`, detail: `${matchLabel(match)} has swung their way through ${latest.hole}.`, basePriority: STORY_PRIORITY.momentum + tail * 4, updatedAt: latest.updatedAt || matchUpdatedAt(match), now }));
    else if (steps.length >= 5 && lastFive >= 4) candidates.push(story({ id: `momentum-${match.id}`, category: "momentum", icon: "🔥", label: "Momentum", headline: `${name} have won four of the last five holes.`, detail: `${matchLabel(match)} has turned into a late charge.`, basePriority: STORY_PRIORITY.momentum + 12, updatedAt: latest.updatedAt || matchUpdatedAt(match), now }));

    const prior = steps.slice(0, -1);
    const signed = side === 1 ? (step) => step.position : (step) => -step.position;
    const largestDeficit = Math.max(0, ...prior.map((step) => -signed(step)));
    if (latest.leaderSide === side && largestDeficit >= 2) candidates.push(story({ id: `comeback-${match.id}`, category: "comeback", icon: "📈", label: "Biggest Comeback", headline: `${name} erased a ${largestDeficit}-hole deficit.`, detail: `${matchLabel(match)} now has ${name} in front through ${latest.hole}.`, basePriority: STORY_PRIORITY.comeback + largestDeficit * 5, updatedAt: latest.updatedAt || matchUpdatedAt(match), now }));

    const hadLeadBefore = prior.some((step) => step.leaderSide === side);
    if (latest.leaderSide === side && !hadLeadBefore && latest.hole >= 9) candidates.push(story({ id: `first-lead-${match.id}`, category: "lead-change", icon: "⚡", label: "First Lead", headline: `${name} took their first lead on Hole ${latest.hole}.`, detail: `${matchLabel(match)} has changed direction at a pivotal moment.`, basePriority: STORY_PRIORITY.firstLead + latest.hole, updatedAt: latest.updatedAt || matchUpdatedAt(match), now }));
  }
  return candidates;
}

function recentlyClinchedStory(matches, tournament, now) {
  const candidates = matches.filter(final).flatMap((match) => {
    const finalizedAt = timestamp(matchUpdatedAt(match));
    if (!finalizedAt || now - finalizedAt > 60 * minute) return [];
    const steps = progression(match);
    const clinch = steps.find((step) => step.leaderSide && step.lead > 18 - step.hole);
    if (!clinch) return [];
    const winner = teamName(clinch.leaderSide, tournament);
    if (!winner) return [];
    return [{ match, clinch, winner, finalizedAt }];
  }).sort((left, right) => right.finalizedAt - left.finalizedAt);
  const latest = candidates[0];
  if (!latest) return null;
  return story({
    id: `clinch-${latest.match.id}`,
    category: "result",
    icon: "🏁",
    label: "Recently Clinched",
    headline: `${latest.winner} clinched ${matchLabel(latest.match)} on Hole ${latest.clinch.hole}.`,
    detail: formatOfficialMatchResult(latest.match.finalResult) || `The match closed ${latest.clinch.lead} & ${18 - latest.clinch.hole}.`,
    basePriority: STORY_PRIORITY.firstFinal - 10,
    updatedAt: latest.finalizedAt,
    now,
    event: "clinch",
  });
}

function completedComebackStory(matches, tournament, complete, now) {
  if (!complete) return null;
  const candidates = matches.filter(final).flatMap((match) => {
    const steps = progression(match);
    const last = steps.at(-1);
    const side = winnerSide(match) || last?.leaderSide;
    if (!side || !steps.length) return [];
    const signed = side === 1 ? (step) => step.position : (step) => -step.position;
    const deficit = Math.max(0, ...steps.map((step) => -signed(step)));
    return deficit >= 2 ? [{ match, side, deficit }] : [];
  }).sort((left, right) => right.deficit - left.deficit || Number(matchNumber(left.match)) - Number(matchNumber(right.match)));
  const largest = candidates[0];
  if (!largest) return null;
  const winner = teamName(largest.side, tournament);
  return winner ? story({
    id: "largest-comeback",
    category: "tournament-record",
    icon: "📈",
    label: "Largest Comeback",
    headline: `${winner} authored the tournament's biggest comeback.`,
    detail: `${matchLabel(largest.match)} turned after a ${largest.deficit}-hole deficit.`,
    basePriority: STORY_PRIORITY.comeback,
    updatedAt: matchUpdatedAt(largest.match),
    now,
  }) : null;
}

function teamRaceStory(insights, tournament, completedRounds, now) {
  const leader = insights.teamLeader;
  if (!leader || leader.points <= 0) return null;
  if (leader.tied) return story({ id: "team-race", category: "team-race", icon: "⚔", label: "Tightest Race", headline: "The tournament race is deadlocked.", detail: `${leader.namesLabel} are tied at ${formatTeamPoints(leader.points)} ${pointWord(leader.points)}.`, basePriority: STORY_PRIORITY.teamRace, updatedAt: tournament.lastUpdated, now });
  const one = Number(tournament?.teamOne?.score) || 0;
  const two = Number(tournament?.teamTwo?.score) || 0;
  const lead = Math.abs(one - two);
  const winner = leader.namesLabel;
  const lastRound = [...completedRounds].sort((a, b) => Number(b.id.split("-").at(-1)) - Number(a.id.split("-").at(-1)))[0];
  const latestRoundNumber = lastRound?.id.split("-").at(-1);
  const detail = lead === 0 ? `${winner} own the official tiebreak with the teams level on ${formatTeamPoints(one)} points.` : lastRound?.label === "Round Clinched" ? `${winner}' lead stands at ${formatTeamPoints(lead)} points after clinching Round ${latestRoundNumber}.` : lastRound ? `${winner} lead by ${formatTeamPoints(lead)} ${pointWord(lead)} after Round ${latestRoundNumber} finished level.` : `${winner} lead by ${formatTeamPoints(lead)} ${pointWord(lead)} as the tournament unfolds.`;
  const headline = lead === 0 ? `${winner} hold the tournament tiebreak.` : Number(tournament?.currentRound) === 3 && lead <= 3 ? `${winner} carry the advantage into the championship race.` : lead >= 3 ? `${winner} have opened a commanding lead.` : `${winner} hold a narrow tournament lead.`;
  return story({ id: "team-race", category: "team-race", icon: "💪", label: "Team Race", headline, detail, basePriority: STORY_PRIORITY.teamRace, updatedAt: tournament.lastUpdated, now });
}

function playerStories(insights, complete, now) {
  const stories = [];
  const leader = insights.pointsLeader;
  const unbeatenLeader = leader && leader.matchesPlayed > 0 && Number(leader.losses) === 0;
  if (leader?.matchesPlayed > 0) stories.push(story({ id: "points-leader", category: "player", icon: "🔥", label: complete ? "Tournament MVP" : "Hot Player", headline: unbeatenLeader ? `${leader.player} remains unbeaten and leads the tournament.` : `${leader.player} is setting the individual pace.`, detail: `${formatPlayerPoints(leader.points)} points through ${leader.matchesPlayed} completed match${leader.matchesPlayed === 1 ? "" : "es"}.`, basePriority: STORY_PRIORITY.hotPlayer, now }));
  const undefeated = insights.undefeated;
  if (undefeated.length === 1) {
    const player = undefeated[0];
    stories.push(story({ id: "undefeated", category: "player-record", icon: "🏅", label: complete ? "Perfect Record" : "Undefeated", headline: `${player.player} remains undefeated.`, detail: `${player.record} through ${player.matchesPlayed} completed match${player.matchesPlayed === 1 ? "" : "es"}.`, basePriority: STORY_PRIORITY.undefeated, now }));
  } else if (undefeated.length > 1) {
    const names = undefeated.map((player) => player.player).join(", ");
    stories.push(story({ id: "undefeated", category: "player-record", icon: "🏅", label: complete ? "Perfect Records" : "Undefeated", headline: `${undefeated.length} players remain unbeaten.`, detail: "The tournament's unbeaten group is still standing.", basePriority: STORY_PRIORITY.undefeated, now, accessibleLabel: `Undefeated: ${undefeated.length} players remain unbeaten: ${names}.` }));
  }
  return stories;
}

function netSkinsStories(netSkins, now) {
  const officialRounds = (netSkins?.rounds || []).filter((round) => round.finalized);
  const winners = new Map();
  for (const round of officialRounds) {
    for (const skin of round.skins || []) {
      const key = [skin.winnerPlayerId, skin.winnerPlayerId2].filter(Boolean).sort().join("|");
      if (!key || !clean(skin.winner)) continue;
      const current = winners.get(key) || { name: clean(skin.winner), skins: 0, winnings: 0 };
      current.skins += 1;
      current.winnings += Number(skin.skinValue) || 0;
      winners.set(key, current);
    }
  }
  const leaders = [...winners.values()].sort((left, right) => right.skins - left.skins || right.winnings - left.winnings || left.name.localeCompare(right.name));
  const leader = leaders[0];
  if (!leader) return [];
  const tied = leaders.filter((row) => row.skins === leader.skins && row.winnings === leader.winnings);
  if (tied.length > 1) return [story({
    id: "net-skins-race", category: "net-skins", icon: "💰", label: "Net Skins",
    headline: `${tied.length} entries share the Net Skins lead.`,
    detail: `${leader.skins} skin${leader.skins === 1 ? "" : "s"} apiece keeps the side competition tight.`,
    basePriority: STORY_PRIORITY.netSkins, now,
  })];
  return [story({
    id: "net-skins-leader", category: "net-skins", icon: "💰", label: "Net Skins Leader",
    headline: `${leader.name} ${leader.skins === 1 ? "captured a skin" : `has captured ${leader.skins} skins`}.`,
    detail: `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(leader.winnings)} earned from official finalized results.`,
    basePriority: STORY_PRIORITY.netSkins + leader.skins, now,
  })];
}

function editorialOrder(candidates) {
  const remaining = [...candidates];
  const ordered = [];
  const categoryCounts = new Map();
  while (remaining.length) {
    remaining.sort((left, right) => {
      const leftAdjusted = left.priorityScore - (categoryCounts.get(left.category) || 0) * 90;
      const rightAdjusted = right.priorityScore - (categoryCounts.get(right.category) || 0) * 90;
      return rightAdjusted - leftAdjusted || (right.updatedAt || 0) - (left.updatedAt || 0) || left.id.localeCompare(right.id);
    });
    const next = remaining.shift();
    ordered.push({ ...next, editorialRank: ordered.length + 1 });
    categoryCounts.set(next.category, (categoryCounts.get(next.category) || 0) + 1);
  }
  return ordered;
}

export function tournamentStorylines(data = {}, options = {}) {
  const current = currentTournamentView(data);
  const tournament = current.tournament;
  const rounds = current.rounds;
  const matches = rounds.flatMap((round) => round.matches || []);
  const status = clean(tournament.status).toLowerCase();
  const now = Number(options.now ?? Date.now());
  if (status === "upcoming") return upcomingStories(rounds, now);
  const performance = playerPerformanceRows(current.leaderboard, current.scoreLeaderboard);
  const teams = teamStandings(rounds, tournament, "overall");
  const insights = tournamentInsights(performance, teams, tournament);
  const complete = ["final", "complete"].includes(status) || /^final$/i.test(clean(tournament.currentRound));
  const roundStories = completedRoundStories(rounds, tournament, now);
  const candidates = [
    championStory(tournament, now),
    ...roundStories,
    firstFinalStory(matches, tournament, now),
    recentlyClinchedStory(matches, tournament, now),
    closestMatchStory(matches, now),
    ...matchMomentumStories(matches, tournament, now),
    completedComebackStory(matches, tournament, complete, now),
    teamRaceStory(insights, tournament, roundStories, now),
    liveFieldStory(matches, now),
    ...playerStories(insights, complete, now),
    ...netSkinsStories(current.netSkins, now),
  ];
  if (insights.lowestGross) candidates.push(story({ id: "lowest-gross", category: "scoring", icon: "🎯", label: "Lowest Gross", headline: `${insights.lowestGross.player} is setting the scoring pace.`, detail: `${Number(insights.lowestGross.grossAvg).toFixed(1)} is the lowest eligible gross average in the field.`, basePriority: STORY_PRIORITY.scoringPace, now }));
  if (insights.lowestNet) candidates.push(story({ id: "lowest-net", category: "scoring", icon: "🎯", label: "Lowest Net", headline: `${insights.lowestNet.player} is leading the net scoring race.`, detail: `${Number(insights.lowestNet.netAvg).toFixed(1)} is the lowest eligible net average in the field.`, basePriority: STORY_PRIORITY.scoringPace - 10, now }));
  return editorialOrder(candidates.filter(Boolean));
}

export function tournamentMoments(data = {}, options = {}) {
  return tournamentStorylines(data, options).slice(0, 6);
}
