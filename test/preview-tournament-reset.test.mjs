import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PREVIEW_RESET_PRESERVES,
  recordInPreviewTournament,
  resetPreviewMatchRecord,
  resetPreviewTournamentRows,
} from "../lib/preview-tournament-reset.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Preview reset clears match runtime fields without changing pairings or configuration", () => {
  const match = {
    "Tournament ID": "SBI-2026", Year: 2026, Round: 3, Match: 4, Format: "SI",
    "Team 1 Player 1": "P1", "Team 2 Player 1": "P2", "Course ID": "OCEAN", "Tee Time": "10:50 AM",
    "Match Status": "Final", "Team 1 Points": "3", "Team 2 Points": "0", "Match Status Text": "3 & 2",
    "Current Hole": "16", "Access Active": "TRUE", "Access Selector": "selector", "Access Version": "4",
    "Finalized At": "2026-09-26T17:00:00Z", "Finalized By": "Director",
  };
  const reset = resetPreviewMatchRecord(match, "2026-08-04T12:00:00Z");
  assert.equal(reset["Match Status"], "Scheduled");
  assert.equal(reset["Team 1 Points"], "");
  assert.equal(reset["Current Hole"], "");
  assert.equal(reset["Access Active"], "FALSE");
  assert.equal(reset["Access Selector"], "");
  assert.equal(reset["Access Version"], "5");
  assert.equal(reset["Team 1 Player 1"], "P1");
  assert.equal(reset["Team 2 Player 1"], "P2");
  assert.equal(reset["Course ID"], "OCEAN");
  assert.equal(reset["Tee Time"], "10:50 AM");
});

test("Preview reset is scoped to the active tournament and retains ghost pairings", () => {
  const scope = { tournamentId: "SBI-2026", year: 2026 };
  assert.equal(recordInPreviewTournament({ "Tournament ID": "SBI-2026", Year: 2025 }, scope), true);
  assert.equal(recordInPreviewTournament({ "Tournament ID": "SBI-2025", Year: 2026 }, scope), false);
  const rows = resetPreviewTournamentRows([
    { "Tournament ID": "SBI-2026", "Match Status": "Ghost Match", "Match ID": "G1" },
    { "Tournament ID": "SBI-2025", "Match Status": "Final", "Match ID": "M1" },
  ], scope, { resetMatches: true });
  assert.equal(rows[0]["Match Status"], "Ghost Match");
  assert.equal(rows[1]["Match Status"], "Final");
});

test("Preview reset removes only current-tournament result rows", () => {
  const rows = resetPreviewTournamentRows([
    { Year: 2026, Round: 1, Hole: 2, Winner: "P1" },
    { Year: 2025, Round: 1, Hole: 7, Winner: "P2" },
  ], { tournamentId: "SBI-2026", year: 2026 });
  assert.deepEqual(rows, [{ Year: 2025, Round: 1, Hole: 7, Winner: "P2" }]);
  for (const item of ["Players", "Teams", "Pairings", "Courses", "Schedule", "Dining", "Rules", "Local Guide", "Important Contacts", "Tournament configuration", "Workbook structure"]) {
    assert.ok(PREVIEW_RESET_PRESERVES.includes(item));
  }
});

test("reset endpoint is Preview-only, Director-authorized, and refreshes participant views", async () => {
  const route = await source("app/api/director/reset-preview/route.js");
  const handler = route.slice(route.indexOf("export async function POST"));
  const previewGuard = handler.indexOf('process.env.VERCEL_ENV !== "preview"');
  const authorization = handler.indexOf("inspectTournamentDirectorToken");
  const reset = handler.indexOf("resetPreviewTournament(data.tournament.id");
  assert.ok(previewGuard >= 0 && previewGuard < authorization && authorization < reset);
  assert.match(route, /authorization\.status !== "active"/);
  assert.match(route, /Tournament Director access is required/);
  assert.match(route, /Preview Tournament Reset Complete/);
  assert.match(route, /Ready for Dress Rehearsal\./);
  for (const path of ["/admin/director", "/home", "/live", "/my-match", "/leaderboards"]) assert.match(route, new RegExp(path.replace("/", "\\/")));
});

test("Director UI requires explicit confirmation and exposes reset only with Preview QA tools", async () => {
  const dashboard = await source("app/admin/director/DirectorDashboard.js");
  assert.match(dashboard, /data\.qaTools \? <section/);
  assert.match(dashboard, /🔄 Reset Preview Tournament/);
  assert.match(dashboard, /Reset Preview Tournament\?/);
  assert.match(dashboard, /Production data will NOT be affected\./);
  assert.match(dashboard, />Cancel<\/button>/);
  assert.match(dashboard, /"Reset Preview"/);
  assert.match(dashboard, /Preview Tournament Reset Complete/);
  assert.match(dashboard, /Ready for Dress Rehearsal\./);
});
