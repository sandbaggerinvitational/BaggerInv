import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { withCanonicalDraftTeamAverages } from "../lib/draft-team-handicap.js";
import { buildHistory2026Adapter } from "../lib/history-2026-adapter.js";
import { mergeHistoryTournamentPlayerMetadata } from "../lib/history-team-metadata.js";
import {
  makeGuideProjection,
  makeHistory2026Aggregate,
} from "./fixtures/history-2026.mjs";

const revisionSix = Object.freeze({
  PICKLES: Object.freeze([10.8, 7.8, 7.9, 7.9, 12.2, 5.7, 1.5, 13, 2.8, 1.6, 6.4, -0.8]),
  LIPPIT: Object.freeze([8.5, 11.6, 13.8, 7.5, 9.8, 1, 0.7, 7.8, 4.5, -0.7, 12.4, 0.4]),
});

const teamIdForSide = (side) => Number(side) === 1 ? "PICKLES" : "LIPPIT";

function revisionSixCoreView(aggregate) {
  const sideByPlayer = new Map();
  for (const match of aggregate.matches) {
    for (const participant of match.participants) {
      sideByPlayer.set(participant.player_id, participant.team_side);
    }
  }
  const offsets = { PICKLES: 0, LIPPIT: 0 };
  const captainIds = { PICKLES: "HM01", LIPPIT: "MS01" };
  return {
    players: aggregate.players.map((player) => {
      const teamId = teamIdForSide(sideByPlayer.get(player.player_id));
      const tournamentHandicap = revisionSix[teamId][offsets[teamId]];
      offsets[teamId] += 1;
      return {
        player_id: player.player_id,
        team_id: teamId,
        team_side: sideByPlayer.get(player.player_id),
        participation_status: "ACTIVE",
        tournament_source_payload: { "Tournament Handicap": tournamentHandicap },
        presentation: { captain: player.player_id === captainIds[teamId] },
      };
    }),
  };
}

test("2026 roster presentation derives the approved revision-6 team totals and averages", () => {
  const aggregate = makeHistory2026Aggregate();
  const merged = mergeHistoryTournamentPlayerMetadata(aggregate, revisionSixCoreView(aggregate));
  const view = buildHistory2026Adapter(merged, { guideProjection: makeGuideProjection() });
  const pickles = view.tournament.teams.find((team) => team.id === "PICKLES");
  const lippit = view.tournament.teams.find((team) => team.id === "LIPPIT");
  const sum = (team) => team.roster.reduce((total, row) => total + row.handicap, 0);

  assert.equal(pickles.roster.length, 12);
  assert.equal(lippit.roster.length, 12);
  assert.equal(new Set(pickles.roster.map((row) => row.player["Player ID"])).size, 12);
  assert.equal(new Set(lippit.roster.map((row) => row.player["Player ID"])).size, 12);
  assert.ok(Math.abs(sum(pickles) - 76.8) < 1e-9);
  assert.ok(Math.abs(sum(lippit) - 77.3) < 1e-9);
  assert.ok(Math.abs(pickles.averageHandicap - 6.4) < 1e-9);
  assert.ok(Math.abs(lippit.averageHandicap - (77.3 / 12)) < 1e-9);
  assert.equal(lippit.averageHandicap.toFixed(1), "6.4");
  assert.ok(pickles.roster.some((row) => row.player["Player ID"] === pickles.captainId));
  assert.ok(lippit.roster.some((row) => row.player["Player ID"] === lippit.captainId));
});

test("the public 2026 overview enables the existing bounded canonical handicap join", async () => {
  const page = await readFile(new URL("../app/history/[year]/page.js", import.meta.url), "utf8");
  const productionBranch = page.slice(
    page.indexOf("if (useSupabase2026)"),
    page.indexOf("} else if (useSupabaseCompleted)"),
  );

  assert.match(productionBranch, /loadHistory2026View\(\{[\s\S]*includeTournamentPlayerMetadata:\s*true/);
  assert.doesNotMatch(productionBranch, /google-sheets-data|gviz|docs\.google/i);
});

test("the shared Draft average remains stable-ID scoped and fails closed on incomplete coverage", () => {
  const base = {
    year: 2026,
    teams: [
      { id: "PICKLES", side: "Team 1", averageHandicap: null },
      { id: "LIPPIT", side: "Team 2", averageHandicap: null },
    ],
    picks: [],
    rosters: [],
  };
  const players = [
    ...revisionSix.PICKLES.map((tournament_handicap, index) => ({
      player_id: `P${index}`,
      team_id: "PICKLES",
      team_side: 2,
      participation_status: "ACTIVE",
      tournament_handicap,
    })),
    ...revisionSix.LIPPIT.map((tournament_handicap, index) => ({
      player_id: `L${index}`,
      team_id: "LIPPIT",
      team_side: 1,
      participation_status: "ACTIVE",
      tournament_handicap,
    })),
    { player_id: "ALUM", team_id: "PICKLES", participation_status: "INACTIVE", tournament_handicap: 99 },
  ];
  const result = withCanonicalDraftTeamAverages(base, players, { tournamentId: "2026" });

  assert.ok(Math.abs(result.teams[0].averageHandicap - 6.4) < 1e-9);
  assert.ok(Math.abs(result.teams[1].averageHandicap - (77.3 / 12)) < 1e-9);

  const incomplete = withCanonicalDraftTeamAverages(base, [
    ...players,
    { player_id: "MISSING", team_id: "PICKLES", participation_status: "ACTIVE", tournament_handicap: null },
  ], { tournamentId: "2026" });
  assert.equal(incomplete.teams[0].averageHandicap, null);
});
