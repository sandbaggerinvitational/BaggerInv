import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tournamentLiveDataFromSupabaseView } from "../lib/tournament-live-supabase.js";
import { mobileMatchesResult } from "../lib/mobile-v1-tournament-reads.js";
import { mobileNativeHealthResult } from "../lib/mobile-native-admission.js";
import { rawFixture } from "./fixtures/pn1-mobile.mjs";
import { environment, authorityFixtures, request } from "./fixtures/pn2-native.mjs";

const root = new URL("../", import.meta.url);
const production = "6d0b2ad5cab61f50e6d2a269bb2d02e036ccae05";
const shared = "bffd4a621c2d8bca88153c7bb6c6f2206ce8e62d";
const pn2 = "614c0fbe4fb336fb8f5be8d9c9d92c4600d511d9";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

async function historicalProjection(revision) {
  // Compare stored source in memory; imports resolve to preserved dependencies.
  const source = git("show", `${revision}:lib/tournament-live-supabase.js`)
    .replace(/from "(\.\/[^\"]+)"/g, (_, path) => `from "${new URL(path, new URL("lib/", root))}"`);
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`))
    .tournamentLiveDataFromSupabaseView;
}

function view(format = "BB", status = "LIVE", withNulls = true) {
  const entries = [" match-z ", "match-a"].map((matchId, index) => {
    const entry = rawFixture({ format, status, matchId });
    entry.presentation.display_match_number = String(2 - index);
    return entry;
  });
  const display = Object.fromEntries(entries.flatMap((entry) => [entry.match.match_id, entry.match.match_id.trim()]
    .map((id) => [id, withNulls ? {
      team1Players: [{ id: "P1", playingHcp: null, stroke: null }],
      team1Stroke: null, team2Stroke: null,
    } : {}])));
  return { tournament: entries[0].tournament, teams: [{ team_id: "T1", team_side: 1, name: "One" },
    { team_id: "T2", team_side: 2, name: "Two" }], rounds: [entries[0].round], matches: entries,
    tournament_presentation: { presentation: { tournamentMatchDisplay: display,
      tournament: { configuredStatus: "Live", currentRound: 1, timeZone: "America/Chicago" } } } };
}

test("PN-4 preserves all newer Production files and every non-mobile baseline implementation", async () => {
  assert.equal(git("merge-base", production, "HEAD").trim(), production);
  const newer = git("diff", "--name-only", shared, production).trim().split("\n");
  const imports = new Set(git("diff", "--name-only", shared, pn2).trim().split("\n"));
  assert.equal(newer.filter((path) => imports.has(path)).length, 0);
  for (const path of git("ls-tree", "-r", "--name-only", production).trim().split("\n")) {
    if (imports.has(path)) continue;
    assert.equal(await readFile(new URL(path, root), "utf8"), git("show", `${production}:${path}`), path);
  }
});

test("PN-4 shared web/PWA projection retains exact Production ordering, identity and explicit null semantics", async () => {
  const original = await historicalProjection(production);
  for (const format of ["BB", "SC", "SI"]) for (const status of ["SCHEDULED", "LIVE", "FINAL"])
    for (const withNulls of [true, false]) {
      const input = view(format, status, withNulls);
      assert.deepEqual(tournamentLiveDataFromSupabaseView(input), original(input), `${format}/${status}/${withNulls}`);
    }
});

test("PN-4 mobile projection retains PN-1 exact opaque IDs, aggregate ordering and canonical numeric fallback", async () => {
  const prior = await historicalProjection(pn2);
  for (const format of ["BB", "SC", "SI"]) for (const status of ["SCHEDULED", "LIVE", "FINAL"])
    for (const withNulls of [true, false]) {
      const input = view(format, status, withNulls);
      assert.deepEqual(tournamentLiveDataFromSupabaseView(input, { mobileContract: true }), prior(input));
    }
});

test("PN-4 Matches explicitly opts into the mobile contract at the shared projection boundary", async () => {
  let invoked = false;
  const dependencies = {
    requireTournamentReadSource: () => ({ resolved: "supabase" }),
    readTournamentLiveView: async () => ({ payload: { ok: true, data: {} } }),
    readGuideProjection: async () => ({ payload: { ok: true } }),
    applyGuideCoursesToTournament: (live) => live,
    tournamentLiveDataFromSupabaseView: (_, options) => {
      invoked = true; assert.deepEqual(options, { mobileContract: true });
      return { tournament: { id: "2026" }, rounds: [], revision: "fixture" };
    },
  };
  await mobileMatchesResult({ playerId: "P1", tournamentId: "2026" }, { dependencies });
  assert.equal(invoked, true);
});

test("PN-4 health covers every independent hypothetical gate and invalid resource/authority state", async () => {
  const all = ["reads", "auth", "certification", "scoring"];
  for (const enabled of [[], ...all.map((key) => [key]), all]) {
    const env = environment(enabled), fixtures = authorityFixtures(env);
    const health = await mobileNativeHealthResult(request("health"), { env, dependencies: fixtures.dependencies });
    assert.equal(health.status, 200);
    assert.deepEqual(health.body.capabilities, Object.fromEntries(all.map((key) => [key, enabled.includes(key)])));
  }
  for (const change of ["absent", "absent-native-configuration", "malformed", "wrong-project", "wrong-environment", "unsupported-version",
    "maintenance", "invalid-authority", "stale-deployment", "stale-resource"]) {
    const env = environment(all), fixtures = authorityFixtures(env);
    let req = request("health");
    if (change === "absent") delete env.PRODUCTION_NATIVE_CAPABILITIES;
    if (change === "absent-native-configuration") {
      for (const key of Object.keys(env)) if (/^(PRODUCTION_NATIVE_|MOBILE_NATIVE_|PARTICIPANT_AUTH_|NEXT_PUBLIC_PARTICIPANT_AUTH_)/.test(key))
        delete env[key];
    }
    if (change === "malformed") env.PRODUCTION_NATIVE_CAPABILITIES = "{";
    if (change === "wrong-project") env.NEXT_PUBLIC_SUPABASE_AUTH_URL = "https://invalid.example.test";
    if (change === "wrong-environment") env.VERCEL_ENV = "development";
    if (change === "unsupported-version") req = request("health", { headers: { "x-bagger-mobile-contract": "unknown" } });
    if (change === "maintenance") fixtures.admission.maintenance_state = "SCORING_MAINTENANCE";
    if (change === "invalid-authority") fixtures.read.participant_identity_authority = "PASSPORT";
    if (change === "stale-deployment") fixtures.admission.deployment_id = "dpl_stale_fixture";
    if (change === "stale-resource") fixtures.read.project_ref = "wrong-project";
    const health = await mobileNativeHealthResult(req, { env, dependencies: fixtures.dependencies });
    if (["absent", "absent-native-configuration", "malformed", "maintenance"].includes(change)) assert.equal(health.status, 200, change);
    else assert.equal(health.status, 503, change);
    if (change === "maintenance") {
      assert.equal(health.body.capabilities.reads, true); assert.equal(health.body.capabilities.scoring, false);
    } else assert.ok(Object.values(health.body.capabilities || {}).every((value) => value === false), change);
  }
});
