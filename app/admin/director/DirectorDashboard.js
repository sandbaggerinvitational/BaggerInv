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

function activityIcon(status) {
  if (status === "Final") return "🟢";
  if (status === "Reopened") return "🟡";
  if (status === "Live") return "🔵";
  return "⚪";
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
  const resolveIssue = (item) => {
    const source = item.items?.[0] || item;
    if (source.action === "enable-automation") return act("automation", { enabled: true, autoOpenRound: true, autoSetMatchesLive: true });
    if (source.action === "open-round") { if (source.id.startsWith("round:")) setSelectedRound(source.id.split(":")[1]); return act("open-round", { round: Number(source.id.split(":")[1] || selectedRound) }); }
    if (source.action === "retry") return load().catch((error) => setMessage(error.message));
    return null;
  };
  if (!data) return <section className={styles.shell}><div className={styles.loading} role="status">{message || "Opening Tournament Director…"}</div></section>;
  const finalMatches = data.rounds.find((item) => String(item.number) === selectedRound)?.final || 0;
  return <section className={styles.shell}>
    <header className={styles.hero}><span>Director Mode</span><h1>Tournament Director</h1><p>{directorName} · {data.tournament.year} {data.tournament.name}</p><StatusBadge status={data.tournament.status} /></header>

    <section className={styles.command} aria-labelledby="command-title">
      <header><span>Mission Control</span><h2 id="command-title">Operational Overview</h2></header>
      <div className={styles.commandGrid}>
        <div><small>Tournament</small><strong>{data.tournament.name}</strong><span>{data.tournament.year} · {data.tournament.location || "Location unavailable"}</span></div>
        <div><small>Operating Round</small><strong>{data.operatingRound ? `${data.operatingRound.name} • ${data.operatingRound.format}` : "Tournament Complete"}</strong><span>{data.operatingRound?.course || ""}</span></div>
        <div><small>Current Status</small><strong>{data.operatingRound?.status || data.tournament.status}</strong><span>{data.operatingRound ? `${data.operatingRound.final} of ${data.operatingRound.total} Final` : "All rounds complete"}</span></div>
        <div><small>Next Event</small><strong>{data.nextEvent?.title || "No event scheduled"}</strong><span>{data.nextEvent?.countdown || "Tournament schedule complete"}</span></div>
      </div>
      <label>Manual operating round<select value={selectedRound} onChange={(event) => setSelectedRound(event.target.value)}>{data.rounds.map((item) => <option value={item.number} key={item.number}>{item.name}</option>)}</select></label>
    </section>

    <section className={styles.nextEvent} aria-labelledby="next-event-title"><header><span>Tournament countdown</span><h2 id="next-event-title">Next Event</h2></header>{data.nextEvent ? <div><div><strong>{data.nextEvent.title}</strong><span>{data.nextEvent.subtitle}</span><small>{data.nextEvent.startTime}</small></div><div><b>{data.nextEvent.countdown}</b><span>{data.nextEvent.automatic ? "Automatic" : "Scheduled"}</span></div></div> : <p>No additional tournament events are scheduled.</p>}</section>

    <section className={styles.rounds} aria-labelledby="round-status-title"><header><span>Competition</span><h2 id="round-status-title">Round Status</h2></header>{data.rounds.map((item) => <article key={item.number} data-state={item.status}>
      <div><strong>{item.name}</strong><span>{item.format}{item.course ? ` · ${item.course}` : ""}</span><small>{item.firstTeeTime ? `First tee ${item.firstTeeTime}` : "Tee time unavailable"}</small></div>
      <div><StatusBadge status={item.status} /><b>{item.final} / {item.total} Final</b><small>{item.live ? `${item.live} Live · ` : ""}{item.upcoming} Upcoming</small></div>
    </article>)}</section>

    <section className={styles.health} data-level={data.health.status.level} aria-labelledby="health-title"><header><div><span>At a glance</span><h2 id="health-title">Tournament Health</h2></div></header><div className={styles.healthBanner}><strong>{data.health.status.icon} {data.health.status.label}</strong><span>{data.health.status.message}</span></div><div>{HEALTH.map(([key, label]) => <article data-attention={["awaitingConfirmation", "reopened", "errors"].includes(key) && data.health[key] ? "true" : undefined} key={key}><strong>{data.health[key]}</strong><span>{label}</span></article>)}</div><p>Last synchronization: {timestamp(data.health.lastSynchronization)}</p></section>

    {data.issueGroups.length ? <section className={styles.attention}><span>Attention Required</span><h2>Operational actions</h2><div>{data.issueGroups.map((item) => <article data-severity={item.severity} key={item.id}><i aria-hidden="true">{item.severity === "critical" ? "●" : item.severity === "warning" ? "▲" : "ℹ"}</i><div><strong>{item.title}</strong><p>{item.message}</p><small>{item.impact}</small>{item.items.length > 1 ? <details><summary>View {item.items.length} matches</summary><ul>{item.items.map((matchIssue) => <li key={matchIssue.id}>{matchIssue.title} · {matchIssue.message}</li>)}</ul></details> : null}</div>{item.action ? <button disabled={Boolean(busy)} onClick={() => resolveIssue(item)}>{item.actionLabel}</button> : <Link href={item.href}>{item.actionLabel}</Link>}</article>)}</div></section> : null}

    <section className={styles.actions} id="quick-actions" aria-labelledby="actions-title"><header><span>One-tap operations</span><h2 id="actions-title">Quick Actions</h2></header><div>
      <button disabled={Boolean(busy)} onClick={() => act("set-live")}>Set All LIVE</button>
      <button className={!round?.open ? styles.readyAction : styles.openedAction} disabled={Boolean(busy) || Boolean(round?.open)} onClick={() => act("open-round")}>{!round?.open ? <>🟢 <span>READY</span> Open Round {selectedRound}</> : <>✓ Round {selectedRound} Open</>}</button>
      <button disabled={Boolean(busy) || !round || finalMatches !== round.total} onClick={() => act("close-round")}>Close Round</button>
      <label><span>Reopen finalized match</span><select value={reopenId} onChange={(event) => setReopenId(event.target.value)}><option value="">Select match</option>{(data.finalizedMatches || []).filter((item) => String(item.round) === selectedRound).map((item) => <option value={item.id} key={item.id}>Match {item.match} · {item.id}</option>)}</select><button disabled={Boolean(busy) || !reopenId} onClick={() => act("reopen-match", { matchId: reopenId })}>Reopen Match</button></label>
      <Link href="/live?view=leaderboards">Leaderboards</Link><Link href="/live">Tournament Overview</Link>
    </div>{message ? <p role="status">{message}</p> : null}</section>

    <section className={styles.automation}><header><span>Safeguards</span><h2>Automation</h2></header><div className={styles.automationGrid}><article data-enabled={data.automation.enabled && data.automation.autoOpenRound ? "true" : "false"}><span>{data.automation.enabled && data.automation.autoOpenRound ? "🟢" : "⚪"} Auto Open</span><strong>{data.automation.enabled && data.automation.autoOpenRound ? "Enabled" : "Disabled"}</strong><small>{data.nextEvent?.round ? `${data.nextEvent.title} · ${data.nextEvent.countdown}` : "No round action scheduled"}</small></article><article data-enabled={data.automation.enabled && data.automation.autoSetMatchesLive ? "true" : "false"}><span>{data.automation.enabled && data.automation.autoSetMatchesLive ? "🟢" : "⚪"} Auto LIVE</span><strong>{data.automation.enabled && data.automation.autoSetMatchesLive ? "Enabled" : "Disabled"}</strong><small>{data.automation.autoSetMatchesLive ? "Runs when the round opens" : "Manual Set All LIVE required"}</small></article></div><button disabled={Boolean(busy)} onClick={() => act("automation", { enabled: !data.automation.enabled, autoOpenRound: !data.automation.enabled, autoSetMatchesLive: !data.automation.enabled })}>{data.automation.enabled ? "Disable automation · Manual override" : "Enable automation"}</button></section>

    <section className={styles.activity}><header><span>Audit trail</span><h2>Recent Activity</h2></header>{data.recentActivity.length ? <ul>{data.recentActivity.map((item) => <li key={item.id}><i aria-hidden="true">{activityIcon(item.status)}</i><div><strong>Round {item.round} · Match {item.match}</strong><span>{item.status}{item.updatedBy ? ` · ${item.updatedBy}` : ""}</span></div><time>{timestamp(item.updatedAt)}</time></li>)}</ul> : <p>No recent match activity.</p>}</section>
    <Link className={styles.fullAdmin} href="/admin">Open Full Admin →</Link>
  </section>;
}
