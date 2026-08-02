"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import StatusBadge from "../../StatusBadge.js";
import styles from "./director.module.css";

const HEALTH = [
  ["live", "Live Matches"], ["upcoming", "Upcoming Matches"], ["final", "Final Matches"],
  ["scoringLocked", "Scoring Locked"], ["awaitingConfirmation", "Awaiting Confirmation"], ["reopened", "Reopened Matches"], ["errors", "Errors"],
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

function activityLabel(status) {
  if (status === "Final") return "Match Finalized";
  if (status === "Reopened") return "Match Reopened";
  if (status === "Live") return "Scoring Update";
  return "Match Updated";
}

function ReadinessPanel({ readiness }) {
  return <section className={styles.readiness} aria-labelledby="readiness-title">
    <header><span>Before the first tee</span><h2 id="readiness-title">Tournament Readiness</h2></header>
    <div className={styles.readinessBanner} data-ready={readiness.tournamentReady ? "true" : "false"}>
      <strong>{readiness.tournamentReady ? "🟢 Tournament Ready" : "🟡 Player Setup In Progress"}</strong>
      <span>{readiness.readyPlayers} / {readiness.totalPlayers} Players Ready</span>
    </div>
    <div className={styles.readinessList}>{readiness.items.map((item) => {
      const percent = item.total ? Math.round((item.complete / item.total) * 100) : 0;
      return <details key={item.id}>
        <summary aria-label={`${item.label}: ${item.complete} of ${item.total}`}>
          <span><strong>{item.complete === item.total && item.total ? "🟢" : "🟡"} {item.label}</strong><small>{item.complete} / {item.total}</small></span>
          <i><b style={{ width: `${percent}%` }} /></i>
        </summary>
        <div><strong>{item.missing.length ? "Players needing setup" : "Everyone is ready"}</strong>{item.missing.length ? <ul>{item.missing.map((player) => <li key={player.id}>{player.name}</li>)}</ul> : <p>No outstanding setup.</p>}{item.invalid?.length ? <><strong>Invalid subscriptions</strong><ul>{item.invalid.map((player) => <li key={`invalid-${player.id}`}>{player.name}</li>)}</ul></> : null}</div>
      </details>;
    })}</div>
  </section>;
}

function NotificationHealth({ sandbox }) {
  const checks = [
    ["pwaInstalled", "PWA Installed"],
    ["permissionGranted", "Notification Permission"],
    ["pushSubscription", "Push Subscription"],
    ["readyToSend", "Ready To Send"],
  ];
  const blocker = !sandbox.configured ? "Preview push keys are not configured."
    : !sandbox.health.pwaInstalled ? "Install and open the PWA on this device."
      : !sandbox.health.permissionGranted ? "Allow notifications for this PWA."
        : !sandbox.health.pushSubscription ? "Register this device's push subscription from the Home setup banner."
          : "This device can receive test notifications.";
  return <div className={styles.notificationHealth} aria-label="Notification Health">
    <h3>Notification Health</h3>
    <ul>{checks.map(([key, label]) => <li data-ready={sandbox.health[key] ? "true" : "false"} key={key}><span aria-hidden="true">{sandbox.health[key] ? "✅" : "○"}</span><strong>{label}</strong></li>)}</ul>
    <p role="status">{blocker}</p>
  </div>;
}

export default function DirectorDashboard({ directorName }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRound, setSelectedRound] = useState("");
  const [reopenId, setReopenId] = useState("");
  const [testPlayerId, setTestPlayerId] = useState("");
  const load = useCallback(async () => {
    setMessage("");
    const response = await fetch("/api/director", { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Director dashboard is unavailable.");
    setData(payload.data);
    setTestPlayerId((current) => current || payload.data.qaTools?.selectedPlayer?.id || payload.data.qaTools?.players?.[0]?.id || "");
    setSelectedRound((current) => current || String(payload.data.tournament.currentRound || payload.data.rounds.find((round) => round.status !== "FINAL")?.number || payload.data.rounds[0]?.number || ""));
  }, []);
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [load]);
  useEffect(() => {
    if (!data?.automation?.enabled) return undefined;
    const check = () => fetch("/api/director", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "automation-check" }) }).then((response) => response.ok ? response.json() : null).then((result) => { if (result?.changed) load(); }).catch(() => {});
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [data?.automation?.enabled, load]);
  const act = async (action, extra = {}) => {
    setBusy(action); setMessage("");
    try {
      const response = await fetch("/api/director", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, round: Number(selectedRound), ...extra }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Director action failed.");
      await load(); setMessage("Tournament operation completed.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const sendTestNotification = async (template) => {
    setBusy(`notification-${template.id}`); setMessage("");
    try {
      const response = await fetch("/api/director/notifications/sandbox", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ templateId: template.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Test notification could not be sent.");
      await load(); setMessage(`${template.label} sent to this device.`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const previewAsPlayer = async (playerId) => {
    setBusy("impersonation"); setMessage("");
    try {
      const response = await fetch("/api/director/impersonation", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Preview player could not be selected.");
      router.push("/home");
    } catch (error) { setMessage(error.message); setBusy(""); }
  };
  const resolveIssue = (item) => {
    const source = item.items?.[0] || item;
    if (source.action === "enable-automation") return act("automation", { enabled: true, autoOpenRound: true, autoSetMatchesLive: true });
    if (source.action === "open-round") { if (source.id.startsWith("round:")) setSelectedRound(source.id.split(":")[1]); return act("open-round", { round: Number(source.id.split(":")[1] || selectedRound) }); }
    if (source.action === "unlock-scoring") return act("unlock-scoring", { round: data.operatingRound?.number });
    if (source.action === "retry") return load().catch((error) => setMessage(error.message));
    return null;
  };
  if (!data) return <section className={styles.shell}><div className={styles.loading} role="status">{message || "Opening Tournament Director…"}</div></section>;
  const finalMatches = data.rounds.find((item) => String(item.number) === selectedRound)?.final || 0;
  const displayRounds = [...data.rounds].sort((left, right) => {
    if (left.number === data.operatingRound?.number) return -1;
    if (right.number === data.operatingRound?.number) return 1;
    const priority = { LIVE: 0, UPCOMING: 1, FINAL: 2 };
    return priority[left.status] - priority[right.status] || left.number - right.number;
  });
  return <section className={styles.shell}>
    <header className={styles.hero}><span>Director Mode</span><h1>Tournament Director</h1><p>{directorName} · {data.tournament.year} {data.tournament.name}</p><StatusBadge status={data.tournament.status} /></header>

    <section className={styles.command} aria-labelledby="command-title">
      <header><span>Mission Control</span><h2 id="command-title">Operational Overview</h2></header>
      <div className={styles.commandGrid}>
        <div><small>Tournament</small><strong>{data.tournament.name}</strong><span>{data.tournament.year} · {data.tournament.location || "Location unavailable"}</span></div>
        <div><small>Operating Round</small><strong>{data.operatingRound ? `${data.operatingRound.name} • ${data.operatingRound.format}` : "Tournament Complete"}</strong><span>{data.operatingRound?.course || ""}</span></div>
        <div><small>Current Status</small><strong>{data.operatingRound?.status || data.tournament.status}</strong><span>{data.operatingRound ? `${data.operatingRound.final} of ${data.operatingRound.total} Final` : "All rounds complete"}</span></div>
        {data.timelineAvailable ? <div><small>Next Event</small><strong>{data.nextEvent ? `${data.nextEvent.icon} ${data.nextEvent.title}` : "No remaining scheduled events today."}</strong><span>{data.nextEvent?.countdown || ""}</span></div> : null}
      </div>
    </section>

    {data.readiness && data.readinessLifecycle === "setup" ? <ReadinessPanel readiness={data.readiness} />
      : data.readiness ? <details className={styles.readinessArchive}><summary>Pre-Tournament Setup</summary><ReadinessPanel readiness={data.readiness} /></details>
      : null}

    {data.timelineAvailable ? <section className={styles.nextEvent} aria-labelledby="next-event-title"><header><span>Tournament countdown</span><h2 id="next-event-title">Next Event</h2></header>{data.nextEvent ? <div><div><strong><span aria-hidden="true">{data.nextEvent.icon}</span> {data.nextEvent.title}</strong>{data.nextEvent.subtitle ? <span>{data.nextEvent.subtitle}</span> : null}{data.nextEvent.location ? <small>{data.nextEvent.location}</small> : null}<small>{data.nextEvent.startTime}</small></div><div><b>{data.nextEvent.countdown}</b><span>{data.nextEvent.status}</span></div></div> : <p>No remaining scheduled events today.</p>}</section> : null}

    <section className={styles.rounds} aria-labelledby="round-status-title"><header><span>Competition</span><h2 id="round-status-title">Round Status</h2></header>{displayRounds.map((item) => <article key={item.number} data-state={item.status} data-current={item.number === data.operatingRound?.number ? "true" : undefined}>
      <div>{item.number === data.operatingRound?.number ? <small className={styles.currentRoundLabel}>Operating Round</small> : null}<strong>{item.name}</strong><span>{item.format}{item.course ? ` · ${item.course}` : ""}</span><small>{item.firstTeeTime ? `First tee ${item.firstTeeTime}` : "Tee time unavailable"}</small></div>
      <div><StatusBadge status={item.status} /><b>{item.final} / {item.total} Final</b><small>{item.live ? `${item.live} Live · ` : ""}{item.upcoming} Upcoming</small></div>
    </article>)}</section>

    <section className={styles.health} data-level={data.health.status.level} aria-labelledby="health-title"><header><div><span>At a glance</span><h2 id="health-title">Tournament Health</h2></div></header><div className={styles.healthBanner}><strong>{data.health.status.icon} {data.health.status.label}</strong><span>{data.health.status.message}</span></div><div>{HEALTH.map(([key, label]) => <article data-attention={["awaitingConfirmation", "reopened", "errors"].includes(key) && data.health[key] ? "true" : undefined} key={key}><strong>{data.health[key]}</strong><span>{label}</span></article>)}</div><p>Last synchronization: {timestamp(data.health.lastSynchronization)}</p></section>

    {data.issueGroups.length ? <section className={styles.attention}><span>Attention Required</span><h2>Operational actions</h2><div>{data.issueGroups.map((item) => <article data-severity={item.severity} key={item.id}><i aria-hidden="true">{item.severity === "critical" ? "●" : item.severity === "warning" ? "▲" : "ℹ"}</i><div><strong>{item.title}</strong><p>{item.message}</p><small>{item.impact}</small>{item.items.length > 1 ? <details><summary>View {item.items.length} matches</summary><ul>{item.items.map((matchIssue) => <li key={matchIssue.id}>{matchIssue.title} · {matchIssue.message}</li>)}</ul></details> : null}</div>{item.action ? <button disabled={Boolean(busy)} onClick={() => resolveIssue(item)}>{item.actionLabel}</button> : <Link href={item.href}>{item.actionLabel}</Link>}</article>)}</div></section> : null}

    <section className={styles.actions} id="quick-actions" aria-labelledby="actions-title"><header><span>Recommended next step</span><h2 id="actions-title">Quick Actions</h2></header><div className={styles.primaryAction} data-kind={data.primaryAction.kind}>
      {data.primaryAction.kind === "action" ? <button disabled={Boolean(busy)} onClick={() => act(data.primaryAction.action, { round: data.operatingRound?.number })}>{data.primaryAction.label}</button> : <strong>{data.primaryAction.label}</strong>}<span>{data.primaryAction.message}</span>
    </div><div className={styles.secondaryActions}>
      {data.operatingRound?.status === "LIVE" ? <button disabled={Boolean(busy)} onClick={() => act(data.operatingRound.scoringLocked ? "unlock-scoring" : "lock-scoring", { round: data.operatingRound.number })}>{data.operatingRound.scoringLocked ? "Unlock Scoring" : "Lock Scoring"}</button> : null}
      {finalMatches ? <label><span>Reopen finalized match</span><select value={reopenId} onChange={(event) => setReopenId(event.target.value)}><option value="">Select match</option>{(data.finalizedMatches || []).filter((item) => String(item.round) === selectedRound).map((item) => <option value={item.id} key={item.id}>Match {item.match} · {item.id}</option>)}</select><button disabled={Boolean(busy) || !reopenId} onClick={() => act("reopen-match", { matchId: reopenId })}>Reopen Match</button></label> : null}
      <Link href="/live?view=leaderboards">Leaderboards</Link><Link href="/live">Tournament Overview</Link>
    </div><details className={styles.roundOverride}><summary>Override Operating Round</summary><label>Operating round<select value={selectedRound} onChange={(event) => setSelectedRound(event.target.value)}>{data.rounds.map((item) => <option value={item.number} key={item.number}>{item.name} • {item.format}</option>)}</select></label></details>{message ? <p role="status">{message}</p> : null}</section>

    <section className={styles.automation}><header><span>Safeguards</span><h2>Automation</h2></header><div className={styles.automationGrid}><article data-enabled={data.automation.enabled && data.automation.autoOpenRound ? "true" : "false"}><span>{data.automation.enabled && data.automation.autoOpenRound ? "🟢" : "⚪"} Auto Open</span><strong>{data.automation.enabled && data.automation.autoOpenRound ? "Enabled" : "Disabled"}</strong><small>{data.nextEvent?.round ? `${data.nextEvent.title} · ${data.nextEvent.countdown}` : "No round action scheduled"}</small></article><article data-enabled={data.automation.enabled && data.automation.autoSetMatchesLive ? "true" : "false"}><span>{data.automation.enabled && data.automation.autoSetMatchesLive ? "🟢" : "⚪"} Auto LIVE</span><strong>{data.automation.enabled && data.automation.autoSetMatchesLive ? "Enabled" : "Disabled"}</strong><small>{data.automation.autoSetMatchesLive ? "Runs when the round opens" : "Manual Set All LIVE required"}</small></article></div><button disabled={Boolean(busy)} onClick={() => act("automation", { enabled: !data.automation.enabled, autoOpenRound: !data.automation.enabled, autoSetMatchesLive: !data.automation.enabled })}>{data.automation.enabled ? "Disable automation · Manual override" : "Enable automation"}</button></section>

    <section className={styles.activity}><header><span>Audit trail</span><h2>Recent Activity</h2></header>{data.recentActivity.length ? <ul>{data.recentActivity.map((item) => <li key={item.id}><i aria-hidden="true">{activityIcon(item.status)}</i><div><strong>{activityLabel(item.status)}</strong><span>Round {item.round} · Match {item.match}{item.updatedBy ? ` · ${item.updatedBy}` : ""}</span></div><time>{timestamp(item.updatedAt)}</time></li>)}</ul> : <p>No recent match activity.</p>}</section>
    {data.qaTools ? <section className={styles.qaTools} aria-labelledby="qa-tools-title"><header><span>Preview only</span><h2 id="qa-tools-title">QA Tools</h2></header><label><span>Preview As</span><select value={testPlayerId} disabled={Boolean(busy)} onChange={(event) => { const playerId = event.target.value; setTestPlayerId(playerId); previewAsPlayer(playerId); }}>{data.qaTools.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label><p>{busy === "impersonation" ? "Opening player preview…" : "Preview the app as the selected golfer."}</p></section> : null}
    {data.notificationSandbox ? <section className={styles.notificationSandbox} aria-labelledby="notification-sandbox-title"><header><span>Preview only</span><h2 id="notification-sandbox-title">Notification Sandbox</h2></header><NotificationHealth sandbox={data.notificationSandbox} /><div className={styles.notificationTemplates}>{data.notificationSandbox.templates.map((template) => <button disabled={Boolean(busy) || !data.notificationSandbox.currentDeviceReady} onClick={() => sendTestNotification(template)} key={template.id}>{template.label}</button>)}</div><h3>Notification Log</h3>{data.notificationSandbox.log.length ? <div className={styles.notificationLog}>{data.notificationSandbox.log.map((item) => <article key={item.id}><div><strong>{item.type}</strong><span>{item.recipient}{item.template ? ` · ${item.template}` : ""}</span></div><time>{timestamp(item.sentAt)}</time><b data-status={item.status === "Failed" ? "failed" : "sent"}>{item.status}</b>{item.failure ? <small>{item.failure}</small> : null}</article>)}</div> : <p>No test notifications have been sent.</p>}</section> : null}
    <Link className={styles.fullAdmin} href="/admin">Open Full Admin →</Link>
  </section>;
}
