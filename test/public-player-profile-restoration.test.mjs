import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [profile, intelligence, matches, participantRoute] = await Promise.all([
  source("app/players/[slug]/page.js"),
  source("app/players/[slug]/PlayerIntelligenceSections.js"),
  source("app/players/[slug]/PlayerFormatMatchHistory.js"),
  source("app/app/players/[slug]/page.js"),
]);

test("bare player profile restores baseline website affordances independent of authentication", () => {
  assert.match(profile, /participantPresentation \? null : \([\s\S]*Back to All Sandbaggers/);
  assert.match(profile, /Compare players →/);
  assert.match(profile, /Open Historical Draft Analytics →/);
  assert.match(profile, /linked=\{!participantPresentation\}/);
  assert.match(profile, /participantPresentation \? null : <span>Points Won<\/span>/);
  assert.match(intelligence, /title="Current Rankings"/);
  assert.match(intelligence, /View Leaderboard →/);
  assert.match(matches, /participantPresentation \? null : \([\s\S]*<ScorecardTable/);
  assert.doesNotMatch(profile, /useSession|cookies\(|participantSession|identityAuthority/);
});

test("participant profile route retains the explicit compact PWA branch", () => {
  assert.match(participantRoute, /participantPresentation: true/);
  assert.match(profile, /participantPresentation \? \([\s\S]*<HistoryNavigation/);
  assert.match(profile, /participantPresentation \? \([\s\S]*<article key=\{draft\.year\}/);
  assert.match(intelligence, /participantPresentation \? \([\s\S]*<article key=\{record\.slug\}>/);
  assert.match(matches, /participantPresentation \? null : \([\s\S]*profileMatchScorecard/);
});

test("restored public presentation retains canonical Supabase and corrected point semantics", () => {
  assert.match(profile, /loadSecondaryHistoryModel/);
  assert.match(profile, /secondaryHistory\.scorecardAnalytics/);
  assert.match(profile, /indexScorecardsByMatch\(careerScorecards, \{ matchIds: playerMatchIds \}\)/);
  assert.match(profile, /scorecardPresentationData\(indexedCareerScorecards\.get\(matchId\) \|\| \[\]\)/);
  assert.match(profile, /rival\.record\.recordedPointMatches > 0/);
  assert.match(profile, /formatPlayerPoints\(rival\.record\.points\)/);
  assert.doesNotMatch(profile, /<strong>\{rival\.record\.matches\}<\/strong>/);
});
