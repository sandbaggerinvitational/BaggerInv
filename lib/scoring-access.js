import { createHmac, timingSafeEqual } from "node:crypto";

const clean = (value) => String(value ?? "").trim();
const encode = (value) => Buffer.from(value).toString("base64url");
const decode = (value) => Buffer.from(value, "base64url").toString("utf8");

function signingSecret(value = process.env.SCORING_SESSION_SECRET) {
  const secret = clean(value);
  if (secret.length < 24) throw new Error("SCORING_SESSION_SECRET must contain at least 24 characters.");
  return secret;
}

function signature(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createScoringSession({
  scope = "match",
  matchId = "",
  scorerName = "",
  expiresInSeconds = 12 * 60 * 60,
} = {}, secretValue) {
  if (!["match", "admin"].includes(scope)) throw new Error("Invalid scoring-session scope.");
  if (scope === "match" && !clean(matchId)) throw new Error("A match-scoped session requires a Match ID.");
  const now = Math.floor(Date.now() / 1000);
  const payload = encode(JSON.stringify({
    scope,
    matchId: clean(matchId),
    scorerName: clean(scorerName).slice(0, 100),
    iat: now,
    exp: now + Math.max(300, Number(expiresInSeconds) || 0),
  }));
  const secret = signingSecret(secretValue);
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyScoringSession(tokenValue, secretValue) {
  const [payload, supplied, extra] = clean(tokenValue).split(".");
  if (!payload || !supplied || extra) throw new Error("Invalid scoring session.");
  const secret = signingSecret(secretValue);
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Invalid scoring session.");
  }
  let session;
  try { session = JSON.parse(decode(payload)); }
  catch { throw new Error("Invalid scoring session."); }
  if (!["match", "admin"].includes(session.scope) || Number(session.exp) <= Math.floor(Date.now() / 1000)) {
    throw new Error("Scoring session has expired.");
  }
  if (session.scope === "match" && !clean(session.matchId)) throw new Error("Invalid scoring session.");
  return session;
}

export function canScoreMatch(session, matchId) {
  return session?.scope === "admin" ||
    (session?.scope === "match" && clean(session.matchId) === clean(matchId));
}
