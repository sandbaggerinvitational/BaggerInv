"use client";

import { useEffect, useRef, useState } from "react";
import AssetImage from "./AssetImage";
import { tournamentLogo } from "../lib/asset-paths";
import { formatTournamentDates, formatTournamentEdition } from "../lib/tournament-branding";
import styles from "./pwa-launch-splash.module.css";

export default function PwaLaunchSplash() {
  const [identity, setIdentity] = useState(null);
  const [phase, setPhase] = useState("visible");
  const exitFrame = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("pwa-cold-launch")) {
      setPhase("hidden");
      return;
    }

    let active = true;
    let completed = false;
    const completeLaunch = (tournament) => {
      if (!active || completed) return;
      completed = true;
      if (tournament) {
        setIdentity({
          name: tournament.name || tournament.Name || "",
          edition: formatTournamentEdition(tournament.edition || tournament["Tournament Edition"] || tournament.Annual),
          dates: formatTournamentDates(tournament.dates || tournament["Tournament Dates"] || tournament.Dates),
          location: tournament.location || tournament.Location || tournament.Destination || "",
          logo: tournament.logo || tournament["Tournament Logo Filename"] || (tournament.year ? `sandbagger-${tournament.year}` : ""),
          year: tournament.year || tournament.Year || "",
        });
      }
      exitFrame.current = window.requestAnimationFrame(() => {
        exitFrame.current = window.requestAnimationFrame(() => setPhase("exiting"));
      });
    };
    const onTournamentReady = (event) => completeLaunch(event.detail);

    window.addEventListener("sbi:tournament-ready", onTournamentReady, { once: true });
    completeLaunch(Object.prototype.hasOwnProperty.call(window, "__sbiTournamentIdentity")
      ? window.__sbiTournamentIdentity
      : null);

    return () => {
      active = false;
      window.cancelAnimationFrame(exitFrame.current);
      window.removeEventListener("sbi:tournament-ready", onTournamentReady);
    };
  }, []);

  const finish = (event) => {
    if (phase !== "exiting" || event.target !== event.currentTarget) return;
    const root = document.documentElement;
    root.classList.add("pwa-home-entering");
    root.classList.remove("pwa-cold-launch");
    setPhase("hidden");
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("pwa-home-entering")));
  };

  return <section
    className={`${styles.splash} ${phase === "exiting" ? styles.exiting : ""} ${phase === "hidden" ? styles.hidden : ""}`}
    aria-label="Loading Sandbagger Invitational"
    aria-live="polite"
    aria-busy={phase !== "hidden"}
    onTransitionEnd={finish}
  >
    <div className={styles.identity}>
      <div className={styles.logoPlate}>
        <AssetImage
          src={identity?.logo ? tournamentLogo(identity.logo) : "/images/sandbagger-logo.png"}
          alt={identity?.name ? `${identity.name} logo` : "Sandbagger Invitational logo"}
          fallback={String(identity?.year || "SBI")}
          className={styles.logo}
          fallbackClassName={styles.logoFallback}
        />
      </div>
      {identity?.edition ? <p>{identity.edition}</p> : null}
      {identity?.name ? <h1>{identity.name}</h1> : null}
      {identity?.location ? <strong>{identity.location}</strong> : null}
      {identity?.dates ? <span>{identity.dates}</span> : null}
    </div>
    <div className={styles.loading} role="status">
      <div aria-hidden="true"><i /></div>
      <span>Opening The Bagger…</span>
    </div>
  </section>;
}
