const clean = (value) => String(value ?? "").trim();

/**
 * Selects the account-scoped Director capability that may be discovered by
 * participant navigation. Production is deliberately enabled only by the
 * existing Production entitlement environment; it never falls through to a
 * Passport or shared-admin-password capability.
 */
export function directorAccessDiscoveryEnvironment({
  previewEnabled = false,
  production = {},
} = {}) {
  if (production.production === true) {
    return Object.freeze({
      enabled: production.enabled === true,
      mode: "production",
      reason: clean(production.reason),
    });
  }
  return Object.freeze({
    enabled: previewEnabled === true,
    mode: "preview",
    reason: previewEnabled ? "preview-director-entitlement-ready" : "director-discovery-disabled",
  });
}

/** Keep the public discovery response small and account-safe. */
export function directorAccessDiscoveryResponse(authorization = {}) {
  if (authorization.status === "unavailable") {
    return {
      status: 503,
      headers: { "Retry-After": "1", "X-Director-Retryable": "identity" },
      body: {
        authorized: false,
        code: "DIRECTOR_AUTHORIZATION_UNAVAILABLE",
      },
    };
  }
  const active = authorization.status === "active";
  return {
    status: 200,
    headers: {},
    body: {
      authorized: active,
      source: active ? clean(authorization.source || "entitlement") : undefined,
      linked: active && authorization.linked === true ? true : undefined,
    },
  };
}

/** Pure route orchestration seam used by both Preview and Production tests. */
export async function resolveDirectorAccessDiscovery({
  request,
  environment = {},
  authorizeDirector,
} = {}) {
  if (environment.enabled !== true) {
    return { status: 404, headers: {}, body: { error: "Not found." } };
  }
  if (typeof authorizeDirector !== "function") {
    return directorAccessDiscoveryResponse({ status: "unavailable" });
  }
  const authorization = await authorizeDirector({
    request,
    allowBootstrap: environment.mode === "preview",
  });
  return directorAccessDiscoveryResponse(authorization);
}
