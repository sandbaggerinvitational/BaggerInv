export function scoringAuthority(env = process.env) {
  const requested = String(env.SCORING_AUTHORITY || "google").trim().toLowerCase();
  if (requested !== "supabase") return "google";
  return env.VERCEL_ENV === "preview" && env.PREVIEW_SCORING_SHEET_ID &&
    env.GOOGLE_SHEETS_SPREADSHEET_ID === env.PREVIEW_SCORING_SHEET_ID
    ? "supabase"
    : "google";
}
