import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { scoringAuthorityEnvironment } from "../lib/scoring-authority.js";
import { processNextGoogleOutboxEvent } from "../lib/scoring-google-outbox.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";
import { PRODUCTION_VERCEL_PROJECT_ID } from "../lib/production-cutover-activation-contract.js";

const root = new URL("..", import.meta.url);
const migration = await readFile(new URL("supabase/production_migrations/202608240021_production_scoring_operations.sql", root), "utf8");
const outboxWorker = await readFile(new URL("lib/scoring-google-outbox.js", root), "utf8");
const archiveWorker = await readFile(new URL("lib/scorecard-archive-worker.js", root), "utf8");
const archiveRoute = await readFile(new URL("app/api/cron/round-scorecards-archive/route.js", root), "utf8");
const outboxRoute = await readFile(new URL("app/api/cron/scoring-google-outbox/route.js", root), "utf8");
const googleWriter = await readFile(new URL("lib/google-sheets-write.js", root), "utf8");
const currentScoringRoute = await readFile(new URL("app/api/scoring/current/route.js", root), "utf8");
const matchScoringRoute = await readFile(new URL("app/api/scoring/matches/[matchId]/route.js", root), "utf8");
const directorRoute = await readFile(new URL("app/api/director/route.js", root), "utf8");
const liveMatchesRoute = await readFile(new URL("app/api/live-matches/route.js", root), "utf8");

const commitSha = "a".repeat(40);
const cutoverEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  VERCEL_PROJECT_NAME: "bagger-inv",
  VERCEL_GIT_COMMIT_SHA: commitSha,
  PRODUCTION_FOUNDATION_ENABLED: "true",
  PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
  PRODUCTION_CUTOVER_PHASE: "SCORING_COMMIT",
  PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: commitSha,
  PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
  PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026",
  PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_" + "x".repeat(32),
  GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true",
  PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
  PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "true",
  SCORING_AUTHORITY: "supabase",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
});

test("Production scoring authority activates only at the exact committed cutover gate", () => {
  const active = scoringAuthorityEnvironment(cutoverEnv);
  assert.equal(active.resolved, "supabase");
  assert.equal(active.productionEligible, true);

  for (const env of [
    { ...cutoverEnv, PRODUCTION_CUTOVER_PHASE: "SCORING_PREPARE" },
    { ...cutoverEnv, PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "false" },
    { ...cutoverEnv, PRODUCTION_SUPABASE_PROJECT_REF: "idgigvjjqkfbqjeredpb" },
    { ...cutoverEnv, VERCEL_GIT_COMMIT_SHA: "b".repeat(40) },
  ]) {
    const state = scoringAuthorityEnvironment(env);
    assert.equal(state.resolved, "unavailable");
    assert.equal(state.productionEligible, false);
  }

  for (const activation of [undefined, "", "false", "maybe"]) {
    const blocked = scoringAuthorityEnvironment({
      VERCEL_ENV: "production",
      SCORING_AUTHORITY: "supabase",
      PRODUCTION_CUTOVER_ACTIVATION_ENABLED: activation,
    });
    assert.equal(blocked.resolved, "unavailable", String(activation));
    assert.equal(blocked.blocked, true, String(activation));
    assert.equal(blocked.productionEligible, false, String(activation));
  }

  for (const legacyEnv of [
    { VERCEL_ENV: "production" },
    { VERCEL_ENV: "production", SCORING_AUTHORITY: "google" },
  ]) {
    const legacy = scoringAuthorityEnvironment(legacyEnv);
    assert.equal(legacy.resolved, "google");
    assert.equal(legacy.blocked, false);
  }
});

test("Production mutation RPCs are exact-epoch, DB-authorized, atomic, audited, and outboxed", () => {
  assert.match(migration, /assert_exact_cutover_resource_scope\(input, true\)/i);
  assert.match(migration, /activation\.authority_generation_id <> nullif\(input->>'expected_epoch_id', ''\)::uuid/i);
  assert.match(migration, /gate\.state <> 'OPEN'[\s\S]*gate\.authority <> 'SUPABASE'/i);
  assert.match(migration, /join auth\.users auth_user[\s\S]*email_confirmed_at is not null/i);
  assert.match(migration, /from participant_identity\.user_player_links/i);
  assert.match(migration, /identifier\.status = 'VERIFIED'/i);
  assert.match(migration, /join participant_identity\.tournament_roles/i);
  assert.match(migration, /join scoring_authority\.tournament_players membership/i);
  assert.match(migration, /from production_control\.director_entitlements entitlement/i);
  for (const rpc of [
    "submit_production_hole_score",
    "mutate_production_match_control",
    "finalize_production_match",
    "reopen_production_match",
  ]) assert.match(migration, new RegExp(`function public\\.${rpc}\\(input jsonb\\)`, "i"));
  for (const operation of [
    "MARK_LIVE", "SCORING_LOCK", "SCORING_UNLOCK", "ACCESS_ACTIVATE", "ACCESS_REVOKE",
  ]) assert.match(migration, new RegExp(`'${operation}'`));
  assert.match(migration, /for update/i);
  assert.match(migration, /MATCH_REVISION_CONFLICT/i);
  assert.match(migration, /HOLE_REVISION_CONFLICT/i);
  assert.match(migration, /PERMISSION_STALE/i);
  assert.match(migration, /insert into scoring_authority\.score_mutations/i);
  assert.match(migration, /insert into scoring_authority\.score_revision_history/i);
  assert.match(migration, /insert into scoring_authority\.audit_events/i);
  assert.match(migration, /insert into scoring_authority\.google_outbox_events/i);
});

test("Finalize, Reopen and re-Finalize use one explicit snapshot/archive transition path", () => {
  assert.match(migration, /disable trigger capture_scorecard_archive_transition/i);
  assert.match(migration, /progress := scoring_authority\.match_progress\(target_match, match_row\.format\)/i);
  assert.match(migration, /'team_1_points', \(progress->>'team_1_points'\)::numeric/i);
  assert.match(migration, /'team_2_points', \(progress->>'team_2_points'\)::numeric/i);
  assert.match(migration, /capture_finalized_scorecard_snapshot\(target_match, actor\)/i);
  assert.match(migration, /invalidate_finalized_scorecard_snapshot\([\s\S]*target_match, next_revision, actor/i);
  assert.match(migration, /'official_points_active', false/i);
  assert.match(migration, /'scorecard_archive', archive_result/i);
  assert.match(migration, /MATCH_FINALIZED/i);
  assert.match(migration, /MATCH_REOPENED/i);
});

test("Production workers are lease-bound, inspectable, dormant, service-role-only, and fixed-search-path", () => {
  for (const rpc of [
    "claim_production_google_outbox", "claim_production_google_outbox_event",
    "complete_production_google_outbox", "fail_production_google_outbox",
    "inspect_production_scoring_workers", "claim_production_scorecard_archive_job",
    "complete_production_scorecard_archive_job", "fail_production_scorecard_archive_job",
    "inspect_production_scorecard_archive_state",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}\\(input jsonb\\)`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}\\(jsonb\\) to service_role`, "i"));
  }
  assert.match(migration, /claimed_by <> worker/i);
  assert.match(migration, /lease_expires_at < now\(\)/i);
  assert.match(migration, /for update(?: of event)? skip locked/i);
  assert.match(migration, /scheduler_installed/i);
  assert.doesNotMatch(migration, /cron\.schedule|net\.http_post/i);
  assert.match(migration, /revoke all on function %s from public, anon, authenticated, service_role/i);

  for (const definition of migration.split(/create or replace function /i).slice(1)) {
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog,/i);
  }
});

test("Google scoring/archive workers stay dedicated while canonical legacy is fenceable", () => {
  assert.match(outboxWorker, /operation: "SCORING_GOOGLE_OUTBOX"/);
  assert.match(archiveWorker, /operation: "ROUND_SCORECARDS_ARCHIVE"/);
  assert.match(outboxWorker, /production-google-service-account-server/);
  assert.match(archiveWorker, /production-google-service-account-server/);
  assert.match(googleWriter, /\["production-worker", "legacy-canonical"\]\.includes/);
  assert.match(googleWriter, /credential\.credentialSource === "legacy-canonical"/);
  assert.match(googleWriter, /credential\.operation === "CANONICAL_LEGACY_V2"/);
  assert.match(googleWriter, /PRODUCTION_GOOGLE_WRITE_CONTEXT_FORBIDDEN/);
  assert.match(googleWriter, /mirrorCanonicalLiveMatchControl/);
  assert.doesNotMatch(outboxWorker, /GOOGLE_SERVICE_ACCOUNT_EMAIL|GOOGLE_PRIVATE_KEY/);
  assert.doesNotMatch(archiveWorker, /GOOGLE_SERVICE_ACCOUNT_EMAIL|GOOGLE_PRIVATE_KEY/);
});

test("worker routes are authenticated POST-only gates", () => {
  for (const [source, secret] of [
    [outboxRoute, "SCORING_GOOGLE_OUTBOX_WORKER_SECRET"],
    [archiveRoute, "ROUND_SCORECARDS_ARCHIVE_WORKER_SECRET"],
  ]) {
    assert.match(source, new RegExp(secret));
    assert.match(source, /timingSafeEqual/);
    assert.match(source, /export async function POST/);
    assert.match(source, /export async function GET/);
    assert.match(source, /METHOD_NOT_ALLOWED/);
    assert.match(source, /status: 405/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_/);
  }
  assert.match(outboxRoute, /productionCutoverPhaseAtLeast\(env, "WORKERS"\)/);
  assert.match(outboxRoute, /PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED/);
  assert.match(archiveRoute, /roundScorecardsArchiveEnvironment/);
});

test("participant scoring queues mirrors until the explicit Production worker phase", () => {
  for (const source of [currentScoringRoute, matchScoringRoute, directorRoute, liveMatchesRoute]) {
    assert.match(source, /productionCutoverPhaseAtLeast\(process\.env, "WORKERS"\)/);
    assert.match(source, /process\.env\.VERCEL_ENV !== "production"/);
    assert.match(source, /pending: true/);
  }
  assert.match(matchScoringRoute, /deliveries: \[\], pending: true/);
  assert.match(liveMatchesRoute, /\["finalize", "reopen"\]\.includes\(mutationAuthority\.canonicalLifecycleAction\)/);
});

test("a Production control mirror uses the dedicated scope and checkpoints the claimed worker", async () => {
  const workerId = "production-outbox:test";
  const match = {
    "Match ID": "2026-R1-1",
    "Match Status": "Live",
    "Scoring Locked": "TRUE",
    "Access Active": "FALSE",
    "Access Version": 8,
    "Updated At": "2026-08-24T12:00:01.000Z",
  };
  let credentialOperation = "";
  let mirrored = 0;
  let completed = null;
  const result = await processNextGoogleOutboxEvent({
    workerId,
    env: { VERCEL_ENV: "production" },
    dependencies: {
      claimGoogleOutbox: async () => ({ payload: {
        event: {
          id: "event-1",
          event_type: "SCORING_LOCKED",
          attempts: 1,
          match_id: "2026-R1-1",
          match_revision: 12,
          mutation_key: "lock-1",
          payload: {
            google_target_match_id: "2026-R1-1",
            permission_revision: 8,
            status: "LIVE",
            scoring_locked: true,
            access_active: false,
          },
        },
        checkpoint: { google_match_updated_at: "2026-08-24T12:00:00.000Z" },
      } }),
      withProductionGoogleServiceAccountCredentials: async (options, callback) => {
        credentialOperation = options.operation;
        assert.equal(options.resources.googleWorkbookId, PRODUCTION_GOOGLE_WORKBOOK_ID);
        assert.equal(options.resources.supabaseProjectRef, PRODUCTION_SUPABASE_PROJECT_REF);
        return callback();
      },
      measure: async (_label, callback) => ({ result: await callback(), diagnostics: { workbookWrites: 1 } }),
      mirrorCanonicalLiveMatchControl: async (_matchId, projection) => {
        mirrored += 1;
        assert.equal(projection.scoringLocked, true);
        assert.equal(projection.accessActive, false);
        assert.equal(projection.accessVersion, 8);
        return { match, updatedAt: match["Updated At"] };
      },
      readWorkbookSheetsByName: async () => ({
        "Live Matches": { records: [{ record: match }] },
      }),
      completeGoogleOutbox: async (input) => {
        completed = input;
        return { payload: { ok: true, checkpoint: { last_supabase_match_revision: 12 } } };
      },
      failGoogleOutbox: async () => {
        assert.fail("the verified mirror must not fail");
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(credentialOperation, "SCORING_GOOGLE_OUTBOX");
  assert.equal(mirrored, 1);
  assert.equal(completed.worker_id, workerId);
  assert.match(completed.verified_fingerprint, /^[0-9a-f]{64}$/);
});
