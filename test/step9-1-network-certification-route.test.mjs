import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Step 9.1 network certification is a protected Preview-only read allowlist", async () => {
  const route = await source("app/api/admin/data-authority-certification/route.js");

  assert.match(route, /export async function GET\(request\)/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)\b/);
  assert.match(route, /process\.env\.VERCEL_ENV !== "preview"[\s\S]*status: 404/);
  assert.match(route, /authorizePreviewDirector\(\{ request, allowBootstrap: false \}\)/);
  assert.match(route, /authorization\?\.status !== "active"[\s\S]*status: 401/);
  assert.match(route, /const SURFACES = new Set\(\[/);
  for (const surface of [
    "root", "live", "players", "history", "courses", "draft", "odds-center", "war-room",
    "home", "me", "my-match", "game-center", "leaderboards", "guide", "authorities",
  ]) assert.match(route, new RegExp(`"${surface.replace("-", "\\-")}"`), surface);
  assert.match(route, /CERTIFICATION_SURFACE_NOT_ALLOWED/);
  assert.match(route, /!SURFACES\.has\(surface\)/);
  assert.doesNotMatch(route, /google-sheets-write|draft-synchronization|guide-sync-service|scoring-persistence-adapter/);
  assert.doesNotMatch(route, /\bfetch\s*\(/);
});

test("Director authorization and request validation occur before outage scope entry", async () => {
  const route = await source("app/api/admin/data-authority-certification/route.js");
  const authorizeAt = route.indexOf("await authorizePreviewDirector");
  const validateAt = route.indexOf("!SURFACES.has(surface)");
  const scopeAt = route.indexOf("await withDataAuthorityRequestScope");

  assert.ok(authorizeAt >= 0, "Director authorization is present");
  assert.ok(validateAt > authorizeAt, "the allowlist is checked only after authorization");
  assert.ok(scopeAt > validateAt, "outage scope begins only after authorization and validation");
  assert.match(route, /!\["none", "google", "supabase"\]\.includes\(outage\)/);
  assert.match(route, /injectGoogleOutage: outage === "google"/);
  assert.match(route, /injectSupabaseOutage: outage === "supabase"/);
  assert.match(route, /const result = await certificationRead\(surface, authorization\.identity\)/);
  assert.match(route, /setDataAuthorityResolvedSource\(result\?\.source \|\| "unknown"\)/);
});

test("request-local outage injection is Preview-only, exclusive, and reports transport counters", async () => {
  const [route, requestScope] = await Promise.all([
    source("app/api/admin/data-authority-certification/route.js"),
    source("lib/data-authority-request.js"),
  ]);

  assert.match(requestScope, /new AsyncLocalStorage\(\)/);
  assert.match(requestScope, /VERCEL_ENV[\s\S]*!== "preview"[\s\S]*DATA_AUTHORITY_OUTAGE_INJECTION_FORBIDDEN/);
  assert.match(requestScope, /injectGoogleOutage && injectSupabaseOutage[\s\S]*DATA_AUTHORITY_OUTAGE_INJECTION_CONFLICT/);
  assert.match(requestScope, /blockedGoogleAttempts \+= 1;[\s\S]*throw outageError\("google"\)/);
  assert.match(requestScope, /blockedSupabaseAttempts \+= 1;[\s\S]*throw outageError\("supabase"\)/);
  for (const header of [
    "X-Data-Authority-Source",
    "X-Data-Authority-Google-Requests",
    "X-Data-Authority-Google-Sheets-Requests",
    "X-Data-Authority-Google-GViz-Requests",
    "X-Data-Authority-Google-Writer-Operations",
    "X-Data-Authority-Supabase-Requests",
    "X-Data-Authority-Fallback-Used",
    "X-Data-Authority-Outage-Injection",
  ]) assert.match(requestScope, new RegExp(`"${header}"`), header);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.equal((route.match(/dataAuthorityResponseHeaders\(/g) || []).length, 2,
    "success and failure responses both expose the same safe counter headers");
  assert.match(route, /error\?\.dataAuthorityDiagnostics \|\| \{\}/);
});

test("Supabase homepage composes completed and 2026 History without a Google historical refresh", async () => {
  const page = await source("app/page.js");
  const branchStart = page.indexOf('if (homepageSource.resolved === "supabase")');
  const legacyStart = page.indexOf("} else {", branchStart);
  const branchEnd = page.indexOf("currentRead ||=", legacyStart);

  assert.ok(branchStart >= 0 && legacyStart > branchStart && branchEnd > legacyStart,
    "homepage source branches are explicit");
  const supabaseBranch = page.slice(branchStart, legacyStart);
  const googleBranch = page.slice(legacyStart, branchEnd);

  assert.match(supabaseBranch, /Promise\.all\(\[/);
  assert.match(supabaseBranch, /readHomepageCurrentTournament/);
  assert.match(supabaseBranch, /loadCompletedHistoryYears\(\)/);
  assert.match(supabaseBranch, /loadHistory2026View\(\)/);
  assert.match(supabaseBranch, /completed\.tournaments/);
  assert.match(supabaseBranch, /currentHistory\.tournament/);
  assert.doesNotMatch(supabaseBranch, /refreshHistoricalData|getTournaments\(/);

  assert.match(googleBranch, /refreshHistoricalData\(\)/);
  assert.match(googleBranch, /getTournaments\(\)/);
});
