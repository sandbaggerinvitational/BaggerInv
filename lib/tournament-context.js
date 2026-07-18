import { formatCode, pick } from "./prediction-engine";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = null) => {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeText = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const same = (a, b) => normalizeText(a) === normalizeText(b);

// Course IDs sometimes differ only by punctuation or zero-padding between tabs
// (for example OCGC01 vs OCGC1). Treat those as the same course.
const normalizeCourseId = (value) => {
  const compact = clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^([A-Z]+)0*(\d+)$/);
  return match ? `${match[1]}${Number(match[2])}` : compact;
};

function courseRowMatches(row, course) {
  const wantedId = normalizeCourseId(pick(course, "Course ID"));
  const rowId = normalizeCourseId(pick(row, "Course ID"));
  if (wantedId && rowId && wantedId === rowId) return true;

  const wantedName = pick(course, "Course Name", "Course");
  const rowName = pick(row, "Course Name", "Course");
  return Boolean(wantedName && rowName && same(wantedName, rowName));
}

export function currentTournamentYear(sheets) {
  const liveYears = (sheets.liveTournaments || [])
    .map((row) => number(pick(row, "Year")))
    .filter(Number.isFinite);
  if (liveYears.length) return Math.max(...liveYears);

  const handicapYears = (sheets.handicaps || [])
    .map((row) => number(pick(row, "Year")))
    .filter(Number.isFinite);
  return handicapYears.length ? Math.max(...handicapYears) : new Date().getFullYear();
}

export function getFormatCourse(sheets, year, format) {
  const code = formatCode(format);
  const courses = (sheets.courses || []).filter(
    (row) => number(pick(row, "Year")) === year
  );

  return courses.find((row) => formatCode(pick(row, "Format")) === code) || {};
}

export function getTeamContext(sheets, year) {
  const playerMap = Object.fromEntries(
    (sheets.players || []).map((row) => [
      clean(pick(row, "Player ID", "ID")),
      {
        id: clean(pick(row, "Player ID", "ID")),
        name:
          clean(pick(row, "Display Name", "Player Name", "Name")) ||
          `${clean(pick(row, "First", "First Name"))} ${clean(
            pick(row, "Last", "Last Name")
          )}`.trim(),
      },
    ])
  );

  const live = (sheets.liveTournaments || []).find(
    (row) => number(pick(row, "Year")) === year
  ) || {};
  const names = (sheets.teamNames || []).filter(
    (row) => number(pick(row, "Year")) === year
  );

  function teamName(side) {
    const numberLabel = side === "Team 1" ? "1" : "2";
    const liveName = pick(
      live,
      `${side} Name`,
      side,
      `Team ${numberLabel}`,
      `Team ${numberLabel} Name`
    );
    const row = names.find((item) => same(pick(item, "Team Side"), side));
    return (
      clean(liveName) ||
      clean(pick(row, "Team Names", "Team Name", "Name")) ||
      side
    );
  }

  function roster(side) {
    return (sheets.handicaps || [])
      .filter(
        (row) =>
          number(pick(row, "Year")) === year &&
          same(pick(row, "Team Side"), side)
      )
      .map((row) => {
        const id = clean(pick(row, "Player ID"));
        const player = playerMap[id] || { id, name: id };
        return {
          ...player,
          teamSide: side,
          tournamentHandicap: number(pick(row, "Tournament Handicap"), null),
        };
      })
      .filter((player) => player.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    team1: { side: "Team 1", name: teamName("Team 1"), players: roster("Team 1") },
    team2: { side: "Team 2", name: teamName("Team 2"), players: roster("Team 2") },
  };
}

export function getCourseOptions(sheets, course) {
  // Match by Course ID first, but also support the Course Name columns. This
  // keeps the tee dropdown working when the scorecard tab uses a differently
  // padded ID or when Course ID is blank but Course Name is populated.
  const scorecards = (sheets.scorecards || []).filter((row) =>
    courseRowMatches(row, course)
  );

  const byTee = new Map();
  for (const row of scorecards) {
    const tee = clean(pick(row, "Tee", "Tee Name"));
    if (tee && !byTee.has(tee.toLowerCase())) byTee.set(tee.toLowerCase(), row);
  }

  // Courses remains a safe fallback for the officially assigned tee while the
  // dedicated scorecard tab is being completed.
  const assignedTee = clean(pick(course, "Tee", "Tee Name"));
  if (!byTee.size && assignedTee) byTee.set(assignedTee.toLowerCase(), course);

  return [...byTee.values()];
}

export function scorecardForTee(scorecards, tee) {
  return (
    scorecards.find((row) => same(pick(row, "Tee", "Tee Name"), tee)) ||
    scorecards[0] ||
    {}
  );
}

export function holesForTee(sheets, courseOrId, tee) {
  const course =
    typeof courseOrId === "object"
      ? courseOrId
      : { "Course ID": courseOrId };

  return (sheets.holes || [])
    .filter(
      (row) =>
        courseRowMatches(row, course) &&
        same(pick(row, "Tee", "Tee Name"), tee)
    )
    .sort(
      (a, b) => number(pick(a, "Hole", "Hole Number"), 99) - number(pick(b, "Hole", "Hole Number"), 99)
    );
}
