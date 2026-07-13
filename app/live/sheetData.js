const WEBSITE_FEED_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7pFJCpgdgWIKs6IG6_oHpxjqGmic8tTEaWh1IPZapPhIBctS8Rl30Cun9XHwfD0R7hJVuZd_fxzUy/pub?gid=1051192073&single=true&output=csv";

const SHEET_ROWS = {
  tournament: {
    status: 2,
    year: 3,
    location: 4,
    dates: 5,
    teamOneName: 6,
    teamOneScore: 7,
    teamTwoName: 8,
    teamTwoScore: 9,
    currentRound: 10,
  },
  roundOne: { start: 14, end: 19 },
  roundTwo: { start: 23, end: 28 },
  roundThree: { start: 32, end: 43 },
  leaderboard: { start: 48, end: 71 },
};

function parseCsv(csvText) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"' && insideQuotes && nextCharacter === '"') {
      currentCell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function clean(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  const number = Number.parseFloat(clean(value));
  return Number.isFinite(number) ? number : 0;
}

function rowAt(rows, sheetRowNumber) {
  return rows[sheetRowNumber - 1] ?? [];
}

function splitPlayers(...values) {
  return values
    .flatMap((value) => clean(value).split("/"))
    .map((name) => name.trim())
    .filter(Boolean);
}

function normalizeWinner(value) {
  const winner = clean(value).toLowerCase();

  if (
    winner === "team 1" ||
    winner === "team1" ||
    winner === "1" ||
    winner === "the pickles"
  ) {
    return "Team 1";
  }

  if (
    winner === "team 2" ||
    winner === "team2" ||
    winner === "2" ||
    winner === "team lipp"
  ) {
    return "Team 2";
  }

  return "Halved";
}

function buildTeamMatch(row, roundLabel) {
  const matchNumber = clean(row[0]);

  if (!matchNumber || matchNumber.toLowerCase() === "match") {
    return null;
  }

  return {
    match: matchNumber,
    round: roundLabel,
    teamOnePlayers: splitPlayers(row[1], row[2]),
    teamTwoPlayers: splitPlayers(row[3], row[4]),
    frontWinner: normalizeWinner(row[5]),
    backWinner: normalizeWinner(row[6]),
    overallWinner: normalizeWinner(row[7]),
    teamOnePoints: toNumber(row[8]),
    teamTwoPoints: toNumber(row[9]),
  };
}

function buildSinglesMatch(row) {
  const matchNumber = clean(row[0]);

  if (!matchNumber || matchNumber.toLowerCase() === "match") {
    return null;
  }

  return {
    match: matchNumber,
    round: "Round 3",
    teamOnePlayers: splitPlayers(row[1]),
    teamTwoPlayers: splitPlayers(row[2]),
    overallWinner: normalizeWinner(row[3]),
    teamOnePoints: toNumber(row[4]),
    teamTwoPoints: toNumber(row[5]),
  };
}

function collectMatches(rows, range, builder) {
  const matches = [];

  for (
    let sheetRowNumber = range.start;
    sheetRowNumber <= range.end;
    sheetRowNumber += 1
  ) {
    const match = builder(rowAt(rows, sheetRowNumber));
    if (match) matches.push(match);
  }

  return matches;
}

function collectLeaderboard(rows) {
  const players = [];

  for (
    let sheetRowNumber = SHEET_ROWS.leaderboard.start;
    sheetRowNumber <= SHEET_ROWS.leaderboard.end;
    sheetRowNumber += 1
  ) {
    const row = rowAt(rows, sheetRowNumber);
    const rank = clean(row[0]);
    const player = clean(row[1]);

    if (!rank || !player || rank.toLowerCase() === "rank") {
      continue;
    }

    players.push({
      rank,
      player,
      team: clean(row[2]),
      total: toNumber(row[3]),
    });
  }

  return players;
}

function validateCsv(csvText) {
  const trimmed = csvText.trim();

  if (!trimmed) {
    throw new Error("Google returned an empty CSV response.");
  }

  if (
    trimmed.startsWith("<!DOCTYPE html") ||
    trimmed.startsWith("<html") ||
    trimmed.includes("<script")
  ) {
    throw new Error("Google returned HTML instead of CSV.");
  }

  if (trimmed.includes("window.ppConfig") || trimmed.includes("disableAllReporting")) {
    throw new Error("Google returned a security script instead of CSV.");
  }
}

export async function getTournamentData() {
  const response = await fetch(WEBSITE_FEED_CSV_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google Sheet request failed with status ${response.status}.`);
  }

  const csvText = await response.text();
  validateCsv(csvText);

  const rows = parseCsv(csvText);
  const tournamentRows = SHEET_ROWS.tournament;

  const tournament = {
    status: clean(rowAt(rows, tournamentRows.status)[1]) || "Offseason",
    year: clean(rowAt(rows, tournamentRows.year)[1]) || "2026",
    location:
      clean(rowAt(rows, tournamentRows.location)[1]) || "Kiawah Island, SC",
    dates: clean(rowAt(rows, tournamentRows.dates)[1]),
    currentRound:
      clean(rowAt(rows, tournamentRows.currentRound)[1]) || "Round 1",
    teamOne: {
      name:
        clean(rowAt(rows, tournamentRows.teamOneName)[1]) || "Team One",
      score: toNumber(rowAt(rows, tournamentRows.teamOneScore)[1]),
    },
    teamTwo: {
      name:
        clean(rowAt(rows, tournamentRows.teamTwoName)[1]) || "Team Two",
      score: toNumber(rowAt(rows, tournamentRows.teamTwoScore)[1]),
    },
  };

  const roundOne = collectMatches(
    rows,
    SHEET_ROWS.roundOne,
    (row) => buildTeamMatch(row, "Round 1")
  );

  const roundTwo = collectMatches(
    rows,
    SHEET_ROWS.roundTwo,
    (row) => buildTeamMatch(row, "Round 2")
  );

  const roundThree = collectMatches(
    rows,
    SHEET_ROWS.roundThree,
    buildSinglesMatch
  );

  return {
    tournament,
    rounds: {
      "Round 1": {
        label: "Round 1",
        format: "2 vs. 2",
        subtitle: "Front 9, Back 9, and Overall",
        matches: roundOne,
      },
      "Round 2": {
        label: "Round 2",
        format: "2-Man Scramble",
        subtitle: "Front 9, Back 9, and Overall",
        matches: roundTwo,
      },
      "Round 3": {
        label: "Round 3",
        format: "Singles",
        subtitle: "One point for the overall match",
        matches: roundThree,
      },
    },
    leaderboard: collectLeaderboard(rows),
    updatedAt: new Date().toISOString(),
  };
}