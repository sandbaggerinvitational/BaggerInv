import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { requireMobileProductionReadContext } from "../lib/mobile-v1-production-read-context.js";

const base = "6d0b2ad5cab61f50e6d2a269bb2d02e036ccae05";
const root = new URL("../", import.meta.url);

test("PN-1 preserves Production authority, dispatch, fencing, scoring and post-commit implementations byte-for-byte", async () => {
  const files = [
    // PN-2 versions native admission; canonical authority remains pinned.
    "mobile-native-development-authority", "mobile-v1-scoring-post-commit", "mobile-v1-calcutta", "mobile-v1-net-skins",
    "participant-identity-supabase", "participant-identity-authority", "participant-identity-resolver",
    "production-current-participant-identity-server", "production-current-tournament-runtime",
    "production-current-read-dispatch", "production-cutover-read-transport", "production-shadow-read-adapters",
    "production-cutover-scoring-ingress", "production-scoring-operations-server",
    "production-foundation-resource-contract", "scoring-participant-authorization",
    "scoring-authority-supabase", "scoring-google-outbox", "scorecard-archive-worker",
    "calcutta-post-commit", "history-2026-adapter",
  ];
  for (const name of files) {
    const path = `lib/${name}.js`;
    const actual = await readFile(new URL(path, root), "utf8");
    const original = execFileSync("git", ["show", `${base}:${path}`], { cwd: root, encoding: "utf8" });
    // Read closure changes only Guide delivery-fingerprint preservation.
    // Continue pinning every other byte of dispatch and authority code.
    const expected = name === 'production-shadow-read-adapters'
      ? original.replace('delivery_fingerprint: clean(data.payload_fingerprint),',
        'delivery_fingerprint: clean(data.delivery_fingerprint || data.payload_fingerprint),')
      : original;
    assert.equal(actual, expected, path);
  }
  for (const path of ["app/api/mobile/v1/scoring/hole/route.js", "app/api/mobile/v1/scoring/finalize/route.js"]) {
    assert.equal(await readFile(new URL(path, root), "utf8"),
      execFileSync("git", ["show", `${base}:${path}`], { cwd: root, encoding: "utf8" }), path);
  }
});

test("every compiled mobile route denies Production before Auth, database, provider or worker transport", async () => {
  const before = { ...process.env };
  const fetch = globalThis.fetch;
  let transports = 0, routes = 0;
  globalThis.fetch = async () => { transports++; throw new Error("PN-1 forbids network"); };
  Object.assign(process.env, {
    VERCEL_ENV: "production", PARTICIPANT_IDENTITY_AUTHORITY: "supabase", SCORING_AUTHORITY: "supabase",
    PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true", PRODUCTION_CUTOVER_PHASE: "SCORING_COMMIT",
    PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true", PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "true",
    PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "true", PRODUCTION_SUPABASE_WORKERS_ENABLED: "true",
    SUPABASE_SCORING_MIRROR_URL: "https://ymqhhtxaywtqllynrmxe.supabase.co",
    NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  });
  try {
    const directory = new URL("app/api/mobile/v1/", root);
    for (const file of (await readdir(directory, { recursive: true })).filter((p) => p.endsWith("route.js"))) {
      const module = await import(new URL(file, directory));
      for (const method of ["GET", "POST"]) {
        if (typeof module[method] !== "function") continue;
        const path = file.replace("/route.js", "").replace("[matchId]", "M1").replace("[year]", "2026");
        const request = new Request(`https://baggerinv.com/api/mobile/v1/${path}?playerId=OTHER&tournamentId=2099&authUserId=OTHER`, {
          method, headers: { Authorization: "Bearer synthetic", "X-Bagger-Certification": "synthetic",
            "Content-Type": "application/json" },
          ...(method === "POST" ? { body: JSON.stringify({ playerId: "OTHER", tournamentId: "2099",
            authUserId: "OTHER", authorityGeneration: "OTHER", matchId: "M1" }) } : {}),
        });
        const response = await module[method](request, { params: Promise.resolve({ year: "2026", matchId: "M1" }) });
        assert.equal(response.status, 503, `${method} ${path}`);
        if (response.headers.get("content-type")?.includes("application/json")) {
          const body = await response.json();
          if (path === "health") {
            assert.equal(body.compatibility, "AUTHORITY_INCOMPATIBLE");
            assert.ok(Object.values(body.capabilities).every((v) => v === false));
          } else assert.equal(body.error.code, "MOBILE_API_UNAVAILABLE", path);
        }
        routes++;
      }
    }
    assert.ok(routes >= 21);
    assert.equal(transports, 0);
  } finally {
    globalThis.fetch = fetch;
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});

test("Production DTO prerequisite rejects cross-player, Auth UUID, membership and current-pointer mismatch", async () => {
  const identity = { authUserId: "AUTH", playerId: "P1", tournamentId: "2026",
    context: { authUserId: "AUTH", playerId: "P1", tournament: { id: "2026" }, membership: { active: true } } };
  const options = { env: { VERCEL_ENV: "production" }, dependencies: {
    readCurrentTournamentRuntime: async () => ({ tournamentId: "2026", lifecycle: "ACTIVE" }),
  } };
  assert.equal((await requireMobileProductionReadContext(identity, options)).tournamentId, "2026");
  for (const changed of [
    { ...identity, playerId: "P2" }, { ...identity, authUserId: "OTHER" },
    { ...identity, tournamentId: "2027" }, { ...identity, context: { ...identity.context, membership: { active: false } } },
  ]) await assert.rejects(() => requireMobileProductionReadContext(changed, options), { code: "PARTICIPANT_NOT_FOUND" });
  for (const runtime of [{ tournamentId: "2027", lifecycle: "ACTIVE" }, { tournamentId: "2026", lifecycle: "SUSPENDED" }]) {
    await assert.rejects(() => requireMobileProductionReadContext(identity, { ...options,
      dependencies: { readCurrentTournamentRuntime: async () => runtime } }), { code: "MOBILE_API_UNAVAILABLE" });
  }
});

test("the committed client has no standalone Players or expanded Leaders transport requirement", () => {
  const read = (file) => execFileSync("git", ["show", `d91d13e05e4143c98ccf2c1f3bcbf21b5d1cdec4:ios/BaggerInv/${file}`],
    { cwd: root, encoding: "utf8" });
  const client = read("Networking/MobileAPIClient.swift");
  assert.doesNotMatch(client, /\/api\/mobile\/v1\/players|\/player-round-performance|\/competition/);
  const models = read("Models/MobileReadModels.swift");
  assert.doesNotMatch(models, /let playerIntelligence|let playerRoundPerformance|let r[123].*Competition/);
  for (const path of ["passport", "guide", "history", "records", "odds", "matches", "leaders", "net-skins", "calcutta"])
    assert.ok(client.includes(`/api/mobile/v1/${path}`));
});
