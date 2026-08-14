"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushParticipantAuthDiagnostics, recordParticipantAuthDiagnostic } from "../../lib/participant-auth-client-diagnostics.js";
import { readTournamentLiveCache, writeTournamentLiveCache } from "../../lib/tournament-live-cache.js";
import TournamentDashboard from "./TournamentDashboard";
import styles from "./tournament-dashboard.module.css";
import { ErrorState, ScreenSkeleton } from "../ui/StatePrimitives";

function parseTiming(value = "") {
  return Object.fromEntries(String(value).split(",").map((entry) => {
    const [name, duration] = entry.trim().split(";dur=");
    return [name, Number(duration) || 0];
  }).filter(([name]) => name));
}

function likelyGameCenter(data) {
  const matches = (data?.rounds || []).flatMap((round) => round.matches || []);
  return matches.find((match) => String(match.status).toUpperCase() === "LIVE") ||
    matches.find((match) => String(match.status).toUpperCase() !== "FINAL") || matches[0];
}

export default function TournamentSupabaseRead() {
  const router = useRouter();
  const initial = useMemo(() => readTournamentLiveCache(), []);
  const [payload, setPayload] = useState(initial);
  const [state, setState] = useState(initial ? "ready" : "loading");
  const requestSequence = useRef(0);
  const controllerRef = useRef(null);

  const acceptData = useCallback((next) => {
    if (!next?.tournament) return;
    writeTournamentLiveCache(next);
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
      const response = await fetch("/api/tournament/live", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (sequence !== requestSequence.current) return;
      if (!response.ok || !result.data?.tournament) throw new Error(result.code || "TOURNAMENT_READ_UNAVAILABLE");
      acceptData(result.data);
      const clientTotal = performance.now() - startedAt;
      const timings = parseTiming(response.headers.get("server-timing") || "");
      recordParticipantAuthDiagnostic("TOURNAMENT_HEADER_USABLE", { routeTo: "/live", durationMs: clientTotal });
      recordParticipantAuthDiagnostic("TOURNAMENT_LIVE_STATE_USABLE", { routeTo: "/live", durationMs: clientTotal });
      console.info("Tournament Supabase load timing", { ...timings, clientTotal: Math.round(clientTotal),
        cachedPresentation: Boolean(initial), googleRequests: Number(response.headers.get("x-tournament-google-requests") || 0) });
      const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 450));
      schedule(() => {
        router.prefetch("/my-match");
        router.prefetch("/live?view=leaderboards");
        const match = likelyGameCenter(result.data);
        if (match?.id) router.prefetch(`/game-center/${encodeURIComponent(match.id)}?from=tournament`);
        recordParticipantAuthDiagnostic("TOURNAMENT_PREFETCH_COMPLETE", { routeTo: "/live", durationMs: performance.now() - startedAt });
        flushParticipantAuthDiagnostics().catch(() => null);
      }, { timeout: 1200 });
    } catch (error) {
      if (error?.name === "AbortError" || sequence !== requestSequence.current) return;
      setState((current) => current === "ready" ? "ready" : "error");
    }
  }, [acceptData, initial, router]);

  useEffect(() => {
    if (initial) {
      recordParticipantAuthDiagnostic("TOURNAMENT_CACHED_SHELL", { routeTo: "/live", durationMs: 0 });
      recordParticipantAuthDiagnostic("TOURNAMENT_HEADER_USABLE", { routeTo: "/live", durationMs: 0 });
    }
    refresh();
    const navigating = () => { requestSequence.current += 1; controllerRef.current?.abort(); };
    window.addEventListener("participant-navigation-start", navigating);
    return () => {
      controllerRef.current?.abort();
      window.removeEventListener("participant-navigation-start", navigating);
    };
  // Initial mount owns refresh; TournamentDashboard owns later polling/focus refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (payload?.tournament) return <TournamentDashboard
    initialData={payload}
    readUrl="/api/tournament/live"
    secondaryReadUrl="/api/tournament/secondary"
    onConfirmedData={acceptData}
  />;

  return state === "error"
    ? <section className={styles.page}><ErrorState kind="inline" headingLevel={2} title="Tournament is temporarily unavailable." message="Live scores are unchanged. Check your connection and try again." onRetry={refresh} /></section>
    : <ScreenSkeleton label="Opening Tournament" cards={3} />;
}
