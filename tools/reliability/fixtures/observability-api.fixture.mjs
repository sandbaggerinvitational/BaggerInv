// Proof layer: API (actual route, denied request); INTEGRATION (actual scoring
// adapter + observed transport + simulated canonical RPC). No live network.
import assert from "node:assert/strict";
import test from "node:test";
import { POST as holePOST } from "../../../app/api/mobile/v1/scoring/hole/route.js";
import { persistParticipantScore } from "../../../lib/scoring-persistence-adapter.js";
import { withOperationalRoute, observedJsonRpc } from "../../../lib/operational-telemetry.js";

test("OBS-016 API actual native-compatible scoring route preserves unavailable admission and returns correlation", async () => {
  const saved = { fetch: globalThis.fetch, info: console.info };
  const events = [];
  globalThis.fetch = async () => { throw new Error("Network forbidden in fixture"); };
  console.info = value => { if (typeof value === "string" && value.startsWith('{"schema_version":')) events.push(JSON.parse(value)); };
  const old = process.env.BAGGER_OPERATIONAL_TELEMETRY_ENABLED;
  process.env.BAGGER_OPERATIONAL_TELEMETRY_ENABLED = "true";
  try {
    const response = await holePOST(new Request("https://example.invalid/api/mobile/v1/scoring/hole", {
      method: "POST", headers: { "content-type": "application/json", "x-request-id": "9e328177-ab94-462a-a1b0-7aff6fdb445c" }, body: "{}",
    }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-request-id"), "9e328177-ab94-462a-a1b0-7aff6fdb445c");
    assert.equal(response.headers.get("www-authenticate"), null);
    assert.equal((await response.json()).error.code, "MOBILE_API_UNAVAILABLE");
    assert.equal(events.at(-1).domain, "SCORING");
    assert.equal(events.at(-1).http_status, 503);
    assert.equal(events.at(-1).error_class, "FEATURE_UNAVAILABLE");
  } finally {
    globalThis.fetch = saved.fetch; console.info = saved.info;
    if (old === undefined) delete process.env.BAGGER_OPERATIONAL_TELEMETRY_ENABLED; else process.env.BAGGER_OPERATIONAL_TELEMETRY_ENABLED = old;
  }
});

test("OBS-017 INTEGRATION actual canonical persistence adapter records accepted mutation without raw scores", async () => {
  const events = [], calls = [];
  const mutation = "98744c74-d4fb-4cb6-b67e-f8b3d3d9f27c";
  const handler = withOperationalRoute({ route: "/api/scoring/current", domain: "SCORING" }, async () => {
    const result = await persistParticipantScore({
      matchId: "2026-R3-4", input: { holeNumber: 3, team1GrossScores: [5], team2GrossScores: [6], clientMutationId: mutation },
      current: { tournamentId: "2026", playerId: "P1" }, updatedBy: "Private actor never logged",
      canonicalContext: { tournamentId: "2026", matchRevision: 2, permissionRevision: 1 }, env: {},
      dependencies: {
        requireScoringAuthority: () => ({ resolved: "supabase", productionDeployment: false, previewDeployment: false }),
        submitCanonicalHoleScore: async input => {
          calls.push(input);
          const { payload } = await observedJsonRpc({ queryFamily: "submit_production_hole_score", domain: "SCORING", input,
            url: "https://example.invalid/rpc", init: { method: "POST", body: JSON.stringify(input), headers: {} },
            fetchImpl: async () => Response.json({ ok: true, match_id: input.match_id, hole_number: 3,
              gross: { team_1: [5], team_2: [6] }, strokes: { team_1: [1], team_2: [0] }, net: { team_1: 4, team_2: 6 },
              hole_revision: 1, match_revision: 3, updated_at: "2026-09-27T10:00:00.123Z", match: {} }),
          });
          return { payload, durationMs: 1 };
        },
      },
    });
    return Response.json({ ok: true, result: result.result });
  }, { env: {}, sink: value => events.push(value) });
  const response = await handler(new Request("https://example.invalid/api/scoring/current"));
  assert.equal(response.status, 200); assert.equal(calls.length, 1); assert.equal(calls[0].mutation_key, mutation);
  assert.equal(events.find(event => event.phase === "score_acknowledgement").outcome, "COMMITTED");
  assert.equal(events.find(event => event.event === "RPC").mutation_id, mutation);
  assert.doesNotMatch(JSON.stringify(events), /Private actor|team_1|team1GrossScores|gross|auth_user_id/);
});
