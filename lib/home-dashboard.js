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

function zonedNow(now, timeZone) {
  if (!timeZone) {
    return {
      key: dateKey(now),
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
  try {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now).map((part) => [part.type, part.value])
    );
    return {
      key: `${values.year}-${values.month}-${values.day}`,
      minutes: Number(values.hour) * 60 + Number(values.minute),
    };
  } catch {
    return {
      key: dateKey(now),
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
}

export function todaysSchedule(schedule = [], {
  now = new Date(),
  timeZone,
} = {}) {
  const current = zonedNow(now, timeZone);
  const today = current.key;
  const currentMinutes = current.minutes;
  const events = schedule
    .filter((event) => dateKey(event.date) === today)
    .sort((a, b) => {
      const order = Number(a.order ?? 9999) - Number(b.order ?? 9999);
      return minutesFromTime(a.startTime) - minutesFromTime(b.startTime) || order;
    });
  const normalized = events.map((event) => {
    const supplied = clean(event.status).toLowerCase();
    const hasAuthoritativeState = Boolean(clean(event.statusOverride)) || event.roundStatusDerived;
    const start = minutesFromTime(event.startTime);
    const end = minutesFromTime(event.endTime || event.startTime);
    const state = hasAuthoritativeState ? (supplied === "completed" ? "complete" : supplied)
      : currentMinutes > end ? "complete" : currentMinutes >= start && currentMinutes <= end ? "live" : "upcoming";
    return { ...event, state, startMinutes: start };
  });
  const nextId = normalized.find((event) => event.state === "upcoming" && event.startMinutes > currentMinutes)?.id;
  return normalized.map(({ startMinutes, ...event }) => {
    const minutesUntil = Math.max(0, startMinutes - currentMinutes);
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
  const current = zonedNow(now, timeZone);
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
    .filter((event) => event.dateKey && event.dateKey > current.key)
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
      dayLabel: dayDifference === 1 ? "Tomorrow" : nextFutureEvent.dateKey,
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
  now = new Date(),
} = {}) {
  const source = clean(startDate);
  const dateOnly = source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const start = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(Date.parse(source));
  if (Number.isFinite(start.getTime())) {
    start.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const day = Math.floor((today - start) / 86400000) + 1;
    if (day >= 1 && (!roundCount || day <= Number(roundCount))) {
      return `Day ${day}${roundCount ? ` of ${roundCount}` : ""}`;
    }
  }
  return currentRound ? `Round ${currentRound}` : "Tournament Live";
}
