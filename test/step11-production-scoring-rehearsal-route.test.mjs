import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Step 11 scoring rehearsal route is exact-candidate, token-bound, virtual-only, and idempotent", async () => {
  const source = await readFile(new URL(
    "../app/api/admin/step11-scoring-rehearsal/route.js",
    import.meta.url,
  ), "utf8");
  assert.match(source, /productionStep11ScoringRehearsalEnvironment/);
  assert.match(source, /x-step11-rehearsal-token/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /requestUrl\.hostname !== expectedHost/);
  assert.match(source, /inspect_production_step11_scoring_rehearsal/);
  assert.match(source, /begin_production_step11_scoring_rehearsal/);
  assert.match(source, /record_production_step11_scoring_rehearsal_evidence/);
  assert.match(source, /complete_production_step11_scoring_rehearsal/);
  assert.match(source, /beginRetryIdempotent/);
  assert.match(source, /completeRetryIdempotent/);
  assert.match(source, /PRODUCTION_STEP11_LOCK_REHEARSAL_FAILED/);
  assert.match(source, /PRODUCTION_STEP11_STALE_REVISION_REHEARSAL_FAILED/);
  assert.match(source, /PRODUCTION_STEP11_ROLLBACK_REHEARSAL_FAILED/);
  assert.match(source, /externalGoogleWrites:\s*0/);
  assert.match(source, /live2026Writes:\s*0/);
  assert.doesNotMatch(source, /google-sheets-write|saveLiveHoleScore|finalizeLiveMatch|reopenLiveMatch/);
  assert.doesNotMatch(source, /sheets\.googleapis|docs\.google\.com/);
});

test("Step 11 route never changes live source, identity, scoring, worker, or publication configuration", async () => {
  const source = await readFile(new URL(
    "../app/api/admin/step11-scoring-rehearsal/route.js",
    import.meta.url,
  ), "utf8");
  assert.doesNotMatch(source, /process\.env\.[A-Z0-9_]+\s*=/);
  assert.doesNotMatch(source, /SCORING_AUTHORITY\s*[:=]\s*["']supabase/i);
  assert.doesNotMatch(source, /PARTICIPANT_IDENTITY_AUTHORITY\s*[:=]\s*["']supabase/i);
  assert.doesNotMatch(source, /ODDS_PUBLICATION_AUTHORITY\s*[:=]\s*["']supabase/i);
  assert.doesNotMatch(source, /PRODUCTION_SUPABASE_(?:WORKERS|GOOGLE_MIRROR|SCORING_INGRESS)_ENABLED\s*[:=]\s*(?:true|["']true)/i);
});
