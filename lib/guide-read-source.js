import { timingSafeEqual } from "node:crypto";

import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

export const PREVIEW_GUIDE_TOURNAMENT_ID = "2026";
export const PREVIEW_GUIDE_TOURNAMENT_YEAR = 2026;
export const PREVIEW_GUIDE_SUPABASE_PROJECT_REF = "idgigvjjqkfbqjeredpb";
export const PREVIEW_GUIDE_SYNC_WORKER_ENDPOINT =
  "https://bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app/api/cron/guide-sync";

function configuredWorkbookId(env) {
  return clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
}

function configuredProjectRef(env) {
  const configured = clean(env.SUPABASE_SCORING_MIRROR_URL);
  if (!configured) return "";
  try {
    return new URL(configured).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

function normalizedSource(value) {
  const source = clean(value || "google").toLowerCase();
  return ["google", "supabase"].includes(source) ? source : "invalid";
}

function guideRuntime(env = process.env) {
  const previewDeployment = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = configuredWorkbookId(env);
  // PREVIEW_SCORING_SHEET_ID is retained as an optional explicit assertion.
  // Existing Preview deployments already prove isolation with a non-Production
  // GOOGLE_SHEETS_ID, so absence of the redundant assertion must not block the
  // Guide cutover.
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!previewWorkbookId || workbookId === previewWorkbookId);
  const projectRef = configuredProjectRef(env);
  const approvedProject = projectRef === PREVIEW_GUIDE_SUPABASE_PROJECT_REF;
  const approvedTournament = clean(env.GUIDE_SYNC_TOURNAMENT_ID || env.GUIDE_TOURNAMENT_ID || PREVIEW_GUIDE_TOURNAMENT_ID) === PREVIEW_GUIDE_TOURNAMENT_ID;
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) &&
    Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const serviceEnabled = truthy(env.SUPABASE_SCORING_MIRROR_ENABLED);
  const supabaseEligible = previewDeployment && previewWorkbook && approvedProject && approvedTournament && credentialsConfigured && serviceEnabled;
  return {
    previewDeployment,
    workbookId,
    previewWorkbook,
    productionIsolated,
    projectRef,
    approvedProject,
    approvedTournament,
    credentialsConfigured,
    serviceEnabled,
    supabaseEligible,
    tournamentId: PREVIEW_GUIDE_TOURNAMENT_ID,
    tournamentYear: PREVIEW_GUIDE_TOURNAMENT_YEAR,
  };
}

function sourceState(requested, runtime, label) {
  const productionBlocked = requested === "supabase" && !runtime.previewDeployment;
  const blocked = runtime.previewDeployment && (
    requested === "invalid" || (requested === "supabase" && !runtime.supabaseEligible)
  );
  const resolved = !runtime.previewDeployment ? "google"
    : blocked ? "unavailable"
    : requested;
  return {
    requested,
    resolved,
    blocked,
    productionBlocked,
    reason: resolved === "supabase" ? `preview-supabase-${label}`
      : requested === "invalid" ? "invalid-source"
      : requested !== "supabase" ? "google-configured"
      : productionBlocked ? "production-hard-block"
      : !runtime.previewWorkbook ? "preview-workbook-required"
      : !runtime.approvedProject ? "preview-project-required"
      : !runtime.approvedTournament ? "approved-tournament-required"
      : !runtime.credentialsConfigured ? "credentials-missing"
      : !runtime.serviceEnabled ? "supabase-service-disabled"
      : "google-configured",
  };
}

export function guideReadEnvironment(env = process.env) {
  const runtime = guideRuntime(env);
  const guide = sourceState(normalizedSource(env.GUIDE_READ_SOURCE), runtime, "guide");
  const course = sourceState(normalizedSource(env.COURSE_PRESENTATION_READ_SOURCE || env.GUIDE_READ_SOURCE), runtime, "course-presentation");
  return { ...runtime, guide, course };
}

export function requireGuideReadSource(env = process.env, surface = "guide") {
  const state = guideReadEnvironment(env);
  const selected = surface === "course" ? state.course : state.guide;
  if (selected.blocked) {
    const error = new Error(`Supabase ${surface === "course" ? "course presentation" : "Guide"} reads are unavailable (${selected.reason}).`);
    error.code = surface === "course" ? "COURSE_PRESENTATION_SUPABASE_CONFIGURATION_REQUIRED" : "GUIDE_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return { ...state, surface, source: selected };
}

export function guideSyncEnvironment(env = process.env) {
  const runtime = guideRuntime(env);
  const autoSyncRequested = truthy(env.GUIDE_AUTO_SYNC_ENABLED);
  const administrativeEligible = runtime.supabaseEligible;
  return {
    ...runtime,
    autoSyncRequested,
    administrativeEligible,
    autoSyncEnabled: autoSyncRequested && administrativeEligible,
    productionBlocked: autoSyncRequested && !runtime.previewDeployment,
    reason: administrativeEligible ? (autoSyncRequested ? "preview-guide-sync-enabled" : "preview-guide-manual-sync-only")
      : !runtime.previewDeployment ? "production-hard-block"
      : !runtime.previewWorkbook ? "preview-workbook-required"
      : !runtime.approvedProject ? "preview-project-required"
      : !runtime.approvedTournament ? "approved-tournament-required"
      : !runtime.credentialsConfigured ? "credentials-missing"
      : !runtime.serviceEnabled ? "supabase-service-disabled"
      : "guide-sync-disabled",
  };
}

export function assertGuideSyncEnvironment({ env = process.env, triggerType = "MANUAL" } = {}) {
  const state = guideSyncEnvironment(env);
  const scheduled = clean(triggerType).toUpperCase() === "SCHEDULED";
  if (!state.administrativeEligible || (scheduled && !state.autoSyncEnabled)) {
    const error = new Error(`Guide synchronization is unavailable (${scheduled && state.administrativeEligible ? "automatic-sync-disabled" : state.reason}).`);
    error.code = !state.previewDeployment ? "GUIDE_SYNC_PRODUCTION_BLOCKED" : "GUIDE_SYNC_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}

function bearerValue(requestOrAuthorization) {
  if (typeof requestOrAuthorization === "string") return requestOrAuthorization;
  if (requestOrAuthorization?.headers?.get) return requestOrAuthorization.headers.get("authorization") || "";
  return requestOrAuthorization?.headers?.authorization || requestOrAuthorization?.authorization || "";
}

export function guideWorkerAuthorized(requestOrAuthorization, env = process.env) {
  const expected = clean(env.GUIDE_SYNC_WORKER_SECRET);
  const supplied = clean(bearerValue(requestOrAuthorization)).match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

/**
 * Server-only worker configuration. The application bearer is read from the
 * deployment environment and is never accepted in a request body or returned
 * by an endpoint. Vercel Deployment Protection remains the independent
 * transport layer in front of the protected Preview URL.
 */
export function guideWorkerServerConfiguration(env = process.env) {
  const state = guideSyncEnvironment(env);
  const workerSecret = clean(env.GUIDE_SYNC_WORKER_SECRET);
  return {
    endpointUrl: PREVIEW_GUIDE_SYNC_WORKER_ENDPOINT,
    workerSecret,
    ready: state.autoSyncEnabled && workerSecret.length >= 32,
  };
}
