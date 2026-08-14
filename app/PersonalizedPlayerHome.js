"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  countdownParts,
  homeFormatLabel,
  homeRoundSummaryMatches,
  matchAction,
  normalizedMatchStatus,
  selectRelevantPlayerMatches,
} from "../lib/player-home";
import { appMatchStatus, formatMatchResult } from "../lib/mobile-tournament-app";
import { courseLogoSources, optimizedAssetUrl, teamLogo } from "../lib/asset-paths";
import { formatHomeTime } from "../lib/home-dashboard";
import { fetchWithTransientRetry } from "../lib/transient-fetch";
import { clearParticipantInitializationCache, readParticipantInitializationCache, writeParticipantInitializationCache } from "../lib/participant-initialization-cache";
import MobileIdentityImage from "./MobileIdentityImage";
import MatchStatusBlock from "./MatchStatusBlock";
import PlayerSetupBanner from "./PlayerSetupBanner";
import styles from "./personalized-player-home.module.css";

function roundMatchMeta(match) {
  return [
    match?.round ? `Round ${match.round}` : "",
    match?.match ? `Match ${match.match}` : "",
  ].filter(Boolean).join(" · ");
}

function matchLabel(match) {
  return [roundMatchMeta(match), homeFormatLabel(match?.format)].filter(Boolean).join(", ");
}

function MatchHeading({ match, id, compact = false, semantic = false }) {
  const Element = semantic ? "h2" : "div";
  return <Element className={compact ? styles.compactMatchHeading : styles.matchHeading} id={id}>
    <span>{roundMatchMeta(match)}</span>
    {match?.format ? <strong>{homeFormatLabel(match.format)}</strong> : null}
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

function PlayerLines({ names }) {
  if (!names?.length) return <span className={styles.playerTbd}>Players TBD</span>;
  return <div className={styles.playerLines}>{names.map((name) => (
    <span key={name}>
      <span className={styles.playerNameText}>{name}</span>
    </span>
  ))}</div>;
}

function MatchPeople({ match }) {
  return <div className={styles.people}>
    <div>
      <MobileIdentityImage sources={[teamLogo(match.team?.logo)]} name={match.team?.name} className={styles.teamLogo} fallbackClassName={styles.teamLogoFallback} />
      <strong>{match.team?.name || "Your team"}</strong>
      <PlayerLines names={match.participantNames} />
    </div>
    <b aria-label="versus">VS</b>
    <div>
      <MobileIdentityImage sources={[teamLogo(match.opponentTeam?.logo)]} name={match.opponentTeam?.name} className={styles.teamLogo} fallbackClassName={styles.teamLogoFallback} />
      <strong>{match.opponentTeam?.name || "Opposing team"}</strong>
      <PlayerLines names={match.opponentNames} />
    </div>
  </div>;
}

function CourseIdentity({ match, compact = false }) {
  const width = compact ? 56 : 72;
  return <MobileIdentityImage
    sources={courseLogoSources({ courseId: match?.courseId, filename: match?.courseLogo })
      .map((source) => optimizedAssetUrl(source, width))}
    name={match?.course}
    alt=""
    className={compact ? styles.roundCourseLogo : styles.courseLogo}
    fallbackClassName={compact ? styles.roundCourseLogoFallback : styles.courseLogoFallback}
  />;
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

function MyRounds({ matches, totalCount, timeZone }) {
  return <section className={styles.schedule} aria-labelledby="my-rounds-title">
    <header>
      <div><p>Your Golf</p><h2 id="my-rounds-title">My Rounds</h2></div>
      <small>{totalCount} match{totalCount === 1 ? "" : "es"}</small>
      <Link href="/my-match">View All <span aria-hidden="true">→</span></Link>
    </header>
    <div className={styles.scheduleList}>
      {matches.map((match) => {
        const tee = teeLabel(match.tee);
        const status = appMatchStatus(match);
        const result = formatMatchResult(match, match.team?.side) || status;
        const roundContext = [
          match.course || "Course to be announced",
          tee,
          status === "Upcoming" ? matchTime(match, timeZone) || "Tee time TBD" : "",
        ].filter(Boolean).join(" · ");
        return <Link
          key={match.matchId}
          className={styles.roundCard}
          data-complete={status === "Final" ? "true" : undefined}
          href={`/game-center/${encodeURIComponent(match.matchId)}?from=home`}
          aria-label={`${matchLabel(match)} at ${match.course || "course to be announced"}`}
        >
          <CourseIdentity match={match} compact />
          <div className={styles.roundSummary}>
            <strong className={styles.roundIdentity}>{[match.round ? `Round ${match.round}` : "Round", homeFormatLabel(match.format)].filter(Boolean).join(" · ")}</strong>
            <span className={styles.roundCourse}>{roundContext}</span>
          </div>
          <b className={styles.roundResult}>{result}</b>
        </Link>;
      })}
    </div>
  </section>;
}

const skinsCurrency = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number(value) % 1 ? 2 : 0 }).format(Number(value) || 0);

function PlayerNetSkins({ netSkins, playerId }) {
  const entries = (netSkins?.rounds || []).flatMap((round) => (round.leaderboard || [])
    .filter((row) => row.playerIds?.includes(playerId))
    .map((row) => ({ ...row, round: round.round })));
  if (!playerId || !entries.length) return null;
  const skins = entries.reduce((sum, row) => sum + (Number(row.skinsWon) || 0), 0);
  const winnings = entries.reduce((sum, row) => sum + (Number(row.totalWinnings) || 0), 0);
  return <section className={styles.netSkins} aria-labelledby="home-net-skins-title">
    <div className={styles.netSkinsLayout}>
      <span className={styles.skinCoin} aria-hidden="true">S</span>
      <div className={styles.netSkinsCopy}>
        <p>Your Competitions</p>
        <h2 id="home-net-skins-title">Net Skins</h2>
        <div className={styles.netSkinsSummary}><strong>{skins} skin{skins === 1 ? "" : "s"}</strong><span aria-hidden="true">·</span><strong>{skinsCurrency(winnings)} winnings</strong></div>
      </div>
      <Link href="/live?view=leaderboards&tab=skins">View <i aria-hidden="true">→</i></Link>
    </div>
  </section>;
}

function promotedMatchIds(selection) {
  return [selection.primary?.matchId, ...(selection.choices || []).map((match) => match.matchId)].filter(Boolean);
}

function parseServerTiming(value = "") {
  return Object.fromEntries(String(value).split(",").map((entry) => {
    const [name, duration] = entry.trim().split(";dur=");
    return [name, Number(duration) || 0];
  }).filter(([name]) => name));
}

export function PersonalizedPlayerHomeSecondary({ netSkins = null, data = null }) {
  const selection = selectRelevantPlayerMatches(data?.matches || [], data?.tournament?.currentRound);
  const matches = selection.ordered;
  const summaryMatches = homeRoundSummaryMatches(matches, promotedMatchIds(selection));
  if (!data) return null;
  return <>
    <PlayerNetSkins netSkins={netSkins} playerId={data?.player?.id} />
    {summaryMatches.length ? <MyRounds matches={summaryMatches} totalCount={matches.length} timeZone={data?.tournament?.timeZone} /> : null}
  </>;
}

export default function PersonalizedPlayerHome({ netSkins = null, initialData = null, managed = false, participantIdentityAuthority = "passport", showSecondary = true }) {
  const cachedInitialization = useMemo(() => managed ? null : readParticipantInitializationCache(), [managed]);
  const [payload, setPayload] = useState(initialData || cachedInitialization?.data || null);
  const [state, setState] = useState(initialData || cachedInitialization ? "ready" : "loading");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const [secondaryReady, setSecondaryReady] = useState(false);
  const refreshSequence = useRef(0);
  const refreshController = useRef(null);

  const refresh = useCallback(async (signal) => {
    if (managed) return;
    const sequence = ++refreshSequence.current;
    const clientStartedAt = performance.now();
    setState((current) => current === "ready" ? current : "loading");
    try {
      const response = await fetchWithTransientRetry("/api/player-passport/initialize", { cache: "no-store", signal });
      if (sequence !== refreshSequence.current) return;
      if (response.status === 401) {
        clearParticipantInitializationCache();
        setPayload(null); setState("public"); return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error();
      console.info("Personalized Home load timing", {
        ...parseServerTiming(response.headers.get("server-timing") || ""),
        clientTotal: Math.round(performance.now() - clientStartedAt),
        cache: response.headers.get("x-home-initialization-cache") || "unknown",
      });
      writeParticipantInitializationCache(result);
      if (sequence !== refreshSequence.current) return;
      setPayload(result.data); setState("ready");
    } catch (error) {
      if (error?.name === "AbortError" || sequence !== refreshSequence.current) return;
      setState("error");
    }
  }, [managed]);

  useEffect(() => {
    if (!managed || !initialData) return;
    setPayload(initialData);
    setState("ready");
  }, [initialData, managed]);

  useEffect(() => {
    if (managed) return undefined;
    const controller = new AbortController();
    refreshController.current = controller;
    if (!cachedInitialization) refresh(controller.signal);
    else {
      const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 800));
      const cancel = window.cancelIdleCallback || window.clearTimeout;
      const task = schedule(() => refresh(controller.signal), { timeout: 1500 });
      return () => { controller.abort(); cancel(task); refreshSequence.current += 1; };
    }
    return () => { controller.abort(); refreshSequence.current += 1; };
  }, [cachedInitialization, managed, refresh]);
  useEffect(() => {
    if (managed) return undefined;
    let controller;
    const focus = () => {
      controller?.abort();
      controller = new AbortController();
      refreshController.current = controller;
      refresh(controller.signal);
    };
    window.addEventListener("focus", focus);
    return () => { controller?.abort(); window.removeEventListener("focus", focus); };
  }, [managed, refresh]);
  useEffect(() => {
    const cancelForNavigation = () => {
      refreshSequence.current += 1;
      refreshController.current?.abort();
    };
    window.addEventListener("participant-navigation-start", cancelForNavigation);
    return () => window.removeEventListener("participant-navigation-start", cancelForNavigation);
  }, []);
  useEffect(() => {
    const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 500));
    const cancel = window.cancelIdleCallback || window.clearTimeout;
    const task = schedule(() => setSecondaryReady(true), { timeout: 1200 });
    return () => cancel(task);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const selection = useMemo(() =>
    selectRelevantPlayerMatches(payload?.matches || [], payload?.tournament?.currentRound),
  [payload]);
  const primary = selection.primary;
  const primaryLifecycle = primary ? normalizedMatchStatus(primary) : "";
  const countdown = ["UPCOMING", "OPEN"].includes(primaryLifecycle)
    ? countdownParts(primary?.teeTimeAt, now)
    : null;

  const openMatch = async (match) => {
    setBusyId(match.matchId); setMessage("");
    try {
      const response = await fetch("/api/player-passport/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: match.matchId, requestedAction: "START_SCORING" }),
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
      <strong>Loading your personalized tournament…</strong>
      <span>Your match, setup, and player details are loading.</span>
      <span className={styles.skeleton} />
      <span className={styles.skeleton} />
      <span className={styles.skeleton} />
    </section>
  </>;
  if (state === "public") return <>
    <section className={styles.empty}>
      <p>Your Match</p>
      <h2 id="player-home-title">Find your tournament match</h2>
      <span>{participantIdentityAuthority === "supabase" ? "Sign in to see your partner, opponents, course, and tee time." : "Activate Player Passport to see your partner, opponents, course, and tee time."}</span>
      <Link className={styles.primaryAction} href={participantIdentityAuthority === "supabase" ? "/participant-auth?next=/home" : "/activate"}>{participantIdentityAuthority === "supabase" ? "Participant sign-in" : "Activate Player Passport"}</Link>
    </section>
  </>;
  if (state === "error") return <>
    <section className={styles.error}>
      <strong>We couldn’t load your tournament right now.</strong>
      <button onClick={refresh}>Try again</button>
    </section>
  </>;

  const player = payload?.player;
  const matches = selection.ordered;
  const summaryMatches = homeRoundSummaryMatches(matches, promotedMatchIds(selection));
  const primaryStatus = primary ? appMatchStatus(primary) : "";
  const primaryResult = primary ? formatMatchResult(primary, primary.team?.side) : "";

  return <section className={styles.wrap} aria-labelledby="player-home-title">
    <PlayerSetupBanner readiness={payload?.readiness} onUpdated={refresh} />
    {!matches.length ? <div className={styles.empty}>
      <p>Your Tournament</p>
      <h2 id="player-home-title">No assigned matches yet</h2>
      <span>When pairings are published, your schedule will appear here automatically.</span>
    </div> : selection.choices.length ? <div className={styles.card} data-variant="choices">
      <p>Your Match</p>
      <h2 id="player-home-title">Choose a Match</h2>
      <span className={styles.intro}>More than one match is open. Choose the scorecard you intend to update.</span>
      <div className={styles.choices}>{selection.choices.map((match) =>
        <button key={match.matchId} disabled={busyId === match.matchId} onClick={() => openMatch(match)}>
          <CourseIdentity match={match} compact />
          <span className={styles.choiceDetails}>
            <MatchHeading match={match} compact />
            <strong>{match.course || "Course TBA"}</strong>
            <small>{matchTime(match, payload?.tournament?.timeZone) || "Tee time TBD"}</small>
          </span>
          <span className={styles.choiceAction}>{busyId === match.matchId ? "Opening…" : <>Open Scorecard <i aria-hidden="true">→</i></>}</span>
        </button>
      )}</div>
    </div> : <div className={styles.card}>
      <div className={styles.cardTop}>
        <div><p>Your Match</p><MatchHeading match={primary} id="player-home-title" semantic /></div>
        <MatchStatusBlock status={primaryStatus} result={primaryResult} />
      </div>
      <div className={styles.venue}>
        <CourseIdentity match={primary} />
        <div>
          <strong>{primary.course || "Course to be announced"}</strong>
          <span>{matchTime(primary, payload?.tournament?.timeZone) || "Tee time TBD"}{countdown ? ` · ${countdown.label}` : ""}</span>
        </div>
      </div>
      <MatchPeople match={primary} />
      {primaryLifecycle === "LIVE" ? <div className={styles.progress}>
        <span>Through {primary.currentHole || primary.holesRecorded || "—"}</span>
        {primary.updatedAt ? <small>Last updated {new Date(primary.updatedAt).toLocaleString()}</small> : null}
      </div> : null}
      <Action match={primary} busy={busyId === primary.matchId} onOpen={openMatch} />
      {primaryLifecycle === "LOCKED" ? <p className={styles.note}>The tournament director has locked scoring for this match.</p> : null}
      {primaryLifecycle === "UPCOMING" ? <p className={styles.note}>Scoring will become available when participant access opens.</p> : null}
      {message ? <p className={styles.message} role="alert">{message}</p> : null}
    </div>}

    {showSecondary && secondaryReady ? <PlayerNetSkins netSkins={netSkins} playerId={player?.id} /> : null}
    {showSecondary && secondaryReady && summaryMatches.length ? <MyRounds
      matches={summaryMatches}
      totalCount={matches.length}
      timeZone={payload?.tournament?.timeZone}
    /> : null}
  </section>;
}
