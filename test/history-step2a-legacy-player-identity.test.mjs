import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  LEGACY_HISTORY_UNRESOLVED_PLAYER_NAME,
  legacyHistoryMatchPlayerIds,
  resolveLegacyHistoryLeaderboardPlayer,
} from "../lib/legacy-history-player-identity.js";

const archive = JSON.parse(await readFile(new URL("../lib/historical-data.json", import.meta.url), "utf8"));
const playerMap = Object.fromEntries(archive.players.map((player) => [player["Player ID"], player]));
const clean = (value) => String(value ?? "").trim();

function outcome(match, side) {
  const winner = clean(match["Matchup Winner"]).toLowerCase();
  if (["halved", "half", "tie"].includes(winner)) return "half";
  return winner === `team ${side}` ? "win" : "loss";
}

function sidePoints(match, side) {
  const points = Number(match[`Team ${side} Points`]);
  if (!Number.isFinite(points)) return 0;
  return ["BB", "SC"].includes(clean(match.Format).toUpperCase()) ? points / 2 : points;
}

function standings(year, participants = legacyHistoryMatchPlayerIds) {
  const rows = new Map();
  for (const match of archive.matches.filter((row) => Number(row.Year) === year)) {
    for (const side of [1, 2]) {
      for (const id of participants(match, side)) {
        if (!rows.has(id)) rows.set(id, { id, wins: 0, losses: 0, halves: 0, points: 0 });
        const row = rows.get(id);
        row.points += sidePoints(match, side);
        const result = outcome(match, side);
        if (result === "win") row.wins += 1;
        if (result === "loss") row.losses += 1;
        if (result === "half") row.halves += 1;
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses);
}

const legacyUnawareParticipants = (match, side) => [
  match[`Team ${side} Player 1`],
  match[`Team ${side} Player 2`],
].map(clean).filter(Boolean);

test("the observed 465 row is a repeated non-participant Singles slot, not a historical golfer", () => {
  const contaminated = archive.matches.filter((match) =>
    Number(match.Year) >= 2020 && Number(match.Year) <= 2025 &&
    clean(match.Format).toUpperCase() === "SI" &&
    [match["Team 1 Player 2"], match["Team 2 Player 2"]].some((value) => clean(value) === "465")
  );
  assert.equal(contaminated.length, 72);
  assert.equal(contaminated.flatMap((match) => [match["Team 1 Player 2"], match["Team 2 Player 2"]]).filter((value) => clean(value) === "465").length, 144);
  assert.equal(playerMap["465"], undefined);
  assert.equal(archive.handicaps.some((row) => clean(row["Player ID"]) === "465"), false);
  assert.deepEqual(legacyHistoryMatchPlayerIds(contaminated[0], 1), [clean(contaminated[0]["Team 1 Player 1"])]);
  assert.deepEqual(legacyHistoryMatchPlayerIds(contaminated[0], 2), [clean(contaminated[0]["Team 2 Player 1"])]);
});

test("Singles reads Player 1 only while Best Ball and Scramble retain both canonical participants", () => {
  assert.deepEqual(legacyHistoryMatchPlayerIds({ Format: "SI", "Team 1 Player 1": " AM01 ", "Team 1 Player 2": "465" }, 1), ["AM01"]);
  assert.deepEqual(legacyHistoryMatchPlayerIds({ Format: "BB", "Team 1 Player 1": "AM01", "Team 1 Player 2": " BC01 " }, 1), ["AM01", "BC01"]);
  assert.deepEqual(legacyHistoryMatchPlayerIds({ Format: "SC", "Team 2 Player 1": "CP01", "Team 2 Player 2": "JP01" }, 2), ["CP01", "JP01"]);
});

test("year-scoped canonical identity accepts proven number/string serialization but not decimal over-normalization", () => {
  const numericPlayer = { "Player ID": "465", "Display Name": "Canonical Numeric Nickname" };
  const context = { year: 2025, playerMap: { "465": numericPlayer }, rosterRows: [{ Year: 2025, "Player ID": 465 }] };
  assert.equal(resolveLegacyHistoryLeaderboardPlayer({ ...context, playerId: 465 }).player, numericPlayer);
  assert.equal(resolveLegacyHistoryLeaderboardPlayer({ ...context, playerId: " 465 " }).player, numericPlayer);
  assert.equal(resolveLegacyHistoryLeaderboardPlayer({ ...context, playerId: "465.0" }).resolved, false);
});

test("missing or conflicting legacy identity uses an archive-safe name rather than exposing a raw ID", () => {
  const missingId = resolveLegacyHistoryLeaderboardPlayer({ playerId: "", year: 2025, playerMap, rosterRows: archive.handicaps });
  assert.equal(missingId.player, null);
  const unknown = resolveLegacyHistoryLeaderboardPlayer({ playerId: "INTERNAL-77", year: 2025, playerMap, rosterRows: archive.handicaps });
  assert.equal(unknown.resolved, false);
  assert.equal(unknown.player["Display Name"], LEGACY_HISTORY_UNRESOLVED_PLAYER_NAME);
  assert.notEqual(unknown.player["Display Name"], unknown.id);
  const wrongYear = resolveLegacyHistoryLeaderboardPlayer({ playerId: "AM01", year: 2017, playerMap, rosterRows: archive.handicaps });
  assert.equal(wrongYear.resolved, false);
  assert.equal(wrongYear.reason, "YEAR_ROSTER_MISSING");
});

test("all 2017–2025 standings resolve exactly to their canonical year rosters", () => {
  const expectedCounts = { 2017: 16, 2018: 20, 2019: 20, 2020: 24, 2021: 24, 2022: 24, 2023: 24, 2024: 24, 2025: 24 };
  for (const [yearText, expected] of Object.entries(expectedCounts)) {
    const year = Number(yearText);
    const rows = standings(year);
    assert.equal(rows.length, expected, `${year} row count`);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, `${year} duplicate IDs`);
    for (const row of rows) {
      const identity = resolveLegacyHistoryLeaderboardPlayer({ playerId: row.id, year, playerMap, rosterRows: archive.handicaps });
      assert.equal(identity.resolved, true, `${year} ${row.id}`);
      assert.ok(clean(identity.player["Display Name"]), `${year} ${row.id} display name`);
    }
  }
});

test("the actual 2025 phantom row is removed without changing any real player record or points", () => {
  const before = standings(2025, legacyUnawareParticipants);
  const after = standings(2025);
  assert.deepEqual(before[0], { id: "465", wins: 10, losses: 10, halves: 4, points: 36 });
  assert.equal(after.some((row) => row.id === "465"), false);
  const beforeReal = Object.fromEntries(before.filter((row) => row.id !== "465").map((row) => [row.id, row]));
  assert.deepEqual(Object.fromEntries(after.map((row) => [row.id, row])), beforeReal);
  assert.deepEqual(after.slice(0, 3), [
    { id: "CL01", wins: 3, losses: 0, halves: 0, points: 6 },
    { id: "AM01", wins: 3, losses: 0, halves: 0, points: 5.5 },
    { id: "BA01", wins: 2, losses: 0, halves: 1, points: 5.25 },
  ]);
  assert.deepEqual(after.at(-1), { id: "CP01", wins: 0, losses: 3, halves: 0, points: 0.25 });
});

test("the same phantom-slot defect is removed from 2020–2024 with real statistics unchanged", () => {
  for (let year = 2020; year <= 2024; year += 1) {
    const before = standings(year, legacyUnawareParticipants);
    const after = standings(year);
    assert.equal(before.filter((row) => row.id === "465").length, 1, `${year} phantom before`);
    assert.equal(after.some((row) => row.id === "465"), false, `${year} phantom after`);
    assert.deepEqual(
      Object.fromEntries(after.map((row) => [row.id, row])),
      Object.fromEntries(before.filter((row) => row.id !== "465").map((row) => [row.id, row])),
      `${year} real statistics`,
    );
  }
});

test("Step 2A leaves scorecard-count presentation and Step 1 roster metadata code untouched", async () => {
  const [yearPage, teamPage, metadata] = await Promise.all([
    readFile(new URL("../app/history/[year]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/history/[year]/team/[side]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/history-team-metadata.js", import.meta.url), "utf8"),
  ]);
  assert.match(yearPage, /scorecardCoverage\.available} of \$\{scoringStatistics\.scorecardCoverage\.expected/);
  assert.match(teamPage, /team\.captainId === player\["Player ID"\]/);
  assert.match(teamPage, /formatHistoryTournamentHandicap/);
  assert.match(metadata, /export function formatHistoryTournamentHandicap/);
  assert.match(metadata, /parentheticalNegative \? -Math\.abs\(parsed\) : parsed/);
});
