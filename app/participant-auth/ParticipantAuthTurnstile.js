"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function ParticipantAuthTurnstile({ siteKey, action, onTokenChange, resetKey = 0 }) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const [scriptReady, setScriptReady] = useState(false);

  const removeWidget = useCallback(() => {
    if (widgetRef.current !== null && window.turnstile) {
      try { window.turnstile.remove(widgetRef.current); } catch { /* Widget may already be gone. */ }
    }
    widgetRef.current = null;
  }, []);

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile || widgetRef.current !== null) return;
    widgetRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      theme: "light",
      size: "flexible",
      appearance: "interaction-only",
      callback: (token) => onTokenChange(token),
      "expired-callback": () => onTokenChange(""),
      "timeout-callback": () => onTokenChange(""),
      "error-callback": () => { onTokenChange(""); return true; },
    });
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
      onTokenChange("");
    }
  }, [onTokenChange, resetKey]);

  if (!siteKey) return null;
  return <div aria-label="Request verification" role="group">
    <Script src={TURNSTILE_SCRIPT} strategy="afterInteractive" onLoad={() => setScriptReady(true)} />
    <div ref={containerRef} />
  </div>;
}
