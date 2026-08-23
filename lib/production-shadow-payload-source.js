import "server-only";

import {
  loadCanonicalCompletedHistoryFoundationData,
  loadCanonicalProductionCurrentShadowSource,
} from "./google-sheets-data.js";
import { prepareProductionShadowPayloadArtifact as prepareArtifact } from "./production-shadow-payload-preparation.js";

/**
 * Server-only source wrapper. The pure payload contract is kept separately so
 * it can be regression-tested without making Production Google data available
 * to browser bundles.
 */
export function prepareProductionShadowPayloadArtifact(options = {}) {
  return prepareArtifact({
    ...options,
    loadHistorySource: loadCanonicalCompletedHistoryFoundationData,
    loadCurrentSource: loadCanonicalProductionCurrentShadowSource,
  });
}
