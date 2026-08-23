import { AsyncLocalStorage } from "node:async_hooks";

const requestScope = new AsyncLocalStorage();
const clean = (value) => String(value ?? "").trim();

function outageError(kind) {
  const normalized = clean(kind).toUpperCase();
  const error = new Error(`${normalized === "GOOGLE" ? "Google" : "Supabase"} is unavailable for this Preview certification request.`);
  error.code = `DATA_AUTHORITY_${normalized}_OUTAGE_INJECTED`;
  error.status = 503;
  error.injected = true;
  return error;
}

function emptyDiagnostics({ label = "application-request", source = "", injectGoogleOutage = false, injectSupabaseOutage = false } = {}) {
  return {
    label: clean(label) || "application-request",
    source: clean(source) || "unknown",
    googleAttempts: 0,
    googleHttpRequests: 0,
    googleSheetsRequests: 0,
    googleGvizRequests: 0,
    googleOAuthRequests: 0,
    googleWriterOperations: 0,
    supabaseAttempts: 0,
    supabaseRequests: 0,
    fallbackUsed: false,
    injectedOutage: injectGoogleOutage ? "google" : injectSupabaseOutage ? "supabase" : "none",
    blockedGoogleAttempts: 0,
    blockedSupabaseAttempts: 0,
    adapters: new Set(),
  };
}

function snapshot(state = requestScope.getStore()) {
  if (!state) return null;
  return Object.freeze({
    ...Object.fromEntries(Object.entries(state).filter(([key]) => key !== "adapters")),
    adapters: [...state.adapters].sort(),
  });
}

export async function withDataAuthorityRequestScope(options = {}, operation) {
  if (typeof operation !== "function") throw new TypeError("A data-authority request operation is required.");
  const parent = requestScope.getStore();
  if (parent) return { result: await operation(), diagnostics: snapshot(parent) };
  const env = options.env || process.env;
  const injectGoogleOutage = options.injectGoogleOutage === true;
  const injectSupabaseOutage = options.injectSupabaseOutage === true;
  if ((injectGoogleOutage || injectSupabaseOutage) && clean(env.VERCEL_ENV).toLowerCase() !== "preview") {
    const error = new Error("Data-authority outage injection is restricted to isolated Preview requests.");
    error.code = "DATA_AUTHORITY_OUTAGE_INJECTION_FORBIDDEN";
    error.status = 403;
    throw error;
  }
  if (injectGoogleOutage && injectSupabaseOutage) {
    const error = new Error("Only one data-authority outage may be injected per request.");
    error.code = "DATA_AUTHORITY_OUTAGE_INJECTION_CONFLICT";
    error.status = 400;
    throw error;
  }
  const state = emptyDiagnostics({ ...options, injectGoogleOutage, injectSupabaseOutage });
  try {
    const result = await requestScope.run(state, operation);
    return { result, diagnostics: snapshot(state) };
  } catch (error) {
    error.dataAuthorityDiagnostics = snapshot(state);
    throw error;
  }
}

export function recordDataAuthorityTransport(kind, details = {}) {
  const state = requestScope.getStore();
  if (!state) return;
  const normalized = clean(kind).toLowerCase();
  const adapter = clean(details.adapter);
  if (adapter) state.adapters.add(adapter);
  if (normalized === "google") {
    state.googleAttempts += 1;
    if (state.injectedOutage === "google") {
      state.blockedGoogleAttempts += 1;
      throw outageError("google");
    }
    state.googleHttpRequests += 1;
    if (details.transport === "sheets") state.googleSheetsRequests += 1;
    if (details.transport === "gviz") state.googleGvizRequests += 1;
    if (details.transport === "oauth") state.googleOAuthRequests += 1;
    if (details.writer === true) state.googleWriterOperations += 1;
    return;
  }
  if (normalized === "supabase") {
    state.supabaseAttempts += 1;
    if (state.injectedOutage === "supabase") {
      state.blockedSupabaseAttempts += 1;
      throw outageError("supabase");
    }
    state.supabaseRequests += 1;
  }
}

export function dataAuthorityFetch(kind, details = {}) {
  return (input, init) => {
    recordDataAuthorityTransport(kind, details);
    return fetch(input, init);
  };
}

export function markDataAuthorityFallback(adapter = "") {
  const state = requestScope.getStore();
  if (!state) return;
  state.fallbackUsed = true;
  if (clean(adapter)) state.adapters.add(clean(adapter));
}

export function setDataAuthorityResolvedSource(source) {
  const state = requestScope.getStore();
  if (!state) return;
  state.source = clean(source) || "unknown";
}

export function currentDataAuthorityDiagnostics() {
  return snapshot();
}

export function dataAuthorityResponseHeaders(diagnostics = {}) {
  return {
    "X-Data-Authority-Source": clean(diagnostics.source || "unknown"),
    "X-Data-Authority-Google-Requests": String(Number(diagnostics.googleHttpRequests || 0)),
    "X-Data-Authority-Google-Sheets-Requests": String(Number(diagnostics.googleSheetsRequests || 0)),
    "X-Data-Authority-Google-GViz-Requests": String(Number(diagnostics.googleGvizRequests || 0)),
    "X-Data-Authority-Google-Writer-Operations": String(Number(diagnostics.googleWriterOperations || 0)),
    "X-Data-Authority-Supabase-Requests": String(Number(diagnostics.supabaseRequests || 0)),
    "X-Data-Authority-Fallback-Used": diagnostics.fallbackUsed ? "true" : "false",
    "X-Data-Authority-Outage-Injection": clean(diagnostics.injectedOutage || "none"),
  };
}
