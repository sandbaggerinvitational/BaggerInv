import { revalidatePath, revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { authorizePreviewDirector } from "../../../lib/preview-director-authorization.js";
import { directorTransactionError } from "../../../lib/director-transaction-error.js";
import { persistDirectorMatchLifecycle } from "../../../lib/scoring-persistence-adapter.js";
import { recalculateCompetitionDerivedTournament } from "../../../lib/competition-derived-supabase.js";
import { recalculateCalcuttaAfterCanonicalMutation } from "../../../lib/calcutta-post-commit.js";
import { assertDirectorMutationAuthority } from "../../../lib/director-mutation-authority.js";
import { assertScoringMutationAuthorityContractBeforeDispatch } from "../../../lib/scoring-mutation-authority-server.js";

export const dynamic = "force-dynamic";

async function authorize(request) {
  return authorizePreviewDirector({ request, allowBootstrap: true });
}

function authorizationFailure(result) {
  if (result.status === "unavailable") {
    return NextResponse.json({ error: "Director verification expired. Reconnecting automatically…" }, { status: 503, headers: { "Retry-After": "1", "X-Director-Retryable": "identity" } });
  }
  return NextResponse.json({ error: "Tournament Director access is required." }, { status: 403 });
}

function transactionTrace(action) {
  const startedAt = Date.now();
  const stages = [];
  return {
    stage(name, result = "PASS", detail = "") { stages.push({ name, result, detail, elapsedMs: Date.now() - startedAt }); },
    report(extra = {}) { return { action, elapsedMs: Date.now() - startedAt, stages, ...extra }; },
  };
}

function refresh() {
  // Retained cache key invalidates pre-retirement readers without an adapter import.
  revalidateTag("sbi-google-sheets");
  for (const path of ["/admin/director", "/home", "/live", "/my-match"]) revalidatePath(path);
}

export async function GET(request) {
  // The workbook-shaped Preview dashboard is retired. The canonical Director
  // contract remains /api/director/production-overview; no Google fallback.
  return NextResponse.json({
    ok: false, code: "GOOGLE_DIRECTOR_RUNTIME_RETIRED",
    replacement: "/api/director/production-overview",
  }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const trace = transactionTrace("director-action");
  const directorVerificationStartedAt = Date.now();
  const authorization = await authorize(request);
  trace.stage("Identity verification", authorization.status === "active" ? "PASS" : "FAIL", JSON.stringify({
    status: authorization.status,
    startedAt: directorVerificationStartedAt,
    completedAt: Date.now(),
  }));
  if (authorization.status !== "active") return authorizationFailure(authorization);
  const identity = authorization.identity;
  try {
    const input = await request.json();
    const mutationAuthority = assertDirectorMutationAuthority({ surface: "director", action: input.action });
    await assertScoringMutationAuthorityContractBeforeDispatch(input.scoringAuthorityContract, { request });
    trace.stage("Action authorization", "PASS", String(input.action || "unknown"));
    trace.stage("Canonical authority", "PASS", JSON.stringify(mutationAuthority));
    if (mutationAuthority.resolvedAuthority === "supabase") {
      if (!input.matchId || !mutationAuthority.canonicalLifecycleAction) {
        const error = new Error("A canonical match lifecycle action and Match ID are required.");
        error.code = "DIRECTOR_CANONICAL_LIFECYCLE_INPUT_REQUIRED";
        error.status = 400;
        throw error;
      }
      const updatedBy = identity.actor.name;
      const lifecycle = await persistDirectorMatchLifecycle({
        action: mutationAuthority.canonicalLifecycleAction,
        matchId: input.matchId,
        updatedBy,
        authUserId: identity.authUserId,
        playerId: identity.actor.id,
        operationRequestId: input.operationRequestId,
        expectedMatchRevision: input.expectedMatchRevision,
        expectedPermissionRevision: input.expectedPermissionRevision,
      });
      if (!lifecycle.delegated) {
        const error = new Error("The canonical Supabase lifecycle transaction was not selected.");
        error.code = "SUPABASE_CANONICAL_LIFECYCLE_REQUIRED";
        error.status = 503;
        throw error;
      }
      // Reporting retirement never changes the committed canonical receipt.
      const mirror = { delivered: 0, failed: 0, pending: false, retired: true };
      trace.stage("Canonical lifecycle transaction", "PASS", JSON.stringify({
        action: mutationAuthority.canonicalLifecycleAction,
        matchId: input.matchId,
        authority: "supabase",
      }));
      refresh();
      after(async () => {
        try {
          await Promise.all([
            recalculateCompetitionDerivedTournament("", { calculatedBy: `Director lifecycle worker · ${updatedBy || "Director"}` }),
            recalculateCalcuttaAfterCanonicalMutation("", {
              calculatedBy: `Director lifecycle Calcutta worker · ${updatedBy || "Director"}`,
              mutationKey: input.operationRequestId,
              matchId: input.matchId,
            }),
          ]);
        } catch (error) {
          console.error("Competition derived-state Director lifecycle recalculation remains pending", {
            action: input.action, code: error?.code || "DERIVED_STATE_RECALCULATION_FAILED",
          });
        }
      });
      console.info("Director action transaction", trace.report({ matchId: input.matchId, updatedBy, authority: "supabase" }));
      return NextResponse.json({ ok: true, changed: false, authority: "supabase", receipt: lifecycle.result, mirror: {
        delivered: mirror.delivered, failed: mirror.failed, pending: false, retired: true,
      } });
    }
    return NextResponse.json({ ok: false, code: "GOOGLE_DIRECTOR_RUNTIME_RETIRED",
      replacement: "/api/director/production-overview" },
    { status: 410, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    trace.stage("Failure", "FAIL", error instanceof Error ? error.message : String(error));
    console.error("Director action transaction", trace.report());
    const authorityFailure = error?.code === "OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY" || error?.code === "SCORING_AUTHORITY_UNAVAILABLE";
    return NextResponse.json({
      error: authorityFailure ? error.message : directorTransactionError(error),
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.authorityDiagnostics ? { authority: error.authorityDiagnostics } : {}),
    }, { status: Number(error?.status || 400) });
  }
}
