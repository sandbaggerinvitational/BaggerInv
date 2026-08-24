import { prepareProductionPresentationShadowImport } from "./production-presentation-shadow.js";

/**
 * Node-only preparation boundary. Google readers are loaded lazily so CLI help
 * and pure contract tests never import Next's server-only marker. Both readers
 * are hard-bound to the Production workbook constant.
 */
export async function prepareProductionPresentationShadowArtifact(options = {}) {
  const {
    loadCanonicalProductionCurrentShadowSource,
    loadCanonicalProductionProjectionShadowSource,
  } = await import("./google-sheets-data.js");
  const [currentSource, projectionSource] = await Promise.all([
    loadCanonicalProductionCurrentShadowSource(),
    loadCanonicalProductionProjectionShadowSource(),
  ]);
  return prepareProductionPresentationShadowImport({
    ...options,
    currentSource,
    projectionSource,
  });
}
