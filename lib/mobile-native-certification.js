import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { MobileApiError } from "./mobile-api-v1.js";
import { productionNativeEnvironment, productionNativeControls, PRODUCTION_NATIVE_CONTRACT } from "./mobile-native-production-environment.js";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "./production-foundation-resource-contract.js";

const clean = (value) => String(value ?? "").trim();
const TOKEN_PATTERN = /^(?:v1|v2p)\.([0-9]{10})\.([0-9]{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;
const MAX_TOKEN_BYTES = 256;
const MAX_CLOCK_SKEW_SECONDS = 60;

export const MOBILE_NATIVE_CERTIFICATION_HEADER = "x-bagger-certification";
export const MOBILE_NATIVE_CERTIFICATION_SECONDS = 12 * 60 * 60;

function signingSecret(env) {
  if (String(env.VERCEL_ENV || "").trim().toLowerCase() === "production") {
    const secret = clean(env.PRODUCTION_NATIVE_CERTIFICATION_SIGNING_SECRET);
    if (!productionNativeEnvironment(env).available || secret.length < 32 ||
        secret === clean(env.MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET)) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
    return secret;
  }
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

function productionMessage(input, env, productionContext) {
  const controls = productionNativeControls(env);
  const runtime = productionContext?.runtime;
  if (!controls.valid || productionContext?.revocationGeneration !== controls.revocationGeneration ||
      runtime?.contractVersion !== "production-current-tournament-runtime-v1" || runtime.lifecycle !== "ACTIVE" ||
      runtime.tournamentId !== clean(input.tournamentId) ||
      !Number.isSafeInteger(runtime.pointerRevision) || runtime.pointerRevision < 1 ||
      !Number.isSafeInteger(runtime.lifecycleRevision) || runtime.lifecycleRevision < 1)
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  return JSON.stringify(["bagger-mobile-production-certification-v2", PRODUCTION_NATIVE_CONTRACT,
    "production", PRODUCTION_SUPABASE_PROJECT_REF, input.issuedAt, input.expiresAt, input.nonce,
    clean(input.authUserId).toLowerCase(), clean(input.playerId), clean(input.tournamentId),
    controls.revocationGeneration, runtime.pointerRevision, runtime.lifecycleRevision,
    runtime.runtimeGenerationId || "", runtime.authorityGenerationId || "", runtime.admissionGenerationId || "",
    productionParticipantRevision(productionContext?.participant, input)]);
}

// This is the existing canonical identity-context revision, not a native counter.
// Bind only stable authority data: timestamps, matches and display fields must not
// invalidate an otherwise-current certificate. Eligibility is re-read separately.
export function productionParticipantRevision(context, identity) {
  if (!context || clean(context.authUserId).toLowerCase() !== clean(identity.authUserId).toLowerCase() ||
      clean(context.playerId) !== clean(identity.playerId) ||
      clean(context.tournament?.id) !== clean(identity.tournamentId) ||
      context.membership?.active !== true ||
      !Number.isSafeInteger(context.contextRevision) || context.contextRevision < 1) {
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }
  return context.contextRevision;
}

function signature(input, secret, env, productionContext) {
  const message = String(env.VERCEL_ENV || "").trim().toLowerCase() === "production"
    ? productionMessage(input, env, productionContext) : identityMessage(input);
  return createHmac("sha256", secret).update(message).digest("base64url");
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
  productionContext,
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
  const production = String(env.VERCEL_ENV || "").trim().toLowerCase() === "production";
  if (production && productionNativeControls(env).capabilities.certification !== true)
    throw new MobileApiError("NATIVE_CERTIFICATION_DISABLED");
  return Object.freeze({
    token: `${production ? "v2p" : "v1"}.${issuedAt}.${expiresAt}.${tokenNonce}.${signature(fields, signingSecret(env), env, productionContext)}`,
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
  productionContext,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  const candidate = token || mobileNativeCertificationFromRequest(request);
  const production = String(env.VERCEL_ENV || "").trim().toLowerCase() === "production";
  if (typeof candidate !== "string" || !candidate.startsWith(production ? "v2p." : "v1."))
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
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
  }, signingSecret(env), env, productionContext);
  if (!equalSignature(actualSignature, expectedSignature)) {
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  }
  return Object.freeze({ issuedAt, expiresAt });
}
