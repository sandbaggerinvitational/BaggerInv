import assert from "node:assert/strict";
import test from "node:test";
import { GET as healthGET } from "../app/api/mobile/v1/health/route.js";
import { GET as sessionGET } from "../app/api/mobile/v1/session/route.js";
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
  "SUPABASE_SCORING_MIRROR_URL",
  "SUPABASE_SCORING_MIRROR_SECRET_KEY",
  "SUPABASE_SCORING_MIRROR_ENABLED",
  "NEXT_PUBLIC_SUPABASE_AUTH_URL",
  "NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY",
  "HOME_READ_SOURCE",
  "TOURNAMENT_READ_SOURCE",
  "LEADERBOARDS_CORE_READ_SOURCE",
  "GUIDE_READ_SOURCE",
  "COURSE_PRESENTATION_READ_SOURCE",
  "SECONDARY_HISTORY_READ_SOURCE",
  "DRAFT_READ_SOURCE",
  "HISTORY_2026_READ_SOURCE",
  "COMPLETED_HISTORY_READ_SOURCE",
  "SCORING_READ_SOURCE",
  "MATCH_AUTHORIZATION_SOURCE",
  "SCORING_AUTHORITY",
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
  SUPABASE_SCORING_MIRROR_URL: previewSupabaseUrl,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "sb_secret_server_only",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: previewSupabaseUrl,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_preview",
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
    playerId: "CB01",
    displayName: "Chris B",
    tournament: { id: "2026", year: 2026, name: "2026 Sandbagger Invitational" },
    team: { id: "PICKLES", name: "The Pickles", side: 1 },
    membership: { active: true, status: "ACTIVE" },
    matches: [{ matchId: "M1", canScore: true }],
    email: "must-not-leak@example.test",
    phone: "+15555550100",
  };
}

function certifiedHeaders(extra = {}) {
  const { token } = issueMobileNativeCertification({
    authUserId,
    playerId: "CB01",
    tournamentId: "2026",
    env: previewEnv,
  });
  return {
    Authorization: "Bearer valid-access-token",
    "X-Bagger-Certification": token,
    ...extra,
  };
}

function requestDetails(input, init = {}) {
  const request = input instanceof Request ? input : null;
  return {
    url: request?.url || String(input),
    headers: new Headers(init.headers || request?.headers),
    body: init.body,
  };
}

test("health route succeeds in compatible Preview and intentionally fails in Production", async () => {
  await withEnvironment(previewEnv, async () => {
    const response = await healthGET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      ok: true,
      apiVersion: "v1",
      service: "bagger-mobile-api",
      environment: "preview",
      authority: {
        mode: "isolated-development",
        authentication: "preview",
        identity: "preview",
        reads: "preview",
        scoringReads: "preview",
        scoringWrites: "preview",
        productionShadow: false,
        nativeAuth: "email-otp",
        antiAbuse: "supabase-turnstile",
        sessionCertification: "signed-proof-v1",
        authUserCreation: "disabled",
        requestRateLimit: "edge-ip+server-hash",
      },
    });
  });
  await withEnvironment({ ...previewEnv, VERCEL_ENV: "production" }, async () => {
    const response = await healthGET();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      apiVersion: "v1",
      error: { code: "MOBILE_API_UNAVAILABLE", message: "The mobile API is unavailable in this environment." },
    });
  });
});

test("session route verifies Supabase token then resolves the existing canonical Player", async () => {
  await withEnvironment(previewEnv, async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const call = requestDetails(input, init);
      calls.push(call);
      if (call.url.endsWith("/auth/v1/user")) {
        assert.equal(call.headers.get("authorization"), "Bearer valid-access-token");
        assert.equal(call.headers.get("apikey"), previewEnv.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY);
        return Response.json({
          id: authUserId,
          aud: "authenticated",
          role: "authenticated",
          email: "must-not-leak@example.test",
          app_metadata: { provider: "email" },
          user_metadata: { player_id: "ATTACKER" },
          created_at: "2026-08-20T00:00:00.000Z",
        });
      }
      if (call.url.endsWith("/rest/v1/rpc/read_participant_identity_context_for_auth")) {
        assert.equal(call.headers.get("apikey"), previewEnv.SUPABASE_SCORING_MIRROR_SECRET_KEY);
        assert.deepEqual(JSON.parse(call.body), {
          target_auth_user_id: authUserId,
          target_tournament_id: null,
        });
        return Response.json({ ok: true, data: canonicalContext() });
      }
      throw new Error(`Unexpected request: ${call.url}`);
    };
    try {
      const request = new Request("https://preview.example/api/mobile/v1/session?playerId=ATTACKER&team=FAKE", {
        headers: certifiedHeaders(),
      });
      const response = await sessionGET(request);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("vary"), "Authorization, X-Bagger-Certification");
      const body = await response.json();
      assert.deepEqual(body, {
        ok: true,
        apiVersion: "v1",
        data: {
          player: {
            playerId: "CB01",
            displayName: "Chris B",
            team: { teamId: "PICKLES", name: "The Pickles" },
          },
          tournament: {
            tournamentId: "2026",
            name: "2026 Sandbagger Invitational",
            year: 2026,
          },
        },
      });
      const serialized = JSON.stringify(body);
      for (const excluded of [authUserId, "must-not-leak@example.test", "+15555550100", "ATTACKER", "FAKE", "canScore"]) {
        assert.equal(serialized.includes(excluded), false);
      }
      assert.equal(calls.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("session route rejects a valid raw Supabase session until Bagger certification is supplied", async () => {
  await withEnvironment(previewEnv, async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (input) => {
      calls += 1;
      return String(input.url || input).endsWith("/auth/v1/user")
        ? Response.json({ id: authUserId, aud: "authenticated", role: "authenticated" })
        : Response.json({ ok: true, data: canonicalContext() });
    };
    try {
      const response = await sessionGET(new Request("https://preview.example/api/mobile/v1/session", {
        headers: { Authorization: "Bearer valid-access-token" },
      }));
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "AUTH_CERTIFICATION_FAILED");
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("session route rejects absent and invalid tokens with stable errors", async () => {
  await withEnvironment(previewEnv, async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (input, init = {}) => {
      calls += 1;
      const call = requestDetails(input, init);
      assert.ok(call.url.endsWith("/auth/v1/user"));
      return Response.json({ message: "Invalid JWT", code: "bad_jwt" }, { status: 401 });
    };
    try {
      const missing = await sessionGET(new Request("https://preview.example/api/mobile/v1/session"));
      assert.equal(missing.status, 401);
      assert.equal(missing.headers.get("www-authenticate"), "Bearer");
      assert.deepEqual(await missing.json(), {
        ok: false,
        apiVersion: "v1",
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      });
      assert.equal(calls, 0);

      const invalid = await sessionGET(new Request("https://preview.example/api/mobile/v1/session", {
        headers: { Authorization: "Bearer invalid-access-token" },
      }));
      assert.equal(invalid.status, 401);
      assert.deepEqual(await invalid.json(), {
        ok: false,
        apiVersion: "v1",
        error: { code: "INVALID_TOKEN", message: "The access token is invalid or expired." },
      });
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("session route never attempts Auth or identity fallback outside enabled Preview", async () => {
  await withEnvironment({ ...previewEnv, VERCEL_ENV: "production" }, async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => { called = true; throw new Error("must not call"); };
    try {
      const response = await sessionGET(new Request("https://production.example/api/mobile/v1/session", {
        headers: { Authorization: "Bearer token" },
      }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "MOBILE_API_UNAVAILABLE");
      assert.equal(called, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
