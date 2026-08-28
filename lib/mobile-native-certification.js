import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { MobileApiError } from "./mobile-api-v1.js";

const clean = (value) => String(value ?? "").trim();
const TOKEN_PATTERN = /^v1\.([0-9]{10})\.([0-9]{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;
const MAX_TOKEN_BYTES = 256;
const MAX_CLOCK_SKEW_SECONDS = 60;

export const MOBILE_NATIVE_CERTIFICATION_HEADER = "x-bagger-certification";
export const MOBILE_NATIVE_CERTIFICATION_SECONDS = 12 * 60 * 60;

function signingSecret(env) {
  const value = clean(env?.MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET);
  if (value.length < 32) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  return value;
}

function identityMessage({ issuedAt, expiresAt, nonce, authUserId, playerId, tournamentId }) {
  return [
    "bagger-mobile-native-certification-v1",
    String(issuedAt),
    String(expiresAt),
    nonce,
    clean(authUserId).toLowerCase(),
    clean(playerId),
    clean(tournamentId),
  ].join("\n");
}

function signature(input, secret) {
  return createHmac("sha256", secret).update(identityMessage(input)).digest("base64url");
}

function equalSignature(actual, expected) {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueMobileNativeCertification({
  authUserId,
  playerId,
  tournamentId,
  env = process.env,
  now = () => Date.now(),
  nonce = () => randomBytes(16).toString("base64url"),
} = {}) {
  const issuedAt = Math.floor(Number(now()) / 1_000);
  const expiresAt = issuedAt + MOBILE_NATIVE_CERTIFICATION_SECONDS;
  const tokenNonce = clean(nonce());
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 1_000_000_000 ||
      !/^[A-Za-z0-9_-]{22}$/.test(tokenNonce) || !clean(authUserId) ||
      !clean(playerId) || !clean(tournamentId)) {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
  const fields = { issuedAt, expiresAt, nonce: tokenNonce, authUserId, playerId, tournamentId };
  return Object.freeze({
    token: `v1.${issuedAt}.${expiresAt}.${tokenNonce}.${signature(fields, signingSecret(env))}`,
    expiresInSeconds: MOBILE_NATIVE_CERTIFICATION_SECONDS,
  });
}

export function mobileNativeCertificationFromRequest(request) {
  const value = clean(request?.headers?.get?.(MOBILE_NATIVE_CERTIFICATION_HEADER));
  if (!value || Buffer.byteLength(value, "utf8") > MAX_TOKEN_BYTES || !TOKEN_PATTERN.test(value)) {
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }
  return value;
}

export function verifyMobileNativeCertification({
  request,
  token,
  authUserId,
  playerId,
  tournamentId,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  const candidate = token || mobileNativeCertificationFromRequest(request);
  const match = TOKEN_PATTERN.exec(candidate);
  if (!match) throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  const issuedAt = Number(match[1]);
  const expiresAt = Number(match[2]);
  const nonce = match[3];
  const actualSignature = match[4];
  const current = Math.floor(Number(now()) / 1_000);
  if (!Number.isSafeInteger(current) || issuedAt > current + MAX_CLOCK_SKEW_SECONDS ||
      expiresAt <= current || expiresAt - issuedAt !== MOBILE_NATIVE_CERTIFICATION_SECONDS) {
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }
  const expectedSignature = signature({
    issuedAt,
    expiresAt,
    nonce,
    authUserId,
    playerId,
    tournamentId,
  }, signingSecret(env));
  if (!equalSignature(actualSignature, expectedSignature)) {
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }
  return Object.freeze({ issuedAt, expiresAt });
}
