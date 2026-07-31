"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { participantDestination } from "../lib/participant-shell";
import styles from "./participant-navigation.module.css";

const PARTICIPANT_SHELL_KEY = "sbi-participant-shell";

const itemsFor = (player) => [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/my-match", label: "My Match", icon: "golf" },
  { href: "/live", label: "Tournament", icon: "trophy" },
  { href: "/live?view=leaderboards", label: "Leaderboards", icon: "podium" },
  { href: "/me", label: "Me", icon: "profile" },
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
  const searchParams = useSearchParams();
  const [player, setPlayer] = useState(null);
  const requestSequence = useRef(0);

  const refresh = useCallback(() => {
    const sequence = ++requestSequence.current;
    fetch("/api/player-passport/session", { cache: "no-store" })
      .then(async (response) => {
        if (sequence !== requestSequence.current) return;
        if (response.ok) {
          const nextPlayer = (await response.json()).player;
          if (sequence !== requestSequence.current) return;
          setPlayer(nextPlayer);
          window.localStorage.setItem(PARTICIPANT_SHELL_KEY, JSON.stringify(nextPlayer));
          return;
        }
        if (response.status === 401 && sequence === requestSequence.current) {
          setPlayer(null);
          window.localStorage.removeItem(PARTICIPANT_SHELL_KEY);
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
    }
    refresh();
    const changed = () => refresh();
    const cleared = () => {
      window.localStorage.removeItem(PARTICIPANT_SHELL_KEY);
      setPlayer(null);
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

  useEffect(() => {
    document.body.classList.toggle("passport-navigation-active", Boolean(player));
    return () => document.body.classList.remove("passport-navigation-active");
  }, [player]);

  if (!player || pathname.startsWith("/admin")) return null;
  const items = itemsFor(player);
  const currentDestination = participantDestination(pathname, searchParams.toString(), player.slug);
  return <>
    <nav className={styles.mobile} aria-label={`${player.name}'s tournament navigation`}>
      {items.map((item) => {
        const active = currentDestination === item.label;
        return <Link href={item.href} prefetch={false} aria-current={active ? "page" : undefined} key={item.label}>
          <span aria-hidden="true"><NavIcon name={item.icon} /></span><b>{item.label}</b>
        </Link>;
      })}
    </nav>
    <nav className={styles.desktop} aria-label={`${player.name}'s Player Passport`}>
      <span>Welcome, {player.name}</span>
      {items.map((item) => <Link href={item.href} prefetch={false} key={item.label}>{item.label}</Link>)}
    </nav>
  </>;
}
