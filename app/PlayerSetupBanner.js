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

function applicationServerKey(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function syncPushSubscription(requestPermission = false) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") throw new Error("Notifications are not supported on this device.");
  // Keep the permission request inside the original tap's user activation.
  // Awaiting configuration first causes iOS to discard the gesture and require another tap.
  const permission = requestPermission ? await Notification.requestPermission() : Notification.permission;
  const configResponse = await fetch("/api/player-passport/notifications", { cache: "no-store" });
  const config = await configResponse.json();
  if (!configResponse.ok || !config.available || !config.publicKey) throw new Error("Notifications are not available in this Preview yet.");
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (permission === "granted" && !subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(config.publicKey) });
  const response = await fetch("/api/player-passport/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ permission, subscription: permission === "granted" ? subscription?.toJSON() : null }) });
  if (!response.ok) throw new Error("Notification readiness could not be saved.");
  return { permission, ...(await response.json()) };
}

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function PlayerSetupBanner({ readiness, onUpdated }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [installabilityEnabled, setInstallabilityEnabled] = useState(false);

  useEffect(() => {
    setInstallabilityEnabled(
      document.documentElement.dataset.browserInstallability !== "retired",
    );
  }, []);

  useEffect(() => {
    if (!readiness || !installabilityEnabled) return undefined;
    const installed = () => saveReadiness({ pwaInstalled: true }).then(onUpdated).catch(() => {});
    window.addEventListener("sbi:pwa-installed", installed);
    return () => {
      window.removeEventListener("sbi:pwa-installed", installed);
    };
  }, [installabilityEnabled, onUpdated, readiness]);

  useEffect(() => {
    if (!readiness || readiness.pwaInstalled || !standalone()) return;
    saveReadiness({ pwaInstalled: true }).then(onUpdated).catch(() => {});
  }, [readiness, onUpdated]);

  useEffect(() => {
    if (!readiness || typeof Notification === "undefined") return;
    const needsSubscription = Notification.permission === "granted" && !readiness.notificationReady;
    const permissionWasRemoved = Notification.permission !== "granted" && readiness.notificationReady;
    if (needsSubscription || permissionWasRemoved) syncPushSubscription(false).then(onUpdated).catch(() => {});
  }, [readiness, onUpdated]);

  if (!readiness || (readiness.pwaInstalled && (readiness.notificationReady || readiness.notificationsEnabled))) return null;

  if (!readiness.pwaInstalled && !installabilityEnabled) return null;

  if (!readiness.pwaInstalled) return <aside className={styles.banner} aria-label="Tournament app setup">
    <span aria-hidden="true">📱</span><div><strong>Get the full tournament experience</strong><p>Add The Bagger to your Home Screen:</p><ol aria-label="Installation steps"><li>Tap Share</li><li>Add to Home Screen</li><li>Tap Add</li></ol>{message ? <small role="status">{message}</small> : null}</div>
  </aside>;

  return <aside className={styles.banner} aria-label="Tournament notification setup">
    <span aria-hidden="true">🔔</span><div><strong>Never miss a match update</strong><p>Enable notifications for tournament updates.</p>{message ? <small role="status">{message}</small> : null}</div>
    <button disabled={busy} onClick={async () => {
      setBusy(true); setMessage("");
      try {
        if (typeof Notification === "undefined") return setMessage("Notifications are not supported on this device.");
        const { permission } = await syncPushSubscription(true);
        if (permission === "granted") { await onUpdated?.(); }
        else setMessage("Notifications remain off. You can enable them in device settings.");
      } catch { setMessage("Notifications could not be enabled right now."); }
      finally { setBusy(false); }
    }}>Turn On</button>
  </aside>;
}
