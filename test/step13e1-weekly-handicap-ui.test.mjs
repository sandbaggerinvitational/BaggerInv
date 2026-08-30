import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  normalizeWeeklyHandicapPayload,
  parseWeeklyHandicapBulkPaste,
  weeklyHandicapDraftRows,
  weeklyHandicapDraftSummary,
  weeklyHandicapInputError,
  weeklyHandicapRevisionFromResponse,
} from "../lib/director-weekly-handicaps.js";

const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const players = [
  { playerId: "CB01", displayName: "Clay", teamName: "Red", currentHandicap: 8.4,
    affectedMatches: [{ matchId: "2027-R1-1", roundNumber: 1, matchNumber: 1, status: "SCHEDULED", started: false, frozen: false, safeToRefresh: true }] },
  { playerId: "AM01", displayName: "Alex", teamName: "Blue", currentHandicap: -0.6,
    affectedMatches: [{ matchId: "2027-R1-1", roundNumber: 1, matchNumber: 1, status: "SCHEDULED", started: false, frozen: false, safeToRefresh: true },
      { matchId: "2027-R3-2", roundNumber: 3, matchNumber: 2, status: "LIVE", started: true, frozen: true, safeToRefresh: false }] },
  { playerId: "PK01", displayName: "Parker", teamName: "Red", currentHandicap: null, affectedMatches: [] },
];

test("weekly handicap payload normalizes stable roster IDs, current values, match impact, and history", () => {
  const result = normalizeWeeklyHandicapPayload({ data: {
    tournament_id: "2027", tournament_year: 2027, current_revision: 4, revision: { revision_number: 4 }, suggested_effective_date: "2027-06-12",
    players: [
      { player_id: "CB01", display_name: "Clay", team_name: "Red", tournament_handicap: "0.000", source_index: "1.250", low_index: "-0.5",
        affected_matches: [{ match_id: "2027-R1-1", round_number: 1, match_number: 1, status: "upcoming", snapshot_action: "REFRESH_IF_CHANGED" }] },
      { playerId: "AM01", displayName: "Alex", currentHandicap: -0.69, affectedMatches: [] },
    ],
    history: [{ revision_id: "revision-4", revision_number: 4, status: "approved", effective_date: "2027-06-05",
      changed_player_count: 2, affected_match_count: 1, approved_by: "Director",
      receipt: { receipt_id: "receipt-4", payload_hash: "a".repeat(64) } }],
  } });
  assert.equal(result.tournamentId, "2027");
  assert.equal(result.revision, 4);
  assert.equal(result.players[0].currentHandicap, 0);
  assert.equal(result.players[0].currentHandicapDecimal, "0");
  assert.equal(result.players[0].sourceIndexDecimal, "1.25");
  assert.equal(result.players[0].lowIndexDecimal, "-0.5");
  assert.equal(result.players[1].currentHandicap, -0.69);
  assert.deepEqual(result.players[0].affectedMatches[0], {
    matchId: "2027-R1-1", roundNumber: 1, matchNumber: 1, status: "UPCOMING",
    started: false, frozen: false, safeToRefresh: true,
    affectedPlayerIds: [],
  });
  assert.deepEqual(result.history[0].receipt, { receiptId: "receipt-4", payloadHash: "a".repeat(64) });
});

test("draft rows highlight only real changes and summarize unique refreshable and frozen matches", () => {
  const rows = weeklyHandicapDraftRows(players, { CB01: "8.4", AM01: "-0.2", PK01: "11.25" });
  assert.equal(rows.find((row) => row.playerId === "CB01").changed, false);
  assert.equal(rows.find((row) => row.playerId === "AM01").change, "0.4");
  assert.equal(rows.find((row) => row.playerId === "PK01").change, null);
  assert.equal(rows.find((row) => row.playerId === "PK01").proposedHandicap, 11.25);
  assert.deepEqual(weeklyHandicapDraftSummary(rows), {
    playerCount: 3,
    changedPlayerCount: 2,
    unchangedPlayerCount: 1,
    invalidPlayerCount: 0,
    affectedMatchCount: 2,
    refreshableMatchCount: 1,
    frozenMatchCount: 1,
  });
  assert.equal(weeklyHandicapInputError(""), "Enter a proposed handicap.");
  assert.equal(weeklyHandicapInputError("plus three"), "Enter a valid signed decimal handicap.");
  assert.equal(weeklyHandicapInputError("1e2"), "Enter a valid signed decimal handicap.");
  assert.equal(weeklyHandicapInputError("-1.25"), "");
});

test("a weekly revision keeps complete active-roster coverage when only one player changes", () => {
  const fullRoster = Array.from({ length: 24 }, (_, index) => ({
    playerId: `P${String(index + 1).padStart(2, "0")}`,
    displayName: `Player ${index + 1}`,
    currentHandicap: index / 4,
    affectedMatches: index === 0 ? [{
      matchId: "2027-R1-1", roundNumber: 1, matchNumber: 1, status: "SCHEDULED",
      started: false, frozen: false, safeToRefresh: true,
    }] : [],
  }));
  const proposals = Object.fromEntries(fullRoster.map((player) => [player.playerId, String(player.currentHandicap)]));
  proposals.P01 = "7.25";
  const rows = weeklyHandicapDraftRows(fullRoster, proposals);
  assert.equal(rows.length, 24);
  assert.equal(rows.filter((row) => row.changed).length, 1);
  assert.equal(rows.filter((row) => row.proposedHandicap !== null).length, 24);
});

test("bulk paste accepts stable Player IDs without inventing players or silently accepting duplicates", () => {
  const parsed = parseWeeklyHandicapBulkPaste("Player ID\tHandicap\nCB01\t8.1\nAM01,-1.25\nZZ99\t4\nCB01\t7.9\nPK01\tn/a", players);
  assert.deepEqual(parsed.updates, { CB01: "8.1", AM01: "-1.25" });
  assert.deepEqual(parsed.errors, [
    "Line 4: ZZ99 is not on this roster.",
    "Line 5: CB01 appears more than once.",
    "Line 6: PK01 needs a numeric handicap.",
  ]);
});

test("stage and validate responses preserve the staged revision and authoritative impact plan", () => {
  const result = weeklyHandicapRevisionFromResponse({ data: {
    revision: 9,
    stagedRevision: { revisionId: "revision-9", revision: 9, valid: true, issues: [], validation: {
      changed_players: [{ player_id: "CB01", display_name: "Clay", old_handicap: "8.4", new_handicap: "8.1", change: "-0.3" }],
      unstarted_matches: [{ match_id: "2027-R1-1", round_number: 1, status: "UPCOMING", affected_player_ids: ["CB01"] }],
      started_frozen_matches: [{ match_id: "2027-R2-1", round_number: 2, status: "LIVE", affected_player_ids: ["CB01"] }],
      summary: { changed_player_count: 1, unstarted_refresh_count: 1, started_preserved_count: 1 },
    } },
    receipt: { receiptId: "receipt-9" },
  } });
  assert.equal(result.revisionId, "revision-9");
  assert.equal(result.revision, 9);
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.receipt, { receiptId: "receipt-9" });
  assert.deepEqual(result.validation.summary, {
    changedPlayerCount: 1,
    refreshableMatchCount: 1,
    frozenMatchCount: 1,
    affectedMatchCount: 2,
  });
  assert.equal(result.validation.changedPlayers[0].currentHandicapDecimal, "8.4");
  assert.equal(result.validation.unstartedMatches[0].safeToRefresh, true);
  assert.equal(result.validation.startedFrozenMatches[0].frozen, true);
  assert.deepEqual(result.validation.unstartedMatches[0].affectedPlayerIds, ["CB01"]);
  assert.equal(weeklyHandicapRevisionFromResponse({ data: {
    revisionId: "revision-10", revision: 10, valid: false, validationIssues: ["STALE_REVISION"],
  } }).valid, false);
});

test("weekly handicap UI uses the dedicated same-origin staged workflow and keeps authoritative history", () => {
  const [component, css] = [
    source("app/admin/director/WeeklyHandicapPanel.js"),
    source("app/admin/director/WeeklyHandicapPanel.module.css"),
  ];
  assert.match(component, /const ENDPOINT = "\/api\/director\/handicaps"/);
  assert.match(component, /cache: "no-store"/);
  assert.match(component, /credentials: "same-origin"/);
  assert.match(component, /post\("stage",/);
  assert.match(component, /post\("validate",/);
  assert.match(component, /post\("approve",/);
  assert.match(component, /expectedRevision: data\.revision/);
  assert.match(component, /entries: rows\.map/);
  assert.match(component, /operationRequestId: operation\.operationRequestId/);
  assert.match(component, /createClientMutationOperationIdentityRegistry/);
  assert.match(component, /Player<\/th><th>Current<\/th><th>Proposed<\/th><th>Change<\/th><th>Affected match/);
  assert.match(component, /type="date"/);
  assert.match(component, /Bulk paste/);
  assert.match(component, /data-changed=\{row\.changed/);
  assert.match(component, /row\.changed \? changeLabel\(row\.change\) : "No change"/);
  assert.match(component, /Review revision before approval/);
  assert.match(component, /I reviewed every changed player, the effective date, and all affected matches/);
  assert.match(component, /Authoritative receipt/);
  assert.match(component, /Revision history/);
  assert.match(component, /started\/frozen match/);
  assert.match(component, /handicapLabel\(row\.currentHandicapDecimal.*handicapLabel\(row\.proposedDecimal/s);
  assert.match(component, /proposedHandicap: row\.proposedDecimal/);
  assert.match(component, /sourceIndex: row\.sourceIndexDecimal/);
  assert.match(component, /lowIndex: row\.lowIndexDecimal/);
  assert.match(component, /const editorLocked = \["staging", "validating", "review", "approving"\]/);
  assert.match(component, /validation\.changedPlayers/);
  assert.match(component, /validatedSummary/);
  assert.match(component, /refreshableMatchCount: review\.summary\.refreshableMatchCount/);
  assert.match(component, /frozenMatchCount: review\.summary\.frozenMatchCount/);
  assert.match(component, /approved revision did not return an authoritative receipt/);
  assert.match(css, /tbody tr\[data-changed="true"\]/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.doesNotMatch(component, /google|\/api\/admin\/cms|x-admin-secret|email|authUser/i);
});

test("failed or stale mutations preserve the local draft for deliberate retry", () => {
  const component = source("app/admin/director/WeeklyHandicapPanel.js");
  const approveBlock = component.slice(component.indexOf("const approve = async"), component.indexOf("if (!data) return"));
  assert.match(approveBlock, /catch \(error\)/);
  assert.match(approveBlock, /setPhase\("failure"\)/);
  assert.doesNotMatch(approveBlock, /setProposals|proposalsFrom/);
  assert.match(component, /stagedRevision \? "Retry server validation"/);
  assert.doesNotMatch(component, /Math\.round|toFixed\(0\)|step="0\.1"|min="0"/);
});
