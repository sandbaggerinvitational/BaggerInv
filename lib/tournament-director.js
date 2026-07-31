const clean = (value) => String(value ?? "").trim();
const STALE_SCORE_MINUTES = 20;

function parseClock(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(match[2]) };
}

function eventDate(dateValue, timeValue, fallbackDate) {
  const clock = parseClock(timeValue);
  if (!clock) return null;
  const rawDate = clean(dateValue);
  const base = rawDate
    ? (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T00:00:00`) : new Date(rawDate))
    : new Date(fallbackDate);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(clock.hour, clock.minute, 0, 0);
  return base;
}

function minutesBetween(future, now) {
  return future ? Math.round((future.getTime() - now.getTime()) / 60_000) : null;
}

export function countdownLabel(minutes, startTime = "") {
  if (minutes === null) return startTime || "Schedule unavailable";
  if (minutes <= 0 && minutes > -2) return "Now";
  if (minutes < 0) return `${Math.abs(minutes)} min overdue`;
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours} hr${hours === 1 ? "" : "s"}${remainder ? ` ${remainder} min` : ""}`;
  }
  const days = Math.floor(minutes / (24 * 60));
  return days === 1 ? `Tomorrow${startTime ? ` ${startTime}` : ""}` : `${days} days${startTime ? ` · ${startTime}` : ""}`;
}

export function directorRoundStatus(round) {
  const matches = round?.matches || [];
  const counts = {
    final: matches.filter((match) => match.status === "Final").length,
    live: matches.filter((match) => /^(Live|Reopened)$/i.test(match.status)).length,
    upcoming: matches.filter((match) => !/^(Final|Live|Reopened)$/i.test(match.status)).length,
  };
  const status = counts.final === matches.length && matches.length ? "FINAL" : counts.live || /^live$/i.test(round?.status) ? "LIVE" : "UPCOMING";
  return { ...counts, total: matches.length, status };
}

function nextTournamentEvent(data, rounds, now) {
  const scheduled = (data?.schedule || []).map((event) => {
    const at = eventDate(event.date, event.startTime, now);
    return at ? { ...event, at, minutes: minutesBetween(at, now) } : null;
  }).filter((event) => event && event.minutes >= -1).sort((a, b) => a.at - b.at)[0];
  if (scheduled) {
    const roundNumber = Number(clean(scheduled.roundId).match(/\d+/)?.[0]) || null;
    return {
      type: scheduled.type || "Tournament",
      title: scheduled.title,
      subtitle: scheduled.subtitle || scheduled.location || "",
      startTime: scheduled.startTime,
      minutes: scheduled.minutes,
      countdown: countdownLabel(scheduled.minutes, scheduled.startTime),
      automatic: Boolean(roundNumber && data?.tournament?.directorAutomation?.enabled && data?.tournament?.directorAutomation?.autoOpenRound),
      round: roundNumber,
    };
  }
  const nextRound = rounds.find((round) => round.status === "UPCOMING" && round.firstTeeTime);
  if (!nextRound) return null;
  const at = eventDate("", nextRound.firstTeeTime, now);
  const minutes = minutesBetween(at, now);
  return {
    type: "Round",
    title: `${nextRound.name} Opens`,
    subtitle: nextRound.format || nextRound.course,
    startTime: nextRound.firstTeeTime,
    minutes,
    countdown: countdownLabel(minutes, nextRound.firstTeeTime),
    automatic: Boolean(data?.tournament?.directorAutomation?.enabled && data?.tournament?.directorAutomation?.autoOpenRound),
    round: nextRound.number,
  };
}

function matchLabel(match) {
  return `Match ${match.match || match.id}`;
}

function issue({ id, severity = "warning", title, message, actionLabel, href, action = "" }) {
  return { id, severity, title, message, actionLabel, href, action };
}

function operationalIssues({ data, matches, rounds, automation, nextEvent, now }) {
  const issues = [];
  for (const match of matches) {
    const href = `/game-center/${encodeURIComponent(match.id)}?from=tournament`;
    const updated = Date.parse(match.updatedAt || "");
    const staleMinutes = Number.isFinite(updated) ? Math.floor((now.getTime() - updated) / 60_000) : null;
    const live = /^(Live|Reopened)$/i.test(match.status);
    const players = [...(match.team1Players || []), ...(match.team2Players || [])];
    const ids = players.map((player) => clean(player.id)).filter(Boolean);
    if (live && staleMinutes !== null && staleMinutes >= STALE_SCORE_MINUTES && Number(match.currentHole) < 18) issues.push(issue({ id: `stale:${match.id}`, title: matchLabel(match), message: `No score submitted for ${staleMinutes} minutes.`, actionLabel: "Open Match →", href }));
    if (live && Number(match.currentHole) >= 18) issues.push(issue({ id: `confirm:${match.id}`, severity: "critical", title: matchLabel(match), message: "Awaiting final confirmation after Hole 18.", actionLabel: "Open Match →", href }));
    if (/^Reopened$/i.test(match.status)) issues.push(issue({ id: `reopened:${match.id}`, severity: "critical", title: matchLabel(match), message: "Reopened but not finalized.", actionLabel: "Review →", href: "/admin?tab=live-scoring" }));
    if (match.archiveFinal && /^(Live|Reopened)$/i.test(match.sourceStatus)) issues.push(issue({ id: `status:${match.id}`, severity: "critical", title: matchLabel(match), message: "Final archive conflicts with the Live match status.", actionLabel: "Review →", href: "/admin?tab=live-scoring" }));
    if (!match.team1Players?.length || !match.team2Players?.length) issues.push(issue({ id: `players:${match.id}`, severity: "critical", title: matchLabel(match), message: "Players have not been assigned to both teams.", actionLabel: "Assign Players →", href: "/admin?tab=live-scoring" }));
    if (ids.length !== new Set(ids).size) issues.push(issue({ id: `teams:${match.id}`, severity: "critical", title: matchLabel(match), message: "A player is assigned more than once.", actionLabel: "Fix Assignment →", href: "/admin?tab=live-scoring" }));
    if (!match.teeTime) issues.push(issue({ id: `tee:${match.id}`, title: matchLabel(match), message: "Tee time is missing.", actionLabel: "Update Match →", href: "/admin?tab=live-scoring" }));
    const missingHandicap = players.some((player) => player.playingHcp === null || player.playingHcp === undefined);
    if (players.length && missingHandicap) issues.push(issue({ id: `hcp:${match.id}`, title: matchLabel(match), message: "One or more playing handicaps are missing.", actionLabel: "Review Handicaps →", href: "/admin?tab=live-scoring" }));
    if (match.scoreConflict) issues.push(issue({ id: `conflict:${match.id}`, severity: "critical", title: matchLabel(match), message: "A score submission conflict requires review.", actionLabel: "Resolve →", href: "/admin?tab=live-scoring" }));
  }
  if (!automation.enabled) issues.push(issue({ id: "automation", title: `Round ${data?.tournament?.currentRound || ""}`.trim(), message: "Automation is disabled.", actionLabel: "Enable Automation →", action: "enable-automation" }));
  const openingRound = rounds.find((round) => round.status === "UPCOMING" && round.number === (nextEvent?.round || Number(data?.tournament?.currentRound)));
  if (openingRound && nextEvent?.minutes !== null && nextEvent.minutes <= 30) issues.push(issue({ id: `round:${openingRound.number}`, severity: nextEvent.minutes < 0 ? "critical" : "warning", title: openingRound.name, message: nextEvent.minutes < 0 ? "Round has not been opened and its start time has passed." : `Ready to open in ${nextEvent.countdown}.`, actionLabel: "Open Round →", action: "open-round", href: "#quick-actions" }));
  if (data?.diagnostics?.result === "error") issues.push(issue({ id: "sync", severity: "critical", title: "Data synchronization", message: "The latest tournament synchronization failed.", actionLabel: "Retry →", action: "retry" }));
  return issues;
}

export function tournamentDirectorModel(data, now = new Date()) {
  const rounds = (data?.rounds || []).map((round) => {
    const summary = directorRoundStatus(round);
    const firstTeeTime = round.matches.map((match) => clean(match.teeTime)).filter(Boolean).sort()[0] || "";
    return { number: round.number, name: round.label || `Round ${round.number}`, format: round.format, course: round.course?.name || "", firstTeeTime, open: summary.status !== "UPCOMING", ...summary };
  });
  const matches = data?.rounds?.flatMap((round) => round.matches || []) || [];
  const final = matches.filter((match) => match.status === "Final").length;
  const live = matches.filter((match) => /^(Live|Reopened)$/i.test(match.status)).length;
  const reopened = matches.filter((match) => /^Reopened$/i.test(match.status)).length;
  const upcoming = Math.max(0, matches.length - final - live);
  const awaitingConfirmation = matches.filter((match) => /^(Live|Reopened)$/i.test(match.status) && Number(match.currentHole) >= 18).length;
  const automationSource = data?.tournament?.directorAutomation || {};
  const automation = { enabled: Boolean(automationSource.enabled), autoOpenRound: Boolean(automationSource.autoOpenRound), autoSetMatchesLive: Boolean(automationSource.autoSetMatchesLive), windowMinutes: 30 };
  const nextEvent = nextTournamentEvent(data, rounds, now);
  const issues = operationalIssues({ data, matches, rounds, automation, nextEvent, now });
  const critical = issues.filter((item) => item.severity === "critical").length;
  const healthStatus = critical ? { level: "action", label: "Action Needed", icon: "🔴" } : issues.length ? { level: "attention", label: "Attention Required", icon: "🟡" } : { level: "healthy", label: "Healthy", icon: "🟢" };
  const recentActivity = [...matches].filter((match) => match.updatedAt).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6).map((match) => ({ id: match.id, round: match.round, match: match.match, status: match.status, updatedAt: match.updatedAt, updatedBy: match.updatedBy }));
  const operatingRound = rounds.find((round) => Number(round.number) === Number(data?.tournament?.currentRound)) || rounds.find((round) => round.status !== "FINAL") || rounds[rounds.length - 1] || null;
  return {
    tournament: data?.tournament || {}, rounds, operatingRound, nextEvent,
    health: { status: healthStatus, issueCount: issues.length, criticalCount: critical, live, upcoming, final, awaitingConfirmation, reopened, errors: issues.filter((item) => /^(players|teams|tee|hcp|conflict|status|sync):?/.test(item.id)).length, lastSynchronization: data?.tournament?.lastUpdated || recentActivity[0]?.updatedAt || now.toISOString() },
    issues, automation,
    recentActivity,
    finalizedMatches: matches.filter((match) => match.status === "Final").map((match) => ({ id: match.id, round: match.round, match: match.match })),
  };
}

export function directorAutomationDue(model, now = new Date()) {
  if (!model?.automation?.enabled || !model.automation.autoOpenRound) return null;
  const round = model.rounds.find((item) => item.status === "UPCOMING" && item.firstTeeTime);
  if (!round) return null;
  const tee = eventDate("", round.firstTeeTime, now);
  const minutes = minutesBetween(tee, now);
  return minutes !== null && minutes >= 0 && minutes <= model.automation.windowMinutes ? round.number : null;
}
