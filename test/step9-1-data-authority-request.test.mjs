import assert from "node:assert/strict";
import test from "node:test";

import {
  currentDataAuthorityDiagnostics,
  dataAuthorityResponseHeaders,
  markDataAuthorityFallback,
  recordDataAuthorityTransport,
  setDataAuthorityResolvedSource,
  withDataAuthorityRequestScope,
} from "../lib/data-authority-request.js";

const previewEnv = { VERCEL_ENV: "preview" };

test("request scope counts Google and Supabase transports and reports sorted adapters", async () => {
  const measured = await withDataAuthorityRequestScope({
    env: previewEnv,
    label: "counter-certification",
    source: "supabase",
  }, async () => {
    recordDataAuthorityTransport("google", { adapter: "sheets-reader", transport: "sheets" });
    recordDataAuthorityTransport("google", { adapter: "gviz-reader", transport: "gviz" });
    recordDataAuthorityTransport("google", { adapter: "oauth-writer", transport: "oauth", writer: true });
    recordDataAuthorityTransport("supabase", { adapter: "z-supabase" });
    recordDataAuthorityTransport("supabase", { adapter: "a-supabase" });
    return currentDataAuthorityDiagnostics();
  });

  const expected = {
    label: "counter-certification",
    source: "supabase",
    googleAttempts: 3,
    googleHttpRequests: 3,
    googleSheetsRequests: 1,
    googleGvizRequests: 1,
    googleOAuthRequests: 1,
    googleWriterOperations: 1,
    supabaseAttempts: 2,
    supabaseRequests: 2,
    fallbackUsed: false,
    injectedOutage: "none",
    blockedGoogleAttempts: 0,
    blockedSupabaseAttempts: 0,
    adapters: ["a-supabase", "gviz-reader", "oauth-writer", "sheets-reader", "z-supabase"],
  };
  assert.deepEqual(measured.result, expected);
  assert.deepEqual(measured.diagnostics, expected);
  assert.equal(Object.isFrozen(measured.diagnostics), true);
  assert.equal(currentDataAuthorityDiagnostics(), null);
});

test("outage injection is Preview-only and mutually exclusive", async () => {
  let operationCalled = false;
  await assert.rejects(
    () => withDataAuthorityRequestScope({ env: { VERCEL_ENV: "production" }, injectGoogleOutage: true }, async () => {
      operationCalled = true;
    }),
    (error) => error.code === "DATA_AUTHORITY_OUTAGE_INJECTION_FORBIDDEN" && error.status === 403,
  );
  assert.equal(operationCalled, false);

  await assert.rejects(
    () => withDataAuthorityRequestScope({ env: previewEnv, injectGoogleOutage: true, injectSupabaseOutage: true }, async () => {}),
    (error) => error.code === "DATA_AUTHORITY_OUTAGE_INJECTION_CONFLICT" && error.status === 400,
  );
});

test("injected Google outage records the blocked attempt without counting an HTTP request", async () => {
  await assert.rejects(
    () => withDataAuthorityRequestScope({
      env: previewEnv,
      label: "google-outage",
      source: "supabase",
      injectGoogleOutage: true,
    }, async () => {
      recordDataAuthorityTransport("google", { adapter: "google-sheets-server-read", transport: "sheets" });
    }),
    (error) => {
      assert.equal(error.code, "DATA_AUTHORITY_GOOGLE_OUTAGE_INJECTED");
      assert.equal(error.status, 503);
      assert.equal(error.injected, true);
      assert.deepEqual(error.dataAuthorityDiagnostics, {
        label: "google-outage",
        source: "supabase",
        googleAttempts: 1,
        googleHttpRequests: 0,
        googleSheetsRequests: 0,
        googleGvizRequests: 0,
        googleOAuthRequests: 0,
        googleWriterOperations: 0,
        supabaseAttempts: 0,
        supabaseRequests: 0,
        fallbackUsed: false,
        injectedOutage: "google",
        blockedGoogleAttempts: 1,
        blockedSupabaseAttempts: 0,
        adapters: ["google-sheets-server-read"],
      });
      return true;
    },
  );
});

test("injected Supabase outage records the blocked attempt without counting a request", async () => {
  await assert.rejects(
    () => withDataAuthorityRequestScope({
      env: previewEnv,
      label: "supabase-outage",
      source: "google",
      injectSupabaseOutage: true,
    }, async () => {
      recordDataAuthorityTransport("supabase", { adapter: "scoring-shadow-rpc" });
    }),
    (error) => {
      assert.equal(error.code, "DATA_AUTHORITY_SUPABASE_OUTAGE_INJECTED");
      assert.equal(error.status, 503);
      assert.equal(error.injected, true);
      assert.deepEqual(error.dataAuthorityDiagnostics, {
        label: "supabase-outage",
        source: "google",
        googleAttempts: 0,
        googleHttpRequests: 0,
        googleSheetsRequests: 0,
        googleGvizRequests: 0,
        googleOAuthRequests: 0,
        googleWriterOperations: 0,
        supabaseAttempts: 1,
        supabaseRequests: 0,
        fallbackUsed: false,
        injectedOutage: "supabase",
        blockedGoogleAttempts: 0,
        blockedSupabaseAttempts: 1,
        adapters: ["scoring-shadow-rpc"],
      });
      return true;
    },
  );
});

test("fallback marker is request-scoped and contributes its adapter", async () => {
  const measured = await withDataAuthorityRequestScope({ env: previewEnv, source: "supabase" }, async () => {
    markDataAuthorityFallback("legacy-history-fallback");
    return currentDataAuthorityDiagnostics();
  });
  assert.equal(measured.diagnostics.fallbackUsed, true);
  assert.deepEqual(measured.diagnostics.adapters, ["legacy-history-fallback"]);

  markDataAuthorityFallback("outside-scope");
  assert.equal(currentDataAuthorityDiagnostics(), null);
});

test("resolved source can replace the pending route label without changing counters", async () => {
  const measured = await withDataAuthorityRequestScope({ env: previewEnv, source: "pending" }, async () => {
    recordDataAuthorityTransport("supabase", { adapter: "bounded-service" });
    setDataAuthorityResolvedSource("supabase");
  });
  assert.equal(measured.diagnostics.source, "supabase");
  assert.equal(measured.diagnostics.supabaseRequests, 1);
});

test("response headers expose request counts, source, fallback, and injection state", () => {
  assert.deepEqual(dataAuthorityResponseHeaders({
    source: "supabase",
    googleHttpRequests: 4,
    googleSheetsRequests: 2,
    googleGvizRequests: 1,
    googleWriterOperations: 1,
    supabaseRequests: 3,
    fallbackUsed: true,
    injectedOutage: "google",
  }), {
    "X-Data-Authority-Source": "supabase",
    "X-Data-Authority-Google-Requests": "4",
    "X-Data-Authority-Google-Sheets-Requests": "2",
    "X-Data-Authority-Google-GViz-Requests": "1",
    "X-Data-Authority-Google-Writer-Operations": "1",
    "X-Data-Authority-Supabase-Requests": "3",
    "X-Data-Authority-Fallback-Used": "true",
    "X-Data-Authority-Outage-Injection": "google",
  });
  assert.deepEqual(dataAuthorityResponseHeaders(), {
    "X-Data-Authority-Source": "unknown",
    "X-Data-Authority-Google-Requests": "0",
    "X-Data-Authority-Google-Sheets-Requests": "0",
    "X-Data-Authority-Google-GViz-Requests": "0",
    "X-Data-Authority-Google-Writer-Operations": "0",
    "X-Data-Authority-Supabase-Requests": "0",
    "X-Data-Authority-Fallback-Used": "false",
    "X-Data-Authority-Outage-Injection": "none",
  });
});

test("parallel request scopes retain independent counters, adapters, labels, and sources", async () => {
  let arrivals = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  async function rendezvous() {
    arrivals += 1;
    if (arrivals === 2) release();
    await barrier;
  }

  const [googleScope, supabaseScope] = await Promise.all([
    withDataAuthorityRequestScope({ env: previewEnv, label: "parallel-google", source: "google" }, async () => {
      recordDataAuthorityTransport("google", { adapter: "parallel-sheets", transport: "sheets" });
      await rendezvous();
      recordDataAuthorityTransport("google", { adapter: "parallel-oauth", transport: "oauth" });
      return currentDataAuthorityDiagnostics();
    }),
    withDataAuthorityRequestScope({ env: previewEnv, label: "parallel-supabase", source: "supabase" }, async () => {
      recordDataAuthorityTransport("supabase", { adapter: "parallel-rpc" });
      await rendezvous();
      markDataAuthorityFallback("parallel-fallback");
      return currentDataAuthorityDiagnostics();
    }),
  ]);

  assert.deepEqual({
    label: googleScope.diagnostics.label,
    source: googleScope.diagnostics.source,
    googleAttempts: googleScope.diagnostics.googleAttempts,
    supabaseAttempts: googleScope.diagnostics.supabaseAttempts,
    fallbackUsed: googleScope.diagnostics.fallbackUsed,
    adapters: googleScope.diagnostics.adapters,
  }, {
    label: "parallel-google",
    source: "google",
    googleAttempts: 2,
    supabaseAttempts: 0,
    fallbackUsed: false,
    adapters: ["parallel-oauth", "parallel-sheets"],
  });
  assert.deepEqual({
    label: supabaseScope.diagnostics.label,
    source: supabaseScope.diagnostics.source,
    googleAttempts: supabaseScope.diagnostics.googleAttempts,
    supabaseAttempts: supabaseScope.diagnostics.supabaseAttempts,
    fallbackUsed: supabaseScope.diagnostics.fallbackUsed,
    adapters: supabaseScope.diagnostics.adapters,
  }, {
    label: "parallel-supabase",
    source: "supabase",
    googleAttempts: 0,
    supabaseAttempts: 1,
    fallbackUsed: true,
    adapters: ["parallel-fallback", "parallel-rpc"],
  });
  assert.deepEqual(googleScope.result, googleScope.diagnostics);
  assert.deepEqual(supabaseScope.result, supabaseScope.diagnostics);
});
