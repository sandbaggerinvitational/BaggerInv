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
  tournamentId = "",
  scorerName = "",
  playerId = "",
  accessVersion = 0,
  readOnly = false,
  expiresInSeconds = 12 * 60 * 60,
} = {}, secretValue) {
  if (!["match", "admin"].includes(scope)) throw new Error("Invalid scoring-session scope.");
  if (scope === "match" && !clean(matchId)) throw new Error("A match-scoped session requires a Match ID.");
  const now = Math.floor(Date.now() / 1000);
  const payload = encode(JSON.stringify({
    scope,
    matchId: clean(matchId),
    tournamentId: clean(tournamentId),
    scorerName: clean(scorerName).slice(0, 100),
    playerId: clean(playerId).slice(0, 100),
    accessVersion: Number(accessVersion) || 0,
    readOnly: Boolean(readOnly),
    iat: now,
    exp: now + Math.max(300, Number(expiresInSeconds) || 0),
  }));
  const secret = signingSecret(secretValue);
  return `${payload}.${signature(payload, secret)}`;
}

export const SCORING_SESSION_COOKIE = "sbi-scoring-session";

export function scoringSessionCookie(token, maxAge = 12 * 60 * 60) {
  return {
    name: SCORING_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
    sameSite: "strict",
    path: "/",
    maxAge,
  };
}

export function scoringTokenFromRequest(request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.replace(/^Bearer\s+/i, "") ||
    request.cookies.get(SCORING_SESSION_COOKIE)?.value ||
    "";
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

export function participantSessionMatchesAccess(session, record = {}, now = Date.now()) {
  if (session?.scope !== "match") return session?.scope === "admin";
  const finalReadOnly = session.readOnly === true && ["final", "finalized"].includes(clean(record["Match Status"]).toLowerCase());
  const active = ["true", "yes", "1", "active"].includes(String(record["Access Active"] || "").trim().toLowerCase());
  const expires = Date.parse(String(record["Access Expires At"] || ""));
  return (finalReadOnly || (active && (!Number.isFinite(expires) || expires > now))) &&
    Number(record["Access Version"] || 0) === Number(session.accessVersion || 0) &&
    clean(record["Match ID"]) === clean(session.matchId);
}
