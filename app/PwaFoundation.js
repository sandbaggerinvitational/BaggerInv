"use client";

import { useEffect, useState } from "react";

export default function PwaFoundation() {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(true);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    setDismissed(window.localStorage.getItem("sbi-pwa-prompt-dismissed") === "true");
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setShowIosHelp(ios && !standalone);
    const capture = (event) => {
      event.preventDefault();
      setPrompt(event);
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  if (dismissed || (!prompt && !showIosHelp)) return null;
  return <aside aria-label="Install SBI app" style={{ position: "fixed", zIndex: 30, right: 14, bottom: 14, display: "flex", alignItems: "center", gap: 8, maxWidth: 340, padding: 10, border: "1px solid #c7a34c", borderRadius: 14, background: "#fffdf8", boxShadow: "0 12px 30px rgba(6,48,37,.18)", color: "#073c2f" }}>
    {prompt ? (
      <button type="button" onClick={async () => {
        await prompt.prompt();
        setPrompt(null);
      }} style={{ minHeight: 44, border: 0, borderRadius: 999, padding: "9px 14px", background: "#073c2f", color: "#fff", fontWeight: 800 }}>Install SBI</button>
    ) : (
      <p style={{ margin: 0, padding: "4px 6px", fontSize: 13, lineHeight: 1.35 }}>
        Install SBI: tap Share, then <strong>Add to Home Screen</strong>.
      </p>
    )}
    <button type="button" aria-label="Dismiss install guidance" onClick={() => { setDismissed(true); window.localStorage.setItem("sbi-pwa-prompt-dismissed", "true"); }} style={{ minWidth: 44, minHeight: 44, border: 0, background: "transparent", fontSize: 20 }}>×</button>
  </aside>;
}
