import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GET as leadersGET } from "../app/api/mobile/v1/leaders/route.js";
import { GET as matchesGET } from "../app/api/mobile/v1/matches/route.js";
import { GET as scheduleGET } from "../app/api/mobile/v1/schedule/route.js";
import { GET as todayGET } from "../app/api/mobile/v1/today/route.js";
import { mobileV1ReadResponse } from "../lib/mobile-v1-route.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const keys = ["VERCEL_ENV", "GOOGLE_SHEETS_ID", "PREVIEW_SCORING_SHEET_ID", "PARTICIPANT_IDENTITY_AUTHORITY",
  "SUPABASE_SCORING_MIRROR_URL", "SUPABASE_SCORING_MIRROR_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_AUTH_URL",
  "NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY"];
const preview = { VERCEL_ENV: "preview", GOOGLE_SHEETS_ID: "preview", PREVIEW_SCORING_SHEET_ID: "preview",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase", SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret", NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "publishable" };

async function withEnv(values, fn) {
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => { process.env[key] = value; });
  try { return await fn(); } finally { keys.forEach((key) => old[key] == null ? delete process.env[key] : process.env[key] = old[key]); }
}

const routes = [["today", todayGET], ["matches", matchesGET], ["leaders", leadersGET], ["schedule", scheduleGET]];

test("every Step 1B route deterministically requires Bearer auth before domain reads", async () => {
  await withEnv(preview, async () => {
    for (const [name, get] of routes) {
      const response = await get(new Request(`https://preview.example/api/mobile/v1/${name}?playerId=ATTACKER`));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
      assert.deepEqual(await response.json(), { ok: false, apiVersion: "v1",
        error: { code: "UNAUTHORIZED", message: "Authentication required." } });
    }
  });
});

test("every Step 1B route rejects invalid Supabase Bearer tokens", async () => {
  await withEnv(preview, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ message: "bad jwt" }, { status: 401 });
    try {
      for (const [name, get] of routes) {
        const response = await get(new Request(`https://preview.example/api/mobile/v1/${name}`, { headers: { Authorization: "Bearer invalid" } }));
        assert.equal(response.status, 401);
        assert.equal((await response.json()).error.code, "INVALID_TOKEN");
      }
    } finally { globalThis.fetch = original; }
  });
});

test("every Step 1B route fails closed in Production before token verification", async () => {
  await withEnv({ ...preview, VERCEL_ENV: "production" }, async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not call"); };
    try {
      for (const [name, get] of routes) {
        const response = await get(new Request(`https://production.example/api/mobile/v1/${name}`, { headers: { Authorization: "Bearer token" } }));
        assert.equal(response.status, 503);
        assert.equal((await response.json()).error.code, "MOBILE_API_UNAVAILABLE");
      }
      assert.equal(calls, 0);
    } finally { globalThis.fetch = original; }
  });
});

test("shared protected route handler supports canonical ETag revalidation", async () => {
  await withEnv(preview, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => String(input.url || input).includes("/auth/v1/user")
      ? Response.json({ id: "11111111-1111-4111-8111-111111111111" })
      : Response.json({ ok: true, data: { authUserId: "11111111-1111-4111-8111-111111111111", playerId: "P1",
        tournament: { id: "2026" }, membership: { active: true } } });
    try {
      const response = await mobileV1ReadResponse(new Request("https://preview.example/api/mobile/v1/test", {
        headers: { Authorization: "Bearer valid", "If-None-Match": "\"canonical-r1\"" },
      }), async () => ({ status: 200, revision: "canonical-r1", body: { ok: true } }));
      assert.equal(response.status, 304);
      assert.equal(response.headers.get("etag"), "\"canonical-r1\"");
      assert.equal(response.headers.get("vary"), "Authorization");
    } finally { globalThis.fetch = original; }
  });
});

test("shared protected route handler denies an authenticated but unmapped participant", async () => {
  await withEnv(preview, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => String(input.url || input).includes("/auth/v1/user")
      ? Response.json({ id: "11111111-1111-4111-8111-111111111111" })
      : Response.json({ ok: false, code: "ACTIVE_USER_PLAYER_LINK_REQUIRED" });
    try {
      let loaded = false;
      const response = await mobileV1ReadResponse(new Request("https://preview.example/api/mobile/v1/test", {
        headers: { Authorization: "Bearer valid" },
      }), async () => { loaded = true; return { status: 200, body: {} }; });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "PARTICIPANT_NOT_FOUND");
      assert.equal(loaded, false);
    } finally { globalThis.fetch = original; }
  });
});

test("schemas, fixtures, and route sources document bounded identity-safe contracts", async () => {
  const schemaNames = ["shared", "today", "matches", "leaders", "schedule"];
  const schemas = await Promise.all(schemaNames.map(async (name) => JSON.parse(await source(`contracts/mobile/v1/${name}.schema.json`))));
  assert.ok(schemas.every((schema) => schema.$schema.includes("2020-12")));
  const fixtures = JSON.parse(await source("contracts/mobile/v1/fixtures.json"));
  assert.equal(fixtures.synthetic, true);
  assert.deepEqual(fixtures.matches.map((row) => row.status), ["scheduled", "inProgress", "completed"]);
  assert.equal(fixtures.today.at(-1).status, null);
  const docs = await source("contracts/mobile/v1/README.md");
  for (const term of ["GET /today", "GET /matches", "GET /leaders", "GET /schedule", "ISO-8601", "America/Chicago", "ETag", "published participant itinerary"]) assert.match(docs, new RegExp(term));
  const implementation = await source("lib/mobile-v1-tournament-reads.js");
  for (const forbidden of ["request.json", "searchParams", "authorization", "SUPABASE_SCORING_MIRROR_SECRET_KEY", "console.", "service_role"]) assert.equal(implementation.includes(forbidden), false);
  for (const path of ["today", "matches", "leaders", "schedule"]) {
    const route = await source(`app/api/mobile/v1/${path}/route.js`);
    assert.match(route, /mobileV1ReadResponse/);
    assert.doesNotMatch(route, /cookies|playerPassport|scoring|Director|request\.json|searchParams/i);
  }
});
