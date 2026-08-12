"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "./components";
import MobileTournamentHome from "./MobileTournamentHome";
import PreviewModeBadge from "./PreviewModeBadge";
import PwaSplashIdentityBridge from "./PwaSplashIdentityBridge";
import { clearParticipantHomeCache, readParticipantHomeCache, writeParticipantHomeCache } from "../lib/participant-home-cache.js";
import { flushParticipantAuthDiagnostics, recordParticipantAuthDiagnostic } from "../lib/participant-auth-client-diagnostics.js";
import { selectRelevantPlayerMatches } from "../lib/player-home.js";
import styles from "./personalized-player-home.module.css";

function parseTiming(value = "") {
  return Object.fromEntries(String(value).split(",").map((entry) => {
    const [name, duration] = entry.trim().split(";dur=");
    return [name, Number(duration) || 0];
  }).filter(([name]) => name));
}

export default function ParticipantSupabaseHome() {
  const router = useRouter();
  const initial = useMemo(() => readParticipantHomeCache(), []);
  const [payload, setPayload] = useState(initial);
  const [state, setState] = useState(initial ? "ready" : "loading");
  const requestSequence = useRef(0);
  const controllerRef = useRef(null);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = performance.now();
    try {
      const response = await fetch("/api/participant/home", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (sequence !== requestSequence.current) return;
      if (response.status === 401) {
        clearParticipantHomeCache(); setPayload(null); setState("signed-out"); return;
      }
      if (!response.ok) throw new Error(result.code || "HOME_READ_UNAVAILABLE");
      const next = result.data;
      writeParticipantHomeCache(next);
      setPayload(next); setState("ready");
      window.dispatchEvent(new CustomEvent("sbi:participant-session", { detail: { player: next.player } }));
      const clientTotal = performance.now() - startedAt;
      const timings = parseTiming(response.headers.get("server-timing") || "");
      recordParticipantAuthDiagnostic("HOME_FRESH_PAYLOAD", { routeTo: "/home", durationMs: clientTotal });
      recordParticipantAuthDiagnostic("HOME_PRIMARY_USABLE", { routeTo: "/home", durationMs: clientTotal });
      console.info("Participant Home load timing", { ...timings, clientTotal: Math.round(clientTotal),
        cachedPresentation: Boolean(initial), googleRequests: Number(response.headers.get("x-home-google-requests") || 0) });
      const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 450));
      schedule(() => {
        router.prefetch("/my-match");
        const selected = selectRelevantPlayerMatches(next.participant?.matches || [], next.participant?.tournament?.currentRound).primary;
        if (selected?.matchId) router.prefetch(`/game-center/${encodeURIComponent(selected.matchId)}?from=home`);
        recordParticipantAuthDiagnostic("HOME_SECONDARY_COMPLETE", { routeTo: "/home", durationMs: performance.now() - startedAt });
        flushParticipantAuthDiagnostics().catch(() => null);
      }, { timeout: 1200 });
    } catch (error) {
      if (error?.name === "AbortError" || sequence !== requestSequence.current) return;
      setState((current) => current === "ready" ? "ready" : "error");
    }
  }, [initial, router]);

  useEffect(() => {
    if (initial) {
      recordParticipantAuthDiagnostic("HOME_CACHED_SHELL", { routeTo: "/home", durationMs: 0 });
      recordParticipantAuthDiagnostic("HOME_IDENTITY_VISIBLE", { routeTo: "/home", durationMs: 0 });
    }
    refresh();
    const focus = () => refresh();
    const navigating = () => { requestSequence.current += 1; controllerRef.current?.abort(); };
    window.addEventListener("focus", focus);
    window.addEventListener("participant-navigation-start", navigating);
    return () => {
      controllerRef.current?.abort();
      window.removeEventListener("focus", focus);
      window.removeEventListener("participant-navigation-start", navigating);
    };
  // Initial mount owns refresh; subsequent focus events explicitly refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (payload?.liveData) return <>
    <PwaSplashIdentityBridge tournament={payload.liveData.tournament} />
    <PreviewModeBadge visible />
    <MobileTournamentHome liveData={payload.liveData} initialParticipantData={payload.participant} />
  </>;

  return <main className="mobileHomeMain">
    <PwaSplashIdentityBridge tournament={null} />
    <PreviewModeBadge visible />
    <Header activeNavigationHref="/live" homeHref="/home" />
    <section className={state === "error" ? styles.error : styles.loading} aria-live="polite">
      <strong>{state === "signed-out" ? "Sign in to open your tournament." : state === "error" ? "Home is temporarily unavailable." : "Opening your tournament…"}</strong>
      <span>{state === "error" ? "Your score data is unchanged. Try again when the connection is available." : "Your identity and current match are loading."}</span>
      {state === "error" ? <button type="button" onClick={refresh}>Try again</button> : <><span className={styles.skeleton} /><span className={styles.skeleton} /></>}
    </section>
  </main>;
}
