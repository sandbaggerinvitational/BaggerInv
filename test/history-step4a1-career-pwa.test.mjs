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
  scoringGrid,
  scoringCss,
  profileCss,
  serviceWorker,
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
  source("app/ScoringStatGrid.js"),
  source("app/scoring-stats.module.css"),
  source("app/historical.module.css"),
  source("public/sw.js"),
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
  assert.ok(profile.indexOf("<section className={styles.pageHero}") < profile.indexOf("<HistoryNavigation"));
  assert.ok(profile.indexOf("<HistoryNavigation") < profile.indexOf("<CareerHonors"));
});

test("rankings, records, rival, draft history, and partners are genuinely display-only", () => {
  assert.match(intelligence, /<div key=\{row\.key\}>[\s\S]*<strong>\{rank\(row\.rank\)\}<\/strong>[\s\S]*<\/div>/);
  assert.match(intelligence, /"matchWins"/);
  assert.doesNotMatch(intelligence, /title="Current Rankings"/);
  assert.match(intelligence, /<article key=\{record\.slug\}>/);
  assert.doesNotMatch(intelligence, /Record Holder/);
  assert.doesNotMatch(intelligence, /View Leaderboard|record\.href/);
  assert.doesNotMatch(profile, /Compare players|compareHref|\/compare/);
  assert.match(profile, /<LeaderboardPlayer[\s\S]*linked=\{false\}/);
  assert.match(profile, /className=\{styles\.profileDraftHistory\}[\s\S]*<article/);
  assert.doesNotMatch(profile, /Open Historical Draft Analytics|href=\{`\/draft\/\$\{draft\.year\}`\}/);
});

test("Career-only density and Top Partners mobile layout do not change frozen History cards", () => {
  assert.match(scoringGrid, /career = false/);
  assert.match(scoringGrid, /career \? styles\.career/);
  assert.match(scoringGrid, /layout = "default"/);
  assert.match(intelligence, /<ScoringStatGrid career dense/);
  assert.match(intelligence, /layout="fiveBalanced"/);
  assert.match(intelligence, /layout="threeAcross"/);
  assert.match(scoringCss, /\.career \{/);
  assert.match(scoringCss, /\.career \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(scoringCss, /\.career\.threeAcross \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(scoringCss, /\.career\.fiveBalanced \.card:nth-child\(-n \+ 3\) \{[\s\S]*grid-column: span 2/);
  assert.match(scoringCss, /\.career\.fiveBalanced \.card:nth-child\(n \+ 4\) \{[\s\S]*grid-column: span 3/);
  assert.match(profileCss, /\.careerContent \{[\s\S]*padding-top: 30px/);
  assert.match(profileCss, /\.careerContent > \.honorsSection \{[\s\S]*margin-top: 0/);
  assert.match(profile, /styles\.profilePartnersTable/);
  assert.doesNotMatch(profile, /styles\.dataTable\} \$\{styles\.simpleTable/);
  assert.match(profile, /className=\{styles\.profilePartnerResult\}/);
  assert.match(profileCss, /\.profilePartnersTable \.tableRow \{[\s\S]*grid-template-columns: 46px minmax\(0, 1fr\) auto/);
  assert.match(profileCss, /\.careerContent \.profilePartnersTable \.tableRow \{[\s\S]*min-width: 0/);
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

test("the PWA leaves deployment-scoped Next assets to Next during client navigation", () => {
  assert.match(serviceWorker, /CACHE_VERSION = "sbi-shell-v3"/);
  assert.match(serviceWorker, /if \(url\.pathname\.startsWith\("\/_next\/"\)\) return/);
  assert.doesNotMatch(serviceWorker, /url\.pathname\.startsWith\("\/_next\/static\/"\) \|\|/);
  assert.doesNotMatch(serviceWorker, /window\.location|location\.reload/);
});
