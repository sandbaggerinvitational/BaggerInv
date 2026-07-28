const clean = (value) => String(value ?? "").trim();

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
  const nextIndex = events.findIndex(
    (event) => minutesFromTime(event.endTime || event.startTime) >= currentMinutes
  );
  return events.map((event, index) => ({
    ...event,
    state: index < nextIndex || (nextIndex === -1 && events.length) ? "complete"
      : index === nextIndex ? "next" : "upcoming",
  }));
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
