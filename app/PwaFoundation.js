"use client";

import { useEffect, useState } from "react";
import styles from "./pwa-foundation.module.css";

export default function PwaFoundation() {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(true);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [online, setOnline] = useState(true);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateReady(true);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      }).catch(() => {});
    }
    const syncOnlineState = () => setOnline(navigator.onLine);
    syncOnlineState();
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
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
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  if (!online) return <aside className={styles.offline} role="status" aria-live="polite"><i aria-hidden="true" />Offline · scores require a connection</aside>;
  if (updateReady) return <aside className={styles.update} role="status"><p>A newer version of SBI is ready.</p><button type="button" onClick={() => window.location.reload()}>Update</button></aside>;
  if (dismissed || (!prompt && !showIosHelp)) return null;
  return <aside className={styles.install} aria-label="Install SBI app">
    {prompt ? (
      <button type="button" onClick={async () => {
        await prompt.prompt();
        setPrompt(null);
      }}>Install SBI</button>
    ) : (
      <p>
        Install SBI: tap Share, then <strong>Add to Home Screen</strong>.
      </p>
    )}
    <button className={styles.dismiss} type="button" aria-label="Dismiss install guidance" onClick={() => { setDismissed(true); window.localStorage.setItem("sbi-pwa-prompt-dismissed", "true"); }}>×</button>
  </aside>;
}
