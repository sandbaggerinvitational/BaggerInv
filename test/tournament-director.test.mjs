import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isTournamentDirector, normalizePlayerRole } from "../lib/player-role.js";
import { countdownLabel, directorAutomationDue, directorRoundStatus, tournamentDirectorModel } from "../lib/tournament-director.js";

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
  assert.deepEqual(directorRoundStatus({ matches }), { final: 1, live: 2, upcoming: 1, scoringLocked: 0, total: 4, status: "LIVE" });
  const model = tournamentDirectorModel({ tournament: { currentRound: 1 }, rounds: [{ number: 1, matches }] });
  assert.deepEqual({ live: model.health.live, upcoming: model.health.upcoming, final: model.health.final, awaiting: model.health.awaitingConfirmation, reopened: model.health.reopened }, { live: 2, upcoming: 1, final: 1, awaiting: 1, reopened: 1 });
});

test("Mission Control resolves operating round and the next scheduled event", () => {
  const data = {
    tournament: { currentRound: 2, name: "Sandbagger Invitational", year: 2026, directorAutomation: { enabled: true, autoOpenRound: true } },
    rounds: [
      { number: 1, label: "Round 1", format: "Best Ball", course: { name: "Ocean" }, matches: [{ id: "M1", match: 1, status: "Final", teeTime: "8:00 AM", team1Players: [{ id: "A", playingHcp: 2 }], team2Players: [{ id: "B", playingHcp: 4 }], course: { name: "Ocean" } }] },
      { number: 2, label: "Round 2", format: "Scramble", course: { name: "Osprey" }, matches: [{ id: "M2", match: 1, status: "Scheduled", teeTime: "8:00 AM", team1Players: [{ id: "A", playingHcp: 2 }], team2Players: [{ id: "B", playingHcp: 4 }], course: { name: "Osprey" } }] },
    ],
    timeline: { available: true, events: [{ title: "Round 2 Opens", type: "Round", date: "2026-07-02", startTime: "8:00 AM", endTime: "9:00 AM", statusOverride: "" }] },
  };
  const model = tournamentDirectorModel(data, new Date("2026-07-02T07:42:00"));
  assert.equal(model.operatingRound.name, "Round 2");
  assert.equal(model.operatingRound.format, "Scramble");
  assert.equal(model.nextEvent.title, "Round 2 Opens");
  assert.equal(model.nextEvent.countdown, "Round 2 Opens in 18 minutes");
  assert.equal(model.nextEvent.round, 2);
});

test("health rolls actionable issues into healthy, attention, and action-needed states", () => {
  const player = (id, playingHcp = 3) => ({ id, playingHcp });
  const base = { tournament: { currentRound: 1, directorAutomation: { enabled: true, autoOpenRound: true, autoSetMatchesLive: true } }, schedule: [] };
  const healthy = tournamentDirectorModel({ ...base, rounds: [{ number: 1, matches: [{ id: "M1", match: 1, status: "Final", teeTime: "8:00 AM", course: { name: "Ocean" }, team1Players: [player("A")], team2Players: [player("B")] }] }] }, new Date("2026-07-02T09:00:00"));
  assert.equal(healthy.health.status.label, "Tournament Healthy");
  assert.equal(healthy.health.status.message, "No action required.");
  const attention = tournamentDirectorModel({ ...base, tournament: { ...base.tournament, directorAutomation: { enabled: false } }, rounds: [{ number: 1, matches: [{ id: "M1", match: 1, status: "Live", currentHole: 5, updatedAt: "2026-07-02T08:30:00", teeTime: "8:00 AM", course: { name: "Ocean" }, team1Players: [player("A")], team2Players: [player("B")] }] }] }, new Date("2026-07-02T09:00:00"));
  assert.equal(attention.health.status.label, "Attention Required");
  assert.equal(attention.issues.find((item) => item.id === "automation").action, "enable-automation");
  const action = tournamentDirectorModel({ ...base, rounds: [{ number: 1, matches: [{ id: "M2", match: 2, status: "Live", currentHole: 18, scoreConflict: true, teeTime: "8:10 AM", course: { name: "Ocean" }, team1Players: [player("A")], team2Players: [player("B")] }] }] }, new Date("2026-07-02T09:00:00"));
  assert.equal(action.health.status.label, "Immediate Action Required");
  assert.match(action.issues.find((item) => item.id === "confirm:M2").message, /Awaiting final confirmation/);
  assert.equal(action.issues.find((item) => item.id === "confirm:M2").severity, "warning");
  assert.equal(action.issues.find((item) => item.id === "conflict:M2").severity, "critical");
});

test("operational intelligence identifies stale scoring and concrete configuration failures", () => {
  const model = tournamentDirectorModel({
    tournament: { currentRound: 1, directorAutomation: { enabled: true } }, schedule: [],
    rounds: [{ number: 1, matches: [{ id: "M6", match: 6, status: "Live", currentHole: 7, updatedAt: "2026-07-02T09:00:00Z", teeTime: "", course: { name: "Ocean" }, team1Players: [{ id: "A", playingHcp: null }], team2Players: [] }] }],
  }, new Date("2026-07-02T09:22:00Z"));
  assert.match(model.issues.find((item) => item.id === "stale:M6").message, /22 minutes/);
  assert.match(model.issues.find((item) => item.id === "players:M6").message, /Players have not been assigned/);
  assert.match(model.issues.find((item) => item.id === "tee:M6").message, /Tee time is missing/);
  assert.match(model.issues.find((item) => item.id === "hcp:M6").message, /playing handicaps are missing/);
  assert.equal(model.issues.find((item) => item.id === "stale:M6").href, "/game-center/M6?from=tournament");
});

test("countdown labels remain operational across minutes, hours, and tomorrow", () => {
  assert.equal(countdownLabel(18), "in 18 minutes");
  assert.equal(countdownLabel(134), "in 2 hrs 14 min");
  assert.equal(countdownLabel(24 * 60, "7:30 AM"), "Tomorrow at 7:30 AM");
  assert.equal(countdownLabel(-664), "Started 11 hrs ago");
});

test("Director no longer invents a Next Event from round tee times when Timeline has no remaining event", () => {
  const model = tournamentDirectorModel({
    tournament: { currentRound: 3, directorAutomation: { enabled: true } },
    timeline: { available: true, events: [] },
    rounds: [{ number: 3, label: "Round 3", format: "Singles", matches: [{ id: "M1", match: 1, status: "Scheduled", teeTime: "7:30 AM", team1Players: [{ id: "A", playingHcp: 2 }], team2Players: [{ id: "B", playingHcp: 4 }] }] }],
  }, new Date("2026-07-03T18:34:00"));
  assert.equal(model.nextEvent, null);
  assert.equal(model.timelineAvailable, true);
});

test("adaptive primary action follows the official round workflow", () => {
  const player = (id) => ({ id, playingHcp: 2 });
  const match = (status, id = "M1") => ({ id, match: 1, status, teeTime: "8:00 AM", team1Players: [player("A")], team2Players: [player("B")] });
  const model = (tournament, matches) => tournamentDirectorModel({ tournament: { directorAutomation: { enabled: true }, ...tournament }, schedule: [], rounds: [{ number: 1, label: "Round 1", format: "Best Ball", matches }] }, new Date("2026-07-02T07:00:00"));
  assert.equal(model({ currentRound: 1, status: "Upcoming" }, [match("Scheduled")]).primaryAction.action, "open-round");
  assert.equal(model({ currentRound: 1, status: "Live" }, [match("Scheduled"), { ...match("Live", "M2"), match: 2 }]).primaryAction.action, "set-live");
  assert.equal(model({ currentRound: 1, status: "Live" }, [match("Live")]).primaryAction.kind, "status");
  assert.equal(model({ currentRound: 1, status: "Live" }, [match("Final")]).primaryAction.action, "close-round");
  const complete = model({ currentRound: "Final", status: "Final" }, [match("Final")]);
  assert.equal(complete.primaryAction.label, "🏆 Tournament Complete");
  assert.equal(complete.health.status.label, "Tournament Complete");
});

test("LIVE matches with disabled participant scoring require Director action", () => {
  const player = (id) => ({ id, playingHcp: 2 });
  const locked = { id: "M1", match: 1, status: "Live", scoringEnabled: false, teeTime: "8:00 AM", course: { name: "Ocean" }, team1Players: [player("A")], team2Players: [player("B")] };
  const model = tournamentDirectorModel({
    tournament: { currentRound: 1, status: "Live", directorAutomation: { enabled: true } },
    rounds: [{ number: 1, label: "Round 1", format: "Best Ball", matches: [locked] }],
  }, new Date("2026-07-02T08:00:00"));
  assert.equal(model.operatingRound.scoringLocked, 1);
  assert.equal(model.health.scoringLocked, 1);
  assert.equal(model.primaryAction.action, "unlock-scoring");
  assert.equal(model.health.status.label, "Immediate Action Required");
  assert.match(model.issues.find((item) => item.id === "scoring:M1").message, /LIVE but participant scoring is locked/);
});

test("Director LIVE transitions also open scoring and explicit lock controls remain available", () => {
  const route = source("app/api/director/route.js");
  assert.match(route, /setMatchesLiveAndOpenScoring/);
  assert.match(route, /enableLiveMatchAccess\(match\.id, updatedBy\)/);
  assert.match(route, /input\.action === "unlock-scoring"/);
  assert.match(route, /input\.action === "lock-scoring"/);
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  assert.match(dashboard, /data\.operatingRound\.scoringLocked \? "unlock-scoring" : "lock-scoring"/);
});

test("natural next-event wording includes the event name and action", () => {
  const model = tournamentDirectorModel({ tournament: { currentRound: 2, timeZone: "America/Chicago", directorAutomation: { enabled: true } }, rounds: [], timeline: { available: true, events: [{ title: "Awards Ceremony", type: "Ceremony", date: "2026-07-02", startTime: "8:00 AM", endTime: "10:00 AM", statusOverride: "" }] } }, new Date("2026-07-02T07:15:00"));
  assert.equal(model.nextEvent.countdown, "Awards Ceremony begins in 45 minutes");
});

test("repeated operational issues are grouped with expandable match detail", () => {
  const match = (id, number) => ({ id, match: number, status: "Scheduled", teeTime: "8:00 AM", course: { name: "Ocean" }, team1Players: [], team2Players: [] });
  const model = tournamentDirectorModel({ tournament: { currentRound: 1, directorAutomation: { enabled: true } }, schedule: [], rounds: [{ number: 1, matches: [match("M2", 2), match("M3", 3), match("M4", 4)] }] }, new Date("2026-07-02T07:00:00"));
  const group = model.issueGroups.find((item) => item.type === "players");
  assert.equal(group.title, "Player Assignment");
  assert.equal(group.message, "3 matches require review.");
  assert.equal(group.actionLabel, "Review All →");
  assert.deepEqual(group.items.map((item) => item.title), ["Match 2", "Match 3", "Match 4"]);
  assert.match(source("app/admin/director/DirectorDashboard.js"), /<details><summary>View \{item\.items\.length\} matches/);
});

test("automation becomes due only within the configured 30-minute opening window", () => {
  const model = { automation: { enabled: true, autoOpenRound: true, windowMinutes: 30 }, rounds: [{ number: 2, status: "UPCOMING", firstTeeTime: "8:00 AM" }] };
  assert.equal(directorAutomationDue(model, new Date("2026-07-01T07:35:00")), 2);
  assert.equal(directorAutomationDue(model, new Date("2026-07-01T07:20:00")), null);
  assert.equal(directorAutomationDue({ ...model, automation: { ...model.automation, enabled: false } }, new Date("2026-07-01T07:35:00")), null);
});

test("Director API requires Passport DIRECTOR authorization and uses audited writers", () => {
  const route = source("app/api/director/route.js");
  assert.match(route, /inspectTournamentDirectorToken/);
  assert.match(route, /authorization\.status !== "active"/);
  assert.match(route, /status: 403/);
  assert.match(route, /status: 503/);
  assert.match(route, /updateLiveMatch/);
  assert.match(route, /reopenLiveMatch/);
  assert.match(route, /updateTournamentAdminData/);
  assert.match(route, /directorAutomationDue/);
  assert.doesNotMatch(route, /x-live-admin-secret|ADMIN_SECRET/);
});

test("Director dashboard contains operations, health, attention, automation, and Full Admin access", () => {
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  for (const label of ["Round Status", "Tournament Health", "Attention Required", "Quick Actions", "Reopen Match", "Leaderboards", "Tournament Overview", "Automation", "Recent Activity", "Open Full Admin"]) assert.match(dashboard, new RegExp(label));
  assert.match(source("app/admin/director/director.module.css"), /env\(safe-area-inset-bottom\)/);
  assert.match(dashboard, /setInterval\(check, 60_000\)/);
  assert.doesNotMatch(dashboard, />Manual operating round</);
  assert.match(dashboard, /<summary>Override Operating Round<\/summary>/);
  assert.match(dashboard, /data-current=\{item\.number === data\.operatingRound\?\.number/);
  assert.match(dashboard, /act\(data\.primaryAction\.action, \{ round: data\.operatingRound\?\.number \}\)/);
  assert.doesNotMatch(dashboard, /disabled=\{Boolean\(busy\) \|\| Boolean\(round\?\.open\)\}/);
  for (const label of ["Operational Overview", "Next Event", "Tournament countdown", "Auto Open", "Auto LIVE", "Immediate Action Required", "No score submitted", "Recommended next step"]) assert.match(dashboard + source("lib/tournament-director.js"), new RegExp(label));
});

test("PLAYER accounts are redirected away from the Director page", () => {
  const page = source("app/admin/director/page.js");
  assert.match(page, /inspectTournamentDirectorToken/);
  assert.match(page, /result\.status !== "active"\) redirect\("\/home"\)/);
});

test("Director page, actions, impersonation, and sandbox share one actor-aware authorization resolver", () => {
  const resolver = source("lib/player-passport-server.js");
  const consumers = [
    source("app/admin/director/page.js"),
    source("app/api/director/route.js"),
    source("app/api/director/impersonation/route.js"),
    source("app/api/director/notifications/sandbox/route.js"),
  ];
  assert.match(resolver, /export async function inspectTournamentDirectorToken/);
  assert.match(resolver, /isTournamentDirectorActor\(result\.identity\)/);
  for (const consumer of consumers) assert.match(consumer, /inspectTournamentDirectorToken/);
  const dashboard = source("app/admin/director/DirectorDashboard.js");
  assert.equal((dashboard.match(/credentials: "same-origin"/g) || []).length, 5);
});
