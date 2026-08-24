import { authorizeSingleParticipantOtpRequest } from "./participant-identity-supabase.js";

export async function authorizeParticipantEmailOtpEligibility(input, {
  authorize = authorizeSingleParticipantOtpRequest,
} = {}) {
  try {
    return { ok: true, authorization: await authorize(input), diagnostics: null };
  } catch (error) {
    const identity = error?.identityDiagnostics || {};
    return {
      ok: false,
      authorization: null,
      diagnostics: {
        stage: "IDENTITY_AUTHORIZATION",
        status: Number(error?.status) || 0,
        functionName: String(identity.functionName || ""),
        databaseCode: String(identity.code || ""),
      },
    };
  }
}
