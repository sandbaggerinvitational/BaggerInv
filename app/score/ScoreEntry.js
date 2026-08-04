"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { finalizedMatchResult, formatLiveMatchResult } from "../../lib/match-result.js";
import { getStrokesOnHole } from "../../lib/scorecard-net.js";
import { runningMatchStatusAtHole, scoringProgress } from "../../lib/scoring-experience.js";
import { fetchWithTransientRetry } from "../../lib/transient-fetch.js";
import StatusBadge from "../StatusBadge";
import TournamentIdentityHeader from "../TournamentIdentityHeader";
import MyMatchDashboard from "./MyMatchDashboard";
import styles from "./score.module.css";

const jsonScores = (value) => {
  try { return JSON.parse(value || "[]"); } catch { return []; }
};
function playerIds(match, side) {
  return [match[`Team ${side} Player 1`], match[`Team ${side} Player 2`]].filter(Boolean);
}

function strokeDots(count) {
  return count > 0 ? "•".repeat(count) : "";
}

function grossAt(score, side, index) {
  return jsonScores(score?.[`Team ${side} Gross Scores`])?.[index] ?? "";
}

function holeWinnerMark(score, teamNames) {
  if (score?.["Hole Winner"] === "Team 1") return teamNames[1] || "Team 1";
  if (score?.["Hole Winner"] === "Team 2") return teamNames[2] || "Team 2";
  return score?.["Hole Winner"] === "Halved" ? "—" : "";
}

function compactTeamName(value) {
  const name = String(value || "").trim().replace(/^the\s+/i, "");
  return name.split(/\s+and\s+/i)[0] || name;
}

function compactHoleWinnerMark(score, teamNames) {
  if (score?.["Hole Winner"] === "Team 1") return compactTeamName(teamNames[1] || "Team 1");
  if (score?.["Hole Winner"] === "Team 2") return compactTeamName(teamNames[2] || "Team 2");
  return "—";
}

function finalResultSummary(result, teamNames) {
  if (/^halved$/i.test(String(result || "").trim())) return "Halved";
  let notation = String(result || "").trim();
  for (const name of [teamNames[1], teamNames[2]]) {
    if (name && notation.toLowerCase().startsWith(String(name).toLowerCase())) {
      notation = notation.slice(String(name).length).trim();
      break;
    }
  }
  if (!notation) return "Final";
  if (/^won\b/i.test(notation)) return notation.replace(/^won\b/i, "Won");
  return `Won ${notation}`;
}

function ScorecardCell({ readOnly, disabled, onEdit, children, label }) {
  if (readOnly) return <span aria-label={label}>{children}</span>;
  return <button type="button" disabled={disabled} onClick={onEdit} aria-label={label}>{children}</button>;
}

export default function ScoreEntry({ dashboardOnly = false }) {
  const [name, setName] = useState("");
  const [credential, setCredential] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState("");
  const [matchOptions, setMatchOptions] = useState([]);
  const [data, setData] = useState(null);
  const [holeNumber, setHoleNumber] = useState(1);
  const [gross, setGross] = useState({ team1: [], team2: [] });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [passportPlayer, setPassportPlayer] = useState(null);
  const [passportMatches, setPassportMatches] = useState([]);
  const [passportTournament, setPassportTournament] = useState(null);
  const [passportState, setPassportState] = useState("loading");
  const [restoreAttempt, setRestoreAttempt] = useState(0);

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The scoring request failed.");
    return payload;
  };

  const loadMatch = async () => {
    const response = await fetch("/api/scoring/current", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load the match.");
    setData(payload.data);
    setShowReview(payload.data.match["Match Status"] === "Final" || Boolean(payload.data.canConfirm));
    setConfirming(false);
    const scored = payload.data.holeScores.map((item) => Number(item["Hole Number"]));
    const targetHole = payload.data.match["Match Status"] === "Final"
      ? Math.max(1, ...scored)
      : Array.from({ length: 18 }, (_, index) => index + 1)
        .find((hole) => !scored.includes(hole)) || 18;
    selectHole(targetHole, payload.data);
  };

  const loadMatchOptions = async () => {
    const response = await fetch("/api/scoring/access", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load active matches.");
    setMatchOptions(payload.data?.matches || []);
  };

  useEffect(() => {
    let current = true;
    const restore = async () => {
      setPassportState("loading");
      try {
        const [session, passport] = await Promise.all([
          dashboardOnly ? Promise.resolve(null) : fetch("/api/scoring/session", { cache: "no-store" }),
          fetchWithTransientRetry("/api/player-passport/initialize", { cache: "no-store" }),
        ]);
        if (passport.ok) {
          const identity = await passport.json();
          if (!current) return;
          setPassportPlayer(identity.player);
          setPassportState("active");
          setPassportMatches(identity.data?.matches || []);
          setPassportTournament(identity.data?.tournament || null);
        } else if (passport.status === 401) {
          setPassportState("inactive");
        } else {
          setPassportState("unavailable");
        }
        if (session?.ok) {
          const payload = await session.json();
          setName(payload.scorerName || "");
          setAuthorized(true);
          await loadMatch();
          return;
        }
        if (passport.status === 401 && !dashboardOnly) await loadMatchOptions();
      } catch {
        if (current) setPassportState("unavailable");
      } finally {
        if (current) setRestoring(false);
      }
    };
    restore();
    return () => { current = false; };
  }, [dashboardOnly, restoreAttempt]);

  const login = async () => {
    setBusy(true); setStatus("Opening scoring…");
    try {
      const payload = await request("/api/scoring/session", {
        method: "POST",
        body: JSON.stringify({
          scorerName: name,
          selector: selectedMatch,
          accessCode: credential,
        }),
      });
      setAuthorized(true);
      await loadMatch();
      setStatus("");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  const openPassportMatch = async (passportMatch) => {
    setBusy(true); setStatus("Opening your scorecard…");
    try {
      await request("/api/player-passport/matches", {
        method: "POST",
        body: JSON.stringify({
          matchId: passportMatch.matchId,
          viewFinalScorecard: String(passportMatch.status || passportMatch.matchStatus || "").toLowerCase() === "final",
        }),
      });
      if (dashboardOnly) {
        window.location.assign("/score");
        return;
      }
      setName(passportPlayer?.name || "");
      setAuthorized(true);
      await loadMatch();
      setStatus("");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  const clearAccess = async () => {
    await fetch("/api/scoring/session", { method: "DELETE" });
    setAuthorized(false);
    setData(null);
    setCredential("");
    setSelectedMatch("");
    await loadMatchOptions();
    setStatus("Match access cleared.");
  };

  const selectHole = (number, source = data) => {
    setHoleNumber(number);
    const saved = source?.holeScores?.find((item) => Number(item["Hole Number"]) === number);
    setGross({
      team1: jsonScores(saved?.["Team 1 Gross Scores"]),
      team2: jsonScores(saved?.["Team 2 Gross Scores"]),
    });
  };

  const match = data?.match || {};
  const display = data?.display || {};
  const teeName = display.course?.tee || match.Tee || match["Tee Played"] || "";
  const teeTime = match["Tee Time"] || "";
  const teamNames = display.teamNames || {};
  const playerNames = display.playerNames || {};
  const isFinal = match["Match Status"] === "Final";
  const finalResult = isFinal
    ? finalizedMatchResult(match, data?.holeScores || [], teamNames)
    : "";
  const finalWinner = (() => {
    const winner = String(match["Matchup Winner"] || match["18-Hole Winner"] || "").trim();
    if (/^(halved|tie|tied)$/i.test(winner) || /^halved$/i.test(finalResult)) return "Match Halved";
    if (/^(team 1|1)$/i.test(winner)) return teamNames[1] || "Team 1";
    if (/^(team 2|2)$/i.test(winner)) return teamNames[2] || "Team 2";
    return [teamNames[1], teamNames[2]].find((name) => name && finalResult.toLowerCase().startsWith(String(name).toLowerCase())) || winner || "Final result recorded";
  })();
  const finalResultText = finalResultSummary(finalResult, teamNames);
  const format = String(match.Format || "").toUpperCase();
  const slots = format === "BB" ? 2 : 1;
  const savedHole = data?.holeScores?.find((item) => Number(item["Hole Number"]) === holeNumber);
  const courseHole = data?.courseHoles?.find((item) => Number(item["Hole Number"]) === holeNumber);
  const completed = useMemo(() => new Set((data?.holeScores || []).map((item) => Number(item["Hole Number"]))), [data]);
  const progress = scoringProgress(data?.holeScores || [], holeNumber);
  const currentMatchStatus = completed.size ? formatLiveMatchResult(data?.holeScores || [], teamNames) : "All Square";
  const tournamentIdentity = <TournamentIdentityHeader
    compact
    showStatus={false}
    year={match.Year || passportTournament?.year}
    name={passportTournament?.name || "Sandbagger Invitational"}
    location={`Round ${match.Round || "—"} • Match ${match.Match || "—"} • ${display.courseName || match["Course ID"] || "Course TBA"}`}
    logo={passportTournament?.logo}
  />;
  const scorecardHoles = useMemo(() => Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    const score = data?.holeScores?.find((item) => Number(item["Hole Number"]) === number);
    return { number, score };
  }), [data]);

  const strokesFor = (side, index) => {
    const total = format === "SC"
      ? match[`Team ${side} Stroke`]
      : match[`Team ${side} Player ${index + 1} Stroke`];
    return getStrokesOnHole(total, courseHole?.["Stroke Index"]);
  };

  const preview = useMemo(() => {
    const netFor = (side) => {
      const key = side === 1 ? "team1" : "team2";
      const values = Array.from({ length: slots }, (_, index) => Number(gross[key][index]));
      if (values.some((value) => !Number.isInteger(value) || value < 1)) return null;
      const nets = values.map((value, index) => value - strokesFor(side, index));
      return format === "BB" ? Math.min(...nets) : nets[0];
    };
    const team1 = netFor(1);
    const team2 = netFor(2);
    const winner = team1 === null || team2 === null
      ? ""
      : team1 === team2 ? "Halved" : team1 < team2 ? "Team 1" : "Team 2";
    return { team1, team2, winner };
  }, [courseHole, format, gross, match, slots]);

  const scoresComplete = preview.team1 !== null && preview.team2 !== null;

  const setScore = (side, index, value) => setGross((current) => {
    const next = [...current[side]];
    next[index] = value;
    return { ...current, [side]: next };
  });

  const keepScoreVisible = (event) => {
    const input = event.currentTarget;
    const scroll = () => input.scrollIntoView({ block: "center", behavior: "smooth" });
    requestAnimationFrame(scroll);
    window.setTimeout(scroll, 280);
  };

  const save = async () => {
    setBusy(true); setStatus(`Saving hole ${holeNumber}…`);
    try {
      const payload = await request("/api/scoring/current", {
        method: "POST",
        body: JSON.stringify({
          holeNumber,
          team1GrossScores: gross.team1,
          team2GrossScores: gross.team2,
          expectedRevision: Number(savedHole?.Revision || 0),
          expectedUpdatedAt: match["Updated At"] || "",
        }),
      });
      const nextScores = (data?.holeScores || [])
        .filter((item) => Number(item["Hole Number"]) !== holeNumber)
        .concat(payload.result?.hole || []);
      const savedStatus = formatLiveMatchResult(nextScores, teamNames);
      setLastSaved(`Hole ${holeNumber} saved · ${savedStatus}`);
      const nextData = {
        ...data,
        match: {
          ...data.match,
          "Match Status": "Live",
          "Current Hole": payload.result?.liveStatus?.currentHole,
          "Team 1 Holes Won": payload.result?.liveStatus?.team1HolesWon,
          "Team 2 Holes Won": payload.result?.liveStatus?.team2HolesWon,
          "Holes Remaining": payload.result?.liveStatus?.holesRemaining,
          "Match Status Text": payload.result?.liveStatus?.statusText,
          "Updated At": payload.result?.updatedAt,
          "Updated By": payload.result?.updatedBy,
        },
        holeScores: nextScores,
        canConfirm: Boolean(payload.result?.matchComplete),
      };
      setData(nextData);
      const scored = new Set(nextScores.map((item) => Number(item["Hole Number"])));
      const nextHole = Array.from({ length: 18 }, (_, index) => index + 1)
        .find((number) => !scored.has(number));
      if (nextHole) selectHole(nextHole, nextData);
      else {
        setShowReview(true);
        setConfirming(false);
      }
      setStatus(`Hole ${holeNumber} saved. ${savedStatus}.`);
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  const confirmScorecard = async () => {
    setBusy(true); setStatus("Submitting final scorecard…");
    try {
      await request("/api/scoring/current", {
        method: "POST",
        body: JSON.stringify({ action: "confirm" }),
      });
      await loadMatch();
      setShowReview(true);
      setStatus("Scorecard finalized.");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  const editHole = (number) => {
    setShowReview(false);
    setConfirming(false);
    selectHole(number);
    setStatus(`Editing hole ${number}.`);
  };

  if (restoring) return <section className={styles.login}>
    <div className={styles.brand}><span>SBI LIVE</span><h1>Preparing your tournament…</h1><p>Please wait while your Player Passport and match are refreshed.</p></div>
  </section>;

  if (!authorized && passportPlayer) return <MyMatchDashboard
      player={passportPlayer}
      tournament={passportTournament}
      matches={passportMatches}
      busy={busy}
      onOpen={openPassportMatch}
      message={status}
    />;

  if (!authorized && passportState === "unavailable") return <section className={styles.login}>
    <div className={styles.brand}><span>SBI LIVE</span><h1>My Match</h1><p>We couldn’t verify your Player Passport right now.</p></div>
    <button className={styles.primary} type="button" onClick={() => { setRestoring(true); setRestoreAttempt((value) => value + 1); }}>Retry</button>
  </section>;

  if (!authorized) return <section className={styles.login}>
    <div className={styles.brand}><span>SBI LIVE</span><h1>My Match</h1><p>Select your Player Passport to view your matches, or use a participant match code.</p></div>
    <Link className={styles.primary} href="/activate">Activate Player Passport</Link>
    <div className={styles.matchChoices} role="radiogroup" aria-label="Choose your match">
      {matchOptions.map((item) => <button type="button" role="radio" aria-checked={selectedMatch === item.selector} data-active={selectedMatch === item.selector} disabled={!item.accessAvailable} onClick={() => setSelectedMatch(item.selector)} key={item.selector || `${item.round}-${item.match}`}>
        <span>Round {item.round} · Match {item.match}{item.teeTime ? ` · ${item.teeTime}` : ""}</span>
        <strong>{item.teamOnePlayers.join(" + ") || item.teamOne} vs {item.teamTwoPlayers.join(" + ") || item.teamTwo}</strong>
        <small>{item.format || "Format TBA"} · {item.course || "Course TBA"}{!item.accessAvailable ? " · Access not active" : ""}</small>
      </button>)}
      {!matchOptions.length && <p className={styles.status}>No scoreable matches are available for the active round yet.</p>}
    </div>
    <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Match code<input type="password" inputMode="numeric" autoComplete="one-time-code" value={credential} onChange={(event) => setCredential(event.target.value)} /></label>
    <button className={styles.primary} disabled={busy || !selectedMatch || !name.trim() || !credential.trim()} onClick={login}>Open My Match</button>
    {status && <p className={styles.status}>{status}</p>}
  </section>;
  if (!data) return <section className={styles.login}><div className={styles.brand}><span>SBI LIVE</span><h1>Unable to open match</h1></div><button className={styles.primary} onClick={clearAccess}>Clear match access</button>{status && <p className={styles.status}>{status}</p>}</section>;

  if (showReview) return <section className={`${styles.shell} ${styles.reviewShell}`} data-scorecard-state={isFinal ? "final" : "review"}>
    {tournamentIdentity}
    <header className={styles.scorecardHeading}><div><span>{display.formatName || format}</span><h1>{isFinal ? "Official Tournament Scorecard" : "Review Scorecard"}</h1></div><b aria-label={`${completed.size} of 18 holes recorded`}>{completed.size}/18</b></header>
    {!isFinal ? <div className={styles.reviewStatus}>
      <div className={styles.reviewBadge}><StatusBadge status="Current Match" /></div>
      <span>REVIEW BEFORE SUBMITTING</span>
      <strong>{completed.size ? formatLiveMatchResult(data?.holeScores, teamNames) : lastSaved || "Check every hole before confirmation."}</strong>
      <small>Tap a recorded hole below to make a correction.</small>
    </div> : null}
    {isFinal ? <section className={styles.finalMatchSummary} aria-label="Final match summary">
      <div className={styles.finalSummaryLead}><span>OFFICIAL TOURNAMENT RECORD</span><StatusBadge status="Final" /><strong>{finalWinner}</strong>{finalResultText !== "Halved" ? <b>{finalResultText}</b> : null}<em>{completed.size} holes recorded • Read-only</em></div>
      <div className={styles.finalSummaryMeta}>
        <span><small>Round</small><strong>{match.Round || "—"}</strong></span>
        <span><small>Match Number</small><strong>{match.Match || "—"}</strong></span>
        <span className={styles.finalCourse}><small>Course</small><strong>{display.courseName || match["Course ID"] || "—"}</strong></span>
        <span><small>Tees</small><strong>{teeName || "—"}</strong></span>
        <span><small>Tee Time</small><strong>{teeTime || "—"}</strong></span>
      </div>
    </section> : <div className={styles.officialCourse}>
      <span><small>Course</small><strong>{display.courseName || match["Course ID"] || "Course recorded with match"}</strong></span>
      {teeName ? <span><small>Tees</small><strong>{teeName}</strong></span> : null}
      {teeTime ? <span><small>Tee Time</small><strong>{teeTime}</strong></span> : null}
    </div>}
    <div className={styles.officialRecord}>
      <div><strong>{teamNames[1] || "Team 1"}</strong><span>{playerIds(match, 1).map((id) => playerNames[id] || id).filter(Boolean).join(" • ") || "Players recorded with match"}</span></div>
      <b className={styles.versus} aria-hidden="true">VS</b>
      <div><strong>{teamNames[2] || "Team 2"}</strong><span>{playerIds(match, 2).map((id) => playerNames[id] || id).filter(Boolean).join(" • ") || "Players recorded with match"}</span></div>
    </div>
    {[scorecardHoles.slice(0, 9), scorecardHoles.slice(9)].map((nine, nineIndex) => <div className={styles.scorecard} role="table" aria-label={`${nineIndex ? "Back" : "Front"} nine scorecard`} key={nineIndex}>
      <div className={styles.scorecardRow} data-header="true" role="row"><strong role="columnheader">Player / Team</strong>{nine.map(({ number }) => <b role="columnheader" key={number}>{number}</b>)}</div>
      {[1, 2].flatMap((side) => {
        const ids = playerIds(match, side);
        return Array.from({ length: slots }, (_, index) => <div className={styles.scorecardRow} role="row" key={`${side}-${index}`}>
          <strong role="rowheader">{format === "SC" ? teamNames[side] || `Team ${side}` : playerNames[ids[index]] || ids[index]}</strong>
          {nine.map(({ number, score }) => {
            const metadata = data?.courseHoles?.find((item) => Number(item["Hole Number"]) === number);
            const total = format === "SC" ? match[`Team ${side} Stroke`] : match[`Team ${side} Player ${index + 1} Stroke`];
            const dots = strokeDots(getStrokesOnHole(total, metadata?.["Stroke Index"]));
            const player = format === "SC" ? teamNames[side] || `Team ${side}` : playerNames[ids[index]] || ids[index];
            return <ScorecardCell readOnly={isFinal} disabled={!score} onEdit={() => editHole(number)} label={`Hole ${number}, ${player}, gross ${grossAt(score, side, index) || "not recorded"}`} key={number}><i>{dots}</i>{grossAt(score, side, index) || "—"}</ScorecardCell>;
          })}
        </div>);
      })}
      {[1, 2].map((side) => <div className={styles.scorecardRow} data-team="true" role="row" key={`net-${side}`}>
        <strong role="rowheader">{teamNames[side] || `Team ${side}`}<small>NET {format === "BB" ? "BEST BALL" : format === "SC" ? "SCRAMBLE" : "SCORE"}</small></strong>
        {nine.map(({ number, score }) => <ScorecardCell readOnly={isFinal} disabled={!score} onEdit={() => editHole(number)} label={`Hole ${number}, ${teamNames[side] || `Team ${side}`} net ${score?.[`Team ${side} Net Score`] || "not recorded"}`} key={number}>{score?.[`Team ${side} Net Score`] || "—"}</ScorecardCell>)}
      </div>)}
      <div className={styles.scorecardRow} data-winner="true" role="row"><strong role="rowheader">Hole winner</strong>{nine.map(({ number, score }) => <ScorecardCell readOnly={isFinal} disabled={!score} onEdit={() => editHole(number)} label={`Hole ${number}, ${holeWinnerMark(score, teamNames) || "not recorded"}`} key={number}>{compactHoleWinnerMark(score, teamNames)}</ScorecardCell>)}</div>
      <div className={styles.scorecardRow} data-running="true" role="row"><strong role="rowheader">Match status</strong>{nine.map(({ number, score }) => {
        const running = runningMatchStatusAtHole(data?.holeScores, number, teamNames);
        const compact = running.replace(`${teamNames[1]} `, "").replace(`${teamNames[2]} `, "");
        return <ScorecardCell readOnly={isFinal} disabled={!score} onEdit={() => editHole(number)} label={`After hole ${number}, ${running || "not recorded"}`} key={number}>{score ? compact : "—"}</ScorecardCell>;
      })}</div>
    </div>)}
    {!isFinal && <p className={styles.editHint}>Tap any scored hole to edit it before final confirmation.</p>}
    {isFinal ? <>
      <p className={styles.finalConfirmation}>Scorecard confirmed • Only an administrator can reopen this official record.</p>
      <nav className={styles.finalActions} aria-label="Finalized scorecard actions">
        <Link className={styles.primary} href="/my-match">Return to My Match</Link>
        <Link className={styles.finalResultLink} href={`/game-center/${encodeURIComponent(match["Match ID"])}?from=my-match`}>View Game Center →</Link>
      </nav>
    </> : confirming ? <div className={styles.confirmPanel}>
      <strong>Submit this scorecard as final?</strong>
      <p>Golfers will no longer be able to edit it unless an administrator reopens the match.</p>
      <div><button disabled={busy} onClick={() => setConfirming(false)}>Keep reviewing</button><button className={styles.danger} disabled={busy} onClick={confirmScorecard}>Confirm final scorecard</button></div>
    </div> : <div className={styles.reviewActions}><button type="button" onClick={() => { setShowReview(false); selectHole(Math.max(1, ...completed)); }}>Continue Match</button><button className={styles.primary} disabled={busy || !data?.canConfirm} onClick={() => setConfirming(true)}>Submit Final</button></div>}
    {status && <p className={styles.status}>{status}</p>}
  </section>;

  return <section className={styles.shell}>
    {tournamentIdentity}
    <section className={styles.scoringContext} aria-label="Current match progress">
      <div><small>Current match status</small><strong>{currentMatchStatus}</strong></div>
      <span><b>{savedHole ? `Reviewing Hole ${progress.currentHole}` : `Hole ${progress.currentHole} of 18`}</b><small>{savedHole ? "Editing recorded scores" : `${progress.remaining} hole${progress.remaining === 1 ? "" : "s"} remaining`}</small></span>
      <i aria-hidden="true"><b style={{ width: `${progress.percent}%` }} /></i>
    </section>
    <nav className={styles.holeNavigator} aria-label="Choose hole">
      <button disabled={holeNumber === 1} onClick={() => selectHole(holeNumber - 1)} aria-label="Previous hole">‹</button>
      <div><span>Current Hole • {holeNumber} of 18</span><strong>Par {courseHole?.Par || "—"} • {courseHole?.Yardage || "—"} yards</strong><small>Hole handicap {courseHole?.["Stroke Index"] || "—"}</small></div>
      <button disabled={holeNumber === 18} onClick={() => selectHole(holeNumber + 1)} aria-label="Next hole">›</button>
    </nav>
    <div className={styles.holeCard}>
      <div className={styles.holeCardHead}><strong>Player / Team</strong><b>Gross</b></div>
      {[1, 2].flatMap((side) => {
        const ids = playerIds(match, side);
        const key = side === 1 ? "team1" : "team2";
        const playerRows = Array.from({ length: slots }, (_, index) => {
          const playerLabel = format === "SC" ? teamNames[side] || `Team ${side}` : playerNames[ids[index]] || ids[index] || `Player ${index + 1}`;
          const dots = strokeDots(strokesFor(side, index));
          return <label className={styles.holeCardPlayer} key={`${side}-${index}`}>
            <span><strong>{playerLabel}</strong>{dots ? <em aria-label={`${strokesFor(side, index)} stroke received`}>{dots}</em> : null}</span>
            <input aria-label={`${playerLabel} gross score`} disabled={isFinal} type="number" inputMode="numeric" enterKeyHint="next" min="1" max="20" value={gross[key][index] || ""} onFocus={keepScoreVisible} onChange={(event) => setScore(key, index, event.target.value)} />
          </label>;
        });
        return playerRows.concat(<div className={styles.holeCardTeam} key={`team-${side}`}>
          <span><strong>{teamNames[side] || `Team ${side}`}</strong><small>NET {format === "BB" ? "BEST BALL" : format === "SC" ? "SCRAMBLE" : "SCORE"}</small></span>
          <b>{preview[`team${side}`] ?? savedHole?.[`Team ${side} Net Score`] ?? "—"}</b>
        </div>);
      })}
      <div className={styles.holeCardWinner}><strong>Hole winner</strong><b>{preview.winner ? holeWinnerMark({ "Hole Winner": preview.winner }, teamNames) : holeWinnerMark(savedHole, teamNames) || "Pending"}</b></div>
    </div>
    {savedHole && <div className={styles.result}><span>Recorded hole</span><strong>{savedHole["Hole Winner"] === "Halved" ? "Halved" : holeWinnerMark(savedHole, teamNames)}</strong><small>Hole {holeNumber} result • Running status remains above</small></div>}
    {!savedHole && lastSaved && <div className={styles.savedResult}><strong>{lastSaved}</strong></div>}
    {isFinal && <div className={styles.result}><span>Match complete</span><strong>{finalResult || "Final"}</strong><small>An administrator can reopen the match for corrections.</small></div>}
    {isFinal ? <nav className={styles.finalActions} aria-label="Finalized scorecard actions">
      <Link className={styles.primary} href="/my-match">Return to My Match</Link>
    </nav> : <button className={styles.primary} disabled={busy || !scoresComplete} onClick={save}>{savedHole ? "Update Hole" : holeNumber === 18 ? "Save Hole & Review" : "Save & Continue"}</button>}
    {status && <p className={styles.status}>{status}</p>}
  </section>;
}
