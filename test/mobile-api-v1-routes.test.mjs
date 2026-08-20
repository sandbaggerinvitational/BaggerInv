import assert from "node:assert/strict";
import test from "node:test";
import { GET as healthGET } from "../app/api/mobile/v1/health/route.js";
import { GET as sessionGET } from "../app/api/mobile/v1/session/route.js";

const authUserId = "11111111-1111-4111-8111-111111111111";
const environmentKeys = [
  "VERCEL_ENV",
  "GOOGLE_SHEETS_ID",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "PREVIEW_SCORING_SHEET_ID",
  "PARTICIPANT_IDENTITY_AUTHORITY",
  "SUPABASE_SCORING_MIRROR_URL",
  "SUPABASE_SCORING_MIRROR_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_AUTH_URL",
  "NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY",
];
const previewEnv = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  GOOGLE_SHEETS_SPREADSHEET_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "sb_secret_server_only",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_preview",
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
        headers: { Authorization: "Bearer valid-access-token" },
      });
      const response = await sessionGET(request);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("vary"), "Authorization");
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
