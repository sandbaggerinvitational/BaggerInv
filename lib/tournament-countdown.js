const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const clean = (value) => String(value ?? "").trim();

function dateParts(value, fallbackDates, fallbackYear) {
  const source = clean(value);
  let match = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  match = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return { year: Number(match[3]), month: Number(match[1]), day: Number(match[2]) };

  const label = source || clean(fallbackDates);
  match = label.match(new RegExp(`(${Object.keys(MONTHS).join("|")})\\s+(\\d{1,2}).*?(\\d{4})`, "i"));
  if (match) return {
    year: Number(match[3]),
    month: MONTHS[match[1].toLowerCase()],
    day: Number(match[2]),
  };
  match = label.match(new RegExp(`(${Object.keys(MONTHS).join("|")})\\s+(\\d{1,2})`, "i"));
  if (match && Number(fallbackYear)) return {
    year: Number(fallbackYear),
    month: MONTHS[match[1].toLowerCase()],
    day: Number(match[2]),
  };
  return null;
}

function timeParts(value) {
  const source = clean(value);
  if (!source) return { hour: 0, minute: 0, second: 0 };
  const match = source.match(/(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return { hour: 0, minute: 0, second: 0 };
  let hour = Number(match[1]);
  const period = clean(match[4]).toUpperCase();
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return { hour, minute: Number(match[2]) || 0, second: Number(match[3]) || 0 };
}

function zonedTimestamp(parts, timeZone) {
  const desired = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second
  );
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
    const displayed = Object.fromEntries(
      formatter.formatToParts(new Date(desired))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );
    const offset = Date.UTC(
      displayed.year, displayed.month - 1, displayed.day,
      displayed.hour, displayed.minute, displayed.second
    ) - desired;
    return desired - offset;
  } catch {
    return desired;
  }
}

export function tournamentStartTimestamp({
  startDate,
  startTime,
  dates,
  year,
  timeZone = "America/Chicago",
} = {}) {
  const date = dateParts(startDate, dates, year);
  if (!date) return null;
  return zonedTimestamp({ ...date, ...timeParts(startTime) }, timeZone);
}

export function countdownParts(target, now = Date.now()) {
  const remaining = Math.max(0, Number(target) - Number(now));
  return {
    total: remaining,
    days: Math.floor(remaining / 86_400_000),
    hours: Math.floor((remaining % 86_400_000) / 3_600_000),
    minutes: Math.floor((remaining % 3_600_000) / 60_000),
    seconds: Math.floor((remaining % 60_000) / 1000),
  };
}
