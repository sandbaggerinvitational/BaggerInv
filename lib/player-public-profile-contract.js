import { createHash } from "node:crypto";

export const PLAYER_PUBLIC_PROFILE_CONTRACT_VERSION = "player-public-profile-v1";

const clean = (value) => String(value ?? "").trim();
const boolean = (value) => value === true || /^(true|yes|y|1|active)$/i.test(clean(value));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function playerPublicProfileFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function normalizePlayerPublicProfile(row = {}) {
  const playerId = clean(row["Player ID"] || row.player_id);
  const displayName = clean(
    row["Display Name"] || row.display_name ||
    [row.First, row.Last].map(clean).filter(Boolean).join(" ") || playerId
  );
  return {
    player_id: playerId,
    public_profile: {
      "Player ID": playerId,
      First: clean(row.First),
      Last: clean(row.Last),
      "Display Name": displayName,
      Slug: clean(row.Slug || row.slug).toLowerCase(),
      Active: boolean(row.Active ?? row.active),
      "First Year": clean(row["First Year"]),
      "Last Year": clean(row["Last Year"]),
      "Captain Eligible": boolean(row["Captain Eligible"]),
      "Photo Filename": clean(row["Photo Filename"] || row.Photo),
      "Board of Governors": boolean(row["Board of Governors"] ?? row.BOG),
      Rookie: boolean(row.Rookie),
      "Handicap Committee": boolean(row["Handicap Committee"]),
      Nickname: clean(row.Nickname),
      Bio: clean(row.Bio),
      Hometown: clean(row.Hometown),
    },
  };
}

export function buildPlayerPublicProfileProjection(rows = [], { sourceWorkbookId = "" } = {}) {
  const profiles = rows
    .map(normalizePlayerPublicProfile)
    .filter((row) => row.player_id)
    .sort((left, right) => left.player_id.localeCompare(right.player_id));
  if (!profiles.length || new Set(profiles.map((row) => row.player_id)).size !== profiles.length) {
    const error = new Error("The Players projection is empty or contains duplicate Player IDs.");
    error.code = "PLAYER_PUBLIC_PROFILE_IDENTITY_INVALID";
    throw error;
  }
  const projection = {
    contract_version: PLAYER_PUBLIC_PROFILE_CONTRACT_VERSION,
    source_workbook_id: clean(sourceWorkbookId),
    players: profiles,
  };
  return { ...projection, source_fingerprint: playerPublicProfileFingerprint(projection) };
}

export function comparePlayerPublicProfileProjection(source = {}, stored = {}) {
  const normalize = (rows) => (rows || []).map((row) => ({
    player_id: clean(row.player_id),
    public_profile: row.public_profile || {},
  })).sort((left, right) => left.player_id.localeCompare(right.player_id));
  const sourceRows = normalize(source.players);
  const storedRows = normalize(stored.players);
  const sourceRowsFingerprint = playerPublicProfileFingerprint(sourceRows);
  const storedRowsFingerprint = playerPublicProfileFingerprint(storedRows);
  const sourceIds = new Set(sourceRows.map((row) => row.player_id));
  const storedIds = new Set(storedRows.map((row) => row.player_id));
  const missing = [...sourceIds].filter((id) => !storedIds.has(id));
  const orphan = [...storedIds].filter((id) => !sourceIds.has(id));
  return {
    pass: sourceRowsFingerprint === storedRowsFingerprint &&
      clean(source.source_fingerprint) === clean(stored.source_fingerprint) &&
      missing.length === 0 && orphan.length === 0,
    sourceCount: sourceRows.length,
    storedCount: storedRows.length,
    sourceFingerprint: clean(source.source_fingerprint),
    storedFingerprint: clean(stored.source_fingerprint),
    sourceRowsFingerprint,
    storedRowsFingerprint,
    missing,
    orphan,
  };
}
