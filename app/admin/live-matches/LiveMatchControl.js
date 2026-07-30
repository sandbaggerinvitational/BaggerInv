"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./live-match-control.module.css";
import pairingStyles from "./pairing-editor.module.css";
import accessStyles from "./participant-access.module.css";
import { getTournamentState } from "../../../lib/live-tournament";
import { finalizationReview, hasUnsavedMatchChanges } from "../../../lib/live-admin-ux";

const EDITABLE = ["Matchup Winner", "Front 9 Winner", "Back 9 Winner", "18-Hole Winner", "Team 1 Points", "Team 2 Points", "Match Status", "Notes"];
const PAIRING_FIELDS = ["Team 1 Player 1", "Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2"];
const WINNERS = ["", "Team 1", "Team 2", "Halved"];

function teamName(teamRows, year, side) {
  const row = teamRows.find((item) => Number(item.Year) === Number(year) && item["Team Side"] === `Team ${side}`);
  return row?.["Team Names"] || row?.["Team Name"] || `Team ${side}`;
}

function WinnerField({ label, field, value, onChange }) {
  return <label><span>{label}</span><select value={value || ""} onChange={(event) => onChange(field, event.target.value)}>{WINNERS.map((winner) => <option value={winner} key={winner || "pending"}>{winner || "Pending"}</option>)}</select></label>;
}

function PairingSide({ side, team, match, draft, players, rosters, singles, disabled, onChange }) {
  const rosterIds = new Set(
    rosters
      .filter((row) => String(row.year) === String(match.Year) && row.side === `Team ${side}`)
      .map((row) => row.playerId)
      .filter(Boolean)
  );
  const selectedIds = [draft[`Team ${side} Player 1`], draft[`Team ${side} Player 2`]].filter(Boolean);
  const options = players.filter((player) => !rosterIds.size || rosterIds.has(player.id) || selectedIds.includes(player.id));
  const slots = singles ? [1] : [1, 2];
  return <div className={pairingStyles.side}>
    <span>{team}</span>
    {slots.map((slot) => {
      const field = `Team ${side} Player ${slot}`;
      return <label key={field}>
        <small>Player {slot}</small>
        <select value={draft[field] || ""} disabled={disabled} onChange={(event) => onChange(field, event.target.value)}>
          <option value="">Select player</option>
          {options.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}
        </select>
      </label>;
    })}
  </div>;
}

function FinalizationDialog({ review, busy, onCancel, onConfirm }) {
  return <div className={styles.dialogBackdrop} role="presentation">
    <section className={styles.reviewDialog} role="dialog" aria-modal="true" aria-labelledby="finalization-title">
      <span>Official result review</span>
      <h2 id="finalization-title">Finalize {review.match}?</h2>
      <dl><div><dt>Pairing</dt><dd>{review.pairing}</dd></div>{review.segments.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div><dt>Final winner</dt><dd>{review.winner}</dd></div><div><dt>Team points</dt><dd>{review.points}</dd></div></dl>
      <p>This publishes the official result and tournament points. You can reopen the match later to make a documented correction.</p>
      <div><button type="button" onClick={onCancel} disabled={busy}>Keep editing</button><button type="button" className={styles.finalize} onClick={onConfirm} disabled={busy}>{busy ? "Finalizing…" : "Confirm final result"}</button></div>
    </section>
  </div>;
}

function MatchEditor({ match, players, rosters, teams, onAction, busy, onDirtyChange, access }) {
  const [draft, setDraft] = useState(() => Object.fromEntries([...EDITABLE, ...PAIRING_FIELDS].map((field) => [field, match[field] || ""])));
  const [feedback, setFeedback] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const sideOne = teamName(teams, match.Year, 1);
  const sideTwo = teamName(teams, match.Year, 2);
  const isSingles = String(match.Format).toUpperCase() === "SI";
  const isFinal = match["Match Status"] === "Final";
  const dirty = hasUnsavedMatchChanges(match, draft, [...EDITABLE, ...PAIRING_FIELDS]);
  const playerNames = Object.fromEntries(players.map((player) => [player.id, player.name]));
  const review = finalizationReview({ match, draft, teamOne: sideOne, teamTwo: sideTwo, playerNames });
  const change = (field, value) => { setFeedback(""); setDraft((current) => ({ ...current, [field]: value })); };
  useEffect(() => {
    setDraft(Object.fromEntries([...EDITABLE, ...PAIRING_FIELDS].map((field) => [field, match[field] || ""])));
  }, [match["Updated At"], match["Match Status"]]);
  useEffect(() => { onDirtyChange(match["Match ID"], dirty); return () => onDirtyChange(match["Match ID"], false); }, [dirty, match, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const run = async (action, updates = draft) => {
    setFeedback("");
    try {
      const result = await onAction(action, match, updates);
      if (result === null) return;
      setFeedback(action === "reopen" ? "Match reopened. Corrections are now enabled." : action === "finalize" ? "Official result finalized successfully." : "Changes saved successfully.");
      setReviewOpen(false);
    } catch (error) { setFeedback(error.message); }
  };

  return <article className={styles.matchCard} data-status={match["Match Status"] || "Scheduled"} data-live-match-dirty={dirty ? "true" : undefined}>
    <header>
      <div><span>Match {match.Match}</span><h2>{match["Match ID"]}</h2><p>Round {match.Round} · {match.Format} · {match["Course ID"] || "Course TBA"}{match["Tee Time"] ? ` · ${match["Tee Time"]}` : ""}</p></div>
      <strong>{match["Match Status"] || "Scheduled"}</strong>
    </header>
    <div className={styles.pairing}>
      <PairingSide side={1} team={sideOne} match={match} draft={draft} players={players} rosters={rosters} singles={isSingles} disabled={isFinal || busy} onChange={change} />
      <em>VS</em>
      <PairingSide side={2} team={sideTwo} match={match} draft={draft} players={players} rosters={rosters} singles={isSingles} disabled={isFinal || busy} onChange={change} />
    </div>
    {!isFinal ? <div className={pairingStyles.action}><button type="button" disabled={busy} onClick={() => run("pairing", Object.fromEntries(PAIRING_FIELDS.map((field) => [field, draft[field] || ""])))}>Save Pairing</button></div> : <p className={pairingStyles.locked}>This official result is locked. Reopen it to make a documented correction.</p>}
    <div className={styles.fields}>
      {!isSingles ? <>
        <WinnerField label="Front 9 Winner" field="Front 9 Winner" value={draft["Front 9 Winner"]} onChange={change} />
        <WinnerField label="Back 9 Winner" field="Back 9 Winner" value={draft["Back 9 Winner"]} onChange={change} />
      </> : null}
      <WinnerField label="18-Hole Winner" field="18-Hole Winner" value={draft["18-Hole Winner"]} onChange={change} />
      <WinnerField label="Matchup Winner" field="Matchup Winner" value={draft["Matchup Winner"]} onChange={change} />
      <label><span>{sideOne} Points</span><input type="number" min="0" max="3" step="0.25" value={draft["Team 1 Points"]} onChange={(event) => change("Team 1 Points", event.target.value)} /></label>
      <label><span>{sideTwo} Points</span><input type="number" min="0" max="3" step="0.25" value={draft["Team 2 Points"]} onChange={(event) => change("Team 2 Points", event.target.value)} /></label>
      <label><span>Match Status</span><select value={draft["Match Status"] || "Scheduled"} disabled={isFinal} onChange={(event) => change("Match Status", event.target.value)}><option>Scheduled</option><option>Live</option><option>Reopened</option>{isFinal ? <option>Final</option> : null}</select></label>
      <label className={styles.notes}><span>Notes</span><textarea rows="3" value={draft.Notes} onChange={(event) => change("Notes", event.target.value)} /></label>
    </div>
    <div className={styles.actions}>
      {!isFinal ? <>
        <button type="button" disabled={busy || !dirty} onClick={() => run("update")}>{busy ? "Saving…" : "Save Changes"}</button>
        <button className={styles.finalize} type="button" disabled={busy} onClick={() => setReviewOpen(true)}>Review &amp; Finalize</button>
      </> : <button className={styles.reopen} type="button" disabled={busy} onClick={() => run("reopen")}>{busy ? "Reopening…" : "Reopen for correction"}</button>}
    </div>
    <div className={styles.saveState} data-dirty={dirty ? "true" : undefined} role="status" aria-live="polite">{feedback || (dirty ? "Unsaved changes" : "All changes saved")}</div>
    {match["Updated At"] ? <small>Last updated {match["Updated At"]}{match["Updated By"] ? ` by ${match["Updated By"]}` : ""}</small> : null}
    <section className={accessStyles.panel}>
      <div className={accessStyles.summary}><span>Participant scorekeeping</span><strong>{String(match["Access Active"]).toUpperCase() === "TRUE" ? "Access active" : "Access inactive"}</strong><small>{match["Access Expires At"] ? `Expires ${new Date(match["Access Expires At"]).toLocaleString()}` : "Generate credentials before sharing access."}</small></div>
      <div className={accessStyles.actions}>
        <button type="button" disabled={busy} onClick={() => {
          if (match["Access Version"] && !window.confirm("Regenerating credentials immediately invalidates the previous code, QR link, and participant sessions. Continue?")) return;
          run("access-generate", {});
        }}>{match["Access Version"] ? "Regenerate access" : "Generate access"}</button>
        {String(match["Access Active"]).toUpperCase() === "TRUE" ? <button type="button" disabled={busy} onClick={() => run("access-disable", {})}>Disable access</button> : null}
      </div>
      {access ? <div className={accessStyles.reveal}>
        <p>Shown once. Save these before leaving this page.</p>
        <strong>Participant code: {access.code}</strong>
        <div><button type="button" onClick={() => navigator.clipboard.writeText(access.code)}>Copy code</button><button type="button" onClick={() => navigator.clipboard.writeText(access.accessUrl)}>Copy secure link</button><a href={access.qrDataUrl} download={`${match["Match ID"]}-participant-qr.png`}>Download QR</a></div>
        <img src={access.qrDataUrl} alt={`QR code for Match ${match.Match} participant scoring`} />
      </div> : match["Access Version"] ? <p className={accessStyles.note}>For security, the code and QR token are not stored in readable form. Regenerate access to receive new shareable credentials.</p> : null}
    </section>
    {reviewOpen ? <FinalizationDialog review={review} busy={busy} onCancel={() => setReviewOpen(false)} onConfirm={() => run("finalize")} /> : null}
  </article>;
}

export default function LiveMatchControl({ embedded = false, sharedSecret = "", sharedUpdatedBy = "", selectedYear = "" }) {
  const [secret, setSecret] = useState(sharedSecret);
  const [updatedBy, setUpdatedBy] = useState("");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyMatchId, setBusyMatchId] = useState("");
  const [accessByMatch, setAccessByMatch] = useState({});
  const [dirtyMatches, setDirtyMatches] = useState(() => new Set());
  const [year, setYear] = useState("");
  const [round, setRound] = useState("");
  const updateDirty = useCallback((matchId, dirty) => setDirtyMatches((current) => {
    const next = new Set(current);
    if (dirty) next.add(matchId); else next.delete(matchId);
    return next;
  }), []);
  const confirmSwitch = () => !dirtyMatches.size || window.confirm("You have unsaved match changes. Leave them behind?");

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
    if (!updatedBy.trim()) throw new Error("Enter your name before updating a match.");
    if (action === "reopen" && !window.confirm(`Reopen ${match["Match ID"]} for a documented correction?`)) return null;
    setBusyMatchId(match["Match ID"]);
    try {
      const payload = await request({ action, matchId: match["Match ID"], updates, updatedBy });
      if (payload.access) {
        setAccessByMatch((current) => ({ ...current, [match["Match ID"]]: payload.access }));
      } else if (action === "access-disable") {
        setAccessByMatch((current) => {
          const next = { ...current };
          delete next[match["Match ID"]];
          return next;
        });
      }
      setData((current) => ({ ...current, matches: current.matches.map((row) => row["Match ID"] === payload.match["Match ID"] ? payload.match : row) }));
      return payload;
    } finally { setBusyMatchId(""); }
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
        {!embedded ? <label>Tournament<select value={year} onChange={(event) => { if (confirmSwitch()) { setYear(event.target.value); setRound(""); } }}>{years.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
        <label>Round<select value={round} onChange={(event) => { if (confirmSwitch()) setRound(event.target.value); }}><option value="">All rounds</option>{rounds.map((item) => <option key={item} value={item}>Round {item}</option>)}</select></label>
        <label>Updated By<input value={updatedBy} onChange={(event) => setUpdatedBy(event.target.value)} /></label>
        <strong>{matches.length} matches</strong>
      </div>
      {status ? <div className={styles.status}>{status}</div> : null}
      <div className={styles.clinchSummary}>
        <div><span>{teamName(data.teams, year, 1)}</span><strong>{tournamentState.teamOne.score}</strong><small>{tournamentState.teamOne.pointsToClinch > 0 ? `Need ${tournamentState.teamOne.pointsToClinch.toFixed(1)} to clinch` : "At clinching target"}</small></div>
        <p>{tournamentState.remainingMatches} matches · {tournamentState.remainingPoints} points remaining</p>
        <div><span>{teamName(data.teams, year, 2)}</span><strong>{tournamentState.teamTwo.score}</strong><small>{tournamentState.teamTwo.pointsToClinch > 0 ? `Need ${tournamentState.teamTwo.pointsToClinch.toFixed(1)} to clinch` : "At clinching target"}</small></div>
      </div>
      {busy ? <div className={styles.loadingState} role="status">Loading live matches…</div> : matches.length ? <div className={styles.grid}>{matches.map((match) => <MatchEditor key={match["Match ID"]} match={match} players={data.players || []} rosters={data.rosters || []} teams={data.teams} onAction={act} onDirtyChange={updateDirty} busy={busyMatchId === match["Match ID"]} access={accessByMatch[match["Match ID"]] || null} />)}</div> : <div className={styles.empty}>No matches are configured for this selection.</div>}
    </>}
  </section>;
}
