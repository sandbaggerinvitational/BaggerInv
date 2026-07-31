"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { finalizedMatchResult, formatLiveMatchResult } from "../../lib/match-result.js";
import { getStrokesOnHole } from "../../lib/scorecard-net.js";
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

function ParticipantLinks({ player }) {
  return <nav className={styles.liveLinks} aria-label="Player Passport navigation">
    <Link href="/home">My Tournament</Link>
    <Link href="/live">Tournament Coverage</Link>
    <Link href="/live?view=points">Live Leaderboard</Link>
    <Link href={player?.slug ? `/players/${player.slug}` : "/players"}>My Profile</Link>
  </nav>;
}

export default function ScoreEntry({ dashboardOnly = false }) {
  const [name, setName] = useState("");
  const [credential, setCredential] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState("");
  const [matchId, setMatchId] = useState("");
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
    setMatchId(payload.data.match["Match ID"]);
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
          fetch("/api/player-passport/session", { cache: "no-store" }),
        ]);
        if (passport.ok) {
          const identity = await passport.json();
          if (!current) return;
          setPassportPlayer(identity.player);
          setPassportState("active");
          const matches = await fetch("/api/player-passport/matches", { cache: "no-store" });
          const payload = await matches.json();
          if (matches.ok) {
            if (!current) return;
            setPassportMatches(payload.data?.matches || []);
            setPassportTournament(payload.data?.tournament || null);
          } else if (matches.status !== 401) {
            setPassportState("unavailable");
            setStatus(payload.error || "We couldn’t verify your Player Passport right now.");
          }
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
        body: JSON.stringify({ matchId: passportMatch.matchId }),
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
  const teamNames = display.teamNames || {};
  const playerNames = display.playerNames || {};
  const isFinal = match["Match Status"] === "Final";
  const finalResult = isFinal
    ? finalizedMatchResult(match, data?.holeScores || [], teamNames)
    : "";
  const format = String(match.Format || "").toUpperCase();
  const slots = format === "BB" ? 2 : 1;
  const savedHole = data?.holeScores?.find((item) => Number(item["Hole Number"]) === holeNumber);
  const courseHole = data?.courseHoles?.find((item) => Number(item["Hole Number"]) === holeNumber);
  const completed = useMemo(() => new Set((data?.holeScores || []).map((item) => Number(item["Hole Number"]))), [data]);
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

  const leaderboardLinks = <nav className={styles.liveLinks} aria-label="Live tournament links">
    <Link href={`/game-center/${encodeURIComponent(matchId)}?from=my-match`}>Game Center</Link>
    <Link href={`/live?view=scores&round=${match.Round}`}>Gross &amp; net</Link>
    <Link href={`/live?view=points&round=${match.Round}`}>Player points</Link>
  </nav>;

  if (restoring) return <section className={styles.login}>
    <div className={styles.brand}><span>SBI LIVE</span><h1>Opening scoring…</h1><p>Restoring your authorized match.</p></div>
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

  if (showReview) return <section className={`${styles.shell} ${styles.reviewShell}`}>
    <header><div><span>{display.formatName || format} · Round {match.Round}</span><h1>{display.matchName || `Match ${match.Match}`}</h1><p>{display.courseName || match["Course ID"]} · Scorecard review</p></div><b>{completed.size}/18</b></header>
    <div className={styles.reviewStatus}>
      <span>{isFinal ? "FINAL SCORECARD" : "REVIEW BEFORE SUBMITTING"}</span>
      <strong>{isFinal ? finalResult || "Final" : completed.size ? formatLiveMatchResult(data?.holeScores, teamNames) : lastSaved || "Check every hole before confirmation."}</strong>
    </div>
    {[scorecardHoles.slice(0, 9), scorecardHoles.slice(9)].map((nine, nineIndex) => <div className={styles.scorecard} key={nineIndex}>
      <div className={styles.scorecardRow} data-header="true"><strong>Player / Team</strong>{nine.map(({ number }) => <b key={number}>{number}</b>)}</div>
      {[1, 2].flatMap((side) => {
        const ids = playerIds(match, side);
        return Array.from({ length: slots }, (_, index) => <div className={styles.scorecardRow} key={`${side}-${index}`}>
          <strong>{format === "SC" ? `${teamNames[side] || `Team ${side}`} gross` : playerNames[ids[index]] || ids[index]}</strong>
          {nine.map(({ number, score }) => {
            const metadata = data?.courseHoles?.find((item) => Number(item["Hole Number"]) === number);
            const total = format === "SC" ? match[`Team ${side} Stroke`] : match[`Team ${side} Player ${index + 1} Stroke`];
            const dots = strokeDots(getStrokesOnHole(total, metadata?.["Stroke Index"]));
            return <button type="button" disabled={isFinal || !score} onClick={() => editHole(number)} key={number}><i>{dots}</i>{grossAt(score, side, index) || "—"}</button>;
          })}
        </div>);
      })}
      {[1, 2].map((side) => <div className={styles.scorecardRow} data-team="true" key={`net-${side}`}>
        <strong>{teamNames[side] || `Team ${side}`}<small>NET {format === "BB" ? "BEST BALL" : format === "SC" ? "SCRAMBLE" : "SCORE"}</small></strong>
        {nine.map(({ number, score }) => <button type="button" disabled={isFinal || !score} onClick={() => editHole(number)} key={number}>{score?.[`Team ${side} Net Score`] || "—"}</button>)}
      </div>)}
      <div className={styles.scorecardRow} data-winner="true"><strong>Hole winner</strong>{nine.map(({ number, score }) => <button type="button" disabled={isFinal || !score} onClick={() => editHole(number)} key={number}>{holeWinnerMark(score, teamNames)}</button>)}</div>
    </div>)}
    {!isFinal && <p className={styles.editHint}>Tap any scored hole to edit it before final confirmation.</p>}
    {leaderboardLinks}
    {passportPlayer ? <ParticipantLinks player={passportPlayer} /> : null}
    {isFinal ? <>
      <div className={styles.result}><span>Match finalized</span><strong>{finalResult || "Final"}</strong><small>Only an administrator can reopen this scorecard.</small></div>
      <nav className={styles.finalActions} aria-label="Finalized scorecard actions">
        <Link className={styles.primary} href="/my-match">Return to My Match</Link>
        <Link className={styles.finalResultLink} href={`/game-center/${encodeURIComponent(matchId)}?from=my-match`}>View Match Result</Link>
      </nav>
    </> : confirming ? <div className={styles.confirmPanel}>
      <strong>Submit this scorecard as final?</strong>
      <p>Golfers will no longer be able to edit it unless an administrator reopens the match.</p>
      <div><button disabled={busy} onClick={() => setConfirming(false)}>Keep reviewing</button><button className={styles.danger} disabled={busy} onClick={confirmScorecard}>Confirm final scorecard</button></div>
    </div> : <button className={styles.primary} disabled={busy || !data?.canConfirm} onClick={() => setConfirming(true)}>Submit final scorecard</button>}
    {status && <p className={styles.status}>{status}</p>}
  </section>;

  return <section className={styles.shell}>
    <button type="button" className={styles.clearAccess} onClick={clearAccess}>Leave My Match</button>
    {passportPlayer ? <ParticipantLinks player={passportPlayer} /> : null}
    <header><div><span>{display.formatName || format} · Round {match.Round}</span><h1>{display.matchName || `Match ${match.Match}`}</h1><p>{display.courseName || match["Course ID"]}</p></div><b>{completed.size}/18</b></header>
    <nav className={styles.holeNavigator} aria-label="Choose hole">
      <button disabled={holeNumber === 1} onClick={() => selectHole(holeNumber - 1)} aria-label="Previous hole">‹</button>
      <div><span>Hole {holeNumber}</span><strong>Par {courseHole?.Par || "—"} · {courseHole?.Yardage || "—"} yards</strong><small>Stroke index {courseHole?.["Stroke Index"] || "—"}</small></div>
      <button disabled={holeNumber === 18} onClick={() => selectHole(holeNumber + 1)} aria-label="Next hole">›</button>
    </nav>
    <div className={styles.holeCard}>
      <div className={styles.holeCardHead}><strong>Player / Team</strong><b>Gross</b></div>
      {[1, 2].flatMap((side) => {
        const ids = playerIds(match, side);
        const key = side === 1 ? "team1" : "team2";
        const playerRows = Array.from({ length: slots }, (_, index) => {
          const playerLabel = format === "SC" ? `${teamNames[side] || `Team ${side}`} scramble` : playerNames[ids[index]] || ids[index] || `Player ${index + 1}`;
          const dots = strokeDots(strokesFor(side, index));
          return <label className={styles.holeCardPlayer} key={`${side}-${index}`}>
            <span><strong>{playerLabel}</strong>{dots ? <em aria-label={`${strokesFor(side, index)} stroke received`}>{dots}</em> : null}</span>
            <input aria-label={`${playerLabel} gross score`} disabled={isFinal} type="number" inputMode="numeric" min="1" max="20" value={gross[key][index] || ""} onChange={(event) => setScore(key, index, event.target.value)} />
          </label>;
        });
        return playerRows.concat(<div className={styles.holeCardTeam} key={`team-${side}`}>
          <span><strong>{teamNames[side] || `Team ${side}`}</strong><small>NET {format === "BB" ? "BEST BALL" : format === "SC" ? "SCRAMBLE" : "SCORE"}</small></span>
          <b>{preview[`team${side}`] ?? savedHole?.[`Team ${side} Net Score`] ?? "—"}</b>
        </div>);
      })}
      <div className={styles.holeCardWinner}><strong>Hole winner</strong><b>{preview.winner ? holeWinnerMark({ "Hole Winner": preview.winner }, teamNames) : holeWinnerMark(savedHole, teamNames) || "Pending"}</b></div>
    </div>
    {savedHole && <div className={styles.result}><span>Match status</span><strong>{formatLiveMatchResult(data?.holeScores, teamNames)}</strong><small>Hole {holeNumber}: {holeWinnerMark(savedHole, teamNames)}</small></div>}
    {!savedHole && lastSaved && <div className={styles.savedResult}><strong>{lastSaved}</strong></div>}
    {isFinal && <div className={styles.result}><span>Match complete</span><strong>{finalResult || "Final"}</strong><small>An administrator can reopen the match for corrections.</small></div>}
    {isFinal ? <nav className={styles.finalActions} aria-label="Finalized scorecard actions">
      <Link className={styles.primary} href="/my-match">Return to My Match</Link>
      <Link className={styles.finalResultLink} href={`/game-center/${encodeURIComponent(matchId)}?from=my-match`}>View Match Result</Link>
    </nav> : <button className={styles.primary} disabled={busy || !scoresComplete} onClick={save}>{savedHole ? "Update hole" : "Save hole"}</button>}
    {status && <p className={styles.status}>{status}</p>}
    {leaderboardLinks}
  </section>;
}
