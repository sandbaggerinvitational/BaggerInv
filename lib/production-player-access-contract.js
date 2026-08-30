import { createHash } from "node:crypto";

import {
  isValidParticipantEmail,
  normalizeParticipantEmail,
} from "./participant-identity.js";
import { normalizeParticipantAuthPhone } from "./participant-auth-phone.js";

export const PRODUCTION_PLAYER_ACCESS_CONTRACT = "production-players-access-v1";

const PLAYER_ID = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const PLACEHOLDER_DOMAIN = /(?:^|\.)(?:example\.(?:com|net|org)|invalid|test|localhost)$/i;
const PLACEHOLDER_LOCAL = /(?:^|[+._-])(?:test|fake|placeholder|dummy)(?:[+._-]|$)/i;
const clean = (value) => String(value ?? "").trim();

function accessError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value === undefined ? null : value;
}

export function productionPlayerAccessPayloadHash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function canonicalProductionPlayerId(value) {
  const playerId = clean(value).toUpperCase();
  if (!PLAYER_ID.test(playerId)) {
    throw accessError(
      "PLAYER_ACCESS_PLAYER_ID_REQUIRED",
      "Select a valid stable Player ID.",
    );
  }
  return playerId;
}

export function canonicalProductionPlayerEmail(value) {
  const email = normalizeParticipantEmail(value);
  const [local, domain = ""] = email.split("@");
  if (!email || email.length > 320 || !isValidParticipantEmail(email) ||
      PLACEHOLDER_DOMAIN.test(domain) || PLACEHOLDER_LOCAL.test(local)) {
    throw accessError(
      "PLAYER_ACCESS_EMAIL_INVALID",
      "Enter a unique, real email address. Placeholder addresses are not allowed.",
    );
  }
  return email;
}

export function canonicalProductionPlayerPhone(value) {
  try { return normalizeParticipantAuthPhone(value).e164; }
  catch {
    throw accessError(
      "PLAYER_ACCESS_PHONE_INVALID",
      "Enter a valid mobile number with its country code.",
    );
  }
}

export function canonicalProductionLoginPreference(value) {
  const preference = clean(value).toUpperCase();
  if (!["EMAIL_PRIMARY", "PHONE_PRIMARY"].includes(preference)) {
    throw accessError(
      "PLAYER_ACCESS_LOGIN_PREFERENCE_INVALID",
      "Select Email Primary or Phone Primary.",
    );
  }
  return preference;
}

export function canonicalProductionBulkEnrollment(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 100) {
    throw accessError(
      "PLAYER_ACCESS_BULK_INPUT_INVALID",
      "Paste between 1 and 100 Player enrollment rows.",
    );
  }
  const normalized = entries.map((entry) => {
    const playerId = canonicalProductionPlayerId(entry?.playerId ?? entry?.player_id);
    const rawEmail = clean(entry?.email);
    const rawPhone = clean(entry?.phone ?? entry?.phoneE164 ?? entry?.phone_e164);
    if (!rawEmail && !rawPhone) {
      throw accessError(
        "PLAYER_ACCESS_BULK_INPUT_INVALID",
        `Add an email or phone for ${playerId}.`,
      );
    }
    return {
      player_id: playerId,
      email: rawEmail ? canonicalProductionPlayerEmail(rawEmail) : null,
      phone_e164: rawPhone ? canonicalProductionPlayerPhone(rawPhone) : null,
    };
  }).sort((left, right) => left.player_id.localeCompare(right.player_id));
  if (new Set(normalized.map((entry) => entry.player_id)).size !== normalized.length) {
    throw accessError(
      "PLAYER_ACCESS_BULK_DUPLICATE_PLAYER",
      "Each Player ID may appear only once in a bulk enrollment.",
    );
  }
  const emails = normalized.map((entry) => entry.email).filter(Boolean);
  const phones = normalized.map((entry) => entry.phone_e164).filter(Boolean);
  if (new Set(emails).size !== emails.length) {
    throw accessError(
      "PLAYER_ACCESS_BULK_EMAIL_COLLISION",
      "Every email in the batch must be unique.",
    );
  }
  if (new Set(phones).size !== phones.length) {
    throw accessError(
      "PLAYER_ACCESS_BULK_PHONE_COLLISION",
      "Every phone in the batch must be unique.",
    );
  }
  return normalized;
}
