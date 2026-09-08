import assert from "node:assert/strict";
import test from "node:test";
import { mobileMatchDetailResult } from "../lib/mobile-v1-match-detail.js";
import { mobileOddsResult } from "../lib/mobile-v1-odds.js";
import { mobileHistoryResult, mobileHistoryDetailResult } from "../lib/mobile-v1-history.js";
import { loadMobileCareerAuthority } from "../lib/mobile-v1-career-authority.js";
import { mobileGuideResult } from "../lib/mobile-v1-guide.js";
import { rawFixture, currentHistory, oddsView } from "./fixtures/pn1-mobile.mjs";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

const env = { VERCEL_ENV: "production" };
const identity = { authUserId: "AUTH", playerId: "P1", tournamentId: "2026",
  context: { authUserId: "AUTH", playerId: "P1", tournament: { id: "2026" }, membership: { active: true } } };
const runtime = { tournamentId: "2026", lifecycle: "ACTIVE", pointerRevision: 1 };
const readCurrentTournamentRuntime = async () => runtime;

function gameCenter(format = "BB") {
  const raw = rawFixture({ format });
  raw.match.tournament_id = "2026";
  raw.participants.forEach((p) => delete p.is_authenticated_player);
  raw.navigation = { position: { index: 2, total: 6 }, previous: { id: "M1" }, next: { id: "M3" } };
  // Internal authority fields must never become part of the mobile DTO.
  raw.permissions = [{ player_id: "P1", secret: "PRIVATE_PERMISSION" }];
  return raw;
}

const authorize = async (input) => ({ payload: { allowed: true, player_id: input.playerId,
  tournament_id: input.tournamentId, match_id: input.matchId, action: input.action } });

test("Production Match Detail adapts canonical BB/SC/SI views after existing match authorization", async () => {
  for (const format of ["BB", "SC", "SI"]) {
    const raw = gameCenter(format);
    let reads = 0, authorized = false;
    const result = await mobileMatchDetailResult(identity, raw.match.match_id, { env, dependencies: {
      readCurrentTournamentRuntime,
      authorizeMatchAccess: async (scope) => { assert.deepEqual(scope, {
        tournamentId: "2026", playerId: "P1", matchId: raw.match.match_id, action: "VIEW_GAME_CENTER",
      }); authorized = true; return authorize(scope); },
      readGameCenterView: async (id, options) => { assert.ok(authorized); assert.equal(id, raw.match.match_id);
        assert.equal(options.tournamentId, "2026"); reads++; return { payload: { ok: true, data: raw } }; },
      readMobilePreviewMatchDetailV1: async () => assert.fail("Preview RPC forbidden"),
    } });
    assert.equal(reads, 1);
    await assertMobileV1Schema("match-detail", result.body);
    assert.equal(result.body.data.match.authenticatedPlayer.involved, true);
    assert.equal(result.body.data.match.navigation.myMatchId, raw.match.match_id);
    assert.ok(!JSON.stringify(result.body).includes("PRIVATE_PERMISSION"));
  }
});

test("Production Match Detail denies cross-player, cross-tournament and denied visibility before reading", async () => {
  for (const override of [{ allowed: false }, { player_id: "P2" }, { tournament_id: "2027" },
    { match_id: "OTHER" }, { action: "START_SCORING" }]) {
    await assert.rejects(() => mobileMatchDetailResult(identity, "M1", { env, dependencies: {
      readCurrentTournamentRuntime,
      authorizeMatchAccess: async (scope) => ({ payload: { ...(await authorize(scope)).payload, ...override } }),
      readGameCenterView: async () => assert.fail("must deny before read"),
    } }), { code: "PARTICIPANT_NOT_FOUND" });
  }
});

test("Production Match Detail rejects stale pointer and mismatched canonical payload without falling back", async () => {
  for (const mutate of [
    (raw) => { raw.match.tournament_id = "2027"; },
    (raw) => { raw.tournament.tournament_id = "2027"; },
    (raw) => { raw.match.match_id = "OTHER"; },
    (raw) => { raw.participants = raw.participants.filter((p) => p.player_id !== "P1"); },
  ]) {
    const raw = gameCenter(); const id = raw.match.match_id; mutate(raw);
    await assert.rejects(() => mobileMatchDetailResult(identity, id, { env, dependencies: {
      readCurrentTournamentRuntime, authorizeMatchAccess: authorize,
      readGameCenterView: async () => ({ payload: { ok: true, data: raw } }),
    } }), { code: "MOBILE_API_UNAVAILABLE" });
  }
  const raw = gameCenter(); let checks = 0;
  await assert.rejects(() => mobileMatchDetailResult(identity, raw.match.match_id, { env, dependencies: {
    readCurrentTournamentRuntime: async () => ++checks === 1 ? runtime : { ...runtime, tournamentId: "2027" },
    authorizeMatchAccess: authorize, readGameCenterView: async () => ({ payload: { ok: true, data: raw } }),
  } }), { code: "MOBILE_API_UNAVAILABLE" });
});

test("Production Match Detail rejects same-tournament generation changes and contains transport failures", async () => {
  const raw = gameCenter();
  for (const key of ["pointerRevision", "runtimeGenerationId", "authorityGenerationId", "admissionGenerationId"]) {
    let reads = 0;
    await assert.rejects(() => mobileMatchDetailResult(identity, raw.match.match_id, { env, dependencies: {
      readCurrentTournamentRuntime: async () => ++reads === 1 ? runtime : { ...runtime, [key]: "changed" },
      authorizeMatchAccess: authorize, readGameCenterView: async () => ({ payload: { ok: true, data: raw } }),
    } }), { code: "MOBILE_API_UNAVAILABLE" });
  }
  for (const failed of ["authorizeMatchAccess", "readGameCenterView"]) {
    await assert.rejects(() => mobileMatchDetailResult(identity, raw.match.match_id, { env, dependencies: {
      readCurrentTournamentRuntime, authorizeMatchAccess: authorize,
      readGameCenterView: async () => ({ payload: { ok: true, data: raw } }),
      [failed]: async () => { throw new Error("private provider diagnostic"); },
    } }), { code: "MOBILE_API_UNAVAILABLE" });
  }
});

function productionOdds(state = "PUBLISHED", legacy = false) {
  const value = oddsView();
  return { tournament: { tournament_id: "2026" }, publication: {
    authority: "SUPABASE", google_publication_fallback: false, state,
    publication_pointer_revision: state === "PUBLISHED" ? 8 : 9,
    publication_revision: 4, current_publication_revision: state === "PUBLISHED" ? 4 : null,
    snapshot_id: state === "PUBLISHED" ? "SNAPSHOT" : null, published_at: value.publication.published_at,
    ...(legacy ? { adoption_kind: "LEGACY_GOOGLE_ADOPTED" } : {}),
  }, snapshots: value.snapshots.map((row) => ({ ...row,
    ...(legacy ? { publication_revision: 4, publication_state_revision: null,
      authority_contract_version: "legacy-google-published-odds-v1" } : { publication_state_revision: 4 }),
    publication_lifecycle: state === "WITHDRAWN" ? "WITHDRAWN" : "PUBLISHED",
    is_current_official: state === "PUBLISHED",
  })) };
}

async function readOdds(value) {
  return mobileOddsResult(identity, { env, dependencies: { readCurrentTournamentRuntime,
    readPublishedOddsView: async (scope) => { assert.deepEqual(scope, { tournamentId: "2026" });
      return { payload: { ok: true, data: value } }; },
    readMobilePreviewParticipantContent: async () => assert.fail("Preview bundle forbidden"),
  } });
}

test("Production Odds preserves modern/legacy canonical publication and explicit withdrawal", async () => {
  for (const legacy of [false, true]) {
    const published = await readOdds(productionOdds("PUBLISHED", legacy));
    await assertMobileV1Schema("odds", published.body);
    assert.equal(published.body.data.publication.state, "PUBLISHED");
    const withdrawn = await readOdds(productionOdds("WITHDRAWN", legacy));
    await assertMobileV1Schema("odds", withdrawn.body);
    assert.equal(withdrawn.body.data.publication.state, "UNPUBLISHED");
    assert.deepEqual(withdrawn.body.data.snapshots, []);
    assert.notEqual(published.revision, withdrawn.revision);
  }
});

test("Production Odds rejects stale, competing authority, publication mismatch and wrong tournament", async () => {
  for (const mutate of [
    (v) => { v.publication.stale = true; }, (v) => { v.publication.authority = "GOOGLE"; },
    (v) => { v.publication.google_publication_fallback = true; },
    (v) => { v.tournament.tournament_id = "2027"; },
    (v) => { v.publication.current_publication_revision = 5; },
    (v) => { v.snapshots[0].publication_verified = false; },
    (v) => { v.publication.state = "UNKNOWN"; },
  ]) { const value = productionOdds(); mutate(value);
    await assert.rejects(() => readOdds(value), { code: "MOBILE_API_UNAVAILABLE" }); }
});

test("Production History reuses completed/current services and binds the committed 2026 domain", async () => {
  const views = Array.from({ length: 9 }, (_, index) => {
    const view = currentHistory(); view.year = 2017 + index;
    view.tournament = { ...view.tournament, id: String(view.year), lifecycle: "FINAL", complete: true };
    return view;
  });
  const dependencies = { readCurrentTournamentRuntime,
    loadCompletedHistoryYears: async () => ({ source: "supabase", views }),
    loadHistory2026View: async () => currentHistory(),
    readMobilePreviewParticipantContent: async () => assert.fail("Preview bundle forbidden"),
  };
  const result = await mobileHistoryResult(identity, { env, dependencies });
  await assertMobileV1Schema("history", result.body);
  assert.deepEqual(result.body.data.tournaments.map((v) => v.year), [2026,2025,2024,2023,2022,2021,2020,2019,2018,2017]);
  const detail = await mobileHistoryDetailResult(identity, "2026", { env, dependencies });
  await assertMobileV1Schema("history-detail", detail.body);
  await assert.rejects(() => mobileHistoryResult(identity, { env, dependencies: { ...dependencies,
    loadCompletedHistoryYears: async () => ({ source: "supabase", views: views.slice(1) }),
  } }), { code: "MOBILE_API_UNAVAILABLE" });
  await assert.rejects(() => mobileHistoryResult(identity, { env, dependencies: { ...dependencies,
    readCurrentTournamentRuntime: async () => ({ ...runtime, tournamentId: "2027" }),
  } }), { code: "MOBILE_API_UNAVAILABLE" });
});

test("Production career uses the existing canonical model and propagates unavailability", async () => {
  const model = { source: "supabase", calculations: {}, scorecardAnalytics: { canonicalCareerScorecards: [] } };
  const dependencies = { readCurrentTournamentRuntime, loadSecondaryHistoryModel: async () => model,
    readMobilePreviewParticipantContent: async () => assert.fail("Preview bundle forbidden") };
  assert.equal(await loadMobileCareerAuthority(identity, { env, dependencies }), model);
  await assert.rejects(() => loadMobileCareerAuthority(identity, { env, dependencies: { ...dependencies,
    loadSecondaryHistoryModel: async () => { throw new Error("unavailable"); },
  } }), { code: "MOBILE_API_UNAVAILABLE" });
});

test("Production Guide retains explicit unpublished state and does not hide read failures", async () => {
  const value = await mobileGuideResult(identity, { env, dependencies: {
    readGuideProjection: async ({ tournamentId }) => { assert.equal(tournamentId, "2026");
      return { payload: { ok: false, code: "GUIDE_PROJECTION_NOT_PUBLISHED" } }; },
  } });
  await assertMobileV1Schema("guide", value.body);
  assert.equal(value.body.data.publicationState, "UNPUBLISHED");
  await assert.rejects(() => mobileGuideResult(identity, { env, dependencies: {
    readGuideProjection: async () => { throw new Error("offline"); },
  } }), { code: "MOBILE_API_UNAVAILABLE" });
});
