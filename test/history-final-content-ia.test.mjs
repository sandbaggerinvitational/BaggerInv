import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildHistory2026Adapter,
  history2026TeamPageModel,
} from "../lib/history-2026-adapter.js";
import {
  historyCourseDisplayName,
  historyHeroPath,
} from "../lib/history-presentation.js";
import {
  makeGuideProjection,
  makeHistory2026Aggregate,
} from "./fixtures/history-2026.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("2026 History reuses the submitted Ocean Course hero without changing the archive hero", async () => {
  const hero = historyHeroPath({ year: 2026, "Hero Image": "ocean-course" });
  assert.equal(hero, "/images/tournaments/hero/ocean-course.webp");
  await access(new URL(`../public${hero}`, import.meta.url));
  const css = await source("app/history/history-participant.module.css");
  assert.match(css, /currentTournamentHero\.currentTournamentHero>img:first-child\{opacity:1\}/);
  assert.match(css, /archiveHero\.archiveHero/);
});

test("History course presentation resolves canonical names and never falls back to an internal ID", () => {
  const courses = [
    { "Course ID": "TPGC01", Course: "Turtle Point Golf Course" },
    { "Course ID": "CPGC01", Course: "Cougar Point Golf Course" },
    { "Course ID": "OCGC01", Course: "The Ocean Course" },
  ];
  assert.equal(historyCourseDisplayName("OCGC01", courses), "The Ocean Course");
  assert.equal(historyCourseDisplayName("UNKNOWN", courses, "Old Macdonald"), "Old Macdonald");
  assert.equal(historyCourseDisplayName("UNKNOWN", courses), "Recorded course");
});

test("Team History consumes canonical tournament-player handicaps, not round strokes", () => {
  const aggregate = makeHistory2026Aggregate();
  const player = aggregate.players.find((row) => row.player_id === "PK01");
  player.tournament_handicap = 11.2;
  for (const record of aggregate.matches) {
    for (const participant of record.participants) {
      if (participant.player_id === "PK01") participant.final_strokes = 2;
    }
  }
  const view = buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() });
  const team = history2026TeamPageModel(view, "PICKLES");
  assert.equal(team.roster.find((row) => row.player["Player ID"] === "PK01").handicap, 11.2);
  assert.equal(team.roundGroups.length, 3);
  assert.ok(team.roundGroups.every((group) => !("matches" in group)));
});

test("Team History owns identity, round summaries, and roster without match-detail duplication", async () => {
  const page = await source("app/history/[year]/team/[side]/page.js");
  assert.match(page, /Tournament Performance/);
  assert.match(page, /Tournament Handicaps/);
  assert.match(page, /href=\{historyPresentationHref\(`\/history\/\$\{team\.year\}\/round\/\$\{group\.number\}`, participantPresentation\)\}/);
  assert.doesNotMatch(page, /HistoricalMatchRow|ScorecardTable|Match story/i);
});

test("historical scorecard disclosures use read-only archive language and secondary help", async () => {
  const table = await source("app/ScorecardTable.js");
  assert.match(table, /Gross & Net/);
  assert.match(table, /How to read this scorecard/);
  assert.match(table, /historyDensity/);
  assert.match(table, /Front 9/);
  assert.match(table, /Back 9/);
});

test("legacy scorecards use the established read-only archive and keep optional failures isolated", async () => {
  const [loader, legacy, yearPage, roundPage] = await Promise.all([
    source("lib/google-sheets-data.js"),
    source("lib/legacy-history-analytics.js"),
    source("app/history/[year]/page.js"),
    source("app/history/[year]/round/[round]/page.js"),
  ]);
  assert.match(loader, /spreadsheetId: PRODUCTION_SPREADSHEET_ID/);
  assert.match(loader, /established bundled archive context/);
  assert.match(legacy, /catch \(error\)/);
  assert.match(yearPage, /Detailed historical scorecards are not available for this tournament/);
  assert.match(roundPage, /Detailed historical scorecards are not available for this round/);
});

test("Team History batch-reads canonical Tournament Handicap without N+1 requests", async () => {
  const [service, metadata] = await Promise.all([
    source("lib/history-2026-service.js"),
    source("lib/history-team-metadata.js"),
  ]);
  assert.match(service, /readLeaderboardsCoreView/);
  assert.match(metadata, /tournament_source_payload/);
  assert.match(metadata, /\["Tournament Handicap"\]/);
  assert.match(service, /includeTournamentPlayerMetadata/);
  assert.doesNotMatch(service, /match_participants[\s\S]*Tournament Handicap/i);
});
