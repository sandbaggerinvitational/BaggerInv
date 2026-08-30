import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mobileHealthResult } from "../lib/mobile-api-v1.js";
import { persistParticipantScore } from "../lib/scoring-persistence-adapter.js";

const authUserId = "11111111-1111-4111-8111-111111111111";
const previewMigration = new URL(
  "../supabase/migrations/202608290001_preview_mobile_scoring_authority_recovery.sql",
  import.meta.url,
);

function current(overrides = {}) {
  return {
    scope: "match",
    authUserId,
    matchId: "M1",
    tournamentId: "2026",
    playerId: "P1",
    accessVersion: 7,
    identityAuthority: "supabase",
    ...overrides,
  };
}

function authorizationContext(overrides = {}) {
  return {
    source: "mobile-native-certified",
    identity: {
      authUserId,
      playerId: "P1",
      tournamentId: "2026",
      ...overrides,
    },
  };
}

function canonicalContext() {
  return { tournamentId: "2026", matchRevision: 10, permissionRevision: 7 };
}

function holePayload(input, overrides = {}) {
  return {
    ok: true,
    code: "SCORE_ACCEPTED",
    match_id: input.match_id,
    hole_number: input.hole_number,
    hole_revision: 1,
    match_revision: 11,
    updated_at: "2026-09-25T14:30:00.000Z",
    gross: { team_1: input.team_1_gross_scores, team_2: input.team_2_gross_scores },
    strokes: { team_1: [0, 0], team_2: [0, 0] },
    net: { team_1: 4, team_2: 5 },
    hole_winner: "Team 1",
    match: {
      current_hole: input.hole_number,
      holes_remaining: 18 - input.hole_number,
      running_result: "Team 1 1 UP",
      scorecard_complete: false,
    },
    ...overrides,
  };
}

function previewAuthorityDependencies(capture) {
  return {
    requireScoringAuthority: () => ({
      resolved: "supabase",
      previewDeployment: true,
      productionDeployment: false,
    }),
    mobileNativeDevelopmentAuthorityEnvironment: () => ({
      available: true,
      identityAuthority: "supabase",
    }),
    submitCanonicalHoleScore: async (input) => {
      capture(input);
      return { payload: holePayload(input), durationMs: 1 };
    },
  };
}

function holeMutation(overrides = {}) {
  return {
    matchId: "M1",
    input: {
      holeNumber: 2,
      team1GrossScores: [4, 5],
      team2GrossScores: [5, 6],
      clientMutationId: "11111111-1111-4111-8111-111111111111",
      expectedMatchRevision: 10,
      expectedRevision: 0,
    },
    current: current(),
    canonicalContext: canonicalContext(),
    authorizationContext: authorizationContext(),
    includeCanonicalAcknowledgement: true,
    updatedBy: "Authenticated mobile participant",
    ...overrides,
  };
}

test("isolated Preview translates only an exact server-certified mobile identity to the Preview RPC", async () => {
  let rpcInput;
  await persistParticipantScore(holeMutation({
    dependencies: previewAuthorityDependencies((input) => { rpcInput = input; }),
  }));

  assert.deepEqual(rpcInput.authorization, {
    passport_verified: true,
    production_verified: false,
    auth_user_id: authUserId,
    tournament_id: "2026",
    match_id: "M1",
    player_id: "P1",
    permission_revision: 7,
    role: "PLAYER",
  });
});

test("mismatched Preview mobile identity fails closed and cannot set RPC verification flags", async () => {
  let rpcInput;
  await persistParticipantScore(holeMutation({
    authorizationContext: authorizationContext({ playerId: "ATTACKER" }),
    dependencies: previewAuthorityDependencies((input) => { rpcInput = input; }),
  }));

  assert.equal(rpcInput.authorization.passport_verified, false);
  assert.equal(rpcInput.authorization.production_verified, false);
  assert.equal(rpcInput.authorization.player_id, "P1");
});

test("Production retains its separate false/true authorization translation", async () => {
  let rpcInput;
  await persistParticipantScore(holeMutation({
    dependencies: {
      requireScoringAuthority: () => ({
        resolved: "supabase",
        previewDeployment: false,
        productionDeployment: true,
      }),
      mobileNativeDevelopmentAuthorityEnvironment: () => ({ available: false }),
      submitCanonicalHoleScore: async (input) => {
        rpcInput = input;
        return { payload: holePayload(input), durationMs: 1 };
      },
    },
  }));

  assert.equal(rpcInput.authorization.passport_verified, false);
  assert.equal(rpcInput.authorization.production_verified, true);
});

test("Production mobile remains fail-closed", () => {
  const health = mobileHealthResult({ VERCEL_ENV: "production" });
  assert.equal(health.status, 503);
  assert.equal(health.body.error.code, "MOBILE_API_UNAVAILABLE");
});

test("authorized Preview mobile finalization reaches the canonical RPC with the same bound identity", async () => {
  let rpcInput;
  const result = await persistParticipantScore(holeMutation({
    input: {
      action: "confirm",
      clientMutationId: "finalize:M1:10",
      expectedMatchRevision: 10,
    },
    dependencies: {
      requireScoringAuthority: () => ({
        resolved: "supabase",
        previewDeployment: true,
        productionDeployment: false,
      }),
      mobileNativeDevelopmentAuthorityEnvironment: () => ({
        available: true,
        identityAuthority: "supabase",
      }),
      finalizeCanonicalMatch: async (input) => {
        rpcInput = input;
        return { payload: {
          ok: true,
          code: "FINALIZED",
          match_revision: 11,
          permission_revision: 8,
          result_winner: "Team 1",
          updated_at: "2026-09-25T14:30:00.000Z",
        }, durationMs: 1 };
      },
    },
  }));

  assert.equal(rpcInput.authorization.passport_verified, true);
  assert.equal(rpcInput.authorization.production_verified, false);
  assert.equal(rpcInput.authorization.auth_user_id, authUserId);
  assert.equal(result.result.matchComplete, true);
});

test("the effective Preview RPC resolves a bound same-ID receipt before mutable scoring guards", async () => {
  const migration = await readFile(previewMigration, "utf8");
  const immutableIdentity = migration.indexOf("authorization,passport_verified");
  const participantBinding = migration.indexOf("from scoring_authority.match_participants participant");
  const mutationLookup = migration.indexOf("from scoring_authority.score_mutations");
  const permissionGuard = migration.indexOf("from scoring_authority.scoring_permissions");
  const lockGuard = migration.indexOf("if match_row.scoring_locked");
  const finalGuard = migration.indexOf("if match_row.status = 'FINAL'");

  assert.ok(immutableIdentity > 0 && immutableIdentity < participantBinding);
  assert.ok(participantBinding < mutationLookup);
  assert.ok(mutationLookup < permissionGuard);
  assert.ok(permissionGuard < lockGuard && lockGuard < finalGuard);
  assert.match(migration, /mutation_row\.actor_id <> actor[\s\S]*'UNAUTHORIZED'/);
  assert.match(migration, /mutation_row\.payload_hash <> payload_hash_value[\s\S]*'IDEMPOTENCY_CONFLICT'/);
  assert.match(migration, /return mutation_row\.result \|\| jsonb_build_object\('idempotent', true\)/);
  assert.match(migration, /revoke all on function public\.submit_hole_score_authoritative\(jsonb\)[\s\S]*service_role/);
  assert.match(migration, /revoke all on function public\.submit_hole_score_authoritative_phase2_inner\(jsonb\)[\s\S]*service_role/);
  assert.match(migration, /grant execute on function public\.submit_hole_score_authoritative\(jsonb\)[\s\S]*to service_role/);
});
