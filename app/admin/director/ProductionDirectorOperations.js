"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClientMutationOperationIdentityRegistry } from "../../../lib/client-mutation-operation-identity.js";
import ProductionDraftEditor from "./ProductionDraftEditor.js";
import ProductionGuideEditor from "./ProductionGuideEditor.js";
import ProductionPredictionSettingsEditor from "./ProductionPredictionSettingsEditor.js";
import styles from "./production-director.module.css";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const pretty = (value) => clean(value || "Unavailable").toLowerCase().replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());
const timestamp = (value) => Number.isFinite(Date.parse(clean(value)))
  ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  : "Not available";

async function jsonRequest(endpoint, body) {
  const response = await fetch(endpoint, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `The operation did not complete (${response.status}).`);
    error.code = payload.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function Status({ value, children }) {
  const normalized = upper(value);
  const ready = ["ACTIVE", "COMPLETE", "CURRENT", "ENABLED", "HEALTHY", "LIVE", "OPEN", "OFFICIAL", "PUBLISHED", "READY", "RECONCILED", "SUPABASE", "NORMAL", "VALID", "VALIDATED"].includes(normalized);
  const attention = ["ATTENTION", "FAILED", "STALE", "MIXED", "NEEDS_SETUP", "RECALCULATION_REQUIRED", "UNAVAILABLE", "BLOCKED", "RETRYABLE"].includes(normalized);
  return <span className={styles.stateBadge} data-state={ready ? "ready" : attention ? "attention" : "neutral"}>{children || pretty(value)}</span>;
}

function Receipt({ receipt }) {
  if (!receipt) return null;
  return <div className={styles.receipt} role="status">
    <strong>{receipt.title}</strong>
    <span>{receipt.message}</span>
  </div>;
}

const ACTIONS = Object.freeze({
  "mark-live": { label: "Mark Live", endpoint: "/api/director", action: "match-mark-live", result: "Live", consequence: "The match becomes Live. Scoring lock and participant access do not change." },
  "scoring-lock": { label: "Lock Scoring", endpoint: "/api/director", action: "match-lock-scoring", result: "Scoring locked", consequence: "Scoring is locked and participant scoring access is revoked." },
  "scoring-unlock": { label: "Unlock Scoring", endpoint: "/api/director", action: "match-unlock-scoring", result: "Scoring unlocked", consequence: "Scoring is unlocked and participant scoring access is activated." },
  "access-activate": { label: "Activate Access", endpoint: "/api/live-matches", action: "access-generate", result: "Access active", consequence: "Existing participant scoring permissions become active. The scoring lock does not change." },
  "access-revoke": { label: "Revoke Access", endpoint: "/api/live-matches", action: "access-disable", result: "Access revoked", consequence: "Participant scoring access is revoked. The scoring lock does not change." },
  finalize: { label: "Finalize", endpoint: "/api/director", action: "match-finalize", result: "Final", consequence: "The official result is committed, scoring is locked, participant access is revoked, and the archive workflow is queued." },
  reopen: { label: "Reopen", endpoint: "/api/director", action: "match-reopen", result: "Live and reopened", consequence: "The official result is invalidated, the match returns to Live, scoring unlocks, and participant access is activated." },
});

function Confirmation({ pending, busy, onCancel, onConfirm }) {
  if (!pending) return null;
  const definition = ACTIONS[pending.action];
  return <div className={styles.modalBackdrop} role="presentation">
    <section className={styles.confirmation} role="dialog" aria-modal="true" aria-labelledby="director-confirm-title">
      <span>Confirm Director action</span>
      <h2 id="director-confirm-title">{definition.label} · Match {pending.match.matchNumber}</h2>
      <dl>
        <div><dt>Current state</dt><dd>{pretty(pending.match.status)}</dd></div>
        <div><dt>Expected result</dt><dd>{definition.result}</dd></div>
      </dl>
      <p>{definition.consequence}</p>
      {pending.action === "reopen" ? <p className={styles.supportNote}>The installed Reopen contract records the Director and transition, but does not support a separate reason field.</p> : null}
      <div className={styles.dialogActions}>
        <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className={styles.primaryButton} disabled={busy} onClick={onConfirm}>{busy ? "Waiting for confirmation…" : `Confirm ${definition.label}`}</button>
      </div>
    </section>
  </div>;
}

function PlayerNames({ players }) {
  return <span>{players.length ? players.map((player) => player.name || player.id).join(" · ") : "Pairing unavailable"}</span>;
}

function MatchCard({ match, busy, onAction }) {
  return <article className={styles.matchCard} data-status={match.status}>
    <header>
      <div><small>Match {match.matchNumber}</small><h3>{match.format || "Match"}</h3></div>
      <Status value={match.status} />
    </header>
    <div className={styles.matchTeams}>
      <div><small>Team 1</small><PlayerNames players={match.teamOne} /></div>
      <div><small>Team 2</small><PlayerNames players={match.teamTwo} /></div>
    </div>
    <dl className={styles.matchFacts}>
      <div><dt>Course</dt><dd>{[match.course, match.tee].filter(Boolean).join(" · ") || "Not assigned"}</dd></div>
      <div><dt>Start</dt><dd>{[match.teeTime, match.startingHole ? `Hole ${match.startingHole}` : ""].filter(Boolean).join(" · ") || "Not scheduled"}</dd></div>
      <div><dt>Progress</dt><dd>{match.scoredHoles} / 18 holes{match.currentHole ? ` · Current ${match.currentHole}` : ""}</dd></div>
      <div><dt>Running result</dt><dd>{match.result || "No result yet"}</dd></div>
      <div><dt>Scoring lock</dt><dd><Status value={match.scoringLocked ? "LOCKED" : "OPEN"}>{match.scoringLocked ? "Locked" : "Unlocked"}</Status></dd></div>
      <div><dt>Participant access</dt><dd><Status value={match.accessState} /></dd></div>
    </dl>
    {match.warnings.length ? <ul className={styles.matchWarnings}>{match.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    <div className={styles.actionRow}>
      {match.actions.map((action) => <button type="button" key={action} disabled={busy} data-impact={["finalize", "reopen", "scoring-lock", "access-revoke"].includes(action) ? "high" : "normal"} onClick={() => onAction(action, match)}>{ACTIONS[action].label}</button>)}
      {!match.actions.length ? <span>No action is currently required.</span> : null}
    </div>
  </article>;
}

export function TournamentDayPanel({ data, refresh }) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [setupReadiness, setSetupReadiness] = useState({ phase: "loading", matches: [] });
  const identities = useRef(null);
  const registry = () => {
    if (!identities.current) identities.current = createClientMutationOperationIdentityRegistry();
    return identities.current;
  };
  const loadSetupReadiness = useCallback(async () => {
    try {
      const payload = await jsonRequest("/api/director/tournament-setup");
      setSetupReadiness({ phase: "ready", matches: Array.isArray(payload.data?.matches) ? payload.data.matches : [] });
      return true;
    } catch {
      setSetupReadiness({ phase: "failure", matches: [] });
      return false;
    }
  }, []);
  useEffect(() => { loadSetupReadiness(); }, [loadSetupReadiness]);
  const setupMatches = useMemo(() => new Map(
    setupReadiness.matches.map((match) => [clean(match.matchId || match.match_id), match]),
  ), [setupReadiness.matches]);
  const rounds = useMemo(() => data.tournamentDay.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      if (upper(match.status) !== "UPCOMING") return match;
      const setup = setupMatches.get(clean(match.id));
      const scoringReady = setupReadiness.phase === "ready" && setup?.scoringReady === true;
      const reasons = Array.isArray(setup?.scoringReadinessReasons)
        ? setup.scoringReadinessReasons.filter(Boolean)
        : [];
      const readinessMessage = scoringReady
        ? ""
        : reasons[0] || (setupReadiness.phase === "loading"
          ? "Checking authoritative scoring readiness before Mark Live."
          : setupReadiness.phase === "failure"
            ? "Scoring readiness is temporarily unavailable. Mark Live is paused."
            : "Complete Tournament Setup and prepare a current scoring snapshot before Mark Live.");
      const current = {
        ...match,
        scoringReady,
        scoringReadinessReasons: reasons,
      };
      const priorWarnings = match.warnings.filter((warning) =>
        !/^Scoring readiness must be verified before this match can be marked Live\.$/.test(warning));
      return {
        ...current,
        actions: scoringReady
          ? ["mark-live", ...match.actions.filter((action) => action !== "mark-live")]
          : match.actions.filter((action) => action !== "mark-live"),
        warnings: [...new Set([readinessMessage, ...priorWarnings].filter(Boolean))],
      };
    }),
  })), [data.tournamentDay.rounds, setupMatches, setupReadiness.phase]);
  const execute = async () => {
    if (!pending) return;
    const definition = ACTIONS[pending.action];
    const requestBody = {
      action: definition.action,
      matchId: pending.match.id,
      expectedMatchRevision: pending.match.matchRevision,
      expectedPermissionRevision: pending.match.permissionRevision,
      scoringAuthorityContract: data.tournamentDay.mutationContract,
    };
    const operation = registry().acquire({ endpoint: definition.endpoint, ...requestBody });
    setBusy(true); setReceipt(null);
    try {
      const response = await jsonRequest(definition.endpoint, { ...requestBody, operationRequestId: operation.operationRequestId });
      registry().confirm(operation);
      const authoritative = response.receipt || response.data?.match || {};
      setPending(null);
      setReceipt({ title: `${definition.label} confirmed`, message: `Match ${pending.match.matchNumber} is authoritative at revision ${authoritative.match_revision ?? pending.match.matchRevision + 1}.` });
      const [refreshed] = await Promise.all([refresh(), loadSetupReadiness()]);
      if (!refreshed) {
        setRefreshFailed(true);
        setReceipt({
          title: `${definition.label} confirmed`,
          message: `Match ${pending.match.matchNumber} changed successfully, but the latest Tournament Day state could not be reloaded. Refresh before another action.`,
        });
      } else setRefreshFailed(false);
    } catch (error) {
      setReceipt({ title: `${definition.label} did not complete`, message: error.message });
    } finally { setBusy(false); }
  };
  return <>
    <section className={styles.panel}>
      <header><span>Live operations</span><h2>Tournament Day</h2><p>Current Supabase match state. Controls appear only when the certified transition is legal.</p></header>
      <div className={styles.dayStatus}>
        <div><small>Lifecycle</small><strong>{pretty(data.tournament.status)}</strong></div>
        <div><small>Operating round</small><strong>{data.tournament.currentRound.label}</strong></div>
        <div><small>Scoring ingress</small><strong>{data.authority.ingress.label}</strong></div>
      </div>
      {!data.tournamentDay.available ? <div className={styles.inlineNotice}>Certified match controls are temporarily unavailable. No match state has been changed.</div> : null}
    </section>
    <Receipt receipt={receipt} />
    {refreshFailed ? <div className={styles.inlineNotice} role="alert">Controls are paused because the latest authoritative match revisions are unavailable. <button type="button" onClick={async () => setRefreshFailed(!(await refresh()))}>Refresh Authoritative State</button></div> : null}
    {rounds.map((round) => <section className={styles.panel} key={round.number}>
      <header><span>Round {round.number}</span><h2>{round.label}</h2><p>{round.format} · {pretty(round.status)}</p></header>
      <div className={styles.matchGrid}>{round.matches.map((match) => <MatchCard key={match.id} match={match} busy={busy || refreshFailed || !data.tournamentDay.available} onAction={(action, selected) => setPending({ action, match: selected })} />)}</div>
    </section>)}
    <Confirmation pending={pending} busy={busy} onCancel={() => setPending(null)} onConfirm={execute} />
  </>;
}

function OddsPanel({ data, refresh }) {
  const [jobs, setJobs] = useState([]);
  const [jobsFailure, setJobsFailure] = useState("");
  const [busy, setBusy] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [phase, setPhase] = useState("Pre-Tournament");
  const [iterations, setIterations] = useState(25000);
  const loadJobs = useCallback(async () => {
    try {
      const result = await jsonRequest("/api/admin/production-odds-calculations");
      setJobs(result.jobs || []); setJobsFailure("");
    } catch (error) { setJobsFailure(error.message); }
  }, []);
  useEffect(() => { loadJobs(); }, [loadJobs]);
  const operate = async (action, job = null) => {
    if (action === "publish" && !globalThis.confirm?.(`Publish the certified ${job.phase} Championship Odds snapshot to Production?`)) return;
    setBusy(`${action}:${job?.job_id || "new"}`); setReceipt(null);
    try {
      const result = action === "publish"
        ? await jsonRequest("/api/odds/publish", { jobId: job.job_id, phase: job.phase })
        : await jsonRequest("/api/admin/production-odds-calculations", action === "request"
          ? { action, phase, iterations }
          : { action, jobId: job.job_id });
      setReceipt({ title: action === "publish" ? "Odds published" : action === "retry" ? "Calculation retry accepted" : "Calculation requested", message: action === "publish" ? `Publication revision ${result.publication?.revision ?? "confirmed"} is now current.` : `Calculation ${result.jobId || job?.job_id} was accepted.` });
      await Promise.all([loadJobs(), refresh()]);
    } catch (error) { setReceipt({ title: "Odds operation did not complete", message: error.message }); }
    finally { setBusy(""); }
  };
  const publication = data.publications.odds;
  return <>
    <section className={styles.panel}>
      <header><span>Supabase publication authority</span><h2>Championship Odds</h2><p>Calculations and publication use the installed Production contracts. Google publication and mirror paths remain retired.</p></header>
      <div className={styles.summaryStrip}>
        <div><small>Publication</small><strong>{publication.label}</strong><Status value={publication.state} /></div>
        <div><small>Publication revision</small><strong>{publication.revision ?? "—"}</strong><span>{timestamp(publication.publishedAt)}</span></div>
        <div><small>Freshness</small><strong>{pretty(publication.freshness)}</strong><Status value={publication.freshness} /></div>
        <div><small>Prediction Settings</small><strong>Revision {data.projections.predictionSettings.revision ?? "—"}</strong><span>Saving settings does not calculate or publish Odds</span></div>
      </div>
      <div className={styles.oddsRequest}>
        <label>Milestone<select value={phase} onChange={(event) => setPhase(event.target.value)}>{["Pre-Tournament", "After Round 1", "After Round 2", "Round 3 Pairings Announced", "Final Results"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Iterations<select value={iterations} onChange={(event) => setIterations(Number(event.target.value))}>{[10000, 25000, 50000, 100000].map((item) => <option value={item} key={item}>{item.toLocaleString()}</option>)}</select></label>
        <button type="button" className={styles.primaryButton} disabled={Boolean(busy)} onClick={() => operate("request")}>Request Calculation</button>
      </div>
    </section>
    <Receipt receipt={receipt} />
    <section className={styles.panel}>
      <header><span>Durable calculation queue</span><h2>Recent Calculations</h2></header>
      {jobsFailure ? <div className={styles.inlineNotice}>{jobsFailure}</div> : null}
      {jobs.length ? <div className={styles.jobList}>{jobs.slice(0, 8).map((job) => <article key={job.job_id}>
        <div><strong>{job.phase}</strong><span>{Number(job.completed_iterations || 0).toLocaleString()} / {Number(job.total_iterations || 0).toLocaleString()} iterations</span></div>
        <Status value={job.status} />
        <div className={styles.actionRow}>
          {upper(job.status) === "RETRYABLE" ? <button type="button" disabled={Boolean(busy)} onClick={() => operate("retry", job)}>Retry</button> : null}
          {upper(job.status) === "SUCCEEDED" && job.publicationEligible === true ? <button type="button" disabled={Boolean(busy)} data-impact="high" onClick={() => operate("publish", job)}>Publish Certified Snapshot</button> : null}
        </div>
      </article>)}</div> : <p className={styles.empty}>No retained calculation jobs are available.</p>}
    </section>
    <section className={styles.panel}>
      <header><span>Supabase-native calculation inputs</span><h2>Prediction Settings</h2><p>Review and save a complete versioned configuration. Saving a revision marks prior calculations stale but never calculates or publishes Odds automatically.</p></header>
      <ProductionPredictionSettingsEditor onChanged={refresh} />
    </section>
  </>;
}

function NetSkinsCard({ data, refresh }) {
  const state = data.publications.netSkins;
  const privateState = data.privateOperations?.netSkins;
  const readiness = privateState?.readiness;
  const fingerprint = useRequestFingerprints();
  const [busy, setBusy] = useState("");
  const [queued, setQueued] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action) => {
    if (action === "configure" && !globalThis.confirm?.("Configure Production Net Skins from the current canonical pairings and handicap inputs? No facts will be invented.")) return;
    const intent = { domain: "NET_SKINS", action, revision: state.configurationRevision };
    setBusy(action); setMessage("");
    try {
      const requestFingerprint = await fingerprint(intent);
      const result = await jsonRequest("/api/admin/production-net-skins-v1", {
        action,
        expectedConfigurationRevision: state.configurationRevision,
        requestFingerprint,
      });
      await fingerprint(intent, true);
      setQueued(action === "enqueue");
      setMessage(action === "configure" ? "Net Skins configuration was accepted." : action === "enqueue" ? "Recalculation was queued." : "The queued calculation was processed.");
      await refresh();
      return result;
    } catch (error) {
      setMessage(upper(state.state) === "NOT_CONFIGURED"
        ? "Net Skins will become configurable once tournament pairings and handicap inputs are complete."
        : error.message);
    } finally { setBusy(""); }
  };
  return <article className={styles.operationCard}>
    <header><div><small>Supabase canonical contract</small><h3>Net Skins</h3></div><Status value={state.state} /></header>
    <p>{upper(state.state) === "NOT_CONFIGURED"
      ? readiness?.canConfigure
        ? "The canonical tournament inputs are complete and ready for Director configuration."
        : "Net Skins is not configured. The readiness review below identifies only the canonical facts still needed."
      : "Official-only Net Skins results use canonical pairings, handicaps, and completed scoring."}</p>
    <dl className={styles.compactFacts}>
      <div><dt>Configuration revision</dt><dd>{state.configurationRevision ?? 0}</dd></div>
      <div><dt>Configured rounds</dt><dd>{state.configuredRounds?.join(", ") || "None"}</dd></div>
      <div><dt>Result revision</dt><dd>{state.resultRevision ?? 0}</dd></div>
      <div><dt>Input readiness</dt><dd><Status value={readiness?.state || "UNAVAILABLE"} /></dd></div>
    </dl>
    {readiness ? <details className={styles.disclosure} open={upper(state.state) === "NOT_CONFIGURED"}>
      <summary>Canonical input readiness · {readiness.readyMatches} of {readiness.totalMatches} matches ready</summary>
      {readiness.issues.length ? <div className={styles.readinessIssues}>{readiness.issues.map((issue) => <article key={issue.code}>
        <div><strong>{issue.label}</strong><Status value="NEEDS_SETUP">Needs setup</Status></div>
        <p>{issue.summary}</p>
        {issue.byRound.length ? <span>{issue.byRound.map((round) => `Round ${round.round}: ${round.missingCount}`).join(" · ")}</span> : null}
      </article>)}</div> : <div className={styles.allReady}><strong>Canonical inputs are ready</strong><span>All certified Net Skins V1 prerequisites are complete.</span></div>}
    </details> : <div className={styles.inlineNotice}>Actionable Net Skins readiness is temporarily unavailable. No configuration action is offered.</div>}
    <div className={styles.actionRow}>
      {upper(state.state) === "NOT_CONFIGURED" ? <button type="button" disabled={Boolean(busy) || !readiness?.canConfigure} onClick={() => run("configure")}>{busy ? "Checking readiness…" : readiness?.canConfigure ? "Configure from Canonical Inputs" : "Complete Canonical Setup First"}</button> : <button type="button" disabled={Boolean(busy)} onClick={() => run("enqueue")}>Queue Recalculation</button>}
      {queued ? <button type="button" disabled={Boolean(busy)} onClick={() => run("process")}>Process Queued Calculation</button> : null}
    </div>
    <PrivateJobList title="Net Skins calculations" jobs={privateState?.jobs || []} />
    {message ? <p className={styles.operationMessage} role="status">{message}</p> : null}
  </article>;
}

function PrivateJobList({ title, jobs = [] }) {
  return <details className={styles.disclosure}>
    <summary>{title} · {jobs.length ? `${jobs.length} recent` : "none"}</summary>
    {jobs.length ? <div className={styles.privateJobs}>{jobs.map((job, index) => <article key={`${job.domain}-${job.round || "all"}-${job.requestedAt}-${index}`}>
      <div><strong>{job.round ? `Round ${job.round}` : pretty(job.domain)}</strong><span>Requested {timestamp(job.requestedAt)}</span></div>
      <Status value={job.status} />
      <div><span>Configuration {job.configurationRevision || "current"}</span>{job.resultRevision ? <span>Result {job.resultRevision}</span> : null}</div>
      {job.failureDescription ? <p>{job.failureDescription}</p> : null}
    </article>)}</div> : <p className={styles.empty}>No recalculation jobs have been recorded.</p>}
  </details>;
}

function decimalMoney(value, currency = "USD") {
  const amount = clean(value);
  if (!amount) return "Not recorded";
  return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
}

function CalcuttaPrivateReview({ review }) {
  if (!review) return <div className={styles.inlineNotice}>Director-private Calcutta review is temporarily unavailable. Unpublished facts remain protected.</div>;
  if (!review.configuration) return <div className={styles.empty}>No Calcutta rules, payout allocation, purchases, owners, or prices have been entered for 2026.</div>;
  return <div className={styles.privateReview}>
    <dl className={styles.compactFacts}>
      <div><dt>Rules validation</dt><dd><Status value={review.configuration.validationStatus} /></dd></div>
      <div><dt>Auction reconciliation</dt><dd><Status value={review.auction?.reconciliationStatus || "NOT_RECORDED"} /></dd></div>
      <div><dt>Market pot</dt><dd>{review.auction ? decimalMoney(review.auction.pot, review.currencyCode) : "Not recorded"}</dd></div>
      <div><dt>Purchased players</dt><dd>{review.auction?.purchaseCount || 0}</dd></div>
      <div><dt>Owners</dt><dd>{review.auction?.ownerCount || 0}</dd></div>
      <div><dt>Result freshness</dt><dd><Status value={review.result?.freshness || "MISSING"} /></dd></div>
    </dl>
    <details className={styles.disclosure}>
      <summary>Rules & payout allocation</summary>
      <div className={styles.ruleFacts}>
        <p>Player assets · Manual completed auction entry · No payout rounding · No settlement ledger</p>
        {review.configuration.pointStructure.length ? <div className={`${styles.dataTable} ${styles.pointTable}`} role="table" aria-label="Calcutta point awards">
          <div role="row"><strong>Place</strong><strong>Round 1</strong><strong>Round 2</strong><strong>Round 3</strong></div>
          {review.configuration.pointStructure.map((row) => <div role="row" key={row.place}><span>{row.place}</span><span>{row.round1Award}</span><span>{row.round2Award}</span><span>{row.round3Award}</span></div>)}
        </div> : <p>No point awards have been recorded.</p>}
        {review.configuration.payoutStructure.length ? <div className={styles.dataTable} role="table" aria-label="Calcutta payout allocation">
          <div role="row"><strong>Place</strong><strong>Round 1</strong><strong>Round 2</strong><strong>Round 3</strong><strong>Overall</strong></div>
          {review.configuration.payoutStructure.map((row) => <div role="row" key={row.place}><span>{row.place}</span><span>{row.round1Fraction}</span><span>{row.round2Fraction}</span><span>{row.round3Fraction}</span><span>{row.overallFraction}</span></div>)}
        </div> : <p>No payout allocation has been recorded.</p>}
      </div>
    </details>
    <details className={styles.disclosure}>
      <summary>Auction & ownership · {review.auction?.purchaseCount || 0} purchased</summary>
      {review.auction?.purchases?.length ? <div className={styles.purchaseList}>{review.auction.purchases.map((purchase) => <article key={purchase.player.id}>
        <header><div><strong>{purchase.player.name || purchase.player.id}</strong><span>{purchase.player.id}</span></div><strong>{decimalMoney(purchase.purchasePrice, review.currencyCode)}</strong></header>
        <ul>{purchase.owners.map((owner) => <li key={owner.player.id}><span>{owner.player.name || owner.player.id}</span><span>{owner.ownershipFraction} ownership</span></li>)}</ul>
      </article>)}</div> : <p className={styles.empty}>No completed auction facts have been recorded.</p>}
    </details>
    <details className={styles.disclosure}>
      <summary>Result & recalculation</summary>
      <dl className={styles.compactFacts}>
        <div><dt>Result state</dt><dd>{pretty(review.result?.state || "Not calculated")}</dd></div>
        <div><dt>Result revision</dt><dd>{review.result?.revision ?? "None"}</dd></div>
        <div><dt>Completed rounds</dt><dd>{review.result?.completedRounds?.join(", ") || "None"}</dd></div>
        <div><dt>Calculated</dt><dd>{timestamp(review.result?.calculatedAt)}</dd></div>
      </dl>
    </details>
  </div>;
}

function CalcuttaCard({ data, refresh }) {
  const state = data.publications.calcutta;
  const privateState = data.privateOperations?.calcutta;
  const privateStateAligned = Boolean(privateState) &&
    privateState.configurationRevision === state.configurationRevision &&
    privateState.auctionRevision === state.auctionRevision &&
    privateState.publicationRevision === state.publicationRevision &&
    upper(privateState.state) === upper(state.state) &&
    upper(privateState.publicationState) === upper(state.publicationState);
  const fingerprint = useRequestFingerprints();
  const [busy, setBusy] = useState("");
  const [queued, setQueued] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action) => {
    if (action === "publish" && !globalThis.confirm?.("Publish the exact current canonical Calcutta auction revision to authenticated participant clients? This does not change auction facts.")) return;
    if (action === "unpublish" && !globalThis.confirm?.("Unpublish Calcutta for participant clients while preserving all canonical auction facts?")) return;
    const intent = { domain: "CALCUTTA", action, configurationRevision: state.configurationRevision, auctionRevision: state.auctionRevision, publicationRevision: state.publicationRevision };
    setBusy(action); setMessage("");
    try {
      const requestFingerprint = await fingerprint(intent);
      await jsonRequest("/api/admin/production-calcutta-v1", {
        action,
        expectedConfigurationRevision: state.configurationRevision,
        expectedConfigurationFingerprint: state.configurationFingerprint || null,
        expectedAuctionRevision: state.auctionRevision,
        expectedAuctionFingerprint: state.auctionFingerprint || null,
        expectedPublicationRevision: state.publicationRevision,
        requestFingerprint,
        reason: action === "enqueue" ? "Director requested current Calcutta recalculation" : undefined,
      });
      await fingerprint(intent, true);
      setQueued(action === "enqueue");
      setMessage(action === "publish" ? "Calcutta was published from the exact canonical auction revision; recalculation was queued." : action === "unpublish" ? "Calcutta was unpublished without deleting auction facts." : action === "enqueue" ? "Calcutta recalculation was queued." : "The queued Calcutta recalculation was processed.");
      await refresh();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };
  return <article className={styles.operationCard}>
    <header><div><small>Supabase canonical contract</small><h3>Calcutta</h3></div><Status value={state.state} /></header>
    <p>{upper(state.state) === "NOT_CONFIGURED" ? "No 2026 financial facts have been entered. Nothing has been fabricated or published." : "Publication remains Director-controlled and participant-visible only after an explicit publish."}</p>
    <dl className={styles.compactFacts}>
      <div><dt>Publication</dt><dd>{pretty(state.publicationState)}</dd></div>
      <div><dt>Configuration revision</dt><dd>{state.configurationRevision ?? 0}</dd></div>
      <div><dt>Auction revision</dt><dd>{state.auctionRevision ?? 0}</dd></div>
      <div><dt>Result revision</dt><dd>{state.resultRevision ?? "None"}</dd></div>
    </dl>
    {upper(state.state) === "NOT_CONFIGURED" ? <div className={styles.workflowSteps}><span>Rules / Payouts</span><span>Auction</span><span>Ownership</span><span>Review</span><span>Publication</span></div> : null}
    {privateState && !privateStateAligned ? <div className={styles.inlineNotice} role="alert">Calcutta changed while this page was loading. Refresh before reviewing or performing an action.</div> : <CalcuttaPrivateReview review={privateStateAligned ? privateState : null} />}
    <div className={styles.actionRow}>
      {state.auctionRevision > 0 ? <button type="button" disabled={Boolean(busy) || !privateStateAligned} onClick={() => run("enqueue")}>Queue Recalculation</button> : null}
      {queued ? <button type="button" disabled={Boolean(busy) || !privateStateAligned} onClick={() => run("process")}>Process Queued Calculation</button> : null}
      {!state.published && state.configurationRevision > 0 && state.auctionRevision > 0 && state.configurationFingerprint && state.auctionFingerprint ? <button type="button" disabled={Boolean(busy) || !privateStateAligned} data-impact="high" onClick={() => run("publish")}>Publish Exact Auction Revision</button> : null}
      {state.published ? <button type="button" disabled={Boolean(busy)} data-impact="high" onClick={() => run("unpublish")}>Unpublish</button> : null}
    </div>
    <PrivateJobList title="Calcutta calculations" jobs={privateState?.jobs || []} />
    {message ? <p className={styles.operationMessage} role="status">{message}</p> : null}
  </article>;
}

export function OddsAndSideGamesPanel({ data, refresh }) {
  return <>
    <OddsPanel data={data} refresh={refresh} />
    <section className={styles.panel}>
      <header><span>Canonical side games</span><h2>Side Games</h2><p>Status and only the bounded actions supported by the installed Production contracts.</p></header>
      <div className={styles.operationGrid}><NetSkinsCard data={data} refresh={refresh} /><CalcuttaCard data={data} refresh={refresh} /></div>
    </section>
  </>;
}

export function DraftGuidePanel({ data, refresh }) {
  return <>
    <section className={styles.panel}>
      <header><span>Supabase-native authoring</span><h2>Draft</h2><p>Review and save a complete tournament-scoped Draft revision. Current public and participant Draft presentation continues to read the canonical Supabase projection.</p></header>
      <ProductionDraftEditor onChanged={refresh} />
    </section>
    <section className={styles.panel}>
      <header><span>Supabase-native authoring</span><h2>Tournament Guide</h2><p>Create a private Guide draft, validate and preview the participant-safe projection, then publish one immutable tournament-scoped revision.</p></header>
      <ProductionGuideEditor onChanged={refresh} />
    </section>
  </>;
}

function QueueSummary({ title, counts }) {
  const entries = Object.entries(counts || {});
  return <article className={styles.operationCard}>
    <header><div><small>Certified worker queue</small><h3>{title}</h3></div><Status value={entries.some(([state, count]) => !["DELIVERED", "VERIFIED", "SUPERSEDED"].includes(state) && count > 0) ? "ATTENTION" : "HEALTHY"} /></header>
    {entries.length ? <dl className={styles.compactFacts}>{entries.map(([state, count]) => <div key={state}><dt>{pretty(state)}</dt><dd>{count}</dd></div>)}</dl> : <p>No queue records are present.</p>}
  </article>;
}

const AUDIT_FILTERS = Object.freeze([
  ["ALL", "All activity"], ["MATCH", "Matches"], ["HANDICAP", "Handicaps"],
  ["ACCESS", "Players & access"],
  ["ODDS", "Odds"], ["DRAFT", "Draft"], ["SIDE_GAME", "Side games"],
  ["SYNCHRONIZATION", "Sync"], ["RELEASE", "Releases"],
]);

export function SystemAuditPanel({ data }) {
  const [auditFilter, setAuditFilter] = useState("ALL");
  const privateTimeline = data.privateOperations?.auditTimeline || [];
  const filteredTimeline = auditFilter === "ALL"
    ? privateTimeline
    : privateTimeline.filter((item) => item.category === auditFilter);
  return <>
    <section className={styles.panel}>
      <header><span>System status</span><h2>Production Runtime</h2><p>Safe operational health only. Secrets, infrastructure fingerprints, claims, and evidence blobs are never displayed.</p></header>
      <div className={styles.summaryStrip}>
        <div><small>Supabase</small><strong>{data.authority.reads.label}</strong><Status value={data.authority.reads.value} /></div>
        <div><small>Scoring ingress</small><strong>{data.authority.ingress.label}</strong><Status value={data.authority.ingress.value} /></div>
        <div><small>Workers</small><strong>{pretty(data.workers.state)}</strong><Status value={data.workers.state} /></div>
        <div><small>Maintenance</small><strong>{data.authority.maintenance.label}</strong><Status value={data.authority.maintenance.value} /></div>
      </div>
    </section>
    <section className={styles.panel}>
      <header><span>Background processing</span><h2>Mirror & Archive Health</h2><p>Worker switches stay server-controlled. No generic enable, disable, or unbounded retry is exposed.</p></header>
      <div className={styles.operationGrid}>
        <QueueSummary title="Scoring Google mirror" counts={data.workers.queues?.outbox} />
        <QueueSummary title="Round Scorecards archive" counts={data.workers.queues?.archive} />
      </div>
    </section>
    <section className={styles.panel}>
      <header><span>Recent safe activity</span><h2>Operational Timeline</h2><p>Allowlisted Director and tournament activity only. Raw audit payloads, internal identifiers, and infrastructure evidence are never returned.</p></header>
      {data.privateOperations?.available ? <>
        <div className={styles.auditFilters} aria-label="Filter operational timeline">{AUDIT_FILTERS.map(([value, label]) => <button type="button" key={value} aria-pressed={auditFilter === value} onClick={() => setAuditFilter(value)}>{label}</button>)}</div>
        {filteredTimeline.length ? <ul className={styles.activity}>{filteredTimeline.map((item) => <li key={item.id}>
          <div><strong>{item.title}</strong><span>{item.summary} · {item.actorName}</span></div>
          <div className={styles.activityMeta}><Status value={item.status} /><time>{timestamp(item.occurredAt)}</time></div>
        </li>)}</ul> : <p className={styles.empty}>No recent activity matches this filter.</p>}
      </> : <>
        <div className={styles.inlineNotice}>The sanitized cross-domain audit timeline is temporarily unavailable. Recent safe match activity remains visible below.</div>
        {data.recentActivity?.length ? <ul className={styles.activity}>{data.recentActivity.map((item) => <li key={item.id}>
          <div><strong>{item.label}</strong><span>Authoritative match activity</span></div>
          <div className={styles.activityMeta}><Status value={item.status} /><time>{timestamp(item.updatedAt)}</time></div>
        </li>)}</ul> : <p className={styles.empty}>No recent match activity is available.</p>}
      </>}
    </section>
  </>;
}
