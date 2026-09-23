import { tournamentDateTime, tournamentDayKey, tournamentLocalClock } from "./tournament-timeline.js";

const clean = (value) => String(value ?? "").trim();

export function tournamentStatusLabel(value) {
  const status = clean(value).toUpperCase();
  if (["FINAL", "COMPLETE", "COMPLETED"].includes(status)) return "Final";
  if (["LIVE", "IN PROGRESS", "IN-PROGRESS"].includes(status)) return "Live";
  return "Upcoming";
}

function dateKey(value) {
  const source = clean(value);
  if (!source) return "";
  const direct = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = Date.parse(source);
  if (!Number.isFinite(parsed)) return "";
  const date = new Date(parsed);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function minutesFromTime(value) {
  const source = clean(value);
  const match = source.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return Number.POSITIVE_INFINITY;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = clean(match[3]).toUpperCase();
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function scheduledDisplayTime(scheduledAt, timeZone) {
  const parsed = new Date(scheduledAt);
  if (!scheduledAt || !Number.isFinite(parsed.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(parsed);
  } catch {
    return "";
  }
}

export function formatHomeTime(value, {
  scheduledAt,
  timeZone,
} = {}) {
  const source = clean(value);
  if (!source) return "";
  const match = source.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return source;

  const rawHours = Number(match[1]);
  const minutes = match[2];
  const suppliedPeriod = clean(match[3]).toUpperCase();
  if (suppliedPeriod) {
    const hours = rawHours === 0 ? 12 : rawHours > 12 ? rawHours - 12 : rawHours;
    return `${hours}:${minutes} ${suppliedPeriod}`;
  }

  const scheduled = scheduledDisplayTime(scheduledAt, timeZone);
  if (scheduled && rawHours >= 1 && rawHours <= 12) return scheduled;

  const normalizedHours = ((rawHours % 24) + 24) % 24;
  const period = normalizedHours >= 12 ? "PM" : "AM";
  const hours = normalizedHours % 12 || 12;
  return `${hours}:${minutes} ${period}`;
}

export function formatHomeDateLabel(value) {
  const key = dateKey(value);
  if (!key) return clean(value);
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (!Number.isFinite(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date).replace(",", " ·").toUpperCase();
}


export function todaysSchedule(schedule = [], {
  now = new Date(),
  timeZone,
} = {}) {
  const current = tournamentLocalClock(now, timeZone);
  const today = current.key;
  const events = schedule
    .filter((event) => dateKey(event.date) === today)
    .sort((a, b) => {
      const order = Number(a.order ?? 9999) - Number(b.order ?? 9999);
      return minutesFromTime(a.startTime) - minutesFromTime(b.startTime) || order;
    });
  const normalized = events.map((event) => {
    const supplied = clean(event.status).toLowerCase();
    const hasAuthoritativeState = Boolean(clean(event.statusOverride)) || event.roundStatusDerived;
    const start = tournamentDateTime(event.date, event.startTime, timeZone)?.getTime() ?? Infinity;
    const end = tournamentDateTime(event.date, event.endTime || event.startTime, timeZone)?.getTime() ?? Infinity;
    const state = hasAuthoritativeState ? (supplied === "completed" ? "complete" : supplied)
      : now.getTime() > end ? "complete" : now.getTime() >= start && now.getTime() <= end ? "live" : "upcoming";
    return { ...event, state, startInstant: start };
  });
  // A canonical Upcoming round remains next even after its scheduled start.
  // Only lifecycle authority may move it to Live/Final; no invented delay state.
  const nextId = normalized.find((event) => event.state === "upcoming")?.id;
  return normalized.map(({ startInstant, ...event }) => {
    const minutesUntil = Math.max(0, Math.ceil((startInstant - now.getTime()) / 60000));
    return {
      ...event,
      startTime: formatHomeTime(event.startTime),
      endTime: formatHomeTime(event.endTime),
      isNext: event.id === nextId,
      minutesUntil,
      countdown: minutesUntil < 60
        ? `Starts in ${minutesUntil} min`
        : `Starts in ${Math.floor(minutesUntil / 60)} hr${minutesUntil % 60 ? ` ${minutesUntil % 60} min` : ""}`,
    };
  });
}

export function homeSchedulePreview(schedule = [], {
  now = new Date(),
  timeZone,
} = {}) {
  const current = tournamentLocalClock(now, timeZone);
  const todayItems = todaysSchedule(schedule, { now, timeZone });
  const currentItem = todayItems.find((event) => event.state === "live")
    || todayItems.find((event) => event.isNext)
    || todayItems.find((event) => event.state === "upcoming");

  if (currentItem) {
    return {
      kind: "event",
      eyebrow: currentItem.state === "live" ? "Happening now" : "Next up",
      dayLabel: "Today",
      event: currentItem,
    };
  }

  const nextFutureEvent = schedule
    .map((event) => ({ ...event, dateKey: dateKey(event.date) }))
    .filter((event) => event.dateKey && event.dateKey > current.key
      && !/^(completed|complete|final|cancelled)$/i.test(clean(event.status)))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey)
      || minutesFromTime(a.startTime) - minutesFromTime(b.startTime)
      || Number(a.order ?? 9999) - Number(b.order ?? 9999))[0];

  if (nextFutureEvent) {
    const [currentYear, currentMonth, currentDay] = current.key.split("-").map(Number);
    const [eventYear, eventMonth, eventDay] = nextFutureEvent.dateKey.split("-").map(Number);
    const dayDifference = Math.round((Date.UTC(eventYear, eventMonth - 1, eventDay)
      - Date.UTC(currentYear, currentMonth - 1, currentDay)) / 86400000);
    return {
      kind: "event",
      eyebrow: "Coming up",
      dayLabel: dayDifference === 1 ? "Tomorrow" : formatHomeDateLabel(nextFutureEvent.dateKey),
      event: {
        ...nextFutureEvent,
        startTime: formatHomeTime(nextFutureEvent.startTime),
        endTime: formatHomeTime(nextFutureEvent.endTime),
        state: "upcoming",
        isNext: true,
      },
    };
  }

  return {
    kind: "empty",
    eyebrow: "Today",
    title: todayItems.length ? "No more events scheduled today." : "No events scheduled today.",
  };
}

export function compactTournamentLeaders(leaderboard = [], limit = 3) {
  return leaderboard
    .filter((entry) => Number(entry.matchesPlayed) > 0)
    .sort((a, b) =>
      Number(b.points || 0) - Number(a.points || 0) ||
      Number(b.wins || 0) - Number(a.wins || 0) ||
      Number(a.losses || 0) - Number(b.losses || 0) ||
      clean(a.player).localeCompare(clean(b.player))
    )
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function tournamentDayLabel({
  startDate,
  roundCount,
  currentRound,
  timeZone,
  now = new Date(),
} = {}) {
  const key = dateKey(startDate);
  const currentKey = tournamentDayKey(now, timeZone);
  if (key && currentKey) {
    // Ordinals compare calendar dates, not elapsed 24-hour periods across DST.
    const ordinal = (value) => Date.UTC(...value.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
    const day = Math.round((ordinal(currentKey) - ordinal(key)) / 86400000) + 1;
    if (day >= 1 && (!roundCount || day <= Number(roundCount))) {
      return `Day ${day}${roundCount ? ` of ${roundCount}` : ""}`;
    }
  }
  return currentRound ? `Round ${currentRound}` : "Tournament Live";
}
