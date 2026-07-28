"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  countdownParts,
  matchAction,
  normalizedMatchStatus,
  selectRelevantPlayerMatches,
} from "../lib/player-home";
import { appMatchStatus, formatMatchResult, imageFallbackSources } from "../lib/mobile-tournament-app";
import { courseLogo, playerPhoto, teamLogo, tournamentLogo } from "../lib/asset-paths";
import MobileIdentityImage from "./MobileIdentityImage";
import styles from "./personalized-player-home.module.css";

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "Sandbagger";
}

function matchMeta(match) {
  return [
    match?.round ? `Round ${match.round}` : "",
    match?.match ? `Match ${match.match}` : "",
    match?.format,
  ].filter(Boolean).join(" · ");
}

function MatchPeople({ match }) {
  const participant = match.partnerNames?.length
    ? `Partner: ${match.partnerNames.join(" + ")}`
    : match.format === "Singles" ? "Singles" : "Your side";
  const opponents = match.opponentNames?.join(" + ") || "Opponents TBD";
  return <div className={styles.people}>
    <div>
      <MobileIdentityImage sources={[teamLogo(match.team?.logo)]} name={match.team?.name} className={styles.teamLogo} fallbackClassName={styles.teamLogoFallback} />
      <span>{match.team?.name || "Your team"}</span><strong>{participant}</strong>
    </div>
    <b>VS</b>
    <div>
      <MobileIdentityImage sources={[teamLogo(match.opponentTeam?.logo)]} name={match.opponentTeam?.name} className={styles.teamLogo} fallbackClassName={styles.teamLogoFallback} />
      <span>{match.opponentTeam?.name || "Opposing team"}</span><strong>{opponents}</strong>
    </div>
  </div>;
}

function Action({ match, busy, onOpen }) {
  const action = matchAction(match);
  if (action.kind === "result") {
    return <Link className={styles.primaryAction} href={`/live?view=matchups&round=${match.round}#match-${match.matchId}`}>{action.label}</Link>;
  }
  if (!action.enabled) return <Link className={styles.secondaryAction} href={`/live?view=matchups&round=${match.round}#match-${match.matchId}`}>View Match Details</Link>;
  return <button className={styles.primaryAction} disabled={busy} onClick={() => onOpen(match)}>
    {busy ? "Opening…" : action.label === "Open Scorecard" ? "Start Scoring" : action.label}
  </button>;
}

function Schedule({ matches, emphasizedId }) {
  return <details className={styles.schedule}>
    <summary><span>My Schedule</span><small>{matches.length} match{matches.length === 1 ? "" : "es"}</small></summary>
    <div className={styles.scheduleList}>
      {matches.map((match) => {
        const action = matchAction(match);
        return <article key={match.matchId} data-current={match.matchId === emphasizedId}>
          <div>
            <span>{matchMeta(match)}</span>
            <strong>{match.course || "Course to be announced"}</strong>
            <small>{match.teeTime || "Tee time TBD"} · {match.opponentNames?.join(" + ") || "Opponents TBD"}</small>
          </div>
          <div><b>{formatMatchResult(match, match.team?.side) || appMatchStatus(match)}</b><small>{action.label}</small></div>
        </article>;
      })}
    </div>
  </details>;
}

export default function PersonalizedPlayerHome() {
  const [payload, setPayload] = useState(null);
  const [state, setState] = useState("loading");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/player-passport/matches", { cache: "no-store" });
      if (response.status === 401) {
        setPayload(null); setState("public"); return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error();
      setPayload(result.data); setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const selection = useMemo(() =>
    selectRelevantPlayerMatches(payload?.matches || [], payload?.tournament?.currentRound),
  [payload]);
  const primary = selection.primary;
  const countdown = countdownParts(primary?.teeTimeAt, now);

  const openMatch = async (match) => {
    setBusyId(match.matchId); setMessage("");
    try {
      const response = await fetch("/api/player-passport/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: match.matchId }),
      });
      if (!response.ok) throw new Error();
      window.location.assign("/score");
    } catch {
      setMessage("This scorecard is not available right now.");
      setBusyId("");
    }
  };

  if (state === "loading") return <section className={styles.loading} aria-live="polite">
    <span className={styles.skeleton} />
    <span className={styles.skeleton} />
    <span className={styles.skeleton} />
    <span className={styles.visuallyHidden}>Checking your Player Passport…</span>
  </section>;
  if (state === "public") return <section className={styles.empty}>
    <p>Your Match</p>
    <h2 id="player-home-title">Find your tournament match</h2>
    <span>Activate Player Passport to see your partner, opponents, course, and tee time.</span>
    <Link className={styles.primaryAction} href="/activate">Activate Player Passport</Link>
  </section>;
  if (state === "error") return <section className={styles.error}>
    <strong>We couldn’t load your tournament right now.</strong>
    <button onClick={refresh}>Try again</button>
  </section>;

  const player = payload?.player;
  const matches = selection.ordered;

  return <section className={styles.wrap} aria-labelledby="player-home-title">
    <div className={styles.identity}>
      <div className={styles.identityPlayer}>
        <MobileIdentityImage
          sources={imageFallbackSources({
            playerPhoto: playerPhoto(player?.photo),
            teamLogo: teamLogo(player?.teamLogo),
            tournamentLogo: tournamentLogo(payload?.tournament?.logo),
          })}
          name={player?.name}
          className={styles.identityImage}
          fallbackClassName={styles.identityFallback}
        />
        <div><span>Player Passport</span><strong>Welcome back, {firstName(player?.name)}</strong></div>
      </div>
    </div>

    {!matches.length ? <div className={styles.empty}>
      <p>Your Tournament</p>
      <h2 id="player-home-title">No assigned matches yet</h2>
      <span>When pairings are published, your schedule will appear here automatically.</span>
    </div> : selection.choices.length ? <div className={styles.card}>
      <p>Your Tournament</p>
      <h2 id="player-home-title">Choose a Match</h2>
      <span className={styles.intro}>More than one match is open. Choose the scorecard you intend to update.</span>
      <div className={styles.choices}>{selection.choices.map((match) =>
        <button key={match.matchId} disabled={busyId === match.matchId} onClick={() => openMatch(match)}>
          <span>{matchMeta(match)}</span><strong>{match.course || "Course TBA"}</strong><small>{match.teeTime || "Tee time TBD"} · Open Scorecard</small>
        </button>
      )}</div>
      <Schedule matches={matches} />
    </div> : <div className={styles.card}>
      <div className={styles.cardTop}>
        <div><p>Your Match</p><h2 id="player-home-title">{matchMeta(primary)}</h2></div>
        <span data-status={normalizedMatchStatus(primary)}>{appMatchStatus(primary)}</span>
      </div>
      <div className={styles.venue}>
        <MobileIdentityImage
          sources={[courseLogo(primary.courseLogo)]}
          name={primary.course}
          className={styles.courseLogo}
          fallbackClassName={styles.courseLogoFallback}
        />
        <div>
          <strong>{primary.course || "Course to be announced"}</strong>
          <span>{primary.teeTime || "Tee time TBD"}{countdown ? ` · ${countdown.label}` : ""}</span>
        </div>
      </div>
      <MatchPeople match={primary} />
      {normalizedMatchStatus(primary) === "LIVE" ? <div className={styles.progress}>
        <span>Through {primary.currentHole || primary.holesRecorded || "—"}</span>
        {primary.updatedAt ? <small>Last updated {new Date(primary.updatedAt).toLocaleString()}</small> : null}
      </div> : null}
      {primary.result ? <div className={styles.complete}><span>Match Complete</span><strong>{formatMatchResult(primary, primary.team?.side)}</strong></div> : null}
      <Action match={primary} busy={busyId === primary.matchId} onOpen={openMatch} />
      {normalizedMatchStatus(primary) === "LOCKED" ? <p className={styles.note}>The tournament director has locked scoring for this match.</p> : null}
      {normalizedMatchStatus(primary) === "UPCOMING" ? <p className={styles.note}>Scoring will become available when participant access opens.</p> : null}
      {message ? <p className={styles.message} role="alert">{message}</p> : null}
      <Schedule matches={matches} emphasizedId={primary.matchId} />
    </div>}

    {payload?.snapshot ? <div className={styles.snapshot}>
      <div><span>Match Points</span><strong>{payload.snapshot.points}</strong></div>
      <div><span>Record</span><strong>{payload.snapshot.record.wins}-{payload.snapshot.record.losses}-{payload.snapshot.record.halves}</strong></div>
      <div><span>Matches Played</span><strong>{payload.snapshot.matchesPlayed}</strong></div>
    </div> : null}
  </section>;
}
