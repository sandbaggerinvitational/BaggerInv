import { PRODUCTION_SPREADSHEET_ID } from "./spreadsheet-environment.js";

const clean = (value) => String(value ?? "").trim();

export function oddsCalculationEnvironment(env = process.env) {
  const requestedInputs = clean(env.ODDS_CALCULATION_INPUT_SOURCE || "google").toLowerCase();
  const requestedPublication = clean(env.ODDS_PUBLICATION_AUTHORITY || "google").toLowerCase();
  const preview = clean(env.VERCEL_ENV).toLowerCase() === "preview";
  const workbookId = clean(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const previewWorkbookId = clean(env.PREVIEW_SCORING_SHEET_ID);
  const isolated = Boolean(workbookId) && workbookId !== PRODUCTION_SPREADSHEET_ID && (!previewWorkbookId || workbookId === previewWorkbookId);
  const configured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_URL)) && Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  const eligible = preview && isolated && configured;
  return {
    requestedInputs,
    requestedPublication,
    inputSource: requestedInputs === "supabase" && eligible ? "supabase" : "google",
    publicationAuthority: requestedPublication === "supabase" && eligible ? "supabase" : "google",
    eligible,
    preview,
    isolated,
    configured,
    productionHardBlock: !preview && (requestedInputs === "supabase" || requestedPublication === "supabase"),
  };
}
