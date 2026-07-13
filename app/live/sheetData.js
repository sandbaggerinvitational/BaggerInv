

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function clean(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  const parsed = Number.parseFloat(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitPlayers(value) {
  return clean(value)
    .split("/")
    .map((name) => name.trim())
    .filter(Boolean);
}

function rowAt(rows, sheetRowNumber) {
  return rows[sheetRowNumber - 1] ?? [];
}

function buildTeamMatch(row, roundLabel) {
  if (!clean(row[0])) return null;

  return {
    match: clean(row[0]),
    round: roundLabel,
    teamOnePlayers: splitPlayers(row[1]),
    teamTwoPlayers: splitPlayers(row[2]),
    frontWinner: clean(row[3]) || "Halved",
    backWinner: clean(row[4]) || "Halved",
    overallWinner: clean(row[5]) || "Halved",
    teamOnePoints: numberValue(row[6]),
    teamTwoPoints: numberValue(row[7]),
  };
}

function buildSinglesMatch(row) {
  if (!clean(row[0])) return null;

  return {
    match: clean(row[0]),
    round: "Round 3",
    teamOnePlayers: splitPlayers(row[1]),
    teamTwoPlayers: splitPlayers(row[2]),
    overallWinner: clean(row[3]) || "Halved",
    teamOnePoints: numberValue(row[5] ?? row[6]),
    teamTwoPoints: numberValue(row[6] ?? row[7]),
  };
}

export async function getTournamentData() {
const url =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7pFJCpgdgWIKs6IG6_oHpxjqGmic8tTEaWh1IPZapPhIBctS8Rl30Cun9XHwfD0R7hJVuZd_fxzUy/pub?gid=1051192073&single=true&output=csv";

const response = await fetch(url, {
  cache: "no-store",
});

  if (!response.ok) {
    throw new Error(`Google Sheet request failed: ${response.status}`);
  }

  const csv = await response.text();
  if (!csv || csv.trim().startsWith("<!DOCTYPE html")) {
  throw new Error("Google returned HTML instead of CSV.");
}
  const rows = parseCsv(csv);

  const statusPrimary = clean(rowAt(rows, 2)[1]);
  const statusSecondary = clean(rowAt(rows, 6)[1]);

  const tournament = {
    status: statusSecondary || statusPrimary || "Offseason",
    year: clean(rowAt(rows, 3)[1]) || "2026",
    location: clean(rowAt(rows, 4)[1]) || "Kiawah Island, SC",
    dates: clean(rowAt(rows, 5)[1]) || "",
    currentRound: clean(rowAt(rows, 11)[1]) || "Round 1",
    teamOne: {
      name: clean(rowAt(rows, 7)[1]) || "Team One",
      score: numberValue(rowAt(rows, 8)[1]),
    },
    teamTwo: {
      name: clean(rowAt(rows, 9)[1]) || "Team Two",
      score: numberValue(rowAt(rows, 10)[1]),
    },
  };

  const roundOne = [];
  for (let rowNumber = 15; rowNumber <= 20; rowNumber += 1) {
    const match = buildTeamMatch(rowAt(rows, rowNumber), "Round 1");
    if (match) roundOne.push(match);
  }

  const roundTwo = [];
  for (let rowNumber = 24; rowNumber <= 29; rowNumber += 1) {
    const match = buildTeamMatch(rowAt(rows, rowNumber), "Round 2");
    if (match) roundTwo.push(match);
  }

  const roundThree = [];
  for (let rowNumber = 33; rowNumber <= 44; rowNumber += 1) {
    const match = buildSinglesMatch(rowAt(rows, rowNumber));
    if (match) roundThree.push(match);
  }

  const leaderboard = [];
  for (let rowNumber = 49; rowNumber <= 72; rowNumber += 1) {
    const row = rowAt(rows, rowNumber);
    if (!clean(row[0]) || !clean(row[1])) continue;

    leaderboard.push({
      rank: clean(row[0]),
      player: clean(row[1]),
      team: clean(row[2]),
      total: numberValue(row[3]),
    });
  }

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
    leaderboard,
    updatedAt: new Date().toISOString(),
  };
}