import assert from "node:assert/strict";
import test from "node:test";

import {
  MOBILE_NATIVE_DEVELOPMENT_HOSTNAME,
  MOBILE_NATIVE_DEVELOPMENT_VERCEL_PROJECT_ID,
  mobileNativeDevelopmentBoundaryDecision,
} from "../lib/mobile-native-development-host-boundary.js";
import { config, middleware } from "../middleware.js";

const developmentHostname = MOBILE_NATIVE_DEVELOPMENT_HOSTNAME;

function decide(overrides = {}) {
  return mobileNativeDevelopmentBoundaryDecision({
    projectId: MOBILE_NATIVE_DEVELOPMENT_VERCEL_PROJECT_ID,
    enabled: "true",
    configuredHostname: developmentHostname,
    requestHostname: developmentHostname,
    pathname: "/api/mobile/v1/health",
    ...overrides,
  });
}

function withBoundaryEnvironment(values, callback) {
  const names = [
    "VERCEL_PROJECT_ID",
    "MOBILE_NATIVE_DEVELOPMENT_ENABLED",
    "MOBILE_NATIVE_DEVELOPMENT_HOSTNAME",
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  for (const name of names) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  try {
    return callback();
  } finally {
    for (const name of names) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("ordinary PWA projects remain outside the native-development boundary", () => {
  assert.deepEqual(decide({
    projectId: "prj_existing_bagger_pwa",
    enabled: "false",
    configuredHostname: undefined,
    requestHostname: "baggerinv.com",
    pathname: "/admin/director",
  }), { action: "allow", reason: "ordinary-project" });
});

test("native-development mode fails closed when the dedicated project identity is missing or drifts", () => {
  for (const projectId of [undefined, "", "prj_unexpected"]) {
    for (const enabled of ["true", "false", "TRUE", undefined]) {
      assert.deepEqual(decide({ projectId, enabled }), {
        action: "not-found",
        reason: "development-project-mismatch",
      });
    }
  }
});

test("the dedicated project fails closed when the boundary is disabled", () => {
  for (const enabled of [undefined, "", "false", "TRUE", "1"]) {
    assert.deepEqual(decide({ enabled }), {
      action: "not-found",
      reason: "development-boundary-disabled",
    });
  }
});

test("the dedicated project fails closed for missing, malformed, or mismatched hosts", () => {
  for (const configuredHostname of [
    undefined,
    "",
    ` ${developmentHostname}`,
    `https://${developmentHostname}`,
    `${developmentHostname}/mobile`,
    "alternate-native-preview.baggerinv.com",
  ]) {
    assert.deepEqual(decide({ configuredHostname }), {
      action: "not-found",
      reason: "development-hostname-invalid",
    });
  }

  assert.deepEqual(decide({ requestHostname: "alternate-deployment.vercel.app" }), {
    action: "not-found",
    reason: "development-hostname-mismatch",
  });
});

test("the exact development host allows only the mobile v1 route tree", () => {
  for (const pathname of [
    "/api/mobile/v1",
    "/api/mobile/v1/health",
    "/api/mobile/v1/auth/otp/request",
  ]) {
    assert.deepEqual(decide({ pathname }), { action: "allow", reason: "mobile-v1" });
  }

  for (const pathname of [
    "/",
    "/admin/director",
    "/api/participant/auth/session",
    "/api/mobile/v10/health",
    "/_next/static/chunk.js",
  ]) {
    assert.deepEqual(decide({ pathname }), { action: "not-found", reason: "non-mobile-path" });
  }
});

test("middleware emits a non-redirecting 404 for denied dedicated-host requests", () => {
  const response = withBoundaryEnvironment({
    VERCEL_PROJECT_ID: MOBILE_NATIVE_DEVELOPMENT_VERCEL_PROJECT_ID,
    MOBILE_NATIVE_DEVELOPMENT_ENABLED: "true",
    MOBILE_NATIVE_DEVELOPMENT_HOSTNAME: developmentHostname,
  }, () => middleware({
    nextUrl: new URL(`https://${developmentHostname}/participant-auth`),
  }));

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("middleware passes exact-host mobile routes and all ordinary-project routes through", () => {
  const mobileResponse = withBoundaryEnvironment({
    VERCEL_PROJECT_ID: MOBILE_NATIVE_DEVELOPMENT_VERCEL_PROJECT_ID,
    MOBILE_NATIVE_DEVELOPMENT_ENABLED: "true",
    MOBILE_NATIVE_DEVELOPMENT_HOSTNAME: developmentHostname,
  }, () => middleware({
    nextUrl: new URL(`https://${developmentHostname}/api/mobile/v1/health`),
  }));
  assert.equal(mobileResponse.headers.get("x-middleware-next"), "1");

  const pwaResponse = withBoundaryEnvironment({
    VERCEL_PROJECT_ID: "prj_existing_bagger_pwa",
    MOBILE_NATIVE_DEVELOPMENT_ENABLED: undefined,
    MOBILE_NATIVE_DEVELOPMENT_HOSTNAME: undefined,
  }, () => middleware({
    nextUrl: new URL("https://baggerinv.com/admin/director"),
  }));
  assert.equal(pwaResponse.headers.get("x-middleware-next"), "1");
});

test("the matcher covers every path so the dedicated project cannot expose PWA assets", () => {
  assert.deepEqual(config, { matcher: "/:path*" });
});
