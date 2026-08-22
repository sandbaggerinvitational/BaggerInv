"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { participantDestination, participantIdlePrefetchRoutes, participantNavigationRoute } from "../lib/participant-shell";
import { isRecoverablePreviewImpersonationCode } from "../lib/participant-impersonation-recovery.js";
import { readFreshPlayerPassportSession } from "../lib/participant-session-client.js";
import styles from "./participant-navigation.module.css";

const PARTICIPANT_SHELL_KEY = "sbi-participant-shell";
const PREVIEW_SESSION_KEY = "sbi-preview-session";

const itemsFor = () => [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/my-match", label: "My Match", icon: "golf" },
  { href: "/live", label: "Tournament", icon: "trophy" },
  { href: "/live?view=leaderboards", label: "Leaderboards", icon: "podium" },
  { href: "/me", label: "Player", icon: "profile" },
];

function NavIcon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  if (name === "home") return <svg {...common}><path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.4V21h13V9.4"/><path d="M9.5 21v-6h5v6"/></svg>;
  if (name === "golf") return <svg {...common}><path d="M7 21V3"/><path d="M7 4h9l-2.2 3L16 10H7"/><path d="M3.5 21c0-1.7 3.8-3 8.5-3s8.5 1.3 8.5 3"/><circle cx="16.5" cy="14.5" r="1.2"/></svg>;
  if (name === "trophy") return <svg {...common}><path d="M8 4h8v4.5a4 4 0 0 1-8 0Z"/><path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11"/><path d="M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11"/><path d="M12 12.5V17M8.5 21h7M9.5 17h5"/></svg>;
  if (name === "podium") return <svg {...common}><path d="M3 21v-7h6v7M9 21V8h6v13M15 21v-10h6v10"/><path d="M11 4.5 12 3l1 1.5 1.7.4-1.1 1.3.1 1.8L12 7.3 10.3 8l.1-1.8-1.1-1.3Z"/></svg>;
  return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>;
}

export default function ParticipantIdentity() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [player, setPlayer] = useState(null);
  const [impersonation, setImpersonation] = useState(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(() => {
    const sequence = ++requestSequence.current;
    readFreshPlayerPassportSession()
      .then((response) => {
        if (sequence !== requestSequence.current) return;
        if (response.ok) {
          const payload = response.payload;
          const nextPlayer = payload.player;
          if (sequence !== requestSequence.current) return;
          setPlayer(nextPlayer);
          setImpersonation(payload.impersonation || null);
          window.localStorage.setItem(PARTICIPANT_SHELL_KEY, JSON.stringify(nextPlayer));
          if (payload.impersonation?.active) window.localStorage.setItem(PREVIEW_SESSION_KEY, "true");
          else window.localStorage.removeItem(PREVIEW_SESSION_KEY);
          return;
        }
        const failure = response.payload || {};
        if ([401, 403].includes(response.status) && sequence === requestSequence.current) {
          setPlayer(null);
          setImpersonation(null);
          window.localStorage.removeItem(PARTICIPANT_SHELL_KEY);
          window.localStorage.removeItem(PREVIEW_SESSION_KEY);
          if (response.status === 403 && isRecoverablePreviewImpersonationCode(failure.code)) {
            window.setTimeout(() => window.dispatchEvent(new Event("player-passport-changed")), 0);
          }
        }
      })
      .catch(() => {
        // Preserve the last verified presentation shell during temporary failures.
        // Privileged reads and writes still require server-side Passport validation.
      });
  }, []);

  useEffect(() => {
    try {
      const remembered = JSON.parse(window.localStorage.getItem(PARTICIPANT_SHELL_KEY) || "null");
      if (remembered?.id && remembered?.name) setPlayer(remembered);
    } catch {
      window.localStorage.removeItem(PARTICIPANT_SHELL_KEY);
      window.localStorage.removeItem(PREVIEW_SESSION_KEY);
    }
    refresh();
    const changed = () => refresh();
    const cleared = () => {
      window.localStorage.removeItem(PARTICIPANT_SHELL_KEY);
      window.localStorage.removeItem(PREVIEW_SESSION_KEY);
      window.sessionStorage.removeItem("sbi-participant-initialization");
      setPlayer(null);
      setImpersonation(null);
    };
    window.addEventListener("focus", changed);
    window.addEventListener("player-passport-changed", changed);
    window.addEventListener("player-passport-cleared", cleared);
    return () => {
      window.removeEventListener("focus", changed);
      window.removeEventListener("player-passport-changed", changed);
      window.removeEventListener("player-passport-cleared", cleared);
    };
  }, [refresh]);

  const navigationVisible = Boolean(player) || participantNavigationRoute(pathname);

  useEffect(() => {
    if (!navigationVisible) return undefined;
    const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 650));
    const cancel = window.cancelIdleCallback || window.clearTimeout;
    const task = schedule(() => {
      participantIdlePrefetchRoutes(pathname, searchParams.toString()).forEach((href) => router.prefetch(href));
    }, { timeout: 1600 });
    return () => cancel(task);
  }, [navigationVisible, pathname, router, searchParams]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => setKeyboardOpen(window.innerHeight - viewport.height > 140);
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("passport-navigation-active", navigationVisible);
    document.body.classList.toggle("preview-impersonation-active", Boolean(impersonation));
    return () => {
      document.body.classList.remove("passport-navigation-active");
      document.body.classList.remove("preview-impersonation-active");
    };
  }, [navigationVisible, impersonation]);

  if (!navigationVisible || pathname.startsWith("/admin")) return null;
  const items = itemsFor();
  const currentDestination = participantDestination(pathname, searchParams.toString(), player?.slug || "");
  const navigationLabel = player ? `${player.name}'s tournament navigation` : "Tournament navigation";
  return <>
    {impersonation ? <aside className={styles.impersonation} role="status" aria-label={`Preview Mode. Viewing as ${impersonation.player.name}`}>
      <span><b>Preview Mode</b><small>Viewing as</small><strong>{impersonation.player.name}</strong></span>
      <div className={styles.previewActions}>
        <button type="button" aria-label="Change Preview Player" onClick={() => router.push("/admin/director#qa-tools")}><span className={styles.actionFull}>Change Preview Player</span><span className={styles.actionCompact}>Change</span></button>
        <button type="button" aria-label="Exit Preview" onClick={async () => {
          const response = await fetch("/api/director/impersonation", { method: "DELETE" });
          if (response.ok) {
            window.localStorage.removeItem(PARTICIPANT_SHELL_KEY);
            window.localStorage.removeItem(PREVIEW_SESSION_KEY);
            router.replace("/admin/director");
          }
        }}><span className={styles.actionFull}>Exit Preview</span><span className={styles.actionCompact}>Exit</span></button>
      </div>
    </aside> : null}
    <nav className={styles.mobile} aria-label={navigationLabel} data-keyboard-open={keyboardOpen ? "true" : undefined} data-participant-navigation>
      {items.map((item) => {
        const active = currentDestination === item.label;
        return <Link href={item.href} prefetch={false} onClick={() => window.dispatchEvent(new Event("participant-navigation-start"))} aria-current={active ? "page" : undefined} key={item.label}>
          <span aria-hidden="true"><NavIcon name={item.icon} /></span><b>{item.label}</b>
        </Link>;
      })}
    </nav>
    <nav className={styles.desktop} aria-label={navigationLabel} data-participant-navigation>
      {player ? <span>Welcome, {player.name}</span> : null}
      {items.map((item) => <Link href={item.href} prefetch={false} onClick={() => window.dispatchEvent(new Event("participant-navigation-start"))} aria-current={currentDestination === item.label ? "page" : undefined} key={item.label}>{item.label}</Link>)}
    </nav>
  </>;
}
