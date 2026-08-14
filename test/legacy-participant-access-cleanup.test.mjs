import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createScoringSession, verifyScoringSession } from "../lib/scoring-access.js";
import { validateAuthoritativeParticipantSession } from "../lib/scoring-participant-authorization.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const previewSupabaseEnv = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  SCORING_AUTHORITY: "supabase",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "sb_secret_preview",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: "https://preview.supabase.co",
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "sb_publishable_preview",
};

test("Supabase score and My Match pages pass a server-controlled identity source", async () => {
  const [scorePage, myMatchPage, scoreEntry] = await Promise.all([
    source("app/score/page.js"),
    source("app/my-match/page.js"),
    source("app/score/ScoreEntry.js"),
  ]);
  for (const page of [scorePage, myMatchPage]) {
    assert.match(page, /requireParticipantIdentityAuthority\(\)\.resolved/);
    assert.match(page, /participantIdentityAuthority=\{participantIdentityAuthority\}/);
  }
  assert.match(scoreEntry, /passport\.status === 401 && !dashboardOnly && !supabaseParticipantIdentity/);
  assert.match(scoreEntry, /href=\{`\/participant-auth\?next=\$\{dashboardOnly \? "\/my-match" : "\/score"\}`\}/);
  const supabaseInactiveBranch = scoreEntry.slice(
    scoreEntry.indexOf("if (!authorized && supabaseParticipantIdentity)"),
    scoreEntry.indexOf("if (!authorized) return", scoreEntry.indexOf("if (!authorized && supabaseParticipantIdentity)")),
  );
  assert.doesNotMatch(supabaseInactiveBranch, /api\/scoring\/access|\/activate|participant match code/i);
});

test("Supabase Home and Me route signed-out golfers to OTP without removing Passport rollback", async () => {
  const [supabaseHome, mobileHome, commandCenter, personalizedHome, mePage, profile] = await Promise.all([
    source("app/ParticipantSupabaseHome.js"),
    source("app/MobileTournamentHome.js"),
    source("app/TournamentCommandCenter.js"),
    source("app/PersonalizedPlayerHome.js"),
    source("app/me/page.js"),
    source("app/me/ParticipantProfile.js"),
  ]);
  assert.match(supabaseHome, /participantIdentityAuthority="supabase"/);
  assert.match(mobileHome, /participantIdentityAuthority=\{participantIdentityAuthority\}/);
  assert.match(commandCenter, /participantIdentityAuthority=\{participantIdentityAuthority\}/);
  assert.match(personalizedHome, /"\/participant-auth\?next=\/home" : "\/activate"/);
  assert.match(mePage, /requireParticipantIdentityAuthority\(\)\.resolved/);
  assert.match(profile, /"\/participant-auth\?next=\/me"/);
  assert.match(profile, /: <section[\s\S]*href="\/activate">Activate Player Passport/);
});

test("Supabase Home does not register the legacy Trusted Devices install callback", async () => {
  const banner = await source("app/PlayerSetupBanner.js");
  const effect = banner.slice(banner.indexOf("useEffect(() => {"), banner.indexOf("}, [onUpdated])") + 16);
  assert.ok(effect.indexOf("if (!readiness) return undefined") < effect.indexOf('addEventListener("sbi:pwa-installed"'));
  assert.match(effect, /saveReadiness\(\{ pwaInstalled: true \}\)/);
});

test("public player profile decorates navigation through Supabase identity in Preview", async () => {
  const profile = await source("app/players/[slug]/page.js");
  assert.match(profile, /participantIdentityAuthority\.resolved === "supabase"/);
  assert.match(profile, /resolveSupabaseParticipantIdentity\(\{ cookieStore \}\)/);
  assert.match(profile, /else \{[\s\S]*resolvePlayerPassportToken/);
});

test("legacy QR and match-code sessions cannot cross the Supabase participant boundary", async () => {
  const secret = "legacy-access-session-secret-long-enough";
  const session = verifyScoringSession(createScoringSession({
    matchId: "2026-R3-7",
    tournamentId: "2026",
    accessVersion: 3,
    scorerName: "QR participant",
  }, secret), secret);
  assert.equal(session.identityAuthority, "passport");
  assert.equal(session.playerId, "");
  await assert.rejects(
    () => validateAuthoritativeParticipantSession({}, session, {
      dependencies: { env: previewSupabaseEnv },
      cookieStore: { getAll: () => [], get: () => undefined, set: () => {} },
    }),
    (error) => error.code === "SCORING_SESSION_INVALID",
  );
});

test("Director and rollback legacy routes remain present after participant caller cleanup", async () => {
  const [activation, qr, liveMatches, impersonation] = await Promise.all([
    source("app/activate/page.js"),
    source("app/score/access/[token]/route.js"),
    source("app/api/live-matches/route.js"),
    source("app/api/director/impersonation/route.js"),
  ]);
  assert.match(activation, /PlayerPassportActivation/);
  assert.match(qr, /authenticateParticipantMatch/);
  assert.match(liveMatches, /action === "access-generate"/);
  assert.match(impersonation, /beginPreviewIdentityImpersonation/);
});
