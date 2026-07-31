import { formatPlayerPoints, formatTeamPoints } from "./formatters.js";
import { playerPerformanceRows, teamStandings, tournamentInsights } from "./mobile-leaderboards.js";

const clean = (value) => String(value ?? "").trim();
const final = (match) => /^final/i.test(clean(match?.status));

function story(id, icon, label, headline, detail, priority = 50) {
  return { id, icon, label, headline, detail, priority };
}

function championStory(tournament) {
  const complete = /^(final|complete)$/i.test(clean(tournament?.status)) || /^final$/i.test(clean(tournament?.currentRound));
  if (!complete) return null;
  const one = Number(tournament?.teamOne?.score) || 0;
  const two = Number(tournament?.teamTwo?.score) || 0;
  if (one === two) return story("champion-tie", "🏆", "Tournament Complete", "The tournament finishes tied.", `${formatTeamPoints(one)}–${formatTeamPoints(two)} after every match.`, 1);
  const winner = one > two ? tournament?.teamOne?.name : tournament?.teamTwo?.name;
  return winner ? story("champion", "🏆", "Tournament Champions", `${winner} win the Sandbagger Invitational.`, `${formatTeamPoints(one)}–${formatTeamPoints(two)} final tournament score.`, 1) : null;
}

function completedRoundStories(rounds, tournament) {
  return rounds.flatMap((round) => {
    const matches = round?.matches || [];
    if (!matches.length || !matches.every(final)) return [];
    const one = matches.reduce((sum, match) => sum + (Number(match.team1Points) || 0), 0);
    const two = matches.reduce((sum, match) => sum + (Number(match.team2Points) || 0), 0);
    const label = round.label || `Round ${round.number}`;
    if (one === two) return [story(`round-${round.number}`, "🤝", "Round Complete", `${label} finished level.`, `${formatTeamPoints(one)}–${formatTeamPoints(two)} across ${matches.length} matches.`, 4 + Number(round.number || 0))];
    const winner = one > two ? tournament?.teamOne?.name : tournament?.teamTwo?.name;
    return winner ? [story(`round-${round.number}`, "🏆", "Round Clinched", `${winner} clinched ${label}.`, `${formatTeamPoints(one)}–${formatTeamPoints(two)} round score.`, 4 + Number(round.number || 0))] : [];
  });
}

export function tournamentStorylines(data = {}) {
  const tournament = data.tournament || {};
  const rounds = data.rounds || [];
  const performance = playerPerformanceRows(data.leaderboard || [], data.scoreLeaderboard || []);
  const teams = teamStandings(rounds, tournament, "overall");
  const insights = tournamentInsights(performance, teams, tournament);
  const stories = [championStory(tournament), ...completedRoundStories(rounds, tournament)];

  if (insights.teamLeader?.tied && insights.teamLeader.points > 0) stories.push(story("team-race", "⚡", "Tournament Race", "The tournament race is deadlocked.", `${insights.teamLeader.namesLabel} are tied at ${formatTeamPoints(insights.teamLeader.points)} points.`, 8));
  else if (insights.teamLeader?.points > 0) stories.push(story("team-race", "📈", "Tournament Race", `${insights.teamLeader.namesLabel} lead the tournament.`, `${formatTeamPoints(insights.teamLeader.points)} team points and the race remains live.`, 9));

  if (insights.pointsLeader?.matchesPlayed > 0) stories.push(story("points-leader", "🏅", "Points Leader", `${insights.pointsLeader.player} sets the tournament pace.`, `${formatPlayerPoints(insights.pointsLeader.points)} individual points from an official ${insights.pointsLeader.record} record.`, 12));
  if (insights.undefeated.length === 1) {
    const player = insights.undefeated[0];
    stories.push(story("undefeated", "🔥", "Undefeated", `${player.player} remains undefeated.`, `${player.record} through ${player.matchesPlayed} completed match${player.matchesPlayed === 1 ? "" : "es"}.`, 14));
  } else if (insights.undefeated.length > 1) {
    stories.push(story("undefeated", "🔥", "Undefeated", `${insights.undefeated.length} players remain unbeaten.`, insights.undefeated.map((player) => player.player).join(", "), 14));
  }
  if (insights.lowestGross) stories.push(story("lowest-gross", "🥇", "Lowest Gross", `${insights.lowestGross.player} owns the lowest gross average.`, `${Number(insights.lowestGross.grossAvg).toFixed(1)} across eligible completed rounds.`, 24));
  if (insights.lowestNet) stories.push(story("lowest-net", "🎯", "Lowest Net", `${insights.lowestNet.player} owns the lowest net average.`, `${Number(insights.lowestNet.netAvg).toFixed(1)} across eligible completed rounds.`, 25));

  return stories.filter(Boolean).sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

export function tournamentMoments(data = {}) {
  if (/^upcoming$/i.test(clean(data?.tournament?.status))) return [];
  return tournamentStorylines(data).slice(0, 6);
}
