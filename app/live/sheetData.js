import {
  getRoundProgress,
  getTeamMomentum,
  getTournamentState,
  isFinalizedMatch,
  remainingByRound,
  roundStatus,
} from "../../lib/live-tournament";

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

const clean = (value) => String(value ?? "").trim();
function number(value) {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
const truthy = (value) => ["true", "yes", "1"].includes(clean(value).toLowerCase());

function table(rows) {
  const headers = (rows[0] || []).map(clean);
  return rows.slice(1).filter((row) => row.some((value) => clean(value))).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))
  );
}

async function fetchSheet(sheetName) {
  const response = await fetch(csvUrl(sheetName), { cache: "no-store" });
  if (!response.ok) throw new Error(`${sheetName} returned ${response.status}.`);
  const text = await response.text();
  if (!text.trim() || text.trim().startsWith("<")) throw new Error(`${sheetName} did not return public CSV data.`);
  return table(parseCsv(text));
}

function formatTime(value) {
  const raw = clean(value);
  if (!raw) return "";
  const match = raw.match(/Date\(\d+,\d+,\d+,(\d+),(\d+),(\d+)\)/);
  if (match) return new Date(2000, 0, 1, Number(match[1]), Number(match[2]), Number(match[3])).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
  return ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[clean(code).toUpperCase()] || clean(code);
}

function playerEntry(row, side, slot, playerMap) {
  const id = clean(row[`Team ${side} Player ${slot}`]);
  if (!id) return null;
  const player = playerMap[id] || {};
  return {
    id,
    name: player.name || id,
    slug: player.slug || "",
    photo: player.photo || "",
    captain: Boolean(player.captain),
    playingHcp: number(row[`Team ${side} Player ${slot} Playing HCP`] || row[`T${side} P${slot} Playing HCP`]),
    stroke: number(row[`Team ${side} Player ${slot} Stroke`]),
  };
}

function resultFields(source, fallback) {
  const result = { ...fallback };
  for (const field of [
    "Matchup Winner", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner",
    "Team 1 Points", "Team 2 Points", "Match Status", "Notes", "Finalized At", "Finalized By",
  ]) {
    if (clean(source?.[field])) result[field] = source[field];
  }
  return result;
}

function buildLeaderboard(matches, playerMap, teamNames) {
  const stats = new Map();
  const ensure = (id, side) => {
    if (!stats.has(id)) stats.set(id, {
      id, player: playerMap[id]?.name || id, slug: playerMap[id]?.slug || "",
      team: teamNames[side]?.name || `Team ${side}`, teamSide: side,
      wins: 0, losses: 0, halves: 0, points: 0,
    });
    return stats.get(id);
  };

  for (const match of matches.filter(isFinalizedMatch)) {
    const winner = match.matchupWinner || match.overallWinner;
    for (const side of [1, 2]) {
      const players = match[`team${side}Players`];
      const teamPoints = side === 1 ? match.team1Points : match.team2Points;
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
  return [...stats.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.player.localeCompare(b.player));
}

function tieAdvantageSide(tournamentRow, teams) {
  const reference = clean(
    tournamentRow["Tie Advantage Team"] ||
    tournamentRow["Trophy Holder"] ||
    tournamentRow["Defending Champion Team"]
  ).toLowerCase();
  if (!reference) return null;
  for (const side of [1, 2]) {
    const team = teams[side];
    if ([String(side), `team ${side}`, team.id, team.name].map((value) => clean(value).toLowerCase()).includes(reference)) return side;
  }
  return null;
}

export async function getTournamentData() {
  const [liveRows, permanentRows, liveTournaments, players, teamRows, tournaments, courses, rules] = await Promise.all([
    fetchSheet("Live Matches"), fetchSheet("Matches"), fetchSheet("Live Tournaments"), fetchSheet("Players"),
    fetchSheet("Team Names"), fetchSheet("Tournaments"), fetchSheet("Courses"), fetchSheet("Tournament Rules"),
  ]);

  const active = liveTournaments.find((row) => clean(row.Year)) || {};
  const year = Number(active.Year) || new Date().getFullYear();
  const tournamentRow = tournaments.find((row) => Number(row.Year) === year) || {};
  const yearTeams = teamRows.filter((row) => Number(row.Year) === year);
  const teams = { 1: { id: "", name: "Team 1", logo: "", captainId: "" }, 2: { id: "", name: "Team 2", logo: "", captainId: "" } };
  for (const row of yearTeams) {
    const side = Number(clean(row["Team Side"]).match(/(1|2)/)?.[1]);
    if (side) teams[side] = {
      id: row["Team ID"] || "",
      name: row["Team Names"] || row["Team Name"] || `Team ${side}`,
      logo: row["Team Logo"] || "",
      captainId: row.Captain || "",
    };
  }

  const playerMap = Object.fromEntries(players.map((row) => [row["Player ID"], {
    name: row["Display Name"] || `${row.First || ""} ${row.Last || ""}`.trim(),
    slug: row.Slug || "",
    photo: row["Photo Filename"] || "",
    active: truthy(row.Active),
    captain: [teams[1].captainId, teams[2].captainId].includes(row["Player ID"]) || truthy(row.Captain),
  }]));
  const courseMap = Object.fromEntries(courses.filter((row) => Number(row.Year) === year).map((row) => [row["Course ID"], {
    id: row["Course ID"], name: row["Course Name"] || row.Course || row["Full Course Name"] || row["Course ID"],
    logo: row["Course Logo"] || "", tee: row["Tee Played"] || "",
  }]));
  const rulesByRound = Object.fromEntries(rules.filter((row) => Number(row.Year) === year).map((row) => [Number(clean(row.Round).match(/\d+/)?.[0]), row]));
  const permanentMap = Object.fromEntries(permanentRows.filter((row) => Number(row.Year) === year).map((row) => [row["Match ID"], row]));

  const matches = liveRows
    .filter((row) => Number(row.Year) === year || !row.Year)
    .map((liveRow) => {
      const permanent = permanentMap[liveRow["Match ID"]];
      const authoritative = permanent && /^(final|finalized|complete|completed)$/i.test(clean(permanent["Match Status"]))
        ? resultFields(permanent, liveRow)
        : liveRow;
      const format = clean(liveRow.Format).toUpperCase();
      const round = Number(liveRow.Round) || 1;
      const course = courseMap[liveRow["Course ID"]] || { id: liveRow["Course ID"] || "", name: liveRow["Course ID"] || "", logo: "", tee: "" };
      const rule = rulesByRound[round] || {};
      return {
        id: liveRow["Match ID"] || `${year}-${round}-${liveRow.Match}`,
        round,
        match: liveRow.Match || "",
        format,
        formatName: displayFormat(format),
        course,
        teeTime: formatTime(liveRow["Tee Time"]),
        status: authoritative["Match Status"] || liveRow["Match Status"] || "Scheduled",
        finalizedAt: authoritative["Finalized At"] || "",
        notes: authoritative.Notes || "",
        team1Players: [playerEntry(liveRow, 1, 1, playerMap), playerEntry(liveRow, 1, 2, playerMap)].filter(Boolean),
        team2Players: [playerEntry(liveRow, 2, 1, playerMap), playerEntry(liveRow, 2, 2, playerMap)].filter(Boolean),
        team1PlayingHcp: number(liveRow["Team 1 Playing HCP"]),
        team2PlayingHcp: number(liveRow["Team 2 Playing HCP"]),
        team1Stroke: number(liveRow["Team 1 Stroke"]),
        team2Stroke: number(liveRow["Team 2 Stroke"]),
        matchupWinner: normalizeWinner(authoritative["Matchup Winner"]),
        frontWinner: normalizeWinner(authoritative["Front 9 Winner"]),
        backWinner: normalizeWinner(authoritative["Back 9 Winner"]),
        overallWinner: normalizeWinner(authoritative["18-Hole Winner"] || authoritative["Matchup Winner"]),
        team1Points: number(authoritative["Team 1 Points"]),
        team2Points: number(authoritative["Team 2 Points"]),
        pointsAvailable: number(rule["Points Available"]) ?? 3,
      };
    });

  // The Admin Center edits the canonical Tournaments row. Keep Live Tournaments
  // as a backwards-compatible fallback for installations that have not migrated.
  const currentRound = Number(tournamentRow["Current Round"] || active["Current Round"]) || 1;
  const status = tournamentRow["Tournament Status"] || active["Tournament Status"] || "Upcoming";
  const rounds = [...new Set(matches.map((match) => match.round))].sort((a, b) => a - b).map((roundNumber) => {
    const roundMatches = matches.filter((match) => match.round === roundNumber).sort((a, b) => Number(a.match) - Number(b.match));
    const course = roundMatches[0]?.course || {};
    const round = { number: roundNumber, label: `Round ${roundNumber}`, format: roundMatches[0]?.formatName || displayFormat(rulesByRound[roundNumber]?.Format), course, matches: roundMatches };
    return { ...round, status: roundStatus(round, status, currentRound), progress: getRoundProgress(round) };
  });

  const finalizedMatches = matches.filter(isFinalizedMatch);
  const finalizedScore = finalizedMatches.reduce((score, match) => ({
    teamOne: score.teamOne + (match.team1Points ?? 0),
    teamTwo: score.teamTwo + (match.team2Points ?? 0),
  }), { teamOne: 0, teamTwo: 0 });
  const hasFinalizedResults = finalizedMatches.length > 0;

  const tournament = {
    year,
    status,
    currentRound,
    location: tournamentRow.Destination || tournamentRow.Location || "",
    dates: tournamentRow.Dates || "",
    liveMessage: active["Live Message"] || "",
    lastUpdated: active["Last Updated"] || "",
    tieAdvantageSide: tieAdvantageSide(tournamentRow, teams),
    teamOne: { ...teams[1], score: hasFinalizedResults ? finalizedScore.teamOne : (number(active["Team 1 Score"]) ?? 0) },
    teamTwo: { ...teams[2], score: hasFinalizedResults ? finalizedScore.teamTwo : (number(active["Team 2 Score"]) ?? 0) },
  };
  const state = getTournamentState({ tournament, rounds });

  return {
    tournament: { ...tournament, state },
    rounds,
    remainingByRound: remainingByRound(rounds),
    momentum: getTeamMomentum(rounds),
    leaderboard: buildLeaderboard(matches, playerMap, teams),
  };
}
