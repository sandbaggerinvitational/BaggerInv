import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  productionShadowCandidateScoringMutationDecision,
  PRODUCTION_SHADOW_CANDIDATE_SCORING_READ_ONLY_CODE,
} from "../lib/production-shadow-candidate.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const candidateHostname = "bagger-production-shadow-score.vercel.app";
const deploymentHostname = "bagger-production-shadow-score-deploy.vercel.app";
const candidateCommit = "c".repeat(40);
const candidateEnv = {
  VERCEL_ENV: "preview",
  VERCEL_URL: deploymentHostname,
  VERCEL_BRANCH_URL: candidateHostname,
  VERCEL_GIT_COMMIT_SHA: candidateCommit,
  VERCEL_PROJECT_ID: "prj_bagger_inv_production",
  VERCEL_PROJECT_NAME: "bagger-inv",
  PRODUCTION_SHADOW_CANDIDATE_ENABLED: "true",
  PRODUCTION_SHADOW_CANDIDATE_HOSTNAME: candidateHostname,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_COMMIT_SHA: candidateCommit,
  PRODUCTION_SHADOW_CANDIDATE_EXPECTED_VERCEL_PROJECT_ID: "prj_bagger_inv_production",
  PRODUCTION_SHADOW_CANDIDATE_AUTH_ENABLED: "true",
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "production-server-secret-never-serialized",
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  SCORING_AUTHORITY: "google",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "production-browser-publishable-key",
  PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true",
  PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
  NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "production-turnstile-site-key",
  PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "production-auth-rate-limit-only-secret",
  PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "false",
  PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "false",
  PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "false",
  PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
  PRODUCTION_SUPABASE_AUTH_USER_CREATION_ENABLED: "false",
  SUPABASE_SCORING_MIRROR_ENABLED: "false",
};

const request = ({
  host = candidateHostname,
  origin = `https://${candidateHostname}`,
  method = "POST",
} = {}) => ({
  method,
  url: `https://${host}/api/scoring/current`,
  headers: new Headers({
    host,
    "x-forwarded-host": host,
    "x-forwarded-proto": "https",
    ...(origin ? { origin } : {}),
  }),
});

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the exact Production-shadow candidate rejects scoring mutations as read-only", () => {
  const decision = productionShadowCandidateScoringMutationDecision(request(), candidateEnv);
  assert.deepEqual(decision, {
    blocked: true,
    code: PRODUCTION_SHADOW_CANDIDATE_SCORING_READ_ONLY_CODE,
    status: 409,
    reason: "production-shadow-candidate-scoring-read-only",
  });
});

test("a malformed requested candidate fails closed while ordinary Preview and live Production remain unchanged", () => {
  const malformed = productionShadowCandidateScoringMutationDecision(request(), {
    ...candidateEnv,
    PRODUCTION_SUPABASE_PROJECT_REF: "idgigvjjqkfbqjeredpb",
  });
  assert.equal(malformed.blocked, true);
  assert.equal(malformed.status, 404);
  assert.equal(malformed.code, "PRODUCTION_SHADOW_CANDIDATE_REQUEST_UNAVAILABLE");

  assert.equal(productionShadowCandidateScoringMutationDecision(request(), {
    VERCEL_ENV: "preview",
    SCORING_AUTHORITY: "supabase",
  }).blocked, false);
  assert.equal(productionShadowCandidateScoringMutationDecision(request({ host: "baggerinv.com", origin: "https://baggerinv.com" }), {
    ...candidateEnv,
    VERCEL_ENV: "production",
    VERCEL_URL: "baggerinv.com",
  }).blocked, false);
});

test("every web scoring mutation and scoring-session issuance fails before side effects", async () => {
  const routes = [
    ["app/api/scoring/current/route.js", ["session(request)", "consumeRateLimit(", "request.json()", "persistParticipantScore(", "after("]],
    ["app/api/scoring/session/route.js", ["requireScoringAuthority()", "request.json()", "consumeRateLimit(", "authenticateParticipantMatch(", "createScoringSession(", "response.cookies.set("]],
    ["app/api/scoring/matches/[matchId]/route.js", ["session(request)", "consumeRateLimit(", "request.json()", "persistParticipantScore(", "after("]],
    ["app/api/scoring/diagnostics/route.js", ["scoringAuthorityEnvironment()", "verifyScoringSession(", "request.json()", "recordPreviewScoringClientDiagnostic("]],
    ["app/api/player-passport/matches/route.js", ["participant(request)", "requireMatchAuthorizationSource()", "request.json()", "createScoringSession(", "response.cookies.set("]],
  ];
  for (const [path, sideEffects] of routes) {
    const route = await source(path);
    const post = route.slice(route.indexOf("export async function POST"));
    const guard = post.indexOf("productionShadowScoringMutationResponse(request)");
    const earlyReturn = post.indexOf("if (candidateReadOnly) return candidateReadOnly");
    assert.ok(guard >= 0 && earlyReturn > guard, `${path} must reject the candidate first`);
    for (const sideEffect of sideEffects) {
      assert.ok(post.indexOf(sideEffect) > earlyReturn, `${path}: ${sideEffect} must occur after the candidate rejection`);
    }
  }
});

test("mobile scoring mutations short-circuit before identity, persistence, and post-commit work", async () => {
  for (const path of [
    "app/api/mobile/v1/scoring/hole/route.js",
    "app/api/mobile/v1/scoring/finalize/route.js",
  ]) {
    const route = await source(path);
    const post = route.slice(route.indexOf("export const POST"));
    assert.match(post, /productionShadowScoringMutationResponse\(request\) \|\| mobileV1ScoringResponse\(request/);
    assert.ok(post.indexOf("productionShadowScoringMutationResponse(request)") < post.indexOf("mobileV1ScoringResponse(request"));
    assert.ok(post.indexOf("mobileV1ScoringResponse(request") < post.indexOf("runMobileScoringPostCommit"));
  }
});

test("candidate score pages disable local-first persistence and render only read-only match actions", async () => {
  const [scorePage, myMatchPage, entry, dashboard, safety] = await Promise.all([
    source("app/score/page.js"),
    source("app/my-match/page.js"),
    source("app/score/ScoreEntry.js"),
    source("app/score/MyMatchDashboard.js"),
    source("lib/production-shadow-scoring-safety.js"),
  ]);
  for (const page of [scorePage, myMatchPage]) {
    assert.match(page, /productionShadowReadOnly = productionShadowCandidateReadEnvironment\(env\)\.eligible/);
    assert.match(page, /localFirstEnabled=\{previewMode && !productionShadowReadOnly\}/);
    assert.match(page, /scoringReadOnly=\{productionShadowReadOnly\}/);
  }
  assert.match(entry, /scoringReadOnly = false/);
  assert.match(entry, /if \(scoringReadOnly\)[\s\S]{0,180}Scoring changes are disabled/);
  assert.match(entry, /readOnlyScorecard = isFinal \|\| scoringReadOnly/);
  assert.match(entry, /Production shadow scorecard • Read-only • No score writes permitted/);
  assert.match(dashboard, /if \(readOnly\) return[\s\S]{0,180}View Match/);
  assert.match(dashboard, /Production shadow certification is read-only\. Scoring changes are disabled\./);
  for (const header of [
    "X-Scoring-Google-Writes",
    "X-Scoring-Supabase-Writes",
    "X-Scoring-Ingress-Attempts",
  ]) assert.match(safety, new RegExp(`"${header}": "0"`));
});
