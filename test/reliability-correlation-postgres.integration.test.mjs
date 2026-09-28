// Proof layer: INTEGRATION / SQL. The HTTP boundary is a local synthetic fetch
// bridge; authority and receipt behavior use the actual Release 139 PostgreSQL
// implementation in a disposable socket-only cluster. No hosted API is called.
import assert from "node:assert/strict";
import test from "node:test";
import {
  observedJsonRpc,
  withOperationalRoute,
} from "../lib/operational-telemetry.js";
import {
  createDatabase,
  createIsolatedCluster,
  destroyIsolatedCluster,
  jsonLiteral,
  openSqlSession,
  postgres17Available,
} from "./support/reliability/postgres17.mjs";
import {
  installCertifiedSqlRepairs,
  installRelease139FunctionCandidates,
  installRelease139Schema,
} from "./support/reliability/release139-schema.mjs";
import { reusableScoreInput } from "./support/reliability/benchmark-operations.mjs";
import { seedSyntheticTournament } from "./support/reliability/synthetic-tournament.mjs";

const firstRequestId = "11111111-1111-4111-8111-111111111111";
const retryRequestId = "22222222-2222-4222-8222-222222222222";
const localRpcUrl = "http://local.invalid/rest/v1/rpc/submit_production_hole_score";

function boundedReceiptQuery(input) {
  return `with requested as (select ${jsonLiteral({
    match_id: input.match_id,
    mutation_key: input.mutation_key,
  })} input), bounded as (
    select mutation.match_id, mutation.mutation_key, mutation.mutation_type,
      mutation.hole_number, mutation.previous_match_revision,
      mutation.next_match_revision, mutation.previous_hole_revision,
      mutation.next_hole_revision, mutation.result
    from scoring_authority.score_mutations mutation, requested
    where mutation.match_id=requested.input->>'match_id'
      and mutation.mutation_key=requested.input->>'mutation_key'
    limit 2
  ) select jsonb_build_object(
    'count',count(*),
    'receipts',coalesce(jsonb_agg(jsonb_build_object(
      'match_id',match_id,
      'mutation_id',mutation_key,
      'mutation_type',mutation_type,
      'hole_number',hole_number,
      'previous_match_revision',previous_match_revision,
      'next_match_revision',next_match_revision,
      'previous_hole_revision',previous_hole_revision,
      'next_hole_revision',next_hole_revision,
      'result',result
    )),'[]'::jsonb)
  ) from bounded`;
}

test("OBS-CORE request correlation joins an actual score receipt and idempotent retry", {
  timeout: 120000,
}, async () => {
  assert.equal(await postgres17Available(), true, "PostgreSQL 17 is required");
  const cluster = await createIsolatedCluster();
  let session;
  let transactionOpen = false;
  try {
    createDatabase(cluster, "correlation_receipt");
    await installRelease139Schema(cluster, "correlation_receipt");
    installRelease139FunctionCandidates(cluster, "correlation_receipt");
    seedSyntheticTournament(cluster, "correlation_receipt");
    // These existing Phase 1 side-game repairs do not replace or alter the
    // canonical score function exercised below.
    installCertifiedSqlRepairs(cluster, "correlation_receipt");

    session = openSqlSession(cluster, "correlation_receipt");
    await session.query("begin");
    transactionOpen = true;

    const events = [];
    const transportCalls = [];
    const receiptReadbacks = [];
    const input = { ...reusableScoreInput };

    // This is deliberately a synthetic in-process HTTP transport. It invokes
    // the actual installed SQL function through the persistent local session;
    // it does not emulate the score result and proves no hosted/API auth path.
    const localFetchBridge = async (url, init) => {
      assert.equal(url, localRpcUrl);
      assert.equal(init.method, "POST");
      const headers = new Headers(init.headers);
      const body = JSON.parse(init.body);
      assert.deepEqual(body, { input });
      assert.equal(headers.has("authorization"), true);
      assert.equal(headers.has("apikey"), true);
      const requestId = headers.get("x-request-id");
      assert.ok([firstRequestId, retryRequestId].includes(requestId));
      transportCalls.push({ requestId, mutationId: body.input.mutation_key });
      const payload = JSON.parse(await session.query(
        `select public.submit_production_hole_score(${jsonLiteral(body.input)})`,
      ));
      return Response.json(payload);
    };

    const handler = withOperationalRoute({
      route: "/api/mobile/v1/scoring/hole",
      domain: "SCORING",
      feature: "score_write",
    }, async (request) => {
      const body = await request.json();
      assert.deepEqual(body, { input });
      const { response, payload } = await observedJsonRpc({
        fetchImpl: localFetchBridge,
        url: localRpcUrl,
        init: {
          method: "POST",
          body: JSON.stringify({ input }),
          headers: {
            "content-type": "application/json",
            authorization: "Bearer TEST_ONLY_NEVER_EMIT",
            apikey: "sb_secret_test_only_never_emit",
          },
        },
        domain: "SCORING",
        queryFamily: "submit_production_hole_score",
        input,
      });
      assert.equal(response.status, 200);
      const receipt = JSON.parse(await session.query(boundedReceiptQuery(input)));
      assert.equal(receipt.count, 1, "exactly one matching canonical mutation receipt");
      assert.equal(receipt.receipts.length, 1);
      receiptReadbacks.push(receipt.receipts[0]);
      return Response.json(payload);
    }, { env: {}, sink: (event) => events.push(event) });

    const attempt = async (requestId) => {
      const response = await handler(new Request(
        "http://local.invalid/api/mobile/v1/scoring/hole",
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: JSON.stringify({ input }),
        },
      ));
      return { response, payload: await response.json() };
    };

    const first = await attempt(firstRequestId);
    assert.equal(first.response.headers.get("x-request-id"), firstRequestId);
    assert.equal(first.payload.ok, true);
    assert.equal(first.payload.code, "ACCEPTED");
    assert.equal(receiptReadbacks[0].match_id, input.match_id);
    assert.equal(receiptReadbacks[0].mutation_id, input.mutation_key);
    assert.equal(receiptReadbacks[0].mutation_type, "HOLE_SCORE");
    assert.deepEqual(receiptReadbacks[0].result, first.payload);

    const retry = await attempt(retryRequestId);
    assert.equal(retry.response.headers.get("x-request-id"), retryRequestId);
    assert.equal(retry.payload.ok, true);
    assert.equal(retry.payload.code, "ACCEPTED");
    assert.equal(retry.payload.idempotent, true);
    const { idempotent, ...storedRetryResult } = retry.payload;
    assert.equal(idempotent, true);
    assert.deepEqual(storedRetryResult, receiptReadbacks[0].result);
    assert.deepEqual(receiptReadbacks[1], receiptReadbacks[0]);

    assert.deepEqual(transportCalls, [
      { requestId: firstRequestId, mutationId: input.mutation_key },
      { requestId: retryRequestId, mutationId: input.mutation_key },
    ]);
    const rpcEvents = events.filter((event) => event.event === "RPC");
    assert.equal(rpcEvents.length, 2);
    assert.deepEqual(rpcEvents.map((event) => event.request_id), [
      firstRequestId,
      retryRequestId,
    ]);
    assert.ok(rpcEvents.every((event) => event.mutation_id === input.mutation_key));
    assert.ok(rpcEvents.every((event) => event.request_id !== event.mutation_id));
    assert.ok(rpcEvents.every((event) => event.outcome === "COMMITTED"));
    assert.ok(rpcEvents.every((event) => event.canonical_readback === "NOT_OBSERVED"),
      "the separate test readback must not relabel the RPC acknowledgement");

    const eventText = JSON.stringify(events);
    assert.doesNotMatch(eventText,
      /TEST_ONLY_NEVER_EMIT|sb_secret_|project_url|source_workbook_id|auth_user_id|team_[12]_gross_scores/);

    await session.query("rollback");
    transactionOpen = false;
  } finally {
    if (session) {
      if (transactionOpen) await session.query("rollback").catch(() => {});
      await session.close();
    }
    await destroyIsolatedCluster(cluster);
  }
});
