import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("../app/live/TournamentDashboard.js", import.meta.url);
const stylesUrl = new URL("../app/live/tournament-dashboard.module.css", import.meta.url);
const centerUrl = new URL("../app/live/MatchCenter.js", import.meta.url);

test("Tournament dashboard uses the approved compact branded hierarchy", async () => {
  const [source, styles, center] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8"), readFile(centerUrl, "utf8")]);
  assert.match(center, /<TournamentDashboard \{\.\.\.props\} \/>/);
  assert.match(source, /tournamentLogo\(filename\)/);
  assert.match(source, /tournament\.logo \|\| `sandbagger-\$\{tournament\.year\}`/);
  assert.match(source, /<Snapshot tournament=/);
  assert.match(source, /Points to Clinch/);
  assert.match(source, /Momentum/);
  assert.match(styles, /\.score b\{[^}]*font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(source, />My Tournament<|>My Match<|Refresh live scores/);
});

test("Tournament data refreshes on open, focus, visibility, and a guarded interval", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /if \(pending\.current\) return pending\.current/);
  assert.match(source, /fetch\("\/api\/live", \{ cache: "no-store" \}\)/);
  assert.match(source, /refresh\(\);\s*const poll/);
  assert.match(source, /window\.setInterval\(poll, 45_000\)/);
  assert.match(source, /window\.addEventListener\("focus", poll\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", poll\)/);
  assert.match(source, /relativeUpdatedLabel\(lastRefresh, clock\)/);
  assert.doesNotMatch(source, />Refresh</);
});

test("Tournament controls are dynamic, accessible, and client-side", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /\[\["overall","Overall"\], \.\.\.rounds\.map/);
  assert.match(source, /aria-pressed=\{String\(selectedRound\) === String\(value\)\}/);
  for (const label of ["All", "Live", "Upcoming", "Final"]) assert.equal(source.includes(`"${label}"`), true);
  assert.match(source, /filterMatches\(round\.matches \|\| \[\], filter\)/);
  assert.match(source, /open=\{!complete \|\| selectedRound !== "overall"\}/);
});

test("Tournament match cards remain compact and preserve official match data", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /Round \{round\.number\}\{match\.match \? ` • Match/);
  assert.match(source, /playerMeta\(player\)/);
  assert.match(source, /HCP \$\{formatHandicap\(player\.playingHcp\)\}/);
  assert.match(source, /\+\$\{player\.stroke\} stroke/);
  assert.match(source, /matchResult\(match, tournament\)/);
  assert.match(source, /Through \{match\.currentHole\}/);
  assert.match(source, /href=\{href\}/);
  assert.match(styles, /\.matchCard\{[^}]*padding:10px/);
  assert.match(styles, /\.versus\{[^}]*grid-template-columns:minmax\(0,1fr\) 20px minmax\(0,1fr\)/);
  assert.doesNotMatch(styles, /overflow-x:\s*(auto|scroll).*\\.page/);
});

test("Round score leaderboard sorts from headers and handles partial and empty states", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /aria-sort=/);
  assert.match(source, /current\.key === key && current\.direction === "asc" \? "desc" : "asc"/);
  assert.match(source, /Number\(a\[sort\.key\]\) - Number\(b\[sort\.key\]\)/);
  assert.match(source, /\|\| a\.name\.localeCompare\(b\.name\)/);
  assert.match(source, /Standings will appear after the first recorded score/);
  assert.match(source, /Partial standings publish as valid holes are confirmed/);
});

test("Frozen Home and My Match implementations remain untouched by Tournament styling", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  assert.doesNotMatch(styles, /PersonalizedPlayerHome|MyMatchDashboard|my-match-dashboard/);
});

test("preview Player Passport invitations remain origin-specific and Admin-authenticated", async () => {
  const [admin, route] = await Promise.all([
    readFile(new URL("../app/admin/PlayerPassportAdmin.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/admin/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /location\.origin}\/activate\?player=\$\{reference\}/);
  assert.match(admin, /Activation code: \$\{item\.code\}/);
  assert.match(route, /request\.headers\.get\("x-live-admin-secret"\)/);
  assert.match(route, /process\.env\.ADMIN_SECRET/);
  assert.match(route, /process\.env\.LIVE_ADMIN_SECRET/);
  assert.doesNotMatch(admin, /ADMIN_SECRET|LIVE_ADMIN_SECRET/);
});
