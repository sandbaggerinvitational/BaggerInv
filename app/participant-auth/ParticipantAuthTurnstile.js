"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function ParticipantAuthTurnstile({ siteKey, action, onTokenChange, resetKey = 0 }) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [widgetStatus, setWidgetStatus] = useState("loading");

  const removeWidget = useCallback(() => {
    if (widgetRef.current !== null && window.turnstile) {
      try { window.turnstile.remove(widgetRef.current); } catch { /* Widget may already be gone. */ }
    }
    widgetRef.current = null;
  }, []);

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile || widgetRef.current !== null) return;
    setWidgetStatus("loading");
    try {
      widgetRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: "light",
        size: "flexible",
        appearance: "always",
        callback: (token) => { setWidgetStatus("verified"); onTokenChange(token); },
        "expired-callback": () => { setWidgetStatus("loading"); onTokenChange(""); },
        "timeout-callback": () => { setWidgetStatus("error"); onTokenChange(""); },
        "error-callback": () => { setWidgetStatus("error"); onTokenChange(""); return true; },
      });
    } catch {
      setWidgetStatus("error");
      onTokenChange("");
    }
  }, [action, onTokenChange, siteKey]);

  useEffect(() => {
    if (window.turnstile) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (!scriptReady) return undefined;
    removeWidget();
    renderWidget();
    return removeWidget;
  }, [scriptReady, renderWidget, removeWidget]);

  useEffect(() => {
    if (widgetRef.current !== null && window.turnstile) {
      try { window.turnstile.reset(widgetRef.current); } catch { /* A rerender will restore it. */ }
      setWidgetStatus("loading");
      onTokenChange("");
    }
  }, [onTokenChange, resetKey]);

  if (!siteKey) return null;
  return <div aria-label="Request verification" role="group" aria-busy={widgetStatus === "loading" ? "true" : undefined}>
    <Script
      src={TURNSTILE_SCRIPT}
      strategy="afterInteractive"
      onReady={() => { setWidgetStatus("loading"); setScriptReady(true); }}
      onError={() => { setWidgetStatus("error"); onTokenChange(""); }}
    />
    <div ref={containerRef} />
    {widgetStatus === "error"
      ? <p role="alert">Request verification could not load. Turn off content blockers for this site, then reload.</p>
      : null}
  </div>;
}
