"use client";

const ENABLED = "bagger-participant-auth-diagnostics-enabled";
const SAMPLES = "bagger-participant-auth-diagnostics";
const NAVIGATION = "bagger-participant-auth-navigation";

const available = () => typeof window !== "undefined" && window.localStorage;
const deviceClass = () => /iPhone/i.test(navigator.userAgent) ? "IPHONE" : /Mobile/i.test(navigator.userAgent) ? "MOBILE" : "DESKTOP";

export function enableParticipantAuthDiagnostics() {
  if (available()) localStorage.setItem(ENABLED, "1");
}
export function participantAuthDiagnosticsEnabled() {
  return available() && localStorage.getItem(ENABLED) === "1";
}
export function recordParticipantAuthDiagnostic(eventType, fields = {}) {
  if (!participantAuthDiagnosticsEnabled()) return;
  const current = JSON.parse(localStorage.getItem(SAMPLES) || "[]");
  current.push({ event_type: eventType, duration_ms: Number.isFinite(fields.durationMs) ? Math.max(0, Math.round(fields.durationMs)) : null,
    route_from: fields.routeFrom || "", route_to: fields.routeTo || "", navigation_type: fields.navigationType || "",
    device_class: deviceClass(), recorded_at: new Date().toISOString() });
  localStorage.setItem(SAMPLES, JSON.stringify(current.slice(-100)));
}
export function rememberParticipantAuthNavigation(routeFrom, routeTo, navigationType = "") {
  if (participantAuthDiagnosticsEnabled()) localStorage.setItem(NAVIGATION, JSON.stringify({ routeFrom, routeTo, navigationType, startedAt: performance.now() }));
}
export function finishParticipantAuthNavigation(routeTo) {
  if (!participantAuthDiagnosticsEnabled()) return;
  const pending = JSON.parse(localStorage.getItem(NAVIGATION) || "null");
  if (pending?.routeTo && new URL(pending.routeTo, location.origin).pathname === routeTo) {
    recordParticipantAuthDiagnostic("ROUTE_NAVIGATION", { routeFrom: pending.routeFrom, routeTo,
      durationMs: performance.now() - pending.startedAt, navigationType: pending.navigationType });
    localStorage.removeItem(NAVIGATION);
  }
}
export async function flushParticipantAuthDiagnostics() {
  if (!participantAuthDiagnosticsEnabled()) return { uploaded: 0 };
  const samples = JSON.parse(localStorage.getItem(SAMPLES) || "[]").slice(0, 50);
  if (!samples.length) return { uploaded: 0 };
  const response = await fetch("/api/participant/auth/diagnostics", { method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ samples }) });
  if (!response.ok) return { uploaded: 0 };
  const payload = await response.json();
  const remaining = JSON.parse(localStorage.getItem(SAMPLES) || "[]").slice(samples.length);
  localStorage.setItem(SAMPLES, JSON.stringify(remaining));
  return { uploaded: Number(payload.inserted || 0) };
}
export function clearParticipantAuthClientState() {
  if (!available()) return;
  localStorage.removeItem(SAMPLES);
  localStorage.removeItem(NAVIGATION);
  localStorage.removeItem(ENABLED);
}
