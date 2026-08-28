export const MOBILE_NATIVE_DEVELOPMENT_VERCEL_PROJECT_ID =
  "prj_vv0gbmDhxAsbnBQMNyPGDeAcSWii";
export const MOBILE_NATIVE_DEVELOPMENT_HOSTNAME = "native-preview.baggerinv.com";

const MOBILE_V1_PATH_PREFIX = "/api/mobile/v1";
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizedConfiguredHostname(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    return null;
  }

  const hostname = value.toLowerCase();
  return HOSTNAME_PATTERN.test(hostname) ? hostname : null;
}

function normalizedRequestHostname(value) {
  if (typeof value !== "string") return "";
  return value.toLowerCase();
}

function isMobileV1Path(pathname) {
  return pathname === MOBILE_V1_PATH_PREFIX || pathname.startsWith(`${MOBILE_V1_PATH_PREFIX}/`);
}

export function mobileNativeDevelopmentBoundaryDecision({
  projectId,
  enabled,
  configuredHostname,
  requestHostname,
  pathname,
}) {
  const requestHost = normalizedRequestHostname(requestHostname);
  const configuredHost = normalizedConfiguredHostname(configuredHostname);
  const dedicatedBoundaryRequested = projectId === MOBILE_NATIVE_DEVELOPMENT_VERCEL_PROJECT_ID ||
    enabled === "true" || Boolean(cleanMarker(configuredHostname)) ||
    requestHost === MOBILE_NATIVE_DEVELOPMENT_HOSTNAME;

  if (dedicatedBoundaryRequested && projectId !== MOBILE_NATIVE_DEVELOPMENT_VERCEL_PROJECT_ID) {
    return Object.freeze({ action: "not-found", reason: "development-project-mismatch" });
  }

  if (projectId !== MOBILE_NATIVE_DEVELOPMENT_VERCEL_PROJECT_ID) {
    return Object.freeze({ action: "allow", reason: "ordinary-project" });
  }

  if (enabled !== "true") {
    return Object.freeze({ action: "not-found", reason: "development-boundary-disabled" });
  }

  if (configuredHost !== MOBILE_NATIVE_DEVELOPMENT_HOSTNAME) {
    return Object.freeze({ action: "not-found", reason: "development-hostname-invalid" });
  }

  if (requestHost !== MOBILE_NATIVE_DEVELOPMENT_HOSTNAME) {
    return Object.freeze({ action: "not-found", reason: "development-hostname-mismatch" });
  }

  if (typeof pathname !== "string" || !isMobileV1Path(pathname)) {
    return Object.freeze({ action: "not-found", reason: "non-mobile-path" });
  }

  return Object.freeze({ action: "allow", reason: "mobile-v1" });
}

function cleanMarker(value) {
  return typeof value === "string" ? value.trim() : "";
}
