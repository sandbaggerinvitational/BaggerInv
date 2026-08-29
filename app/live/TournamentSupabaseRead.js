"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushParticipantAuthDiagnostics, recordParticipantAuthDiagnostic } from "../../lib/participant-auth-client-diagnostics.js";
import { readTournamentLiveCache, writeTournamentLiveCache } from "../../lib/tournament-live-cache.js";
import TournamentDashboard from "./TournamentDashboard";
import { MatchCenterExperience } from "./MatchCenter";
import styles from "./tournament-dashboard.module.css";
import publicStyles from "./live.module.css";
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

export default function TournamentSupabaseRead({ initialView = "", presentation = "participant" }) {
  const router = useRouter();
  const [payload, setPayload] = useState(null);
  const [state, setState] = useState("loading");
  const restoredCache = useRef(false);
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
      const routeTo = presentation === "public" ? "/live" : "/app/tournament";
      recordParticipantAuthDiagnostic("TOURNAMENT_HEADER_USABLE", { routeTo, durationMs: clientTotal });
      recordParticipantAuthDiagnostic("TOURNAMENT_LIVE_STATE_USABLE", { routeTo, durationMs: clientTotal });
      console.info("Tournament Supabase load timing", { ...timings, clientTotal: Math.round(clientTotal),
        cachedPresentation: restoredCache.current, googleRequests: Number(response.headers.get("x-tournament-google-requests") || 0) });
      const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 450));
      if (presentation !== "public") schedule(() => {
        router.prefetch("/my-match");
        router.prefetch("/app/leaderboards");
        const match = likelyGameCenter(result.data);
        if (match?.id) router.prefetch(`/game-center/${encodeURIComponent(match.id)}?from=tournament`);
        recordParticipantAuthDiagnostic("TOURNAMENT_PREFETCH_COMPLETE", { routeTo, durationMs: performance.now() - startedAt });
        flushParticipantAuthDiagnostics().catch(() => null);
      }, { timeout: 1200 });
    } catch (error) {
      if (error?.name === "AbortError" || sequence !== requestSequence.current) return;
      setState((current) => current === "ready" ? "ready" : "error");
    }
  }, [acceptData, presentation, router]);

  useEffect(() => {
    const cached = readTournamentLiveCache();
    if (cached) {
      restoredCache.current = true;
      acceptData(cached);
      const routeTo = presentation === "public" ? "/live" : "/app/tournament";
      recordParticipantAuthDiagnostic("TOURNAMENT_CACHED_SHELL", { routeTo, durationMs: 0 });
      recordParticipantAuthDiagnostic("TOURNAMENT_HEADER_USABLE", { routeTo, durationMs: 0 });
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

  if (payload?.tournament) return presentation === "public"
    ? <MatchCenterExperience initialData={payload} readUrl="/api/tournament/live" />
    : <TournamentDashboard
      initialData={payload}
      initialView={initialView}
      readUrl="/api/tournament/live"
      secondaryReadUrl="/api/tournament/secondary"
      onConfirmedData={acceptData}
    />;

  if (presentation === "public") return <section className={publicStyles.content}>
    <div className={publicStyles.errorBox}>
      <h1>Live Match Center</h1>
      <p>{state === "error" ? "Live scores are temporarily unavailable. Check your connection and try again." : "Opening the Match Center…"}</p>
      {state === "error" ? <button type="button" onClick={refresh}>Try again</button> : null}
    </div>
  </section>;

  return state === "error"
    ? <section className={styles.page}><ErrorState kind="inline" headingLevel={2} title="Tournament is temporarily unavailable." message="Live scores are unchanged. Check your connection and try again." onRetry={refresh} /></section>
    : <ScreenSkeleton label="Opening Tournament" cards={3} />;
}
