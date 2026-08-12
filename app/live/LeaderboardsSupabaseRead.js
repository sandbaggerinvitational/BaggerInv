"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushParticipantAuthDiagnostics, recordParticipantAuthDiagnostic } from "../../lib/participant-auth-client-diagnostics.js";
import { readLeaderboardsCoreCache, writeLeaderboardsCoreCache } from "../../lib/leaderboards-core-cache.js";
import LeaderboardsDashboard from "./LeaderboardsDashboard";
import styles from "./leaderboards-dashboard.module.css";

function parseTiming(value = "") {
  return Object.fromEntries(String(value).split(",").map((entry) => {
    const [name, duration] = entry.trim().split(";dur=");
    return [name, Number(duration) || 0];
  }).filter(([name]) => name));
}

export default function LeaderboardsSupabaseRead({ previewMode = false, netSkinsReadSource = "google", calcuttaReadSource = "google" }) {
  const router = useRouter();
  const initial = useMemo(() => readLeaderboardsCoreCache(), []);
  const [payload, setPayload] = useState(initial);
  const [state, setState] = useState(initial ? "ready" : "loading");
  const requestSequence = useRef(0);
  const controllerRef = useRef(null);

  const acceptData = useCallback((next) => {
    if (!next?.data?.tournament || !next?.player?.id) return;
    writeLeaderboardsCoreCache(next);
    setPayload(next);
    setState("ready");
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = performance.now();
    try {
      const response = await fetch("/api/leaderboards/core", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (sequence !== requestSequence.current) return;
      if (!response.ok || !result.data?.tournament) throw new Error(result.code || "LEADERBOARDS_CORE_READ_UNAVAILABLE");
      acceptData({ data: result.data, player: result.player });
      const clientTotal = performance.now() - startedAt;
      const timings = parseTiming(response.headers.get("server-timing") || "");
      recordParticipantAuthDiagnostic("LEADERBOARDS_CORE_USABLE", { routeTo: "/live?view=leaderboards", durationMs: clientTotal });
      console.info("Leaderboards core Supabase timing", { ...timings, clientTotal: Math.round(clientTotal),
        cachedPresentation: Boolean(initial), googleRequests: Number(response.headers.get("x-leaderboards-core-google-requests") || 0),
        sourceFingerprint: response.headers.get("x-leaderboards-core-fingerprint") || "" });
      const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 450));
      schedule(() => {
        router.prefetch("/live");
        router.prefetch("/my-match");
        recordParticipantAuthDiagnostic("LEADERBOARDS_PREFETCH_COMPLETE", { routeTo: "/live?view=leaderboards", durationMs: performance.now() - startedAt });
        flushParticipantAuthDiagnostics().catch(() => null);
      }, { timeout: 1200 });
    } catch (error) {
      if (error?.name === "AbortError" || sequence !== requestSequence.current) return;
      setState((current) => current === "ready" ? "ready" : "error");
    }
  }, [acceptData, initial, router]);

  useEffect(() => {
    if (initial) recordParticipantAuthDiagnostic("LEADERBOARDS_CACHED_CORE", { routeTo: "/live?view=leaderboards", durationMs: 0 });
    refresh();
    const navigating = () => { requestSequence.current += 1; controllerRef.current?.abort(); };
    window.addEventListener("participant-navigation-start", navigating);
    return () => {
      controllerRef.current?.abort();
      window.removeEventListener("participant-navigation-start", navigating);
    };
  // Initial mount owns refresh; LeaderboardsDashboard owns later compact refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (payload?.data?.tournament) return <LeaderboardsDashboard
    initialData={payload.data}
    initialCurrentPlayer={payload.player}
    previewMode={previewMode}
    coreReadSource="supabase"
    coreReadUrl="/api/leaderboards/core"
    secondaryReadUrl={netSkinsReadSource === "supabase" ? "/api/leaderboards/net-skins" : "/api/live"}
    calcuttaReadUrl={calcuttaReadSource === "supabase" ? "/api/leaderboards/calcutta" : "/api/live"}
    onConfirmedCore={(data, player) => acceptData({ data, player: player || payload.player })}
  />;

  return <section className={styles.page}><div className={styles.empty} role="status">
    <strong>{state === "error" ? "Core Leaderboards are temporarily unavailable." : "Opening Leaderboards…"}</strong>
    <span>{state === "error" ? "Tournament scores are unchanged. Try again when the connection is available." : "Loading official team and player standings."}</span>
    {state === "error" ? <button type="button" onClick={refresh}>Try again</button> : null}
  </div></section>;
}
