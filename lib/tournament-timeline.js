const clean = (value) => String(value ?? "").trim();

export const TOURNAMENT_TIMELINE_SHEET = "Tournament Timeline";
export const TOURNAMENT_TIMELINE_HEADERS = [
  "Year", "Tournament Day", "Event Date", "Start Time", "End Time", "Event Type",
  "Title", "Subtitle", "Location", "Display on Home", "Notification Minutes",
  "Sort Order", "Status Override",
];

const REQUIRED_HEADERS = ["Year", "Event Date", "Start Time", "Title"];
const STATUSES = new Map([
  ["upcoming", "Upcoming"], ["live", "Live"], ["completed", "Completed"],
  ["complete", "Completed"], ["delayed", "Delayed"], ["cancelled", "Cancelled"],
  ["canceled", "Cancelled"],
]);

function truthy(value) {
  return ["true", "yes", "1"].includes(clean(value).toLowerCase());
}

function numeric(value, fallback = null) {
  if (clean(value) === "") return fallback;
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateKey(value) {
  const source = clean(value);
  const direct = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = Date.parse(source);
  if (!Number.isFinite(parsed)) return "";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(new Date(parsed));
}

function clockParts(value) {
  const source = clean(value);
  const match = source.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = clean(match[3]).toUpperCase();
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

export function tournamentDayKey(date = new Date(), timeZone = "America/Chicago") {
  try {
    const parts = zonedParts(date, timeZone);
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function tournamentDateTime(dateValue, timeValue, timeZone = "America/Chicago") {
  const key = dateKey(dateValue);
  const clock = clockParts(timeValue);
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !clock) return null;
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), clock.hour, clock.minute);
  try {
    let result = new Date(desired);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const observed = zonedParts(result, timeZone);
      const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second || 0);
      result = new Date(result.getTime() + desired - observedUtc);
    }
    return result;
  } catch {
    return new Date(desired);
  }
}

export function timelineEventStatus(event, { now = new Date(), tournamentStatus = "Upcoming", timeZone = "America/Chicago" } = {}) {
  const override = STATUSES.get(clean(event.statusOverride).toLowerCase());
  if (override) return override;
  const start = tournamentDateTime(event.date, event.startTime, timeZone);
  const end = tournamentDateTime(event.date, event.endTime || event.startTime, timeZone);
  if (!start) return "Upcoming";
  if (now < start) return "Upcoming";
  if (end && now > end) return "Completed";
  if (/^(Final|Complete|Completed)$/i.test(clean(tournamentStatus)) && !end) return "Completed";
  return "Live";
}

function rowsFromValues(values) {
  if (!Array.isArray(values) || !values.length) return { headers: [], rows: [] };
  const headers = (values[0] || []).map(clean);
  return {
    headers,
    rows: values.slice(1).filter((row) => (row || []).some((value) => clean(value))).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, clean(row?.[index])]))
    ),
  };
}

export function normalizeTournamentTimeline({ values, rows, activeYear, tournamentStatus, timeZone, sheetState, now = new Date() } = {}) {
  const parsed = values ? rowsFromValues(values) : { headers: rows?.length ? TOURNAMENT_TIMELINE_HEADERS : [], rows: rows || [] };
  const state = sheetState || (!parsed.headers.length && !parsed.rows.length ? "missing" : parsed.rows.length ? "ready" : "empty");
  if (state === "missing") return { available: false, events: [], notificationEvents: [], diagnostic: "Tournament Timeline sheet missing" };
  if (state === "empty") return { available: false, events: [], notificationEvents: [], diagnostic: "Tournament Timeline contains no usable events" };
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !parsed.headers.includes(header));
  if (missingHeaders.length) return { available: false, events: [], notificationEvents: [], diagnostic: `Tournament Timeline headers invalid: missing ${missingHeaders.join(", ")}` };
  const events = parsed.rows.map((row, index) => {
    const year = numeric(row.Year);
    const date = dateKey(row["Event Date"]);
    const startTime = clean(row["Start Time"]);
    const title = clean(row.Title);
    if (year !== Number(activeYear) || !date || !clockParts(startTime) || !title) return null;
    const event = {
      id: `${year}:${date}:${startTime}:${clean(row["Sort Order"]) || index}:${title}`,
      year, tournamentDay: clean(row["Tournament Day"]), date, startTime,
      endTime: clean(row["End Time"]), type: clean(row["Event Type"]) || "Tournament",
      title, subtitle: clean(row.Subtitle), location: clean(row.Location),
      displayOnHome: truthy(row["Display on Home"]),
      notificationMinutes: numeric(row["Notification Minutes"]),
      order: numeric(row["Sort Order"], 9999), statusOverride: clean(row["Status Override"]),
    };
    return { ...event, status: timelineEventStatus(event, { now, tournamentStatus, timeZone }) };
  }).filter(Boolean).sort((left, right) =>
    left.date.localeCompare(right.date) ||
    (clockParts(left.startTime).hour * 60 + clockParts(left.startTime).minute) - (clockParts(right.startTime).hour * 60 + clockParts(right.startTime).minute) ||
    left.order - right.order
  );
  if (!events.length) return { available: false, events: [], notificationEvents: [], diagnostic: "Tournament Timeline contains no usable events" };
  return { available: true, events, notificationEvents: events.filter((event) => event.notificationMinutes !== null), diagnostic: "" };
}
