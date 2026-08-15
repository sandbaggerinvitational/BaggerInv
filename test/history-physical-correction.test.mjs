import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { buildHistory2026Adapter } from "../lib/history-2026-adapter.js";
import {
  historyEditionLabel,
  historyHeroPath,
  historyStandingsSummary,
  historyTournamentCardResult,
} from "../lib/history-presentation.js";
import {
  makeGuideProjection,
  makeHistory2026Aggregate,
  makeHistoryMatch,
} from "./fixtures/history-2026.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("all History year cards derive the full canonical edition label", () => {
  const expected = new Map([
    [2017, "1ST"], [2018, "2ND"], [2019, "3RD"], [2020, "4TH"], [2021, "5TH"],
    [2022, "6TH"], [2023, "7TH"], [2024, "8TH"], [2025, "9TH"], [2026, "10TH"],
  ]);
  for (const [year, ordinal] of expected) {
    assert.equal(historyEditionLabel(year), `${ordinal} ANNUAL SANDBAGGER INVITATIONAL`);
  }
});

test("every submitted historical hero maps to a real public asset", async () => {
  const archive = JSON.parse(await source("lib/historical-data.json"));
  for (const tournament of archive.tournaments.filter((row) => Number(row.Year) >= 2017 && Number(row.Year) <= 2026)) {
    const path = historyHeroPath({ ...tournament, year: tournament.Year });
    assert.ok(path, `${tournament.Year} should map a History hero`);
    await access(new URL(`../public${path}`, import.meta.url));
  }
  assert.equal(historyHeroPath({ year: 2026, "Hero Image": "ocean-course-profile.webp" }), "/images/defaults/tournament-hero.webp");
});

test("2026 remains in progress until all canonical matches are FINAL", () => {
  const view = buildHistory2026Adapter(makeHistory2026Aggregate(), { guideProjection: makeGuideProjection() });
  assert.equal(view.tournament.complete, false);
  assert.equal(view.tournament.lifecycle, "IN_PROGRESS");
  assert.equal(view.tournament.championTeam, null);
  assert.equal(historyTournamentCardResult(view.tournament), "Tournament in progress");
});

test("synthetic canonical completion derives the 2026 champion without a History edit", () => {
  const aggregate = makeHistory2026Aggregate();
  for (let matchNumber = 6; matchNumber <= 12; matchNumber += 1) {
    const { wrapper, snapshot } = makeHistoryMatch({ roundNumber: 3, matchNumber, status: "FINAL" });
    aggregate.matches = aggregate.matches.map((record) =>
      record.match.match_id === wrapper.match.match_id ? wrapper : record
    );
    aggregate.finalized_snapshots.push(snapshot);
  }
  const view = buildHistory2026Adapter(aggregate, { guideProjection: makeGuideProjection() });
  assert.equal(view.diagnostics.finalMatches, 24);
  assert.equal(view.tournament.complete, true);
  assert.equal(view.tournament.lifecycle, "FINAL");
  assert.equal(view.tournament.championTeam?.id, "PICKLES");
  assert.equal(view.tournament.championTeam?.name, "The Pickles");
  assert.equal(historyTournamentCardResult(view.tournament), "The Pickles");
  assert.notEqual(historyTournamentCardResult(view.tournament), "Tournament in progress");
});

test("standings summary includes every golfer tied at the fifth-rank cutoff", () => {
  const rows = [
    { id: "1", rank: 1 }, { id: "2", rank: 2 }, { id: "3", rank: 3 },
    { id: "4", rank: 4 }, { id: "5a", rank: "T5" }, { id: "5b", rank: "T5" },
    { id: "7", rank: 7 },
  ];
  assert.deepEqual(historyStandingsSummary(rows).map((row) => row.id), ["1", "2", "3", "4", "5a", "5b"]);
});

test("older History route analytics failure is isolated from the legacy archive payload", async () => {
  const [yearPage, roundPage, fallback] = await Promise.all([
    source("app/history/[year]/page.js"),
    source("app/history/[year]/round/[round]/page.js"),
    source("lib/legacy-history-analytics.js"),
  ]);
  assert.match(yearPage, /loadLegacyHistoryAnalytics/);
  assert.match(roundPage, /loadLegacyHistoryAnalytics/);
  assert.match(fallback, /catch \(error\)/);
  assert.match(fallback, /buildScorecardAnalytics\(\)/);
  assert.doesNotMatch(fallback, /Supabase|migration|schema|localStorage/);
});

test("2026 overview uses summaries and preserves deep destinations without new reads", async () => {
  const page = await source("app/history/[year]/page.js");
  assert.match(page, /historyStandingsSummary\(leaderboard, 5\)/);
  assert.match(page, /View Full Leaderboard/);
  assert.match(page, /\/live\?view=leaderboards&tab=players/);
  assert.match(page, /View All Statistics/);
  assert.match(page, /Lowest Front/);
  assert.match(page, /Lowest Back/);
  assert.match(page, /Hardest Hole/);
  assert.match(page, /Easiest Hole/);
  assert.match(page, /Scorecard Coverage/);
  assert.doesNotMatch(page, /fetch\(|\/api\/live|gviz/i);
});

test("History landing isolates image fallback and does not change its approved hero", async () => {
  const [page, css] = await Promise.all([
    source("app/history/page.js"),
    source("app/history/history-participant.module.css"),
  ]);
  assert.match(page, /fallbackSrc=/);
  assert.match(page, /historyEditionLabel/);
  assert.match(page, /historyTournamentCardResult/);
  assert.match(css, /archiveHero\.archiveHero\{padding:28px 20px 26px\}/);
  assert.match(css, /currentTournamentHero\.currentTournamentHero>img:first-child\{opacity:0\}/);
  assert.doesNotMatch(page, /onError=.*throw|throw new Error/);
});
