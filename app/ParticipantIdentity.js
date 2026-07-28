"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ParticipantIdentity() {
  const [player, setPlayer] = useState(null);
  useEffect(() => {
    fetch("/api/player-passport/session", { cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()).player : null)
      .then(setPlayer)
      .catch(() => {});
  }, []);
  if (!player) return null;
  return <Link href="/score" aria-label={`${player.name}'s Player Passport and matches`} style={{
    position: "fixed", right: 14, bottom: 14, zIndex: 70, padding: "10px 15px",
    borderRadius: 999, background: "#0b4938", color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,.18)",
    fontSize: ".78rem", fontWeight: 900, textDecoration: "none",
  }}>Welcome, {player.name}</Link>;
}
