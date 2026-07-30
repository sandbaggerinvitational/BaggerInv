"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { participantDestination } from "../lib/participant-shell";
import styles from "./participant-navigation.module.css";

const PARTICIPANT_SHELL_KEY = "sbi-participant-shell";

const itemsFor = (player) => [
  { href: "/home", label: "Home", icon: "⌂" },
  { href: "/score", label: "My Match", icon: "○" },
  { href: "/live", label: "Tournament", icon: "◆" },
  { href: "/live?view=leaderboards", label: "Leaderboards", icon: "≡" },
  { href: "/me", label: "Me", icon: "●" },
];

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
          <span aria-hidden="true">{item.icon}</span><b>{item.label}</b>
        </Link>;
      })}
    </nav>
    <nav className={styles.desktop} aria-label={`${player.name}'s Player Passport`}>
      <span>Welcome, {player.name}</span>
      {items.map((item) => <Link href={item.href} prefetch={false} key={item.label}>{item.label}</Link>)}
    </nav>
  </>;
}
