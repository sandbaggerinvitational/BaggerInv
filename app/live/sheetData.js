import {
  getRoundProgress,
  getEffectiveTournamentState,
  getTeamMomentum,
  getTournamentState,
  isLiveMatch,
  isOfficialMatchResult,
  remainingByRound,
  roundStatus,
} from "../../lib/live-tournament";
import {
  assertValidTournamentId,
  recordBelongsToTournament,
  tournamentId,
  tournamentYear,
} from "../../lib/tournament-identifiers";
import { getStrokesOnHole } from "../../lib/scorecard-net";
import { resolveSpreadsheetId } from "../../lib/spreadsheet-environment";
import { formatHomeTime } from "../../lib/home-dashboard";
import { mergeRowsByStableMatchId } from "../../lib/live-match-source";
import { finalizedMatchResult } from "../../lib/game-center";
import {
  authenticatedPreviewReadsEnabled,
  readNormalizedSheetValues,
  readNormalizedSheetsValues,
  normalizedReadDiagnostics,
} from "../../lib/google-sheets-server-read";
import { isTransientGoogleError } from "../../lib/google-api-reliability";
import { calculateNetSkins } from "../../lib/net-skins";
import { initializeTournamentWorkbook } from "../../lib/tournament-workbook-initialization";

const SPREADSHEET_ID = resolveSpreadsheetId();

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
function firstNumber(row, fields) {
  for (const field of fields) {
    const value = number(row?.[field]);
    if (value !== null) return value;
  }
  return null;
}
const truthy = (value) => ["true", "yes", "1"].includes(clean(value).toLowerCase());

function table(rows) {
  const headers = (rows[0] || []).map(clean);
  return rows.slice(1).filter((row) => row.some((value) => clean(value))).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))
  );
}

async function fetchSheet(sheetName) {
  if (authenticatedPreviewReadsEnabled()) {
    return table(await readNormalizedSheetValues(sheetName));
  }
  const response = await fetch(csvUrl(sheetName), { cache: "no-store" });
  if (!response.ok) throw new Error(`${sheetName} returned ${response.status}.`);
  const text = await response.text();
  if (!text.trim() || text.trim().startsWith("<")) throw new Error(`${sheetName} did not return public CSV data.`);
  return table(parseCsv(text));
}

async function fetchOptionalSheet(sheetName) {
  try {
    return await fetchSheet(sheetName);
  } catch {
    return [];
  }
}

function formatTime(value) {
  const raw = clean(value);
  if (!raw) return "";
  const match = raw.match(/Date\(\d+,\d+,\d+,(\d+),(\d+),(\d+)\)/);
  if (match) return formatHomeTime(`${match[1]}:${match[2]}`);
  return formatHomeTime(raw);
}

function normalizeWinner(value) {
  const winner = clean(value).toLowerCase();
  if (["team 1", "team1", "1"].includes(winner)) return "Team 1";
  if (["team 2", "team2", "2"].includes(winner)) return "Team 2";
  if (["halved", "half", "tie", "tied"].includes(winner)) return "Halved";
  return "";
}

function replaceTeamIds(value, teams) {
  return clean(value)
    .replace(/\bTeam 1\b/gi, teams[1]?.name || "Team 1")
    .replace(/\bTeam 2\b/gi, teams[2]?.name || "Team 2");
}

function displayFormat(code) {
  return ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[clean(code).toUpperCase()] || clean(code);
}

function scoreArray(value) {
  try {
    const parsed = JSON.parse(clean(value) || "[]");
    return Array.isArray(parsed) ? parsed.map(number).filter((item) => item !== null) : [];
  } catch {
    return [];
  }
}

function buildScoreLeaderboard(holeScores, matchMap, courseHoles, playerMap) {
  const totals = new Map();
  const metadataFor = (match, holeNumber) => courseHoles.find((row) =>
    clean(row["Course ID"]) === clean(match["Course ID"]) &&
    Number(row["Hole Number"]) === Number(holeNumber) &&
    (!clean(match.Tee || match["Tee Played"]) || !clean(row.Tee) || clean(row.Tee) === clean(match.Tee || match["Tee Played"]))
  );
  const add = ({ entityId, playerIds, name, format, round, match, gross, net, par, holeNumber }) => {
    if (!entityId || gross === null || net === null || par === null) return;
    const key = `${round}:${entityId}`;
    if (!totals.has(key)) totals.set(key, {
      id: entityId, round, match, name, format,
      entityType: format === "SC" ? "PAIRING" : "PLAYER",
      playerIds,
      slug: format === "SC" ? "" : playerMap[playerIds[0]]?.slug || "",
      photo: format === "SC" ? "" : playerMap[playerIds[0]]?.photo || "",
      gross: 0, net: 0, par: 0, holes: 0, scorecard: [],
    });
    const row = totals.get(key);
    row.gross += gross; row.net += net; row.par += par; row.holes += 1;
    row.scorecard.push({
      hole: Number(holeNumber),
      match,
      gross,
      net,
      par,
      strokeIndex,
      strokes: Math.max(0, gross - net),
    });
  };
  for (const row of holeScores) {
    const match = matchMap.get(clean(row["Match ID"]));
    if (!match) continue;
    const round = Number(match.Round) || 1;
    const format = clean(match.Format).toUpperCase();
    const matchNumber = clean(match.Match);
    const metadata = metadataFor(match, row["Hole Number"]);
    const par = number(metadata?.Par);
    const strokeIndex = number(metadata?.["Stroke Index"]);
    for (const side of [1, 2]) {
      const grossScores = scoreArray(row[`Team ${side} Gross Scores`]);
      const playerIds = [match[`Team ${side} Player 1`], match[`Team ${side} Player 2`]].map(clean).filter(Boolean);
      if (format === "SC") {
        const gross = grossScores[0] ?? null;
        const allocated = clean(match[`Team ${side} Stroke`]) || match[`Team ${side} Playing HCP`];
        const strokes = getStrokesOnHole(allocated, strokeIndex);
        const net = number(row[`Team ${side} Net Score`]) ?? (gross === null ? null : gross - strokes);
        add({
          entityId: `${clean(match["Match ID"])}:team-${side}`,
          playerIds,
          name: playerIds.map((id) => playerMap[id]?.name || id).join(" / "),
          format,
          round,
          match: matchNumber,
          gross,
          net,
          par,
          holeNumber: row["Hole Number"],
        });
        continue;
      }
      playerIds.forEach((playerId, index) => {
        const gross = grossScores[index] ?? null;
        const allocated = clean(match[`Team ${side} Player ${index + 1} Stroke`]) || match[`Team ${side} Player ${index + 1} Playing HCP`];
        const strokes = getStrokesOnHole(allocated, strokeIndex);
        const net = gross === null ? null : gross - strokes;
        add({
          entityId: playerId,
          playerIds: [playerId],
          name: playerMap[playerId]?.name || playerId,
          format,
          round,
          match: matchNumber,
          gross,
          net,
          par,
          holeNumber: row["Hole Number"],
        });
      });
    }
  }
  return [...totals.values()].map((row) => ({
    ...row,
    scorecard: row.scorecard.sort((a, b) => a.hole - b.hole),
    grossToPar: row.gross - row.par,
    netToPar: row.net - row.par,
  })).sort((a, b) => a.netToPar - b.netToPar || a.grossToPar - b.grossToPar);
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
    playingHcp: firstNumber(row, [
      `Team ${side} Player ${slot} Playing HCP`,
      `T${side} P${slot} Playing HCP`,
      `Team ${side} Player ${slot} Playing Handicap`,
      `Team ${side} Player ${slot} HCP`,
    ]),
    stroke: firstNumber(row, [
      `Team ${side} Player ${slot} Stroke`,
      `T${side} P${slot} Stroke`,
      `Team ${side} Player ${slot} Strokes`,
    ]),
  };
}

function resultFields(source, fallback) {
  const result = { ...fallback };
  for (const field of [
    "Matchup Winner", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner",
    "Team 1 Points", "Team 2 Points", "Match Status", "Match Status Text", "Notes", "Finalized At", "Finalized By",
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
      photo: playerMap[id]?.photo || "",
      team: teamNames[side]?.name || `Team ${side}`, teamSide: side,
      teamLogo: teamNames[side]?.logo || "",
      wins: 0, losses: 0, halves: 0, points: 0,
      matchesPlayed: 0,
    });
    return stats.get(id);
  };

  for (const match of matches) {
    for (const side of [1, 2]) {
      for (const player of match[`team${side}Players`] || []) ensure(player.id, side);
    }
  }
  for (const match of matches.filter(isOfficialMatchResult)) {
    const winner = match.matchupWinner || match.overallWinner;
    for (const side of [1, 2]) {
      const players = match[`team${side}Players`];
      const teamPoints = side === 1 ? match.team1Points : match.team2Points;
      const share = teamPoints === null ? 0 : teamPoints / Math.max(players.length, 1);
      for (const player of players) {
        const stat = ensure(player.id, side);
        stat.matchesPlayed += 1;
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

async function buildTournamentData() {
  let sheets;
  let workbookChecks = { required: {}, optional: {} };
  if (authenticatedPreviewReadsEnabled()) {
    const requiredNames = [
      "Live Matches", "Matches", "Live Tournaments", "Players", "Team Names",
      "Tournaments", "Courses", "Tournament Rules", "Live Hole Scores",
      "Course Holes", "Tournament Itinerary",
    ];
    const optionalNames = ["Net Skins", "Net Skins Result"];
    const initialized = await initializeTournamentWorkbook({
      requiredNames,
      optionalNames,
      readRequired: readNormalizedSheetsValues,
      readSheet: readNormalizedSheetValues,
    });
    sheets = Object.fromEntries([...requiredNames, ...optionalNames].map((name) => [name, table(initialized.sheets[name] || [])]));
    workbookChecks = initialized.checks;
  } else {
    const [liveRows, permanentRows, liveTournaments, players, teamRows, tournaments, courses, rules, liveHoleScores, courseHoles, itineraryRows, netSkinsRows, netSkinsResultRows] = await Promise.all([
      fetchSheet("Live Matches"), fetchSheet("Matches"), fetchSheet("Live Tournaments"), fetchSheet("Players"),
      fetchSheet("Team Names"), fetchSheet("Tournaments"), fetchSheet("Courses"), fetchSheet("Tournament Rules"),
      fetchOptionalSheet("Live Hole Scores"), fetchOptionalSheet("Course Holes"), fetchOptionalSheet("Tournament Itinerary"),
      fetchOptionalSheet("Net Skins"), fetchOptionalSheet("Net Skins Result"),
    ]);
    sheets = {
      "Live Matches": liveRows, Matches: permanentRows, "Live Tournaments": liveTournaments,
      Players: players, "Team Names": teamRows, Tournaments: tournaments, Courses: courses,
      "Tournament Rules": rules, "Live Hole Scores": liveHoleScores, "Course Holes": courseHoles,
      "Tournament Itinerary": itineraryRows,
      "Net Skins": netSkinsRows, "Net Skins Result": netSkinsResultRows,
    };
  }
  const {
    "Live Matches": liveRows,
    Matches: permanentRows,
    "Live Tournaments": liveTournaments,
    Players: players,
    "Team Names": teamRows,
    Tournaments: tournaments,
    Courses: courses,
    "Tournament Rules": rules,
    "Live Hole Scores": liveHoleScores,
    "Course Holes": courseHoles,
    "Tournament Itinerary": itineraryRows,
    "Net Skins": netSkinsRows,
    "Net Skins Result": netSkinsResultRows,
  } = sheets;

  const active = [...liveTournaments]
    .filter((row) => tournamentYear(row))
    .sort((a, b) => tournamentYear(b) - tournamentYear(a))[0] || {};
  const year = tournamentYear(active) || Math.max(...tournaments.map(tournamentYear).filter(Boolean));
  const tournamentRow = tournaments.find((row) => tournamentYear(row) === year) || {};
  const selectedTournamentId = assertValidTournamentId(tournamentId(tournamentRow) || String(year));
  const yearTeams = teamRows.filter((row) => recordBelongsToTournament(row, selectedTournamentId, year));
  const teams = {
    1: { id: "", name: "Team 1", logo: "", captainId: "", primaryColor: "", secondaryColor: "" },
    2: { id: "", name: "Team 2", logo: "", captainId: "", primaryColor: "", secondaryColor: "" },
  };
  for (const row of yearTeams) {
    const side = Number(clean(row["Team Side"]).match(/(1|2)/)?.[1]);
    if (side) teams[side] = {
      id: row["Team ID"] || "",
      name: row["Team Names"] || row["Team Name"] || `Team ${side}`,
      logo: row["Team Logo"] || row["Logo Filename"] || "",
      captainId: row["Captain Player ID"] || row.Captain || "",
      primaryColor: row["Primary Color"] || "",
      secondaryColor: row["Secondary Color"] || "",
    };
  }

  const playerMap = Object.fromEntries(players.map((row) => [row["Player ID"], {
    name: row["Display Name"] || `${row.First || ""} ${row.Last || ""}`.trim(),
    slug: row.Slug || "",
    photo: row["Photo Filename"] || "",
    active: truthy(row.Active),
    captain: [teams[1].captainId, teams[2].captainId].includes(row["Player ID"]) || truthy(row.Captain),
  }]));
  const courseMap = Object.fromEntries(courses.filter((row) => recordBelongsToTournament(row, selectedTournamentId, year)).map((row) => [row["Course ID"], {
    id: row["Course ID"], name: row["Course Name"] || row.Course || row["Full Course Name"] || row["Course ID"],
    logo: row["Course Logo"] || row["Logo Filename"] || "", tee: row["Tee Played"] || row.Tee || "",
  }]));
  const rulesByRound = Object.fromEntries(rules.filter((row) => recordBelongsToTournament(row, selectedTournamentId, year)).map((row) => [Number(clean(row.Round).match(/\d+/)?.[0]), row]));
  const configuredMatches = permanentRows.filter((row) => recordBelongsToTournament(row, selectedTournamentId, year));
  const currentLiveRows = liveRows.filter((row) => recordBelongsToTournament(row, selectedTournamentId, year));
  const sourceIds = [...new Set([...configuredMatches, ...currentLiveRows].map((row) => clean(row["Match ID"])).filter(Boolean))];
  // Older preview rows can store the original assignment without tournament
  // metadata, while the finalized row carries the scoped result. Once a match
  // is in the selected tournament, join every row for that stable Match ID so
  // finalization cannot discard its original handicap allocation.
  const liveMap = mergeRowsByStableMatchId(liveRows, sourceIds);
  const permanentMap = mergeRowsByStableMatchId(permanentRows, sourceIds);
  const scoringMatchMap = new Map(sourceIds.map((matchId) => {
    const merged = { ...(permanentMap.get(matchId) || {}) };
    for (const [field, value] of Object.entries(liveMap.get(matchId) || {})) {
      if (clean(value)) merged[field] = value;
    }
    return [matchId, merged];
  }));
  const expectedByRound = new Map();
  for (const row of configuredMatches.length ? configuredMatches : currentLiveRows) {
    const round = Number(row.Round);
    if (round) expectedByRound.set(round, (expectedByRound.get(round) || 0) + 1);
  }

  const matches = sourceIds.map((matchId) => {
      const permanent = permanentMap.get(matchId) || {};
      const liveRow = liveMap.get(matchId) || permanent;
      const permanentStatus = clean(permanent["Match Status"]);
      const permanentFinal = /^(final|finalized|ghost match)$/i.test(permanentStatus) || clean(permanent["Finalized At"]);
      const authoritative = permanentFinal ? resultFields(permanent, liveRow) : liveRow;
      const matchRow = scoringMatchMap.get(matchId) || liveRow;
      const rawStatus = clean(authoritative["Match Status"] || liveRow["Match Status"]);
      const publicResultAllowed = permanentFinal || isLiveMatch({ status: rawStatus });
      const status = permanentFinal
        ? (/^ghost match$/i.test(permanentStatus) ? "Ghost Match" : "Final")
        : isLiveMatch({ status: rawStatus }) ? rawStatus : "Scheduled";
      const format = clean(matchRow.Format).toUpperCase();
      const round = Number(matchRow.Round) || 1;
      const courseId = matchRow["Course ID"] || "";
      const course = courseMap[courseId] || { id: courseId, name: courseId, logo: "", tee: "" };
      const rule = rulesByRound[round] || {};
      const matchHoleScores = liveHoleScores.filter((row) => clean(row["Match ID"]) === matchId);
      const standardFinalResult = permanentFinal
        ? finalizedMatchResult(authoritative, matchHoleScores, { 1: teams[1].name, 2: teams[2].name })
        : "";
      return {
        id: matchId,
        round,
        match: matchRow.Match || "",
        format,
        formatName: displayFormat(format),
        course,
        teeTime: formatTime(matchRow["Tee Time"]),
        status,
        sourceStatus: rawStatus,
        archiveFinal: permanentFinal,
        scoreConflict: truthy(liveRow["Score Conflict"] || liveRow["Scoring Conflict"] || liveRow.Conflict),
        finalizedAt: permanentFinal ? (authoritative["Finalized At"] || "") : "",
        updatedAt: authoritative["Updated At"] || liveRow["Updated At"] || "",
        updatedBy: authoritative["Updated By"] || liveRow["Updated By"] || "",
        notes: publicResultAllowed ? replaceTeamIds(authoritative.Notes, teams) : "",
        liveStatusText: publicResultAllowed ? replaceTeamIds(authoritative["Match Status Text"], teams) : "",
        finalResult: standardFinalResult,
        team1HolesWon: number(authoritative["Team 1 Holes Won"]) ?? 0,
        team2HolesWon: number(authoritative["Team 2 Holes Won"]) ?? 0,
        currentHole: number(authoritative["Current Hole"]) ?? 0,
        team1Players: [playerEntry(matchRow, 1, 1, playerMap), playerEntry(matchRow, 1, 2, playerMap)].filter(Boolean),
        team2Players: [playerEntry(matchRow, 2, 1, playerMap), playerEntry(matchRow, 2, 2, playerMap)].filter(Boolean),
        team1PlayingHcp: firstNumber(matchRow, ["Team 1 Playing HCP", "Team 1 Playing Handicap", "Team 1 HCP"]),
        team2PlayingHcp: firstNumber(matchRow, ["Team 2 Playing HCP", "Team 2 Playing Handicap", "Team 2 HCP"]),
        team1Stroke: firstNumber(matchRow, ["Team 1 Stroke", "Team 1 Strokes"]),
        team2Stroke: firstNumber(matchRow, ["Team 2 Stroke", "Team 2 Strokes"]),
        matchupWinner: publicResultAllowed ? normalizeWinner(authoritative["Matchup Winner"]) : "",
        frontWinner: publicResultAllowed ? normalizeWinner(authoritative["Front 9 Winner"]) : "",
        backWinner: publicResultAllowed ? normalizeWinner(authoritative["Back 9 Winner"]) : "",
        overallWinner: publicResultAllowed ? normalizeWinner(authoritative["18-Hole Winner"] || authoritative["Matchup Winner"]) : "",
        team1Points: publicResultAllowed ? number(authoritative["Team 1 Points"]) : null,
        team2Points: publicResultAllowed ? number(authoritative["Team 2 Points"]) : null,
        pointsAvailable: number(rule["Points Available"]) ?? 3,
        expectedRoundMatchCount: expectedByRound.get(round) || 0,
        // Storytelling receives only the official, non-score hole outcome
        // projection. This keeps editorial intelligence grounded in the same
        // normalized source as Game Center without exposing or duplicating the
        // score-entry model.
        holeResults: matchHoleScores.map((row) => ({
          holeNumber: number(row["Hole Number"]),
          winner: normalizeWinner(row["Hole Winner"]),
          updatedAt: row["Updated At"] || authoritative["Updated At"] || "",
        })).filter((row) => row.holeNumber !== null && row.winner),
      };
    });

  const configuredStatus = tournamentRow["Tournament Status"] || active["Tournament Status"] || "Upcoming";
  const configuredRound = tournamentRow["Current Round"] || active["Current Round"] || 1;
  const statusMode = tournamentRow["Status Mode"] || "Automatic";
  const effective = getEffectiveTournamentState({ matches, configuredStatus, configuredRound, statusMode });
  const currentRound = effective.currentRound;
  const status = effective.status;
  const rounds = [...new Set(matches.map((match) => match.round))].sort((a, b) => a - b).map((roundNumber) => {
    const roundMatches = matches.filter((match) => match.round === roundNumber).sort((a, b) => Number(a.match) - Number(b.match));
    const course = roundMatches[0]?.course || {};
    const round = { number: roundNumber, label: `Round ${roundNumber}`, format: roundMatches[0]?.formatName || displayFormat(rulesByRound[roundNumber]?.Format), course, matches: roundMatches };
    return { ...round, status: roundStatus(round, status, currentRound), progress: getRoundProgress(round) };
  });

  const finalizedMatches = matches.filter(isOfficialMatchResult);
  const finalizedScore = finalizedMatches.reduce((score, match) => ({
    teamOne: score.teamOne + (match.team1Points ?? 0),
    teamTwo: score.teamTwo + (match.team2Points ?? 0),
  }), { teamOne: 0, teamTwo: 0 });
  const tournament = {
    id: selectedTournamentId,
    year,
    name: tournamentRow["Tournament Name"] || tournamentRow.Name || "Sandbagger Invitational",
    status,
    configuredStatus,
    statusMode,
    effective,
    currentRound,
    location: tournamentRow.Destination || tournamentRow.Location || "",
    dates: tournamentRow.Dates || "",
    startDate: tournamentRow["Start Date"] || "",
    startTime: tournamentRow["Start Time"] || tournamentRow["Tournament Start Time"] || "",
    timeZone: tournamentRow["Time Zone"] || tournamentRow.Timezone || "America/Chicago",
    liveMessage: active["Live Message"] || "",
    lastUpdated: active["Last Updated"] || "",
    logo: tournamentRow["Tournament Logo Filename"] || tournamentRow["Logo Filename"] || "",
    tieAdvantageSide: tieAdvantageSide(tournamentRow, teams),
    directorAutomation: {
      enabled: truthy(tournamentRow["Director Automation Enabled"]),
      autoOpenRound: truthy(tournamentRow["Auto Open Round"]),
      autoSetMatchesLive: truthy(tournamentRow["Auto Set Matches Live"]),
    },
    teamOne: { ...teams[1], score: finalizedScore.teamOne },
    teamTwo: { ...teams[2], score: finalizedScore.teamTwo },
  };
  const state = getTournamentState({ tournament, rounds });
  const schedule = itineraryRows
    .filter((row) => recordBelongsToTournament(row, selectedTournamentId, year))
    .filter((row) => !clean(row.Status) || clean(row.Status).toLowerCase() === "published")
    .map((row) => ({
      id: row["Event ID"] || `${row["Event Date"]}:${row["Start Time"]}:${row.Title}`,
      date: row["Event Date"] || "",
      dayLabel: row["Day Label"] || "",
      startTime: formatTime(row["Start Time"]),
      endTime: formatTime(row["End Time"]),
      type: row["Event Type"] || "Tournament",
      title: row.Title || "Tournament event",
      subtitle: row.Subtitle || "",
      location: row.Location || "",
      details: row.Details || "",
      roundId: row["Round ID"] || "",
      courseId: row["Course ID"] || "",
      featured: truthy(row.Featured),
      order: number(row["Display Order"]) ?? 9999,
    }))
    .sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || a.order - b.order);

  const scoreLeaderboard = buildScoreLeaderboard(
    liveHoleScores.filter((row) => liveMap.has(clean(row["Match ID"]))),
    scoringMatchMap,
    courseHoles,
    playerMap
  );
  const netSkins = calculateNetSkins({ entries: netSkinsRows, scoreRows: scoreLeaderboard, activeYear: year });
  netSkins.rounds = netSkins.rounds.map((skinsRound) => ({
    ...skinsRound,
    finalized: skinsRound.complete && skinsRound.matches.every((matchNumber) =>
      matches.some((match) => Number(match.round) === Number(skinsRound.round) && clean(match.match) === clean(matchNumber) && isOfficialMatchResult(match))
    ),
  }));
  netSkins.storedResults = netSkinsResultRows.filter((row) => Number(row.Year) === Number(year));

  return {
    workbookChecks,
    tournament: { ...tournament, state },
    rounds,
    remainingByRound: remainingByRound(rounds),
    momentum: getTeamMomentum(rounds),
    leaderboard: buildLeaderboard(matches, playerMap, teams),
    scoreLeaderboard,
    netSkins,
    roundLeaderboards: Object.fromEntries(
      [...new Set(matches.map((match) => match.round))].map((round) => [
        round,
        buildLeaderboard(matches.filter((match) => match.round === round), playerMap, teams),
      ])
    ),
    schedule,
  };
}

let pendingTournamentData;
let lastGoodTournamentData;
let lastGoodAt = 0;
const loaderDiagnostics = {
  result: "idle",
  cacheBehavior: "miss",
  staleFallbacks: 0,
  errorCategory: "",
  workbookCheck: "",
  requiredSheetsFound: false,
};

export async function getTournamentData() {
  if (pendingTournamentData) {
    loaderDiagnostics.cacheBehavior = "in-flight-dedupe";
    return pendingTournamentData;
  }
  loaderDiagnostics.cacheBehavior = "miss";
  pendingTournamentData = buildTournamentData()
    .then((data) => {
      lastGoodTournamentData = data;
      lastGoodAt = Date.now();
      loaderDiagnostics.result = "success";
      loaderDiagnostics.errorCategory = "";
      loaderDiagnostics.workbookCheck = "";
      loaderDiagnostics.requiredSheetsFound = true;
      return data;
    })
    .catch((error) => {
      loaderDiagnostics.result = "error";
      loaderDiagnostics.errorCategory = error?.category || "unknown";
      loaderDiagnostics.workbookCheck = error?.workbookCheck || "";
      if (isTransientGoogleError(error) && lastGoodTournamentData && Date.now() - lastGoodAt < 60_000) {
        loaderDiagnostics.cacheBehavior = "stale-on-transient-error";
        loaderDiagnostics.staleFallbacks += 1;
        return lastGoodTournamentData;
      }
      throw error;
    })
    .finally(() => {
      pendingTournamentData = undefined;
    });
  return pendingTournamentData;
}

export function tournamentLoaderDiagnostics() {
  return {
    ...loaderDiagnostics,
    lastGoodAgeMs: lastGoodAt ? Date.now() - lastGoodAt : null,
    google: normalizedReadDiagnostics(),
  };
}
