import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

export const PREVIEW_DRAFT_SUPABASE_PROJECT_REF = "idgigvjjqkfbqjeredpb";

const clean = (value) => String(value ?? "").trim();
const sourceValue = (value) => clean(value).toLowerCase() === "supabase" ? "supabase" : "google";

function exactPreviewProject(urlValue) {
  try {
    const url = new URL(clean(urlValue));
    return (url.protocol === "https:"
      && !url.username
      && !url.password
      && (url.pathname === "" || url.pathname === "/"))
      ? url.hostname === `${PREVIEW_DRAFT_SUPABASE_PROJECT_REF}.supabase.co`
      : false;
  } catch {
    return false;
  }
}

export function draftReadEnvironment(env = process.env) {
  const requested = sourceValue(env.DRAFT_READ_SOURCE);
  const deployment = clean(env.VERCEL_ENV).toLowerCase();
  const preview = deployment === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const configuredPreviewWorkbook = clean(env.PREVIEW_SCORING_SHEET_ID);
  const productionIsolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID;
  const previewWorkbook = productionIsolated && (!configuredPreviewWorkbook || configuredPreviewWorkbook === workbookId);
  const projectApproved = exactPreviewProject(env.SUPABASE_SCORING_MIRROR_URL);
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const productionBlocked = deployment === "production" && requested === "supabase";
  const resolved = preview && requested === "supabase" ? "supabase" : "google";
  const blocked = resolved === "supabase" && (!previewWorkbook || !projectApproved || !credentialsConfigured);
  return {
    requested,
    resolved,
    preview,
    productionBlocked,
    blocked,
    previewWorkbook,
    productionIsolated,
    projectApproved,
    credentialsConfigured,
    projectRef: projectApproved ? PREVIEW_DRAFT_SUPABASE_PROJECT_REF : "",
    reason: productionBlocked
      ? "production-hard-block"
      : resolved === "google"
        ? "google-selected"
        : !previewWorkbook
          ? "isolated-preview-workbook-required"
          : !projectApproved
            ? "preview-supabase-project-required"
            : !credentialsConfigured
              ? "supabase-credentials-required"
              : "preview-supabase-draft",
  };
}

export function requireDraftReadSource(env = process.env) {
  const state = draftReadEnvironment(env);
  if (state.blocked) {
    const error = new Error(`Supabase Draft reads are unavailable (${state.reason}).`);
    error.code = "DRAFT_SUPABASE_CONFIGURATION_REQUIRED";
    error.status = 503;
    throw error;
  }
  return state;
}

export function isSupabaseDraftRead(env = process.env) {
  return draftReadEnvironment(env).resolved === "supabase";
}
