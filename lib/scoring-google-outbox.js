import { randomUUID } from "node:crypto";
import { finalizeLiveMatch, readWorkbookSheetsByName, reopenLiveMatch, saveLiveHoleScore, withWorkbookWriteDiagnostics } from "./google-sheets-write.js";
import { canonicalAuthorityFingerprint, claimGoogleOutbox, completeGoogleOutbox, failGoogleOutbox } from "./scoring-authority-supabase.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const retrySeconds = (attempts) => Math.min(300, Math.max(1, 2 ** Math.min(number(attempts), 8)));
const googleTimestamp = (value) => {
  const raw = clean(value);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw;
};

export function googleOutboxDeliveryInput(event, checkpoint) {
  const payload = event?.payload || {};
  const matchId = clean(payload.google_target_match_id || event.match_id);
  const holeNumber = number(event.hole_number || payload.hole_number);
  const holeRevisions = checkpoint?.google_hole_revisions || {};
  return {
    eventId: event.id,
    eventType: event.event_type,
    matchId,
    matchRevision: number(event.match_revision),
    holeNumber,
    holeRevision: number(event.hole_revision),
    mutationKey: clean(event.mutation_key),
    team1GrossScores: payload.gross?.team_1 || [],
    team2GrossScores: payload.gross?.team_2 || [],
    expectedGoogleHoleRevision: number(holeRevisions[String(holeNumber)]),
    expectedGoogleMatchUpdatedAt: googleTimestamp(checkpoint?.google_match_updated_at),
  };
}

async function deliverWithGoogleWriter(input, actor, dependencies = {}) {
  const save = dependencies.saveLiveHoleScore || saveLiveHoleScore;
  const finalize = dependencies.finalizeLiveMatch || finalizeLiveMatch;
  const reopen = dependencies.reopenLiveMatch || reopenLiveMatch;
  if (input.eventType === "HOLE_SCORE_UPSERTED") {
    return save(input.matchId, {
      holeNumber: input.holeNumber,
      team1GrossScores: input.team1GrossScores,
      team2GrossScores: input.team2GrossScores,
      expectedRevision: input.expectedGoogleHoleRevision,
      expectedUpdatedAt: input.expectedGoogleMatchUpdatedAt,
      clientMutationId: `supabase-outbox:${input.mutationKey}`,
    }, actor);
  }
  if (input.eventType === "MATCH_FINALIZED") return finalize(input.matchId, {}, actor);
  if (input.eventType === "MATCH_REOPENED") return reopen(input.matchId, actor);
  throw new Error(`Unsupported Google outbox event: ${input.eventType}.`);
}

function verifiedDelivery(event, input, result) {
  const hole = result?.hole || null;
  const match = result?.match || result?._shadow?.match || result || {};
  const googleMatchUpdatedAt = clean(result?.updatedAt || match["Updated At"] || hole?.["Updated At"]);
  const googleHoleRevision = number(hole?.Revision || input.expectedGoogleHoleRevision);
  const googleMatchRevision = number(match.Revision);
  return {
    event_id: event.id,
    google_match_updated_at: googleMatchUpdatedAt,
    google_match_revision: googleMatchRevision,
    google_hole_revision: googleHoleRevision,
    verified_fingerprint: canonicalAuthorityFingerprint({
      match_id: input.matchId,
      match_revision: event.match_revision,
      hole_number: input.holeNumber || null,
      hole_revision: googleHoleRevision,
      google_match_updated_at: googleMatchUpdatedAt,
      event_type: input.eventType,
    }),
  };
}

export async function processNextGoogleOutboxEvent({ workerId = `preview-${randomUUID()}`, actor = "Supabase Google mirror", dependencies = {} } = {}) {
  const claim = await (dependencies.claimGoogleOutbox || claimGoogleOutbox)(workerId, { leaseSeconds: 45 });
  const event = claim.payload?.event;
  if (!event) return { ok: true, empty: true };
  const input = googleOutboxDeliveryInput(event, claim.payload?.checkpoint || {});
  const startedAt = Date.now();
  let stage = "google-writer";
  try {
    const measured = await (dependencies.measure || withWorkbookWriteDiagnostics)("supabase-google-outbox", () => deliverWithGoogleWriter(input, actor, dependencies));
    const delivery = verifiedDelivery(event, input, measured.result);
    stage = "checkpoint";
    const completion = await (dependencies.completeGoogleOutbox || completeGoogleOutbox)(delivery);
    if (!completion.payload?.ok) throw Object.assign(new Error(`Checkpoint update failed: ${completion.payload?.code || "unknown"}.`), { code: completion.payload?.code });
    return {
      ok: true,
      empty: false,
      eventId: event.id,
      matchId: input.matchId,
      matchRevision: input.matchRevision,
      attempts: event.attempts,
      googleDurationMs: Date.now() - startedAt,
      googleDiagnostics: measured.diagnostics || {},
      checkpoint: completion.payload.checkpoint,
    };
  } catch (error) {
    await (dependencies.failGoogleOutbox || failGoogleOutbox)({
      event_id: event.id,
      error_code: clean(error?.code || error?.status || "GOOGLE_DELIVERY_FAILED"),
      error_safe: "Google mirror delivery did not verify and will retry.",
      retry_after_seconds: retrySeconds(event.attempts),
    }).catch(() => {});
    return {
      ok: false,
      empty: false,
      eventId: event.id,
      matchId: input.matchId,
      matchRevision: input.matchRevision,
      attempts: event.attempts,
      durationMs: Date.now() - startedAt,
      errorCode: clean(error?.code || error?.status || "GOOGLE_DELIVERY_FAILED"),
      errorStage: stage,
      errorMessage: clean(error?.message || "Google mirror delivery did not verify."),
    };
  }
}

export async function drainGoogleOutbox({ maximum = 100, stopOnFailure = true, ...options } = {}) {
  const startedAt = Date.now();
  const deliveries = [];
  for (let index = 0; index < Math.max(1, Math.min(number(maximum, 100), 500)); index += 1) {
    const delivery = await processNextGoogleOutboxEvent(options);
    if (delivery.empty) break;
    deliveries.push(delivery);
    if (!delivery.ok && stopOnFailure) break;
  }
  return {
    ok: deliveries.every((item) => item.ok),
    delivered: deliveries.filter((item) => item.ok).length,
    failed: deliveries.filter((item) => !item.ok).length,
    deliveries,
    durationMs: Date.now() - startedAt,
  };
}

export async function inspectGoogleMatchState(matchId) {
  const sheets = await readWorkbookSheetsByName(["Live Matches", "Live Hole Scores"]);
  const match = sheets["Live Matches"].records.map(({ record }) => record).find((row) => clean(row["Match ID"]) === clean(matchId));
  const holes = sheets["Live Hole Scores"].records.map(({ record }) => record).filter((row) => clean(row["Match ID"]) === clean(matchId));
  return { match, holes };
}
