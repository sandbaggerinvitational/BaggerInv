import { prepareProductionShadowPayloadArtifact as prepareArtifact } from "./production-shadow-payload-preparation.js";

/**
 * Node CLI source boundary. Google readers are loaded only when preparation is
 * actually requested, so command help and argument validation remain usable in
 * an ordinary Node process without importing Next's `server-only` marker.
 *
 * Do not import this module from application or browser code. Next/server code
 * must continue to use `production-shadow-payload-source.js`.
 */
export async function prepareProductionShadowPayloadArtifact(options = {}) {
  const {
    loadCanonicalCompletedHistoryFoundationData,
    loadCanonicalProductionCurrentShadowSource,
  } = await import("./google-sheets-data.js");

  return prepareArtifact({
    ...options,
    loadHistorySource: loadCanonicalCompletedHistoryFoundationData,
    loadCurrentSource: loadCanonicalProductionCurrentShadowSource,
  });
}
