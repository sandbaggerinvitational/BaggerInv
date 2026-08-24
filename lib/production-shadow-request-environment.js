import "server-only";

import { headers as nextHeaders } from "next/headers.js";

import { productionShadowCandidateEnvironment } from "./production-shadow-candidate.js";
import { productionShadowCandidateDataEnvironment } from "./production-shadow-candidate-server.js";

const clean = (value) => String(value ?? "").trim();

/**
 * Create a fresh, immutable environment for one ordinary candidate request.
 * Non-candidate deployments retain their original environment object, so live
 * baggerinv.com keeps its Google/Passport selectors without any shared state.
 */
export function applicationRequestEnvironment(request, env = process.env) {
  const candidate = productionShadowCandidateEnvironment(env);
  if (!candidate.requested) return env;
  return productionShadowCandidateDataEnvironment(env, { request, requireOrigin: false });
}

/** Server-component equivalent of applicationRequestEnvironment(). */
export async function applicationPageEnvironment(env = process.env) {
  const candidate = productionShadowCandidateEnvironment(env);
  if (!candidate.requested) return env;
  const requestHeaders = await nextHeaders();
  const host = clean(requestHeaders.get("host"));
  if (!host) {
    const error = new Error("The Production-shadow candidate requires an exact request hostname.");
    error.code = "PRODUCTION_SHADOW_CANDIDATE_REQUEST_UNAVAILABLE";
    error.status = 404;
    throw error;
  }
  return productionShadowCandidateDataEnvironment(env, {
    request: {
      method: "GET",
      url: `https://${host}/`,
      headers: requestHeaders,
    },
    requireOrigin: false,
  });
}
