import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isTournamentDirector, normalizePlayerRole } from "../lib/player-role.js";
import { directorAutomationDue, directorRoundStatus, tournamentDirectorModel } from "../lib/tournament-director.js";

const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Players roles are data-driven and safely default to PLAYER", () => {
  assert.equal(normalizePlayerRole(), "PLAYER");
  assert.equal(normalizePlayerRole("player"), "PLAYER");
  assert.equal(normalizePlayerRole("DIRECTOR"), "DIRECTOR");
  assert.equal(isTournamentDirector({ player: { role: "DIRECTOR" } }), true);
  assert.equal(isTournamentDirector({ player: {} }), false);
  const writes = source("lib/google-sheets-write.js");
  assert.match(writes, /role: normalizePlayerRole\(player\.Role\)/);
  assert.doesNotMatch(writes, /Clay Beltran.*DIRECTOR|DIRECTOR.*Clay Beltran/);
  assert.match(source("lib/admin-cms-config.js"), /field\("Role", "Tournament role", "select", \{ options: \["PLAYER", "DIRECTOR"\] \}\)/);
});

test("Director menu is exposed only after the authenticated role resolves", () => {
  const menu = source("app/Menu.js");
  assert.match(menu, /setDirector\(player\?\.role === "DIRECTOR"\)/);
  assert.match(menu, /director \? <Link className="directorMenuLink" href="\/admin\/director"/);
});

test("round and tournament health summarize authoritative match statuses", () => {
  const matches = [
    { id: "M1", status: "Final", updatedAt: "2026-07-01T12:00:00Z", course: { name: "Ocean" }, team1Players: [{}], team2Players: [{}] },
    { id: "M2", status: "Live", currentHole: 18, course: { name: "Ocean" }, team1Players: [{}], team2Players: [{}] },
    { id: "M3", status: "Reopened", course: { name: "Ocean" }, team1Players: [{}], team2Players: [{}] },
    { id: "M4", status: "Scheduled", course: { name: "Ocean" }, team1Players: [{}], team2Players: [{}] },
  ];
  assert.deepEqual(directorRoundStatus({ matches }), { final: 1, live: 2, upcoming: 1, total: 4, status: "LIVE" });
  const model = tournamentDirectorModel({ tournament: { currentRound: 1 }, rounds: [{ number: 1, matches }] });
  assert.deepEqual({ live: model.health.live, upcoming: model.health.upcoming, final: model.health.final, awaiting: model.health.awaitingConfirmation, reopened: model.health.reopened }, { live: 2, upcoming: 1, final: 1, awaiting: 1, reopened: 1 });
});

test("automation becomes due only within the configured 30-minute opening window", () => {
  const model = { automation: { enabled: true, autoOpenRound: true, windowMinutes: 30 }, rounds: [{ number: 2, status: "UPCOMING", firstTeeTime: "8:00 AM" }] };
  assert.equal(directorAutomationDue(model, new Date("2026-07-01T07:35:00")), 2);
  assert.equal(directorAutomationDue(model, new Date("2026-07-01T07:20:00")), null);
  assert.equal(directorAutomationDue({ ...model, automation: { ...model.automation, enabled: false } }, new Date("2026-07-01T07:35:00")), null);
});

test("Director API requires Passport DIRECTOR authorization and uses audited writers", () => {
  const route = source("app/api/director/route.js");
  assert.match(route, /inspectPlayerPassportToken/);
  assert.match(route, /isTournamentDirector/);
  assert.match(route, /status: 403/);
  assert.match(route, /updateLiveMatch/);
  assert.match(route, /reopenLiveMatch/);
  assert.match(route, /updateTournamentAdminData/);
  assert.match(route, /directorAutomationDue/);
  assert.doesNotMatch(route, /x-live-admin-secret|ADMIN_SECRET/);
});

test("Director dashboard contains operations, health, attention, automation, and Full Admin access", () => {
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  for (const label of ["Round Status", "Tournament Health", "Attention Required", "Quick Actions", "Open Round", "Set All LIVE", "Close Round", "Reopen Match", "Leaderboards", "Tournament Overview", "Automation", "Recent Activity", "Open Full Admin"]) assert.match(dashboard, new RegExp(label));
  assert.match(source("app/admin/director/director.module.css"), /env\(safe-area-inset-bottom\)/);
  assert.match(dashboard, /setInterval\(check, 60_000\)/);
});

test("PLAYER accounts are redirected away from the Director page", () => {
  const page = source("app/admin/director/page.js");
  assert.match(page, /!isTournamentDirector\(result\.identity\)\) redirect\("\/home"\)/);
});
