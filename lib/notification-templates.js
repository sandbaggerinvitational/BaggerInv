export const NOTIFICATION_TITLE = "Tournament Update";

export const PREVIEW_NOTIFICATION_CONTEXT = Object.freeze({
  year: 2026, round: 3, match: 5, format: "Singles", teeTime: "10:50 AM", tee: "Gold", course: "The Ocean Course",
  player: "Clay Beltran", opponent: "Patrick Noonan", opponentTeam: "Lipp It and Rip It",
  finalizedBy: "Patrick Noonan", reopenedBy: "Clay Beltran", result: "3&2",
  event: "Championship Dinner", eventIcon: "🍽️", eventLead: "30 minutes", location: "The Ocean Room",
  team: "The Pickles", otherTeam: "Lipp It and Rip It", teamOnePoints: "22.5", teamTwoPoints: "13.5",
  skins: 3, winnings: "$300", matchId: "2026-R3-5",
});

const lines = (...values) => values.filter((value) => String(value || "").trim()).join("\n");
const roundFormat = (c) => `Round ${c.round} • ${c.format}`;
const teeDetails = (c) => [c.teeTime, c.tee ? `${c.tee} Tees` : ""].filter(Boolean).join(" • ");
const scoringActor = (c, field) => c.format === "Singles" ? c[field] : c.team;
const officialScorecardUrl = (c) => `/game-center/${encodeURIComponent(c.matchId || `${c.year}-R${c.round}-${c.match}`)}?from=my-match#scorecard`;

const definitions = [
  { id: "test", title: () => "🏌️ Test Notification", body: () => "Notifications are configured successfully.", url: () => "/admin/director" },
  { id: "tee-time-reminder", title: () => "⛳ Tee Time Reminder", body: (c) => lines(roundFormat(c), teeDetails(c), c.course), url: () => "/my-match" },
  { id: "match-ready", title: () => "⛳ Your Match Is Ready", body: (c) => lines(roundFormat(c), `vs ${c.opponent}`, "Tap to begin scoring."), url: () => "/my-match" },
  { id: "match-finalized", title: () => "✅ Match Finalized", body: (c) => lines(roundFormat(c), `Finalized by ${scoringActor(c, "finalizedBy")}.`, "Tap to view the official scorecard."), url: officialScorecardUrl },
  { id: "match-reopened", title: () => "🔄 Match Reopened", body: (c) => lines(roundFormat(c), `Reopened by ${scoringActor(c, "reopenedBy")}.`, "Tap to resume scoring."), url: () => "/my-match" },
  { id: "singles-pairing", title: () => "👤 Singles Pairing Released", body: (c) => lines(roundFormat(c), `vs ${c.opponent}`, teeDetails(c), c.course), url: () => "/my-match" },
  { id: "timeline-event", title: (c) => `${c.eventIcon || "📅"} ${c.event}`, body: (c) => lines(`Begins in ${c.eventLead}`, c.location), url: () => "/home" },
  { id: "round-started", title: (c) => `🔴 Round ${c.round} Is LIVE`, body: () => lines("Every match is underway.", "Tap to follow the action live."), url: () => "/live" },
  { id: "round-clinched", title: (c) => `🏆 Round ${c.round} Clinched`, body: (c) => lines(`${c.team} won ${roundFormat(c)}`, `${c.teamOnePoints}–${c.teamTwoPoints}.`, "Tap to view updated standings."), url: () => "/live" },
  { id: "round-tied", title: (c) => `🤝 Round ${c.round} Ends in a Tie`, body: (c) => lines(`${c.team} and ${c.otherTeam}`, "finished tied.", "Tap to view updated standings."), url: () => "/live" },
  { id: "championship-singles-live", title: () => "🏆 Championship Singles LIVE", body: () => lines("Championship Saturday has arrived.", "Every point matters.", "Tap to follow the action live."), url: () => "/live" },
  { id: "tournament-champions", title: () => "🏆 Champions Crowned", body: (c) => lines("Congratulations to", `${c.team},`, `${c.year} Sandbagger Invitational Champions!`), url: () => "/live" },
  { id: "net-skins-results", title: (c) => `💰 Round ${c.round} Net Skins Final`, body: (c) => Number(c.skins) > 0 ? lines(`You won ${c.skins} ${Number(c.skins) === 1 ? "skin" : "skins"} • ${c.winnings}`, "Tap to view standings and payouts.") : lines(`Round ${c.round} Net Skins are official.`, "Tap to view standings and payouts."), url: () => "/live?view=leaderboards&tab=net-skins" },
  { id: "tournament-complete", title: () => "🏁 Tournament Complete", body: () => lines("Another Sandbagger Invitational", "is in the books.", "Tap to view the final results."), url: () => "/live" },
];

export function notificationTemplate(id, context = {}) {
  const selected = definitions.find((item) => item.id === id) || definitions[0];
  const values = { ...PREVIEW_NOTIFICATION_CONTEXT, ...context };
  const title = selected.title(values);
  return { id: selected.id, label: title, title, body: selected.body(values), url: selected.url(values) };
}

export function notificationTemplateOptions(context = {}) {
  return definitions.map(({ id }) => ({ id, label: notificationTemplate(id, context).title }));
}

export const NOTIFICATION_TEMPLATE_OPTIONS = notificationTemplateOptions();

export function notificationPreviewContextForPlayer(data = {}, player = {}) {
  const matches = (data.rounds || []).flatMap((round) => round.matches || []);
  const playerMatch = matches
    .filter((match) => [...(match.team1Players || []), ...(match.team2Players || [])].some((item) => item.id === player.id))
    .sort((left, right) => (left.status === "Final") - (right.status === "Final") || Number(left.round) - Number(right.round) || Number(left.match) - Number(right.match))[0];
  if (!playerMatch) return { year: data.tournament?.year, player: player.name };
  const onTeamOne = (playerMatch.team1Players || []).some((item) => item.id === player.id);
  const opponents = onTeamOne ? playerMatch.team2Players : playerMatch.team1Players;
  const team = onTeamOne ? data.tournament?.teamOne : data.tournament?.teamTwo;
  const opponentTeam = onTeamOne ? data.tournament?.teamTwo : data.tournament?.teamOne;
  const roundMatches = matches.filter((match) => Number(match.round) === Number(playerMatch.round) && match.status === "Final");
  const teamOnePoints = roundMatches.reduce((total, match) => total + Number(match.team1Points || 0), 0);
  const teamTwoPoints = roundMatches.reduce((total, match) => total + Number(match.team2Points || 0), 0);
  return {
    year: data.tournament?.year,
    round: playerMatch.round,
    match: playerMatch.match,
    matchId: playerMatch.id,
    format: playerMatch.formatName || playerMatch.format,
    teeTime: playerMatch.teeTime,
    tee: playerMatch.tee || playerMatch.course?.tee,
    course: playerMatch.course?.name,
    player: player.name,
    opponent: (opponents || []).map((item) => item.name).join(" & "),
    opponentTeam: opponentTeam?.name,
    team: team?.name,
    otherTeam: opponentTeam?.name,
    finalizedBy: playerMatch.finalizedBy || playerMatch.updatedBy,
    reopenedBy: playerMatch.updatedBy,
    result: playerMatch.finalResult || "Final",
    teamOnePoints: teamOnePoints.toFixed(1),
    teamTwoPoints: teamTwoPoints.toFixed(1),
  };
}

export const previewNotificationTemplate = notificationTemplate;
