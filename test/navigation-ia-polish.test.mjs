import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { participantDestination } from "../lib/participant-shell.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the five primary participant destinations and contextual parents remain explicit", async () => {
  const [navigation, styles] = await Promise.all([
    source("app/ParticipantIdentity.js"), source("app/participant-navigation.module.css"),
  ]);
  for (const [href, label] of [["/home", "Home"], ["/my-match", "My Match"], ["/live", "Tournament"], ["/live?view=leaderboards", "Leaderboards"], ["/me", "Player"]]) {
    assert.match(navigation, new RegExp(`href: "${href.replaceAll("?", "\\?")}", label: "${label}"`));
  }
  assert.equal((navigation.match(/href: "/g) || []).length, 5);
  assert.equal(participantDestination("/game-center/M1"), "My Match");
  assert.equal(participantDestination("/score"), "My Match");
  assert.equal(participantDestination("/live", "view=calcutta"), "Tournament");
  assert.equal(participantDestination("/live", "view=leaderboards&tab=skins"), "Leaderboards");
  assert.equal(participantDestination("/odds-center"), "Leaderboards");
  assert.equal(participantDestination("/tournament-guide"), "");
  assert.equal(participantDestination("/history/2026"), "");
  assert.match(navigation, /aria-current=\{currentDestination === item\.label \? "page"/);
  assert.doesNotMatch(styles, /aria-current=page\]::after/);
  assert.match(styles, /aria-current=page\] span\{[^}]*background:#f3e6c5/);
});

test("Tournament canonically owns the existing lazy Calcutta experience", async () => {
  const [page, wrapper, tournament, leaderboards] = await Promise.all([
    source("app/live/page.js"), source("app/live/TournamentSupabaseRead.js"),
    source("app/live/TournamentDashboard.js"), source("app/live/LeaderboardsDashboard.js"),
  ]);
  assert.match(page, /view === "leaderboards" && \(isLegacyCalcuttaModule\(leaderboardTab\) \|\| isLegacyCalcuttaModule\(leaderboardModule\)\)\) redirect\("\/live\?view=calcutta"\)/);
  assert.ok(page.indexOf("isLegacyCalcuttaModule(leaderboardTab)") < page.indexOf("requireTournamentReadSource(env)"));
  assert.match(page, /\(!view \|\| view === "calcutta"\)/);
  assert.match(page, /<TournamentSupabaseRead initialView=\{view\}/);
  assert.match(wrapper, /<TournamentDashboard[\s\S]*initialView=\{initialView\}/);
  assert.match(tournament, /href="\/live\?view=calcutta"/);
  assert.match(tournament, /secondaryReadUrl \+ "\?module=calcutta"/);
  assert.match(tournament, /<CalcuttaExperience model=\{data\.calcutta\}/);
  assert.doesNotMatch(leaderboards, /\["calcutta", "Calcutta"\]|tab === "calcutta"|CalcuttaExperience/);
});

test("Leaderboards owns exactly Players, Teams, Net Skins, and Insights", async () => {
  const [dashboard, wrapper, page] = await Promise.all([
    source("app/live/LeaderboardsDashboard.js"), source("app/live/LeaderboardsSupabaseRead.js"), source("app/live/page.js"),
  ]);
  assert.match(dashboard, /LEADERBOARD_MODULES\.map/);
  assert.match(dashboard, /tab === "skins"/);
  assert.match(dashboard, /tab === "insights"/);
  assert.doesNotMatch(wrapper, /calcuttaReadUrl|leaderboards\/calcutta/);
  assert.match(page, /requestedLeaderboardModule === "net-skins"\) redirect\("\/live\?view=leaderboards&tab=skins"\)/);
});

test("Hub is tournament-focused, capability-safe, and free of participant refresh/settings rows", async () => {
  const [menu, sheet, css] = await Promise.all([
    source("app/Menu.js"), source("app/ui/Sheet.js"), source("app/globals.css"),
  ]);
  assert.match(menu, /label: "Tournament"[\s\S]*Tournament Guide[\s\S]*Tournament History/);
  assert.match(menu, /label: "Support"[\s\S]*Important Contacts/);
  assert.doesNotMatch(menu, /Notification Preferences|Refresh Tournament Data|router\.refresh\(\)/);
  assert.match(menu, /director \? <section className="sideNavGroup sideNavDirector"><h2>Director<\/h2>/);
  assert.match(menu, /href="\/admin\/director"/);
  assert.match(menu, /shellCapabilityRevision\.current === capabilityRevision/);
  assert.match(menu, /fetch\("\/api\/director\/access"/);
  assert.match(sheet, /background\.inert = true/);
  assert.match(sheet, /event\.key === "Escape"/);
  assert.match(sheet, /window\.history\.pushState/);
  assert.match(css, /sideNavGroup a > span svg/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*sideNavDirector/);
});

test("Player owns career and settings without duplicating generic Tournament History", async () => {
  const profile = await source("app/me/ParticipantProfile.js");
  assert.match(profile, /<span>Career<\/span><h2>Profile &amp; Matches<\/h2>/);
  assert.match(profile, /Career, history, and achievements/);
  assert.doesNotMatch(profile, /<h2>Tournament History<\/h2>/);
  assert.match(profile, /id="notification-preferences"/);
  assert.match(profile, /<span>Settings<\/span><h2>Notification Preferences<\/h2>/);
  assert.match(profile, /participantIdentityAuthority === "supabase" \? "Sign Out" : "This isn’t me"/);
  assert.match(profile, /NOTIFICATION_CATEGORIES\.map/);
  assert.match(profile, /window\.localStorage\.setItem\(preferenceKey/);
});

test("My Match remains the assignment summary and Game Center remains one-match detail", async () => {
  const [myMatch, gameCenter, scoreStyles] = await Promise.all([
    source("app/score/MyMatchDashboard.js"), source("app/game-center/GameCenter.js"), source("app/globals.css"),
  ]);
  for (const summary of ["MatchHeading", "courseLine", "matchup", "MatchStatusBlock", "detailsHref"]) assert.match(myMatch, new RegExp(summary));
  assert.doesNotMatch(myMatch, /This isn’t me|This isn't me|Not you\?|Change player/i);
  assert.match(gameCenter, /Match Flow/);
  assert.match(gameCenter, /scorecardTable/);
  assert.match(gameCenter, /leaderboardReturn \? backTo : "\/my-match"/);
  assert.match(scoreStyles, /participant-scoring-focus-active \[data-participant-navigation\]/);
});

test("navigation polish is request-neutral and does not reopen authoritative systems", async () => {
  const [menu, tournament, leaderboards, profile, migrations, participantSession] = await Promise.all([
    source("app/Menu.js"), source("app/live/TournamentDashboard.js"),
    source("app/live/LeaderboardsDashboard.js"), source("app/me/ParticipantProfile.js"),
    source("package.json"), source("lib/participant-session-client.js"),
  ]);
  assert.equal((menu.match(/fetch\("\/api\/director\/access"/g) || []).length, 1);
  assert.equal((menu.match(/readFreshPlayerPassportSession\(\)/g) || []).length, 1);
  assert.equal((participantSession.match(/fetch\("\/api\/player-passport\/session"/g) || []).length, 1);
  assert.match(tournament, /fetch\(secondaryReadUrl \+ "\?module=calcutta"/);
  assert.doesNotMatch(leaderboards, /leaderboards\/calcutta|calcuttaReadUrl/);
  assert.doesNotMatch([menu, tournament, leaderboards, profile].join("\n"), /googleapis|Google Sheets|script\.google/);
  assert.doesNotMatch(migrations, /navigation-ia/);
});
