import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { NextURL } from "next/dist/server/web/next-url.js";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher.js";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex.js";

import { GET as matchDetailGET } from "../app/api/mobile/v1/matches/[matchId]/route.js";
import { mobileMatchIDFromRequestPath } from "../lib/mobile-match-id-path.js";
import { issueMobileNativeCertification } from "../lib/mobile-native-certification.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

const routeMatcher = getRouteMatcher(getRouteRegex("/api/mobile/v1/matches/[matchId]"));
const origin = "https://native-preview.example";
const detailPrefix = "/api/mobile/v1/matches/";
const authUserId = "11111111-1111-4111-8111-111111111111";
const preview = Object.freeze({
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts",
  PREVIEW_SCORING_SHEET_ID: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-server-secret",
  SUPABASE_SCORING_MIRROR_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "synthetic-publishable-key",
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
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "synthetic-preview-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "synthetic-preview-rate-limit-secret-at-least-32-chars",
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "synthetic-preview-certification-secret-at-least-32-chars",
  MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
  MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true",
});

async function withPreview(run, values = preview) {
  const previous = Object.fromEntries(Object.keys(preview).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function certifiedHeaders(extra = {}, identity = {}) {
  const { token } = issueMobileNativeCertification({
    authUserId, playerId: "P1", tournamentId: "2026", env: preview, ...identity,
  });
  return { Authorization: "Bearer valid", "X-Bagger-Certification": token, ...extra };
}

function canonicalDetail(matchId, owned = true) {
  return {
    ok: true,
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "Bagger Invitational" },
    round: { round_number: 1, name: "Round 1", format: "SI", status: "UPCOMING" },
    match: {
      match_id: matchId, round_number: 1, format: "SI", status: "UPCOMING",
      scored_holes: 0, current_hole: 0, holes_remaining: 18,
      team_1_holes_won: 0, team_2_holes_won: 0, running_result: "",
      result_winner: "", clinched: false, scorecard_complete: false,
      authority_updated_at: "2026-09-03T13:00:00.000Z", finalized_at: null,
    },
    presentation: {
      course_name: "The Ocean Course", course_logo: "ocean-course-logo", course_yardage: "6793",
      tee_time: "10:10 AM", starting_hole: "1", display_match_number: "2",
      team_1_logo: "pickles-logo", team_1_primary_color: "#00563f", team_1_secondary_color: "#c8a44d",
      team_2_logo: "lipp-logo", team_2_primary_color: "#123456", team_2_secondary_color: "#abcdef",
      tournament_location: "Kiawah Island", tournament_logo: "sandbagger-2026",
      tournament_status: "Live", tournament_time_zone: "America/New_York",
      source_updated_at: "2026-09-03T12:59:00.000Z", updated_at: "2026-09-03T12:59:30.000Z",
    },
    snapshot: {
      format: "SI", course_id: "OCEAN", tee: "Gold", rating: 74.7, slope: 150, par: 72,
      team_configuration: {
        team_1_playing_handicap: null, team_2_playing_handicap: null,
        team_1_strokes: null, team_2_strokes: null,
      },
    },
    teams: [
      { team_id: "PICKLES", team_side: 1, name: "The Pickles" },
      { team_id: "LIPP", team_side: 2, name: "Lipp it and Rip it" },
    ],
    participants: [
      { player_id: owned ? "P1" : "P11", display_name: "First Golfer", team_side: 1, player_slot: 1,
        playing_handicap: 17, final_strokes: 4, is_authenticated_player: owned },
      { player_id: "P21", display_name: "Second Golfer", team_side: 2, player_slot: 1,
        playing_handicap: 13, final_strokes: 0, is_authenticated_player: false },
    ],
    holes: Array.from({ length: 18 }, (_, index) => ({
      hole_number: index + 1, stroke_index: index + 1, par: 4, yardage: 350,
    })),
    scores: [],
    navigation: {
      round_match_index: 2, round_match_count: 6,
      previous_match_id: " previous /#😀 ", next_match_id: "_NEXTSEP_next%2F",
      my_match_id: owned ? matchId : "other owned match", is_my_match: owned,
    },
  };
}

function installFetch({ matchId = "normal", owned = true, participantAllowed = true } = {}) {
  const original = globalThis.fetch;
  const detailInputs = [];
  let authCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (url.includes("/auth/v1/user")) {
      authCalls += 1;
      return Response.json({ id: authUserId });
    }
    if (url.includes("/rest/v1/rpc/read_participant_identity_context_for_auth")) {
      return Response.json(participantAllowed ? { ok: true, data: {
        authUserId, playerId: "P1", displayName: "First Golfer",
        tournament: { id: "2026", year: 2026, name: "Bagger Invitational" }, membership: { active: true },
      } } : { ok: false, code: "TOURNAMENT_MEMBERSHIP_INACTIVE" });
    }
    if (url.includes("/rest/v1/rpc/read_preview_mobile_match_detail_v1")) {
      const body = JSON.parse(init.body);
      detailInputs.push(body.input);
      return Response.json(body.input.match_id === matchId
        ? canonicalDetail(matchId, owned)
        : { ok: false, code: "MATCH_DETAIL_NOT_FOUND" });
    }
    throw new Error("Unexpected synthetic authority transport");
  };
  return { detailInputs, authCalls: () => authCalls, restore: () => { globalThis.fetch = original; } };
}

function nextRequest(matchId, headers = certifiedHeaders()) {
  const nextURL = new NextURL(`${origin}${detailPrefix}${encodeURIComponent(matchId)}`);
  const request = new NextRequest(nextURL, { headers });
  const params = routeMatcher(request.nextUrl.pathname);
  assert.ok(params, "The installed Next.js matcher recognizes this single encoded path component");
  return { request, params };
}

const validCases = [
  ["current identifier", "2026-R1-2"],
  ["leading whitespace", " leading"],
  ["trailing whitespace", "trailing "],
  ["internal whitespace", "match with reserved characters"],
  ["whitespace-only identifier", " \t\n "],
  ["slash/hash/colon", "match:round/2#opaque"],
  ["slash-only identifier", "/"],
  ["hash-only identifier", "#"],
  ["colon-only identifier", ":"],
  ["literal encoded-looking text", "%2F%23%25%2E"],
  ["reserved punctuation", " ?&=+%\\;[]@"],
  ["non-BMP Unicode", "match:😀𐐀"],
  ["exactly 200 scalar values and 400 UTF-16 units", "😀".repeat(200)],
  ["200 mixed scalars exceeding 200 UTF-16 units", "a".repeat(100) + "😀".repeat(100)],
  ["NFC text", "caf\u00e9"],
  ["NFD text", "cafe\u0301"],
  ["Next.js parameter prefix", "_NEXTSEP_match:round/2#opaque"],
  ["Next.js parameter prefix alone", "_NEXTSEP_"],
];

for (const [name, matchId] of validCases) {
  test(`installed Next.js route preserves ${name} through authenticated RPC and response`, async () => {
    await withPreview(async () => {
      const transport = installFetch({ matchId });
      try {
        const { request, params } = nextRequest(matchId);
        if (matchId.startsWith("_NEXTSEP_")) {
          assert.notEqual(params.matchId, matchId, "Regression must exercise the real Next.js parameter transformation");
        }
        assert.equal(mobileMatchIDFromRequestPath(request), matchId);
        const response = await matchDetailGET(request, { params: Promise.resolve(params) });
        assert.equal(response.status, 200);
        const body = await response.json();
        await assertMobileV1Schema("match-detail", body);
        assert.equal(body.data.match.matchId, matchId);
        assert.equal(body.data.match.navigation.myMatchId, matchId);
        assert.equal(body.data.match.navigation.previousMatchId, " previous /#😀 ");
        assert.deepEqual(transport.detailInputs, [{
          environment: "PREVIEW", tournament_id: "2026", player_id: "P1", match_id: matchId,
        }]);
      } finally {
        transport.restore();
      }
    });
  });
}

test("opaque Match route revalidates a non-owned Match with a representation-stable ETag/304", async () => {
  await withPreview(async () => {
    const matchId = " _NEXTSEP_/😀#%2F ";
    const transport = installFetch({ matchId, owned: false });
    try {
      const first = nextRequest(matchId);
      const response = await matchDetailGET(first.request, { params: Promise.resolve(first.params) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.match.authenticatedPlayer.involved, false);
      const etag = response.headers.get("etag");
      assert.match(etag, /^"[0-9a-f]{64}"$/);
      const second = nextRequest(matchId, certifiedHeaders({ "If-None-Match": `W/${etag}` }));
      const revalidated = await matchDetailGET(second.request, { params: Promise.resolve(second.params) });
      assert.equal(revalidated.status, 304);
      assert.equal(revalidated.headers.get("etag"), etag);
      assert.equal(await revalidated.text(), "");
      assert.equal(transport.detailInputs.length, 2);
      assert.ok(transport.detailInputs.every((input) => input.match_id === matchId));
    } finally {
      transport.restore();
    }
  });
});

test("invalid, malformed, and multi-component paths fail closed without an RPC read after authentication", async () => {
  await withPreview(async () => {
    const transport = installFetch();
    try {
      const invalidComponents = ["", "%", "%ZZ", "%C0%AF", "%ED%A0%80", "%ED%B0%80", "%00", ".", "..", "%2e", "%2e%2e", encodeURIComponent("😀".repeat(201)), "a/b", "a/"];
      for (const component of invalidComponents) {
        const request = new NextRequest(`${origin}${detailPrefix}${component}`, { headers: certifiedHeaders() });
        const response = await matchDetailGET(request);
        assert.equal(response.status, 404, `Fail closed for ${component.slice(0, 25)}`);
        assert.equal((await response.json()).error.code, "MATCH_NOT_FOUND");
      }
      assert.equal(transport.detailInputs.length, 0);
      assert.equal(transport.authCalls(), invalidComponents.length);
    } finally {
      transport.restore();
    }
  });
});

test("route path validation cannot bypass Bearer, certification, participant or tournament isolation", async () => {
  await withPreview(async () => {
    const transport = installFetch();
    try {
      for (const [headers, status] of [
        [{}, 401],
        [{ Authorization: "Bearer valid" }, 403],
        [{ Authorization: "Bearer valid", "X-Bagger-Certification": "invalid" }, 403],
        [certifiedHeaders({}, { playerId: "OTHER" }), 403],
        [certifiedHeaders({}, { tournamentId: "OTHER" }), 403],
      ]) {
        const request = new NextRequest(`${origin}${detailPrefix}%00`, { headers });
        assert.equal((await matchDetailGET(request)).status, status);
      }
      assert.equal(transport.detailInputs.length, 0);
    } finally {
      transport.restore();
    }
    const denied = installFetch({ participantAllowed: false });
    try {
      const { request, params } = nextRequest("_NEXTSEP_normal");
      assert.equal((await matchDetailGET(request, { params: Promise.resolve(params) })).status, 403);
      assert.equal(denied.detailInputs.length, 0);
    } finally {
      denied.restore();
    }
  });
});

test("opaque route repair preserves Production fail-closed before authentication or database reads", async () => {
  await withPreview(async () => {
    const transport = installFetch();
    try {
      const { request, params } = nextRequest("_NEXTSEP_normal");
      const response = await matchDetailGET(request, { params: Promise.resolve(params) });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "MOBILE_API_UNAVAILABLE");
      assert.equal(transport.authCalls(), 0);
      assert.equal(transport.detailInputs.length, 0);
    } finally {
      transport.restore();
    }
  }, { ...preview, VERCEL_ENV: "production" });
});
