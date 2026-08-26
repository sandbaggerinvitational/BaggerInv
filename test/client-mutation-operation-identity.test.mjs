import assert from "node:assert/strict";
import test from "node:test";

import { createClientMutationOperationIdentityRegistry } from "../lib/client-mutation-operation-identity.js";

test("score and Finalize lost responses retain one operation ID until confirmed", () => {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
  ];
  const registry = createClientMutationOperationIdentityRegistry({ randomUUID: () => ids.shift() });
  const contract = { scoringAuthority: "google", authorityGeneration: "epoch-google", admissionRevision: 7 };
  const score = { action: "score", matchId: "2026-R1-1", holeNumber: 1, team1: [4], team2: [5],
    expectedMatchRevision: 0, scoringAuthorityContract: contract };
  const firstScore = registry.acquire(score);
  const uncertainScoreRetry = registry.acquire({ ...score });
  assert.equal(uncertainScoreRetry.operationRequestId, firstScore.operationRequestId);

  const changedScore = registry.acquire({ ...score, team1: [3] });
  assert.notEqual(changedScore.operationRequestId, firstScore.operationRequestId);
  assert.equal(registry.confirm(firstScore), true);
  const nextConfirmedRevision = registry.acquire(score);
  assert.notEqual(nextConfirmedRevision.operationRequestId, firstScore.operationRequestId);

  const finalize = { action: "finalize", matchId: "2026-R1-1", expectedMatchRevision: 18,
    scoringAuthorityContract: contract };
  const firstFinalize = registry.acquire(finalize);
  const uncertainFinalizeRetry = registry.acquire({ ...finalize });
  assert.equal(uncertainFinalizeRetry.operationRequestId, firstFinalize.operationRequestId);
});

test("an authority transition cannot inherit the prior authority operation ID", () => {
  const ids = [
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
  ];
  const registry = createClientMutationOperationIdentityRegistry({ randomUUID: () => ids.shift() });
  const base = { action: "match-finalize", matchId: "2026-R1-1", expectedMatchRevision: 18 };
  const google = registry.acquire({ ...base, scoringAuthorityContract: { scoringAuthority: "google", authorityGeneration: "google-epoch" } });
  const supabase = registry.acquire({ ...base, scoringAuthorityContract: { scoringAuthority: "supabase", authorityGeneration: "supabase-epoch" } });
  assert.notEqual(google.operationRequestId, supabase.operationRequestId);
});

test("Director lifecycle and canonical configuration retries keep the ID only for an exact uncertain intent", () => {
  const ids = [
    "66666666-6666-4666-8666-666666666666",
    "77777777-7777-4777-8777-777777777777",
    "88888888-8888-4888-8888-888888888888",
    "99999999-9999-4999-8999-999999999999",
  ];
  const registry = createClientMutationOperationIdentityRegistry({ randomUUID: () => ids.shift() });
  const scoringAuthorityContract = { scoringAuthority: "google", admissionRevision: 9 };
  const lifecycle = {
    endpoint: "/api/live-matches", action: "finalize", matchId: "2026-R1-1",
    updates: { Notes: "Verified" }, updatedBy: "Director", scoringAuthorityContract,
  };
  const firstLifecycle = registry.acquire(lifecycle);
  assert.equal(registry.acquire({ ...lifecycle }).operationRequestId, firstLifecycle.operationRequestId);

  const changedLifecycle = registry.acquire({ ...lifecycle, updates: { Notes: "Corrected" } });
  assert.notEqual(changedLifecycle.operationRequestId, firstLifecycle.operationRequestId);

  const tournament = {
    endpoint: "/api/admin/tournament", tournament: "2026", updates: { Status: "Live" },
    updatedBy: "Director", scoringAuthorityContract,
  };
  const firstTournament = registry.acquire(tournament);
  assert.equal(registry.acquire({ ...tournament }).operationRequestId, firstTournament.operationRequestId);
  assert.equal(registry.confirm(firstTournament), true);
  assert.notEqual(registry.acquire(tournament).operationRequestId, firstTournament.operationRequestId);
});
