export const NOTIFICATION_TITLE = "The Bagger";

export const PREVIEW_NOTIFICATION_CONTEXT = Object.freeze({
  year: 2026, round: 2, match: 5, teeTime: "7:50 AM", course: "Turtle Point",
  player: "Clay Beltran", opponent: "Jason Powell", opponentTeam: "The Pickles",
  result: "3&2", event: "Champions Dinner", eventLead: "30 minutes", location: "The Ocean Room",
  team: "The Pickles", teamOnePoints: "3.0", teamTwoPoints: "3.0", skins: 3, winnings: "$300",
});

const definitions = [
  { id: "test", label: "Test Notification", body: () => "Notifications are configured successfully.", url: () => "/admin/director" },
  { id: "tee-time-reminder", label: "Tee Time Reminder", body: (c) => `⛳ Round ${c.round} tee time: ${c.teeTime} at ${c.course}. Match ${c.match}.`, url: () => "/my-match" },
  { id: "match-ready", label: "Match Ready", body: (c) => `🏌️ Round ${c.round} Match ${c.match} is ready. Open your scorecard to begin.`, url: () => "/my-match" },
  { id: "match-finalized", label: "Match Finalized", body: (c) => `✅ Match ${c.match} is final: ${c.team} won ${c.result}.`, url: (c) => `/game-center/${c.year}-R${c.round}-${c.match}?from=my-match` },
  { id: "match-reopened", label: "Match Reopened", body: (c) => `↩️ Match ${c.match} was reopened for scoring review.`, url: () => "/my-match" },
  { id: "singles-pairing", label: "Singles Pairing", body: (c) => `⚔️ Singles pairing: ${c.player} vs. ${c.opponent}. ${c.teeTime}.`, url: () => "/my-match" },
  { id: "timeline-event", label: "Tournament Timeline Event", body: (c) => `🍽️ ${c.event} begins in ${c.eventLead}${c.location ? ` at ${c.location}` : ""}.`, url: () => "/home" },
  { id: "round-started", label: "Round Started", body: (c) => `🔴 Round ${c.round} is LIVE. Follow every match in Game Center.`, url: () => "/live" },
  { id: "round-clinched", label: "Round Clinched", body: (c) => `🏆 ${c.team} clinched Round ${c.round}.`, url: () => "/live" },
  { id: "round-tied", label: "Round Tied", body: (c) => `🤝 Round ${c.round} ends tied, ${c.teamOnePoints}–${c.teamTwoPoints}.`, url: () => "/live" },
  { id: "championship-singles-live", label: "Championship Singles LIVE", body: () => "🔥 Championship Singles is LIVE. The tournament is on the line.", url: () => "/live" },
  { id: "tournament-champions", label: "Tournament Champions", body: (c) => `🏆 ${c.team} are the ${c.year} Sandbagger Invitational champions.`, url: () => "/home" },
  { id: "net-skins-results", label: "Net Skins Round Results", body: (c) => `💰 Round ${c.round} Net Skins are final. ${c.player} leads with ${c.skins} skins and ${c.winnings}.`, url: () => "/live?view=leaderboards&tab=net-skins" },
  { id: "tournament-complete", label: "Tournament Complete", body: (c) => `🎉 The ${c.year} Sandbagger Invitational is complete. View final results.`, url: () => "/home" },
];

export const NOTIFICATION_TEMPLATE_OPTIONS = definitions.map(({ id, label }) => ({ id, label }));

export function notificationTemplate(id, context = {}) {
  const selected = definitions.find((item) => item.id === id) || definitions[0];
  const values = { ...PREVIEW_NOTIFICATION_CONTEXT, ...context };
  return { id: selected.id, label: selected.label, title: NOTIFICATION_TITLE, body: selected.body(values), url: selected.url(values) };
}

export const previewNotificationTemplate = notificationTemplate;
