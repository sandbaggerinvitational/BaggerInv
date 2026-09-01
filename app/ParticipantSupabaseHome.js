"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MobileTournamentHome from "./MobileTournamentHome";
import PreviewModeBadge from "./PreviewModeBadge";
import PwaSplashIdentityBridge from "./PwaSplashIdentityBridge";
import { clearParticipantHomeCache, readParticipantHomeCache, writeParticipantHomeCache } from "../lib/participant-home-cache.js";
import { flushParticipantAuthDiagnostics, recordParticipantAuthDiagnostic } from "../lib/participant-auth-client-diagnostics.js";
import { selectRelevantPlayerMatches } from "../lib/player-home.js";
import { isRecoverablePreviewImpersonationCode } from "../lib/participant-impersonation-recovery.js";
import { ErrorState, ScreenSkeleton } from "./ui/StatePrimitives";

function parseTiming(value = "") {
  return Object.fromEntries(String(value).split(",").map((entry) => {
    const [name, duration] = entry.trim().split(";dur=");
    return [name, Number(duration) || 0];
  }).filter(([name]) => name));
}

function canonicalNetSkinsPresentation(payload, productionNetSkinsV1) {
  if (!productionNetSkinsV1 || !payload?.liveData || payload.liveData.netSkinsState) {
    return payload;
  }
  // A cached participant-home projection may still carry the legacy derived
  // payload. The canonical V1 state must arrive before Production advertises
  // or renders Net Skins.
  return { ...payload, liveData: { ...payload.liveData, netSkins: null } };
}

export default function ParticipantSupabaseHome({
  netSkinsReadSource = "google",
  previewMode = false,
  productionNetSkinsV1 = false,
}) {
  const router = useRouter();
  const [payload, setPayload] = useState(null);
  const [state, setState] = useState("loading");
  const restoredCache = useRef(false);
  const requestSequence = useRef(0);
  const controllerRef = useRef(null);
  const secondaryControllerRef = useRef(null);

  const hydrateNetSkins = useCallback(async () => {
    if (netSkinsReadSource !== "supabase") return;
    secondaryControllerRef.current?.abort();
    const controller = new AbortController();
    secondaryControllerRef.current = controller;
    try {
      const response = await fetch("/api/leaderboards/net-skins", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.data?.netSkins) throw new Error(result.code || "NET_SKINS_READ_UNAVAILABLE");
      setPayload((current) => {
        if (!current?.liveData) return current;
        const next = { ...current, liveData: {
          ...current.liveData,
          netSkins: result.data.netSkins,
          netSkinsState: result.data.netSkinsState || null,
        } };
        writeParticipantHomeCache(next);
        return next;
      });
      recordParticipantAuthDiagnostic("HOME_NET_SKINS_READY", { routeTo: "/home", durationMs: 0 });
    } catch (error) {
      if (error?.name !== "AbortError") console.info("Home Net Skins secondary module is temporarily unavailable.");
    }
  }, [netSkinsReadSource]);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = performance.now();
    try {
      let recoveredImpersonation = false;
      let response = await fetch("/api/participant/home", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      let result = await response.json().catch(() => ({}));
      if (response.status === 403 && isRecoverablePreviewImpersonationCode(result.code)) {
        recoveredImpersonation = true;
        clearParticipantHomeCache(); setPayload(null); setState("loading");
        window.dispatchEvent(new Event("player-passport-cleared"));
        response = await fetch("/api/participant/home", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        result = await response.json().catch(() => ({}));
      }
      if (sequence !== requestSequence.current) return;
      if (response.status === 401) {
        clearParticipantHomeCache(); setPayload(null); setState("signed-out");
        router.replace("/participant-auth?next=/home");
        return;
      }
      if (!response.ok) throw new Error(result.code || "HOME_READ_UNAVAILABLE");
      const next = result.data;
      writeParticipantHomeCache(next);
      setPayload(next); setState("ready");
      window.dispatchEvent(new CustomEvent("sbi:participant-session", { detail: { player: next.player } }));
      if (recoveredImpersonation) window.dispatchEvent(new Event("player-passport-changed"));
      const clientTotal = performance.now() - startedAt;
      const timings = parseTiming(response.headers.get("server-timing") || "");
      recordParticipantAuthDiagnostic("HOME_FRESH_PAYLOAD", { routeTo: "/home", durationMs: clientTotal });
      recordParticipantAuthDiagnostic("HOME_PRIMARY_USABLE", { routeTo: "/home", durationMs: clientTotal });
      console.info("Participant Home load timing", { ...timings, clientTotal: Math.round(clientTotal),
        cachedPresentation: restoredCache.current, googleRequests: Number(response.headers.get("x-home-google-requests") || 0) });
      const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 450));
      schedule(() => {
        hydrateNetSkins();
        router.prefetch("/my-match");
        router.prefetch("/app/leaderboards");
        const selected = selectRelevantPlayerMatches(next.participant?.matches || [], next.participant?.tournament?.currentRound).primary;
        if (selected?.matchId) router.prefetch(`/game-center/${encodeURIComponent(selected.matchId)}?from=home`);
        recordParticipantAuthDiagnostic("HOME_SECONDARY_COMPLETE", { routeTo: "/home", durationMs: performance.now() - startedAt });
        flushParticipantAuthDiagnostics().catch(() => null);
      }, { timeout: 1200 });
    } catch (error) {
      if (error?.name === "AbortError" || sequence !== requestSequence.current) return;
      setState((current) => current === "ready" ? "ready" : "error");
    }
  }, [hydrateNetSkins, router]);

  useEffect(() => {
    recordParticipantAuthDiagnostic("HOME_SHELL_RENDER", { routeTo: "/home", durationMs: 0 });
    const cached = readParticipantHomeCache();
    if (cached) {
      restoredCache.current = true;
      setPayload(cached);
      setState("ready");
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
      secondaryControllerRef.current?.abort();
      window.removeEventListener("focus", focus);
      window.removeEventListener("participant-navigation-start", navigating);
    };
  // Initial mount owns refresh; subsequent focus events explicitly refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (payload?.liveData) {
    const presentation = canonicalNetSkinsPresentation(payload, productionNetSkinsV1);
    return <>
    <PwaSplashIdentityBridge tournament={presentation.liveData.tournament} />
    <PreviewModeBadge visible={previewMode} />
    <MobileTournamentHome liveData={presentation.liveData} initialParticipantData={presentation.participant} participantIdentityAuthority="supabase" />
  </>;
  }

  return <main className="mobileHomeMain">
    <PwaSplashIdentityBridge tournament={null} />
    <PreviewModeBadge visible={previewMode} />
    {state === "error"
      ? <ErrorState title="Home is temporarily unavailable." message="Your latest saved information is unchanged. Check your connection and try again." onRetry={refresh} />
      : <ScreenSkeleton label={state === "signed-out" ? "Opening participant sign-in" : "Opening Home"} cards={3} />}
  </main>;
}
