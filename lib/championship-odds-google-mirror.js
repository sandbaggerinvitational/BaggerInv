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

const clean = (value) => String(value ?? "").trim();

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
    await publishOddsSnapshot(snapshot);
    const verification = await verifyPublishedOddsSnapshot(snapshot);
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
