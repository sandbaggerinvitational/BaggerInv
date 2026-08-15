import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildHistory2026Adapter,
  history2026SourceFingerprint,
  history2026TeamPageModel,
} from "../lib/history-2026-adapter.js";
import { mergeHistoryTournamentPlayerMetadata } from "../lib/history-team-metadata.js";
import { formatHandicap } from "../lib/formatters.js";
import {
  makeGuideProjection,
  makeHistory2026Aggregate,
} from "./fixtures/history-2026.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const historicalData = JSON.parse(await source("lib/historical-data.json"));
const historicalPlayers = Object.fromEntries(
  historicalData.players.map((player) => [player["Player ID"], player])
);

function legacyTeam(year, sideNumber) {
  const side = `Team ${sideNumber}`;
  const tournament = historicalData.tournaments.find((row) => Number(row.Year) === year);
  const team = historicalData.teamNames.find(
    (row) => Number(row.Year) === year && row["Team Side"] === side
  );
  const roster = historicalData.handicaps
    .filter((row) => Number(row.Year) === year && row["Team Side"] === side)
    .map((row) => ({ player: historicalPlayers[row["Player ID"]], handicap: row["Tournament Handicap"] }));
  const captainId = team?.Captain || tournament?.[`Captain Team ${sideNumber}`] || null;
  const values = roster.map((row) => Number(row.handicap)).filter(Number.isFinite);
  return {
    name: team?.["Team Names"],
    captainId,
    captain: historicalPlayers[captainId] || null,
    roster,
    averageHandicap: values.length === roster.length && roster.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
  };
}

const expectedCaptains = {
  2017: ["Miles Berger", "Holman Moores"],
  2018: ["Clay Beltran", "Phillip Curry"],
  2019: ["Jupjee Kochar", "Chris Seekely"],
  2020: ["Connor O'Reilly", "Wade Caston"],
  2021: ["Memo Saldana", "Michael Hunnicutt"],
  2022: ["Robert Murphy", "Holman Moores"],
  2023: ["David Tatum", "Clay Beltran"],
  2024: ["Alex Monteleone", "Will Oliver"],
  2025: ["Chase Patterson", "Jason Powell"],
};

function canonicalCoreView(aggregate) {
  return {
    players: aggregate.players.map((player, index) => ({
      player_id: player.player_id,
      tournament_source_payload: {
        "Tournament Handicap": index === 0 ? 0 : index === 1 ? -1.2 : index + 0.4,
      },
      source_payload: { Captain: index === 0 ? "true" : "false" },
      presentation: { captain: index === 0 },
    })),
  };
}

test("2026 Team History joins canonical tournament metadata by Player ID", () => {
  const aggregate = makeHistory2026Aggregate();
  const merged = mergeHistoryTournamentPlayerMetadata(aggregate, canonicalCoreView(aggregate));
  assert.equal(merged.players.length, aggregate.players.length);
  for (let index = 0; index < merged.players.length; index += 1) {
    assert.equal(merged.players[index].player_id, aggregate.players[index].player_id);
    assert.notEqual(merged.players[index].tournament_handicap, null);
  }
  assert.equal(merged.players[0].tournament_handicap, 0);
  assert.equal(merged.players[1].tournament_handicap, -1.2);
  assert.equal(merged.players[0].captain, true);
});

test("2026 captain identity accepts an explicit canonical team projection without name inference", () => {
  const aggregate = makeHistory2026Aggregate();
  const core = canonicalCoreView(aggregate);
  core.players = core.players.map((player) => ({
    ...player,
    presentation: { captain: false },
    source_payload: { Captain: false },
  }));
  const captain = aggregate.players.find((player) => player.player_id === "PK01");
  core.teams = [{
    team_id: "PICKLES",
    team_side: 1,
    source_payload: { "Captain Player ID": captain.player_id },
  }];
  const merged = mergeHistoryTournamentPlayerMetadata(aggregate, core);
  assert.equal(merged.players.find((player) => player.player_id === captain.player_id).captain, true);
  assert.equal(merged.players.filter((player) => player.captain).length, 1);
});

test("2026 Team History never derives Tournament Handicap from round strokes", () => {
  const aggregate = makeHistory2026Aggregate();
  for (const record of aggregate.matches) {
    for (const participant of record.participants) participant.final_strokes = 99;
  }
  const merged = mergeHistoryTournamentPlayerMetadata(aggregate, canonicalCoreView(aggregate));
  assert.equal(merged.players[0].tournament_handicap, 0);
  assert.equal(merged.players[1].tournament_handicap, -1.2);
});

test("a complete canonical handicap set cannot silently collapse to all unavailable on an ID mismatch", () => {
  const aggregate = makeHistory2026Aggregate();
  const wrongIds = canonicalCoreView(aggregate);
  wrongIds.players = wrongIds.players.map((player) => ({
    ...player,
    player_id: `wrong-${player.player_id}`,
  }));
  assert.throws(
    () => mergeHistoryTournamentPlayerMetadata(aggregate, wrongIds),
    (error) => error?.code === "HISTORY_2026_TOURNAMENT_PLAYER_ID_MISMATCH"
  );
});

test("missing, zero, and plus handicaps remain distinct", () => {
  const aggregate = makeHistory2026Aggregate();
  const core = canonicalCoreView(aggregate);
  core.players[2].tournament_source_payload["Tournament Handicap"] = null;
  const merged = mergeHistoryTournamentPlayerMetadata(aggregate, core);
  assert.equal(merged.players[0].tournament_handicap, 0);
  assert.equal(formatHandicap(merged.players[0].tournament_handicap), "0.0");
  assert.equal(formatHandicap(merged.players[1].tournament_handicap), "(1.2)");
  assert.equal(merged.players[2].tournament_handicap, null);
  assert.equal(formatHandicap(merged.players[2].tournament_handicap), "—");
});

test("partial canonical handicaps do not produce a false team average", () => {
  const aggregate = makeHistory2026Aggregate();
  const core = canonicalCoreView(aggregate);
  core.players[0].tournament_source_payload["Tournament Handicap"] = null;
  const view = buildHistory2026Adapter(
    mergeHistoryTournamentPlayerMetadata(aggregate, core),
    { guideProjection: makeGuideProjection() }
  );
  assert.ok(view.tournament.teams.some((team) => team.averageHandicap === null));
});

test("handicap and captain metadata change the adapted-view fingerprint", () => {
  const aggregate = makeHistory2026Aggregate();
  const guideProjection = makeGuideProjection();
  const base = history2026SourceFingerprint(aggregate, { guideProjection });
  const merged = mergeHistoryTournamentPlayerMetadata(aggregate, canonicalCoreView(aggregate));
  assert.notEqual(history2026SourceFingerprint(merged, { guideProjection }), base);
});

test("every bundled 2017-2025 team has complete year-scoped handicaps and a canonical captain", () => {
  for (let year = 2017; year <= 2025; year += 1) {
    for (const sideNumber of [1, 2]) {
      const team = legacyTeam(year, sideNumber);
      assert.ok(team, `${year} Team ${sideNumber} exists`);
      assert.ok(team.roster.length > 0, `${year} ${team.name} has a roster`);
      assert.ok(team.roster.every((row) => Number.isFinite(row.handicap)), `${year} ${team.name} handicaps are complete`);
      assert.ok(Number.isFinite(team.averageHandicap), `${year} ${team.name} average is canonical`);
      assert.equal(team.captain?.["Display Name"], expectedCaptains[year][sideNumber - 1]);
      assert.ok(team.roster.some((row) => row.player["Player ID"] === team.captainId));
      assert.equal(team.roster.filter((row) => row.player["Player ID"] === team.captainId).length, 1);
    }
  }
});

test("known 2025 captain and average facts remain unchanged", () => {
  const bandon = legacyTeam(2025, 1);
  const crispy = legacyTeam(2025, 2);
  assert.equal(bandon.name, "Bandon Brothers");
  assert.equal(bandon.captain["Display Name"], "Chase Patterson");
  assert.equal(formatHandicap(bandon.averageHandicap), "7.4");
  assert.equal(crispy.name, "The Crispy Boys");
  assert.equal(crispy.captain["Display Name"], "Jason Powell");
  assert.equal(formatHandicap(crispy.averageHandicap), "7.3");
});

test("Team History content requests metadata, preserves roster order, and renders an accessible C badge", async () => {
  const [page, adapter, stats, css] = await Promise.all([
    source("app/history/[year]/team/[side]/page.js"),
    source("lib/history-2026-adapter.js"),
    source("lib/stats.js"),
    source("app/historical.module.css"),
  ]);
  assert.equal((page.match(/includeTournamentPlayerMetadata:\s*true/g) || []).length, 1);
  assert.match(page, /Team Captain/);
  assert.match(page, /Tournament Handicap \$\{handicapLabel\}/);
  assert.match(page, /rosterCaptainMarker/);
  assert.match(css, /\.rosterCaptainMarker\s*\{[\s\S]*?width:\s*20px;[\s\S]*?height:\s*20px;/);
  assert.doesNotMatch(adapter, /\.sort\(\(left, right\) => \(number\(left\.handicap/);
  assert.doesNotMatch(stats, /\.sort\(\(a, b\) => a\.handicap - b\.handicap\)/);
});

test("Team History metadata remains one bounded batch read with no Google or live API workaround", async () => {
  const [service, page] = await Promise.all([
    source("lib/history-2026-service.js"),
    source("app/history/[year]/team/[side]/page.js"),
  ]);
  assert.match(service, /readLeaderboardsCoreView/);
  assert.match(service, /Promise\.all/);
  assert.doesNotMatch(service, /api\/live|google-sheets-data|gviz|docs\.google/i);
  assert.doesNotMatch(page, /api\/live|google-sheets-data|gviz|docs\.google/i);
});
