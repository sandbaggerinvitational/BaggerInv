import "server-only";

import {
  loadCanonicalProductionCurrentShadowSource,
  loadCanonicalProductionProjectionShadowSource,
} from "./google-sheets-data.js";
import { prepareProductionPresentationShadowImport } from "./production-presentation-shadow.js";

/**
 * Server-only Production Google -> dormant Production Supabase presentation
 * preparation. This function prepares an inert payload; it never calls an RPC.
 */
export async function prepareProductionPresentationShadowArtifact(options = {}) {
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
