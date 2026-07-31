const clean = (value) => String(value ?? "").trim();

export function directorRoundStatus(round) {
  const matches = round?.matches || [];
  const counts = {
    final: matches.filter((match) => match.status === "Final").length,
    live: matches.filter((match) => /^(Live|Reopened)$/i.test(match.status)).length,
    upcoming: matches.filter((match) => !/^(Final|Live|Reopened)$/i.test(match.status)).length,
  };
  const status = counts.final === matches.length && matches.length ? "FINAL" : counts.live ? "LIVE" : "UPCOMING";
  return { ...counts, total: matches.length, status };
}

export function tournamentDirectorModel(data, now = new Date()) {
  const rounds = (data?.rounds || []).map((round) => {
    const summary = directorRoundStatus(round);
    const firstTeeTime = round.matches.map((match) => clean(match.teeTime)).filter(Boolean).sort()[0] || "";
    return { number: round.number, name: round.label || `Round ${round.number}`, format: round.format, course: round.course?.name || "", firstTeeTime, ...summary };
  });
  const matches = data?.rounds?.flatMap((round) => round.matches || []) || [];
  const final = matches.filter((match) => match.status === "Final").length;
  const live = matches.filter((match) => /^(Live|Reopened)$/i.test(match.status)).length;
  const reopened = matches.filter((match) => /^Reopened$/i.test(match.status)).length;
  const upcoming = Math.max(0, matches.length - final - live);
  const awaitingConfirmation = matches.filter((match) => /^(Live|Reopened)$/i.test(match.status) && Number(match.currentHole) >= 18).length;
  const errors = matches.filter((match) => !match.id || !match.course?.name || !(match.team1Players?.length) || !(match.team2Players?.length)).length;
  const recentActivity = [...matches].filter((match) => match.updatedAt).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6).map((match) => ({
    id: match.id, round: match.round, match: match.match, status: match.status, updatedAt: match.updatedAt, updatedBy: match.updatedBy,
  }));
  const automation = data?.tournament?.directorAutomation || {};
  return {
    tournament: data?.tournament || {}, rounds,
    health: { live, upcoming, final, awaitingConfirmation, reopened, errors, lastSynchronization: data?.tournament?.lastUpdated || recentActivity[0]?.updatedAt || now.toISOString() },
    automation: { enabled: Boolean(automation.enabled), autoOpenRound: Boolean(automation.autoOpenRound), autoSetMatchesLive: Boolean(automation.autoSetMatchesLive), windowMinutes: 30 },
    recentActivity,
    finalizedMatches: matches.filter((match) => match.status === "Final").map((match) => ({ id: match.id, round: match.round, match: match.match })),
  };
}

export function directorAutomationDue(model, now = new Date()) {
  if (!model?.automation?.enabled || !model.automation.autoOpenRound) return null;
  const round = model.rounds.find((item) => item.status === "UPCOMING" && item.firstTeeTime);
  if (!round) return null;
  const match = round.firstTeeTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  const tee = new Date(now); tee.setHours(hour, Number(match[2]), 0, 0);
  const minutes = (tee.getTime() - now.getTime()) / 60_000;
  return minutes >= 0 && minutes <= model.automation.windowMinutes ? round.number : null;
}
