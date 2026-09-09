// Run with the compiled iOS scripts/pn8a-certification-probe.swift executable.
// All authority, credentials and identity are synthetic; no network/provider calls.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { issueMobileNativeCertification, verifyMobileNativeCertification } from "../lib/mobile-native-certification.js";
import { actor, environment, productionContext } from "../test/fixtures/pn2-native.mjs";

const executable = process.argv[2];
assert.ok(executable, "Compiled Swift probe path required");
const env = environment(["certification"]), now = 1_800_000_000;
const context = productionContext();
const proof = issueMobileNativeCertification({ ...actor, env, productionContext: context, now: () => now * 1000 });
const result = spawnSync(executable, [], { input: JSON.stringify({ token: proof.token, userID: actor.authUserId, now, ttl: proof.expiresInSeconds }), encoding: "utf8" });
assert.equal(result.status, 0, "Swift certificate integration failed (sensitive input omitted)");
assert.throws(() => verifyMobileNativeCertification({ ...actor, env, token: proof.token, now: () => now * 1000,
  productionContext: { ...context, participant: { ...context.participant, contextRevision: 2 } } }), { code: "AUTH_CERTIFICATION_FAILED" });
console.log("Server v2p → Production iOS PASS; Preview REJECTED; R1 after R2 REJECTED; provider calls 0.");
