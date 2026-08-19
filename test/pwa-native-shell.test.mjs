import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { participantAppShellRoute, participantIdlePrefetchRoutes, participantRouteContext } from "../lib/participant-shell.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("participant AppShell is explicit and public route ownership is preserved", () => {
  for (const route of ["/home", "/my-match", "/live", "/game-center/2026-R1-1", "/score", "/me", "/players", "/players/holman-moores", "/tournament-guide/rules", "/courses", "/courses/CPGC01", "/courses/CPGC01/holes/1", "/history", "/history/2025", "/history/2025/round/3", "/history/2025/team/Team%202", "/history/2026/round/1", "/odds-center"])
    assert.equal(participantAppShellRoute(route), true, route);
  for (const route of ["/", "/admin/director", "/participant-auth", "/activate", "/score/access/token"])
    assert.equal(participantAppShellRoute(route), false, route);
  assert.equal(participantRouteContext("/live", "view=leaderboards"), "Leaderboards");
  assert.equal(participantRouteContext("/score"), "Scorecard");
  assert.equal(participantRouteContext("/courses/CPGC01/holes/1"), "Course Hole");
  assert.equal(participantRouteContext("/history/2025"), "2025 History");
  assert.equal(participantRouteContext("/history/2025/round/3"), "2025 Round History");
  assert.equal(participantRouteContext("/history/2025/team/Team%202"), "2025 Team History");
  assert.equal(participantRouteContext("/players"), "Players");
  assert.equal(participantRouteContext("/players/holman-moores"), "Career Profile");
});

test("persistent participant shell owns compact header, content scene, and navigation slot", async () => {
  const [frame, header, headerCss, globals, components] = await Promise.all([
    source("app/ParticipantRouteFrame.js"), source("app/ParticipantAppHeader.js"), source("app/participant-app-header.module.css"), source("app/globals.css"), source("app/components.js"),
  ]);
  assert.match(frame, /participantAppShellRoute/);
  assert.match(frame, /data-participant-app-shell/);
  assert.match(frame, /<ParticipantAppHeader \/>/);
  assert.match(frame, /\{navigation\}/);
  assert.match(frame, /participantRouteScene/);
  assert.match(header, /<Menu homeHref="\/home" appShell \/>/);
  assert.match(headerCss, /var\(--safe-top\)/);
  assert.match(headerCss, /min-height:44px/);
  assert.doesNotMatch(headerCss, /min-width:761px[^}]*\.header\{display:none/s);
  assert.match(globals, /\.participantAppShell \.siteHeader/);
  assert.match(globals, /participantRouteEnter \.14s/);
  assert.match(components, /className="siteHeader"/);
});

test("bottom navigation manually prefetches likely primary routes and reacts to the keyboard", async () => {
  const [navigation, css] = await Promise.all([source("app/ParticipantIdentity.js"), source("app/participant-navigation.module.css")]);
  assert.deepEqual(participantIdlePrefetchRoutes("/home"), ["/my-match", "/live", "/live?view=leaderboards", "/me"]);
  assert.ok(participantIdlePrefetchRoutes("/my-match").includes("/score"));
  assert.match(navigation, /participantIdlePrefetchRoutes/);
  assert.match(navigation, /router\.prefetch\(href\)/);
  assert.match(navigation, /window\.visualViewport/);
  assert.match(navigation, /data-keyboard-open/);
  assert.match(css, /font-size:\.7rem/);
  assert.match(css, /min-height:50px/);
  assert.match(css, /data-keyboard-open=true/);
});

test("safe-area, dynamic-height, transition, and reduced-motion contracts are shared", async () => {
  const [globals, sheetCss, headerCss] = await Promise.all([source("app/globals.css"), source("app/ui/sheet.module.css"), source("app/participant-app-header.module.css")]);
  for (const token of ["--safe-top", "--safe-bottom", "--app-height", "--participant-header-height", "--participant-nav-total"]) assert.match(globals, new RegExp(token));
  assert.match(globals, /@supports \(height: 100dvh\)/);
  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(sheetCss, /var\(--app-height\)/);
  assert.match(sheetCss, /\.panel:global\(\.sideMenu\).*background:var\(--green-dark\)/);
  assert.match(sheetCss, /prefers-reduced-motion:reduce/);
  assert.match(headerCss, /var\(--safe-top\)/);
});

test("shared state primitives preserve shell geometry and use golfer-facing copy", async () => {
  const [states, stateCss, rootError, connection] = await Promise.all([
    source("app/ui/StatePrimitives.js"), source("app/ui/state-primitives.module.css"), source("app/error.js"), source("app/PwaFoundation.js"),
  ]);
  for (const name of ["Skeleton", "ModuleSkeleton", "ScreenSkeleton", "ErrorState", "ConnectionBanner"]) assert.match(states, new RegExp(`function ${name}`));
  assert.match(stateCss, /prefers-reduced-motion:reduce/);
  assert.match(rootError, /participantAppShellRoute/);
  assert.match(rootError, /Check your connection and try again/);
  assert.match(connection, /You’re offline\. Saved information stays available/);
  assert.doesNotMatch(connection, /scores require a connection/);
});

test("Sheet and AlertSheet provide modal accessibility without a UI framework", async () => {
  const [sheet, alert, packageJson] = await Promise.all([source("app/ui/Sheet.js"), source("app/ui/AlertSheet.js"), source("package.json")]);
  assert.match(sheet, /createPortal/);
  assert.match(sheet, /background\.inert = true/);
  assert.match(sheet, /document\.body\.style\.overflow = "hidden"/);
  assert.match(sheet, /event\.key !== "Tab"/);
  assert.match(sheet, /event\.key === "Escape"/);
  assert.match(sheet, /window\.history\.pushState/);
  assert.match(alert, /role="alertdialog"/);
  assert.match(alert, /initialFocusRef=\{cancelRef\}/);
  assert.doesNotMatch(packageJson, /framer-motion/);
});

test("participant scoring uses AlertSheet instead of browser confirm without altering confirm text semantics", async () => {
  const score = await source("app/score/ScoreEntry.js");
  assert.match(score, /import AlertSheet/);
  assert.match(score, /Discard unsaved score changes for this hole\?/);
  assert.match(score, /Keep editing/);
  assert.match(score, /Discard changes/);
  assert.doesNotMatch(score, /window\.confirm\(/);
  assert.match(score, /selectHole\(number\)/);
});

test("Supabase Home command-center order starts with identity and actionable match", async () => {
  const command = await source("app/TournamentCommandCenter.js");
  const branch = command.slice(command.indexOf("if (supabaseCommandCenter)"), command.indexOf("return <div className={styles.page}>", command.indexOf("if (supabaseCommandCenter)") + 1));
  const identity = branch.indexOf("<TournamentIdentityHeader");
  const match = branch.indexOf("<PersonalizedPlayerHome");
  const pulse = branch.indexOf("{pulse}");
  const next = branch.indexOf("<TournamentSchedule compact");
  const moments = branch.indexOf("<TournamentMoments");
  const secondary = branch.indexOf("<PersonalizedPlayerHomeSecondary");
  assert.ok(identity >= 0 && identity < match && match < pulse && pulse < next && next < moments && moments < secondary, { identity, match, pulse, next, moments, secondary });
  assert.equal(branch.match(/<TournamentSchedule/g)?.length, 1);
  assert.match(command, /showSecondary=\{false\}/);
  assert.match(command, /ModuleSkeleton/);
});

test("participant route loading and errors use shared state foundations", async () => {
  const files = await Promise.all(["home/loading.js", "my-match/loading.js", "live/loading.js", "score/loading.js", "me/loading.js", "tournament-guide/loading.js", "courses/loading.js", "game-center/[matchId]/loading.js"].map((path) => source(`app/${path}`)));
  files.forEach((value) => assert.match(value, /ScreenSkeleton/));
  const errors = await Promise.all(["app/game-center/[matchId]/error.js", "app/tournament-guide/error.js", "app/courses/error.js"].map(source));
  errors.forEach((value) => assert.match(value, /ErrorState/));
  errors.forEach((value) => assert.doesNotMatch(value, /Google Sheets|Supabase|RPC|workbook|projection/i));
});
