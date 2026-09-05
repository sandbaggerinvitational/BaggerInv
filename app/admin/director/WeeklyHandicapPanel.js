"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientMutationOperationIdentityRegistry } from "../../../lib/client-mutation-operation-identity.js";
import { directorFetch } from "../../../lib/director-client-transaction.js";
import {
  normalizeWeeklyHandicapPayload,
  parseWeeklyHandicapBulkPaste,
  weeklyHandicapDraftRows,
  weeklyHandicapDraftSummary,
  weeklyHandicapRevisionFromResponse,
} from "../../../lib/director-weekly-handicaps.js";
import styles from "./WeeklyHandicapPanel.module.css";

const ENDPOINT = "/api/director/handicaps";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function timestamp(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString([], {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function shortToken(value) {
  const token = String(value || "").trim();
  if (!token) return "Not returned";
  return token.length > 18 ? `${token.slice(0, 12)}…${token.slice(-4)}` : token;
}

function changeLabel(value) {
  if (value === null) return "New";
  if (value === "0") return "No change";
  return `${String(value).startsWith("-") ? "" : "+"}${value}`;
}

function handicapLabel(decimal, fallback = null) {
  if (decimal !== null && decimal !== undefined && String(decimal).trim()) return String(decimal);
  return fallback === null || fallback === undefined ? "—" : String(fallback);
}

function sourceHandicapLabel(decimal) {
  const value = handicapLabel(decimal);
  return value.startsWith("-") ? `+${value.slice(1)}` : value;
}

function matchLabel(match) {
  const round = match.roundNumber ? `R${match.roundNumber}` : "Round ?";
  const number = match.matchNumber ? `M${match.matchNumber}` : match.matchId;
  return `${round} · ${number}`;
}

function responseReceipt(payload = {}) {
  const value = payload.data || payload.result || payload;
  const receipt = value.receipt || value.auditReceipt || value.audit_receipt || {};
  const result = {
    receiptId: receipt.receiptId || receipt.receipt_id || "",
    payloadHash: receipt.payloadHash || receipt.payload_hash || "",
    status: receipt.status || "",
    approvedAt: receipt.approvedAt || receipt.approved_at || "",
  };
  if (!result.receiptId || !/^[0-9a-f]{64}$/i.test(result.payloadHash) ||
      result.status !== "APPROVED" || !Number.isFinite(Date.parse(result.approvedAt))) {
    throw new Error("The approved revision did not return an authoritative receipt.");
  }
  return result;
}

function proposalsFrom(players) {
  return Object.fromEntries(players.map((player) => [
    player.playerId,
    player.currentHandicapDecimal ?? (player.currentHandicap === null ? "" : String(player.currentHandicap)),
  ]));
}

function validationIssueText(issue) {
  if (typeof issue === "string") return issue;
  return [issue?.playerId || issue?.player_id, issue?.field, issue?.message || issue?.reason || issue?.code]
    .filter(Boolean).join(" · ") || "The staged handicap revision did not pass validation.";
}

export default function WeeklyHandicapPanel({ onOperation }) {
  const [data, setData] = useState(null);
  const [proposals, setProposals] = useState({});
  const [effectiveDate, setEffectiveDate] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkErrors, setBulkErrors] = useState([]);
  const [serverIssues, setServerIssues] = useState([]);
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("");
  const [stagedRevision, setStagedRevision] = useState(null);
  const [review, setReview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [latestReceipt, setLatestReceipt] = useState(null);
  const [sourcePlayerId, setSourcePlayerId] = useState("");
  const [ghinNumber, setGhinNumber] = useState("");
  const [currentIndex, setCurrentIndex] = useState("");
  const [lowIndex, setLowIndex] = useState("");
  const [lowIndexDate, setLowIndexDate] = useState("");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const operationIdentities = useRef(null);

  const identityRegistry = useCallback(() => {
    if (!operationIdentities.current) {
      operationIdentities.current = createClientMutationOperationIdentityRegistry();
    }
    return operationIdentities.current;
  }, []);

  const load = useCallback(async () => {
    setPhase((current) => current === "approved" ? current : "loading");
    const response = await fetch(ENDPOINT, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Weekly handicaps are unavailable (${response.status}).`);
    const normalized = normalizeWeeklyHandicapPayload(payload);
    setData(normalized);
    setProposals(proposalsFrom(normalized.players));
    setEffectiveDate(normalized.suggestedEffectiveDate || today());
    setPhase((current) => current === "approved" ? current : "editing");
    return normalized;
  }, []);

  useEffect(() => {
    load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Weekly handicaps are unavailable.");
      setPhase("failure");
    });
  }, [load]);

  const rows = useMemo(
    () => weeklyHandicapDraftRows(data?.players || [], proposals),
    [data?.players, proposals],
  );
  const summary = useMemo(() => weeklyHandicapDraftSummary(rows), [rows]);
  const changedRows = useMemo(() => rows.filter((row) => row.changed), [rows]);
  const sourcePlayers = data?.sourceEvidence?.players || [];
  const sourceByPlayer = useMemo(
    () => new Map(sourcePlayers.map((player) => [player.playerId, player])),
    [sourcePlayers],
  );
  const selectedSource = sourceByPlayer.get(sourcePlayerId) || null;
  const editorLocked = ["staging", "validating", "review", "approving"].includes(phase);

  const invalidateReview = () => {
    setStagedRevision(null);
    setReview(null);
    setConfirmed(false);
    setServerIssues([]);
    if (phase !== "loading") setPhase("editing");
  };

  const updateProposal = (playerId, value) => {
    setProposals((current) => ({ ...current, [playerId]: value }));
    invalidateReview();
  };

  const post = async (action, input) => {
    const intent = { endpoint: ENDPOINT, action, ...input };
    const operation = identityRegistry().acquire(intent);
    const response = await directorFetch(ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, action, operationRequestId: operation.operationRequestId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Weekly handicap ${action} failed (${response.status}).`);
      error.issues = payload.issues || payload.validationIssues || payload.data?.issues || [];
      throw error;
    }
    identityRegistry().confirm(operation);
    return { payload, operationRequestId: operation.operationRequestId };
  };

  const selectSourcePlayer = (playerId) => {
    const source = sourceByPlayer.get(playerId);
    setSourcePlayerId(playerId);
    setGhinNumber("");
    setCurrentIndex(source?.currentIndexDecimal !== null && source?.currentIndexDecimal !== undefined
      ? sourceHandicapLabel(source.currentIndexDecimal)
      : "");
    setLowIndex(source?.lowIndexDecimal !== null && source?.lowIndexDecimal !== undefined
      ? sourceHandicapLabel(source.lowIndexDecimal)
      : "");
    setLowIndexDate(source?.lowIndexDate || "");
    setReplaceConfirmed(false);
  };

  const saveGhinIdentity = async () => {
    if (!selectedSource || !ghinNumber.trim()) return;
    setSourceBusy(true); setMessage("");
    try {
      await post("set-ghin-identity", {
        playerId: selectedSource.playerId,
        ghinNumber,
        expectedIdentityId: selectedSource.identityId || null,
        replaceConfirmed,
      });
      setMessage(`Verified GHIN identity saved for ${selectedSource.displayName || selectedSource.playerId}.`);
      await load();
      setGhinNumber(""); setReplaceConfirmed(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GHIN identity was not saved.");
    } finally { setSourceBusy(false); }
  };

  const retireGhinIdentity = async () => {
    if (!selectedSource?.identityId || !window.confirm(
      `Retire the verified GHIN identity for ${selectedSource.displayName || selectedSource.playerId}? Existing evidence will be preserved.`,
    )) return;
    setSourceBusy(true); setMessage("");
    try {
      await post("retire-ghin-identity", {
        playerId: selectedSource.playerId,
        expectedIdentityId: selectedSource.identityId,
        retirementConfirmed: true,
      });
      setMessage("GHIN identity retired. Historical source evidence remains preserved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GHIN identity was not retired.");
    } finally { setSourceBusy(false); }
  };

  const saveManualSource = async () => {
    if (!selectedSource?.identityId) return;
    setSourceBusy(true); setMessage("");
    try {
      await post("save-manual-source", {
        playerId: selectedSource.playerId,
        expectedIdentityId: selectedSource.identityId,
        expectedPointerRevision: selectedSource.pointerRevision,
        currentIndex,
        lowIndex,
        lowIndexDate,
      });
      setMessage(`Manual Current HI and Low HI evidence recorded for ${selectedSource.displayName || selectedSource.playerId}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Handicap source evidence was not saved.");
    } finally { setSourceBusy(false); }
  };

  const applyHybridProposals = () => {
    if (!data.sourceEvidence.complete) return;
    setProposals(Object.fromEntries(data.players.map((player) => [
      player.playerId,
      sourceByPlayer.get(player.playerId)?.hybridDecimal || "",
    ])));
    invalidateReview();
    setMessage("Hybrid values loaded as draft proposals. Review or adjust them before staging.");
  };

  const applyBulkPaste = () => {
    const result = parseWeeklyHandicapBulkPaste(bulkValue, data?.players || []);
    setBulkErrors(result.errors);
    if (!Object.keys(result.updates).length) return;
    setProposals((current) => ({ ...current, ...result.updates }));
    setBulkValue("");
    invalidateReview();
    setMessage(`${Object.keys(result.updates).length} proposed handicap${Object.keys(result.updates).length === 1 ? "" : "s"} applied for review.`);
  };

  const stageAndValidate = async ({ fromHybrid = false } = {}) => {
    setMessage(""); setServerIssues([]); setConfirmed(false);
    if (!effectiveDate) {
      setMessage("Choose an effective date before staging this weekly revision.");
      return;
    }
    if (summary.invalidPlayerCount) {
      setMessage("Correct the inline handicap errors before staging this revision.");
      return;
    }
    if (!summary.changedPlayerCount) {
      setMessage("Enter at least one changed handicap before staging this revision.");
      return;
    }
    if (fromHybrid && !data.sourceEvidence.complete) {
      setMessage("Complete accepted Current HI and Low HI evidence is required for every active Player.");
      return;
    }
    try {
      let staged = stagedRevision;
      if (!staged) {
        setPhase("staging");
        const stageInput = {
          expectedRevision: data.revision,
          effectiveDate,
          expectedSourceFingerprint: fromHybrid ? data.sourceEvidence.sourceFingerprint : undefined,
          entries: rows.map((row) => ({
            playerId: row.playerId,
            proposedHandicap: row.proposedDecimal,
            sourceIndex: row.sourceIndexDecimal,
            lowIndex: row.lowIndexDecimal,
          })),
        };
        const stagedResponse = fromHybrid
          ? await post("stage-hybrid-draft", stageInput)
          : await post("stage", stageInput);
        staged = weeklyHandicapRevisionFromResponse(stagedResponse.payload);
        if (!staged.revisionId) throw new Error("The staged handicap revision did not return its revision ID.");
        setStagedRevision(staged);
      }
      setPhase("validating");
      const validationResponse = await post("validate", {
        revisionId: staged.revisionId,
        expectedRevision: data.revision,
      });
      const validated = weeklyHandicapRevisionFromResponse(validationResponse.payload);
      const issues = Array.isArray(validated.issues) ? validated.issues : [];
      setServerIssues(issues);
      if (!validated.valid || issues.length) {
        setPhase("editing");
        setMessage("The staged revision needs correction before it can be approved.");
        return;
      }
      const validation = validated.validation;
      if (!validation || validation.summary.changedPlayerCount === null ||
          validation.summary.affectedMatchCount === null ||
          validation.changedPlayers.length !== validation.summary.changedPlayerCount) {
        throw new Error("The server-validated handicap impact plan was incomplete.");
      }
      const validatedMatches = [
        ...validation.unstartedMatches,
        ...validation.startedFrozenMatches,
      ];
      const localRows = new Map(rows.map((row) => [row.playerId, row]));
      const validatedChangedRows = validation.changedPlayers.map((player) => {
        const local = localRows.get(player.playerId) || {};
        return {
          ...local,
          ...player,
          displayName: player.displayName || local.displayName || player.playerId,
          affectedMatches: validatedMatches.filter((match) =>
            match.affectedPlayerIds.includes(player.playerId)),
        };
      });
      const validatedSummary = {
        ...summary,
        changedPlayerCount: validation.summary.changedPlayerCount,
        unchangedPlayerCount: summary.playerCount - validation.summary.changedPlayerCount,
        affectedMatchCount: validation.summary.affectedMatchCount,
        refreshableMatchCount: validation.summary.refreshableMatchCount,
        frozenMatchCount: validation.summary.frozenMatchCount,
      };
      const validatedRevision = { ...staged, ...validated, revisionId: validated.revisionId || staged.revisionId };
      setStagedRevision(validatedRevision);
      setReview({
        revisionId: validatedRevision.revisionId,
        effectiveDate,
        changedRows: validatedChangedRows,
        summary: validatedSummary,
      });
      setPhase("review");
      setMessage("Server validation passed. Review the affected players and matches before approval.");
    } catch (error) {
      setServerIssues(Array.isArray(error?.issues) ? error.issues : []);
      setMessage(error instanceof Error ? error.message : "Weekly handicap review failed.");
      setPhase("failure");
      onOperation?.({ label: "Weekly handicap revision", status: "failed", detail: error?.message || "Review failed" });
    }
  };

  const approve = async () => {
    if (!review || !confirmed) return;
    setMessage(""); setPhase("approving");
    try {
      const approvalResponse = await post("approve", {
        revisionId: review.revisionId,
        expectedRevision: data.revision,
        confirmation: {
          changedPlayerCount: review.summary.changedPlayerCount,
          affectedMatchCount: review.summary.affectedMatchCount,
          refreshableMatchCount: review.summary.refreshableMatchCount,
          frozenMatchCount: review.summary.frozenMatchCount,
          effectiveDate: review.effectiveDate,
        },
      });
      const receipt = responseReceipt(approvalResponse.payload);
      setLatestReceipt(receipt);
      setReview(null); setStagedRevision(null); setConfirmed(false); setServerIssues([]);
      setPhase("approved");
      setMessage("Weekly handicap revision approved. The authoritative receipt is recorded below.");
      onOperation?.({
        label: "Weekly handicaps approved",
        status: "success",
        detail: `${summary.changedPlayerCount} players · effective ${effectiveDate}`,
      });
      await load().catch(() => {
        setMessage("Weekly handicap revision approved. The receipt is authoritative; refresh the page to reload the latest roster values.");
      });
      setPhase("approved");
    } catch (error) {
      setServerIssues(Array.isArray(error?.issues) ? error.issues : []);
      setMessage(error instanceof Error ? error.message : "Weekly handicap approval failed.");
      setPhase("failure");
      onOperation?.({ label: "Weekly handicap approval", status: "failed", detail: error?.message || "Approval failed" });
    }
  };

  if (!data) return <section className={styles.panel} aria-labelledby="weekly-handicap-title">
    <header><span>People & competition</span><h2 id="weekly-handicap-title">Weekly Handicaps</h2></header>
    <div className={styles.loadState} role={phase === "failure" ? "alert" : "status"}>
      <strong>{phase === "failure" ? "Weekly handicap workspace unavailable" : "Loading weekly handicaps…"}</strong>
      {message ? <span>{message}</span> : null}
      {phase === "failure" ? <button type="button" onClick={() => load().catch((error) => setMessage(error.message))}>Retry</button> : null}
    </div>
  </section>;

  return <section className={styles.panel} aria-labelledby="weekly-handicap-title">
    <header className={styles.heading}>
      <div><span>People & competition</span><h2 id="weekly-handicap-title">Weekly Handicaps</h2>
        <p>Stage, validate, and approve the next tournament-handicap revision. Match impact is reviewed before any approval.</p></div>
      <div><small>Approved revision</small><strong>{data.revision}</strong><span>{data.tournamentYear || data.tournamentId}</span></div>
    </header>

    <section className={styles.sourceWorkspace} aria-labelledby="handicap-source-title">
      <header><div><span>Proposal evidence</span><h3 id="handicap-source-title">GHIN identity &amp; Hybrid source</h3><p>Current HI and Low HI remain private proposal evidence. Only an approved handicap revision affects scoring.</p></div><button type="button" disabled aria-disabled="true">GHIN Auto Refresh — Pending Provider Authorization</button></header>
      <div className={styles.sourceSummary}>
        <article><small>Source coverage</small><strong>{data.sourceEvidence.coverageCount}/{data.sourceEvidence.rosterCount || data.players.length}</strong></article>
        <article><small>Hybrid draft</small><strong>{data.sourceEvidence.complete ? "Ready" : "Incomplete"}</strong></article>
        <button type="button" disabled={!data.sourceEvidence.complete || editorLocked} onClick={applyHybridProposals}>Use Hybrid proposals</button>
      </div>
      <div className={styles.sourceTable} role="region" aria-label="Private handicap source evidence" tabIndex="0"><table><thead><tr><th>Player</th><th>GHIN #</th><th>Current HI</th><th>Low HI</th><th>Low date</th><th>Hybrid</th><th>Approved</th><th>Source</th></tr></thead><tbody>{data.players.map((player) => {
        const source = sourceByPlayer.get(player.playerId) || {};
        return <tr key={player.playerId}><th scope="row"><button type="button" onClick={() => selectSourcePlayer(player.playerId)} aria-label={`Edit private handicap source for ${player.displayName}`}>{player.displayName}<span>{player.playerId}</span></button></th><td data-label="GHIN #">{source.maskedGhinNumber || "Not mapped"}</td><td data-label="Current HI">{sourceHandicapLabel(source.currentIndexDecimal)}</td><td data-label="Low HI">{sourceHandicapLabel(source.lowIndexDecimal)}</td><td data-label="Low date">{source.lowIndexDate || "—"}</td><td data-label="Hybrid"><strong>{sourceHandicapLabel(source.hybridDecimal)}</strong></td><td data-label="Approved"><strong>{handicapLabel(player.currentHandicapDecimal, player.currentHandicap)}</strong></td><td data-label="Source"><span className={styles.sourceMeta}>{source.stale ? "Stale — previous evidence" : source.provenance === "DIRECTOR_MANUAL" ? "Director manual" : source.sourceState === "COMPLETE" ? source.provenance : "Missing"}<small>{source.observedAt ? timestamp(source.observedAt) : "Not recorded"}</small></span></td></tr>;
      })}</tbody></table></div>
      {selectedSource ? <form className={styles.sourceEditor} onSubmit={(event) => event.preventDefault()}>
        <header><strong>{selectedSource.displayName || selectedSource.playerId}</strong><span>{selectedSource.identityId ? `Verified · ${selectedSource.maskedGhinNumber}` : "No GHIN mapping"}</span></header>
        <label><span>{selectedSource.identityId ? "Replacement GHIN Number" : "GHIN Number"}</span><input inputMode="numeric" autoComplete="off" value={ghinNumber} onChange={(event) => setGhinNumber(event.target.value)} placeholder="Digits only" /></label>
        {selectedSource.identityId ? <label className={styles.sourceConfirm}><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} /><span>I confirm this verified identity replacement.</span></label> : null}
        <div className={styles.sourceActions}><button type="button" disabled={sourceBusy || !ghinNumber.trim() || Boolean(selectedSource.identityId && !replaceConfirmed)} onClick={saveGhinIdentity}>{selectedSource.identityId ? "Replace mapping" : "Verify mapping"}</button>{selectedSource.identityId ? <button type="button" disabled={sourceBusy} onClick={retireGhinIdentity}>Retire mapping</button> : null}</div>
        <label><span>Current HI</span><input inputMode="decimal" value={currentIndex} disabled={!selectedSource.identityId} onChange={(event) => setCurrentIndex(event.target.value)} placeholder="12.2 or +0.8" /></label>
        <label><span>Low HI</span><input inputMode="decimal" value={lowIndex} disabled={!selectedSource.identityId} onChange={(event) => setLowIndex(event.target.value)} placeholder="10.8 or +1.0" /></label>
        <label><span>Low HI date</span><input type="date" value={lowIndexDate} disabled={!selectedSource.identityId} onChange={(event) => setLowIndexDate(event.target.value)} /></label>
        <button type="button" disabled={sourceBusy || !selectedSource.identityId || !currentIndex.trim() || !lowIndex.trim() || !lowIndexDate} onClick={saveManualSource}>Record manual source evidence</button>
      </form> : <p className={styles.sourceHint}>Choose a Player to manage the private GHIN identity or append manual source evidence.</p>}
    </section>

    <div className={styles.controls}>
      <label htmlFor="weekly-handicap-effective-date"><span>Effective date</span><input id="weekly-handicap-effective-date" type="date" value={effectiveDate} disabled={editorLocked} onChange={(event) => { setEffectiveDate(event.target.value); invalidateReview(); }} /></label>
      <div className={styles.bulkEditor}><label htmlFor="weekly-handicap-bulk"><span>Bulk paste</span><small>One Player ID and handicap per line; tab or comma separated.</small></label>
        <textarea id="weekly-handicap-bulk" value={bulkValue} disabled={editorLocked} onChange={(event) => { setBulkValue(event.target.value); setBulkErrors([]); }} placeholder={"Player ID\tHandicap\nCB01\t8.4"} />
        <button type="button" disabled={!bulkValue.trim() || editorLocked} onClick={applyBulkPaste}>Apply pasted values</button>
      </div>
      {bulkErrors.length ? <ul className={styles.validation} role="alert">{bulkErrors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
    </div>

    <div className={styles.summary} aria-label="Weekly handicap change summary">
      <article><small>Roster</small><strong>{summary.playerCount}</strong></article>
      <article data-attention={summary.changedPlayerCount ? "true" : undefined}><small>Changed</small><strong>{summary.changedPlayerCount}</strong></article>
      <article><small>Unchanged</small><strong>{summary.unchangedPlayerCount}</strong></article>
      <article data-error={summary.invalidPlayerCount ? "true" : undefined}><small>Invalid</small><strong>{summary.invalidPlayerCount}</strong></article>
      <article data-attention={summary.affectedMatchCount ? "true" : undefined}><small>Affected matches</small><strong>{summary.affectedMatchCount}</strong></article>
    </div>

    {summary.affectedMatchCount ? <p className={styles.safeguard}><strong>{summary.refreshableMatchCount} unstarted match{summary.refreshableMatchCount === 1 ? " is" : "es are"} eligible for snapshot refresh; {summary.frozenMatchCount} started/frozen match{summary.frozenMatchCount === 1 ? " keeps" : "es keep"} its existing scoring values.</strong> Review the server-validated impact plan before approval.</p> : null}

    <div className={styles.tableRegion} role="region" aria-label="Weekly handicap player editor" tabIndex="0">
      <table><thead><tr><th>Player</th><th>Current</th><th>Proposed</th><th>Change</th><th>Affected match</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.playerId} data-changed={row.changed ? "true" : undefined} data-invalid={row.error ? "true" : undefined}>
          <th scope="row"><strong>{row.displayName}</strong><span>{row.playerId}{row.teamName ? ` · ${row.teamName}` : ""}</span></th>
          <td data-label="Current"><strong>{handicapLabel(row.currentHandicapDecimal, row.currentHandicap)}</strong></td>
          <td data-label="Proposed"><label htmlFor={`weekly-handicap-${row.playerId}`} className={styles.srOnly}>Proposed handicap for {row.displayName}</label><input id={`weekly-handicap-${row.playerId}`} inputMode="decimal" value={row.proposedInput} disabled={editorLocked} aria-invalid={row.error ? "true" : undefined} aria-describedby={row.error ? `weekly-handicap-error-${row.playerId}` : undefined} onChange={(event) => updateProposal(row.playerId, event.target.value)} />{row.error ? <small id={`weekly-handicap-error-${row.playerId}`} className={styles.inlineError}>{row.error}</small> : null}</td>
          <td data-label="Change"><strong data-change={row.changed ? "true" : undefined}>{row.changed ? changeLabel(row.change) : "No change"}</strong></td>
          <td data-label="Affected match"><div className={styles.matchList}>{row.affectedMatches.length ? row.affectedMatches.map((match) => <span key={match.matchId} data-frozen={match.frozen || match.started || !match.safeToRefresh ? "true" : undefined}>{matchLabel(match)}<small>{match.frozen || match.started || !match.safeToRefresh ? `${match.status} · frozen` : `${match.status} · refresh`}</small></span>) : <em>None scheduled</em>}</div></td>
        </tr>)}</tbody>
      </table>
    </div>

    {serverIssues.length ? <div className={styles.serverIssues} role="alert"><strong>Validation issues</strong><ul>{serverIssues.map((issue, index) => <li key={`${validationIssueText(issue)}-${index}`}>{validationIssueText(issue)}</li>)}</ul></div> : null}

    {review ? <section className={styles.review} aria-labelledby="weekly-handicap-review-title">
      <header><span>Final confirmation</span><h3 id="weekly-handicap-review-title">Review revision before approval</h3><p>Server validation passed for revision {review.revisionId}.</p></header>
      <dl><div><dt>Effective</dt><dd>{review.effectiveDate}</dd></div><div><dt>Players changed</dt><dd>{review.summary.changedPlayerCount}</dd></div><div><dt>Affected matches</dt><dd>{review.summary.affectedMatchCount}</dd></div></dl>
      <ul>{review.changedRows.map((row) => <li key={row.playerId}><strong>{row.displayName}</strong><span>{handicapLabel(row.currentHandicapDecimal, row.currentHandicap)} → {handicapLabel(row.proposedDecimal, row.proposedHandicap)}</span><small>{row.affectedMatches.length ? row.affectedMatches.map(matchLabel).join(" · ") : "No scheduled match affected"}</small></li>)}</ul>
      <label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed every changed player, the effective date, and all affected matches.</span></label>
      <div className={styles.reviewActions}><button type="button" disabled={phase === "approving"} onClick={() => { setReview(null); setStagedRevision(null); setConfirmed(false); setPhase("editing"); }}>Back to edit</button><button type="button" disabled={!confirmed || phase === "approving"} onClick={approve}>{phase === "approving" ? "Approving…" : "Approve weekly revision"}</button></div>
    </section> : <div className={styles.stageActions}><button className={styles.reviewButton} type="button" disabled={["staging", "validating", "approving"].includes(phase)} onClick={() => stageAndValidate()}>{phase === "staging" ? "Staging…" : phase === "validating" ? "Validating…" : stagedRevision ? "Retry server validation" : "Stage & review changes"}</button><button type="button" disabled={!data.sourceEvidence.complete || ["staging", "validating", "approving"].includes(phase)} onClick={() => stageAndValidate({ fromHybrid: true })}>Create Handicap Draft from Hybrid</button></div>}

    {message ? <p className={styles.message} data-error={phase === "failure" ? "true" : undefined} role={phase === "failure" ? "alert" : "status"}>{message}</p> : null}

    {latestReceipt ? <section className={styles.receipt} aria-labelledby="weekly-handicap-receipt-title"><header><span>Authoritative receipt</span><h3 id="weekly-handicap-receipt-title">Weekly revision recorded</h3></header><dl><div><dt>Status</dt><dd>{latestReceipt.status}</dd></div><div><dt>Approved</dt><dd>{timestamp(latestReceipt.approvedAt)}</dd></div><div><dt>Receipt</dt><dd>{shortToken(latestReceipt.receiptId)}</dd></div><div><dt>Payload</dt><dd>{shortToken(latestReceipt.payloadHash)}</dd></div></dl></section> : null}

    <details className={styles.history}><summary>Revision history <span>{data.history.length}</span></summary>{data.history.length ? <ol>{data.history.map((entry) => <li key={entry.revisionId || `${entry.revision}-${entry.stagedAt}`}><div><strong>Revision {entry.revision ?? "—"} · {entry.status}</strong><span>Effective {entry.effectiveDate || "not recorded"}</span></div><div><span>{entry.changedPlayerCount} players · {entry.affectedMatchCount} matches</span><small>{entry.actorDisplay || "Recorded Director"} · {timestamp(entry.approvedAt || entry.stagedAt)}</small></div><code title={entry.receipt.receiptId || entry.receipt.payloadHash}>{shortToken(entry.receipt.receiptId || entry.receipt.payloadHash)}</code></li>)}</ol> : <p>No weekly handicap revisions have been recorded.</p>}</details>
  </section>;
}
