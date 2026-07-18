import { formatCode, pick } from "./prediction-engine";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = null) => {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

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
  const courseId = clean(pick(course, "Course ID"));
  const scorecards = (sheets.scorecards || []).filter(
    (row) => same(pick(row, "Course ID"), courseId)
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

export function holesForTee(sheets, courseId, tee) {
  return (sheets.holes || [])
    .filter(
      (row) =>
        same(pick(row, "Course ID"), courseId) &&
        same(pick(row, "Tee", "Tee Name"), tee)
    )
    .sort(
      (a, b) => number(pick(a, "Hole", "Hole Number"), 99) - number(pick(b, "Hole", "Hole Number"), 99)
    );
}
