import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  participantAppShellRoute,
  participantDestination,
  participantRouteContext,
} from "../lib/participant-shell.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [scorecard, summaryCss, directory, profile, frame, layout, navigation, components, participantDirectory] = await Promise.all([
  source("app/ScorecardTable.js"),
  source("app/scorecard-summary.module.css"),
  source("app/players/page.js"),
  source("app/players/[slug]/page.js"),
  source("app/ParticipantRouteFrame.js"),
  source("app/layout.js"),
  source("app/ParticipantIdentity.js"),
  source("app/components.js"),
  source("app/app/players/page.js"),
]);

test("historical scorecard totals keep golfer identity and three metrics in one compact 390px row", () => {
  assert.match(scorecard, /<span><Participant scorecard=\{scorecard\}[\s\S]*<dl>[\s\S]*<dt>Gross<\/dt>[\s\S]*<dt>Strokes<\/dt>[\s\S]*<dt>Net<\/dt>/);
  assert.match(summaryCss, /@media\(min-width:361px\) and \(max-width:520px\)[\s\S]*grid-template-columns:minmax\(0,1\.1fr\) minmax\(136px,\.9fr\)/);
  assert.match(summaryCss, /\.row>span\{min-width:0/);
  assert.match(summaryCss, /overflow-wrap:anywhere/);
  assert.match(summaryCss, /\.row dl\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(summaryCss, /@media\(max-width:360px\)[\s\S]*grid-template-columns:1fr/);
});

test("the compact summary is safe for representative long golfer names without changing facts", () => {
  const names = ["Alex Monteleone", "Taylor Lippincott", "Michael Hunnicutt", "Brenan Cavanaugh", "David Rees-Jones"];
  assert.equal(new Set(names).size, names.length);
  assert.match(summaryCss, /grid-template-columns:minmax\(0,1\.1fr\) minmax\(136px,\.9fr\)/);
  assert.match(summaryCss, /\.row dl>div\{min-width:0/);
  assert.match(scorecard, /scorecard\.total \?\? "—"/);
  assert.match(scorecard, /strokes \?\? "—"/);
  assert.match(scorecard, /net \?\? "—"/);
});

test("Step 5C deferred scorecard delivery remains request-free and single-tree", () => {
  assert.match(scorecard, /deferClosedContent = false/);
  assert.match(scorecard, /useState\(!deferClosedContent\)/);
  assert.match(scorecard, /\{hasRenderedContent \? <div>/);
  assert.match(scorecard, /inert=\{open \? undefined : true\}/);
  assert.match(scorecard, /!deferClosedContent \|\| !mobileHistoryLayout/);
  assert.match(scorecard, /!deferClosedContent \|\| mobileHistoryLayout/);
  assert.doesNotMatch(scorecard, /fetch\(|axios|\/api\/|supabase|googleapis/i);
});

test("Browse All Sandbaggers has separate website and explicit PWA presentations", () => {
  assert.equal(participantAppShellRoute("/players"), false);
  assert.equal(participantAppShellRoute("/app/players"), true);
  assert.equal(participantRouteContext("/app/players"), "Players");
  assert.equal(participantDestination("/app/players"), "Player");
  assert.match(directory, /import \{ Header, Footer \}/);
  assert.match(directory, /participantPresentation \? null : <Header \/>/);
  assert.match(directory, /participantPresentation \? null : <Footer \/>/);
  assert.match(participantDirectory, /participantPresentation: true/);
  assert.match(frame, /<ParticipantAppHeader \/>/);
  assert.match(frame, /\{navigation\}/);
  assert.equal((layout.match(/<ParticipantIdentity \/>/g) || []).length, 1);
  assert.equal((navigation.match(/data-participant-navigation/g) || []).length, 2);
});

test("directory facts, images, and canonical Career destinations remain unchanged", () => {
  assert.match(directory, /getAllPlayerStats\(\)/);
  assert.match(directory, /<PlayerAvatar/);
  for (const label of ["Active", "Alumni", "Career", "Win %", "Avg. Handicap", "Appearances", "Biggest Rival"]) {
    assert.match(directory, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(directory, /participantPresentation[\s\S]*`\/app\/players\/\$\{player\.slug\}`[\s\S]*`\/players\/\$\{player\.slug\}\?returnTo=/);
  assert.match(profile, /label: "Browse All Sandbaggers"/);
  assert.match(profile, /href: participantPresentation \? "\/app\/players" : playerDirectoryReturnHref/);
});

test("public website Header and Footer remain available to non-PWA routes", () => {
  assert.match(components, /export function Header/);
  assert.match(components, /className="siteHeader"/);
  assert.match(components, /export function Footer/);
  assert.match(components, /Official Tournament Website/);
  assert.match(components, /Sandbagger Invitational/);
});
