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
  const googleDate = raw.match(/Date\((\d+),(\d+),(\d+)/);
  if (googleDate) return `${googleDate[1]}-${String(Number(googleDate[2]) + 1).padStart(2, "0")}-${String(googleDate[3]).padStart(2, "0")}`;
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

function eventDay(record, date) {
  const label = clean(record["Day Label"]);
  const named = label.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i)?.[1];
  if (named) return named[0].toUpperCase() + named.slice(1).toLowerCase();
  return date ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : label || "Tournament Day";
}

function eventDateLabel(record, date) {
  const label = clean(record["Day Label"]);
  const namedDate = label.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (namedDate) return `${namedDate[1]} ${Number(namedDate[2])}`;
  return date ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "";
}

export function itineraryViewModel({ records = [], tournament = {}, rounds = [], courses = [], now = new Date() } = {}) {
  const timeZone = tournament.timeZone || "America/Chicago";
  const today = tournamentDayKey(now, timeZone);
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
      dateLabel: eventDateLabel(record, date),
      day: eventDay(record, date),
      dayHeading: eventDay(record, date),
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
      format: clean(round?.format || course?.Format),
      tee: clean(course?.["Tee Played"]),
      order: Number(record["Display Order"]) || index,
      isToday: date === today,
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

export function structureItineraryDetails(value) {
  const sections = new Map();
  const add = (label, sentence) => {
    if (!sections.has(label)) sections.set(label, []);
    sections.get(label).push(sentence);
  };
  clean(value).split(/\n\s*\n/).flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/)).map(clean).filter(Boolean).forEach((sentence) => {
    if (/\bnet skins?\b/i.test(sentence)) add("Net Skins", sentence);
    else if (/\bhandicap|allocation|net to\b/i.test(sentence)) add("Handicap", sentence);
    else if (/\bcadd(?:y|ie|ies)\b/i.test(sentence)) add("Caddies", sentence);
    else if (/\btee(?:s| box| information)?\b/i.test(sentence)) add("Tee Information", sentence);
    else if (/\bdress|attire|casual\b/i.test(sentence)) add("Dress Code", sentence);
    else if (/\bscoring|point|match play\b/i.test(sentence)) add("Scoring", sentence);
    else add("Additional Details", sentence);
  });
  return [...sections].map(([label, sentences]) => ({ label, text: sentences.join(" ") }));
}

export function itineraryGroups(events = []) {
  return events.reduce((groups, event) => {
    if (!groups.has(event.day)) groups.set(event.day, []);
    groups.get(event.day).push(event);
    return groups;
  }, new Map());
}
