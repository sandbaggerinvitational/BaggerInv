"use client";

import { useEffect, useState } from "react";
import styles from "./pwa-foundation.module.css";
import { ConnectionBanner } from "./ui/StatePrimitives";

export default function PwaFoundation() {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(true);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [online, setOnline] = useState(true);
  const [updateReady, setUpdateReady] = useState(false);
  const [showGlobalInstall, setShowGlobalInstall] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
        registration.update().catch(() => {});
      }).catch(() => {});
    }
    const syncOnlineState = () => setOnline(navigator.onLine);
    syncOnlineState();
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    setDismissed(window.localStorage.getItem("sbi-pwa-prompt-dismissed") === "true");
    // Authentication stays focused on sign-in; install guidance resumes on
    // ordinary PWA routes where it cannot cover the primary auth action.
    setShowGlobalInstall(!["/home", "/participant-auth"].includes(window.location.pathname));
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setShowIosHelp(ios && !standalone);
    const capture = (event) => {
      event.preventDefault();
      window.__sbiInstallPrompt = event;
      window.dispatchEvent(new Event("sbi:pwa-installable"));
      setPrompt(event);
      setDismissed(false);
    };
    const installed = () => {
      window.__sbiInstallPrompt = null;
      window.dispatchEvent(new Event("sbi:pwa-installed"));
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  if (!online) return <ConnectionBanner state="offline">You’re offline. Saved information stays available.</ConnectionBanner>;
  if (updateReady) return <aside className={styles.update} role="status"><p>A newer version of SBI is ready.</p><button type="button" onClick={() => window.location.reload()}>Update</button></aside>;
  if (!showGlobalInstall || dismissed || (!prompt && !showIosHelp)) return null;
  return <aside className={`${styles.install} pwaInstallGuidance`} aria-label="Install The Bagger app">
    <div><strong>Install The Bagger</strong><ol aria-label="Installation steps"><li>Tap Share</li><li>Add to Home Screen</li><li>Tap Add</li></ol></div>
    <button className={styles.dismiss} type="button" aria-label="Dismiss install guidance" onClick={() => { setDismissed(true); window.localStorage.setItem("sbi-pwa-prompt-dismissed", "true"); }}>×</button>
  </aside>;
}
