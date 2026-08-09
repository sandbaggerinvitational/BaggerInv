const TECHNICAL_SCORING_ERROR = /(?:native number|native numeric|apostrophe|workbook|worksheet|sheet|column|header|Google Sheets|protected-column|read-back verification)/i;

export function participantScoringError(error, fallback = "Your score could not be saved. Please try again.") {
  const message = String(error?.message || "").trim();
  return !message || TECHNICAL_SCORING_ERROR.test(message) ? fallback : message;
}

export function logScoringFailure(error, context = {}) {
  console.error("Live scoring save failed", {
    ...context,
    name: error?.name || "Error",
    message: error?.message || "Unknown scoring failure",
    verificationAttempts: error?.verificationAttempts ? JSON.stringify(error.verificationAttempts) : undefined,
    workbookDiagnostics: error?.workbookDiagnostics,
    stack: error?.stack || "Unavailable",
  });
}
