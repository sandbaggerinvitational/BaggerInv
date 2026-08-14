import { createHmac, timingSafeEqual } from "node:crypto";

const clean = (value) => String(value ?? "").trim();
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const secret = () => process.env.PLAYER_PASSPORT_SECRET || process.env.SCORING_SESSION_SECRET || process.env.ADMIN_SECRET;

function signature(payload, secretValue = secret()) {
  if (!secretValue || secretValue.length < 24) throw new Error("Player Passport signing is not configured.");
  return createHmac("sha256", secretValue).update(payload).digest("base64url");
}

export const PLAYER_PASSPORT_COOKIE = "sbi-player-passport";
export const PREVIEW_IMPERSONATION_TOURNAMENT_ID = "2026";

export function createPlayerPassportSession({
  playerId,
  tournamentId,
  deviceId,
  sessionVersion = 1,
  impersonatedPlayerId = "",
  previewImpersonationLeaseId = "",
  previewDirector = null,
  expiresInSeconds = 365 * 24 * 60 * 60,
} = {}, secretValue) {
  if (!clean(playerId) || !clean(tournamentId) || !clean(deviceId)) throw new Error("Player Passport identity is incomplete.");
  const now = Math.floor(Date.now() / 1000);
  const requestedLifetime = Number(expiresInSeconds) || 0;
  const lifetime = clean(impersonatedPlayerId) ? Math.max(1, requestedLifetime) : Math.max(3600, requestedLifetime);
  const payload = encode({
    type: "player-passport",
    playerId: clean(playerId),
    tournamentId: clean(tournamentId),
    deviceId: clean(deviceId),
    sessionVersion: Number(sessionVersion) || 1,
    ...(clean(impersonatedPlayerId) ? {
      impersonatedPlayerId: clean(impersonatedPlayerId),
      previewImpersonationLeaseId: clean(previewImpersonationLeaseId),
      previewDirector: previewDirector ? {
        id: clean(previewDirector.id || playerId),
        name: clean(previewDirector.name || "Tournament Director"),
        role: "DIRECTOR",
      } : undefined,
    } : {}),
    iat: now,
    exp: now + lifetime,
  });
  return `${payload}.${signature(payload, secretValue)}`;
}

export function isPreviewImpersonationSession(session) {
  return process.env.VERCEL_ENV === "preview" &&
    Boolean(clean(session?.impersonatedPlayerId)) &&
    clean(session?.previewDirector?.role).toUpperCase() === "DIRECTOR" &&
    clean(session?.previewDirector?.id) === clean(session?.playerId);
}

export function hasPreviewImpersonationLease(session) {
  return isPreviewImpersonationSession(session) && /^[0-9a-f-]{36}$/i.test(clean(session?.previewImpersonationLeaseId));
}

export function playerPassportEffectivePlayerId(session) {
  if (isPreviewImpersonationSession(session)) return clean(session.impersonatedPlayerId);
  return clean(session?.playerId);
}

export function previewPlayerFromRecords(playerIdValue, records = []) {
  const playerId = clean(playerIdValue);
  const record = records.find((player) => clean(player?.["Player ID"]) === playerId);
  if (!record) return null;
  return {
    id: playerId,
    name: clean(record["Display Name"] || record.Name || playerId),
    slug: clean(record.Slug),
    photo: clean(record["Photo Filename"] || record.Photo),
    role: clean(record.Role).toUpperCase() || "PLAYER",
    active: !clean(record.Active) || ["TRUE", "YES", "Y", "1", "ACTIVE"].includes(clean(record.Active).toUpperCase()),
  };
}

export function verifyPlayerPassportSession(tokenValue, secretValue) {
  const [payload, supplied, extra] = clean(tokenValue).split(".");
  if (!payload || !supplied || extra) throw new Error("Invalid Player Passport.");
  const expected = signature(payload, secretValue);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("Invalid Player Passport.");
  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (session.type !== "player-passport" || Number(session.exp) <= Math.floor(Date.now() / 1000)) {
    throw new Error("Player Passport expired.");
  }
  return session;
}

export function playerPassportCookie(token, maxAge = 365 * 24 * 60 * 60) {
  return {
    name: PLAYER_PASSPORT_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export function playerPassportTokenFromRequest(request) {
  return request.cookies.get(PLAYER_PASSPORT_COOKIE)?.value || "";
}

export function playerAppearsInMatch(match = {}, playerIdValue) {
  const playerId = clean(playerIdValue);
  return [1, 2].some((side) => [1, 2].some((slot) =>
    clean(match[`Team ${side} Player ${slot}`]) === playerId
  ));
}

export function playerMatchSides(match = {}, playerIdValue) {
  const playerId = clean(playerIdValue);
  const idsFor = (side) => [1, 2]
    .map((slot) => clean(match[`Team ${side} Player ${slot}`]))
    .filter(Boolean);
  const side = idsFor(1).includes(playerId) ? 1 : idsFor(2).includes(playerId) ? 2 : 0;
  if (!side) return { side: 0, participantIds: [], partnerIds: [], opponentIds: [] };
  const participantIds = idsFor(side);
  return {
    side,
    participantIds,
    partnerIds: participantIds.filter((id) => id !== playerId),
    opponentIds: idsFor(side === 1 ? 2 : 1),
  };
}
