import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  PRODUCTION_PLAYER_ACCESS_FILTERS,
  filterProductionPlayerAccessPlayers,
  normalizeProductionPlayerAccessPayload,
  parseProductionPlayerAccessBulk,
  productionPlayerAccessActionAvailable,
  productionPlayerAccessFilterCounts,
} from "../lib/production-director-players-access.js";

const fixture = {
  ok: true,
  data: {
    contractVersion: "production-players-access-v1",
    revision: 7,
    summary: { globalPlayers: 4, activeRoster: 3, enrolled: 1, notEnrolled: 2, needsAttention: 1 },
    capabilities: {
      approveEmail: true,
      approvePhone: true,
      revokePhone: true,
      setLoginPreference: true,
      suspendParticipantAccess: true,
      resumeParticipantAccess: true,
      bulkEnrollment: true,
      createPlayer: false,
      mutateDirectorRole: false,
    },
    players: [
      {
        playerId: "CB01",
        displayName: "Clay Beltran",
        globalStatus: "ACTIVE",
        membership: { exists: true, status: "ACTIVE", teamId: "RED", revision: 3, canChange: true },
        enrollmentState: "ENROLLED",
        maskedEmail: "c***@b***.com",
        emailStatus: "VERIFIED",
        maskedPhone: "••• ••• 0123",
        phoneStatus: "VERIFIED",
        preferredLoginMethod: "EMAIL_PRIMARY",
        effectiveLoginMethod: "EMAIL_PRIMARY",
        authLinkState: "LINKED",
        participantAccessState: "ACTIVE",
        directorStatus: "ACTIVE",
        needsAttention: false,
        authUserId: "00000000-0000-4000-8000-000000000000",
        email: "must-not-reach-browser@baggerinv.com",
      },
      {
        playerId: "CB02",
        displayName: "Second Player",
        globalStatus: "ACTIVE",
        membership: { exists: true, status: "ACTIVE", teamId: "BLUE", revision: 2, canChange: true },
        enrollmentState: "NOT_ENROLLED",
        maskedEmail: "unmasked@baggerinv.com",
        emailStatus: "NOT_CONFIGURED",
        phoneStatus: "NOT_CONFIGURED",
        authLinkState: "NOT_LINKED",
        participantAccessState: "NOT_ENROLLED",
        directorStatus: "NOT_DIRECTOR",
        needsAttention: false,
      },
      {
        playerId: "CB03",
        displayName: "Needs Review",
        globalStatus: "ACTIVE",
        membership: { exists: true, status: "ACTIVE", revision: 1, canChange: false, blocker: "MATCH_ACTIVE" },
        enrollmentState: "INVALID_ENROLLMENT",
        emailStatus: "CONFLICT",
        participantAccessState: "BLOCKED",
        directorStatus: "NOT_DIRECTOR",
      },
      {
        playerId: "CB99",
        displayName: "Former Player",
        globalStatus: "ALUMNI",
        membership: { exists: true, status: "NOT_PLAYING", revision: 4, canChange: true },
        enrollmentState: "NOT_ENROLLED",
        directorStatus: "NOT_DIRECTOR",
      },
    ],
    audit: [{ eventId: 17, action: "EMAIL_APPROVED", targetPlayerId: "CB02", actorPlayerId: "CB01",
      result: "CHANGED", occurredAt: "2026-08-30T12:00:00Z" }],
  },
};

test("Players & Access payload exposes only the bounded masked directory model", () => {
  const data = normalizeProductionPlayerAccessPayload(fixture);
  assert.equal(data.contractVersion, "production-players-access-v1");
  assert.equal(data.revision, 7);
  assert.equal(data.players.length, 4);
  assert.deepEqual(data.summary, { total: 4, roster: 3, enrolled: 1, notEnrolled: 2, needsAttention: 1, directors: 1 });
  assert.equal(data.players.find((player) => player.playerId === "CB01").maskedEmail, "c***@b***.com");
  assert.equal(data.players.find((player) => player.playerId === "CB02").maskedEmail, "",
    "an accidentally returned unmasked stored email must be suppressed");
  assert.equal(JSON.stringify(data).includes("must-not-reach-browser"), false);
  assert.equal(JSON.stringify(data).includes("00000000-0000-4000-8000-000000000000"), false);
  assert.equal(Object.hasOwn(data.players[0], "authUserId"), false);
  assert.equal(data.capabilities["create-player"], false);
  assert.equal(data.capabilities["mutate-director-role"], false);
  assert.equal(data.capabilities["bulk-enroll"], true);
  assert.deepEqual(data.audit[0], {
    id: "17", action: "EMAIL_APPROVED", targetPlayerId: "CB02", actorDisplayName: "CB01",
    result: "CHANGED", timestamp: "2026-08-30T12:00:00Z",
  });
});

test("directory rejects a stale contract or malformed predecessor revision", () => {
  assert.throws(() => normalizeProductionPlayerAccessPayload({ data: {
    contractVersion: "production-players-access-v0",
    revision: 1,
    players: [],
  } }), /invalid Production response/i);
  assert.throws(() => normalizeProductionPlayerAccessPayload({ data: {
    contractVersion: "production-players-access-v1",
    revision: "not-a-revision",
    players: [],
  } }), /invalid Production response/i);
});

test("directory normalization rejects raw identifiers that merely contain the letter x", () => {
  const payload = normalizeProductionPlayerAccessPayload({ data: {
    contractVersion: "production-players-access-v1",
    revision: 1,
    players: [
      { playerId: "PX01", displayName: "Alex", maskedEmail: "alex@baggerinv.com", maskedPhone: "+1 202 555 x1234" },
      { playerId: "PX02", displayName: "Masked", maskedEmail: "m***@b***.com", maskedPhone: "+••• ••• ••34" },
    ],
  } });
  assert.equal(payload.players.find((player) => player.playerId === "PX01").maskedEmail, "");
  assert.equal(payload.players.find((player) => player.playerId === "PX01").maskedPhone, "");
  assert.equal(payload.players.find((player) => player.playerId === "PX02").maskedEmail, "m***@b***.com");
  assert.equal(payload.players.find((player) => player.playerId === "PX02").maskedPhone, "+••• ••• ••34");
});

test("directory filters separate roster, enrollment, attention, Directors, and alumni", () => {
  const { players } = normalizeProductionPlayerAccessPayload(fixture);
  assert.deepEqual(PRODUCTION_PLAYER_ACCESS_FILTERS.map((item) => item.label), [
    "All", "2026 Roster", "Enrolled", "Not Enrolled", "Needs Attention", "Directors", "Alumni-Not Playing",
  ]);
  assert.deepEqual(filterProductionPlayerAccessPlayers(players, { filter: "roster" }).map((player) => player.playerId),
    ["CB01", "CB03", "CB02"]);
  assert.deepEqual(filterProductionPlayerAccessPlayers(players, { filter: "enrolled" }).map((player) => player.playerId), ["CB01"]);
  assert.deepEqual(filterProductionPlayerAccessPlayers(players, { filter: "needs-attention" }).map((player) => player.playerId), ["CB03"]);
  assert.deepEqual(filterProductionPlayerAccessPlayers(players, { filter: "directors" }).map((player) => player.playerId), ["CB01"]);
  assert.deepEqual(filterProductionPlayerAccessPlayers(players, { filter: "alumni-not-playing" }).map((player) => player.playerId), ["CB99"]);
  assert.deepEqual(filterProductionPlayerAccessPlayers(players, { search: "blue cb02" }).map((player) => player.playerId), ["CB02"]);
  const counts = productionPlayerAccessFilterCounts(players);
  assert.equal(counts.roster, 3);
  assert.equal(counts["not-enrolled"], 2);
});

test("participant suspension and resumption stay state-aware and exclude Directors", () => {
  const data = normalizeProductionPlayerAccessPayload(fixture);
  const director = data.players.find((player) => player.playerId === "CB01");
  const unenrolled = data.players.find((player) => player.playerId === "CB02");
  const former = data.players.find((player) => player.playerId === "CB99");
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "approve-email", director), false,
    "linked email replacement stays on the deferred repair boundary");
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "approve-email", unenrolled), true);
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "approve-phone", director), false,
    "a verified phone stays on the certified repair boundary");
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "revoke-phone", director), false,
    "a verified phone cannot be revoked by the readiness operation");
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "approve-phone", unenrolled), true);
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "approve-phone", former), false);
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "set-login-preference", former), false);
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "suspend-access", director), false);
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "suspend-access", unenrolled), false);
  const resumable = { ...unenrolled, participantAccessState: "SUSPENDED" };
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "resume-access", resumable), true);
  assert.equal(productionPlayerAccessActionAvailable(data.capabilities, "create-player", unenrolled), false);
});

test("bulk parser creates one atomic canonical batch and a masked review", () => {
  const { players } = normalizeProductionPlayerAccessPayload(fixture);
  const parsed = parseProductionPlayerAccessBulk([
    "Player ID | Email | Phone",
    "CB02 | second@baggerinv.com | +1 202 555 0123",
    "CB03 | review@baggerinv.com |",
  ].join("\n"), players);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.entries, [
    { playerId: "CB02", email: "second@baggerinv.com", phone: "+12025550123" },
    { playerId: "CB03", email: "review@baggerinv.com", phone: null },
  ]);
  assert.equal(parsed.review[0].maskedEmail, "s***@b***.com");
  assert.equal(parsed.review[0].maskedPhone, "••• ••• 0123");
  assert.equal(JSON.stringify(parsed.review).includes("second@baggerinv.com"), false);
  assert.deepEqual(parsed.summary, { playerCount: 2, emailCount: 2, phoneCount: 1 });
});

test("bulk parser fails the atomic review for unsafe rows, collisions, and non-roster players", () => {
  const { players } = normalizeProductionPlayerAccessPayload(fixture);
  const unsafe = parseProductionPlayerAccessBulk([
    "CB02 | fake@example.com | +1 202 555 0123",
    "CB03 | valid@baggerinv.com | +1 202 555 0199",
    "CB03 | another@baggerinv.com |",
    "CB01 | enrolled@baggerinv.com |",
    "CB99 | former@baggerinv.com |",
    "UNKNOWN | unknown@baggerinv.com |",
  ].join("\n"), players);
  assert.equal(unsafe.valid, false);
  assert.match(unsafe.errors.join("\n"), /placeholder/i);
  assert.match(unsafe.errors.join("\n"), /appears more than once/i);
  assert.match(unsafe.errors.join("\n"), /already enrolled/i);
  assert.match(unsafe.errors.join("\n"), /not on the active tournament roster/i);

  const collision = parseProductionPlayerAccessBulk([
    "CB02 | second@baggerinv.com | +1 202 555 0123",
    "CB03 | valid@baggerinv.com | +1 202 555 0123",
  ].join("\n"), players);
  assert.equal(collision.valid, false);
  assert.match(collision.errors.join("\n"), /duplicates a mobile/i);
});

test("bulk parser accepts 100 rows and blocks 101 before review", () => {
  const players = Array.from({ length: 101 }, (_, index) => ({
    playerId: `PX${String(index + 1).padStart(3, "0")}`,
    displayName: `Player ${index + 1}`,
    membership: { exists: true, status: "ACTIVE" },
    enrollmentState: "NOT_ENROLLED",
  }));
  const rows = players.map((player, index) => `${player.playerId} | player${index + 1}@baggerinv.com |`);
  const hundred = parseProductionPlayerAccessBulk(rows.slice(0, 100).join("\n"), players);
  const hundredOne = parseProductionPlayerAccessBulk(rows.join("\n"), players);
  assert.equal(hundred.valid, true);
  assert.equal(hundred.entries.length, 100);
  assert.equal(hundredOne.valid, false);
  assert.equal(hundredOne.entries.length, 101);
  assert.match(hundredOne.errors.join("\n"), /at most 100/i);
});

test("Players & Access panel retains operation identity through explicit masked review", () => {
  const source = fs.readFileSync(new URL("../app/admin/director/ProductionPlayersAccessPanel.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/director\/players-access/);
  assert.match(source, /createClientMutationOperationIdentityRegistry/);
  assert.match(source, /expectedRevision: data\.revision/);
  assert.match(source, /operationRequestId: operation\.operationRequestId/);
  assert.match(source, /Review before commit/);
  assert.match(source, /I reviewed the masked identifiers/);
  assert.match(source, /await load\(\{ background: true \}\)/);
  for (const action of ["approve-email", "approve-phone", "revoke-phone", "set-login-preference", "suspend-access", "resume-access", "bulk-enroll"]) {
    assert.match(source, new RegExp(action));
  }
  assert.match(source, /Global Player Creation/);
  assert.match(source, /Director Role Management/);
  assert.match(source, /Tournament membership is read only/);
  assert.match(source, /EMAIL_PRIMARY/);
  assert.match(source, /PHONE_PRIMARY/);
  assert.doesNotMatch(source, /set-membership-status/);
  assert.doesNotMatch(source, /authUserId|auth_user_id/);
});
