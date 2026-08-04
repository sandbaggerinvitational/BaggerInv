"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTransientRetry } from "../lib/transient-fetch";

export default function TournamentInitializationRecovery() {
  const router = useRouter();
  const active = useRef(false);
  const [state, setState] = useState("preparing");

  const recover = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setState("preparing");
    try {
      const response = await fetchWithTransientRetry("/api/live", { cache: "no-store" });
      if (!response.ok) throw new Error("Tournament initialization did not recover.");
      setState("ready");
      router.refresh();
    } catch {
      setState("failed");
    } finally {
      active.current = false;
    }
  }, [router]);

  useEffect(() => { recover(); }, [recover]);

  return <section className="mobileHomeLoadError" role={state === "failed" ? "alert" : "status"} aria-live="polite">
    {state === "failed" ? <>
      <h1>Tournament unavailable</h1>
      <p>We couldn’t finish preparing your tournament. Please try again.</p>
      <button type="button" onClick={recover}>Retry</button>
    </> : <>
      <h1>Preparing Tournament…</h1>
      <p>Please wait while tournament data is refreshed.</p>
    </>}
  </section>;
}
