import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { withCanonicalDraftTeamAverages } from "../lib/draft-team-handicap.js";
import { formatMatchConfirmationTime } from "../lib/live-match-ux.js";
import { publicGuideOverviewFallback } from "../lib/tournament-guide-overview.js";

const root = new URL("../", import.meta.url);

test("Match confirmation timestamps use the tournament time zone without raw or invalid fallbacks", () => {
  const timestamp = "2026-08-24T01:38:05.11097+00:00";
  assert.equal(formatMatchConfirmationTime(timestamp, {
    timeZone: "America/Chicago",
    now: "2026-08-24T03:00:00Z",
  }), "8:38 PM");
  assert.equal(formatMatchConfirmationTime(timestamp, {
    timeZone: "America/Chicago",
    now: "2026-08-25T03:00:00Z",
  }), "Aug 23 at 8:38 PM");
  assert.equal(formatMatchConfirmationTime("2026-03-08T07:30:00Z", {
    timeZone: "America/Chicago",
    now: "2026-03-08T08:30:00Z",
  }), "1:30 AM");
  assert.equal(formatMatchConfirmationTime(null), "");
  assert.equal(formatMatchConfirmationTime("not-a-date"), "");
  assert.equal(formatMatchConfirmationTime(timestamp, { timeZone: "Not/AZone", now: "2026-08-24T03:00:00Z" }), "8:38 PM");
});

test("Draft team averages derive from the complete active canonical roster without mutating Draft facts", () => {
  const draft = {
    year: 2026,
    projection: { revision: 1, revisionId: "immutable-import" },
    totalDraftPicks: 22,
    draftedCount: 22,
    teams: [
      { id: "PICKLES", side: "Team 1", averageHandicap: null },
      { id: "LIPPIT", side: "Team 2", averageHandicap: null },
    ],
    picks: Array.from({ length: 22 }, (_, index) => ({
      pickNumber: index + 1,
      team: { id: index % 2 ? "LIPPIT" : "PICKLES" },
      player: { id: `P${index + 1}` },
    })),
    rosters: [
      { team: { id: "PICKLES" }, picks: [] },
      { team: { id: "LIPPIT" }, picks: [] },
    ],
  };
  const pickles = [11.1, 8, 8, 10.8, 9.1, 5.9, 1.1, 12.4, 2.6, -0.6, 5.8, 2.6];
  const lippit = [12.2, 7.7, 13.6, 9.9, 7.2, 1.1, 0.6, 7.5, 4, -0.6, 12.3, 0.6];
  const players = [
    ...pickles.map((tournament_handicap, index) => ({ player_id: `A${index}`, team_id: "PICKLES", participation_status: "ACTIVE", tournament_handicap })),
    ...lippit.map((tournament_handicap, index) => ({ player_id: `B${index}`, team_id: "LIPPIT", participation_status: "ACTIVE", tournament_handicap })),
  ];
  const result = withCanonicalDraftTeamAverages(draft, players, { tournamentId: "2026" });

  assert.ok(Math.abs(result.teams[0].averageHandicap - 6.4) < Number.EPSILON * 10);
  assert.ok(Math.abs(result.teams[1].averageHandicap - 6.341666666666667) < Number.EPSILON * 10);
  assert.ok(Math.abs(result.rosters[0].team.averageHandicap - 6.4) < Number.EPSILON * 10);
  assert.equal(result.totalDraftPicks, 22);
  assert.equal(result.draftedCount, 22);
  assert.deepEqual(result.projection, draft.projection);
  assert.equal(draft.teams[0].averageHandicap, null);
});

test("Draft averages remain unavailable unless every active team member has a canonical handicap", () => {
  const draft = {
    year: 2026,
    teams: [{ id: "ONE", side: "Team 1", averageHandicap: null }],
    picks: [],
    rosters: [{ team: { id: "ONE" }, picks: [] }],
  };
  const result = withCanonicalDraftTeamAverages(draft, [
    { team_id: "ONE", participation_status: "ACTIVE", tournament_handicap: 4 },
    { team_id: "ONE", participation_status: "ACTIVE", tournament_handicap: null },
  ], { tournamentId: "2026" });
  assert.equal(result.teams[0].averageHandicap, null);
});

test("Guide overview fallback promises only published domains", () => {
  const content = {
    schedule: [],
    ruleBook: [{ id: "r1" }],
    tournamentRules: [],
    dining: [],
    localGuide: [{ id: "l1" }],
    importantContacts: [],
  };
  const copy = publicGuideOverviewFallback(content);
  assert.equal(copy, "Explore rules and local information for Sandbagger Invitational week.");
  assert.doesNotMatch(copy, /schedule|dining|contacts/i);
  assert.equal(publicGuideOverviewFallback({}), "Your published resource for Sandbagger Invitational week.");
});

test("Step 14E presentation wiring preserves semantic and public boundaries", async () => {
  const [card, matchCenter, draftPage, draftCss, guide, appGuide] = await Promise.all([
    readFile(new URL("../app/PublicMatchCard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/MatchCenter.js", import.meta.url), "utf8"),
    readFile(new URL("../app/draft/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/draft/draft.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/tournament-guide/PublicTournamentGuide.js", import.meta.url), "utf8"),
    readFile(new URL("../app/app/guide/page.js", import.meta.url), "utf8"),
  ]);
  assert.match(card, /<time dateTime=\{match\.updatedAt\}>\{confirmedTime\}<\/time>/);
  assert.doesNotMatch(card, /Last confirmed \{match\.updatedAt\}/);
  assert.match(matchCenter, /now=\{clock\}/);
  assert.match(draftPage, /withCanonicalDraftTeamAverages/);
  assert.match(draftPage, /readTournamentLiveView/);
  assert.match(draftCss, /min-height:44px/);
  assert.match(guide, /publicGuideOverviewFallback\(content\)/);
  assert.match(appGuide, /participantPresentation: true/);
  assert.doesNotMatch(guide, /Schedules, rules, tournament tools, dining, local information/);
});
