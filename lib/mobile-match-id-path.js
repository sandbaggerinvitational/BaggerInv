import { MobileApiError } from "./mobile-api-v1.js";
import { isValidOpaqueMatchID } from "./mobile-opaque-match-id.js";

const MATCH_DETAIL_PATH = /^\/api\/mobile\/v1\/matches\/([^/]+)$/;

// Decode exactly one encoded path component, never framework-normalized params.
// Encoded slashes and percent signs are ID text, not additional path segments.
export function mobileMatchIDFromRequestPath(request) {
  let matchId;
  try {
    const url = new URL(request.url);
    const component = MATCH_DETAIL_PATH.exec(url.pathname)?.[1];
    if (!component || url.hash) throw new Error("Invalid Match Detail path");
    matchId = decodeURIComponent(component);
  } catch {
    throw new MobileApiError("MATCH_NOT_FOUND");
  }
  if (!isValidOpaqueMatchID(matchId)) throw new MobileApiError("MATCH_NOT_FOUND");
  return matchId;
}
