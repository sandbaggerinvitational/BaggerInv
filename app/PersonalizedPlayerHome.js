"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  countdownParts,
  matchAction,
  normalizedMatchStatus,
  selectRelevantPlayerMatches,
} from "../lib/player-home";
import { appMatchStatus, formatMatchResult } from "../lib/mobile-tournament-app";
import { courseLogo, teamLogo } from "../lib/asset-paths";
import { formatHomeTime } from "../lib/home-dashboard";
import MobileIdentityImage from "./MobileIdentityImage";
import MatchStatusBlock from "./MatchStatusBlock";
import styles from "./personalized-player-home.module.css";

function roundMatchMeta(match) {
  return [
    match?.round ? `Round ${match.round}` : "",
    match?.match ? `Match ${match.match}` : "",
  ].filter(Boolean).join(" • ");
}

function matchLabel(match) {
  return [roundMatchMeta(match), match?.format].filter(Boolean).join(", ");
}

function MatchHeading({ match, id, compact = false, semantic = false }) {
  const Element = semantic ? "h2" : "div";
  return <Element className={compact ? styles.compactMatchHeading : styles.matchHeading} id={id}>
    <span>{roundMatchMeta(match)}</span>
    {match?.format ? <strong>{match.format}</strong> : null}
  </Element>;
}

function teeLabel(value) {
  const tee = String(value || "").trim();
  if (!tee) return "";
  return /\btees?\b/i.test(tee) ? tee : `${tee.replace(/\b\w/g, (letter) => letter.toUpperCase())} Tees`;
}

function matchTime(match, timeZone) {
  return formatHomeTime(match?.teeTime, {
    scheduledAt: match?.teeTimeAt,
    timeZone,
  });
}

function PlayerLines({ names, currentPlayer, showCurrentBadge = true }) {
  if (!names?.length) return <span className={styles.playerTbd}>Players TBD</span>;
  return <div className={styles.playerLines}>{names.map((name) => {
    const showBadge = showCurrentBadge && name === currentPlayer;
    return <span key={name} data-current={showBadge ? "true" : undefined}>
      <span className={styles.playerNameText}>{name}</span>
      {showBadge ? <small aria-label="Current player">YOU</small> : null}
    </span>;
  })}</div>;
}

function MatchPeople({ match, currentPlayer }) {
  return <div className={styles.people}>
    <div>
      <MobileIdentityImage sources={[teamLogo(match.team?.logo)]} name={match.team?.name} className={styles.teamLogo} fallbackClassName={styles.teamLogoFallback} />
      <strong>{match.team?.name || "Your team"}</strong>
      <PlayerLines names={match.participantNames} currentPlayer={currentPlayer} />
    </div>
    <b aria-label="versus">VS</b>
    <div>
      <MobileIdentityImage sources={[teamLogo(match.opponentTeam?.logo)]} name={match.opponentTeam?.name} className={styles.teamLogo} fallbackClassName={styles.teamLogoFallback} />
      <strong>{match.opponentTeam?.name || "Opposing team"}</strong>
      <PlayerLines names={match.opponentNames} currentPlayer={currentPlayer} />
    </div>
  </div>;
}

function Action({ match, busy, onOpen }) {
  const action = matchAction(match);
  const detailsHref = `/game-center/${encodeURIComponent(match.matchId)}?from=home`;
  if (action.kind === "result") {
    return <Link className={styles.primaryAction} href={detailsHref}>{action.label}</Link>;
  }
  if (!action.enabled) return <Link className={styles.secondaryAction} href={detailsHref}>View Match Details</Link>;
  return <button className={styles.primaryAction} disabled={busy} onClick={() => onOpen(match)}>
    {busy ? "Opening…" : action.label === "Open Scorecard" ? "Start Scoring" : action.label}
  </button>;
}

function MyRounds({ matches, emphasizedId, currentPlayer, timeZone }) {
  return <section className={styles.schedule} aria-labelledby="my-rounds-title">
    <header>
      <div><p>Your Golf</p><h2 id="my-rounds-title">My Rounds</h2></div>
      <small>{matches.length} match{matches.length === 1 ? "" : "es"}</small>
    </header>
    <div className={styles.scheduleList}>
      {matches.map((match) => {
        const tee = teeLabel(match.tee);
        return <Link
          key={match.matchId}
          className={styles.roundCard}
          data-current={match.matchId === emphasizedId}
          href={`/game-center/${encodeURIComponent(match.matchId)}?from=home`}
          aria-label={`${matchLabel(match)} at ${match.course || "course to be announced"}`}
        >
          <div className={styles.roundTop}>
            <div>
              <MatchHeading match={match} compact />
              <strong className={styles.roundCourse}>{match.course || "Course to be announced"}</strong>
            </div>
            <b>{formatMatchResult(match, match.team?.side) || appMatchStatus(match)}</b>
          </div>
          <div className={styles.roundVenue}>
            <MobileIdentityImage
              sources={[courseLogo(match.courseLogo)]}
              name={match.course}
              alt=""
              className={styles.roundCourseLogo}
              fallbackClassName={styles.roundCourseLogoFallback}
            />
            <small>{[tee, matchTime(match, timeZone) || "Tee time TBD"].filter(Boolean).join(" · ")}</small>
          </div>
          <div className={styles.roundMatchup}>
            <div><em>{match.team?.name || "Your team"}</em><PlayerLines names={match.participantNames} currentPlayer={currentPlayer} showCurrentBadge={false} /></div>
            <i>VS</i>
            <div><em>{match.opponentTeam?.name || "Opposing team"}</em><PlayerLines names={match.opponentNames} currentPlayer={currentPlayer} showCurrentBadge={false} /></div>
          </div>
        </Link>;
      })}
    </div>
  </section>;
}

export default function PersonalizedPlayerHome({ tournamentPulse = null }) {
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

  if (state === "loading") return <>
    <section className={styles.loading} aria-live="polite">
      <span className={styles.skeleton} />
      <span className={styles.skeleton} />
      <span className={styles.skeleton} />
      <span className={styles.visuallyHidden}>Checking your Player Passport…</span>
    </section>
    {tournamentPulse}
  </>;
  if (state === "public") return <>
    <section className={styles.empty}>
      <p>Your Match</p>
      <h2 id="player-home-title">Find your tournament match</h2>
      <span>Activate Player Passport to see your partner, opponents, course, and tee time.</span>
      <Link className={styles.primaryAction} href="/activate">Activate Player Passport</Link>
    </section>
    {tournamentPulse}
  </>;
  if (state === "error") return <>
    <section className={styles.error}>
      <strong>We couldn’t load your tournament right now.</strong>
      <button onClick={refresh}>Try again</button>
    </section>
    {tournamentPulse}
  </>;

  const player = payload?.player;
  const matches = selection.ordered;
  const primaryStatus = primary ? appMatchStatus(primary) : "";
  const primaryResult = primary ? formatMatchResult(primary, primary.team?.side) : "";

  return <section className={styles.wrap} aria-labelledby="player-home-title">
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
          <MatchHeading match={match} compact />
          <strong>{match.course || "Course TBA"}</strong>
          <small>{matchTime(match, payload?.tournament?.timeZone) || "Tee time TBD"} · Open Scorecard</small>
        </button>
      )}</div>
    </div> : <div className={styles.card}>
      <div className={styles.cardTop}>
        <div><p>Your Match</p><MatchHeading match={primary} id="player-home-title" semantic /></div>
        <MatchStatusBlock status={primaryStatus} result={primaryResult} />
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
          <span>{matchTime(primary, payload?.tournament?.timeZone) || "Tee time TBD"}{countdown ? ` · ${countdown.label}` : ""}</span>
        </div>
      </div>
      <MatchPeople match={primary} currentPlayer={player?.name} />
      {normalizedMatchStatus(primary) === "LIVE" ? <div className={styles.progress}>
        <span>Through {primary.currentHole || primary.holesRecorded || "—"}</span>
        {primary.updatedAt ? <small>Last updated {new Date(primary.updatedAt).toLocaleString()}</small> : null}
      </div> : null}
      <Action match={primary} busy={busyId === primary.matchId} onOpen={openMatch} />
      {normalizedMatchStatus(primary) === "LOCKED" ? <p className={styles.note}>The tournament director has locked scoring for this match.</p> : null}
      {normalizedMatchStatus(primary) === "UPCOMING" ? <p className={styles.note}>Scoring will become available when participant access opens.</p> : null}
      {message ? <p className={styles.message} role="alert">{message}</p> : null}
    </div>}

    {tournamentPulse}
    {matches.length ? <MyRounds
      matches={matches}
      emphasizedId={primary?.matchId}
      currentPlayer={player?.name}
      timeZone={payload?.tournament?.timeZone}
    /> : null}
  </section>;
}
