"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import StatusBadge from "../../StatusBadge.js";
import styles from "./director.module.css";

const HEALTH = [
  ["live", "Live Matches"], ["upcoming", "Upcoming Matches"], ["final", "Final Matches"],
  ["awaitingConfirmation", "Awaiting Confirmation"], ["reopened", "Reopened Matches"], ["errors", "Errors"],
];

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function DirectorDashboard({ directorName }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRound, setSelectedRound] = useState("");
  const [reopenId, setReopenId] = useState("");
  const load = useCallback(async () => {
    setMessage("");
    const response = await fetch("/api/director", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Director dashboard is unavailable.");
    setData(payload.data);
    setSelectedRound((current) => current || String(payload.data.tournament.currentRound || payload.data.rounds.find((round) => round.status !== "FINAL")?.number || payload.data.rounds[0]?.number || ""));
  }, []);
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [load]);
  useEffect(() => {
    if (!data?.automation?.enabled) return undefined;
    const check = () => fetch("/api/director", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "automation-check" }) }).then((response) => response.ok ? response.json() : null).then((result) => { if (result?.changed) load(); }).catch(() => {});
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [data?.automation?.enabled, load]);
  const round = useMemo(() => data?.rounds.find((item) => String(item.number) === selectedRound), [data, selectedRound]);
  const act = async (action, extra = {}) => {
    setBusy(action); setMessage("");
    try {
      const response = await fetch("/api/director", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, round: Number(selectedRound), ...extra }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Director action failed.");
      await load(); setMessage("Tournament operation completed.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  if (!data) return <section className={styles.shell}><div className={styles.loading} role="status">{message || "Opening Tournament Director…"}</div></section>;
  const finalMatches = data.rounds.find((item) => String(item.number) === selectedRound)?.final || 0;
  return <section className={styles.shell}>
    <header className={styles.hero}><span>Director Mode</span><h1>Tournament Director</h1><p>{directorName} · {data.tournament.year} {data.tournament.name}</p><StatusBadge status={data.tournament.status} /></header>

    <section className={styles.command} aria-labelledby="command-title">
      <div><span>Mission Control</span><h2 id="command-title">Round {data.tournament.currentRound || "—"}</h2><p>{data.tournament.location || "Tournament operations"}</p></div>
      <label>Operating round<select value={selectedRound} onChange={(event) => setSelectedRound(event.target.value)}>{data.rounds.map((item) => <option value={item.number} key={item.number}>{item.name}</option>)}</select></label>
    </section>

    <section className={styles.rounds} aria-labelledby="round-status-title"><header><span>Competition</span><h2 id="round-status-title">Round Status</h2></header>{data.rounds.map((item) => <article key={item.number} data-state={item.status}>
      <div><strong>{item.name}</strong><span>{item.format}{item.course ? ` · ${item.course}` : ""}</span><small>{item.firstTeeTime ? `First tee ${item.firstTeeTime}` : "Tee time unavailable"}</small></div>
      <div><StatusBadge status={item.status} /><b>{item.final} / {item.total} Final</b><small>{item.live ? `${item.live} Live · ` : ""}{item.upcoming} Upcoming</small></div>
    </article>)}</section>

    <section className={styles.health} aria-labelledby="health-title"><header><span>At a glance</span><h2 id="health-title">Tournament Health</h2></header><div>{HEALTH.map(([key, label]) => <article data-attention={["awaitingConfirmation", "reopened", "errors"].includes(key) && data.health[key] ? "true" : undefined} key={key}><strong>{data.health[key]}</strong><span>{label}</span></article>)}</div><p>Last synchronization: {timestamp(data.health.lastSynchronization)}</p></section>

    {(data.health.awaitingConfirmation || data.health.reopened || data.health.errors || !data.automation.enabled) ? <section className={styles.attention}><span>Attention Required</span><h2>Operational checks</h2><ul>{data.health.awaitingConfirmation ? <li>{data.health.awaitingConfirmation} match{data.health.awaitingConfirmation === 1 ? " is" : "es are"} awaiting confirmation.</li> : null}{data.health.reopened ? <li>{data.health.reopened} reopened match{data.health.reopened === 1 ? " requires" : "es require"} review.</li> : null}{data.health.errors ? <li>{data.health.errors} match configuration issue{data.health.errors === 1 ? "" : "s"} detected.</li> : null}{!data.automation.enabled ? <li>Round automation is disabled. Manual controls remain available.</li> : null}</ul></section> : null}

    <section className={styles.actions} aria-labelledby="actions-title"><header><span>One-tap operations</span><h2 id="actions-title">Quick Actions</h2></header><div>
      <button disabled={Boolean(busy)} onClick={() => act("open-round")}>Open Round {selectedRound}</button>
      <button disabled={Boolean(busy)} onClick={() => act("set-live")}>Set All LIVE</button>
      <button disabled={Boolean(busy) || !round || finalMatches !== round.total} onClick={() => act("close-round")}>Close Round</button>
      <label><span>Reopen finalized match</span><select value={reopenId} onChange={(event) => setReopenId(event.target.value)}><option value="">Select match</option>{(data.finalizedMatches || []).filter((item) => String(item.round) === selectedRound).map((item) => <option value={item.id} key={item.id}>Match {item.match} · {item.id}</option>)}</select><button disabled={Boolean(busy) || !reopenId} onClick={() => act("reopen-match", { matchId: reopenId })}>Reopen Match</button></label>
      <Link href="/live?view=leaderboards">Leaderboards</Link><Link href="/live">Tournament Overview</Link>
    </div>{message ? <p role="status">{message}</p> : null}</section>

    <section className={styles.automation}><header><span>Safeguards</span><h2>Automation</h2></header><p>Open a round 30 minutes before its earliest tee time and optionally set scheduled matches LIVE. Manual controls always remain available.</p><div><b>{data.automation.enabled ? "Automation enabled" : "Automation disabled"}</b><span>Auto open: {data.automation.autoOpenRound ? "On" : "Off"} · Set LIVE: {data.automation.autoSetMatchesLive ? "On" : "Off"}</span></div><button disabled={Boolean(busy)} onClick={() => act("automation", { enabled: !data.automation.enabled, autoOpenRound: !data.automation.enabled, autoSetMatchesLive: !data.automation.enabled })}>{data.automation.enabled ? "Disable automation" : "Enable automation"}</button></section>

    <section className={styles.activity}><header><span>Audit trail</span><h2>Recent Activity</h2></header>{data.recentActivity.length ? <ul>{data.recentActivity.map((item) => <li key={item.id}><div><strong>Round {item.round} · Match {item.match}</strong><span>{item.status}{item.updatedBy ? ` · ${item.updatedBy}` : ""}</span></div><time>{timestamp(item.updatedAt)}</time></li>)}</ul> : <p>No recent match activity.</p>}</section>
    <Link className={styles.fullAdmin} href="/admin">Open Full Admin →</Link>
  </section>;
}
