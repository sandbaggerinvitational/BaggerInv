import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { GET as guideGET } from "../app/api/mobile/v1/guide/route.js";
import { GET as historyGET } from "../app/api/mobile/v1/history/route.js";
import { GET as historyDetailGET } from "../app/api/mobile/v1/history/[year]/route.js";
import { GET as oddsGET } from "../app/api/mobile/v1/odds/route.js";
import { GET as passportGET } from "../app/api/mobile/v1/passport/route.js";
import { GET as recordsGET } from "../app/api/mobile/v1/records/route.js";
import { issueMobileNativeCertification } from "../lib/mobile-native-certification.js";

const authUserId = "11111111-1111-4111-8111-111111111111";
const previewWorkbookId = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const previewSupabaseUrl = "https://idgigvjjqkfbqjeredpb.supabase.co";
const environmentKeys = [
  "VERCEL_ENV",
  "GOOGLE_SHEETS_ID",
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
const preview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: previewWorkbookId,
  PREVIEW_SCORING_SHEET_ID: previewWorkbookId,
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: previewSupabaseUrl,
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-only-test-key",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: previewSupabaseUrl,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "preview-publishable-test-key",
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
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "preview-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "preview-native-rate-limit-secret-at-least-32-chars",
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "preview-native-certification-secret-at-least-32-chars",
  MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
  MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true",
};

const routes = [
  ["passport", passportGET, null],
  ["guide", guideGET, null],
  ["history", historyGET, null],
  ["history/2025", historyDetailGET, { params: Promise.resolve({ year: "2025" }) }],
  ["records", recordsGET, null],
  ["odds", oddsGET, null],
];

async function withEnvironment(values, callback) {
  const prior = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  for (const key of environmentKeys) {
    if (Object.hasOwn(values, key)) process.env[key] = values[key];
    else delete process.env[key];
  }
  try {
    return await callback();
  } finally {
    for (const key of environmentKeys) {
      if (prior[key] == null) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
}

function callRoute(get, request, context) {
  return context ? get(request, context) : get(request);
}

function certification() {
  return issueMobileNativeCertification({
    authUserId,
    playerId: "P1",
    tournamentId: "2026",
    env: preview,
  }).token;
}

test("every participant-content route requires a Bearer token before domain reads", async () => {
  await withEnvironment(preview, async () => {
    for (const [path, get, context] of routes) {
      const response = await callRoute(get, new Request(
        `https://native-preview.example/api/mobile/v1/${path}?playerId=ATTACKER&tournamentId=OTHER`,
      ), context);
      assert.equal(response.status, 401, path);
      assert.equal(response.headers.get("www-authenticate"), "Bearer", path);
      assert.equal((await response.json()).error.code, "UNAUTHORIZED", path);
    }
  });
});

test("a valid raw Bearer token cannot bypass Bagger certification", async () => {
  await withEnvironment(preview, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      assert.match(String(input?.url || input), /\/auth\/v1\/user$/);
      return Response.json({ id: authUserId, aud: "authenticated", role: "authenticated" });
    };
    try {
      for (const [path, get, context] of routes) {
        const response = await callRoute(get, new Request(
          `https://native-preview.example/api/mobile/v1/${path}`,
          { headers: { Authorization: "Bearer valid-token" } },
        ), context);
        assert.equal(response.status, 403, path);
        assert.equal((await response.json()).error.code, "AUTH_CERTIFICATION_FAILED", path);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("an authenticated but unmapped participant is denied before any content reader", async () => {
  await withEnvironment(preview, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => String(input?.url || input).endsWith("/auth/v1/user")
      ? Response.json({ id: authUserId, aud: "authenticated", role: "authenticated" })
      : Response.json({ ok: false, code: "ACTIVE_USER_PLAYER_LINK_REQUIRED" });
    try {
      for (const [path, get, context] of routes) {
        const response = await callRoute(get, new Request(
          `https://native-preview.example/api/mobile/v1/${path}`,
          {
            headers: {
              Authorization: "Bearer valid-token",
              "X-Bagger-Certification": certification(),
            },
          },
        ), context);
        assert.equal(response.status, 403, path);
        assert.equal((await response.json()).error.code, "PARTICIPANT_NOT_FOUND", path);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("Production remains unavailable before authentication or content access", async () => {
  await withEnvironment({ ...preview, VERCEL_ENV: "production" }, async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("Production must fail before transport");
    };
    try {
      for (const [path, get, context] of routes) {
        const response = await callRoute(get, new Request(
          `https://baggerinv.example/api/mobile/v1/${path}`,
          { headers: { Authorization: "Bearer token" } },
        ), context);
        assert.equal(response.status, 503, path);
        assert.equal((await response.json()).error.code, "MOBILE_API_UNAVAILABLE", path);
      }
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("routes accept no client-selected Player, tournament, publication, or authority", async () => {
  for (const [path] of routes) {
    const routePath = path === "history/2025"
      ? "app/api/mobile/v1/history/[year]/route.js"
      : `app/api/mobile/v1/${path}/route.js`;
    const source = await readFile(new URL(`../${routePath}`, import.meta.url), "utf8");
    assert.match(source, /mobileV1ReadResponse/, path);
    assert.doesNotMatch(source, /searchParams|request\.json|playerId|tournamentId|publication|authority/i, path);
  }
});

test("participant-content schemas and documentation publish one coherent mobile-v1 family", async () => {
  const schemas = ["passport", "guide", "history", "history-detail", "records", "odds"];
  for (const name of schemas) {
    const schema = JSON.parse(await readFile(
      new URL(`../contracts/mobile/v1/${name}.schema.json`, import.meta.url),
      "utf8",
    ));
    assert.match(schema.$schema, /2020-12/, name);
    assert.equal(schema.additionalProperties, false, name);
    assert.deepEqual(schema.required, ["ok", "apiVersion", "data", "meta"], name);
  }

  const docs = await readFile(
    new URL("../contracts/mobile/v1/README.md", import.meta.url),
    "utf8",
  );
  for (const term of [
    "GET /passport",
    "GET /guide",
    "GET /history",
    "GET /history/[year]",
    "GET /records",
    "GET /odds",
    "private, no-cache",
    "X-Bagger-Certification",
    "PUBLISHED` to `UNPUBLISHED",
    "Native must not detect records",
    "The mobile adapter does not calculate probability",
  ]) {
    assert.ok(docs.includes(term), term);
  }
  assert.ok(docs.includes("Schedule is deliberately excluded"));
  assert.ok(docs.includes("Production mobile remains disabled"));
});
