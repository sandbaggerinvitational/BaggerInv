import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Tournament Hub exposes major destinations without duplicating Tournament Guide navigation", async () => {
  const menu = await source("app/Menu.js");
  for (const label of ["Tournament Guide", "Tournament History", "Important Contacts", "Notification Preferences", "Refresh Tournament Data"]) {
    assert.match(menu, new RegExp(label));
  }
  for (const href of ["/tournament-guide", "/history", "/tournament-guide/contacts", "/me#notification-preferences"]) {
    assert.ok(menu.includes(`href: "${href}"`), href);
  }
  for (const duplicate of ["Schedule", "Courses", "Rules", "Dining", "Local Guide", "Contact Tournament Director"]) {
    assert.doesNotMatch(menu, new RegExp(`label: "${duplicate}"`));
  }
  for (const duplicateHref of ["/home#today-schedule-title", "/courses", "/tournament-guide/rules", "/tournament-guide/dining", "/tournament-guide/getting-around"]) {
    assert.ok(!menu.includes(`href: "${duplicateHref}"`), duplicateHref);
  }
  assert.doesNotMatch(menu, /navigationSections|Odds Center|War Room|Admin Center/);
  assert.doesNotMatch(menu, /target=|window\.open|https?:\/\//);
  assert.match(menu, /router\.refresh\(\)/);
  assert.match(menu, /searchParams\.toString\(\) === linkQuery/);
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

test("Tournament Hub content routes retain shared headers and notification anchor", async () => {
  const [guide, courses, history, profile] = await Promise.all([
    source("app/tournament-guide/page.js"), source("app/courses/page.js"), source("app/history/page.js"), source("app/me/ParticipantProfile.js"),
  ]);
  for (const page of [guide, courses, history]) assert.match(page, /<Header \/>/);
  assert.match(profile, /id="notification-preferences"/);
});

test("Notification Preferences remains a direct same-origin Player deep link", async () => {
  const menu = await source("app/Menu.js");
  assert.match(menu, /label: "Notification Preferences", href: "\/me#notification-preferences"/);
  assert.doesNotMatch(menu, /target=|window\.open|https?:\/\//);
});
