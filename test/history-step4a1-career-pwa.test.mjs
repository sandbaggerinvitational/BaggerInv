import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  profile,
  intelligence,
  formatHistory,
  playerReturn,
  overview,
  round,
  team,
  layout,
  shell,
  navigation,
  navigationCss,
  matchTarget,
  matchCss,
] = await Promise.all([
  source("app/players/[slug]/page.js"),
  source("app/players/[slug]/PlayerIntelligenceSections.js"),
  source("app/players/[slug]/PlayerFormatMatchHistory.js"),
  source("app/PlayerProfileReturnNavigation.js"),
  source("app/history/[year]/page.js"),
  source("app/history/[year]/round/[round]/page.js"),
  source("app/history/[year]/team/[side]/page.js"),
  source("app/layout.js"),
  source("lib/participant-shell.js"),
  source("app/history/HistoryNavigation.js"),
  source("app/history/history-navigation.module.css"),
  source("app/history/HistoryMatchAnchorTarget.js"),
  source("app/live/live.module.css"),
]);

test("Career Profile is owned by the PWA shell without its website header or footer", () => {
  assert.match(shell, /\/\^\\\/players\\\/\[\^\/\]\+\$\//);
  assert.match(shell, /return "Career Profile"/);
  assert.match(profile, /<main data-career-profile>/);
  assert.match(profile, /<HistoryNavigation/);
  assert.doesNotMatch(profile, /<Header|<Footer|ContextBackLink/);
  assert.match(layout, /<ParticipantRouteFrame navigation=\{<Suspense fallback=\{null\}><ParticipantIdentity/);
});

test("History-origin Profile navigation reuses the approved contextual navigation hierarchy", () => {
  assert.match(profile, /const primaryNavigation = historyReturnContext/);
  assert.match(profile, /label: historyReturnContext\.label/);
  assert.match(profile, /label: "Browse All Sandbaggers"/);
  assert.match(profile, /left=\{primaryNavigation\}/);
  assert.match(profile, /right=\{browseNavigation\}/);
  assert.match(navigationCss, /min-height: 44px/);
});

test("rankings, records, rival, draft history, and partners are genuinely display-only", () => {
  assert.match(intelligence, /<div key=\{row\.key\}>[\s\S]*<strong>\{rank\(row\.rank\)\}<\/strong>[\s\S]*<\/div>/);
  assert.match(intelligence, /"matchWins"/);
  assert.doesNotMatch(intelligence, /title="Current Rankings"/);
  assert.match(intelligence, /<article key=\{record\.slug\}>/);
  assert.doesNotMatch(intelligence, /View Leaderboard|record\.href/);
  assert.doesNotMatch(profile, /Compare players|compareHref|\/compare/);
  assert.match(profile, /<LeaderboardPlayer[\s\S]*linked=\{false\}/);
  assert.match(profile, /className=\{styles\.profileDraftHistory\}[\s\S]*<article/);
  assert.doesNotMatch(profile, /Open Historical Draft Analytics|href=\{`\/draft\/\$\{draft\.year\}`\}/);
});

test("Tournament, Match, and Team remain canonical Player-origin drill-downs", () => {
  assert.match(intelligence, /withPlayerOriginContext\(`\/history\/\$\{season\.year\}`, playerSlug\)/);
  assert.match(formatHistory, /withPlayerOriginContext\(match\.href, playerSlug\)/);
  assert.match(formatHistory, /View Match →/);
  assert.match(formatHistory, /prefetch=\{false\}/);
  assert.match(profile, /withPlayerOriginContext\([\s\S]*`\/history\/\$\{season\.year\}\/team/);
  assert.match(profile, /View Team →/);
  assert.match(profile, /aria-label=\{`View \$\{player\["Display Name"\]\}'s \$\{season\.year\} \$\{season\.teamName\} Team History`\}/);
  assert.doesNotMatch(formatHistory, /ScorecardTable|scorecardsByMatch|profileMatchScorecard/);
});

test("all historical destinations share the same canonical, fail-closed Player return", () => {
  for (const destination of [overview, round, team]) {
    assert.match(destination, /isCompletedHistoryPlayerYear/);
    assert.match(destination, /playerOriginReturnContext\(query, getPlayerBySlug\)/);
    assert.match(destination, /<PlayerProfileReturnNavigation context=\{playerReturnContext\} \/>/);
  }
  assert.match(playerReturn, /<HistoryNavigation/);
  assert.match(playerReturn, /href: context\.href/);
  assert.match(playerReturn, /ariaLabel: context\.accessibleLabel/);
  assert.match(playerReturn, /prefetch: false/);
  assert.match(playerReturn, /surface="player-return"/);
  assert.match(round, /<PublicMatchCard/);
  assert.match(round, /<HistoryMatchAnchorTarget enabled=\{Boolean\(playerReturnContext\)\} \/>/);
  assert.match(matchTarget, /\^match-\[A-Za-z0-9\._:-\]\+\$/);
  assert.match(matchTarget, /scrollIntoView\(\{[\s\S]*behavior: "auto"[\s\S]*block: "start"/);
  assert.match(matchTarget, /window\.requestAnimationFrame\(reveal\)/);
  assert.match(matchCss, /scroll-margin-top: calc\(var\(--participant-header-height, 64px\) \+ 16px\)/);
});

test("Profile integration adds no browser-history authority, duplicate route, or client metadata fetch", () => {
  for (const value of [profile, intelligence, formatHistory, playerReturn, overview, round, team]) {
    assert.doesNotMatch(value, /history\.back|router\.back|window\.history|sessionStorage|localStorage/);
  }
  assert.doesNotMatch(formatHistory, /fetch\(|axios|useSWR|useQuery/);
  assert.doesNotMatch(playerReturn, /fetch\(|axios|useSWR|useQuery/);
});
