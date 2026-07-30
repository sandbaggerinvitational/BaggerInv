export const PRODUCTION_SPREADSHEET_ID =
  "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";

export function configuredSpreadsheetId() {
  return String(process.env.GOOGLE_SHEETS_ID || "").trim();
}

export function liveTournamentV2Enabled() {
  return process.env.NEXT_PUBLIC_LIVE_TOURNAMENT_V2_ENABLED === "true";
}

export function mobileTournamentDashboardEnabled(tournament) {
  return liveTournamentV2Enabled() && Boolean(tournament);
}

export function previewEnvironmentDiagnostic() {
  const spreadsheetId = configuredSpreadsheetId();
  const productionIsolated =
    Boolean(spreadsheetId) && spreadsheetId !== PRODUCTION_SPREADSHEET_ID;
  const scoringEnvironment =
    process.env.SCORING_ENVIRONMENT === "test" ? "test" : "blocked";
  const tournamentModeEnabled = liveTournamentV2Enabled();

  return {
    environment: "preview",
    productionIsolated,
    scoringEnvironment,
    liveTournamentV2Enabled: tournamentModeEnabled,
    scoringEnabled: productionIsolated && scoringEnvironment === "test",
    tournamentModeEnabled,
    googleSheetsIdConfigured: Boolean(spreadsheetId),
  };
}

export function assertPreviewSpreadsheetIsolation(spreadsheetId = configuredSpreadsheetId()) {
  if (process.env.VERCEL_ENV !== "preview") return spreadsheetId;
  if (!spreadsheetId) {
    throw new Error("Preview data access requires a preview-only GOOGLE_SHEETS_ID.");
  }
  if (spreadsheetId === PRODUCTION_SPREADSHEET_ID) {
    throw new Error("Preview data access is blocked from the production spreadsheet.");
  }
  return spreadsheetId;
}

export function resolveSpreadsheetId() {
  const configured = configuredSpreadsheetId();
  assertPreviewSpreadsheetIsolation(configured);
  return configured || PRODUCTION_SPREADSHEET_ID;
}

export function assertLiveScoringWriteEnvironment() {
  const spreadsheetId = resolveSpreadsheetId();
  if (process.env.SCORING_ENVIRONMENT !== "test") {
    throw new Error("Live scoring writes are disabled outside the test environment.");
  }
  if (!configuredSpreadsheetId() || spreadsheetId === PRODUCTION_SPREADSHEET_ID) {
    throw new Error("Live scoring requires a separate test GOOGLE_SHEETS_ID.");
  }
  return spreadsheetId;
}
