export const NOTIFICATION_CATEGORIES = [
  { id: "my-match", label: "My Match", description: "Scoring, updates, and finalization for your matches." },
  { id: "tee-times", label: "Tee Times", description: "Reminders before your scheduled tee times." },
  { id: "my-team", label: "My Team", description: "Meaningful lead changes and clinching updates." },
  { id: "tournament", label: "Tournament", description: "Round completion and major tournament developments." },
];

export function notificationEventKey(event = {}) {
  return [
    event.type,
    event.tournamentId,
    event.matchId,
    event.playerId,
    event.round,
    event.version || event.updatedAt,
  ].map((value) => String(value ?? "").trim()).join(":");
}

export function deduplicateNotificationEvents(events = []) {
  const seen = new Set();
  return events.filter((event) => {
    const key = notificationEventKey(event);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
