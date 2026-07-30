"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NOTIFICATION_CATEGORIES } from "../../lib/tournament-notifications";
import styles from "./me.module.css";
import nativeStyles from "./native-actions.module.css";

const preferenceKey = "sbi-notification-preferences";

export default function ParticipantProfile() {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [identityState, setIdentityState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [preferences, setPreferences] = useState(() =>
    Object.fromEntries(NOTIFICATION_CATEGORIES.map((category) => [category.id, true]))
  );

  useEffect(() => {
    let current = true;
    try {
      const saved = JSON.parse(window.localStorage.getItem(preferenceKey) || "null");
      if (saved) setPreferences((current) => ({ ...current, ...saved }));
    } catch {}
    try {
      const remembered = JSON.parse(window.localStorage.getItem("sbi-participant-shell") || "null");
      if (remembered?.id && remembered?.name) setPlayer(remembered);
    } catch {}
    setLoading(true);
    fetch("/api/player-passport/session", { cache: "no-store" })
      .then(async (response) => {
        if (!current) return;
        if (response.ok) {
          setPlayer((await response.json()).player);
          setIdentityState("active");
        } else if (response.status === 401) {
          setPlayer(null);
          setIdentityState("inactive");
        } else {
          setIdentityState("unavailable");
        }
      })
      .catch(() => { if (current) setIdentityState("unavailable"); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [attempt]);

  const toggle = (id) => {
    setPreferences((current) => {
      const next = { ...current, [id]: !current[id] };
      window.localStorage.setItem(preferenceKey, JSON.stringify(next));
      return next;
    });
  };

  const remove = async () => {
    await fetch("/api/player-passport/session", { method: "DELETE" });
    window.localStorage.removeItem("sbi-participant-shell");
    window.dispatchEvent(new Event("player-passport-cleared"));
    window.location.replace("/activate");
  };

  const shareApp = async () => {
    const shareData = {
      title: "Sandbagger Invitational",
      text: "Follow the Sandbagger Invitational.",
      url: window.location.origin,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareMessage("");
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setShareMessage("Website link copied.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setShareMessage("Sharing is unavailable right now.");
    }
  };

  if (loading && !player) return <section className={styles.state}>Loading your Player Passport…</section>;
  if (identityState === "unavailable" && !player) return <section className={styles.state}><h1>Player Passport temporarily unavailable</h1><p>We couldn’t verify your Player Passport right now.</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></section>;
  if (!player) return <section className={styles.state}><h1>Player Passport required</h1><Link href="/activate">Activate Player Passport</Link></section>;

  return <section className={styles.page}>
    <header><span>Player Passport</span><h1>Me</h1><p>{player.name}</p></header>
    <section className={styles.card}>
      <h2>Your SBI</h2>
      <div className={styles.links}>
        <Link href={player.slug ? `/players/${player.slug}` : "/players"}><strong>Player Profile</strong><span>Career statistics, history, and achievements</span></Link>
        <Link href="/score"><strong>My Matches</strong><span>Your tournament assignments and scorecards</span></Link>
        <Link href="/tournament-guide"><strong>Tournament Guide</strong><span>Schedule, rules, and important information</span></Link>
        <button className={nativeStyles.share} type="button" onClick={shareApp}><strong>Share SBI</strong><span>Open the iPhone Share Sheet or copy the website link</span></button>
      </div>
      {shareMessage ? <p className={nativeStyles.feedback} role="status">{shareMessage}</p> : null}
    </section>
    <section className={styles.card}>
      <h2>Notification preferences</h2>
      <p className={styles.note}>Preferences are ready for browser notifications. Push delivery is not enabled yet.</p>
      <div className={styles.preferences}>
        {NOTIFICATION_CATEGORIES.map((category) => <label key={category.id}>
          <span><strong>{category.label}</strong><small>{category.description}</small></span>
          <input type="checkbox" checked={Boolean(preferences[category.id])} onChange={() => toggle(category.id)} />
        </label>)}
      </div>
    </section>
    <section className={styles.card}>
      <h2>Player Passport</h2>
      <p className={styles.note}>Removing this device does not change your player record or activation credentials.</p>
      {!confirming ? <button className={styles.remove} onClick={() => setConfirming(true)}>This isn’t me</button> : <div className={styles.confirm}>
        <strong>Remove Player Passport from this device?</strong>
        <div><button onClick={() => setConfirming(false)}>Keep Passport</button><button onClick={remove}>Remove</button></div>
      </div>}
    </section>
  </section>;
}
