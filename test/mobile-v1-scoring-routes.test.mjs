import assert from "node:assert/strict";
import test from "node:test";
import { GET as currentGET } from "../app/api/mobile/v1/scoring/current/route.js";
import { POST as finalizePOST } from "../app/api/mobile/v1/scoring/finalize/route.js";
import { POST as holePOST } from "../app/api/mobile/v1/scoring/hole/route.js";
import { issueMobileNativeCertification } from "../lib/mobile-native-certification.js";

const authUserId = "11111111-1111-4111-8111-111111111111";
const previewWorkbookId = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const previewSupabaseUrl = "https://idgigvjjqkfbqjeredpb.supabase.co";
const environmentKeys = [
  "VERCEL_ENV",
  "GOOGLE_SHEETS_ID",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "PREVIEW_SCORING_SHEET_ID",
  "PARTICIPANT_IDENTITY_AUTHORITY",
  "SCORING_AUTHORITY",
  "SCORING_READ_SOURCE",
  "MATCH_AUTHORIZATION_SOURCE",
  "HOME_READ_SOURCE",
  "TOURNAMENT_READ_SOURCE",
  "LEADERBOARDS_CORE_READ_SOURCE",
  "GUIDE_READ_SOURCE",
  "COURSE_PRESENTATION_READ_SOURCE",
  "SECONDARY_HISTORY_READ_SOURCE",
  "DRAFT_READ_SOURCE",
  "HISTORY_2026_READ_SOURCE",
  "COMPLETED_HISTORY_READ_SOURCE",
  "SUPABASE_SCORING_MIRROR_URL",
  "SUPABASE_SCORING_MIRROR_SECRET_KEY",
  "SUPABASE_SCORING_MIRROR_ENABLED",
  "NEXT_PUBLIC_SUPABASE_AUTH_URL",
  "NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY",
  "MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE",
  "PARTICIPANT_AUTH_CAPTCHA_REQUIRED",
  "PARTICIPANT_AUTH_CAPTCHA_CONFIGURED",
  "NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY",
  "PARTICIPANT_AUTH_RATE_LIMIT_SECRET",
  "MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET",
  "MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED",
  "MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED",
];
const previewEnv = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: previewWorkbookId,
  GOOGLE_SHEETS_SPREADSHEET_ID: previewWorkbookId,
  PREVIEW_SCORING_SHEET_ID: previewWorkbookId,
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SCORING_AUTHORITY: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  HOME_READ_SOURCE: "supabase",
  TOURNAMENT_READ_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  DRAFT_READ_SOURCE: "supabase",
  HISTORY_2026_READ_SOURCE: "supabase",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SUPABASE_SCORING_MIRROR_URL: previewSupabaseUrl,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-server-only-key",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: previewSupabaseUrl,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_preview",
  MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE: "supabase-turnstile",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "preview-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "preview-native-rate-limit-secret-at-least-32-chars",
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "preview-native-certification-secret-at-least-32-chars",
  MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
  MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true",
};

async function withEnvironment(values, callback) {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  for (const key of environmentKeys) {
    if (Object.hasOwn(values, key)) process.env[key] = values[key];
    else delete process.env[key];
  }
  try { return await callback(); }
  finally {
    for (const key of environmentKeys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function canonicalContext() {
  return {
    authUserId,
    playerId: "P1",
    displayName: "Player One",
    tournament: { id: "2026", year: 2026, name: "Bagger Invitational" },
    team: { id: "T1", name: "Pickles", side: 1 },
    membership: { active: true, status: "ACTIVE" },
    matches: [{ matchId: "M1", round: 2, format: "BB", status: "LIVE", canScore: true, permissionRevision: 7 }],
    email: "private@example.test",
    phone: "+15555550100",
  };
}

function certifiedHeaders(extra = {}) {
  const { token } = issueMobileNativeCertification({
    authUserId,
    playerId: "P1",
    tournamentId: "2026",
    env: previewEnv,
  });
  return { Authorization: "Bearer valid", "X-Bagger-Certification": token, ...extra };
}

function requestDetails(input, init = {}) {
  const request = input instanceof Request ? input : null;
  return {
    url: request?.url || String(input),
    headers: new Headers(init.headers || request?.headers),
    body: init.body,
  };
}

async function withIdentityFetch(callback, context = canonicalContext()) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const call = requestDetails(input, init);
    calls.push(call);
    if (call.url.endsWith("/auth/v1/user")) {
      return Response.json({ id: authUserId, aud: "authenticated", role: "authenticated" });
    }
    if (call.url.endsWith("/rest/v1/rpc/read_participant_identity_context_for_auth")) {
      return Response.json({ ok: true, data: context });
    }
    throw new Error(`Unexpected request: ${call.url}`);
  };
  try { return await callback(calls); }
  finally { globalThis.fetch = originalFetch; }
}

test("every mobile scoring route requires Step 1A Bearer authentication and uses no-store responses", async () => {
  await withEnvironment(previewEnv, async () => {
    const requests = [
      [currentGET, new Request("https://preview.example/api/mobile/v1/scoring/current")],
      [holePOST, new Request("https://preview.example/api/mobile/v1/scoring/hole", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      })],
      [finalizePOST, new Request("https://preview.example/api/mobile/v1/scoring/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      })],
    ];
    for (const [handler, request] of requests) {
      const response = await handler(request);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
      assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
      assert.equal(response.headers.get("vary"), "Authorization, X-Bagger-Certification");
      assert.deepEqual(await response.json(), {
        ok: false,
        apiVersion: "v1",
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      });
    }
  });
});

test("invalid Bearer tokens are rejected before scoring or participant authority reads", async () => {
  await withEnvironment(previewEnv, async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (input, init = {}) => {
      calls += 1;
      const call = requestDetails(input, init);
      assert.ok(call.url.endsWith("/auth/v1/user"));
      return Response.json({ message: "Invalid JWT" }, { status: 401 });
    };
    try {
      const response = await currentGET(new Request("https://preview.example/api/mobile/v1/scoring/current", {
        headers: { Authorization: "Bearer invalid" },
      }));
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "INVALID_TOKEN");
      assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; }
  });
});

test("client Match manipulation is denied from canonical identity context before scoring RPC access", async () => {
  await withEnvironment(previewEnv, async () => withIdentityFetch(async (calls) => {
    const response = await currentGET(new Request(
      "https://preview.example/api/mobile/v1/scoring/current?matchId=OTHER&playerId=ATTACKER",
      { headers: certifiedHeaders() },
    ));
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, "SCORING_NOT_AUTHORIZED");
    assert.equal(JSON.stringify(body).includes("ATTACKER"), false);
    assert.equal(calls.length, 2);
  }));
});

test("malformed JSON and fields that claim Player or canonical score authority are rejected", async () => {
  await withEnvironment(previewEnv, async () => withIdentityFetch(async () => {
    const malformed = await holePOST(new Request("https://preview.example/api/mobile/v1/scoring/hole", {
      method: "POST",
      headers: certifiedHeaders({ "Content-Type": "application/json" }),
      body: "{",
    }));
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "INVALID_SCORE_INPUT");
  }));

  await withEnvironment(previewEnv, async () => withIdentityFetch(async () => {
    const spoof = await holePOST(new Request("https://preview.example/api/mobile/v1/scoring/hole", {
      method: "POST",
      headers: certifiedHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        matchId: "M1", holeNumber: 1, teamOneGrossScores: [4, 5], teamTwoGrossScores: [5, 6],
        mutationId: "11111111-1111-4111-8111-111111111111", expectedMatchRevision: 10, expectedHoleRevision: 0,
        playerId: "ATTACKER", netScore: 1, winner: "Team 1",
      }),
    }));
    assert.equal(spoof.status, 400);
    assert.equal((await spoof.json()).error.code, "INVALID_SCORE_INPUT");
  }));
});

test("the common mobile gate rejects Preview before identity lookup when scoring authority is not Supabase", async () => {
  await withEnvironment({ ...previewEnv, SCORING_AUTHORITY: "google" }, async () => withIdentityFetch(async (calls) => {
    const response = await holePOST(new Request("https://preview.example/api/mobile/v1/scoring/hole", {
      method: "POST",
      headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: "M1", holeNumber: 1, teamOneGrossScores: [4, 5], teamTwoGrossScores: [5, 6],
        mutationId: "11111111-1111-4111-8111-111111111111", expectedMatchRevision: 10, expectedHoleRevision: 0,
      }),
    }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      apiVersion: "v1",
      error: { code: "MOBILE_API_UNAVAILABLE", message: "The mobile API is unavailable in this environment." },
    });
    assert.equal(calls.length, 0);
  }));
});

test("Production remains fail-closed before any token or scoring lookup", async () => {
  await withEnvironment({ ...previewEnv, VERCEL_ENV: "production" }, async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not be called"); };
    try {
      const response = await currentGET(new Request("https://production.example/api/mobile/v1/scoring/current", {
        headers: { Authorization: "Bearer token" },
      }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "MOBILE_API_UNAVAILABLE");
      assert.equal(calls, 0);
    } finally { globalThis.fetch = originalFetch; }
  });
});
