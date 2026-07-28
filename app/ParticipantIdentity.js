"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import styles from "./participant-navigation.module.css";

const itemsFor = (player) => [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/score", label: "My Match", icon: "○" },
  { href: "/live", label: "Tournament", icon: "◆" },
  { href: "/live?view=points", label: "Leaderboard", icon: "≡" },
  { href: player?.slug ? `/players/${player.slug}` : "/players", label: "Me", icon: "●" },
];

export default function ParticipantIdentity() {
  const pathname = usePathname();
  const [player, setPlayer] = useState(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(() => {
    fetch("/api/player-passport/session", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()).player : null)
      .then(setPlayer)
      .catch(() => setPlayer(null));
  }, []);

  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);

  useEffect(() => {
    refresh();
    const changed = () => refresh();
    window.addEventListener("focus", changed);
    window.addEventListener("player-passport-changed", changed);
    window.addEventListener("player-passport-cleared", changed);
    return () => {
      window.removeEventListener("focus", changed);
      window.removeEventListener("player-passport-changed", changed);
      window.removeEventListener("player-passport-cleared", changed);
    };
  }, [refresh]);

  useEffect(() => {
    document.body.classList.toggle("passport-navigation-active", Boolean(player));
    return () => document.body.classList.remove("passport-navigation-active");
  }, [player]);

  if (!player || pathname.startsWith("/admin")) return null;
  const items = itemsFor(player);
  return <>
    <nav className={styles.mobile} aria-label={`${player.name}'s tournament navigation`}>
      {items.map((item) => {
        const active = item.href === "/"
          ? pathname === "/"
          : pathname === item.href.split("?")[0] &&
            (item.label === "Leaderboard" ? search.includes("view=points") :
              item.label === "Tournament" ? !search.includes("view=") : true);
        return <Link href={item.href} aria-current={active ? "page" : undefined} key={item.label}>
          <span aria-hidden="true">{item.icon}</span><b>{item.label}</b>
        </Link>;
      })}
    </nav>
    <nav className={styles.desktop} aria-label={`${player.name}'s Player Passport`}>
      <span>Welcome, {player.name}</span>
      {items.map((item) => <Link href={item.href} key={item.label}>{item.label}</Link>)}
    </nav>
  </>;
}
