"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { directorFetch } from "../../../lib/director-client-transaction";
import { useCallback, useEffect, useState } from "react";
import StatusBadge from "../../StatusBadge.js";
import OddsAdmin from "../../odds-center/admin/OddsAdmin.js";
import { DirectorOperationsHub, OperationsSection } from "./DirectorOperationsConsole.js";
import styles from "./director.module.css";

const HEALTH = [
  ["live", "Live Matches"], ["upcoming", "Upcoming Matches"], ["final", "Final Matches"],
  ["scoringLocked", "Scoring Locked"], ["awaitingConfirmation", "Awaiting Confirmation"], ["reopened", "Reopened Matches"], ["errors", "Errors"],
];
const DIRECTOR_LOAD_RETRY_DELAYS = [400, 650, 1000, 1500, 2250, 3000];
const DIRECTOR_LOAD_FAILURE = "Unable to verify Director credentials after automatic recovery.";
const ACTION_LABELS = {
  "unlock-scoring": "Scoring unlocked", "lock-scoring": "Scoring locked", "set-live": "Round matches opened for live scoring",
  "open-round": "Round opened", "close-round": "Round closed", "reopen-match": "Match reopened",
  "match-unlock-scoring": "Scoring unlocked", "match-lock-scoring": "Scoring locked", "match-mark-live": "Match marked Live",
  "match-finalize": "Match finalized", "match-reopen": "Match reopened",
  automation: "Automation updated", "automation-check": "Automation verified",
  "match-management": "Match updated", "round-pairings": "Round Pairings updated", "calcutta-management": "Calcutta updated", "net-skins-eligibility": "Net Skins eligibility updated",
  "course-tees": "Course tee selections updated",
};

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

export default function DirectorDashboard({ directorName }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRound, setSelectedRound] = useState("");
  const [reopenId, setReopenId] = useState("");
  const [testPlayerId, setTestPlayerId] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [shadowInspection, setShadowInspection] = useState(null);
  const [shadowRebuildResult, setShadowRebuildResult] = useState(null);
  const [shadowSelection, setShadowSelection] = useState({ matchId: "2026-R3-9", holeNumber: "17", googleRevision: "2" });
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryOperation, setRetryOperation] = useState(null);
  const [operationLog, setOperationLog] = useState([]);
  const [toast, setToast] = useState("");
  const [loadStartedAt] = useState(() => typeof performance === "undefined" ? 0 : performance.now());
  const recordOperation = useCallback((label, status = "success", detail = "") => {
    setOperationLog((current) => [{ id: `${Date.now()}-${label}`, label, status, detail, at: new Date().toISOString() }, ...current].slice(0, 8));
  }, []);
  const load = useCallback(async (attempt = 0) => {
    if (!attempt) { setMessage(""); setLoadFailed(false); }
    const response = await fetch("/api/director", { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json();
    if (response.status === 503 && attempt < DIRECTOR_LOAD_RETRY_DELAYS.length) {
      setMessage("Director verification expired. Reconnecting automatically…");
      await new Promise((resolve) => window.setTimeout(resolve, DIRECTOR_LOAD_RETRY_DELAYS[attempt]));
      return load(attempt + 1);
    }
    if (response.status === 503) throw new Error(DIRECTOR_LOAD_FAILURE);
    if (!response.ok) throw new Error(payload.error || "Director dashboard is unavailable.");
    setData(payload.data);
    setMessage(""); setLoadFailed(false); setRetryOperation(null);
    setTestPlayerId((current) => current || payload.data.qaTools?.selectedPlayer?.id || payload.data.qaTools?.players?.[0]?.id || "");
    setSelectedRound((current) => current || String(payload.data.tournament.currentRound || payload.data.rounds.find((round) => round.status !== "FINAL")?.number || payload.data.rounds[0]?.number || ""));
    if (!attempt && loadStartedAt) console.info("Director Mission Control performance", { operation: "initial-load", elapsedMs: Math.round(performance.now() - loadStartedAt), apiRequests: 1 });
  }, [loadStartedAt]);
  useEffect(() => { load().catch((error) => { setMessage(error.message); setLoadFailed(true); }); }, [load]);
  useEffect(() => {
    if (!data?.automation?.enabled) return undefined;
    const check = () => directorFetch("/api/director", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "automation-check" }) }).then((response) => response.ok ? response.json() : null).then((result) => { if (result?.changed) load(); }).catch(() => {});
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [data?.automation?.enabled, load]);
  const act = async (action, extra = {}) => {
    const startedAt = Date.now();
    setBusy(action); setMessage(""); setRetryOperation(null);
    try {
      const response = await directorFetch("/api/director", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, round: Number(selectedRound), ...extra }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Director action failed.");
      await load();
      const elapsed = Date.now() - startedAt;
      const label = ACTION_LABELS[action] || "Tournament operation completed";
      recordOperation(label, "success", `${elapsed} ms · workbook verified`);
      setMessage(`${label}. Changes verified.`);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Director action failed.";
      recordOperation(ACTION_LABELS[action] || "Tournament operation", "failed", detail);
      setRetryOperation(() => () => act(action, extra));
      setMessage(detail);
      return false;
    }
    finally { setBusy(""); }
  };
  const sendTestNotification = async (template) => {
    setBusy(`notification-${template.id}`); setMessage("");
    try {
      const response = await directorFetch("/api/director/notifications/sandbox", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ templateId: template.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Test notification could not be sent.");
      await load(); recordOperation(`${template.label} sent`, "success", "Notification delivery recorded"); setMessage(`${template.label} sent to this device.`);
      return true;
    } catch (error) { recordOperation(`${template.label} notification`, "failed", error.message); setMessage(error.message); return false; }
    finally { setBusy(""); }
  };
  const previewAsPlayer = async (playerId) => {
    setBusy("impersonation"); setMessage("");
    try {
      const response = await directorFetch("/api/director/impersonation", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Preview player could not be selected.");
      window.dispatchEvent(new Event("player-passport-changed"));
      router.push("/home");
    } catch (error) { setMessage(error.message); setBusy(""); }
  };
  const resetPreviewTournament = async () => {
    setBusy("preview-reset"); setMessage("");
    try {
      const response = await directorFetch("/api/director/reset-preview", { method: "POST", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Preview tournament reset failed.");
      setResetOpen(false); setResetComplete(true); setSelectedRound("1"); setReopenId("");
      await load();
      recordOperation("Preview tournament reset", "success", "Workbook reset and verification complete");
      setMessage(`${payload.message}\n${payload.detail}`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const inspectShadow = async () => {
    setBusy("shadow-inspect"); setMessage("");
    try {
      const query = new URLSearchParams({ action: "inspect", matchId: shadowSelection.matchId, holeNumber: shadowSelection.holeNumber });
      const response = await directorFetch(`/api/director/scoring-shadow?${query}`, { credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Scoring shadow inspection failed.");
      setShadowInspection(payload.inspection);
      if (payload.inspection?.observation?.google_revision != null) setShadowSelection((current) => ({ ...current, googleRevision: String(payload.inspection.observation.google_revision) }));
      const report = payload.inspection?.latestRun?.summary;
      if (report) setMessage(`Shadow ${payload.inspection.latestRun.status} · Missing holes ${report.missing?.length || 0} · Missing matches ${report.missingMatches?.length || 0} · Calculations ${report.calculationDivergence?.length || 0} · Payload ${report.payloadDivergence?.length || 0} · Revisions ${(report.revisionMismatch?.length || 0) + (report.matchRevisionDivergence?.length || 0)} · Stale ${report.stale?.length || 0} · Orphans ${(report.orphan?.length || 0) + (report.orphanMatches?.length || 0)}`);
      return payload.inspection;
    } catch (error) { setMessage(error.message); return null; }
    finally { setBusy(""); }
  };
  const replayShadow = async () => {
    setBusy("shadow-replay"); setMessage("");
    try {
      const response = await directorFetch("/api/director/scoring-shadow", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "replay", matchId: shadowSelection.matchId, holeNumber: Number(shadowSelection.holeNumber), googleRevision: Number(shadowSelection.googleRevision) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Scoring shadow replay failed.");
      setShadowInspection(payload.after);
      recordOperation("Scoring shadow replay", "success", `${payload.replayDurationMs} ms · ${payload.replay.comparisonStatus}`);
      setMessage(`Shadow replay verified · ${payload.replay.comparisonStatus} · ${payload.replayDurationMs} ms`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const rebuildShadow = async () => {
    setBusy("shadow-rebuild"); setMessage("");
    try {
      const response = await directorFetch("/api/director/scoring-shadow", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rebuild" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Scoring shadow rebuild failed.");
      setShadowRebuildResult(payload);
      await inspectShadow();
      recordOperation("Scoring shadow rebuild", payload.summary?.pass ? "success" : "failed", `${payload.timings?.totalRequestDurationMs || 0} ms · ${payload.summary?.pass ? "PASS" : "DIVERGENCE"}`);
      setMessage(`Shadow rebuild ${payload.summary?.pass ? "verified" : "found divergence"} · ${payload.timings?.totalRequestDurationMs || 0} ms`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  const resolveIssue = (item) => {
    const source = item.items?.[0] || item;
    if (source.action === "enable-automation") return act("automation", { enabled: true, autoOpenRound: true, autoSetMatchesLive: true });
    if (source.action === "open-round") { if (source.id.startsWith("round:")) setSelectedRound(source.id.split(":")[1]); return act("open-round", { round: Number(source.id.split(":")[1] || selectedRound) }); }
    if (source.action === "unlock-scoring") return act("unlock-scoring", { round: data.operatingRound?.number });
    if (source.action === "retry") return load().catch((error) => setMessage(error.message));
    return null;
  };
  if (!data) return <section className={styles.shell}><div className={styles.loading} role="status"><strong>{loadFailed ? "Director connection needs attention" : "Opening Tournament Director…"}</strong><span>{message || "Verifying Director and loading tournament operations…"}</span>{loadFailed ? <button type="button" onClick={() => load().catch((error) => { setMessage(error.message); setLoadFailed(true); })}>Retry</button> : null}</div></section>;
  const finalMatches = data.rounds.find((item) => String(item.number) === selectedRound)?.final || 0;
  const displayRounds = [...data.rounds].sort((left, right) => {
    if (left.number === data.operatingRound?.number) return -1;
    if (right.number === data.operatingRound?.number) return 1;
    const priority = { LIVE: 0, UPCOMING: 1, FINAL: 2 };
    return priority[left.status] - priority[right.status] || left.number - right.number;
  });
  return <section className={styles.shell}>
    <header className={styles.hero}><span>Director Mode</span><h1>Tournament Director</h1><p>{directorName} · {data.tournament.year} {data.tournament.name}</p><StatusBadge status={data.tournament.status} /></header>

    <DirectorOperationsHub operations={data.operations} notificationSandbox={data.notificationSandbox} busy={busy} saveOperation={async (...args) => { const saved = await act(...args); if (saved) { setToast(args[0] === "course-tees" ? "✓ Tee Selections Updated" : "✓ Changes Saved"); window.setTimeout(() => setToast(""), 2400); } return saved; }} operateMatch={async (...args) => { const saved = await act(...args); if (saved) { setToast("✓ Match Updated"); window.setTimeout(() => setToast(""), 2400); } return saved; }} sendNotification={async (...args) => { const sent = await sendTestNotification(...args); if (sent) { setToast("✓ Changes Saved"); window.setTimeout(() => setToast(""), 2400); } return sent; }} />

    <section className={styles.command} aria-labelledby="command-title">
      <header><span>Mission Control</span><h2 id="command-title">Operational Overview</h2></header>
      <div className={styles.commandGrid}>
        <div><small>Tournament</small><strong>{data.tournament.name}</strong><span>{data.tournament.year} · {data.tournament.location || "Location unavailable"}</span></div>
        <div><small>Operating Round</small><strong>{data.operatingRound ? `${data.operatingRound.name} • ${data.operatingRound.format}` : "Tournament Complete"}</strong><span>{data.operatingRound?.course || ""}</span></div>
        <div><small>Current Status</small><strong>{data.operatingRound?.status || data.tournament.status}</strong><span>{data.operatingRound ? `${data.operatingRound.final} of ${data.operatingRound.total} Final` : "All rounds complete"}</span></div>
        {data.timelineAvailable ? <div><small>Next Event</small><strong>{data.nextEvent ? `${data.nextEvent.icon} ${data.nextEvent.title}` : "No remaining scheduled events today."}</strong><span>{data.nextEvent?.countdown || ""}</span></div> : null}
      </div>
    </section>

    <section className={styles.directorHealth} aria-labelledby="director-health-title">
      <header><span>Operations systems</span><h2 id="director-health-title">Director Health</h2></header>
      <div>
        <article><i aria-hidden="true">🟢</i><strong>Director Authenticated</strong><span>Secure session verified</span></article>
        <article><i aria-hidden="true">🟢</i><strong>Workbook Connected</strong><span>Latest tournament model loaded</span></article>
        <article><i aria-hidden="true">🟢</i><strong>Google Connected</strong><span>Workbook read completed</span></article>
        <article data-ready={data.championshipProjections.ready ? "true" : "attention"}><i aria-hidden="true">{data.championshipProjections.ready ? "🟢" : "🟡"}</i><strong>Publication {data.championshipProjections.ready ? "Ready" : "Pending"}</strong><span>{data.championshipProjections.nextLabel}</span></article>
        <article data-ready={data.operatingRound?.scoringLocked ? "attention" : "true"}><i aria-hidden="true">{data.operatingRound?.scoringLocked ? "🟡" : "🟢"}</i><strong>Scoring {data.operatingRound?.scoringLocked ? "Locked" : "Ready"}</strong><span>{data.operatingRound?.name || "Tournament complete"}</span></article>
      </div>
      <footer><p><small>Last Successful Publication</small><strong>{data.championshipProjections.publishedAt ? timestamp(data.championshipProjections.publishedAt) : "Not yet published"}</strong></p><p><small>Outstanding Actions</small><strong>{data.issueGroups.length}</strong></p><p><small>Pending Warnings</small><strong>{data.issueGroups.filter((item) => item.severity === "warning").length}</strong></p><p><small>Upcoming Required Action</small><strong>{data.primaryAction.label}</strong></p></footer>
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

    <OperationsSection id="competition" eyebrow="Tournament workflow" title="Competition" summary="Open, score, close, and publish the active round." open>
    <section className={styles.actions} id="quick-actions" aria-labelledby="actions-title"><header><span>Recommended next step</span><h2 id="actions-title">Quick Actions</h2></header><div className={styles.primaryAction} data-kind={data.primaryAction.kind}>
      {data.primaryAction.kind === "action" ? <button disabled={Boolean(busy)} onClick={() => act(data.primaryAction.action, { round: data.operatingRound?.number })}>{data.primaryAction.label}</button> : <strong>{data.primaryAction.label}</strong>}<span>{data.primaryAction.message}</span>
    </div><div className={styles.secondaryActions}>
      {data.operatingRound?.status === "LIVE" ? <button disabled={Boolean(busy)} onClick={() => act(data.operatingRound.scoringLocked ? "unlock-scoring" : "lock-scoring", { round: data.operatingRound.number })}>{data.operatingRound.scoringLocked ? "Unlock Scoring" : "Lock Scoring"}</button> : null}
      {data.championshipProjections.ready ? <a href="#projections-title">Publish Championship Projection</a> : null}
      {finalMatches ? <label><span>Reopen finalized match</span><select value={reopenId} onChange={(event) => setReopenId(event.target.value)}><option value="">Select match</option>{(data.finalizedMatches || []).filter((item) => String(item.round) === selectedRound).map((item) => <option value={item.id} key={item.id}>Match {item.match} · {item.id}</option>)}</select><button disabled={Boolean(busy) || !reopenId} onClick={() => act("reopen-match", { matchId: reopenId })}>Reopen Match</button></label> : null}
      <Link href="/live?view=leaderboards">Leaderboards</Link><Link href="/live">Tournament Overview</Link>
    </div><details className={styles.roundOverride}><summary>Override Operating Round</summary><label>Operating round<select value={selectedRound} onChange={(event) => setSelectedRound(event.target.value)}>{data.rounds.map((item) => <option value={item.number} key={item.number}>{item.name} • {item.format}</option>)}</select></label></details>{message ? <div className={styles.actionMessage} role="status"><span>{message}</span>{retryOperation ? <button type="button" disabled={Boolean(busy)} onClick={retryOperation}>Retry Action</button> : null}</div> : null}</section>

    <section className={styles.projections} data-ready={data.championshipProjections.ready ? "true" : "false"} aria-labelledby="projections-title">
      <header><span>Tournament Intelligence</span><h2 id="projections-title">Championship Projections</h2></header>
      <div className={styles.projectionStatus}>
        <article><small>Current Publication</small><strong>{data.championshipProjections.currentLabel}</strong><span>{data.championshipProjections.publishedAt ? timestamp(data.championshipProjections.publishedAt) : "No official projection published"}</span></article>
        <article><small>Next Milestone</small><strong>{data.championshipProjections.nextLabel}</strong><span>{data.championshipProjections.ready ? "Ready to publish" : "Not ready"}</span></article>
      </div>
      <p>{data.championshipProjections.reason}</p>
      {data.championshipProjections.nextPhase || data.qaTools && data.championshipProjections.publishedPhases.length ? <details className={styles.projectionPublisher}><summary>{data.qaTools && data.championshipProjections.publishedPhases.length ? "Publish or Regenerate Championship Projection" : data.championshipProjections.ready ? "Publish Championship Projection" : "Review Publication Requirements"}</summary><OddsAdmin embedded directorAuthorized previewMode={Boolean(data.qaTools)} initialPhase={data.championshipProjections.nextPhase || data.championshipProjections.currentPhase} publicationReady={data.championshipProjections.ready} regenerationPhases={data.qaTools ? data.championshipProjections.publishedPhases : []} onPublished={() => { recordOperation("Championship Projection published", "success", "Official snapshot verified"); load().catch((error) => setMessage(error.message)); }} /></details> : null}
    </section>

    <section className={styles.automation}><header><span>Safeguards</span><h2>Automation</h2></header><div className={styles.automationGrid}><article data-enabled={data.automation.enabled && data.automation.autoOpenRound ? "true" : "false"}><span>{data.automation.enabled && data.automation.autoOpenRound ? "🟢" : "⚪"} Auto Open</span><strong>{data.automation.enabled && data.automation.autoOpenRound ? "Enabled" : "Disabled"}</strong><small>{data.nextEvent?.round ? `${data.nextEvent.title} · ${data.nextEvent.countdown}` : "No round action scheduled"}</small></article><article data-enabled={data.automation.enabled && data.automation.autoSetMatchesLive ? "true" : "false"}><span>{data.automation.enabled && data.automation.autoSetMatchesLive ? "🟢" : "⚪"} Auto LIVE</span><strong>{data.automation.enabled && data.automation.autoSetMatchesLive ? "Enabled" : "Disabled"}</strong><small>{data.automation.autoSetMatchesLive ? "Runs when the round opens" : "Manual Set All LIVE required"}</small></article></div><button disabled={Boolean(busy)} onClick={() => act("automation", { enabled: !data.automation.enabled, autoOpenRound: !data.automation.enabled, autoSetMatchesLive: !data.automation.enabled })}>{data.automation.enabled ? "Disable automation · Manual override" : "Enable automation"}</button></section>
    </OperationsSection>

    {data.qaTools ? <OperationsSection id="preview-tools" eyebrow="Preview only" title="Preview Tools" summary="Impersonate a golfer, inspect the scoring shadow, or reset Dress Rehearsal runtime state."><section className={styles.qaTools} aria-labelledby="qa-tools-title"><header><span>Preview only</span><h2 id="qa-tools-title">QA Tools</h2></header><label><span>Preview As</span><select value={testPlayerId} disabled={Boolean(busy)} onChange={(event) => { const playerId = event.target.value; setTestPlayerId(playerId); previewAsPlayer(playerId); }}>{data.qaTools.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label><p>{busy === "impersonation" ? "Opening player preview…" : "Preview the app as the selected golfer."}</p>{resetComplete ? <div className={styles.resetComplete} role="status"><strong>Preview Tournament Reset Complete</strong><span>Ready for Dress Rehearsal.</span></div> : null}<div className={styles.shadowUtility}><div><strong>Scoring Shadow Diagnostics</strong><span>Inspect, replay, or rebuild Google-verified observations. This never writes Google.</span></div><label><span>Match ID</span><input value={shadowSelection.matchId} onChange={(event) => setShadowSelection((current) => ({ ...current, matchId: event.target.value }))} /></label><label><span>Hole</span><input inputMode="numeric" value={shadowSelection.holeNumber} onChange={(event) => setShadowSelection((current) => ({ ...current, holeNumber: event.target.value }))} /></label><div className={styles.shadowActions}><button disabled={Boolean(busy)} onClick={inspectShadow}>{busy === "shadow-inspect" ? "Inspecting…" : "Inspect Shadow"}</button><button disabled={Boolean(busy) || !shadowInspection?.observation} onClick={replayShadow}>{busy === "shadow-replay" ? "Replaying…" : "Replay Exact Observation"}</button><button disabled={Boolean(busy)} onClick={rebuildShadow}>{busy === "shadow-rebuild" ? "Rebuilding…" : "Rebuild Full Shadow"}</button></div>{shadowInspection ? <div className={styles.shadowResult} role="status"><strong>{shadowInspection.observation ? `${shadowInspection.observation.match_id} · Hole ${shadowInspection.observation.hole_number} · ${shadowInspection.observation.comparison_status}` : "No matching observation"}</strong><span>Events {shadowInspection.counts.score_mirror_events} · Holes {shadowInspection.counts.hole_score_mirror} · Matches {shadowInspection.counts.live_match_mirror} · Runs {shadowInspection.counts.mirror_reconciliation_runs} · Delivery {shadowInspection.observation?.delivery_count || 0}</span>{shadowRebuildResult ? <><span>Rebuild {shadowRebuildResult.summary?.pass ? "PASS" : "DIVERGENCE"} · {shadowRebuildResult.timings?.totalRequestDurationMs || 0} ms</span><span>Google {shadowRebuildResult.timings?.googleReadDurationMs || 0} ms · Normalize {shadowRebuildResult.timings?.normalizationDurationMs || 0} ms · Supabase {shadowRebuildResult.timings?.supabaseRebuildDurationMs || 0} ms · Reconcile {shadowRebuildResult.timings?.reconciliationDurationMs || 0} ms · Total {shadowRebuildResult.timings?.totalDurationMs || 0} ms</span></> : null}</div> : null}</div><div className={styles.resetUtility}><div><strong>Dress Rehearsal</strong><span>Clear runtime tournament results while preserving setup and content.</span></div><button disabled={Boolean(busy)} onClick={() => { setResetComplete(false); setResetOpen(true); }}>🔄 Reset Preview Tournament</button></div></section></OperationsSection> : null}
    <OperationsSection id="operational-log" eyebrow="Director only" title="Operational Log" summary="Verified actions and official match activity."><section className={styles.activity}>{operationLog.length || data.recentActivity.length ? <ul>{operationLog.map((item) => <li data-status={item.status} key={item.id}><i aria-hidden="true">{item.status === "success" ? "🟢" : "🔴"}</i><div><strong>{item.label}</strong><span>{item.detail}</span></div><time>{timestamp(item.at)}</time></li>)}{data.recentActivity.map((item) => <li key={item.id}><i aria-hidden="true">{activityIcon(item.status)}</i><div><strong>{activityLabel(item.status)}</strong><span>Round {item.round} · Match {item.match}{item.updatedBy ? ` · ${item.updatedBy}` : ""}</span></div><time>{timestamp(item.updatedAt)}</time></li>)}</ul> : <p>No operations recorded yet. Completed Director actions will appear here.</p>}</section></OperationsSection>
    <Link className={styles.fullAdmin} href="/admin">Open Full Admin →</Link>
    {toast ? <div className={styles.operationToast} role="status">{toast}</div> : null}
    {resetOpen ? <div className={styles.resetBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setResetOpen(false); }}><section className={styles.resetDialog} role="dialog" aria-modal="true" aria-labelledby="reset-preview-title"><span>Preview only</span><h2 id="reset-preview-title">Reset Preview Tournament?</h2><p>This will return the Preview tournament to the beginning of tournament week.</p><strong>Production data will NOT be affected.</strong><div><button disabled={Boolean(busy)} onClick={() => setResetOpen(false)}>Cancel</button><button disabled={Boolean(busy)} onClick={resetPreviewTournament}>{busy === "preview-reset" ? "Resetting…" : "Reset Preview"}</button></div></section></div> : null}
  </section>;
}
