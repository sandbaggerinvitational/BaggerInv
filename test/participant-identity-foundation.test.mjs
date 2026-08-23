import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compareParticipantIdentityContexts,
  isValidParticipantEmail,
  maskParticipantEmail,
  normalizeParticipantEmail,
  participantIdentityFingerprint,
  validateParticipantIdentityConfiguration,
} from "../lib/participant-identity.js";
import { participantIdentityAuthorityEnvironment } from "../lib/participant-identity-authority.js";
import {
  PARTICIPANT_IDENTITY_CONFIGURATION_HEADERS,
  isRecoverableParticipantIdentityConfigurationSheet,
  participantIdentityConfigurationSeedRows,
  participantIdentityConfigurationValuesRequest,
} from "../lib/participant-identity-workbook.js";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const roster = [
  { playerId: "P1", displayName: "Player One", teamId: "T1", participationStatus: "ACTIVE" },
  { playerId: "P2", displayName: "Player Two", teamId: "T2", participationStatus: "ACTIVE" },
];
const row = (playerId, email, extra = {}) => ({
  "Tournament ID": "SBI-2026", "Player ID": playerId, Email: email,
  "Identity Active": true, "Configuration Revision": 1, ...extra,
});
test("participant identity email normalization is deterministic and reports masked values", () => {
  assert.equal(normalizeParticipantEmail("  Player.One@Example.COM "), "player.one@example.com");
  assert.equal(isValidParticipantEmail("player.one@example.com"), true);
  assert.equal(isValidParticipantEmail("player@localhost"), false);
  assert.equal(maskParticipantEmail("player.one@example.com"), "p********@e***.com");
  assert.equal(maskParticipantEmail(""), "Missing");
});

test("a complete explicit roster mapping passes and produces a stable fingerprint", () => {
  const first = validateParticipantIdentityConfiguration({ tournamentId: "SBI-2026", roster, records: [row("P1", "ONE@example.com"), row("P2", "two@example.com")] });
  const second = validateParticipantIdentityConfiguration({ tournamentId: "SBI-2026", roster, records: [row("P2", "two@example.com"), row("P1", "one@example.com")] });
  assert.equal(first.quality.pass, true);
  assert.equal(first.quality.playersWithEmail, 2);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.fingerprint, participantIdentityFingerprint(first.contacts));
});

test("Preview identity initialization uses the Google values.update contract and seeds 24 canonical Player IDs", () => {
  const players = Array.from({ length: 24 }, (_, index) => ({
    playerId: `P${String(index + 1).padStart(2, "0")}`,
    participationStatus: "ACTIVE",
  }));
  const seedRows = participantIdentityConfigurationSeedRows({
    tournamentId: "SBI-2026",
    players,
    updatedBy: "Preview Director",
    updatedAt: "2026-08-11T20:00:00.000Z",
  });
  const request = participantIdentityConfigurationValuesRequest(seedRows);
  const [path, query] = request.path.split("?");
  const body = JSON.parse(request.options.body);
  assert.match(path, /^\/values\//);
  assert.equal(new URLSearchParams(query).get("valueInputOption"), "RAW");
  assert.equal(request.options.method, "PUT");
  assert.equal(body.range, "Participant Identity Configuration!A1:I25");
  assert.equal(body.majorDimension, "ROWS");
  assert.deepEqual(body.values[0], PARTICIPANT_IDENTITY_CONFIGURATION_HEADERS);
  assert.equal(body.values.length, 25);
  assert.deepEqual(body.values[1], ["SBI-2026", "P01", "", "FALSE", 1, "", "", "2026-08-11T20:00:00.000Z", "Preview Director"]);
  assert.deepEqual(body.values.at(-1).slice(0, 5), ["SBI-2026", "P24", "", "FALSE", 1]);
  assert.equal(isRecoverableParticipantIdentityConfigurationSheet({ headers: [], records: [] }), true);
  assert.equal(isRecoverableParticipantIdentityConfigurationSheet({ headers: ["Tournament ID"], records: [] }), false);
});

test("missing, duplicate, malformed, shared, inactive, unknown, and duplicate-player mappings fail closed", () => {
  const duplicate = validateParticipantIdentityConfiguration({ tournamentId: "SBI-2026", roster, records: [row("P1", "same@example.com"), row("P2", "SAME@example.com")] });
  assert.equal(duplicate.quality.pass, false);
  assert.equal(duplicate.quality.duplicateEmail, 1);
  assert.equal(duplicate.quality.sharedEmail, 1);
  const malformed = validateParticipantIdentityConfiguration({ tournamentId: "SBI-2026", roster, records: [row("P1", "not-an-email"), row("P2", "two@example.com")] });
  assert.equal(malformed.quality.malformedEmail, 1);
  const unknown = validateParticipantIdentityConfiguration({ tournamentId: "SBI-2026", roster, records: [row("P1", "one@example.com"), row("PX", "x@example.com")] });
  assert.equal(unknown.quality.missingEmail, 1);
  assert.equal(unknown.quality.unknownPlayerIds, 1);
  assert.equal(unknown.quality.mappingConflicts, 1);
  const inactive = validateParticipantIdentityConfiguration({ tournamentId: "SBI-2026", roster, records: [row("P1", "one@example.com"), row("P2", "two@example.com", { "Identity Active": false })] });
  assert.equal(inactive.quality.inactiveIdentityRecords, 1);
  const playerConflict = validateParticipantIdentityConfiguration({ tournamentId: "SBI-2026", roster, records: [row("P1", "one@example.com"), row("P1", "other@example.com"), row("P2", "two@example.com")] });
  assert.equal(playerConflict.quality.mappingConflicts, 1);
});

test("identity authority defaults to Passport, shadow defaults off, and Production hard-blocks Supabase", () => {
  assert.deepEqual(participantIdentityAuthorityEnvironment({}).resolved, "passport");
  assert.equal(participantIdentityAuthorityEnvironment({}).shadowEnabled, false);
  const preview = {
    VERCEL_ENV: "preview", PARTICIPANT_IDENTITY_AUTHORITY: "supabase", SUPABASE_PARTICIPANT_IDENTITY_SHADOW_ENABLED: "true",
    GOOGLE_SHEETS_ID: "preview", PREVIEW_SCORING_SHEET_ID: "preview",
    NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co", NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "publishable",
    SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  };
  assert.equal(participantIdentityAuthorityEnvironment(preview).resolved, "supabase");
  assert.equal(participantIdentityAuthorityEnvironment(preview).shadowEnabled, true);
  assert.equal(participantIdentityAuthorityEnvironment({ ...preview, VERCEL_ENV: "production" }).resolved, "passport");
  assert.equal(participantIdentityAuthorityEnvironment({ ...preview, VERCEL_ENV: "production" }).productionBlocked, true);
  const ineligiblePreview = participantIdentityAuthorityEnvironment({ ...preview, GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID });
  assert.equal(ineligiblePreview.resolved, "unavailable");
  assert.equal(ineligiblePreview.blocked, true);
});

test("shadow comparison covers stable player, tournament, team, membership, matches, and permissions", () => {
  const context = { playerId: "P1", tournamentId: "SBI-2026", teamId: "T1", membershipActive: true, matchIds: ["M2", "M1"], scoringPermissions: { M1: 2 } };
  assert.deepEqual(compareParticipantIdentityContexts({ passport: context, auth: { ...context, matchIds: ["M1", "M2"] } }), { status: "PASS", diagnostics: {} });
  const mismatch = compareParticipantIdentityContexts({ passport: context, auth: { ...context, playerId: "P2" } });
  assert.equal(mismatch.status, "MISMATCH");
  assert.deepEqual(mismatch.diagnostics.playerId, { passport: "P1", auth: "P2" });
});

test("migration creates service-only RLS tables, uniqueness, and no silent relink path", async () => {
  const migration = await source("supabase/migrations/202608120012_preview_participant_identity_foundation.sql");
  for (const table of ["participant_identity_contacts", "user_player_links", "tournament_roles", "identity_config_import_runs", "identity_context_revisions", "participant_identity_shadow_observations", "identity_audit_events"]) {
    assert.match(migration, new RegExp(`create table participant_identity\\.${table}`));
  }
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on all tables in schema participant_identity from public, anon, authenticated/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
  assert.match(migration, /grant execute on function %s to service_role/);
  assert.match(migration, /participant_identity_active_email_idx/);
  assert.match(migration, /participant_identity_current_player_link_idx/);
  assert.match(migration, /Existing Auth user or Player link requires an explicit audited link-change operation/);
  assert.match(migration, /references auth\.users/);
});

test("Preview identity RPCs resolve and execute the hosted pgcrypto digest signature", async () => {
  const migration = await source("supabase/migrations/202608120013_preview_participant_identity_pgcrypto.sql");
  assert.match(migration, /create extension if not exists pgcrypto with schema extensions/i);
  assert.match(migration, /alter function public\.import_participant_identity_configuration\(jsonb\)[\s\S]*extensions, pg_temp/i);
  assert.match(migration, /alter function public\.admin_link_auth_user_to_player\(jsonb\)[\s\S]*extensions, pg_temp/i);
  assert.match(migration, /extensions\.digest\([\s\S]*::text[\s\S]*'sha256'::text/i);
  assert.match(migration, /a484de7736d931eaed53ab7afebb8e973d8e8691850c1880ba4ec877bedbf2e0/);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
  assert.doesNotMatch(migration, /grant\s+execute[\s\S]+(?:anon|authenticated)/i);
});

test("Director foundation remains Preview-only and the single-user rehearsal is an explicit separate action", async () => {
  const route = await source("app/api/director/participant-identity/route.js");
  const context = await source("app/api/participant/context/route.js");
  const dashboard = await source("app/admin/director/ParticipantIdentityFoundationPanel.js");
  assert.match(route, /VERCEL_ENV !== "preview"/);
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /initialize-source/);
  assert.match(route, /readPreviewParticipantIdentityTournamentId/);
  assert.match(route, /players\.length !== 24/);
  assert.match(route, /refresh/);
  assert.match(route, /approve/);
  assert.match(route, /provision-single-auth/);
  assert.doesNotMatch(route, /signInWithOtp|sendOtp/);
  assert.match(context, /identityAuthority/);
  assert.match(context, /readParticipantIdentityContext/);
  assert.match(dashboard, /No Auth users were created/);
  const files = await Promise.all([source("lib/supabase-auth-browser.js"), source("lib/supabase-auth-server.js")]);
  assert.match(files[0], /createBrowserClient/);
  assert.match(files[1], /getClaims/);
  assert.ok(files.every((value) => !/signInWithOtp|createUser/.test(value)));
});

test("Preview impersonation remains a signed Director lease without fake Auth users", async () => {
  const route = await source("app/api/director/impersonation/route.js");
  assert.match(route, /createPlayerPassportSession/);
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /beginPreviewIdentityImpersonation/);
  assert.match(route, /endPreviewIdentityImpersonation/);
  assert.doesNotMatch(route, /auth\.users|createUser|verifyOtp/i);
});

test("approved Auth SDK packages are installed without exposing server credentials to browser variables", async () => {
  const pkg = JSON.parse(await source("package.json"));
  assert.ok(pkg.dependencies["@supabase/supabase-js"]);
  assert.ok(pkg.dependencies["@supabase/ssr"]);
  const browser = await source("lib/supabase-auth-browser.js");
  assert.doesNotMatch(browser, /SUPABASE_SCORING_MIRROR_SECRET_KEY|service_role|sb_secret_/);
});
