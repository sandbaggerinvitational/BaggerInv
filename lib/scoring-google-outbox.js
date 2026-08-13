import { randomUUID } from "node:crypto";
import { finalizeLiveMatch, readWorkbookSheetsByName, reopenLiveMatch, saveLiveHoleScore, withWorkbookWriteDiagnostics } from "./google-sheets-write.js";
import { canonicalAuthorityFingerprint, claimGoogleOutbox, completeGoogleOutbox, failGoogleOutbox } from "./scoring-authority-supabase.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => /^(true|yes|1|locked)$/i.test(clean(value));
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
    permissionRevision: number(payload.permission_revision),
    resultWinner: clean(payload.result_winner),
    scorecardComplete: Boolean(payload.scorecard_complete),
    scoringLocked: event.event_type === "MATCH_FINALIZED" ? true : event.event_type === "MATCH_REOPENED" ? false : null,
    accessActive: event.event_type === "MATCH_FINALIZED" ? false : event.event_type === "MATCH_REOPENED" ? true : null,
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
  if (input.eventType === "MATCH_FINALIZED") return finalize(input.matchId, {
    "Scoring Locked": true,
    "Access Active": false,
    "Access Version": input.permissionRevision,
  }, actor);
  if (input.eventType === "MATCH_REOPENED") return reopen(input.matchId, actor, {
    "Scoring Locked": false,
    "Access Active": true,
    "Access Version": input.permissionRevision,
  });
  throw new Error(`Unsupported Google outbox event: ${input.eventType}.`);
}

export async function verifyGoogleLifecycleMirror(input, dependencies = {}) {
  if (!["MATCH_FINALIZED", "MATCH_REOPENED"].includes(input.eventType)) return null;
  if (!input.permissionRevision) throw Object.assign(new Error("Google lifecycle mirror is missing a permission revision."), { code: "GOOGLE_LIFECYCLE_PAYLOAD_INVALID" });
  const read = dependencies.readWorkbookSheetsByName || readWorkbookSheetsByName;
  const sheets = await read(["Live Matches", "Matches"], { fresh: true });
  const match = sheets["Live Matches"]?.records?.map(({ record }) => record)
    .find((row) => clean(row["Match ID"]) === input.matchId);
  const summary = sheets.Matches?.records?.map(({ record }) => record)
    .find((row) => clean(row["Match ID"]) === input.matchId);
  const expectedStatus = input.eventType === "MATCH_FINALIZED" ? "Final" : "Reopened";
  const liveVerified = match && clean(match["Match Status"]).toLowerCase() === expectedStatus.toLowerCase()
    && truthy(match["Scoring Locked"]) === input.scoringLocked
    && truthy(match["Access Active"]) === input.accessActive
    && number(match["Access Version"]) === input.permissionRevision;
  const finalSummary = input.eventType === "MATCH_FINALIZED";
  const summaryWinner = clean(summary?.["Matchup Winner"] || summary?.Winner || summary?.["18-Hole Winner"]);
  const requiredParticipantFields = clean(summary?.Format).toUpperCase() === "SI"
    ? ["Team 1 Player 1", "Team 2 Player 1"]
    : ["Team 1 Player 1", "Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2"];
  const summaryVerified = summary && clean(summary["Match Status"]).toLowerCase() === expectedStatus.toLowerCase()
    && (finalSummary
      ? Boolean(clean(summary["Finalized At"])) && Boolean(clean(summary["Finalized By"]))
        && Boolean(clean(summary["Completed At"])) && Boolean(clean(summary["Final Result"]))
        && Boolean(clean(summary.Year)) && Boolean(clean(summary.Round)) && Boolean(clean(summary.Match || summary["Match Number"]))
        && ["BB", "SC", "SI"].includes(clean(summary.Format).toUpperCase())
        && Boolean(clean(summary["Course ID"]))
        && requiredParticipantFields.every((field) => Boolean(clean(summary[field])))
        && (!input.resultWinner || summaryWinner.toLowerCase() === input.resultWinner.toLowerCase())
      : !clean(summary["Finalized At"]) && !clean(summary["Finalized By"])
        && !clean(summary["Final Result"]) && !clean(summary.Winner) && !clean(summary["Matchup Winner"]));
  if (!liveVerified || !summaryVerified) throw Object.assign(new Error("Google lifecycle and finalized Matches summary did not verify all canonical mirror fields."), {
    code: "GOOGLE_LIFECYCLE_VERIFICATION_FAILED",
  });
  return { match, summary, updatedAt: clean(match["Updated At"]) };
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
    const measured = await (dependencies.measure || withWorkbookWriteDiagnostics)("supabase-google-outbox", async () => {
      stage = "google-writer";
      const result = await deliverWithGoogleWriter(input, actor, dependencies);
      if (!["MATCH_FINALIZED", "MATCH_REOPENED"].includes(input.eventType)) return result;
      stage = "google-verification";
      return verifyGoogleLifecycleMirror(input, dependencies);
    });
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
