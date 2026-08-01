"use client";

import { useEffect, useState } from "react";
import styles from "./player-setup-banner.module.css";

async function saveReadiness(update) {
  const response = await fetch("/api/player-passport/readiness", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error("Readiness could not be saved.");
  return response.json();
}

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function PlayerSetupBanner({ readiness, onUpdated }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const capture = () => setInstallPrompt(window.__sbiInstallPrompt || null);
    const installed = () => saveReadiness({ pwaInstalled: true }).then(onUpdated).catch(() => {});
    capture();
    window.addEventListener("sbi:pwa-installable", capture);
    window.addEventListener("sbi:pwa-installed", installed);
    return () => {
      window.removeEventListener("sbi:pwa-installable", capture);
      window.removeEventListener("sbi:pwa-installed", installed);
    };
  }, [onUpdated]);

  useEffect(() => {
    if (!readiness || readiness.pwaInstalled || !standalone()) return;
    saveReadiness({ pwaInstalled: true }).then(onUpdated).catch(() => {});
  }, [readiness, onUpdated]);

  useEffect(() => {
    if (!readiness || readiness.notificationsEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    saveReadiness({ notificationsEnabled: true }).then(onUpdated).catch(() => {});
  }, [readiness, onUpdated]);

  if (!readiness || (readiness.pwaInstalled && readiness.notificationsEnabled)) return null;

  if (!readiness.pwaInstalled) return <aside className={styles.banner} aria-label="Tournament app setup">
    <span aria-hidden="true">📱</span><div><strong>Get the full tournament experience</strong><p>Add Sandbagger Invitational to your Home Screen.</p>{message ? <small role="status">{message}</small> : null}</div>
    <button disabled={busy} onClick={async () => {
      setBusy(true); setMessage("");
      try {
        const prompt = installPrompt || window.__sbiInstallPrompt;
        if (prompt) {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice?.outcome === "accepted") setMessage("Finishing installation…");
        } else setMessage("Tap Share, then Add to Home Screen.");
      } finally { setBusy(false); }
    }}>Install</button>
  </aside>;

  return <aside className={styles.banner} aria-label="Tournament notification setup">
    <span aria-hidden="true">🔔</span><div><strong>Never miss a match update</strong><p>Enable notifications for tournament updates.</p>{message ? <small role="status">{message}</small> : null}</div>
    <button disabled={busy} onClick={async () => {
      setBusy(true); setMessage("");
      try {
        if (typeof Notification === "undefined") return setMessage("Notifications are not supported on this device.");
        const permission = await Notification.requestPermission();
        if (permission === "granted") { await saveReadiness({ notificationsEnabled: true }); await onUpdated?.(); }
        else setMessage("Notifications remain off. You can enable them in device settings.");
      } catch { setMessage("Notifications could not be enabled right now."); }
      finally { setBusy(false); }
    }}>Turn On</button>
  </aside>;
}
