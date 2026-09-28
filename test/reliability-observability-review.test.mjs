// Independent Phase 1 review: local UNIT/contract proof only. No database or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import { RPC_MUTATION_CONTRACT } from "../lib/operational-rpc-contract.js";
import {
  emitOperationalEvent,
  observedJsonRpc,
  operationalPhase,
  recordOperationalError,
  rpcIsMutation,
  withOperationalRoute,
} from "../lib/operational-telemetry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestId = "42dfce76-9a44-4caf-b8a7-13e981cc1947";
const request = () => new Request("https://example.invalid/api/reliability/review", {
  headers: { "x-request-id": requestId },
});

function fixture(handler, { env = {} } = {}) {
  const events = [];
  const run = withOperationalRoute(
    { route: "/api/reliability/review", domain: "DATABASE", feature: "telemetry-review" },
    handler,
    { env, sink: (event) => events.push(event) },
  );
  return { events, run };
}

function rpcCall(queryFamily, fetchImpl) {
  return observedJsonRpc({
    fetchImpl,
    url: `https://example.invalid/rest/v1/rpc/${queryFamily}`,
    init: {
      method: "POST",
      headers: { apikey: "sb_secret_never_emit" },
      body: JSON.stringify({ input: { operation_id: "review-operation" } }),
    },
    domain: "DATABASE",
    queryFamily,
    input: { operation_id: "review-operation" },
  });
}

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function block(contents, start, end) {
  const from = contents.indexOf(start);
  assert.notEqual(from, -1, `Missing source marker: ${start}`);
  const to = contents.indexOf(end, from);
  assert.notEqual(to, -1, `Missing source terminator after: ${start}`);
  return contents.slice(from, to + end.length);
}

function quotedOperationNames(contents, start, end = "]);") {
  return [...block(contents, start, end).matchAll(/["']([a-z][a-z0-9_]+)["']/g)]
    .map((match) => match[1]);
}

function scoringOperationNames(contents) {
  return [...block(contents, "const RPC_PHASE", "});").matchAll(/^\s*([a-z][a-z0-9_]+):/gm)]
    .map((match) => match[1]);
}

test("review: explicit RPC effect catalog covers every instrumented server allowlist", () => {
  const operationNames = new Set([
    ...quotedOperationNames(
      source("lib/production-calcutta-server.js"),
      "const RPC_ALLOWLIST",
    ),
    ...quotedOperationNames(
      source("lib/production-net-skins-server.js"),
      "const RPC_ALLOWLIST",
    ),
    ...quotedOperationNames(
      source("lib/production-odds-calculation-server.js"),
      "const ANNUAL_ODDS_RPC_ALLOWLIST",
    ),
    ...quotedOperationNames(
      source("lib/production-odds-calculation-server.js"),
      "const RPC_ALLOWLIST",
    ),
    ...quotedOperationNames(
      source("lib/production-tournament-setup-server.js"),
      "const RPCS",
    ),
    ...scoringOperationNames(
      source("lib/production-scoring-operations-server.js"),
    ),
    "read_production_current_tournament_runtime_v1",
  ]);

  const missing = [...operationNames]
    .filter((name) => !Object.hasOwn(RPC_MUTATION_CONTRACT, name))
    .sort();
  assert.deepEqual(missing, []);

  for (const name of operationNames) {
    assert.ok(
      [true, false, null].includes(RPC_MUTATION_CONTRACT[name]),
      `${name} must be explicitly classified true, false, or dispatcher-null`,
    );
  }

  for (const name of [
    "enqueue_production_calcutta_v1_recalculation",
    "fail_production_calcutta_v1_recalculation",
    "replace_production_calcutta_v1_auction_facts",
    "clear_production_calcutta_v1_auction_entry",
    "save_production_net_skins_entries_v1",
    "checkpoint_production_odds_calculation_job",
    "write_competition_derived_snapshot",
  ]) assert.equal(rpcIsMutation(name), true, name);

  for (const name of [
    "read_production_calcutta_management_v1",
    "read_production_current_tournament_runtime_v1",
    "inspect_production_scoring_workers",
    "resolve_production_calcutta_postcommit_match_v1",
  ]) assert.equal(rpcIsMutation(name), false, name);

  assert.equal(rpcIsMutation("dispatch_production_annual_scoring_v1"), null);
  assert.equal(rpcIsMutation("unreviewed_rpc_family"), null);
});

test("review: write, read, and unresolved dispatcher families preserve outcome uncertainty", async () => {
  const families = [
    ["enqueue_production_calcutta_v1_recalculation", "UNKNOWN"],
    ["fail_production_calcutta_v1_recalculation", "UNKNOWN"],
    ["replace_production_calcutta_v1_auction_facts", "UNKNOWN"],
    ["read_production_calcutta_management_v1", "NOT_APPLICABLE"],
    ["dispatch_production_annual_scoring_v1", "UNOBSERVED"],
  ];
  const lost = new TypeError("synthetic lost response");
  const { events, run } = fixture(async () => {
    for (const [family] of families) {
      try {
        await rpcCall(family, async () => { throw lost; });
      } catch (error) {
        assert.equal(error, lost);
      }
    }
    return Response.json({ ok: true });
  });

  await run(request());
  const rpcEvents = events.filter((event) => event.event === "RPC");
  assert.equal(rpcEvents.length, families.length);
  for (const [family, expected] of families) {
    assert.equal(
      rpcEvents.find((event) => event.query_family === family)?.outcome,
      expected,
      family,
    );
  }
});

test("review: final request classification combines recorded code with actual status", async () => {
  for (const [status, expected] of [
    [401, "AUTH_INVALID"],
    [403, "AUTHORIZATION_DENIED"],
    [503, "FEATURE_UNAVAILABLE"],
  ]) {
    const { events, run } = fixture(() => {
      recordOperationalError(Object.assign(
        new Error("private detail"),
        { code: "INTERNAL_ERROR" },
      ));
      return Response.json({ ok: false }, { status });
    });

    const response = await run(request());
    assert.equal(response.status, status);
    const summary = events.findLast((event) => event.event === "REQUEST");
    assert.equal(summary.error_class, expected);
    assert.equal(summary.domain_error_code, "INTERNAL_ERROR");
    assert.equal(summary.http_status, status);
  }
});

test("review: shared-cache responses omit attempt ID without changing cache policy", async () => {
  for (const cacheControl of [
    "public, max-age=0, s-maxage=5, stale-while-revalidate=15",
    "max-age=0, s-maxage=10",
  ]) {
    const { events, run } = fixture(() => Response.json(
      { ok: true },
      { headers: { "Cache-Control": cacheControl, ETag: '"stable"' } },
    ));

    const response = await run(request());
    assert.equal(response.headers.get("x-request-id"), null);
    assert.equal(response.headers.get("cache-control"), cacheControl);
    assert.equal(response.headers.get("etag"), '"stable"');
    assert.equal(events.at(-1).request_id, requestId);
  }
});

test("review: invalid configured bindings stay null with UNAVAILABLE provenance", async () => {
  for (const invalid of ["not-an-integer", "-1", "1.5", " ", "1e2"]) {
    const { events, run } = fixture(
      () => Response.json({ ok: true }),
      {
        env: {
          BAGGER_TELEMETRY_RELEASE_ID: invalid,
          BAGGER_TELEMETRY_ACTIVATION_REVISION: invalid,
        },
      },
    );

    await run(request());
    const summary = events.at(-1);
    assert.equal(summary.release, null, invalid);
    assert.equal(summary.release_source, "UNAVAILABLE", invalid);
    assert.equal(summary.activation, null, invalid);
    assert.equal(summary.activation_source, "UNAVAILABLE", invalid);
  }
});

test("review: all actual event branches conform to OPERATIONAL-EVENT-SCHEMA", async () => {
  const schema = JSON.parse(source(
    "docs/reliability/observability/OPERATIONAL-EVENT-SCHEMA.json",
  ));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const { events, run } = fixture(async () => {
    emitOperationalEvent({
      event: "OUTCOME",
      phase: "review_readback",
      outcome: "COMMITTED",
      canonical_readback: "VERIFIED",
    });
    await operationalPhase("review_success", async () => true, "DATABASE");
    try {
      await operationalPhase(
        "review_failure",
        async () => { throw Object.assign(new Error("private"), { code: "DATABASE_TIMEOUT" }); },
        "DATABASE",
      );
    } catch {}
    recordOperationalError(
      Object.assign(new Error("private"), { code: "DEPENDENCY_BLOCKED" }),
      503,
    );

    await rpcCall(
      "enqueue_production_calcutta_v1_recalculation",
      async () => Response.json({ ok: true, operation_id: "review-operation" }),
    );
    await rpcCall(
      "fail_production_calcutta_v1_recalculation",
      async () => Response.json({ ok: false, code: "PRODUCTION_CALCUTTA_CONFLICT" }),
    );
    await rpcCall(
      "read_production_calcutta_management_v1",
      async () => Response.json({ ok: true }),
    );
    await rpcCall(
      "dispatch_production_annual_scoring_v1",
      async () => Response.json({ ok: true }),
    );
    try {
      await rpcCall(
        "replace_production_calcutta_v1_auction_facts",
        async () => { throw new TypeError("synthetic transport loss"); },
      );
    } catch {}

    return Response.json({ ok: false }, { status: 503 });
  }, {
    env: {
      BAGGER_TELEMETRY_RELEASE_ID: "139",
      BAGGER_TELEMETRY_ACTIVATION_REVISION: "238",
      VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    },
  });

  await run(request());
  assert.deepEqual(
    new Set(events.map((event) => event.event)),
    new Set(["REQUEST", "PHASE", "RPC", "DOMAIN_ERROR", "OUTCOME"]),
  );
  assert.ok(events.some((event) => event.outcome === "COMMITTED"));
  assert.ok(events.some((event) => event.outcome === "NOT_COMMITTED"));
  assert.ok(events.some((event) => event.outcome === "UNKNOWN"));
  assert.ok(events.some((event) => event.outcome === "NOT_APPLICABLE"));
  assert.ok(events.some((event) => event.outcome === "UNOBSERVED"));

  for (const [index, event] of events.entries()) {
    assert.equal(
      validate(event),
      true,
      `event ${index} failed schema: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(event)}`,
    );
  }
});
