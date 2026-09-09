import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { mobileTodayResult } from "../lib/mobile-v1-tournament-reads.js";
import { mobileV1ReadResponse } from "../lib/mobile-v1-route.js";
import { GET as todayGET } from "../app/api/mobile/v1/today/route.js";
import { issueMobileNativeCertification } from "../lib/mobile-native-certification.js";
import { environment, authorityFixtures, actor, productionContext, request } from "./fixtures/pn2-native.mjs";

const at = new Date("2026-09-24T12:00:00.000Z");
const identity = { ...actor, context: { ...actor, membership: { active: true }, contextRevision: 1,
  tournament: { id: "2026" }, team: { id: "T1", name: "Synthetic team" } } };
const rpc = (data) => ({ payload: { ok: true, data } });
function home() {
  return { revision: "home-r1", player: { id: actor.playerId, name: "Synthetic player" },
    participant: {}, liveData: { tournament: {
      id: "2026", year: 2026, name: "Synthetic tournament", status: "Upcoming",
      currentRound: 1, timeZone: "America/New_York",
      teamOne: { id: "T1", name: "One" }, teamTwo: { id: "T2", name: "Two" },
    }, rounds: [{ number: 1, label: "Opening round", matches: [{
      id: "SYNTHETIC-M1", round: 1, format: "SI", status: "Upcoming",
      course: { id: "C1", name: "Synthetic course", tee: "Blue" }, teeTime: "8:10 AM",
      team1Players: [{ id: actor.playerId, name: "Synthetic player" }],
      team2Players: [{ id: "SYNTHETIC-P2", name: "Synthetic opponent" }],
    }] }] } };
}
function guide() {
  return rpc({ projection_revision: 1, delivery_fingerprint: "synthetic-guide-1",
    published_at: "2026-09-20T12:00:00.000Z", content: { content: {
      tournamentIdentity: { timeZone: "America/New_York" }, schedule: [{
        "Event ID": "welcome", "Event Date": "2026-09-24", "Start Time": "9:00 AM",
        "End Time": "10:00 AM", Title: "Synthetic welcome", Location: "Clubhouse",
      }],
    } } });
}
async function build({ homeData = home(), guideRead = guide(), viewer = identity, now = at,
  env = { VERCEL_ENV: "production" } } = {}) {
  const before = structuredClone({ homeData, guideRead, viewer });
  const result = await mobileTodayResult(viewer, { env, now, dependencies: {
    requireHomeReadSource: () => ({ resolved: "supabase" }),
    readParticipantHomeView: async (scope) => {
      assert.deepEqual(scope, { tournamentId: viewer.tournamentId, playerId: viewer.playerId });
      return rpc({});
    },
    participantHomeDataFromSupabaseView: () => homeData,
    readGuideProjection: async (scope) => {
      assert.equal(scope.tournamentId, viewer.tournamentId); return guideRead;
    },
    // Keep the real Guide projection/DTO assembly and schedule filtering.
  } });
  assert.deepEqual({ homeData, guideRead, viewer }, before, "read assembly must not mutate inputs");
  return result;
}
function changedGuide() {
  const value = guide();
  value.payload.data.projection_revision = 2;
  value.payload.data.delivery_fingerprint = "synthetic-guide-2";
  value.payload.data.content.content.schedule[0].Title = "Updated published welcome";
  return value;
}

test("Today identical representation keeps a stable validator and the committed schema", async () => {
  const a = await build(), b = await build();
  assert.deepEqual(a.body.data, b.body.data);
  assert.equal(a.revision, b.revision);
  assert.equal(a.body.meta.revision, a.revision);
  const ajv = new Ajv({ strict: false }); addFormats(ajv);
  for (const name of ["shared", "today"]) {
    const url = new URL(`../contracts/mobile/v1/${name}.schema.json`, import.meta.url);
    const schema = JSON.parse(await readFile(url, "utf8")); schema.$id = url.href;
    ajv.addSchema(schema);
  }
  assert.equal(ajv.getSchema(new URL("../contracts/mobile/v1/today.schema.json", import.meta.url).href)(a.body), true);
});

test("Today Home/match changes invalidate even without an upstream revision bump", async () => {
  const a = await build();
  for (const revision of ["home-r1", "home-r2"]) {
    const value = home(); value.revision = revision;
    value.liveData.rounds[0].matches[0].teeTime = "9:10 AM";
    const b = await build({ homeData: value });
    assert.notDeepEqual(a.body.data, b.body.data);
    assert.notEqual(a.revision, b.revision);
  }
});

test("Today Guide publication affecting the representation invalidates its validator", async () => {
  const a = await build(), b = await build({ guideRead: changedGuide() });
  assert.notDeepEqual(a.body.data, b.body.data);
  assert.notEqual(a.revision, b.revision);
});

test("Today relevant schedule fields invalidate without relying on publication metadata", async () => {
  const a = await build();
  for (const [key, value] of [["Location", "New venue"], ["Start Time", "9:15 AM"], ["End Time", "10:30 AM"]]) {
    const read = guide(); read.payload.data.content.content.schedule[0][key] = value;
    const b = await build({ guideRead: read });
    assert.notDeepEqual(a.body.data, b.body.data);
    assert.notEqual(a.revision, b.revision);
  }
});

test("Today remains stable throughout an unchanged visible interval", async () => {
  const a = await build(), b = await build({ now: new Date("2026-09-24T13:59:59.999Z") });
  assert.deepEqual(a.body.data, b.body.data);
  assert.notEqual(a.body.meta.generatedAt, b.body.meta.generatedAt);
  assert.equal(a.revision, b.revision);
});

test("Today changes at the actual inclusive end-time boundary without clock churn", async () => {
  const a = await build({ now: new Date("2026-09-24T14:00:00.000Z") });
  const b = await build({ now: new Date("2026-09-24T14:00:00.001Z") });
  const c = await build({ now: new Date("2026-09-24T15:00:00.000Z") });
  assert.equal(a.body.data.immediateSchedule.length, 1);
  assert.equal(b.body.data.immediateSchedule.length, 0);
  assert.notEqual(a.revision, b.revision);
  assert.deepEqual(b.body.data, c.body.data);
  assert.equal(b.revision, c.revision);
});

test("Today no-end events expire at their start and promote the next bounded event", async () => {
  const read = guide(), first = read.payload.data.content.content.schedule[0];
  delete first["End Time"];
  read.payload.data.content.content.schedule = Array.from({ length: 4 }, (_, i) => ({
    ...first, "Event ID": `event-${i}`, "Start Time": `${9 + i}:00 ${i === 3 ? "PM" : "AM"}`,
  }));
  const a = await build({ guideRead: read, now: new Date("2026-09-24T13:00:00.000Z") });
  const b = await build({ guideRead: read, now: new Date("2026-09-24T13:00:00.001Z") });
  assert.equal(a.body.data.immediateSchedule.length, 3);
  assert.equal(b.body.data.immediateSchedule.length, 3);
  assert.notDeepEqual(a.body.data.immediateSchedule, b.body.data.immediateSchedule);
  assert.notEqual(a.revision, b.revision);
});

test("Today ignores upstream revision churn and non-visible private fields", async () => {
  const a = await build(), h = home(), g = guide();
  h.revision = "home-r2"; h.privateDiagnostic = "private-marker";
  g.payload.data.projection_revision = 99;
  g.payload.data.delivery_fingerprint = "metadata-only-change";
  const viewer = structuredClone(identity); viewer.authUserId = "different-private-auth-marker";
  const b = await build({ homeData: h, guideRead: g, viewer });
  assert.deepEqual(a.body.data, b.body.data);
  assert.equal(a.revision, b.revision);
  assert.doesNotMatch(JSON.stringify(b.body), /private-marker|private-auth-marker/);
});

test("Today participant, team and tournament representation changes cannot reuse a validator", async () => {
  const a = await build();
  for (const kind of ["player", "team", "tournament"]) {
    const h = home(), viewer = structuredClone(identity);
    if (kind === "player") { viewer.playerId = "SYNTHETIC-P3"; h.player.id = viewer.playerId; }
    if (kind === "team") viewer.context.team.name = "Changed team presentation";
    if (kind === "tournament") { viewer.tournamentId = "2027"; h.liveData.tournament.id = "2027"; h.liveData.tournament.year = 2027; }
    const b = await build({ homeData: h, viewer });
    assert.notDeepEqual(a.body.data, b.body.data);
    assert.notEqual(a.revision, b.revision);
  }
});

// Exercise the actual shared response handler, bearer/certificate verification,
// and Production response recheck. Only provider reads are synthetic; any
// unlisted transport (including a mutation/provider operation) fails the test.
async function withReadRoute(run, { enabled = true } = {}) {
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  const env = environment(enabled ? ["reads", "certification"] : []), fixtures = authorityFixtures(env);
  // Existing web controlled-enrollment prerequisite; local synthetic config only.
  env.PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED = "true";
  Object.assign(process.env, env);
  const calls = [];
  globalThis.fetch = async (input) => {
    const path = new URL(String(input?.url || input)).pathname;
    calls.push(path);
    if (path === "/auth/v1/user") return Response.json({ id: actor.authUserId });
    if (path.endsWith("/inspect_production_cutover_read_state")) return Response.json(fixtures.read);
    if (path.endsWith("/inspect_production_scoring_admission")) return Response.json(fixtures.admission);
    if (path.endsWith("/read_production_current_tournament_runtime_v1")) return Response.json(fixtures.current);
    if (path.endsWith("/read_production_participant_context_for_auth")) return Response.json({ ok: true, data: identity.context });
    assert.fail("Unexpected provider transport in local read-only test");
  };
  try {
    const certificate = enabled ? issueMobileNativeCertification({ ...actor, env, productionContext: productionContext() }) : null;
    const req = (etag) => request("today", { headers: {
      authorization: "Bearer synthetic", "x-bagger-certification": certificate?.token || "synthetic",
      "if-none-match": `"${etag}"`,
    } });
    await run({ req, calls, fixtures });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

test("Today old If-None-Match after Guide change returns the current 200 representation", async () => {
  const a = await build(), b = await build({ guideRead: changedGuide() });
  await withReadRoute(async ({ req }) => {
    const response = await mobileV1ReadResponse(req(a.revision), async () => b);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, b.body.data);
  });
});

test("Today old If-None-Match after expiration returns 200", async () => {
  const a = await build(), b = await build({ now: new Date("2026-09-24T14:00:00.001Z") });
  await withReadRoute(async ({ req }) => {
    const response = await mobileV1ReadResponse(req(a.revision), async () => b);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.immediateSchedule, []);
  });
});

test("Today matching current representation permits 304 after authority recheck", async () => {
  const a = await build();
  await withReadRoute(async ({ req, calls }) => {
    const response = await mobileV1ReadResponse(req(a.revision), async () => a);
    assert.equal(response.status, 304, JSON.stringify({ calls, error: response.status === 304 ? null : await response.clone().json() }));
    assert.equal(response.headers.get("etag"), `"${a.revision}"`);
    assert.equal(calls.filter(p => p.endsWith("/inspect_production_cutover_read_state")).length, 2);
  });
});

test("Today authority change during assembly denies instead of returning 304", async () => {
  const a = await build();
  await withReadRoute(async ({ req, fixtures }) => {
    const response = await mobileV1ReadResponse(req(a.revision), async () => {
      fixtures.current.pointerRevision++; return a;
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "AUTH_CERTIFICATION_FAILED");
    assert.equal("data" in body, false);
  });
});

test("Today READS OFF denies the real route before transport, DTO or 304", async () => {
  await withReadRoute(async ({ req, calls }) => {
    const response = await todayGET(req("stale-validator"));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "NATIVE_READS_DISABLED");
    assert.equal(calls.length, 0);
  }, { enabled: false });
});

test("Today Preview uses the same representation contract and rejects Google source", async () => {
  const production = await build(), preview = await build({ env: { VERCEL_ENV: "preview" } });
  assert.deepEqual(preview.body, production.body);
  let reads = 0;
  await assert.rejects(() => mobileTodayResult(identity, { dependencies: {
    requireHomeReadSource: () => ({ resolved: "google" }),
    readParticipantHomeView: async () => { reads++; },
  } }), { code: "MOBILE_API_UNAVAILABLE" });
  assert.equal(reads, 0);
});
