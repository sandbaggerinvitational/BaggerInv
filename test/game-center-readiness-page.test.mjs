import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("isolated Director Game Center readiness page exposes only explicit refresh and parity actions", () => {
  const page = fs.readFileSync(new URL("../app/admin/director/game-center-readiness/page.js", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../app/admin/director/game-center-readiness/GameCenterReadinessClient.js", import.meta.url), "utf8");
  assert.match(page, /authorizePreviewDirector/);
  assert.match(page, /result\.status !== "active"/);
  assert.match(client, /refresh-game-center-presentations/);
  assert.match(client, /game-center-parity/);
  assert.match(client, /identity-shadow-diagnostics/);
  assert.doesNotMatch(client, /getTournamentData|readWorkbookSheetsByName/);
});

test("formal Auth shadow diagnostics are Director/service only and omit sensitive identity fields", () => {
  const route = fs.readFileSync(new URL("../app/api/director/identity-shadow-diagnostics/route.js", import.meta.url), "utf8");
  const migration = fs.readFileSync(new URL("../supabase/migrations/202608120018_preview_identity_shadow_diagnostics.sql", import.meta.url), "utf8");
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /VERCEL_ENV !== "preview"/);
  assert.match(migration, /revoke all on function public\.read_participant_identity_shadow_diagnostics\(text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute .* to service_role/);
  assert.doesNotMatch(migration, /'email'|'authUserId'|'authUserUuid'/);
});

test("signed Preview Director impersonation requires a current lease and Director freshness", () => {
  const resolver = fs.readFileSync(new URL("../lib/player-passport-server.js", import.meta.url), "utf8");
  const directorStart = resolver.indexOf("export async function inspectTournamentDirectorToken");
  const fastPath = resolver.indexOf("if (isPreviewImpersonationSession(session))", directorStart);
  const cachePath = resolver.indexOf("const key = directorTokenKey(token)", directorStart);
  assert.ok(directorStart >= 0 && fastPath > directorStart && cachePath > fastPath);
  assert.match(resolver.slice(fastPath, cachePath), /inspectPreviewImpersonationDirectorSession/);
  assert.match(resolver, /verifyPreviewIdentityImpersonation/);
  assert.match(resolver, /validateDirector\(directorPassportSession\(session\)\)/);
  assert.doesNotMatch(resolver.slice(fastPath, cachePath), /actor: session\.previewDirector/);
});
