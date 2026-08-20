import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const clean = (value) => String(value ?? "").trim();

export class ParticipantAuthPhoneError extends Error {
  constructor(code = "PHONE_INVALID", message = "Enter a valid mobile number.") {
    super(message);
    this.name = "ParticipantAuthPhoneError";
    this.code = code;
    this.status = 400;
  }
}

/**
 * Parse Director-entered phone text and return one canonical E.164 value.
 * Friendly national input defaults to the United States; international input
 * remains supported when it includes its country calling code.
 */
export function normalizeParticipantAuthPhone(value, { defaultCountry = "US" } = {}) {
  const input = clean(value);
  if (!input) throw new ParticipantAuthPhoneError();
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (!parsed || !parsed.isValid() || parsed.ext) throw new ParticipantAuthPhoneError();
  return {
    e164: parsed.number,
    country: parsed.country || "",
    nationalNumber: parsed.nationalNumber,
    masked: maskParticipantAuthPhone(parsed.number),
  };
}

/** Routine admin views and logs expose only the final four digits. */
export function maskParticipantAuthPhone(value) {
  const input = clean(value);
  const digits = input.replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : "Not configured";
}

export function participantAuthPhoneStatusLabel(value) {
  const status = clean(value).toUpperCase();
  return ({
    NOT_CONFIGURED: "Not configured",
    ELIGIBLE_NOT_VERIFIED: "Eligible · Not verified",
    VERIFICATION_PENDING: "Verification pending",
    VERIFIED: "Verified",
    REVOKED: "Revoked",
    PHONE_CONFLICT: "Conflict",
    PENDING_AUTH_PHONE_COLLISION: "Pending Auth phone collision",
    AUTH_USER_MISMATCH: "Auth user mismatch",
    AUTH_SETUP_REQUIRED: "Auth setup required",
  })[status] || "Not configured";
}

export function participantAuthPhoneErrorMessage(code) {
  return ({
    PHONE_INVALID: "Enter a valid mobile number.",
    PHONE_DUPLICATE: "This mobile number is already assigned to another participant.",
    PHONE_AUTH_COLLISION: "This mobile number conflicts with an existing Auth account.",
    PHONE_AUTH_USER_MISMATCH: "The mobile ownership does not match this participant's Auth account.",
    PHONE_AUTH_SETUP_REQUIRED: "Provision this participant's Auth account before adding a mobile number.",
    PHONE_PLAYER_NOT_FOUND: "The selected participant is not active in this tournament.",
    PHONE_ALREADY_CONFIGURED: "This participant already has mobile eligibility. Use Change Mobile.",
    PHONE_NOT_CONFIGURED: "This participant does not have mobile eligibility to change.",
    PHONE_ADMIN_DIRECTOR_REQUIRED: "Tournament Director authorization is required.",
  })[clean(code).toUpperCase()] || "Mobile eligibility could not be updated.";
}
