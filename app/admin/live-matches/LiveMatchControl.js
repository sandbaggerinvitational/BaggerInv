"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./live-match-control.module.css";
import { getTournamentState } from "../../../lib/live-tournament";

const EDITABLE = ["Matchup Winner", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner", "Team 1 Points", "Team 2 Points", "Match Status", "Notes"];
const WINNERS = ["", "Team 1", "Team 2", "Halved"];

function playerNames(match, side, playerMap) {
  return [match[`Team ${side} Player 1`], match[`Team ${side} Player 2`]]
    .filter(Boolean)
    .map((id) => playerMap[id] || id)
    .join(" + ");
}

function teamName(teamRows, year, side) {
  const row = teamRows.find((item) => Number(item.Year) === Number(year) && item["Team Side"] === `Team ${side}`);
  return row?.["Team Names"] || row?.["Team Name"] || `Team ${side}`;
}

function WinnerField({ label, field, value, onChange }) {
  return <label><span>{label}</span><select value={value || ""} onChange={(event) => onChange(field, event.target.value)}>{WINNERS.map((winner) => <option value={winner} key={winner || "pending"}>{winner || "Pending"}</option>)}</select></label>;
}

function MatchEditor({ match, playerMap, teams, onAction, busy }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(EDITABLE.map((field) => [field, match[field] || ""])));
  const sideOne = teamName(teams, match.Year, 1);
  const sideTwo = teamName(teams, match.Year, 2);
  const isSingles = String(match.Format).toUpperCase() === "SI";
  const isFinal = match["Match Status"] === "Final";
  const change = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  return <article className={styles.matchCard} data-status={match["Match Status"] || "Scheduled"}>
    <header>
      <div><span>Match {match.Match}</span><h2>{match["Match ID"]}</h2><p>Round {match.Round} · {match.Format} · {match["Course ID"] || "Course TBA"}{match["Tee Time"] ? ` · ${match["Tee Time"]}` : ""}</p></div>
      <strong>{match["Match Status"] || "Scheduled"}</strong>
    </header>
    <div className={styles.pairing}>
      <div><span>{sideOne}</span><b>{playerNames(match, 1, playerMap)}</b></div>
      <em>VS</em>
      <div><span>{sideTwo}</span><b>{playerNames(match, 2, playerMap)}</b></div>
    </div>
    <div className={styles.fields}>
      {!isSingles ? <>
        <WinnerField label="Front 9 Winner" field="Front 9 Winner" value={draft["Front 9 Winner"]} onChange={change} />
        <WinnerField label="Back 9 Winner" field="Back 9 Winner" value={draft["Back 9 Winner"]} onChange={change} />
      </> : null}
      <WinnerField label="18-Hole Winner" field="18-Hole Winner" value={draft["18-Hole Winner"]} onChange={change} />
      <WinnerField label="Matchup Winner" field="Matchup Winner" value={draft["Matchup Winner"]} onChange={change} />
      <label><span>{sideOne} Points</span><input type="number" min="0" max="3" step="0.25" value={draft["Team 1 Points"]} onChange={(event) => change("Team 1 Points", event.target.value)} /></label>
      <label><span>{sideTwo} Points</span><input type="number" min="0" max="3" step="0.25" value={draft["Team 2 Points"]} onChange={(event) => change("Team 2 Points", event.target.value)} /></label>
      <label><span>Match Status</span><select value={draft["Match Status"] || "Scheduled"} disabled={isFinal} onChange={(event) => change("Match Status", event.target.value)}><option>Scheduled</option><option>Live</option><option>Reopened</option></select></label>
      <label className={styles.notes}><span>Notes</span><textarea rows="3" value={draft.Notes} onChange={(event) => change("Notes", event.target.value)} /></label>
    </div>
    <div className={styles.actions}>
      {!isFinal ? <>
        <button type="button" disabled={busy} onClick={() => onAction("update", match, draft)}>Save Changes</button>
        <button className={styles.finalize} type="button" disabled={busy} onClick={() => onAction("finalize", match, draft)}>Finalize Match</button>
      </> : <button className={styles.reopen} type="button" disabled={busy} onClick={() => onAction("reopen", match, draft)}>Reopen Match</button>}
    </div>
    {match["Updated At"] ? <small>Last updated {match["Updated At"]}{match["Updated By"] ? ` by ${match["Updated By"]}` : ""}</small> : null}
  </article>;
}

export default function LiveMatchControl({ embedded = false, sharedSecret = "", sharedUpdatedBy = "", selectedYear = "" }) {
  const [secret, setSecret] = useState(sharedSecret);
  const [updatedBy, setUpdatedBy] = useState("");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [year, setYear] = useState("");
  const [round, setRound] = useState("");

  useEffect(() => { if (sharedSecret) setSecret(sharedSecret); }, [sharedSecret]);
  useEffect(() => { if (sharedUpdatedBy) setUpdatedBy(sharedUpdatedBy); }, [sharedUpdatedBy]);
  useEffect(() => { if (selectedYear) { setYear(String(selectedYear)); setRound(""); } }, [selectedYear]);
  useEffect(() => { if (embedded && sharedSecret && !data) load(); }, [embedded, sharedSecret]);

  const request = async (body) => {
    const response = await fetch("/api/live-matches", { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-live-admin-secret": secret }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Live Match Control request failed.");
    return payload;
  };

  const load = async () => {
    setBusy(true); setStatus("Loading matches…");
    try {
      const payload = await request();
      setData(payload.data);
      const years = [...new Set(payload.data.matches.map((match) => String(match.Year)).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
      setYear(String(selectedYear || years[0] || "")); setRound(""); setStatus("");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  const years = useMemo(() => [...new Set((data?.matches || []).map((match) => String(match.Year)).filter(Boolean))].sort((a, b) => Number(b) - Number(a)), [data]);
  const rounds = useMemo(() => [...new Set((data?.matches || []).filter((match) => !year || String(match.Year) === year).map((match) => String(match.Round)).filter(Boolean))].sort((a, b) => Number(a) - Number(b)), [data, year]);
  const matches = useMemo(() => (data?.matches || []).filter((match) => (!year || String(match.Year) === year) && (!round || String(match.Round) === round)).sort((a, b) => Number(a.Match) - Number(b.Match)), [data, year, round]);
  const playerMap = useMemo(() => Object.fromEntries((data?.players || []).map((player) => [player.id, player.name])), [data]);
  const tournamentState = useMemo(() => {
    const yearMatches = (data?.matches || []).filter((match) => !year || String(match.Year) === year);
    const finalized = yearMatches.filter((match) => match["Match Status"] === "Final");
    const teamOne = finalized.reduce((sum, match) => sum + (Number(match["Team 1 Points"]) || 0), 0);
    const teamTwo = finalized.reduce((sum, match) => sum + (Number(match["Team 2 Points"]) || 0), 0);
    const grouped = [...new Set(yearMatches.map((match) => Number(match.Round)).filter(Number.isFinite))]
      .map((number) => ({ number, matches: yearMatches.filter((match) => Number(match.Round) === number) }));
    return getTournamentState({ tournament: { teamOne: { score: teamOne }, teamTwo: { score: teamTwo } }, rounds: grouped });
  }, [data, year]);

  const act = async (action, match, updates) => {
    if (!updatedBy.trim()) { setStatus("Enter your name before updating a match."); return; }
    const verb = action === "finalize" ? "finalize" : action === "reopen" ? "reopen" : "save changes to";
    if (action !== "update" && !window.confirm(`Are you sure you want to ${verb} ${match["Match ID"]}?`)) return;
    setBusy(true); setStatus(`${action === "update" ? "Saving" : action === "finalize" ? "Finalizing" : "Reopening"} ${match["Match ID"]}…`);
    try {
      const payload = await request({ action, matchId: match["Match ID"], updates, updatedBy });
      setData((current) => ({ ...current, matches: current.matches.map((row) => row["Match ID"] === payload.match["Match ID"] ? payload.match : row) }));
      setStatus(`${match["Match ID"]} ${action === "update" ? "updated" : action === "finalize" ? "finalized" : "reopened"} successfully.`);
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  return <section className={`${styles.shell} ${embedded ? "liveControlEmbedded" : ""}`}>
    {!embedded ? <header className={styles.hero}><p>SBI Administration</p><h1>Live Match Control</h1><span>Update official results, finalize matches into tournament history, and reopen corrections safely.</span></header> : null}
    {!data ? <div className={styles.login}>
      <label>Admin password<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></label>
      <label>Your name<input value={updatedBy} onChange={(event) => setUpdatedBy(event.target.value)} placeholder="Recorded in the update log" /></label>
      <button type="button" disabled={!secret || busy} onClick={load}>Open Live Match Control</button>
      {status ? <p>{status}</p> : null}
    </div> : <>
      <div className={styles.toolbar}>
        {!embedded ? <label>Tournament<select value={year} onChange={(event) => { setYear(event.target.value); setRound(""); }}>{years.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
        <label>Round<select value={round} onChange={(event) => setRound(event.target.value)}><option value="">All rounds</option>{rounds.map((item) => <option key={item} value={item}>Round {item}</option>)}</select></label>
        <label>Updated By<input value={updatedBy} onChange={(event) => setUpdatedBy(event.target.value)} /></label>
        <strong>{matches.length} matches</strong>
      </div>
      {status ? <div className={styles.status}>{status}</div> : null}
      <div className={styles.clinchSummary}>
        <div><span>{teamName(data.teams, year, 1)}</span><strong>{tournamentState.teamOne.score}</strong><small>{tournamentState.teamOne.pointsToClinch > 0 ? `Need ${tournamentState.teamOne.pointsToClinch.toFixed(1)} to clinch` : "At clinching target"}</small></div>
        <p>{tournamentState.remainingMatches} matches · {tournamentState.remainingPoints} points remaining</p>
        <div><span>{teamName(data.teams, year, 2)}</span><strong>{tournamentState.teamTwo.score}</strong><small>{tournamentState.teamTwo.pointsToClinch > 0 ? `Need ${tournamentState.teamTwo.pointsToClinch.toFixed(1)} to clinch` : "At clinching target"}</small></div>
      </div>
      <div className={styles.grid}>{matches.map((match) => <MatchEditor key={`${match["Match ID"]}-${match["Updated At"]}-${match["Match Status"]}`} match={match} playerMap={playerMap} teams={data.teams} onAction={act} busy={busy} />)}</div>
    </>}
  </section>;
}
