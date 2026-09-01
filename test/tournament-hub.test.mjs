import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Tournament Hub exposes major destinations without duplicating Tournament Guide navigation", async () => {
  const menu = await source("app/Menu.js");
  const hub = menu.slice(menu.indexOf("const hubSections"), menu.indexOf("function activeNavigationHrefForPath"));
  for (const label of ["Tournament Guide", "Tournament History", "Important Contacts"]) {
    assert.match(hub, new RegExp(label));
  }
  for (const href of ["/app/guide", "/app/history", "/app/guide/contacts"]) {
    assert.ok(hub.includes(`href: "${href}"`), href);
  }
  for (const duplicate of ["Schedule", "Courses", "Rules", "Dining", "Local Guide", "Contact Tournament Director"]) {
    assert.doesNotMatch(hub, new RegExp(`label: "${duplicate}"`));
  }
  for (const duplicateHref of ["/home#today-schedule-title", "/courses", "/tournament-guide/rules", "/tournament-guide/dining", "/tournament-guide/getting-around"]) {
    assert.ok(!hub.includes(`href: "${duplicateHref}"`), duplicateHref);
  }
  assert.doesNotMatch(hub, /navigationSections|Odds Center|War Room|Admin Center/);
  assert.doesNotMatch(menu, /target=|window\.open|https?:\/\//);
  assert.doesNotMatch(menu, /Notification Preferences|Refresh Tournament Data|router\.refresh\(\)/);
  assert.match(menu, /label: "Tournament"/);
  assert.match(menu, /label: "Support"/);
  assert.match(menu, /currentQuery === linkQuery/);
});

test("public desktop menu uses the original website navigation sections", async () => {
  const [menu, navigation] = await Promise.all([source("app/Menu.js"), source("app/navigation.js")]);
  assert.match(menu, /import \{ navigationSections \} from "\.\/navigation"/);
  assert.match(menu, /<nav className="sideNav sideNavSite" aria-label="Site navigation">[\s\S]*navigationSections\.map/);
  assert.match(menu, /appShell[\s\S]*\? <Sheet[\s\S]*: <>[\s\S]*\{siteContent\}/);
  assert.match(menu, /href=\{link\.href === "\/" \? homeHref : link\.href\}/);
  for (const label of ["Home", "Match Center", "Odds Center", "War Room", "Players", "Tournament"]) {
    assert.match(navigation, new RegExp(label));
  }
  assert.doesNotMatch(navigation, /Admin Center|href:\s*"\/admin"/);
});

test("Tournament Hub remains accessible and keeps the participant shell visible", async () => {
  const [menu, navigation, appHeader, sheet, sheetCss] = await Promise.all([
    source("app/Menu.js"), source("app/ParticipantIdentity.js"), source("app/ParticipantAppHeader.js"),
    source("app/ui/Sheet.js"), source("app/ui/sheet.module.css"),
  ]);
  assert.match(menu, /appShell[\s\S]*<Sheet open=\{isOpen\}/);
  assert.match(menu, /label="Tournament Hub"/);
  assert.match(appHeader, /<Menu homeHref="\/home" appShell \/>/);
  assert.match(sheet, /aria-modal="true"/);
  assert.match(sheet, /event\.key === "Escape"/);
  assert.match(sheet, /background\.inert = true/);
  assert.match(sheet, /returnFocusRef\.current/);
  assert.match(navigation, /position:fixed|className=\{styles\.mobile\}/);
  assert.match(sheetCss, /z-index:400/);
  assert.match(sheetCss, /height:var\(--app-height\)/);
});

test("external tournament content asks before leaving The Bagger", async () => {
  const [confirmation, course] = await Promise.all([
    source("app/ExternalLinkConfirm.js"), source("app/courses/[courseId]/page.js"),
  ]);
  assert.match(confirmation, /Leave The Bagger\?/);
  assert.match(confirmation, /This content will open in Safari\./);
  assert.match(confirmation, />Cancel</);
  assert.match(confirmation, />Continue</);
  assert.match(confirmation, /showModal\(\)/);
  assert.match(course, /<ExternalLinkConfirm[\s\S]*href=\{website\}/);
});

test("shared content pages preserve website chrome while participant wrappers select PWA presentation", async () => {
  const [guide, courses, history, participantGuide, participantCourses, participantHistory, profile] = await Promise.all([
    source("app/tournament-guide/page.js"), source("app/courses/page.js"), source("app/history/page.js"),
    source("app/app/guide/page.js"), source("app/app/courses/page.js"), source("app/app/history/page.js"),
    source("app/me/ParticipantProfile.js"),
  ]);
  for (const page of [guide, courses, history]) {
    assert.match(page, /participantPresentation \? null : <Header \/>/);
    assert.match(page, /participantPresentation \? null : <Footer \/>/);
  }
  for (const wrapper of [participantGuide, participantCourses, participantHistory]) {
    assert.match(wrapper, /participantPresentation: true/);
  }
  assert.match(courses, /href=\{participantPresentation \? "\/app\/guide" : "\/tournament-guide"\}/);
  assert.match(profile, /id="notification-preferences"/);
});

test("Notification Preferences is canonically owned by Player and absent from Hub", async () => {
  const [menu, profile] = await Promise.all([source("app/Menu.js"), source("app/me/ParticipantProfile.js")]);
  assert.doesNotMatch(menu, /Notification Preferences|\/me#notification-preferences/);
  assert.match(profile, /id="notification-preferences"/);
  assert.match(profile, /<span>Settings<\/span><h2>Notification Preferences<\/h2>/);
});

test("Tournament Hub identity is populated from the active Tournament workbook model", async () => {
  const [menu, normalized, css] = await Promise.all([
    source("app/Menu.js"), source("app/live/sheetData.js"), source("app/globals.css"),
  ]);
  assert.match(normalized, /edition: tournamentRow\["Tournament Edition"\] \|\| tournamentRow\.Annual/);
  assert.match(menu, /name: active\.name \|\| active\.Name/);
  assert.match(menu, /edition: formatTournamentEdition\(active\.edition/);
  assert.match(menu, /location: active\.location \|\| active\.Location/);
  assert.match(menu, /year: active\.year \|\| active\.Year/);
  assert.match(menu, /<strong>\{tournament\.name \|\| "Tournament"\}<\/strong>/);
  assert.match(menu, /className="sideMenuEdition">\{tournament\.edition\}/);
  assert.doesNotMatch(menu, /<strong>The Bagger<\/strong>|location: "Kiawah Island", year: "2026"/);
  assert.match(css, /\.sideMenuTop \.sideMenuEdition\{?[^}]*text-transform: none/);
});
