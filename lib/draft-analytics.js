import { getDraftAnalysis } from "./draft-analysis.js";
import { draftValueScore } from "./draft-value.js";
import {
  MINIMUM_DRAFTS_FOR_ADP,
  MINIMUM_DRAFTS_FOR_TRENDS,
} from "./draft-analytics-config.js";
import {
  getPlayerMap,
  getTournament,
  getTournamentPlayerLeaderboard,
} from "./stats.js";

const clean = (value) => String(value ?? "").trim();
const round = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));

function rankLeaderboard(rows = []) {
  const sorted = [...rows].sort((a, b) =>
    Number(b.points || 0) - Number(a.points || 0) ||
    Number(b.wins || 0) - Number(a.wins || 0) ||
    Number(a.losses || 0) - Number(b.losses || 0) ||
    clean(a.player?.["Display Name"] || a.player).localeCompare(clean(b.player?.["Display Name"] || b.player))
  );
  const ranks = new Map();
  sorted.forEach((row, index) => ranks.set(row.id, index + 1));
  return { sorted, ranks };
}

function nearestGrade(rows) {
  if (!rows.length) return "—";
  const gradePoints = { "A+": 12, A: 11, "A−": 10, "B+": 9, B: 8, "B−": 7, "C+": 6, C: 5 };
  const labels = Object.entries(gradePoints);
  const average = rows.reduce((sum, row) => sum + (gradePoints[row.grade] || 5), 0) / rows.length;
  return labels.sort((a, b) => Math.abs(b[1] - average) - Math.abs(a[1] - average)).at(-1)?.[0] || "—";
}

function playerRecord(map, pick, context, playerMap) {
  const player = playerMap[pick.player.id] || {};
  if (!map.has(pick.player.id)) map.set(pick.player.id, {
    id: pick.player.id,
    name: pick.player.name,
    slug: clean(player.Slug),
    drafts: [],
  });
  map.get(pick.player.id).drafts.push({
    year: context.year,
    pick: pick.pickNumber,
    team: pick.team?.name || "Team not recorded",
    teamId: pick.team?.id || "",
    captain: pick.team?.captain?.name || "Captain not recorded",
    finish: context.ranks.get(pick.player.id) || null,
    points: Number(context.leaderboardById.get(pick.player.id)?.points) || 0,
    dvs: draftValueScore(pick.pickNumber, context.ranks.get(pick.player.id)),
    teamFinish: context.championTeamId
      ? (pick.team?.id === context.championTeamId ? 1 : 2)
      : null,
    championship: Boolean(context.championTeamId && pick.team?.id === context.championTeamId),
    individualChampionship: context.individualChampionIds.has(pick.player.id),
  });
}

function careerPlayers(playerDrafts) {
  return [...playerDrafts.values()].map((player) => {
    const withFinish = player.drafts.filter((row) => Number.isFinite(row.finish));
    const withTeamFinish = player.drafts.filter((row) => Number.isFinite(row.teamFinish));
    return {
      ...player,
      draftsParticipated: player.drafts.length,
      averageDraftPosition: round(player.drafts.reduce((sum, row) => sum + row.pick, 0) / player.drafts.length),
      highestDraftPosition: Math.min(...player.drafts.map((row) => row.pick)),
      lowestDraftPosition: Math.max(...player.drafts.map((row) => row.pick)),
      firstOverallSelections: player.drafts.filter((row) => row.pick === 1).length,
      topFiveSelections: player.drafts.filter((row) => row.pick <= 5).length,
      lateRoundSelections: player.drafts.filter((row) => row.pick > 10).length,
      averageTeamFinish: withTeamFinish.length
        ? round(withTeamFinish.reduce((sum, row) => sum + row.teamFinish, 0) / withTeamFinish.length)
        : null,
      championshipsWon: player.drafts.filter((row) => row.championship).length,
      individualChampionships: player.drafts.filter((row) => row.individualChampionship).length,
      careerDvs: withFinish.length
        ? withFinish.reduce((sum, row) => sum + row.dvs, 0)
        : null,
    };
  }).sort((a, b) =>
    (b.careerDvs ?? -999) - (a.careerDvs ?? -999) ||
    a.averageDraftPosition - b.averageDraftPosition ||
    a.name.localeCompare(b.name)
  );
}

function captainRecords(classes) {
  const captains = new Map();
  for (const row of classes) {
    const key = row.captainId || row.captain;
    if (!captains.has(key)) captains.set(key, {
      id: row.captainId,
      name: row.captain,
      slug: row.captainSlug,
      drafts: [],
    });
    captains.get(key).drafts.push(row);
  }
  return [...captains.values()].map((captain) => {
    const bestDraft = [...captain.drafts].sort((a, b) => b.score - a.score)[0];
    return {
      ...captain,
      draftsManaged: captain.drafts.length,
      draftWins: captain.drafts.filter((row) => row.classRank === 1).length,
      averageDraftGrade: nearestGrade(captain.drafts),
      averageDraftScore: round(captain.drafts.reduce((sum, row) => sum + row.score, 0) / captain.drafts.length),
      draftChampionships: captain.drafts.filter((row) => row.teamFinish === 1).length,
      bestDraft: bestDraft?.year || null,
    };
  }).sort((a, b) =>
    b.averageDraftScore - a.averageDraftScore ||
    b.draftChampionships - a.draftChampionships ||
    a.name.localeCompare(b.name)
  );
}

function historicalTrends({ contexts, draftRows, classes }) {
  const finalContexts = contexts.filter((row) => row.championTeamId);
  if (finalContexts.length < MINIMUM_DRAFTS_FOR_TRENDS) return [];
  const trends = [];
  const firstOverall = draftRows.filter((row) => row.pick === 1 && Number.isFinite(row.finish));
  if (firstOverall.length >= 3) {
    const wins = firstOverall.filter((row) => row.individualChampionship).length;
    trends.push(`The #1 overall pick has finished as Individual Champion in ${wins} of ${firstOverall.length} recorded drafts.`);
  }
  const topFive = draftRows.filter((row) => row.pick <= 5 && Number.isFinite(row.finish));
  if (topFive.length >= 10) {
    trends.push(`Golfers selected in the Top 5 average ${round(topFive.reduce((sum, row) => sum + row.points, 0) / topFive.length)} tournament points.`);
  }
  const championClasses = classes.filter((row) => row.teamFinish === 1);
  if (championClasses.length >= 3) {
    const lateCounts = championClasses.map((row) =>
      draftRows.filter((pick) => pick.year === row.year && pick.teamId === row.teamId && pick.pick > 10).length
    );
    trends.push(`The average championship roster contains ${round(lateCounts.reduce((sum, value) => sum + value, 0) / lateCounts.length)} golfers selected after Pick 10.`);
  }
  const firstDraftingClasses = classes.filter((row) => row.draftedFirst && Number.isFinite(row.teamFinish));
  if (firstDraftingClasses.length >= 3) {
    const wins = firstDraftingClasses.filter((row) => row.teamFinish === 1).length;
    trends.push(`Captains drafting first have won ${round((wins / firstDraftingClasses.length) * 100, 0)}% of completed tournaments.`);
  }
  return trends;
}

function hallOfFame({ classes, draftRows, captains }) {
  const finished = draftRows.filter((row) => Number.isFinite(row.dvs));
  const steals = [...finished].sort((a, b) => b.dvs - a.dvs);
  const reaches = [...finished].sort((a, b) => a.dvs - b.dvs);
  const careerClimbers = new Map();
  for (const row of finished) careerClimbers.set(row.playerId, (careerClimbers.get(row.playerId) || 0) + row.dvs);
  const climberId = [...careerClimbers].sort((a, b) => b[1] - a[1])[0]?.[0];
  const climber = finished.find((row) => row.playerId === climberId);
  const late = steals.find((row) => row.pick > 10);
  const first = [...finished.filter((row) => row.pick === 1)].sort((a, b) => a.finish - b.finish || b.points - a.points)[0];
  return [
    classes[0] ? { title: "Greatest Draft Ever", icon: "🏆", subject: `${classes[0].captain} · ${classes[0].year}`, detail: `${classes[0].score} Draft Score` } : null,
    steals[0] ? { title: "Greatest Steal Ever", icon: "💎", subject: steals[0].player, detail: `${steals[0].year} · +${steals[0].dvs} DVS` } : null,
    climber ? { title: "Biggest Climber", icon: "📈", subject: climber.player, detail: `${careerClimbers.get(climberId) > 0 ? "+" : ""}${careerClimbers.get(climberId)} Career DVS` } : null,
    reaches[0] ? { title: "Biggest Reach", icon: "📉", subject: reaches[0].player, detail: `${reaches[0].year} · ${reaches[0].dvs} DVS` } : null,
    captains[0] ? { title: "Greatest Draft Captain", icon: "👑", subject: captains[0].name, detail: `${captains[0].averageDraftScore} Average Draft Score` } : null,
    late ? { title: "Best Late Round Pick", icon: "🎯", subject: late.player, detail: `${late.year} · Pick #${late.pick}` } : null,
    first ? { title: "Best First Overall Pick", icon: "⭐", subject: first.player, detail: `${first.year} · Finished #${first.finish}` } : null,
  ].filter(Boolean);
}

function deterministicSummary({ completedDrafts, classes, steals, captains }) {
  if (!completedDrafts) return "Historical draft patterns will appear once completed drafts are recorded.";
  const best = classes[0];
  const steal = steals[0];
  const captain = captains[0];
  return `${completedDrafts} completed ${completedDrafts === 1 ? "draft is" : "drafts are"} now part of the SBI historical record. ${best ? `${best.captain}'s ${best.year} class currently owns the highest Draft Score at ${best.score}.` : ""} ${steal ? `${steal.player} has produced the strongest single-pick value at ${steal.dvs > 0 ? "+" : ""}${steal.dvs} DVS.` : ""} ${captain && captains.length > 1 ? `${captain.name} leads the captain board with a ${captain.averageDraftScore} average Draft Score.` : ""}`.replace(/\s+/g, " ").trim();
}

export async function getHistoricalDraftAnalytics(drafts) {
  const completed = drafts.filter((draft) => draft.state === "complete");
  const playerMap = getPlayerMap();
  const analyses = await Promise.all(completed.map((draft) => getDraftAnalysis(draft)));
  const playerDrafts = new Map();
  const classes = [];
  const draftRows = [];
  const contexts = [];

  completed.forEach((draft, index) => {
    const tournament = getTournament(draft.year);
    const leaderboard = getTournamentPlayerLeaderboard(draft.year);
    const { sorted, ranks } = rankLeaderboard(leaderboard);
    const leaderboardById = new Map(leaderboard.map((row) => [row.id, row]));
    const topPoints = tournament?.championTeam && sorted.length ? Number(sorted[0].points) : null;
    const individualChampionIds = new Set(
      Number.isFinite(topPoints) ? sorted.filter((row) => Number(row.points) === topPoints).map((row) => row.id) : []
    );
    const context = {
      year: draft.year,
      ranks,
      leaderboardById,
      individualChampionIds,
      championTeamId: tournament?.championTeam?.id || null,
    };
    contexts.push(context);
    draft.picks.filter((pick) => pick.player).forEach((pick) => {
      playerRecord(playerDrafts, pick, context, playerMap);
      const history = playerDrafts.get(pick.player.id).drafts.at(-1);
      draftRows.push({
        year: draft.year,
        playerId: pick.player.id,
        player: pick.player.name,
        slug: clean(playerMap[pick.player.id]?.Slug),
        pick: pick.pickNumber,
        teamId: pick.team?.id || "",
        team: pick.team?.name || "",
        captain: pick.team?.captain?.name || "",
        finish: history.finish,
        points: history.points,
        dvs: history.dvs,
        individualChampionship: history.individualChampionship,
      });
    });
    const grades = analyses[index]?.grades || [];
    const rankedGrades = [...grades].sort((a, b) => b.score - a.score);
    draft.teams.forEach((team) => {
      const grade = grades.find((row) => row.team.id === team.id);
      if (!grade) return;
      const captainPlayer = playerMap[team.captain?.id] || {};
      classes.push({
        year: draft.year,
        teamId: team.id,
        team: team.name,
        captainId: team.captain?.id || "",
        captain: team.captain?.name || "Captain not recorded",
        captainSlug: clean(captainPlayer.Slug),
        score: grade.score,
        grade: grade.grade,
        classRank: rankedGrades.findIndex((row) => row.team.id === team.id) + 1,
        teamFinish: context.championTeamId ? (context.championTeamId === team.id ? 1 : 2) : null,
        draftedFirst: draft.firstPickTeamId === team.id,
      });
    });
  });

  classes.sort((a, b) => b.score - a.score || b.year - a.year);
  const classByTeamYear = new Map(classes.map((row) => [`${row.year}:${row.teamId}`, row]));
  draftRows.forEach((row) => {
    const draftClass = classByTeamYear.get(`${row.year}:${row.teamId}`);
    row.teamFinish = draftClass?.teamFinish ?? null;
    row.draftGrade = draftClass?.grade || "—";
  });
  const players = careerPlayers(playerDrafts);
  const captains = captainRecords(classes);
  const finishedRows = draftRows.filter((row) => Number.isFinite(row.dvs));
  const steals = [...finishedRows].sort((a, b) => b.dvs - a.dvs || a.pick - b.pick);
  const reaches = [...finishedRows].sort((a, b) => a.dvs - b.dvs || a.pick - b.pick);
  const firstOverall = draftRows.filter((row) => row.pick === 1).sort((a, b) => b.year - a.year);
  const averageDraftPosition = players.filter((row) => row.draftsParticipated >= MINIMUM_DRAFTS_FOR_ADP)
    .sort((a, b) => a.averageDraftPosition - b.averageDraftPosition || a.name.localeCompare(b.name));
  const trends = historicalTrends({ contexts, draftRows, classes });

  return {
    summary: {
      draftsRecorded: completed.length,
      playersDrafted: draftRows.length,
      uniqueGolfers: players.length,
      captains: captains.length,
      averageDraftSize: completed.length ? round(draftRows.length / completed.length) : 0,
    },
    players,
    captains,
    classes,
    steals,
    reaches,
    draftRows,
    firstOverall,
    averageDraftPosition,
    hallOfFame: hallOfFame({ classes, draftRows, captains }),
    trends,
    historicalSummary: deterministicSummary({
      completedDrafts: completed.length,
      classes,
      steals,
      captains,
    }),
  };
}
