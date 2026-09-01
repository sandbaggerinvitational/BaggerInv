import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GET as leadersGET } from "../app/api/mobile/v1/leaders/route.js";
import { GET as matchesGET } from "../app/api/mobile/v1/matches/route.js";
import { GET as scheduleGET } from "../app/api/mobile/v1/schedule/route.js";
import { GET as todayGET } from "../app/api/mobile/v1/today/route.js";
import { mobileV1ReadResponse } from "../lib/mobile-v1-route.js";
import { issueMobileNativeCertification } from "../lib/mobile-native-certification.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const previewWorkbookId = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const previewSupabaseUrl = "https://idgigvjjqkfbqjeredpb.supabase.co";
const keys = ["VERCEL_ENV", "GOOGLE_SHEETS_ID", "PREVIEW_SCORING_SHEET_ID", "PARTICIPANT_IDENTITY_AUTHORITY",
  "SUPABASE_SCORING_MIRROR_URL", "SUPABASE_SCORING_MIRROR_SECRET_KEY", "SUPABASE_SCORING_MIRROR_ENABLED",
  "NEXT_PUBLIC_SUPABASE_AUTH_URL", "NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY", "HOME_READ_SOURCE",
  "TOURNAMENT_READ_SOURCE", "LEADERBOARDS_CORE_READ_SOURCE", "GUIDE_READ_SOURCE",
  "COURSE_PRESENTATION_READ_SOURCE", "SECONDARY_HISTORY_READ_SOURCE", "DRAFT_READ_SOURCE",
  "HISTORY_2026_READ_SOURCE", "COMPLETED_HISTORY_READ_SOURCE", "SCORING_READ_SOURCE",
  "MATCH_AUTHORIZATION_SOURCE", "SCORING_AUTHORITY",
  "MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE", "PARTICIPANT_AUTH_CAPTCHA_REQUIRED",
  "PARTICIPANT_AUTH_CAPTCHA_CONFIGURED", "NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY",
  "PARTICIPANT_AUTH_RATE_LIMIT_SECRET", "MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET",
  "MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED", "MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED"];
const preview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: previewWorkbookId,
  PREVIEW_SCORING_SHEET_ID: previewWorkbookId,
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: previewSupabaseUrl,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: previewSupabaseUrl,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "publishable",
  HOME_READ_SOURCE: "supabase",
  TOURNAMENT_READ_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  DRAFT_READ_SOURCE: "supabase",
  HISTORY_2026_READ_SOURCE: "supabase",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  SCORING_AUTHORITY: "supabase",
  MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE: "supabase-turnstile",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "preview-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "preview-native-rate-limit-secret-at-least-32-chars",
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "preview-native-certification-secret-at-least-32-chars",
  MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
  MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true",
};

async function withEnv(values, fn) {
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => { process.env[key] = value; });
  try { return await fn(); } finally { keys.forEach((key) => old[key] == null ? delete process.env[key] : process.env[key] = old[key]); }
}

const routes = [["today", todayGET], ["matches", matchesGET], ["leaders", leadersGET], ["schedule", scheduleGET]];

function certifiedHeaders(extra = {}, identityOverrides = {}) {
  const { token } = issueMobileNativeCertification({
    authUserId: "11111111-1111-4111-8111-111111111111",
    playerId: "P1",
    tournamentId: "2026",
    env: preview,
    ...identityOverrides,
  });
  return { Authorization: "Bearer valid", "X-Bagger-Certification": token, ...extra };
}

function canonicalParticipantContext() {
  return { ok: true, data: {
    authUserId: "11111111-1111-4111-8111-111111111111",
    playerId: "P1",
    displayName: "Preview Golfer",
    tournament: { id: "2026", year: 2026, name: "Bagger Invitational" },
    membership: { active: true },
  } };
}

function canonicalTournamentLiveView() {
  return {
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "Sandbagger Invitational" },
    teams: [
      { team_side: 1, team_id: "T1", name: "The Pickles" },
      { team_side: 2, team_id: "T2", name: "Lipp it and Rip it" },
    ],
    rounds: [{ tournament_id: "2026", round_number: 1, name: "Round 1", format: "BB" }],
    tournament_presentation: {
      source_fingerprint: "a".repeat(64),
      presentation: {
        tournament: { status: "Live", currentRound: 1, timeZone: "America/New_York" },
        tournamentMatchDisplay: {
          "2026-R1-1": {
            team1Players: [{ id: "P1", playingHcp: null, stroke: null }],
          },
        },
      },
    },
    live_revision: { totalMatchRevisions: 1 },
    query_ms: 1,
    matches: [{
      round: { round_number: 1, format: "BB" },
      match: { match_id: "2026-R1-1", round_number: 1, format: "BB", status: "LIVE",
        scoring_locked: false, current_hole: 1, scored_holes: 1, holes_remaining: 17, match_revision: 1 },
      snapshot: { course_id: "TPG", tee: "Gold", par: 72, rating: 71.9, slope: 136, team_configuration: {} },
      presentation: { display_match_number: "1", course_name: "Turtle Point", tee_time: "8:00 AM",
        tournament_time_zone: "America/New_York" },
      participants: [
        { player_id: "P1", display_name: "Player One", team_side: 1, player_slot: 1,
          playing_handicap: 7.5, final_strokes: 0 },
        { player_id: "P2", display_name: "Player Two", team_side: 1, player_slot: 2,
          playing_handicap: 11, final_strokes: 4 },
        { player_id: "P3", display_name: "Player Three", team_side: 2, player_slot: 1,
          playing_handicap: 5.25, final_strokes: 1 },
        { player_id: "P4", display_name: "Player Four", team_side: 2, player_slot: 2,
          playing_handicap: null, final_strokes: null },
      ],
      scores: [{ hole_number: 1, hole_winner: "Team 1", updated_at: "2026-09-01T12:00:00.000Z" }],
    }],
  };
}

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
        headers: certifiedHeaders({ "If-None-Match": "\"canonical-r1\"" }),
      }), async () => ({ status: 200, revision: "canonical-r1", body: { ok: true } }));
      assert.equal(response.status, 304);
      assert.equal(response.headers.get("etag"), "\"canonical-r1\"");
      assert.equal(response.headers.get("vary"), "Authorization, X-Bagger-Certification");
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
        headers: certifiedHeaders(),
      }), async () => { loaded = true; return { status: 200, body: {} }; });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "PARTICIPANT_NOT_FOUND");
      assert.equal(loaded, false);
    } finally { globalThis.fetch = original; }
  });
});

test("matches route composes its strict response with private 200 to 304 revalidation", async () => {
  await withEnv(preview, async () => {
    const original = globalThis.fetch;
    const rpcBodies = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input?.url || input);
      if (url.includes("/auth/v1/user")) {
        return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
      }
      if (url.includes("/rest/v1/rpc/read_participant_identity_context_for_auth")) {
        return Response.json(canonicalParticipantContext());
      }
      if (url.includes("/rest/v1/rpc/read_tournament_live_view")) {
        rpcBodies.push(JSON.parse(init.body));
        return Response.json({ ok: true, data: canonicalTournamentLiveView() });
      }
      if (url.includes("/rest/v1/rpc/read_current_guide_projection")) {
        return Response.json({ ok: true, data: { projection_revision: 1, content: { content: { courses: [] } } } });
      }
      throw new Error(`Unexpected synthetic request: ${url}`);
    };
    try {
      const url = "https://native-preview.example/api/mobile/v1/matches?playerId=ATTACKER&tournamentId=OTHER";
      const first = await matchesGET(new Request(url, { headers: certifiedHeaders() }));
      assert.equal(first.status, 200);
      assert.equal(first.headers.get("cache-control"), "private, no-cache");
      assert.equal(first.headers.get("vary"), "Authorization, X-Bagger-Certification");
      const etag = first.headers.get("etag");
      assert.match(etag, /^"[0-9a-f]{64}"$/);
      const body = await first.json();
      assertMobileV1Schema("matches", body);
      assert.equal(body.data.matches[0].teams[0].teamId, "T1");
      assert.equal(body.data.matches[0].displayMatchNumber, "1");
      assert.equal(body.data.matches[0].teams[0].participants[0].playingHandicap, 7.5);
      assert.equal(body.data.matches[0].teams[0].participants[0].strokesReceived, 0);
      assert.deepEqual(rpcBodies[0], { target_tournament_id: "2026" });

      const second = await matchesGET(new Request(url, {
        headers: certifiedHeaders({ "If-None-Match": etag }),
      }));
      assert.equal(second.status, 304);
      assert.equal(second.headers.get("etag"), etag);
      assert.equal(await second.text(), "");
    } finally {
      globalThis.fetch = original;
    }
  });
});

test("matches maps canonical WRONG_TOURNAMENT identity denial without loading tournament data", async () => {
  await withEnv(preview, async () => {
    const original = globalThis.fetch;
    let liveRead = false;
    globalThis.fetch = async (input) => {
      const url = String(input?.url || input);
      if (url.includes("/auth/v1/user")) {
        return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
      }
      if (url.includes("/rest/v1/rpc/read_participant_identity_context_for_auth")) {
        return Response.json({ ok: false, code: "WRONG_TOURNAMENT" });
      }
      if (url.includes("/rest/v1/rpc/read_tournament_live_view")) liveRead = true;
      throw new Error(`Unexpected synthetic request: ${url}`);
    };
    try {
      const response = await matchesGET(new Request("https://native-preview.example/api/mobile/v1/matches", {
        headers: certifiedHeaders(),
      }));
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "PARTICIPANT_NOT_FOUND");
      assert.equal(liveRead, false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test("matches requires exact certification and rejects wrong Player or tournament proofs", async () => {
  await withEnv(preview, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => String(input.url || input).includes("/auth/v1/user")
      ? Response.json({ id: "11111111-1111-4111-8111-111111111111" })
      : Response.json({ ok: true, data: { authUserId: "11111111-1111-4111-8111-111111111111", playerId: "P1",
        tournament: { id: "2026" }, membership: { active: true } } });
    try {
      for (const headers of [
        { Authorization: "Bearer valid" },
        certifiedHeaders({}, { playerId: "ATTACKER" }),
        certifiedHeaders({}, { tournamentId: "OTHER" }),
      ]) {
        const response = await matchesGET(new Request("https://preview.example/api/mobile/v1/matches", { headers }));
        assert.equal(response.status, 403);
        assert.equal((await response.json()).error.code, "AUTH_CERTIFICATION_FAILED");
      }
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
  assert.equal(fixtures.leaders.roundStandings[0].roundNumber, 1);
  assert.equal(fixtures.leaders.roundStandings[0].teamStandings[0].points, 2.5);
  const leadersSchema = schemas[schemaNames.indexOf("leaders")];
  assert.ok(leadersSchema.properties.data.required.includes("roundStandings"));
  const docs = await source("contracts/mobile/v1/README.md");
  for (const term of ["GET /today", "GET /matches", "GET /leaders", "GET /schedule", "roundStandings", "Round Scores", "ISO-8601", "America/Chicago", "ETag", "published participant itinerary"]) assert.match(docs, new RegExp(term));
  const implementation = await source("lib/mobile-v1-tournament-reads.js");
  for (const forbidden of ["request.json", "searchParams", "authorization", "SUPABASE_SCORING_MIRROR_SECRET_KEY", "console.", "service_role"]) assert.equal(implementation.includes(forbidden), false);
  for (const path of ["today", "matches", "leaders", "schedule"]) {
    const route = await source(`app/api/mobile/v1/${path}/route.js`);
    assert.match(route, /mobileV1ReadResponse/);
    assert.doesNotMatch(route, /cookies|playerPassport|scoring|Director|request\.json|searchParams/i);
  }
});
