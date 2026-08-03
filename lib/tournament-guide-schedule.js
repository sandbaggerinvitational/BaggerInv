import { timelineEventIcon, tournamentDateTime, tournamentDayKey } from "./tournament-timeline.js";

const clean = (value) => String(value ?? "").trim();
const roundNumber = (value) => {
  const parsed = Number(clean(value).match(/\d+/)?.[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function roundState(round) {
  const status = clean(round?.status).toLowerCase();
  if (["final", "complete", "completed"].includes(status)) return "Final";
  if (["live", "open", "opened", "active", "in progress", "in-progress"].includes(status)) return "Live";
  return "Upcoming";
}

function itineraryStatus(event, { now, timeZone, round, nextStart, tournamentStatus }) {
  if (event.roundNumber) return roundState(round);
  if (!event.start) return "Upcoming";
  if (now < event.start) return "Upcoming";
  if (event.end && now >= event.end) return "Completed";
  if (!event.end && nextStart && now >= nextStart) return "Completed";
  if (tournamentDayKey(now, timeZone) > event.date) return "Completed";
  if (/^(final|complete|completed)$/i.test(clean(tournamentStatus))) return "Completed";
  return "Live";
}

function eventDate(record) {
  const raw = clean(record["Event Date"]);
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

export function itineraryViewModel({ records = [], tournament = {}, rounds = [], courses = [], now = new Date() } = {}) {
  const timeZone = tournament.timeZone || "America/Chicago";
  const base = records.map((record, index) => {
    const date = eventDate(record);
    const startTime = clean(record["Start Time"]);
    const endTime = clean(record["End Time"]);
    const number = roundNumber(record["Round ID"] || record.Title || record.Subtitle);
    const round = number ? rounds.find((item) => Number(item.number) === number) : null;
    const course = courses.find((item) =>
      (clean(record["Course ID"]) && clean(item["Course ID"]) === clean(record["Course ID"])) ||
      (number && roundNumber(item.Round) === number)
    ) || null;
    const location = clean(course?.Course || record.Location);
    return {
      id: clean(record["Event ID"]) || `${date}:${startTime}:${index}`,
      date,
      dateLabel: date ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "",
      day: clean(record["Day Label"]) || date || "Tournament Day",
      startTime,
      endTime,
      timeLabel: [startTime, endTime].filter(Boolean).join(" – ") || date,
      start: tournamentDateTime(date, startTime, timeZone),
      end: tournamentDateTime(date, endTime, timeZone),
      type: clean(record["Event Type"]) || "Tournament",
      icon: timelineEventIcon(record["Event Type"]),
      title: clean(record.Title),
      subtitle: clean(record.Subtitle),
      location,
      details: clean(record.Details),
      roundNumber: number,
      round,
      course,
      courseHref: clean(course?.["Course ID"]) ? `/courses/${encodeURIComponent(clean(course["Course ID"]))}` : "",
      mapHref: clean(course?.["GPS Link"]) || (location ? `https://maps.apple.com/?q=${encodeURIComponent(location)}` : ""),
      format: clean(round?.format || course?.Format),
      tee: clean(course?.["Tee Played"]),
      order: Number(record["Display Order"]) || index,
    };
  }).sort((left, right) =>
    (left.start?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.start?.getTime() ?? Number.MAX_SAFE_INTEGER) || left.order - right.order
  );

  const events = base.map((event, index) => ({
    ...event,
    status: itineraryStatus(event, {
      now,
      timeZone,
      round: event.round,
      nextStart: base.slice(index + 1).find((item) => item.start)?.start,
      tournamentStatus: tournament.status,
    }),
  }));
  const current = events.find((event) => event.status === "Live") || null;
  const upcoming = events.find((event) => event.status === "Upcoming") || null;
  const focus = current || upcoming;
  return {
    events: events.map((event) => ({ ...event, emphasized: event.id === focus?.id })),
    focus,
    complete: !focus,
    timeZone,
  };
}

export function itineraryGroups(events = []) {
  return events.reduce((groups, event) => {
    if (!groups.has(event.day)) groups.set(event.day, []);
    groups.get(event.day).push(event);
    return groups;
  }, new Map());
}
