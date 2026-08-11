export function scoringAuthority(env = process.env) {
  const requested = String(env.SCORING_AUTHORITY || "google").trim().toLowerCase();
  if (requested !== "supabase") return "google";
  return env.VERCEL_ENV === "preview" && env.PREVIEW_SCORING_SHEET_ID &&
    env.GOOGLE_SHEETS_SPREADSHEET_ID === env.PREVIEW_SCORING_SHEET_ID
    ? "supabase"
    : "google";
}

export function scoringAuthorityEnvironment(env = process.env) {
  const requested = String(env.SCORING_AUTHORITY || "google").trim().toLowerCase();
  const previewDeployment = String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview";
  const workbookId = String(env.GOOGLE_SHEETS_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
  const previewWorkbookId = String(env.PREVIEW_SCORING_SHEET_ID || "").trim();
  const previewWorkbook = Boolean(workbookId) && Boolean(previewWorkbookId)
    ? workbookId === previewWorkbookId
    : previewDeployment && Boolean(workbookId);
  const credentialsConfigured = Boolean(String(env.SUPABASE_SCORING_MIRROR_URL || "").trim()) &&
    Boolean(String(env.SUPABASE_SCORING_MIRROR_SECRET_KEY || "").trim());
  const resolved = requested === "supabase" && previewDeployment && previewWorkbook && credentialsConfigured
    ? "supabase"
    : "google";
  return {
    requested,
    resolved,
    previewDeployment,
    previewWorkbook,
    credentialsConfigured,
    productionBlocked: requested === "supabase" && !previewDeployment,
    reason: resolved === "supabase" ? "preview-supabase-authority"
      : requested !== "supabase" ? "google-configured"
      : !previewDeployment ? "production-hard-block"
      : !previewWorkbook ? "preview-workbook-required"
      : !credentialsConfigured ? "credentials-missing"
      : "google-fallback",
  };
}
