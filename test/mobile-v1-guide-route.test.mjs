import assert from "node:assert/strict";
import test from "node:test";

import { GET as guideGET } from "../app/api/mobile/v1/guide/route.js";
import { issueMobileNativeCertification } from "../lib/mobile-native-certification.js";

const authUserId = "11111111-1111-4111-8111-111111111111";
const previewWorkbookId = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const previewSupabaseUrl = "https://idgigvjjqkfbqjeredpb.supabase.co";
const environmentKeys = [
  "VERCEL_ENV", "GOOGLE_SHEETS_ID", "PREVIEW_SCORING_SHEET_ID", "PARTICIPANT_IDENTITY_AUTHORITY",
  "SUPABASE_SCORING_MIRROR_URL", "SUPABASE_SCORING_MIRROR_SECRET_KEY", "SUPABASE_SCORING_MIRROR_ENABLED",
  "NEXT_PUBLIC_SUPABASE_AUTH_URL", "NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY", "HOME_READ_SOURCE",
  "TOURNAMENT_READ_SOURCE", "LEADERBOARDS_CORE_READ_SOURCE", "GUIDE_READ_SOURCE",
  "COURSE_PRESENTATION_READ_SOURCE", "SCORING_READ_SOURCE", "MATCH_AUTHORIZATION_SOURCE", "SCORING_AUTHORITY",
  "MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE", "PARTICIPANT_AUTH_CAPTCHA_REQUIRED",
  "PARTICIPANT_AUTH_CAPTCHA_CONFIGURED", "NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY",
  "PARTICIPANT_AUTH_RATE_LIMIT_SECRET", "MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET",
  "MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED", "MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED",
];
const preview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: previewWorkbookId,
  PREVIEW_SCORING_SHEET_ID: previewWorkbookId,
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: previewSupabaseUrl,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-server-secret",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: previewSupabaseUrl,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "synthetic-publishable",
  HOME_READ_SOURCE: "supabase",
  TOURNAMENT_READ_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  SCORING_AUTHORITY: "supabase",
  MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE: "supabase-turnstile",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "synthetic-preview-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "synthetic-preview-rate-limit-secret-at-least-32-chars",
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "synthetic-preview-certification-secret-at-least-32-chars",
  MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
  MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true",
};

async function withEnvironment(values, run) {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => { process.env[key] = value; });
  try {
    return await run();
  } finally {
    environmentKeys.forEach((key) => {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
}

function certifiedHeaders(extra = {}) {
  const { token } = issueMobileNativeCertification({
    authUserId,
    playerId: "P1",
    tournamentId: "2026",
    env: preview,
  });
  return { Authorization: "Bearer valid", "X-Bagger-Certification": token, ...extra };
}

function participantContext() {
  return {
    ok: true,
    data: {
      authUserId,
      playerId: "P1",
      displayName: "Preview Golfer",
      tournament: { id: "2026", year: 2026, name: "Bagger Invitational" },
      membership: { active: true },
    },
  };
}

function installFetch({ participant = participantContext(), guide = { ok: false, code: "GUIDE_PROJECTION_NOT_PUBLISHED" } } = {}) {
  const original = globalThis.fetch;
  const guideBodies = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: authUserId });
    if (url.includes("/rest/v1/rpc/read_participant_identity_context_for_auth")) return Response.json(participant);
    if (url.includes("/rest/v1/rpc/read_current_guide_projection")) {
      guideBodies.push(JSON.parse(init.body));
      return Response.json(guide);
    }
    throw new Error(`Unexpected synthetic request: ${url}`);
  };
  return { guideBodies, restore: () => { globalThis.fetch = original; } };
}

test("Guide route is participant-bound, ignores client authority, and performs representation 304", async () => {
  await withEnvironment(preview, async () => {
    const transport = installFetch();
    try {
      const requestUrl = "https://native-preview.example/api/mobile/v1/guide?playerId=ATTACKER&tournamentId=OTHER";
      const first = await guideGET(new Request(requestUrl, { headers: certifiedHeaders() }));
      assert.equal(first.status, 200);
      assert.equal(first.headers.get("cache-control"), "private, no-cache");
      assert.equal(first.headers.get("vary"), "Authorization, X-Bagger-Certification");
      const etag = first.headers.get("etag");
      assert.match(etag, /^"[0-9a-f]{64}"$/);
      const body = await first.json();
      assert.equal(body.data.tournamentId, "2026");
      assert.equal(body.data.publicationState, "UNPUBLISHED");
      assert.deepEqual(transport.guideBodies[0], {
        target_tournament_id: "2026",
        target_source_workbook_id: previewWorkbookId,
      });

      const second = await guideGET(new Request(requestUrl, {
        headers: certifiedHeaders({ "If-None-Match": etag }),
      }));
      assert.equal(second.status, 304);
      assert.equal(second.headers.get("etag"), etag);
      assert.equal(await second.text(), "");
    } finally {
      transport.restore();
    }
  });
});

test("Guide route requires both Bearer and certification before its canonical read", async () => {
  await withEnvironment(preview, async () => {
    const transport = installFetch();
    try {
      const noBearer = await guideGET(new Request("https://native-preview.example/api/mobile/v1/guide", {
        headers: { "X-Bagger-Certification": "certification-only" },
      }));
      assert.equal(noBearer.status, 401);
      assert.equal((await noBearer.json()).error.code, "UNAUTHORIZED");

      const bearerOnly = await guideGET(new Request("https://native-preview.example/api/mobile/v1/guide", {
        headers: { Authorization: "Bearer valid" },
      }));
      assert.equal(bearerOnly.status, 403);
      assert.equal((await bearerOnly.json()).error.code, "AUTH_CERTIFICATION_FAILED");
      assert.equal(transport.guideBodies.length, 0);
    } finally {
      transport.restore();
    }
  });
});

test("Guide route denies unmapped participants without reading Guide content", async () => {
  await withEnvironment(preview, async () => {
    const transport = installFetch({ participant: { ok: false, code: "ACTIVE_USER_PLAYER_LINK_REQUIRED" } });
    try {
      const response = await guideGET(new Request("https://native-preview.example/api/mobile/v1/guide", {
        headers: certifiedHeaders(),
      }));
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, "PARTICIPANT_NOT_FOUND");
      assert.equal(transport.guideBodies.length, 0);
    } finally {
      transport.restore();
    }
  });
});

test("Guide route remains fail-closed in Production before any authority transport", async () => {
  await withEnvironment({ ...preview, VERCEL_ENV: "production" }, async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not call"); };
    try {
      const response = await guideGET(new Request("https://baggerinv.com/api/mobile/v1/guide", {
        headers: { Authorization: "Bearer token" },
      }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "MOBILE_API_UNAVAILABLE");
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = original;
    }
  });
});
