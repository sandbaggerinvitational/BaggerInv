import { formatPlayerPoints, formatTeamPoints } from "./formatters.js";
import { isLiveMatch, isOfficialMatchResult } from "./live-tournament.js";
import { playerPerformanceRows, teamStandings, tournamentInsights } from "./mobile-leaderboards.js";

const clean = (value) => String(value ?? "").trim();
const final = (match) => isOfficialMatchResult(match);
const pointWord = (value) => Number(value) === 1 ? "point" : "points";

function story(id, icon, label, headline, detail, priority = 50, accessibleLabel = "") {
  return { id, icon, label, headline, detail, priority, accessibleLabel: accessibleLabel || `${label}: ${headline} ${detail}` };
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

function completedRoundStories(rounds, tournament) {
  return rounds.flatMap((round) => {
    const matches = round?.matches || [];
    if (!matches.length || !matches.every(final)) return [];
    const one = matches.reduce((sum, match) => sum + (Number(match.team1Points) || 0), 0);
    const two = matches.reduce((sum, match) => sum + (Number(match.team2Points) || 0), 0);
    const label = round.label || `Round ${round.number}`;
    if (one === two) return [story(
      `round-${round.number}`, "🤝", "Round Complete", `${label} finished level.`,
      `Neither team gave an inch in a ${formatTeamPoints(one)}–${formatTeamPoints(two)} finish.`, 4 + Number(round.number || 0),
    )];
    const winner = teamName(one > two ? 1 : 2, tournament);
    return winner ? [story(
      `round-${round.number}`, "🏆", "Round Clinched", `${winner} clinched ${label}.`,
      `A ${formatTeamPoints(one)}–${formatTeamPoints(two)} round moved the tournament race forward.`, 4 + Number(round.number || 0),
    )] : [];
  });
}

function championStory(tournament) {
  const complete = /^(final|complete)$/i.test(clean(tournament?.status)) || /^final$/i.test(clean(tournament?.currentRound));
  if (!complete) return null;
  const one = Number(tournament?.teamOne?.score) || 0;
  const two = Number(tournament?.teamTwo?.score) || 0;
  if (one === two) return story("champion-tie", "🏆", "Tournament Complete", "The tournament finishes tied.", `${formatTeamPoints(one)}–${formatTeamPoints(two)} after every match.`, 1);
  const winner = teamName(one > two ? 1 : 2, tournament);
  return winner ? story("champion", "🎉", "Tournament Champion", `${winner} win the Sandbagger Invitational.`, `${formatTeamPoints(one)}–${formatTeamPoints(two)} is the final tournament score.`, 1) : null;
}

function upcomingStories(rounds) {
  const openingRound = rounds.find((round) => (round?.matches || []).length) || rounds[0];
  if (!openingRound) return [story("welcome", "🏆", "Welcome", "The Sandbagger Invitational is ready for its next chapter.", "Tournament moments will appear as official play begins.", 1)];
  const matches = openingRound.matches || [];
  const teeTime = clean(matches.find((match) => clean(match.teeTime))?.teeTime);
  const roundLabel = openingRound.label || `Round ${openingRound.number}`;
  if (matches.length) return [story(
    "pairings-released", "👀", "Pairings Released", `${roundLabel} is set.`,
    `${matches.length} match${matches.length === 1 ? "" : "es"}${teeTime ? ` begin at ${teeTime}` : " are ready for the opening tee"}.`, 1,
  )];
  return [story("opening-round", "⛳", "Up Next", `${roundLabel} begins soon.`, "The first tournament story is waiting to be written.", 1)];
}

function firstFinalStory(matches, tournament) {
  const decided = matches.filter(final);
  if (decided.length !== 1) return null;
  const match = decided[0];
  const side = winnerSide(match);
  const label = `Round ${match.round || 1} · Match ${match.match || match.matchNumber || 1}`;
  if (!side) return story("first-final", "⚡", "First Result", `${label} is the first match in the books.`, "The tournament has its opening result.", 7);
  const winner = teamName(side, tournament);
  return winner ? story("first-final", "⚡", "First Result", `${winner} put the first result on the board.`, `${label} is the tournament's first finalized match.`, 7) : null;
}

function liveLead(match) {
  const text = clean(match.liveStatusText || match.statusText || match.result);
  if (/all square|halved|tied/i.test(text)) return 0;
  const parsed = text.match(/(\d+(?:\.\d+)?)\s*up/i);
  if (parsed) return Number(parsed[1]);
  const one = Number(match.team1HolesWon);
  const two = Number(match.team2HolesWon);
  return Number.isFinite(one) && Number.isFinite(two) ? Math.abs(one - two) : null;
}

function closestMatchStory(matches) {
  const candidates = matches.filter(isLiveMatch).map((match) => ({ match, lead: liveLead(match), through: Number(match.currentHole) || 0 }))
    .filter((item) => item.lead !== null && item.through > 0)
    .sort((left, right) => left.lead - right.lead || right.through - left.through || Number(left.match.match || 0) - Number(right.match.match || 0));
  const closest = candidates[0];
  if (!closest) return null;
  const matchLabel = `Round ${closest.match.round || "—"} · Match ${closest.match.match || closest.match.matchNumber || "—"}`;
  const position = closest.lead === 0 ? "All Square" : `only ${closest.lead} UP`;
  return story("closest-match", "👀", "Closest Match", `${matchLabel} is ${position} through ${closest.through}.`, "Every remaining hole carries tournament pressure.", 10);
}

function teamRaceStory(insights, tournament, completedRounds) {
  const leader = insights.teamLeader;
  if (!leader || leader.points <= 0) return null;
  if (leader.tied) return story(
    "team-race", "⚔", "Tightest Race", "The tournament race is deadlocked.",
    `${leader.namesLabel} are tied at ${formatTeamPoints(leader.points)} ${pointWord(leader.points)}.`, 8, leader.accessibleLabel,
  );
  const one = Number(tournament?.teamOne?.score) || 0;
  const two = Number(tournament?.teamTwo?.score) || 0;
  const lead = Math.abs(one - two);
  const winner = leader.namesLabel;
  const lastRound = [...completedRounds].sort((a, b) => Number(b.id.split("-").at(-1)) - Number(a.id.split("-").at(-1)))[0];
  const latestRoundNumber = lastRound?.id.split("-").at(-1);
  const detail = lead === 0
    ? `${winner} own the official tiebreak with the teams level on ${formatTeamPoints(one)} points.`
    : lastRound?.label === "Round Clinched"
    ? `${winner} have opened a ${formatTeamPoints(lead)}-point lead after clinching Round ${latestRoundNumber}.`
    : lastRound
    ? `${winner} lead by ${formatTeamPoints(lead)} ${pointWord(lead)} after Round ${latestRoundNumber} finished level.`
    : `${winner} lead by ${formatTeamPoints(lead)} ${pointWord(lead)} as the tournament unfolds.`;
  const headline = lead === 0 ? `${winner} hold the tournament tiebreak.` : Number(tournament?.currentRound) === 3 && lead <= 3
    ? `${winner} carry the advantage into the championship race.`
    : lead >= 3 ? `${winner} have opened a commanding lead.` : `${winner} hold a narrow tournament lead.`;
  return story("team-race", "💪", "Team Race", headline, detail, 8, leader.accessibleLabel);
}

function playerStories(insights, complete) {
  const stories = [];
  const leader = insights.pointsLeader;
  const unbeatenLeader = leader && leader.matchesPlayed > 0 && Number(leader.losses) === 0;
  if (leader?.matchesPlayed > 0) stories.push(story(
    "points-leader", "🔥", complete ? "Tournament MVP" : "Hot Player",
    unbeatenLeader ? `${leader.player} remains unbeaten and leads the tournament.` : `${leader.player} is setting the individual pace.`,
    `${formatPlayerPoints(leader.points)} points through ${leader.matchesPlayed} completed match${leader.matchesPlayed === 1 ? "" : "es"}.`, 12,
  ));
  const undefeated = insights.undefeated;
  if (undefeated.length === 1) {
    const player = undefeated[0];
    stories.push(story("undefeated", "🏅", complete ? "Perfect Record" : "Undefeated", `${player.player} remains undefeated.`, `${player.record} through ${player.matchesPlayed} completed match${player.matchesPlayed === 1 ? "" : "es"}.`, 14));
  } else if (undefeated.length > 1) {
    stories.push(story("undefeated", "🏅", complete ? "Perfect Records" : "Undefeated", `${undefeated.length} players remain unbeaten.`, undefeated.map((player) => player.player).join(", "), 14));
  }
  return stories;
}

export function tournamentStorylines(data = {}) {
  const tournament = data.tournament || {};
  const rounds = data.rounds || [];
  const matches = rounds.flatMap((round) => round.matches || []);
  const status = clean(tournament.status).toLowerCase();
  if (status === "upcoming") return upcomingStories(rounds);
  const performance = playerPerformanceRows(data.leaderboard || [], data.scoreLeaderboard || []);
  const teams = teamStandings(rounds, tournament, "overall");
  const insights = tournamentInsights(performance, teams, tournament);
  const complete = ["final", "complete"].includes(status) || /^final$/i.test(clean(tournament.currentRound));
  const roundStories = completedRoundStories(rounds, tournament);
  const stories = [
    championStory(tournament),
    ...roundStories,
    firstFinalStory(matches, tournament),
    teamRaceStory(insights, tournament, roundStories),
    closestMatchStory(matches),
    ...playerStories(insights, complete),
  ];

  if (insights.lowestGross) stories.push(story("lowest-gross", "🎯", "Lowest Gross", `${insights.lowestGross.player} is setting the scoring pace.`, `${Number(insights.lowestGross.grossAvg).toFixed(1)} is the lowest eligible gross average in the field.`, 24));
  if (insights.lowestNet) stories.push(story("lowest-net", "🎯", "Lowest Net", `${insights.lowestNet.player} is leading the net scoring race.`, `${Number(insights.lowestNet.netAvg).toFixed(1)} is the lowest eligible net average in the field.`, 25));

  return stories.filter(Boolean).sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

export function tournamentMoments(data = {}) {
  return tournamentStorylines(data).slice(0, 6);
}
