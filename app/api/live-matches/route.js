import { withOperationalRoute, recordOperationalError } from "../../../lib/operational-telemetry.js";
import { revalidatePath, revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";
import { invalidateScorecardAnalyticsCache } from "../../../lib/scorecard-data";
import { directorTransactionError } from "../../../lib/director-transaction-error";
import { persistDirectorMatchLifecycle } from "../../../lib/scoring-persistence-adapter";
import { recalculateCompetitionDerivedTournament } from "../../../lib/competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "../../../lib/intelligence-derived-supabase.js";
import { recalculateCalcuttaAfterCanonicalMutation } from "../../../lib/calcutta-post-commit.js";
import { authorizePreviewDirector, productionDirectorEntitlementEnvironment } from "../../../lib/preview-director-authorization.js";
import { requireScoringAuthority } from "../../../lib/scoring-authority.js";
import { assertDirectorMutationAuthority } from "../../../lib/director-mutation-authority.js";
import { assertScoringMutationAuthorityContractBeforeDispatch, currentScoringMutationAuthorityContract } from "../../../lib/scoring-mutation-authority-server.js";
import { readProductionCurrentTournamentRuntime } from "../../../lib/production-current-tournament-runtime.js";
import { readMatchAuthorizationMatrix } from "../../../lib/match-authorization-supabase.js";
import { productionLiveMatchAdminDataFromSupabaseView, readTournamentLiveView } from "../../../lib/tournament-live-supabase.js";

export const dynamic = "force-dynamic";

async function authorized(request, authority) {
  const productionDirector = productionDirectorEntitlementEnvironment(process.env);
  if (productionDirector.enabled || productionDirector.failClosed) {
    return authorizePreviewDirector({ request, allowBootstrap: false });
  }
  if (authority.resolved === "google") {
    return { status: "denied" };
  }
  return authorizePreviewDirector({ request, allowBootstrap: true });
}

function deny() {
  return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
}

function refreshMatchData() {
  // Preserve cache invalidation compatibility without importing Google transport.
  revalidateTag("sbi-google-sheets");
  invalidateScorecardAnalyticsCache();
  for (const path of ["/live", "/", "/history", "/players", "/records", "/champions"]) revalidatePath(path);
}

async function telemetryGET(request) {
  let authority;
  try { authority = requireScoringAuthority(); }
  catch (error) {
    recordOperationalError(error); return NextResponse.json({ error: error.message, code: error.code }, { status: Number(error.status || 503) }); }
  const authorization = await authorized(request, authority);
  if (authorization?.status !== "active") return deny();
  try {
    if (authority.resolved !== "supabase") {
      return NextResponse.json({ ok: false, code: "GOOGLE_MATCH_RUNTIME_RETIRED" },
        { status: 410, headers: { "Cache-Control": "private, no-store" } });
    }
    const runtime = process.env.VERCEL_ENV === "production"
      ? await readProductionCurrentTournamentRuntime({}, { env: process.env }) : null;
    const target = runtime?.tournamentId || authorization.identity?.tournamentId || "";
    const current = await readTournamentLiveView(target, { env: process.env });
    if (!current.payload?.ok) throw Object.assign(
      new Error("The current match scope is unavailable."),
      { code: current.payload?.code || "CURRENT_LIVE_MATCH_SCOPE_UNAVAILABLE", status: 503 },
    );
    const tournamentId = current.payload.data?.tournament?.tournament_id;
    if (!tournamentId || (target && tournamentId !== target)) throw Object.assign(
      new Error("The current match scope did not verify."),
      { code: "CURRENT_LIVE_MATCH_SCOPE_MISMATCH", status: 503 },
    );
    const matchAuthorization = await readMatchAuthorizationMatrix(tournamentId, { env: process.env });
    if (!matchAuthorization.payload?.ok) throw Object.assign(
      new Error("The current match authorization scope is unavailable."),
      { code: matchAuthorization.payload?.code || "CURRENT_MATCH_AUTHORIZATION_SCOPE_UNAVAILABLE", status: 503 },
    );
    const data = productionLiveMatchAdminDataFromSupabaseView(current.payload.data, matchAuthorization.payload);
    const scoringAuthorityContract = await currentScoringMutationAuthorityContract({ request });
    return NextResponse.json({ data: {
      ...data,
      scoringAuthorityContract,
      matches: data.matches.map((match) => Object.fromEntries(
        Object.entries(match).filter(([key]) => !["Access Code Hash", "Access Token Hash"].includes(key))
      )),
    } });
  } catch (error) {
    recordOperationalError(error);
    console.error("Live Match Control load failed", { sheet: "Live Matches", reason: error?.message || String(error), stack: error?.stack });
    return NextResponse.json({ error: error?.message || "Unable to load live matches." }, { status: 500 });
  }
}

async function telemetryPOST(request) {
  let authority;
  try { authority = requireScoringAuthority(); }
  catch (error) {
    recordOperationalError(error); return NextResponse.json({ error: error.message, code: error.code }, { status: Number(error.status || 503) }); }
  const authorization = await authorized(request, authority);
  if (authorization?.status !== "active") return deny();
  try {
    const { action, matchId, updates, updatedBy, operationRequestId, scoringAuthorityContract,
      expectedMatchRevision, expectedPermissionRevision } = await request.json();
    const mutationAuthority = assertDirectorMutationAuthority({ surface: "live-matches", action, authority: authority.resolved });
    await assertScoringMutationAuthorityContractBeforeDispatch(scoringAuthorityContract, { request });
    if (mutationAuthority.resolvedAuthority === "supabase") {
      if (!matchId || !mutationAuthority.canonicalLifecycleAction) {
        const error = new Error("A canonical match control action and Match ID are required.");
        error.code = "DIRECTOR_CANONICAL_LIFECYCLE_INPUT_REQUIRED";
        error.status = 400;
        throw error;
      }
      const lifecycle = await persistDirectorMatchLifecycle({
        action: mutationAuthority.canonicalLifecycleAction,
        matchId,
        updatedBy: authorization.identity?.actor?.name || updatedBy,
        authUserId: authorization.identity?.authUserId,
        playerId: authorization.identity?.actor?.id,
        operationRequestId,
        expectedMatchRevision,
        expectedPermissionRevision,
      });
      if (!lifecycle.delegated) throw Object.assign(
        new Error("The canonical Supabase match-control transaction was not selected."),
        { code: "SUPABASE_CANONICAL_LIFECYCLE_REQUIRED", status: 503 },
      );
      // Keep legacy response metadata explicit without requiring a retired sink.
      const mirror = { delivered: 0, failed: 0, pending: false, retired: true };
      refreshMatchData();
      if (["finalize", "reopen"].includes(mutationAuthority.canonicalLifecycleAction)) after(async () => {
        const [derived, intelligence, calcutta] = await Promise.allSettled([
          recalculateCompetitionDerivedTournament("", {
            calculatedBy: `Director lifecycle worker · ${authorization.identity?.actor?.name || updatedBy || "Director"}`,
          }),
          recalculateIntelligenceDerivedTournament("", {
            calculatedBy: `Director lifecycle intelligence worker · ${authorization.identity?.actor?.name || updatedBy || "Director"}`,
          }),
          recalculateCalcuttaAfterCanonicalMutation(lifecycle.tournamentId, {
            calculatedBy: `Director lifecycle Calcutta worker · ${authorization.identity?.actor?.name || updatedBy || "Director"}`,
            mutationKey: operationRequestId,
            matchId,
          }),
        ]);
        for (const [domain, result] of [["competition", derived], ["intelligence", intelligence], ["calcutta", calcutta]]) {
          if (result.status === "rejected") console.error("Director lifecycle follow-up remains pending", {
            action, matchId, domain, code: result.reason?.code || "DIRECTOR_LIFECYCLE_FOLLOW_UP_FAILED",
          });
        }
      });
      return NextResponse.json({
        data: { match: lifecycle.result },
        transaction: { authority: "supabase", mirror: {
          delivered: mirror.delivered, failed: mirror.failed, pending: false, retired: true,
        } },
      });
    }
    return NextResponse.json({ ok: false, code: "GOOGLE_MATCH_RUNTIME_RETIRED" },
      { status: 410, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    recordOperationalError(error);
    console.error("Live Match Control action failed", { sheet: "Live Matches / Matches / Match Update Log", reason: error?.message || String(error), stack: error?.stack });
    const authorityFailure = error?.code === "OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY" || error?.code === "SCORING_AUTHORITY_UNAVAILABLE";
    return NextResponse.json({
      error: authorityFailure ? error.message : directorTransactionError(error, "The match update could not be completed. Please try again."),
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.authorityDiagnostics ? { authority: error.authorityDiagnostics } : {}),
    }, { status: Number(error?.status || 400) });
  }
}

export const GET = withOperationalRoute({ route: "/api/live-matches", domain: "TOURNAMENT_READ" }, telemetryGET);

export const POST = withOperationalRoute({ route: "/api/live-matches", domain: "TOURNAMENT_READ" }, telemetryPOST);
