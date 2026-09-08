import { MobileApiError } from "./mobile-api-v1.js";

// IDs are exact text, not display numbers or structured paths. Keep this bound
// aligned with the Unicode-aware JSON Schemas and Preview PostgreSQL lookup.
export function isValidOpaqueMatchID(value) {
  if (typeof value !== "string" || value === "." || value === "..") return false;
  let scalarCount = 0;
  for (const scalar of value) {
    const codePoint = scalar.codePointAt(0);
    // JS iteration combines valid surrogate pairs, but exposes an unpaired
    // surrogate unchanged. Neither those nor NUL can be PostgreSQL text IDs.
    if (codePoint === 0 || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) return false;
    if (++scalarCount > 200) return false;
  }
  return scalarCount > 0;
}

export function requireOpaqueMatchID(value, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (!isValidOpaqueMatchID(value)) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  return value;
}
