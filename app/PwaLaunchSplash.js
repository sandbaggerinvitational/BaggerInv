"use client";

import { useEffect, useState } from "react";
import AssetImage from "./AssetImage";
import { tournamentLogo } from "../lib/asset-paths";
import { formatTournamentDates, formatTournamentEdition } from "../lib/tournament-branding";
import styles from "./pwa-launch-splash.module.css";

export default function PwaLaunchSplash() {
  const [identity, setIdentity] = useState(null);
  const [phase, setPhase] = useState("visible");

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("pwa-cold-launch")) {
      setPhase("hidden");
      return;
    }

    let active = true;
    const completeLaunch = (tournament) => {
      if (!active) return;
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
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase("exiting")));
    };
    const onTournamentReady = (event) => completeLaunch(event.detail);

    window.addEventListener("sbi:tournament-ready", onTournamentReady, { once: true });
    if (Object.prototype.hasOwnProperty.call(window, "__sbiTournamentIdentity")) {
      completeLaunch(window.__sbiTournamentIdentity);
    }

    return () => {
      active = false;
      window.removeEventListener("sbi:tournament-ready", onTournamentReady);
    };
  }, []);

  const finish = (event) => {
    if (phase !== "exiting" || event.target !== event.currentTarget) return;
    document.documentElement.classList.remove("pwa-cold-launch");
    setPhase("hidden");
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
      <span>Loading Tournament...</span>
    </div>
  </section>;
}
