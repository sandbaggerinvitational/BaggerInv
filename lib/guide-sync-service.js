import { googleErrorCategory } from "./google-api-reliability.js";
import { assertGuideSyncEnvironment, PREVIEW_GUIDE_TOURNAMENT_ID } from "./guide-read-source.js";
import {
  claimGuideSync,
  failGuideSync,
  publishGuideProjection,
  readGuideSourceContext,
} from "./guide-supabase.js";
import {
  buildGuideProjection,
  GUIDE_PROJECTION_SHEETS,
  GUIDE_PROJECTION_SCHEMA_VERSION,
  GuideProjectionValidationError,
} from "./tournament-guide-projection.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const TRIGGERS = new Set(["INITIAL", "SCHEDULED", "MANUAL"]);

function requireRpc(result, fallbackCode) {
  if (result?.payload?.ok) return result.payload;
  const error = new Error("Guide synchronization dependency is unavailable.");
  error.code = clean(result?.payload?.code || fallbackCode);
  error.status = Number(result?.status || 503);
  throw error;
}

function sheetRecords(sheets) {
  return Object.fromEntries(GUIDE_PROJECTION_SHEETS.map((name) => [
    name,
    (sheets?.[name]?.records || []).map((row) => row?.record || row).filter(Boolean),
  ]));
}

function courseContext(context = {}) {
  const rounds = Array.isArray(context.rounds) ? context.rounds : [];
  const firstRound = rounds[0] || {};
  const holes = Array.isArray(context.holes) ? context.holes : [];
  const yardages = holes.map((hole) => number(hole.yardage)).filter((yardage) => yardage > 0);
  return {
    courseId: clean(context.course_id || context.courseId),
    round: number(context.round_number || context.round || firstRound.round_number || firstRound.round),
    format: clean(context.format || firstRound.format),
    tee: clean(context.tee),
    rating: context.rating ?? "",
    slope: context.slope ?? "",
    par: context.par ?? (holes.length ? holes.reduce((sum, hole) => sum + number(hole.par), 0) : ""),
    yardage: yardages.length === holes.length && holes.length ? yardages.reduce((sum, yardage) => sum + yardage, 0) : "",
    configurationConsistent: context.configuration_consistent !== false,
    rounds: rounds.map((round) => ({
      round_number: number(round.round_number || round.round),
      name: clean(round.name),
      format: clean(round.format),
      status: clean(round.status),
    })),
    holes,
  };
}

function sourceData(payload = {}) {
  const data = payload.data || payload;
  const tournament = data.tournament || {};
  return {
    tournament: {
      id: clean(tournament.tournament_id || tournament.id),
      year: number(tournament.tournament_year || tournament.year),
      name: clean(tournament.name),
      dates: clean(tournament.dates),
      location: clean(tournament.location),
      timeZone: clean(tournament.time_zone || tournament.timeZone),
      logoFileName: clean(tournament.logo_filename || tournament.logoFileName),
    },
    courses: (data.course_context || data.courses || []).map(courseContext),
    queryMs: number(data.query_ms),
  };
}

function failureDetails(error) {
  if (error instanceof GuideProjectionValidationError || error?.code === "GUIDE_PROJECTION_INVALID") {
    return { category: "VALIDATION", validationStatus: "INVALID", safe: "Google Guide content did not pass publication validation." };
  }
  if (/^(?:PREVIEW_GUIDE|GUIDE_|SCORING_SHADOW|SUPABASE)/.test(clean(error?.code))) {
    return { category: "SUPABASE_SERVICE", validationStatus: "NOT_RUN", safe: "The Guide projection service is temporarily unavailable." };
  }
  const googleCategory = googleErrorCategory(error);
  if (googleCategory === "rate_limit") return { category: "GOOGLE_429", validationStatus: "NOT_RUN", safe: "Google temporarily rate-limited the Guide refresh." };
  if (googleCategory === "upstream") return { category: "GOOGLE_5XX", validationStatus: "NOT_RUN", safe: "Google Guide content is temporarily unavailable." };
  if (googleCategory === "timeout") return { category: "GOOGLE_TIMEOUT", validationStatus: "NOT_RUN", safe: "The Google Guide refresh timed out." };
  if (googleCategory === "permission") return { category: "GOOGLE_PERMISSION", validationStatus: "NOT_RUN", safe: "The Guide source could not be read with the configured service access." };
  return { category: "GUIDE_SYNC_FAILED", validationStatus: "NOT_RUN", safe: "Guide synchronization did not complete." };
}

async function defaultGoogleRead() {
  const { readWorkbookSheetsByName, withWorkbookWriteDiagnostics } = await import("./google-sheets-write.js");
  return withWorkbookWriteDiagnostics("preview-guide-content-sync", () =>
    readWorkbookSheetsByName(GUIDE_PROJECTION_SHEETS, { fresh: true })
  );
}

export async function synchronizeGuideContent({
  triggerType = "SCHEDULED",
  requestedBy = "preview-guide-scheduler",
  env = process.env,
  dependencies = {},
} = {}) {
  const trigger = clean(triggerType).toUpperCase();
  if (!TRIGGERS.has(trigger)) {
    const error = new Error("A recognized Guide synchronization trigger is required.");
    error.code = "GUIDE_SYNC_TRIGGER_INVALID";
    error.status = 400;
    throw error;
  }
  const actor = clean(requestedBy);
  if (!actor) {
    const error = new Error("A Guide synchronization actor is required.");
    error.code = "GUIDE_SYNC_ACTOR_REQUIRED";
    error.status = 400;
    throw error;
  }
  const gate = assertGuideSyncEnvironment({ env, triggerType: trigger });
  const rpcOptions = { env };
  const claimFn = dependencies.claimGuideSync || claimGuideSync;
  const contextFn = dependencies.readGuideSourceContext || readGuideSourceContext;
  const publishFn = dependencies.publishGuideProjection || publishGuideProjection;
  const failFn = dependencies.failGuideSync || failGuideSync;
  const projectionFn = dependencies.buildGuideProjection || buildGuideProjection;
  const googleRead = dependencies.readGoogleSheets || defaultGoogleRead;
  const startedAt = Date.now();
  const claim = requireRpc(await claimFn({ triggerType: trigger, requestedBy: actor }, rpcOptions), "GUIDE_SYNC_CLAIM_FAILED");
  const claimToken = clean(claim.claim_token);
  let sourceFingerprint = "";
  let changed;

  try {
    const canonicalRead = requireRpc(await contextFn(rpcOptions), "GUIDE_SOURCE_CONTEXT_UNAVAILABLE");
    const canonical = sourceData(canonicalRead);
    if (canonical.tournament.id !== PREVIEW_GUIDE_TOURNAMENT_ID || canonical.tournament.year !== 2026 || !canonical.courses.length ||
        canonical.courses.some((course) => course.configurationConsistent === false)) {
      const error = new Error("The approved canonical Guide source context is unavailable.");
      error.code = "PREVIEW_GUIDE_SOURCE_CONTEXT_INVALID";
      throw error;
    }

    // The Google implementation is imported only after all Preview, workbook,
    // project, tournament, credential and claim gates have passed.
    const googleStartedAt = performance.now();
    const google = await googleRead({ sheets: GUIDE_PROJECTION_SHEETS, fresh: true, env });
    const googleReadMs = performance.now() - googleStartedAt;
    const googleSheets = google?.result || google;
    const projection = projectionFn({
      sheets: sheetRecords(googleSheets),
      tournament: canonical.tournament,
      approvedTournamentId: PREVIEW_GUIDE_TOURNAMENT_ID,
      canonicalCourseContext: canonical.courses,
    });
    sourceFingerprint = projection.sourceFingerprint;
    changed = clean(claim.current_content_fingerprint) !== projection.contentFingerprint;
    const sourceMetadata = {
      schemaVersion: GUIDE_PROJECTION_SCHEMA_VERSION,
      sourceCounts: projection.sourceCounts,
      googleRequests: number(google?.diagnostics?.sheetsApiCalls),
      googleHttpRequests: number(google?.diagnostics?.httpRequests),
      googleRetries: number(google?.diagnostics?.retryLoops),
      googleReadMs,
      canonicalReadMs: canonical.queryMs,
      serviceDurationMs: Date.now() - startedAt,
    };
    const published = requireRpc(await publishFn({
      claimToken,
      contentFingerprint: projection.contentFingerprint,
      sourceFingerprint: projection.sourceFingerprint,
      payloadHash: projection.payloadHash,
      contentPayload: JSON.parse(projection.payloadCanonicalJson),
      sourceCanonicalJson: projection.sourceCanonicalJson,
      contentCanonicalJson: projection.contentCanonicalJson,
      payloadCanonicalJson: projection.payloadCanonicalJson,
      sourceMetadata,
    }, rpcOptions), "GUIDE_PROJECTION_PUBLICATION_FAILED");
    return {
      ok: true,
      triggerType: trigger,
      changed: published.changed === true,
      noOp: published.no_op === true,
      projectionRevision: number(published.projection_revision),
      publicationSequence: number(published.publication_sequence),
      contentFingerprint: clean(published.content_fingerprint || projection.contentFingerprint),
      lastKnownGoodPreserved: true,
      diagnostics: sourceMetadata,
    };
  } catch (error) {
    sourceFingerprint = sourceFingerprint || clean(error?.sourceFingerprint);
    const failure = failureDetails(error);
    await failFn({
      claimToken,
      validationStatus: failure.validationStatus,
      failureCategory: failure.category,
      failureSafe: failure.safe,
      sourceFingerprint,
      changed,
      auditMetadata: {
        schemaVersion: GUIDE_PROJECTION_SCHEMA_VERSION,
        serviceDurationMs: Date.now() - startedAt,
        validationIssueCount: Array.isArray(error?.issues) ? error.issues.length : 0,
      },
    }, rpcOptions).catch(() => null);
    return {
      ok: false,
      code: "GUIDE_SYNC_FAILED",
      failureCategory: failure.category,
      message: failure.safe,
      validationIssueCount: Array.isArray(error?.issues) ? error.issues.length : 0,
      lastKnownGoodPreserved: true,
      durationMs: Date.now() - startedAt,
      gate: gate.reason,
    };
  }
}
