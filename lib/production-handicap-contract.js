import { createHash } from "node:crypto";

export const PRODUCTION_HANDICAP_REVISION_CONTRACT =
  "production-handicap-revision-v1";

const clean = (value) => String(value ?? "").trim();
const PLAYER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SIGNED_DECIMAL = /^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value === undefined ? null : value;
}

export function productionHandicapPayloadHash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

/** Preserve every supplied base-10 digit before PostgreSQL NUMERIC storage. */
export function canonicalProductionHandicapDecimal(value) {
  const source = clean(value);
  if (!source || source.length > 120 || !SIGNED_DECIMAL.test(source)) {
    throw contractError(
      "PRODUCTION_HANDICAP_DECIMAL_REQUIRED",
      "Every tournament handicap must be an exact signed decimal.",
    );
  }
  const negative = source.startsWith("-");
  const unsigned = source.replace(/^[+-]/, "");
  let [whole, fraction = ""] = unsigned.split(".");
  whole = whole.replace(/^0+(?=\d)/, "") || "0";
  fraction = fraction.replace(/0+$/, "");
  const zero = whole === "0" && !fraction;
  return `${negative && !zero ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function exactPlayerId(value) {
  const result = clean(value).toUpperCase();
  if (!PLAYER_ID.test(result)) {
    throw contractError(
      "PRODUCTION_HANDICAP_PLAYER_ID_REQUIRED",
      "Every handicap entry must use a stable Production Player ID.",
    );
  }
  return result;
}

export function canonicalProductionHandicapEntries(value) {
  if (!Array.isArray(value) || !value.length) {
    throw contractError(
      "PRODUCTION_HANDICAP_COMPLETE_ROSTER_REQUIRED",
      "The complete active Production roster is required.",
    );
  }
  const entries = value.map((entry) => ({
    player_id: exactPlayerId(entry?.playerId ?? entry?.player_id),
    tournament_handicap: canonicalProductionHandicapDecimal(
      entry?.proposedHandicap ?? entry?.tournamentHandicap ?? entry?.tournament_handicap,
    ),
    source_index: entry?.sourceIndex === undefined || entry?.sourceIndex === null || clean(entry.sourceIndex) === ""
      ? null
      : canonicalProductionHandicapDecimal(entry.sourceIndex),
    low_index: entry?.lowIndex === undefined || entry?.lowIndex === null || clean(entry.lowIndex) === ""
      ? null
      : canonicalProductionHandicapDecimal(entry.lowIndex),
    source_metadata: {},
  })).sort((left, right) => left.player_id.localeCompare(right.player_id));
  if (new Set(entries.map((entry) => entry.player_id)).size !== entries.length) {
    throw contractError(
      "PRODUCTION_HANDICAP_DUPLICATE_PLAYER",
      "Each active Production Player ID must appear exactly once.",
    );
  }
  return entries;
}
