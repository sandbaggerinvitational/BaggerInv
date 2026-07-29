"use client";

import { useEffect, useState } from "react";

export default function PwaFoundation() {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    setDismissed(window.localStorage.getItem("sbi-pwa-prompt-dismissed") === "true");
    const capture = (event) => {
      event.preventDefault();
      setPrompt(event);
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  if (!prompt || dismissed) return null;
  return <aside aria-label="Install SBI app" style={{ position: "fixed", zIndex: 30, right: 14, bottom: 14, display: "flex", alignItems: "center", gap: 8, maxWidth: 340, padding: 10, border: "1px solid #c7a34c", borderRadius: 14, background: "#fffdf8", boxShadow: "0 12px 30px rgba(6,48,37,.18)", color: "#073c2f" }}>
    <button type="button" onClick={() => prompt.prompt()} style={{ minHeight: 44, border: 0, borderRadius: 999, padding: "9px 14px", background: "#073c2f", color: "#fff", fontWeight: 800 }}>Add SBI to Home Screen</button>
    <button type="button" aria-label="Dismiss install guidance" onClick={() => { setDismissed(true); window.localStorage.setItem("sbi-pwa-prompt-dismissed", "true"); }} style={{ minWidth: 44, minHeight: 44, border: 0, background: "transparent", fontSize: 20 }}>×</button>
  </aside>;
}
