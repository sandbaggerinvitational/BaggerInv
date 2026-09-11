"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  countdownParts,
  matchAction,
  normalizedMatchStatus,
  selectRelevantPlayerMatches,
} from "../lib/player-home";
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
  const participant = match.participantNames?.join(" + ") || "Your side";
  const opponents = match.opponentNames?.join(" + ") || "Opponents TBD";
  return <div className={styles.people}>
    <div><span>{match.team?.name || "Your team"}</span><strong>{participant}</strong></div>
    <b>VS</b>
    <div><span>Opponent</span><strong>{opponents}</strong></div>
  </div>;
}

function Action({ match, busy, onOpen }) {
  const action = matchAction(match);
  if (action.kind === "result") {
    return <Link className={styles.primaryAction} href={`/live?view=matchups&round=${match.round}#match-${match.matchId}`}>{action.label}</Link>;
  }
  return <button className={styles.primaryAction} disabled={!action.enabled || busy} onClick={() => onOpen(match)}>
    {busy ? "Opening…" : action.label}
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
          <div><b>{match.result?.label || normalizedMatchStatus(match)}</b><small>{action.label}</small></div>
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

  const clearPassport = async () => {
    await fetch("/api/player-passport/session", { method: "DELETE" });
    setPayload(null); setState("public");
    window.dispatchEvent(new Event("player-passport-cleared"));
  };

  if (state === "loading") return <section className={styles.loading} aria-live="polite">Checking your Player Passport…</section>;
  if (state === "public") return null;
  if (state === "error") return <section className={styles.error}>
    <strong>We couldn’t load your tournament right now.</strong>
    <button onClick={refresh}>Try again</button>
  </section>;

  const player = payload?.player;
  const matches = selection.ordered;

  return <section className={styles.wrap} aria-labelledby="player-home-title">
    <div className={styles.identity}>
      <div className={styles.identityPlayer}>
        {player?.teamLogo ? <img src={`/images/${player.teamLogo}`} alt="" /> : null}
        <div><span>Player Passport</span><strong>Welcome back, {firstName(player?.name)}</strong></div>
      </div>
      <button onClick={clearPassport}>This isn’t me</button>
    </div>

    {!matches.length ? <div className={styles.empty}>
      <p>Your Tournament</p>
      <h2 id="player-home-title">No assigned matches yet</h2>
      <span>When pairings are published, your schedule will appear here automatically.</span>
      <div><Link href={player?.slug ? `/players/${player.slug}` : "/players"}>View Player Profile</Link><Link href="/live">Open Match Center</Link></div>
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
        <span data-status={normalizedMatchStatus(primary)}>{normalizedMatchStatus(primary)}</span>
      </div>
      <div className={styles.venue}>
        <strong>{primary.course || "Course to be announced"}</strong>
        <span>{primary.teeTime || "Tee time TBD"}{countdown ? ` · ${countdown.label}` : ""}</span>
      </div>
      <MatchPeople match={primary} />
      {normalizedMatchStatus(primary) === "LIVE" ? <div className={styles.progress}>
        <span>Through {primary.currentHole || primary.holesRecorded || "—"}</span>
        {primary.updatedAt ? <small>Last updated {new Date(primary.updatedAt).toLocaleString()}</small> : null}
      </div> : null}
      {primary.result ? <div className={styles.complete}><span>Match Complete</span><strong>{primary.result.label}</strong></div> : null}
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
    <nav className={styles.links} aria-label="Your tournament links">
      <Link href={player?.slug ? `/players/${player.slug}` : "/players"}>Player Profile</Link>
      <Link href="/live?view=points">Live Leaderboard</Link>
      <Link href="/live">Match Center</Link>
    </nav>
  </section>;
}
