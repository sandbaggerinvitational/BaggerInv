const TECHNICAL_SCORING_ERROR = /(?:native number|native numeric|apostrophe|workbook|worksheet|sheet|column|header|Google Sheets|protected-column|read-back verification)/i;
import {
  isScoringAuthorityTransitionFailure,
  isScoringMutationReconciliationFailure,
} from "./scoring-mutation-authority-contract.js";

const SCORING_ADMISSION_PAUSE = /^(?:PRODUCTION_(?:SCORING_(?:ADMISSION|WRITE|PARTIAL|OPERATION_REQUEST)|CANONICAL_GOOGLE|GOOGLE_(?:MUTATION|DEDICATED|CREDENTIAL)|CUTOVER_REQUEST)|SCORING_(?:AUTHORITY_CONTRACT|INGRESS_PAUSED)|AUTHORITY_BOUNDARY_MISMATCH|SUPABASE_NOT_AUTHORITY)/;

export function isScoringAdmissionPause(error) {
  return SCORING_ADMISSION_PAUSE.test(String(error?.code || "").toUpperCase());
}

export function participantScoringHttpStatus(error) {
  if (!isScoringAdmissionPause(error)) return Number(error?.status) === 403 ? 403 : 400;
  return /UNAVAILABLE|CONTROL_PLANE|OUTCOME_UNCONFIRMED|WRITE_START_UNCONFIRMED|AMBIGUOUS|PARTIAL/.test(String(error?.code || ""))
    ? 503
    : 409;
}

export function participantScoringPauseHeaders(error) {
  const refreshRequired = isScoringAuthorityTransitionFailure(error) ||
    isScoringMutationReconciliationFailure(error);
  return isScoringAdmissionPause(error)
    ? {
        "Cache-Control": "no-store",
        ...(!refreshRequired ? { "Retry-After": "2" } : {}),
        "X-Scoring-Admission": "paused",
        ...(refreshRequired ? { "X-Scoring-Action": "refresh-required" } : {}),
      }
    : { "Cache-Control": "no-store" };
}

export function participantScoringError(error, fallback = "Your score could not be saved. Please try again.") {
  if (isScoringAdmissionPause(error)) {
    return "Scoring is temporarily paused for a verified authority transition. Refresh before trying again.";
  }
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
