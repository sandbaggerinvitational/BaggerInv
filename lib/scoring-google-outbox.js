import { randomUUID } from "node:crypto";
import {
  finalizeLiveMatch,
  mirrorCanonicalLiveMatchControl,
  normalizeLegacyReopenedMatch,
  readWorkbookSheetsByName,
  reopenLiveMatch,
  saveLiveHoleScore,
  withWorkbookWriteDiagnostics,
} from "./google-sheets-write.js";
import { canonicalAuthorityFingerprint, claimGoogleOutbox, claimGoogleOutboxEvent, completeGoogleOutbox, failGoogleOutbox } from "./scoring-authority-supabase.js";
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
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => /^(true|yes|1|locked)$/i.test(clean(value));
const retrySeconds = (attempts) => Math.min(300, Math.max(1, 2 ** Math.min(number(attempts), 8)));
const CONTROL_EVENT_TYPES = new Set([
  "MATCH_MARKED_LIVE", "SCORING_LOCKED", "SCORING_UNLOCKED",
  "SCORING_ACCESS_ACTIVATED", "SCORING_ACCESS_REVOKED",
]);
const OFFICIAL_ARCHIVE_RESULT_FIELDS = [
  "Matchup Winner", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner",
  "Team 1 Points", "Team 2 Points", "Final Result", "Winner",
];
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
    attempts: number(event.attempts),
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
    status: clean(payload.status),
    scoringLocked: event.event_type === "MATCH_FINALIZED" ? true
      : event.event_type === "MATCH_REOPENED" ? false
      : typeof payload.scoring_locked === "boolean" ? payload.scoring_locked : null,
    accessActive: event.event_type === "MATCH_FINALIZED" ? false
      : event.event_type === "MATCH_REOPENED" ? true
      : typeof payload.access_active === "boolean" ? payload.access_active : null,
  };
}

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

async function withGoogleOutboxCredential(env, dependencies, callback) {
  if (clean(env?.VERCEL_ENV).toLowerCase() !== "production") return callback();
  const scope = dependencies.withProductionGoogleServiceAccountCredentials ||
    (await import("./production-google-service-account-server.js")).withProductionGoogleServiceAccountCredentials;
  return scope({
    env,
    operation: "SCORING_GOOGLE_OUTBOX",
    resources: productionGoogleResources(),
  }, callback);
}

const sheetRows = (sheet) => (sheet?.records || []).map(({ record }) => record);
const archiveResultInactive = (summary = {}) => !clean(summary["Completed At"])
  && !clean(summary["Finalized At"]) && !clean(summary["Finalized By"])
  && OFFICIAL_ARCHIVE_RESULT_FIELDS.every((field) => !clean(summary[field]));

export function classifyGoogleReopenMirror(input, sheets = {}) {
  const match = sheetRows(sheets["Live Matches"]).find((row) => clean(row["Match ID"]) === input.matchId);
  const summary = sheetRows(sheets.Matches).find((row) => clean(row["Match ID"]) === input.matchId);
  if (!match || !summary) return { classification: "MISSING_GOOGLE_MATCH", match, summary };
  const liveStatus = clean(match["Match Status"]);
  const archiveStatus = clean(summary["Match Status"]);
  const permissionMatches = number(match["Access Version"]) === input.permissionRevision;
  const alreadyDelivered = /^Reopened$/i.test(liveStatus) && /^Reopened$/i.test(archiveStatus)
    && archiveResultInactive(summary) && !truthy(match["Scoring Locked"])
    && truthy(match["Access Active"]) && permissionMatches;
  if (alreadyDelivered) return { classification: "ALREADY_DELIVERED", match, summary };
  if (/^Final$/i.test(liveStatus)) return { classification: "STANDARD_REOPEN", match, summary };
  if (/^(Live|Reopened)$/i.test(liveStatus) && /^(Final|Finalized|Reopened)$/i.test(archiveStatus)) {
    return { classification: "LEGACY_REOPEN_CONFLICT", match, summary };
  }
  return { classification: "AMBIGUOUS_REOPEN_CONFLICT", match, summary };
}

async function deliverWithGoogleWriter(input, actor, dependencies = {}) {
  const save = dependencies.saveLiveHoleScore || saveLiveHoleScore;
  const finalize = dependencies.finalizeLiveMatch || finalizeLiveMatch;
  const reopen = dependencies.reopenLiveMatch || reopenLiveMatch;
  const control = dependencies.mirrorCanonicalLiveMatchControl || mirrorCanonicalLiveMatchControl;
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
  if (input.eventType === "MATCH_FINALIZED") {
    // A Google Finalize can succeed while the Supabase checkpoint completion
    // fails. On retry, verify the exact canonical lifecycle/result projection
    // before invoking the writer again; re-finalizing would otherwise advance
    // timestamps and repeat audit/derived-publication side effects.
    if (input.attempts > 1) {
      try {
        const verified = await verifyGoogleLifecycleMirror(input, dependencies);
        return { ...verified, idempotent: true, lifecycleVerified: true };
      } catch (error) {
        if (clean(error?.code) !== "GOOGLE_LIFECYCLE_VERIFICATION_FAILED") throw error;
      }
    }
    return finalize(input.matchId, {
      "Scoring Locked": true,
      "Access Active": false,
      "Access Version": input.permissionRevision,
    }, actor);
  }
  if (input.eventType === "MATCH_REOPENED") {
    try {
      return await reopen(input.matchId, actor, {
        "Scoring Locked": false,
        "Access Active": true,
        "Access Version": input.permissionRevision,
      });
    } catch (originalError) {
      const read = dependencies.readWorkbookSheetsByName || readWorkbookSheetsByName;
      const sheets = await read(["Live Matches", "Matches"], { fresh: true });
      const plan = classifyGoogleReopenMirror(input, sheets);
      if (plan.classification === "ALREADY_DELIVERED") {
        return { match: plan.match, summary: plan.summary, updatedAt: clean(plan.match["Updated At"]), idempotent: true };
      }
      if (plan.classification === "LEGACY_REOPEN_CONFLICT") {
        const normalize = dependencies.normalizeLegacyReopenedMatch || normalizeLegacyReopenedMatch;
        return normalize(input.matchId, {
          confirmIntent: true,
          expectedLiveUpdatedAt: clean(plan.match["Updated At"]),
          expectedArchiveFinalizedAt: clean(plan.summary["Finalized At"]),
          permissionRevision: input.permissionRevision,
        }, actor);
      }
      if (plan.classification === "STANDARD_REOPEN") throw originalError;
      throw Object.assign(new Error("The Google reopen mirror state is ambiguous and was not changed."), {
        code: "GOOGLE_REOPEN_MIRROR_AMBIGUOUS",
      });
    }
  }
  if (CONTROL_EVENT_TYPES.has(input.eventType)) {
    return control(input.matchId, {
      status: input.eventType === "MATCH_MARKED_LIVE" ? input.status || "LIVE" : undefined,
      scoringLocked: input.scoringLocked,
      accessActive: input.accessActive,
      accessVersion: input.permissionRevision,
      expectedUpdatedAt: input.expectedGoogleMatchUpdatedAt,
    }, actor);
  }
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
      : archiveResultInactive(summary));
  if (!liveVerified || !summaryVerified) throw Object.assign(new Error("Google lifecycle and finalized Matches summary did not verify all canonical mirror fields."), {
    code: "GOOGLE_LIFECYCLE_VERIFICATION_FAILED",
  });
  return { match, summary, updatedAt: clean(match["Updated At"]) };
}

export async function verifyGoogleControlMirror(input, dependencies = {}) {
  if (!CONTROL_EVENT_TYPES.has(input.eventType)) return null;
  const read = dependencies.readWorkbookSheetsByName || readWorkbookSheetsByName;
  const sheets = await read(["Live Matches"], { fresh: true });
  const match = sheetRows(sheets["Live Matches"])
    .find((row) => clean(row["Match ID"]) === input.matchId);
  const statusVerified = input.eventType !== "MATCH_MARKED_LIVE" ||
    clean(match?.["Match Status"]).toLowerCase() === "live";
  const lockVerified = input.scoringLocked == null || truthy(match?.["Scoring Locked"]) === input.scoringLocked;
  const accessVerified = input.accessActive == null || truthy(match?.["Access Active"]) === input.accessActive;
  const permissionVerified = !input.permissionRevision ||
    number(match?.["Access Version"]) === input.permissionRevision;
  if (!match || !statusVerified || !lockVerified || !accessVerified || !permissionVerified) {
    throw Object.assign(new Error("The Google control mirror did not verify the canonical Supabase projection."), {
      code: "GOOGLE_CONTROL_VERIFICATION_FAILED",
    });
  }
  return { match, updatedAt: clean(match["Updated At"]) };
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

export async function processNextGoogleOutboxEvent({ workerId = `preview-${randomUUID()}`, actor = "Supabase Google mirror", expectedEventId = "", env = process.env, dependencies = {} } = {}) {
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const claim = clean(expectedEventId)
    ? await (dependencies.claimGoogleOutboxEvent || claimGoogleOutboxEvent)({
      environment: production ? "PRODUCTION" : "PREVIEW", director_authorized: true, event_id: clean(expectedEventId),
      worker_id: workerId, lease_seconds: 45,
    }, { env })
    : await (dependencies.claimGoogleOutbox || claimGoogleOutbox)(workerId, { leaseSeconds: 45, env });
  const event = claim.payload?.event;
  if (!event) return { ok: true, empty: true };
  const input = googleOutboxDeliveryInput(event, claim.payload?.checkpoint || {});
  const startedAt = Date.now();
  let stage = "google-writer";
  try {
    const measured = await withGoogleOutboxCredential(env, dependencies, () =>
      (dependencies.measure || withWorkbookWriteDiagnostics)("supabase-google-outbox", async () => {
        stage = "google-writer";
        const result = await deliverWithGoogleWriter(input, actor, dependencies);
        if (["MATCH_FINALIZED", "MATCH_REOPENED"].includes(input.eventType) && !result?.lifecycleVerified) {
          stage = "google-verification";
          return verifyGoogleLifecycleMirror(input, dependencies);
        }
        if (CONTROL_EVENT_TYPES.has(input.eventType)) {
          stage = "google-verification";
          return verifyGoogleControlMirror(input, dependencies);
        }
        return result;
      }));
    const delivery = verifiedDelivery(event, input, measured.result);
    delivery.worker_id = workerId;
    stage = "checkpoint";
    const completion = await (dependencies.completeGoogleOutbox || completeGoogleOutbox)(delivery, { env });
    if (!completion.payload?.ok) throw Object.assign(new Error(`Checkpoint update failed: ${completion.payload?.code || "unknown"}.`), { code: completion.payload?.code });
    return {
      ok: true,
      empty: false,
      eventId: event.id,
      eventType: input.eventType,
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
      worker_id: workerId,
      error_code: clean(error?.code || error?.status || "GOOGLE_DELIVERY_FAILED"),
      error_safe: "Google mirror delivery did not verify and will retry.",
      retry_after_seconds: retrySeconds(event.attempts),
    }, { env }).catch(() => {});
    return {
      ok: false,
      empty: false,
      eventId: event.id,
      eventType: input.eventType,
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
