import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Tournament Hub replaces the website navigation with native participant destinations", async () => {
  const menu = await source("app/Menu.js");
  for (const label of ["Tournament Guide", "Schedule", "Courses", "Tournament History", "Rules", "Contact Tournament Director", "Notification Preferences", "Refresh Tournament Data"]) {
    assert.match(menu, new RegExp(label));
  }
  for (const href of ["/tournament-guide", "/home#today-schedule-title", "/courses", "/history", "/tournament-guide#rules", "/tournament-guide#important-information", "/me#notification-preferences"]) {
    assert.ok(menu.includes(`href: "${href}"`), href);
  }
  assert.doesNotMatch(menu, /navigationSections|Odds Center|War Room|Admin Center/);
  assert.doesNotMatch(menu, /target=|window\.open|https?:\/\//);
  assert.match(menu, /router\.refresh\(\)/);
  assert.match(menu, /linkHash \? hash === `#\$\{linkHash\}` : !hash/);
});

test("Tournament Hub remains accessible and keeps the participant shell visible", async () => {
  const [menu, navigation, css] = await Promise.all([
    source("app/Menu.js"), source("app/ParticipantIdentity.js"), source("app/globals.css"),
  ]);
  assert.match(menu, /role="dialog" aria-label="Tournament Hub"/);
  assert.match(menu, /aria-modal="true"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(navigation, /position:fixed|className=\{styles\.mobile\}/);
  assert.match(css, /body\.passport-navigation-active \.sideMenuScroll/);
  assert.match(css, /var\(--participant-nav-height\)/);
  assert.match(css, /body \{[\s\S]*overflow-x: clip/);
});

test("external tournament content asks before leaving The Bagger", async () => {
  const [confirmation, guide, course] = await Promise.all([
    source("app/ExternalLinkConfirm.js"), source("app/tournament-guide/page.js"), source("app/courses/[courseId]/page.js"),
  ]);
  assert.match(confirmation, /Leave The Bagger\?/);
  assert.match(confirmation, /This content will open in Safari\./);
  assert.match(confirmation, />Cancel</);
  assert.match(confirmation, />Continue</);
  assert.match(confirmation, /showModal\(\)/);
  assert.match(guide, /<ExternalLinkConfirm href=\{item\["Link URL"\]\}/);
  assert.match(course, /<ExternalLinkConfirm[\s\S]*href=\{website\}/);
});

test("Tournament Hub content routes retain shared headers and notification anchor", async () => {
  const [guide, courses, history, profile] = await Promise.all([
    source("app/tournament-guide/page.js"), source("app/courses/page.js"), source("app/history/page.js"), source("app/me/ParticipantProfile.js"),
  ]);
  for (const page of [guide, courses, history]) assert.match(page, /<Header \/>/);
  assert.match(profile, /id="notification-preferences"/);
});
