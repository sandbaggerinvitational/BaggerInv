"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AssetImage from "../AssetImage";
import PlayerAvatar from "../PlayerAvatar";
import { teamLogo } from "../../lib/asset-paths";
import { formatHandicap, formatPlayerPoints } from "../../lib/formatters";
import { NOTIFICATION_CATEGORIES } from "../../lib/tournament-notifications";
import styles from "./me.module.css";
import nativeStyles from "./native-actions.module.css";
import logoStyles from "../live/live.module.css";
import { ErrorState, ScreenSkeleton } from "../ui/StatePrimitives";

const preferenceKey = "sbi-notification-preferences";

function initials(name) {
  return String(name || "Player").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function ordinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const suffix = number % 10 === 1 && number % 100 !== 11 ? "st" : number % 10 === 2 && number % 100 !== 12 ? "nd" : number % 10 === 3 && number % 100 !== 13 ? "rd" : "th";
  return `${number}${suffix}`;
}

function RoundPerformance({ rounds }) {
  if (!rounds?.length) return null;
  return <section className={`${styles.card} ${styles.performance}`} aria-labelledby="round-performance-title">
    <div className={styles.sectionHeading}><span>Your Tournament</span><h2 id="round-performance-title">Round Performance</h2></div>
    <div className={styles.performanceList}>{rounds.map((round) => {
      const available = round.gross !== null || round.grossRankLabel || round.outcomes?.length || round.points !== null;
      return <article key={round.round} data-upcoming={available ? undefined : "true"}>
        <header><strong>Round {round.round}{round.format ? ` • ${round.format}` : ""}</strong>{!available ? <span>Upcoming</span> : null}</header>
        {available ? <div className={styles.performanceMetrics}>
          {round.gross !== null ? <div><b>{round.gross}</b><small>Gross Score</small></div> : null}
          {round.grossRankLabel ? <div><b>{round.grossRankLabel}</b><small>Gross Rank</small></div> : null}
          {round.outcomes?.length ? <div><b>{round.outcomes.join(" • ")}</b><small>Result</small></div> : null}
          {round.points !== null ? <div><b>{formatPlayerPoints(round.points)}</b><small>Points Earned</small></div> : null}
        </div> : <p>Your round performance will appear after play.</p>}
      </article>;
    })}</div>
  </section>;
}

export default function ParticipantProfile({ participantIdentityAuthority = "passport" }) {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [identityState, setIdentityState] = useState("loading");
  const [previewMode, setPreviewMode] = useState(false);
  const [tournamentData, setTournamentData] = useState(null);
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
          const identity = await response.json();
          setPlayer(identity.player);
          setPreviewMode(Boolean(identity.impersonation?.active));
          setIdentityState("active");
          const tournamentResponse = await fetch("/api/player-passport/matches", { cache: "no-store" });
          if (current && tournamentResponse.ok) setTournamentData((await tournamentResponse.json()).data);
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
    const response = await fetch("/api/player-passport/session", { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    window.localStorage.removeItem("sbi-participant-shell");
    window.sessionStorage.removeItem("sbi-participant-initialization");
    window.dispatchEvent(new Event("player-passport-cleared"));
    window.location.replace(result.identityAuthority === "supabase" ? "/participant-auth" : "/activate");
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

  if (loading && !player) return <ScreenSkeleton label="Opening Player" cards={2} />;
  if (identityState === "unavailable" && !player) return <ErrorState title="Player information is temporarily unavailable." message="Check your connection and try again." onRetry={() => setAttempt((value) => value + 1)} />;
  if (!player) return participantIdentityAuthority === "supabase"
    ? <section className={styles.state}><h1>Participant sign-in required</h1><Link href="/participant-auth?next=/me">Sign in</Link></section>
    : <section className={styles.state}><h1>Player Passport required</h1><Link href="/activate">Activate Player Passport</Link></section>;

  const profile = tournamentData?.player || player;
  const tournament = tournamentData?.tournament;
  const snapshot = tournamentData?.snapshot;
  const record = snapshot?.record ? `${snapshot.record.wins}-${snapshot.record.losses}-${snapshot.record.halves}` : "";
  const standing = ordinal(snapshot?.standing);
  const handicap = profile.tournamentHandicap === null || profile.tournamentHandicap === undefined || profile.tournamentHandicap === ""
    ? ""
    : formatHandicap(profile.tournamentHandicap);

  return <section className={styles.page}>
    <header className={styles.playerHero}>
      <div className={styles.photoPlate}>
        <PlayerAvatar player={profile} alt={`${profile.name} profile photo`} className={styles.playerPhoto} fallbackClassName={styles.playerFallback} />
      </div>
      <div className={styles.heroIdentity}>
        <span>{tournament?.year ? `${tournament.year} Sandbagger` : "Player Passport"}</span>
        <h1>{profile.name}</h1>
        {profile.teamName ? <p className={styles.teamLine}>{profile.teamLogo ? <span className={logoStyles.logoPlate} data-size="small"><AssetImage src={teamLogo(profile.teamLogo)} alt={`${profile.teamName} logo`} className={logoStyles.logoImage} fallbackClassName={logoStyles.logoFallback} fallback={initials(profile.teamName)} inferFallback={false} /></span> : null}<span>{profile.teamName}</span></p> : null}
      </div>
      {(record || snapshot || standing || handicap) ? <div className={styles.heroStats} aria-label="Current tournament performance">
        {record ? <span><b>{record}</b><small>Record</small></span> : null}
        {snapshot ? <span><b>{formatPlayerPoints(snapshot.points)}</b><small>Points</small></span> : null}
        {standing ? <span><b>{standing}</b><small>Position</small></span> : null}
        {handicap ? <span><b>{handicap}</b><small>Handicap</small></span> : null}
      </div> : null}
    </header>

    <RoundPerformance rounds={tournamentData?.roundPerformance} />

    <section className={styles.card}>
      <div className={styles.sectionHeading}><span>Career</span><h2>Profile &amp; Matches</h2></div>
      <div className={styles.links}>
        <Link href={profile.slug ? `/players/${profile.slug}` : "/players"}><strong>Career, history, and achievements</strong><span>Explore your Sandbagger Invitational player profile</span></Link>
        <Link href="/my-match"><strong>My Matches</strong><span>Your tournament assignments and scorecards</span></Link>
      </div>
    </section>

    <section className={styles.card}>
      <div className={styles.sectionHeading}><span>Resources</span><h2>Utilities</h2></div>
      <div className={styles.links}>
        <Link href="/tournament-guide"><strong>Tournament Guide</strong><span>Schedule, rules, and important information</span></Link>
        <button className={nativeStyles.share} type="button" onClick={shareApp}><strong>Share SBI</strong><span>Open the iPhone Share Sheet or copy the website link</span></button>
      </div>
      {shareMessage ? <p className={nativeStyles.feedback} role="status">{shareMessage}</p> : null}
    </section>

    <section className={styles.card} id="notification-preferences">
      <div className={styles.sectionHeading}><span>Settings</span><h2>Notification Preferences</h2></div>
      <p className={styles.note}>Preferences are ready for browser notifications. Push delivery is not enabled yet.</p>
      <div className={styles.preferences}>
        {NOTIFICATION_CATEGORIES.map((category) => <label key={category.id}>
          <span><strong>{category.label}</strong><small>{category.description}</small></span>
          <input type="checkbox" checked={Boolean(preferences[category.id])} onChange={() => toggle(category.id)} />
        </label>)}
      </div>
    </section>
    {!previewMode ? <section className={styles.card}>
      <div className={styles.sectionHeading}><span>Settings</span><h2>{participantIdentityAuthority === "supabase" ? "Account & Session" : "Player Passport"}</h2></div>
      <p className={styles.note}>{participantIdentityAuthority === "supabase" ? "Signing out does not change your player record or tournament assignments." : "Removing this device does not change your player record or activation credentials."}</p>
      {!confirming ? <button className={styles.remove} type="button" onClick={() => setConfirming(true)}>{participantIdentityAuthority === "supabase" ? "Sign Out" : "This isn’t me"}</button> : <div className={styles.confirm}>
        <strong>{participantIdentityAuthority === "supabase" ? "Sign out of this participant account?" : "Remove Player Passport from this device?"}</strong>
        <div><button type="button" onClick={() => setConfirming(false)}>{participantIdentityAuthority === "supabase" ? "Stay Signed In" : "Keep Passport"}</button><button type="button" onClick={remove}>{participantIdentityAuthority === "supabase" ? "Sign Out" : "Remove"}</button></div>
      </div>}
    </section> : null}
  </section>;
}
