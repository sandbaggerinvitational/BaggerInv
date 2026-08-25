"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { claimOddsCenterLoadingReload } from "../../lib/odds-center-loading-recovery";

const ROUTER_RECOVERY_AFTER_MS = 8_000;
const RELOAD_RECOVERY_AFTER_MS = 16_000;

export default function OddsCenterLoading() {
  const router = useRouter();
  const routerRecoveryAttempted = useRef(false);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || routerRecoveryAttempted.current) return;
      routerRecoveryAttempted.current = true;
      router.refresh();
    };
    const reload = () => {
      if (document.visibilityState !== "visible") return;
      try { if (!claimOddsCenterLoadingReload(window.sessionStorage)) return; }
      catch { return; }
      window.location.reload();
    };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const refreshTimer = window.setTimeout(refresh, ROUTER_RECOVERY_AFTER_MS);
    const reloadTimer = window.setTimeout(reload, RELOAD_RECOVERY_AFTER_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(refreshTimer);
      window.clearTimeout(reloadTimer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [router]);

  return <main className="appLoading" aria-live="polite" aria-busy="true" aria-label="Loading Odds Center">
    <div className="loadingBrand" role="status">Loading Odds Center…</div>
    <div className="loadingShell" aria-hidden="true">
      <div className="skeleton skeletonTitle" />
      <div className="skeleton skeletonLine" />
      <div className="skeleton skeletonLine short" />
      <div className="loadingGrid">
        <div className="skeleton loadingCard" />
        <div className="skeleton loadingCard" />
        <div className="skeleton loadingCard" />
      </div>
    </div>
  </main>;
}
