import assert from "node:assert/strict";
import test from "node:test";

import { MobileApiError } from "../lib/mobile-api-v1.js";
import {
  MOBILE_NATIVE_CERTIFICATION_HEADER,
  MOBILE_NATIVE_CERTIFICATION_SECONDS,
  issueMobileNativeCertification,
  mobileNativeCertificationFromRequest,
  verifyMobileNativeCertification,
} from "../lib/mobile-native-certification.js";

const env = {
  MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "preview-native-certification-secret-at-least-32-chars",
};
const identity = {
  authUserId: "11111111-1111-4111-8111-111111111111",
  playerId: "CB01",
  tournamentId: "2026",
};
const issuedAtMs = Date.UTC(2026, 7, 28, 15, 0, 0);

function issue(overrides = {}) {
  return issueMobileNativeCertification({
    ...identity,
    env,
    now: () => issuedAtMs,
    nonce: () => "abcdefghijklmnopqrstuv",
    ...overrides,
  });
}

test("native certification proof is opaque, bounded, and verifies only for the exact canonical identity", () => {
  const certification = issue();
  assert.equal(certification.expiresInSeconds, MOBILE_NATIVE_CERTIFICATION_SECONDS);
  assert.match(certification.token, /^v1\.[0-9]{10}\.[0-9]{10}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  for (const privateValue of Object.values(identity)) {
    assert.equal(certification.token.includes(privateValue), false);
  }
  assert.deepEqual(verifyMobileNativeCertification({
    token: certification.token,
    ...identity,
    env,
    now: () => issuedAtMs + 1_000,
  }), {
    issuedAt: Math.floor(issuedAtMs / 1_000),
    expiresAt: Math.floor(issuedAtMs / 1_000) + MOBILE_NATIVE_CERTIFICATION_SECONDS,
  });
});

test("missing, malformed, tampered, expired, and wrong-identity certification proofs fail closed", () => {
  const certification = issue();
  const failures = [
    {},
    { token: "not-a-proof", ...identity },
    { token: `${certification.token.slice(0, -1)}A`, ...identity },
    { token: certification.token, ...identity, authUserId: "22222222-2222-4222-8222-222222222222" },
    { token: certification.token, ...identity, playerId: "ATTACKER" },
    { token: certification.token, ...identity, tournamentId: "OTHER" },
    { token: certification.token, ...identity, now: () => issuedAtMs + (MOBILE_NATIVE_CERTIFICATION_SECONDS + 1) * 1_000 },
  ];
  for (const candidate of failures) {
    assert.throws(
      () => verifyMobileNativeCertification({ env, now: () => issuedAtMs + 1_000, ...candidate }),
      (error) => error instanceof MobileApiError && error.code === "AUTH_CERTIFICATION_FAILED",
    );
  }
});

test("certification header parsing rejects duplicates, oversize input, and other header names", () => {
  const token = issue().token;
  assert.equal(mobileNativeCertificationFromRequest(new Request("https://preview.example", {
    headers: { [MOBILE_NATIVE_CERTIFICATION_HEADER]: token },
  })), token);
  for (const headers of [
    {},
    { "x-bagger-mobile-certification": token },
    { [MOBILE_NATIVE_CERTIFICATION_HEADER]: `${token}, ${token}` },
    { [MOBILE_NATIVE_CERTIFICATION_HEADER]: "x".repeat(300) },
  ]) {
    assert.throws(
      () => mobileNativeCertificationFromRequest(new Request("https://preview.example", { headers })),
      (error) => error instanceof MobileApiError && error.code === "AUTH_CERTIFICATION_FAILED",
    );
  }
});

test("certification signing is unavailable without a dedicated server-only key", () => {
  assert.throws(
    () => issue({ env: {} }),
    (error) => error instanceof MobileApiError && error.code === "MOBILE_API_UNAVAILABLE",
  );
});
