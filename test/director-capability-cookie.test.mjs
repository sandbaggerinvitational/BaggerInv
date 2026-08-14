import assert from "node:assert/strict";
import test from "node:test";

import {
  createPlayerPassportSession,
  PREVIEW_DIRECTOR_PASSPORT_COOKIE,
  previewDirectorPassportCookie,
  tournamentDirectorTokenFromRequest,
} from "../lib/player-passport.js";

const secret = "preview-director-capability-secret";
const leaseId = "22222222-2222-4222-8222-222222222222";

function requestWith(values = {}) {
  return { cookies: { get: (name) => values[name] ? { value: values[name] } : undefined } };
}

function withPreview(action) {
  const previousEnvironment = process.env.VERCEL_ENV;
  const previousSecret = process.env.PLAYER_PASSPORT_SECRET;
  const previousVercel = process.env.VERCEL;
  process.env.VERCEL_ENV = "preview";
  process.env.PLAYER_PASSPORT_SECRET = secret;
  process.env.VERCEL = "1";
  try { return action(); }
  finally {
    if (previousEnvironment == null) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnvironment;
    if (previousSecret == null) delete process.env.PLAYER_PASSPORT_SECRET;
    else process.env.PLAYER_PASSPORT_SECRET = previousSecret;
    if (previousVercel == null) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
}

test("Preview Director Passport is host-only, secure, HTTP-only, lax, and app-wide", () => withPreview(() => {
  const cookie = previewDirectorPassportCookie("signed-director-token", 3600);
  assert.equal(cookie.name, PREVIEW_DIRECTOR_PASSPORT_COOKIE);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/");
  assert.equal(cookie.maxAge, 3600);
  assert.equal(Object.hasOwn(cookie, "domain"), false);
}));

test("ordinary Supabase participant state can coexist with a dedicated Director Passport", () => withPreview(() => {
  const participant = createPlayerPassportSession({
    playerId: "HM01", tournamentId: "2026", deviceId: "participant-device",
  });
  const director = createPlayerPassportSession({
    playerId: "DIR01", tournamentId: "2026", deviceId: "director-device",
  });
  const request = requestWith({
    "sbi-player-passport": participant,
    [PREVIEW_DIRECTOR_PASSPORT_COOKIE]: director,
  });
  assert.equal(tournamentDirectorTokenFromRequest(request), director);
}));

test("an active impersonation pointer takes precedence so lease validation cannot be bypassed", () => withPreview(() => {
  const director = createPlayerPassportSession({
    playerId: "DIR01", tournamentId: "2026", deviceId: "director-device",
  });
  const impersonation = createPlayerPassportSession({
    playerId: "DIR01",
    tournamentId: "2026",
    deviceId: "director-device",
    impersonatedPlayerId: "HM01",
    previewImpersonationLeaseId: leaseId,
    previewDirector: { id: "DIR01", name: "Tournament Director", role: "DIRECTOR" },
    expiresInSeconds: 3600,
  });
  const request = requestWith({
    "sbi-player-passport": impersonation,
    [PREVIEW_DIRECTOR_PASSPORT_COOKIE]: director,
  });
  assert.equal(tournamentDirectorTokenFromRequest(request), impersonation);
}));

test("expired or cleared impersonation pointers fall back to the preserved Director Passport", () => withPreview(() => {
  const director = createPlayerPassportSession({
    playerId: "DIR01", tournamentId: "2026", deviceId: "director-device",
  });
  assert.equal(tournamentDirectorTokenFromRequest(requestWith({
    [PREVIEW_DIRECTOR_PASSPORT_COOKIE]: director,
  })), director);
  assert.equal(tournamentDirectorTokenFromRequest(requestWith({
    "sbi-player-passport": "expired-or-invalid",
    [PREVIEW_DIRECTOR_PASSPORT_COOKIE]: director,
  })), director);
}));
