import { timelineEventStatus, tournamentDateTime, tournamentDayKey } from "./tournament-timeline.js";

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
  if (minutes < 0) {
    const elapsed = Math.abs(minutes);
    if (elapsed < 60) return `Started ${elapsed} minute${elapsed === 1 ? "" : "s"} ago`;
    const hours = Math.round(elapsed / 60);
    return `Started ${hours} hr${hours === 1 ? "" : "s"} ago`;
  }
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `in ${hours} hr${hours === 1 ? "" : "s"}${remainder ? ` ${remainder} min` : ""}`;
  }
  const days = Math.floor(minutes / (24 * 60));
  return days === 1 ? `Tomorrow${startTime ? ` at ${startTime}` : ""}` : `in ${days} days${startTime ? ` · ${startTime}` : ""}`;
}

function eventTiming(minutes, startTime, roundEvent, title = "") {
  const relative = countdownLabel(minutes, startTime);
  if (minutes === null) return relative;
  if (minutes < 0 && roundEvent) return `${title.replace(/\s+Opens$/i, "")} should now be open`;
  if (minutes < 0) return `${title || "Event"} is underway`;
  if (roundEvent) return `${title || "Round"} ${relative}`;
  return `${title || "Event"} begins ${relative}`;
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
  if (!data?.timeline?.available) return null;
  const timeZone = data?.tournament?.timeZone || "America/Chicago";
  const today = tournamentDayKey(now, timeZone);
  const scheduled = (data.timeline.events || []).map((event) => {
    const at = tournamentDateTime(event.date, event.startTime, timeZone);
    const end = tournamentDateTime(event.date, event.endTime || event.startTime, timeZone);
    const status = timelineEventStatus(event, { now, tournamentStatus: data?.tournament?.status, timeZone });
    return at ? { ...event, at, end, status, minutes: minutesBetween(at, now) } : null;
  }).filter((event) => event && event.date === today && !["Completed", "Cancelled"].includes(event.status) && (!event.end || event.end >= now))
    .sort((a, b) => a.at - b.at)[0];
  if (scheduled) {
    const roundNumber = Number(clean(`${scheduled.type} ${scheduled.title}`).match(/round\s*(\d+)/i)?.[1]) || null;
    return {
      type: scheduled.type || "Tournament",
      title: scheduled.title,
      subtitle: scheduled.subtitle || scheduled.location || "",
      startTime: scheduled.startTime,
      minutes: scheduled.minutes,
      countdown: eventTiming(scheduled.minutes, scheduled.startTime, Boolean(roundNumber) || /round|opens/i.test(`${scheduled.type} ${scheduled.title}`), scheduled.title),
      status: scheduled.status,
      automatic: Boolean(roundNumber && data?.tournament?.directorAutomation?.enabled && data?.tournament?.directorAutomation?.autoOpenRound),
      round: roundNumber,
    };
  }
  return null;
}

function matchLabel(match) {
  return `Match ${match.match || match.id}`;
}

function issue({ id, type, severity = "warning", title, message, impact = "Review this item to keep tournament operations current.", actionLabel, href, action = "" }) {
  return { id, type: type || id.split(":")[0], severity, title, message, impact, actionLabel, href, action };
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
    if (live && staleMinutes !== null && staleMinutes >= STALE_SCORE_MINUTES && Number(match.currentHole) < 18) issues.push(issue({ id: `stale:${match.id}`, title: matchLabel(match), message: `No score submitted for ${staleMinutes} minutes.`, impact: "The live match may no longer reflect play on the course.", actionLabel: "Open Match →", href }));
    if (live && Number(match.currentHole) >= 18) issues.push(issue({ id: `confirm:${match.id}`, title: matchLabel(match), message: "Awaiting final confirmation after Hole 18.", impact: "Standings cannot become official until the result is confirmed.", actionLabel: "Open Match →", href }));
    if (/^Reopened$/i.test(match.status)) issues.push(issue({ id: `reopened:${match.id}`, title: matchLabel(match), message: "Reopened but not finalized.", impact: "The corrected result remains unofficial.", actionLabel: "Review →", href: "/admin?tab=live-scoring" }));
    if (match.archiveFinal && /^(Live|Reopened)$/i.test(match.sourceStatus)) issues.push(issue({ id: `status:${match.id}`, severity: "critical", title: matchLabel(match), message: "Final archive conflicts with the Live match status.", impact: "Participant and administrative results may disagree.", actionLabel: "Review →", href: "/admin?tab=live-scoring" }));
    if (!match.team1Players?.length || !match.team2Players?.length) issues.push(issue({ id: `players:${match.id}`, title: matchLabel(match), message: "Players have not been assigned to both teams.", impact: "This match cannot be scored safely.", actionLabel: "Assign Players →", href: "/admin?tab=live-scoring" }));
    if (ids.length !== new Set(ids).size) issues.push(issue({ id: `teams:${match.id}`, severity: "critical", title: matchLabel(match), message: "A player is assigned more than once.", impact: "The pairing is invalid and scoring must not begin.", actionLabel: "Fix Assignment →", href: "/admin?tab=live-scoring" }));
    if (!match.teeTime) issues.push(issue({ id: `tee:${match.id}`, severity: "info", title: matchLabel(match), message: "Tee time is missing.", impact: "Automated opening and schedule timing cannot be calculated.", actionLabel: "Update Match →", href: "/admin?tab=live-scoring" }));
    const missingHandicap = players.some((player) => player.playingHcp === null || player.playingHcp === undefined);
    if (players.length && missingHandicap) issues.push(issue({ id: `hcp:${match.id}`, severity: "info", title: matchLabel(match), message: "One or more playing handicaps are missing.", impact: "Stroke allocation may be incomplete before scoring begins.", actionLabel: "Review Handicaps →", href: "/admin?tab=live-scoring" }));
    if (match.scoreConflict) issues.push(issue({ id: `conflict:${match.id}`, severity: "critical", title: matchLabel(match), message: "A score submission conflict requires review.", impact: "Competing score updates may affect the official result.", actionLabel: "Resolve →", href: "/admin?tab=live-scoring" }));
  }
  if (!automation.enabled) issues.push(issue({ id: "automation", severity: "info", title: "Tournament automation", message: "Automatic round opening and LIVE status are disabled.", impact: "The Director must operate round controls manually.", actionLabel: "Enable Automation →", action: "enable-automation" }));
  const openingRound = rounds.find((round) => round.status === "UPCOMING" && round.number === (nextEvent?.round || Number(data?.tournament?.currentRound)));
  if (openingRound && nextEvent?.minutes !== null && nextEvent?.minutes <= 30) issues.push(issue({ id: `round:${openingRound.number}`, severity: nextEvent.minutes < 0 ? "critical" : "info", title: openingRound.name, message: nextEvent.minutes < 0 ? "Round should already be open." : `${nextEvent.countdown}.`, impact: nextEvent.minutes < 0 ? "Scheduled matches remain unavailable for normal tournament operation." : "The round is ready for the Director or automation to open.", actionLabel: "Open Round →", action: "open-round", href: "#quick-actions" }));
  if (data?.diagnostics?.result === "error") issues.push(issue({ id: "sync", severity: "critical", title: "Data synchronization", message: "The latest tournament synchronization failed.", impact: "Director Mode may not reflect the current workbook state.", actionLabel: "Retry →", action: "retry" }));
  return issues;
}

function groupOperationalIssues(issues) {
  const severityRank = { critical: 0, warning: 1, info: 2 };
  const labels = {
    stale: "Scoring Updates", confirm: "Final Confirmation", reopened: "Reopened Matches", status: "Status Conflict",
    players: "Player Assignment", teams: "Invalid Team Assignment", tee: "Missing Tee Times", hcp: "Missing Handicaps",
    conflict: "Scoring Conflicts", automation: "Automation", round: "Round Opening", sync: "Synchronization",
  };
  const groups = new Map();
  for (const item of issues) {
    if (!groups.has(item.type)) groups.set(item.type, { type: item.type, severity: item.severity, items: [], actionLabel: item.actionLabel, href: item.href, action: item.action });
    const group = groups.get(item.type);
    group.items.push(item);
    if (item.severity === "critical") group.severity = "critical";
    else if (item.severity === "warning" && group.severity === "info") group.severity = "warning";
  }
  return [...groups.values()].map((group) => ({
    ...group,
    id: `group:${group.type}`,
    title: group.items.length > 1 ? labels[group.type] || group.items[0].title : group.items[0].title,
    message: group.items.length > 1 ? `${group.items.length} matches require review.` : group.items[0].message,
    impact: group.items.length > 1 ? group.items[0].impact : group.items[0].impact,
    actionLabel: group.items.length > 1 ? "Review All →" : group.actionLabel,
    href: group.items.length > 1 ? "/admin?tab=live-scoring" : group.href,
  })).sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

function adaptivePrimaryAction({ operatingRound, tournamentComplete }) {
  if (tournamentComplete) return { kind: "complete", label: "🏆 Tournament Complete", message: "All rounds are closed. No operational action is required." };
  if (!operatingRound) return { kind: "status", label: "Tournament schedule unavailable", message: "Review tournament configuration in Full Admin." };
  if (operatingRound.status === "UPCOMING") return { kind: "action", action: "open-round", label: `▶ Open ${operatingRound.name}`, message: `${operatingRound.format || "Round"} is the next operating round.` };
  if (operatingRound.total > 0 && operatingRound.final === operatingRound.total) return { kind: "action", action: "close-round", label: `🔒 Close ${operatingRound.name}`, message: "Every match is Final. Close the round to advance tournament operations." };
  if (operatingRound.upcoming > 0) return { kind: "action", action: "set-live", label: "🟢 Set All LIVE", message: `${operatingRound.upcoming} match${operatingRound.upcoming === 1 ? " is" : "es are"} ready to enter LIVE scoring.` };
  return { kind: "status", label: `${operatingRound.name} Currently LIVE`, message: `${operatingRound.live} live match${operatingRound.live === 1 ? "" : "es"}. No round action is required right now.` };
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
  const warnings = issues.filter((item) => item.severity === "warning").length;
  const tournamentComplete = /^(Final|Complete)$/i.test(clean(data?.tournament?.status)) || /^Final$/i.test(clean(data?.tournament?.currentRound));
  const healthStatus = tournamentComplete
    ? { level: "complete", label: "Tournament Complete", icon: "🏆", message: "All tournament rounds are closed." }
    : critical
    ? { level: "action", label: "Immediate Action Required", icon: "🔴", message: `${critical} critical tournament issue${critical === 1 ? "" : "s"} detected.` }
    : warnings
      ? { level: "attention", label: "Attention Required", icon: "🟡", message: `${warnings} operational item${warnings === 1 ? "" : "s"} need review.` }
      : { level: "healthy", label: "Tournament Healthy", icon: "🟢", message: "No action required." };
  const recentActivity = [...matches].filter((match) => match.updatedAt).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6).map((match) => ({ id: match.id, round: match.round, match: match.match, status: match.status, updatedAt: match.updatedAt, updatedBy: match.updatedBy }));
  const operatingRound = rounds.find((round) => Number(round.number) === Number(data?.tournament?.currentRound)) || rounds.find((round) => round.status !== "FINAL") || rounds[rounds.length - 1] || null;
  const primaryAction = adaptivePrimaryAction({ operatingRound, tournamentComplete });
  return {
    tournament: data?.tournament || {}, rounds, operatingRound, nextEvent, primaryAction, timelineAvailable: Boolean(data?.timeline?.available),
    health: { status: healthStatus, issueCount: issues.length, criticalCount: critical, live, upcoming, final, awaitingConfirmation, reopened, errors: issues.filter((item) => /^(players|teams|tee|hcp|conflict|status|sync):?/.test(item.id)).length, lastSynchronization: data?.tournament?.lastUpdated || recentActivity[0]?.updatedAt || now.toISOString() },
    issues, issueGroups: groupOperationalIssues(issues), automation,
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
