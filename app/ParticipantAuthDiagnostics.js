"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  finishParticipantAuthNavigation,
  flushParticipantAuthDiagnostics,
  participantAuthDiagnosticsEnabled,
  recordParticipantAuthDiagnostic,
  rememberParticipantAuthNavigation,
} from "../lib/participant-auth-client-diagnostics.js";

export default function ParticipantAuthDiagnostics() {
  const pathname = usePathname();
  useEffect(() => {
    if (!participantAuthDiagnosticsEnabled()) return;
    finishParticipantAuthNavigation(pathname);
    flushParticipantAuthDiagnostics().catch(() => null);
  }, [pathname]);
  useEffect(() => {
    if (!participantAuthDiagnosticsEnabled()) return;
    const navigation = performance.getEntriesByType("navigation")[0];
    recordParticipantAuthDiagnostic("PWA_REOPEN", { routeTo: location.pathname,
      durationMs: navigation?.duration, navigationType: navigation?.type || "" });
    const click = (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor || anchor.origin !== location.origin) return;
      rememberParticipantAuthNavigation(location.pathname, anchor.href);
    };
    const visibility = () => recordParticipantAuthDiagnostic(document.hidden ? "APP_BACKGROUND" : "APP_FOREGROUND", { routeTo: location.pathname });
    document.addEventListener("click", click, true);
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("click", click, true); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  return null;
}
