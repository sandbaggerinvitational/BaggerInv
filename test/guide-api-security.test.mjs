import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("published Guide endpoint is a participant-safe Supabase read with revision caching", () => {
  const route = source("app/api/participant/tournament-guide/route.js");
  assert.match(route, /readGuideProjection/);
  assert.match(route, /X-Guide-Read-Source["']?:?\s*["']supabase/);
  assert.match(route, /X-Guide-Google-Requests["']?:?\s*["']0/);
  assert.match(route, /If-None-Match|if-none-match/);
  assert.match(route, /ETag/);
  assert.match(route, /stale-while-revalidate=300/);
  assert.match(route, /SECTION_READERS/);
  assert.match(route, /guideSections:\s*content\.overview/);
  assert.doesNotMatch(route, /readWorkbookSheetsByName|getTournamentData|resolveGuideContentGoogle|GOOGLE_SHEETS_ID/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
});

test("scheduled Guide endpoint is POST-only, Preview-gated, and requires application authorization", () => {
  const route = source("app/api/cron/guide-sync/route.js");
  const gate = route.indexOf("assertGuideSyncEnvironment");
  const authorization = route.indexOf("guideWorkerAuthorized(request)");
  const sync = route.indexOf("synchronizeGuideContent({ triggerType: \"SCHEDULED\"");
  assert.match(route, /VERCEL_ENV !== "preview"/);
  assert.ok(gate >= 0 && authorization > gate && sync > authorization);
  assert.match(route, /GUIDE_WORKER_UNAUTHORIZED/);
  assert.match(route, /status: 401/);
  assert.match(route, /lastKnownGoodPreserved: true/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.doesNotMatch(route, /console\.(?:log|error)|GUIDE_SYNC_WORKER_SECRET|VERCEL_AUTOMATION_BYPASS_SECRET/);
});

test("Director Guide route authorizes signed Director sessions and shares the canonical sync service", () => {
  const route = source("app/api/director/guide-content/route.js");
  assert.match(route, /inspectTournamentDirectorToken\(playerPassportTokenFromRequest\(request\)\)/);
  assert.match(route, /assertGuideSyncEnvironment\(\{ triggerType: "MANUAL" \}\)/);
  assert.match(route, /synchronizeGuideContent\(\{/);
  assert.match(route, /triggerType: "MANUAL"/);
  assert.match(route, /readGuideSyncStatus/);
  assert.match(route, /readGuideWorkerStatus/);
  assert.match(route, /Tournament Director access is required/);
  assert.match(route, /X-Director-Retryable/);
  assert.doesNotMatch(route, /readWorkbookSheetsByName|GUIDE_SYNC_WORKER_SECRET|VERCEL_AUTOMATION_BYPASS_SECRET/);
});

test("existing Director readiness surface exposes immediate Guide refresh and safe status", () => {
  const client = source("app/admin/director/game-center-readiness/GameCenterReadinessClient.js");
  assert.match(client, /Refresh Guide Content/);
  assert.match(client, /Guide Sync Status/);
  assert.match(client, /\/api\/director\/guide-content/);
  assert.match(client, /directorFetch/);
});

test("Guide storage and administrative RPCs remain RLS-closed and service-only", () => {
  const projection = source("supabase/migrations/202608130007_preview_guide_content_projection.sql");
  const worker = source("supabase/migrations/202608130008_preview_guide_sync_protected_worker.sql");
  const staleness = source("supabase/migrations/202608130009_preview_guide_sync_staleness.sql");
  for (const table of ["guide_content_revisions", "guide_projection_current", "guide_sync_controls", "guide_sync_runs"]) {
    assert.match(projection, new RegExp(`alter table scoring_authority\\.${table} enable row level security`));
    assert.match(projection, new RegExp(`revoke all on scoring_authority\\.${table} from public, anon, authenticated`));
  }
  for (const rpc of ["claim_preview_guide_sync", "publish_preview_guide_projection", "mark_preview_guide_sync_failed", "read_current_guide_projection"]) {
    assert.match(projection, new RegExp(`revoke all on function public\\.${rpc}`));
    assert.match(projection, new RegExp(`grant execute on function public\\.${rpc}[^;]+ to service_role`, "s"));
  }
  assert.match(worker, /revoke all on scoring_authority\.guide_sync_worker_configuration from public, anon, authenticated/);
  assert.match(worker, /scorecard_archive_worker_configuration/);
  assert.match(worker, /'Authorization', 'Bearer ' \|\| configuration\.worker_secret/);
  assert.match(worker, /'x-vercel-protection-bypass', configuration\.vercel_protection_bypass/);
  assert.match(staleness, /last_verified_value < now\(\) - interval '10 minutes'/);
  assert.match(staleness, /'state', state_value/);
  assert.doesNotMatch(projection + worker + staleness, /sb_secret_|eyJ[a-zA-Z0-9_-]{10,}|BEGIN PRIVATE KEY/);
});

test("legacy Google Guide transport remains outside the normal participant path", () => {
  const resolver = source("app/tournament-guide/resolveGuideContent.js");
  const legacy = source("app/tournament-guide/resolveGuideContentGoogle.js");
  const courses = source("app/courses/page.js");
  const courseDetail = source("app/courses/[courseId]/page.js");
  assert.match(resolver, /if \(source\.source\.resolved === "google"\) return resolveGoogleGuideContent\(\)/);
  assert.match(resolver, /readGuideProjection\(\{ surface \}\)/);
  assert.doesNotMatch(resolver, /getTournamentData|refreshHistoricalData|readWorkbookSheetsByName/);
  assert.match(legacy, /getTournamentData|refreshHistoricalData/);
  assert.match(courses, /archive\s*\?\s*await import\("\.\.\/tournament-guide\/resolveGuideContentGoogle\.js"\)/);
  assert.match(courseDetail, /archive\s*\?\s*await import\("\.\.\/\.\.\/tournament-guide\/resolveGuideContentGoogle\.js"\)/);
});
