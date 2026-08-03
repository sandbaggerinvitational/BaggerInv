"use client";

import { useEffect } from "react";

export default function PwaSplashIdentityBridge({ tournament = null }) {
  useEffect(() => {
    window.__sbiTournamentIdentity = tournament;
    window.dispatchEvent(new CustomEvent("sbi:tournament-ready", { detail: tournament }));
  }, [tournament]);

  return null;
}
