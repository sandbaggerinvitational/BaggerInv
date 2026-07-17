const SPREADSHEET_ID = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";

function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    const next = csvText[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = ""; continue;
    }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function clean(value) { return String(value ?? "").trim(); }
function number(value) {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
function truthy(value) { return ["true", "yes", "1"].includes(clean(value).toLowerCase()); }

function table(rows) {
  const headers = (rows[0] || []).map(clean);
  return rows.slice(1).filter((row) => row.some((v) => clean(v))).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))
  );
}

async function fetchSheet(sheetName) {
  const response = await fetch(csvUrl(sheetName), { cache: "no-store" });
  if (!response.ok) throw new Error(`${sheetName} returned ${response.status}.`);
  const text = await response.text();
  if (!text.trim() || text.trim().startsWith("<")) {
    throw new Error(`${sheetName} did not return public CSV data.`);
  }
  return table(parseCsv(text));
}

function formatTime(value) {
  const raw = clean(value);
  if (!raw) return "";
  const match = raw.match(/Date\(\d+,\d+,\d+,(\d+),(\d+),(\d+)\)/);
  if (match) {
    const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]), Number(match[3]));
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (/^\d{1,2}:\d{2}/.test(raw)) {
    const [hours, minutes] = raw.split(":").map(Number);
    return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return raw;
}

function normalizeWinner(value) {
  const winner = clean(value).toLowerCase();
  if (["team 1", "team1", "1"].includes(winner)) return "Team 1";
  if (["team 2", "team2", "2"].includes(winner)) return "Team 2";
  if (["halved", "half", "tie", "tied"].includes(winner)) return "Halved";
  return "";
}

function displayFormat(code) {
  return ({ BB: "Best Ball", SC: "2-Man Scramble", SI: "Singles" })[clean(code).toUpperCase()] || clean(code);
}

function hcp(value) {
  const parsed = number(value);
  return parsed === null ? null : parsed;
}

function playerEntry(row, side, slot, playerMap) {
  const id = clean(row[`Team ${side} Player ${slot}`]);
  if (!id) return null;
  return {
    id,
    name: playerMap[id]?.name || id,
    slug: playerMap[id]?.slug || "",
    playingHcp: hcp(row[`Team ${side} Player ${slot} Playing HCP`]),
    stroke: number(row[`Team ${side} Player ${slot} Stroke`]),
  };
}

function buildLeaderboard(matches, playerMap, teamNames) {
  const stats = new Map();
  const ensure = (id, side) => {
    if (!stats.has(id)) stats.set(id, {
      id, player: playerMap[id]?.name || id, slug: playerMap[id]?.slug || "",
      team: teamNames[side] || `Team ${side}`, teamSide: side,
      wins: 0, losses: 0, halves: 0, points: 0,
    });
    return stats.get(id);
  };

  for (const match of matches) {
    const winner = normalizeWinner(match.raw["Matchup Winner"] || match.raw["18-Hole Winner"]);
    const teamOnePoints = number(match.raw["Team 1 Points"]);
    const teamTwoPoints = number(match.raw["Team 2 Points"]);
    const completed = winner || teamOnePoints !== null || teamTwoPoints !== null;
    if (!completed) continue;

    for (const side of [1, 2]) {
      const players = match[`team${side}Players`];
      const teamPoints = side === 1 ? teamOnePoints : teamTwoPoints;
      const share = teamPoints === null ? 0 : teamPoints / Math.max(players.length, 1);
      for (const player of players) {
        const stat = ensure(player.id, side);
        stat.points += share;
        if (winner === "Halved") stat.halves += 1;
        else if (winner === `Team ${side}`) stat.wins += 1;
        else if (winner) stat.losses += 1;
      }
    }
  }

  return [...stats.values()].sort((a, b) =>
    b.points - a.points || b.wins - a.wins || a.losses - b.losses || b.halves - a.halves || a.player.localeCompare(b.player)
  );
}

export async function getTournamentData() {
  const [liveMatches, liveTournaments, players, teamRows, tournaments, courses] = await Promise.all([
    fetchSheet("Live Matches"), fetchSheet("Live Tournaments"), fetchSheet("Players"),
    fetchSheet("Team Names"), fetchSheet("Tournaments"), fetchSheet("Courses"),
  ]);

  const active = liveTournaments.find((row) => clean(row.Year)) || {};
  const year = Number(active.Year) || new Date().getFullYear();
  const tournamentRow = tournaments.find((row) => Number(row.Year) === year) || {};
  const playerMap = Object.fromEntries(players.map((row) => [row["Player ID"], {
    name: row["Display Name"] || `${row.First || ""} ${row.Last || ""}`.trim(),
    slug: row.Slug || "",
    active: truthy(row.Active),
  }]));
  const courseMap = Object.fromEntries(courses.map((row) => [row["Course ID"], row["Course Name"] || row.Course || row["Full Course Name"] || row["Course ID"]]));
  const teamNames = { 1: "Team 1", 2: "Team 2" };
  for (const row of teamRows.filter((item) => Number(item.Year) === year)) {
    const side = clean(row["Team Side"]).match(/(1|2)/)?.[1];
    if (side) teamNames[Number(side)] = row["Team Names"] || row["Team Name"] || teamNames[Number(side)];
  }

  const matches = liveMatches
    .filter((row) => Number(row.Year) === year || !row.Year)
    .map((row) => {
      const format = clean(row.Format).toUpperCase();
      const team1Players = [playerEntry(row, 1, 1, playerMap), playerEntry(row, 1, 2, playerMap)].filter(Boolean);
      const team2Players = [playerEntry(row, 2, 1, playerMap), playerEntry(row, 2, 2, playerMap)].filter(Boolean);
      return {
        id: row["Match ID"] || `${year}-${row.Round}-${row.Match}`,
        raw: row,
        round: Number(row.Round) || 1,
        match: row.Match || "",
        format,
        formatName: displayFormat(format),
        course: courseMap[row["Course ID"]] || row["Course ID"] || "",
        teeTime: formatTime(row["Tee Time"]),
        status: row["Match Status"] || "Scheduled",
        notes: row.Notes || "",
        team1Players,
        team2Players,
        team1PlayingHcp: hcp(row["Team 1 Playing HCP"]),
        team2PlayingHcp: hcp(row["Team 2 Playing HCP"]),
        team1Stroke: number(row["Team 1 Stroke"]),
        team2Stroke: number(row["Team 2 Stroke"]),
        matchupWinner: normalizeWinner(row["Matchup Winner"]),
        frontWinner: normalizeWinner(row["Front 9 Winner"]),
        backWinner: normalizeWinner(row["Back 9 Winner"]),
        overallWinner: normalizeWinner(row["18-Hole Winner"] || row["Matchup Winner"]),
        team1Points: number(row["Team 1 Points"]),
        team2Points: number(row["Team 2 Points"]),
      };
    });

  const rounds = {};
  for (const match of matches) {
    const key = `Round ${match.round}`;
    if (!rounds[key]) rounds[key] = { label: key, format: match.formatName, matches: [] };
    rounds[key].matches.push(match);
  }

  const leaderboard = buildLeaderboard(matches, playerMap, teamNames);
  return {
    tournament: {
      year,
      status: active["Tournament Status"] || "Upcoming",
      currentRound: `Round ${Number(active["Current Round"]) || 1}`,
      location: tournamentRow.Destination || "",
      dates: tournamentRow.Dates || "",
      liveMessage: active["Live Message"] || "",
      lastUpdated: active["Last Updated"] || "",
      teamOne: { name: teamNames[1], score: number(active["Team 1 Score"]) ?? 0 },
      teamTwo: { name: teamNames[2], score: number(active["Team 2 Score"]) ?? 0 },
    },
    rounds,
    leaderboard,
  };
}
