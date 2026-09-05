import {
  canonicalGhinNumber,
  canonicalGolfHandicap,
} from "./production-handicap-source-contract.js";

export const GHIN_PROVIDER_AUTHORIZATION_STATE =
  "DISABLED_AWAITING_PROVIDER_AUTHORIZATION";

const clean = (value) => String(value ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Pure Phase-2B adapter boundary. It performs no network request or persistence. */
export function normalizeGhinProviderObservation(value = {}) {
  const lowDate = clean(value.lowHandicapIndexDate ?? value.low_index_date);
  if (!DATE.test(lowDate) || !Number.isFinite(Date.parse(`${lowDate}T00:00:00.000Z`))) {
    const error = new Error("The GHIN provider result requires a valid Low HI date.");
    error.code = "GHIN_PROVIDER_LOW_DATE_INVALID";
    throw error;
  }
  return Object.freeze({
    externalIdentifier: canonicalGhinNumber(value.externalIdentifier ?? value.ghin_number),
    currentIndex: canonicalGolfHandicap(value.currentHandicapIndex ?? value.current_index),
    lowIndex: canonicalGolfHandicap(value.lowHandicapIndex ?? value.low_index),
    lowIndexDate: lowDate,
    provenance: "GHIN_SYNC",
  });
}

/** Default provider for Phase 2A: deliberately incapable of live lookup. */
export const disabledGhinProvider = Object.freeze({
  authorizationState: GHIN_PROVIDER_AUTHORIZATION_STATE,
  async lookupByExternalId() {
    const error = new Error("Live GHIN refresh is awaiting written provider authorization.");
    error.code = "GHIN_PROVIDER_AUTHORIZATION_REQUIRED";
    throw error;
  },
});
