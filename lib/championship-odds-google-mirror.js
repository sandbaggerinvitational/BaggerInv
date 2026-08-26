import {
  claimSupabaseOddsGoogleMirror,
  completeSupabaseOddsGoogleMirror,
} from "./championship-odds-supabase.js";
import {
  publishOddsSnapshot,
  verifyPublishedOddsSnapshot,
} from "./google-sheets-write.js";
import { PUBLISHED_ODDS_WORKBOOK_TABS } from "./published-odds-supabase.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";
import {
  PRODUCTION_CANONICAL_ORIGIN,
  PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_VERCEL_PROJECT_NAME,
} from "./production-cutover-activation-contract.js";

const clean = (value) => String(value ?? "").trim();

function productionGoogleResources() {
  return {
    supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
    googleWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournamentId: PRODUCTION_TOURNAMENT_ID,
    tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
    vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
    vercelProjectName: PRODUCTION_VERCEL_PROJECT_NAME,
    canonicalHostname: new URL(PRODUCTION_CANONICAL_ORIGIN).hostname,
  };
}

async function withOddsGoogleMirrorCredential(callback, env = process.env) {
  if (clean(env.VERCEL_ENV).toLowerCase() !== "production") return callback();
  const { withProductionGoogleServiceAccountCredentials } =
    await import("./production-google-service-account-server.js");
  return withProductionGoogleServiceAccountCredentials({
    env,
    operation: "ODDS_GOOGLE_MIRROR",
    resources: productionGoogleResources(),
  }, callback);
}

export async function deliverSupabaseOddsGoogleMirror({ snapshotId, actorId } = {}) {
  const claim = await claimSupabaseOddsGoogleMirror({
    environment: "PREVIEW",
    snapshot_id: clean(snapshotId),
    actor_id: clean(actorId || "Director Odds publication"),
  });
  if (!claim.payload?.ok) {
    throw Object.assign(new Error("The Google Odds reporting mirror could not be claimed."), {
      code: claim.payload?.code || "ODDS_GOOGLE_MIRROR_CLAIM_FAILED",
    });
  }
  if (claim.payload.deliver !== true) {
    return { ok: true, delivered: false, duplicate: claim.payload.duplicate === true, claim: claim.payload };
  }

  const snapshot = claim.payload.published_payload;
  try {
    const verification = await withOddsGoogleMirrorCredential(async () => {
      await publishOddsSnapshot(snapshot);
      return verifyPublishedOddsSnapshot(snapshot);
    });
    const fingerprint = scoringShadowPayloadHash({ verification, snapshot });
    const completion = await completeSupabaseOddsGoogleMirror({
      environment: "PREVIEW",
      snapshot_id: claim.payload.snapshot_id,
      actor_id: clean(actorId || "Director Odds publication"),
      status: "SUCCEEDED",
      google_publication_fingerprint: fingerprint,
      google_publication_reference: { sheets: PUBLISHED_ODDS_WORKBOOK_TABS, verification },
    });
    if (!completion.payload?.ok) throw Object.assign(new Error("The verified Google Odds mirror checkpoint could not be completed."), {
      code: completion.payload?.code || "ODDS_GOOGLE_MIRROR_COMPLETION_FAILED",
    });
    return { ok: true, delivered: true, duplicate: false, claim: claim.payload,
      completion: completion.payload, snapshot, verification, fingerprint };
  } catch (error) {
    const completion = await completeSupabaseOddsGoogleMirror({
      environment: "PREVIEW",
      snapshot_id: claim.payload.snapshot_id,
      actor_id: clean(actorId || "Director Odds publication"),
      status: "FAILED",
      error_safe: "Google reporting mirror is delayed.",
    }).catch(() => null);
    return { ok: false, delivered: false, delayed: true, retryable: true, claim: claim.payload,
      completion: completion?.payload || null, code: error?.code || "ODDS_GOOGLE_MIRROR_FAILED" };
  }
}
