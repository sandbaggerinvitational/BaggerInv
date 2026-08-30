"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClientMutationOperationIdentityRegistry } from "../../../lib/client-mutation-operation-identity.js";
import { directorFetch } from "../../../lib/director-client-transaction.js";
import {
  PRODUCTION_PLAYER_ACCESS_FILTERS,
  PRODUCTION_DIRECTOR_PLAYERS_ACCESS_CONTRACT,
  filterProductionPlayerAccessPlayers,
  normalizeProductionPlayerAccessPayload,
  parseProductionPlayerAccessBulk,
  productionPlayerAccessActionAvailable,
  productionPlayerAccessFilterCounts,
  productionPlayerAccessMaskedDraft,
  productionPlayerAccessStatusLabel,
} from "../../../lib/production-director-players-access.js";
import styles from "./ProductionPlayersAccessPanel.module.css";

const ENDPOINT = "/api/director/players-access";

function timestamp(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString([], {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }) : "Not recorded";
}

function stateTone(value) {
  const state = String(value || "").toUpperCase();
  if (["ACTIVE", "ENROLLED", "LINKED", "VERIFIED", "ELIGIBLE"].includes(state)) return "ready";
  if (["INVALID_ENROLLMENT", "CONFLICT", "BLOCKED", "NEEDS_REVIEW", "UNAVAILABLE"].some((item) => state.includes(item))) return "attention";
  return "neutral";
}

function StateBadge({ value, children }) {
  return <span className={styles.badge} data-tone={stateTone(value)}>{children || productionPlayerAccessStatusLabel(value)}</span>;
}

function receiptFrom(payload = {}, action) {
  const value = payload.data || payload.result || payload;
  const receipt = value.receipt || value.auditReceipt || value.audit_receipt || {};
  const revision = Number(value.revision ?? value.currentRevision ?? value.current_revision);
  return {
    action,
    revision: Number.isSafeInteger(revision) ? revision : null,
    idempotent: value.idempotent === true,
    timestamp: String(receipt.timestamp || receipt.createdAt || receipt.created_at || value.updatedAt || value.updated_at || ""),
  };
}

function actionTitle(action) {
  return ({
    "approve-email": "Approve Email",
    "approve-phone": "Approve Mobile",
    "revoke-phone": "Revoke Mobile",
    "set-login-preference": "Set Login Preference",
    "suspend-access": "Suspend Participant Access",
    "resume-access": "Resume Participant Access",
    "bulk-enroll": "Approve Participant Identifiers",
  })[action] || "Update Participant Access";
}

function DetailValue({ label, value, status }) {
  return <div className={styles.detailValue}><dt>{label}</dt><dd>{value || "Not configured"}{status ? <StateBadge value={status} /> : null}</dd></div>;
}

export default function ProductionPlayersAccessPanel({ onOperation }) {
  const [data, setData] = useState(null);
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [loginDraft, setLoginDraft] = useState("EMAIL_PRIMARY");
  const [bulkDraft, setBulkDraft] = useState("");
  const [bulkErrors, setBulkErrors] = useState([]);
  const [review, setReview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const operationIdentities = useRef(null);

  const identityRegistry = useCallback(() => {
    if (!operationIdentities.current) {
      operationIdentities.current = createClientMutationOperationIdentityRegistry();
    }
    return operationIdentities.current;
  }, []);

  const load = useCallback(async ({ background = false } = {}) => {
    if (!background) { setPhase("loading"); setMessage(""); }
    const response = await fetch(ENDPOINT, { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true || !payload.data ||
        payload.data.contractVersion !== PRODUCTION_DIRECTOR_PLAYERS_ACCESS_CONTRACT ||
        !Number.isSafeInteger(Number(payload.data.revision)) || Number(payload.data.revision) < 0 ||
        !Array.isArray(payload.data.players)) {
      throw new Error(payload.error || `Players & Access is unavailable (${response.status}).`);
    }
    const normalized = normalizeProductionPlayerAccessPayload(payload);
    setData(normalized);
    setSelectedPlayerId((current) => normalized.players.some((player) => player.playerId === current)
      ? current : normalized.players[0]?.playerId || "");
    setPhase("ready");
    return normalized;
  }, []);

  const handleLoadFailure = useCallback((error) => {
    setMessage(error instanceof Error ? error.message : "Players & Access is unavailable.");
    setPhase("failure");
  }, []);

  useEffect(() => {
    load().catch(handleLoadFailure);
  }, [handleLoadFailure, load]);

  const players = data?.players || [];
  const counts = useMemo(() => productionPlayerAccessFilterCounts(players), [players]);
  const visiblePlayers = useMemo(
    () => filterProductionPlayerAccessPlayers(players, { filter, search }),
    [players, filter, search],
  );
  const selected = players.find((player) => player.playerId === selectedPlayerId) || null;
  const editorLocked = phase === "review" || phase === "submitting";

  useEffect(() => {
    setEmailDraft("");
    setPhoneDraft("");
    setLoginDraft(selected?.preferredLoginMethod || "EMAIL_PRIMARY");
    setReview(null);
    setConfirmed(false);
  }, [selected?.playerId, selected?.preferredLoginMethod]);

  const can = useCallback((action, player = selected) =>
    productionPlayerAccessActionAvailable(data?.capabilities || {}, action, player), [data?.capabilities, selected]);

  const openReview = useCallback((action, input, display, rows = []) => {
    setReview({ action, input, display, rows });
    setConfirmed(false);
    setMessage("");
    setPhase("review");
  }, []);

  const reviewEmail = () => {
    if (!selected || !can("approve-email")) return;
    const masked = productionPlayerAccessMaskedDraft({ email: emailDraft });
    if (!masked.normalizedEmail || masked.emailError) {
      setMessage("Enter a valid, non-placeholder participant email before review.");
      return;
    }
    openReview("approve-email", { playerId: selected.playerId, email: masked.normalizedEmail }, {
      player: `${selected.displayName} · ${selected.playerId}`,
      change: `Approve ${masked.email}`,
      consequence: "This email becomes eligible for the participant login flow after the server confirms the update.",
    });
  };

  const reviewPhone = () => {
    if (!selected || !can("approve-phone")) return;
    const masked = productionPlayerAccessMaskedDraft({ phone: phoneDraft });
    if (!masked.normalizedPhone || masked.phoneError) {
      setMessage("Enter a valid mobile number before review.");
      return;
    }
    openReview("approve-phone", { playerId: selected.playerId, phone: masked.normalizedPhone }, {
      player: `${selected.displayName} · ${selected.playerId}`,
      change: `Approve ${masked.phone}`,
      consequence: "This records an approved but unverified mobile number. It does not verify ownership, enable SMS, or create an Auth user.",
    });
  };

  const reviewPhoneRevocation = () => {
    if (!selected || !can("revoke-phone")) return;
    openReview("revoke-phone", { playerId: selected.playerId }, {
      player: `${selected.displayName} · ${selected.playerId}`,
      change: `Revoke ${selected.maskedPhone || "configured mobile access"}`,
      consequence: "Mobile login eligibility is removed; the participant's global player record is preserved.",
    });
  };

  const reviewLoginPreference = () => {
    if (!selected || !can("set-login-preference")) return;
    openReview("set-login-preference", {
      playerId: selected.playerId,
      preferredLoginMethod: loginDraft,
    }, {
      player: `${selected.displayName} · ${selected.playerId}`,
      change: `Preferred login: ${productionPlayerAccessStatusLabel(loginDraft)}`,
      consequence: "The server will still require an approved identifier and will determine the effective login method.",
    });
  };

  const reviewParticipantAccess = (action) => {
    if (!selected || !can(action)) return;
    openReview(action, { playerId: selected.playerId }, {
      player: `${selected.displayName} · ${selected.playerId}`,
      change: action === "suspend-access" ? "Suspend participant login and scoring access" : "Resume participant login and scoring access",
      consequence: action === "suspend-access"
        ? "Participant access is suspended after server validation. The global player record, approved identifiers, and tournament membership are preserved."
        : "Participant access resumes only if the server revalidates current enrollment, membership, and approved identity state.",
    });
  };

  const reviewBulk = () => {
    const parsed = parseProductionPlayerAccessBulk(bulkDraft, players);
    setBulkErrors(parsed.errors);
    if (!parsed.valid) {
      setMessage(parsed.errors.length
        ? "Correct every bulk enrollment issue before review. Nothing has been submitted."
        : "Enter at least one participant enrollment before review.");
      return;
    }
    if (!can("bulk-enroll", null)) {
      setMessage("Bulk enrollment is not currently available for this Production state.");
      return;
    }
    openReview("bulk-enroll", { entries: parsed.entries }, {
      player: `${parsed.summary.playerCount} participant${parsed.summary.playerCount === 1 ? "" : "s"}`,
      change: `${parsed.summary.emailCount} email · ${parsed.summary.phoneCount} mobile`,
      consequence: "The complete batch is validated and committed atomically. Any conflict rejects the entire batch.",
    }, parsed.review);
  };

  const commitReview = async () => {
    if (!review || !confirmed || !data || phase === "submitting") return;
    const intent = { endpoint: ENDPOINT, action: review.action, expectedRevision: data.revision, ...review.input };
    const operation = identityRegistry().acquire(intent);
    setPhase("submitting");
    setMessage("");
    let serverConfirmed = false;
    try {
      const response = await directorFetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: review.action,
          expectedRevision: data.revision,
          operationRequestId: operation.operationRequestId,
          ...review.input,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true || payload.data?.ok !== true ||
          !Number.isSafeInteger(Number(payload.data?.revision)) || Number(payload.data.revision) < 0) {
        throw new Error(payload.error || `${actionTitle(review.action)} failed (${response.status}).`);
      }
      identityRegistry().confirm(operation);
      serverConfirmed = true;
      const nextReceipt = receiptFrom(payload, review.action);
      setReceipt(nextReceipt);
      const completedAction = review.action;
      setReview(null);
      setConfirmed(false);
      await load({ background: true });
      setEmailDraft(""); setPhoneDraft("");
      if (completedAction === "bulk-enroll") setBulkDraft("");
      setBulkErrors([]);
      setPhase("ready");
      setMessage(`${actionTitle(completedAction)} completed and authoritative state was refreshed.`);
      onOperation?.({ label: actionTitle(completedAction), status: "success" });
    } catch (error) {
      if (serverConfirmed) {
        setReview(null);
        setConfirmed(false);
        setPhase("ready");
        setMessage(`${actionTitle(review.action)} was confirmed, but refreshed directory state is temporarily unavailable. Refresh before making another change.`);
        onOperation?.({ label: actionTitle(review.action), status: "success" });
        return;
      }
      setPhase("review");
      setMessage(error instanceof Error ? error.message : "Participant access update failed.");
      onOperation?.({ label: actionTitle(review.action), status: "failed" });
    }
  };

  if (!data) return <section className={styles.panel} aria-labelledby="players-access-title">
    <header><span>People & access</span><h2 id="players-access-title">Players & Access</h2></header>
    <div className={styles.loadState} role={phase === "failure" ? "alert" : "status"}>
      <strong>{phase === "failure" ? "Players & Access is unavailable" : "Loading participant access…"}</strong>
      {message ? <span>{message}</span> : null}
      {phase === "failure" ? <button type="button" onClick={() => load().catch(handleLoadFailure)}>Retry</button> : null}
    </div>
  </section>;

  return <section className={styles.panel} aria-labelledby="players-access-title">
    <header className={styles.heading}>
      <div><span>People & access</span><h2 id="players-access-title">Players & Access</h2>
        <p>Review tournament membership and approved participant login methods. Stored identifiers remain masked.</p></div>
      <div><small>Directory revision</small><strong>{data.revision}</strong><span>{data.contractVersion || "Production contract"}</span></div>
    </header>

    <div className={styles.summary} aria-label="Participant access summary">
      <article><small>Directory</small><strong>{data.summary.total}</strong></article>
      <article><small>2026 Roster</small><strong>{data.summary.roster}</strong></article>
      <article><small>Enrolled</small><strong>{data.summary.enrolled}</strong></article>
      <article><small>Not Enrolled</small><strong>{data.summary.notEnrolled}</strong></article>
      <article data-attention={data.summary.needsAttention ? "true" : undefined}><small>Needs Attention</small><strong>{data.summary.needsAttention}</strong></article>
    </div>

    <div className={styles.directoryControls}>
      <label htmlFor="players-access-search"><span>Search players</span><input id="players-access-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, Player ID, team, or masked identifier" /></label>
      <div className={styles.filters} aria-label="Player directory filters">{PRODUCTION_PLAYER_ACCESS_FILTERS.map((item) =>
        <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{counts[item.id] || 0}</span></button>)}</div>
    </div>

    <div className={styles.workspace}>
      <section className={styles.directory} aria-label="Player directory">
        <header><strong>{visiblePlayers.length} player{visiblePlayers.length === 1 ? "" : "s"}</strong><span>Choose a player to review access.</span></header>
        {visiblePlayers.length ? <ul>{visiblePlayers.map((player) => <li key={player.playerId}>
          <button type="button" disabled={editorLocked} aria-current={selected?.playerId === player.playerId ? "true" : undefined} onClick={() => setSelectedPlayerId(player.playerId)}>
            <span className={styles.avatar} aria-hidden="true">{player.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>
            <span><strong>{player.displayName}</strong><small>{player.playerId}{player.membership.teamName || player.membership.teamId ? ` · ${player.membership.teamName || player.membership.teamId}` : ""}</small><small className={styles.directoryContacts}>{player.maskedEmail || "No email"} · {player.maskedPhone || "No mobile"}</small><small>Preferred: {productionPlayerAccessStatusLabel(player.preferredLoginMethod)}</small></span>
            <span className={styles.directoryStates}><StateBadge value={player.enrollmentState} /><StateBadge value={player.authLinkState} />{player.participantAccessState !== player.enrollmentState ? <StateBadge value={player.participantAccessState} /> : null}{["ACTIVE", "DIRECTOR", "OWNER"].includes(player.directorStatus) ? <StateBadge value={player.directorStatus}>Director</StateBadge> : null}{player.needsAttention ? <StateBadge value="NEEDS_REVIEW">Review</StateBadge> : null}</span>
          </button>
        </li>)}</ul> : <p className={styles.empty}>No players match this search and filter.</p>}
      </section>

      <section className={styles.detail} aria-label="Player access details">
        {selected ? <>
          <header className={styles.playerHeading}><div><span>{selected.playerId}</span><h3>{selected.displayName}</h3><p>{selected.membership.teamName || selected.membership.teamId || "No current team"}</p></div><StateBadge value={selected.participantAccessState} /></header>
          {selected.needsAttention ? <p className={styles.warning}><strong>Review needed.</strong> One or more identity or membership checks require Director attention.</p> : null}
          <dl className={styles.detailGrid}>
            <DetailValue label="Global Player" value={productionPlayerAccessStatusLabel(selected.globalStatus)} status={selected.globalStatus} />
            <DetailValue label="Tournament membership" value={productionPlayerAccessStatusLabel(selected.membership.status)} status={selected.membership.status} />
            <DetailValue label="Team" value={selected.membership.teamName || selected.membership.teamId} />
            <DetailValue label="Enrollment" value={productionPlayerAccessStatusLabel(selected.enrollmentState)} status={selected.enrollmentState} />
            <DetailValue label="Approved email" value={selected.maskedEmail} status={selected.emailStatus} />
            <DetailValue label="Approved mobile" value={selected.maskedPhone} status={selected.phoneStatus} />
            <DetailValue label="Preferred login" value={productionPlayerAccessStatusLabel(selected.preferredLoginMethod)} />
            <DetailValue label="Effective login" value={productionPlayerAccessStatusLabel(selected.effectiveLoginMethod)} status={selected.authLinkState} />
            <DetailValue label="Auth link" value={productionPlayerAccessStatusLabel(selected.authLinkState)} status={selected.authLinkState} />
            <DetailValue label="Participant access" value={productionPlayerAccessStatusLabel(selected.participantAccessState)} status={selected.participantAccessState} />
            <DetailValue label="Tournament roles" value={selected.roles.length ? selected.roles.map(productionPlayerAccessStatusLabel).join(", ") : "None"} />
            <DetailValue label="Director access" value={productionPlayerAccessStatusLabel(selected.directorStatus)} status={selected.directorStatus} />
          </dl>

          <div className={styles.actionGrid}>
            <article><header><strong>Email access</strong><span>{selected.maskedEmail || "No approved email"}</span></header>
              {can("approve-email") ? <><label htmlFor="players-access-email"><span>New approved email</span><input id="players-access-email" type="email" autoComplete="off" value={emailDraft} disabled={editorLocked} onChange={(event) => setEmailDraft(event.target.value)} /></label><button type="button" disabled={editorLocked} onClick={reviewEmail}>Review Email</button></> : <p>Read only in the current Production state.</p>}
            </article>
            <article><header><strong>Mobile access</strong><span>{selected.maskedPhone || "No approved mobile"}</span></header>
              {can("approve-phone") ? <><label htmlFor="players-access-phone"><span>New approved mobile</span><input id="players-access-phone" type="tel" autoComplete="off" value={phoneDraft} disabled={editorLocked} onChange={(event) => setPhoneDraft(event.target.value)} /></label><button type="button" disabled={editorLocked} onClick={reviewPhone}>Review Mobile</button></> : null}
              {can("revoke-phone") && selected.maskedPhone ? <button className={styles.secondaryButton} type="button" disabled={editorLocked} onClick={reviewPhoneRevocation}>Review Mobile Revocation</button> : null}
              {!can("approve-phone") && !can("revoke-phone") ? <p>Read only in the current Production state.</p> : null}
            </article>
            <article><header><strong>Login preference</strong><span>Effective: {productionPlayerAccessStatusLabel(selected.effectiveLoginMethod)}</span></header>
              {can("set-login-preference") ? <><label htmlFor="players-access-login"><span>Preferred method</span><select id="players-access-login" value={loginDraft} disabled={editorLocked} onChange={(event) => setLoginDraft(event.target.value)}><option value="EMAIL_PRIMARY">Email Primary</option><option value="PHONE_PRIMARY" disabled={selected.phoneStatus !== "VERIFIED"}>Mobile Primary</option></select></label>{selected.phoneStatus !== "VERIFIED" ? <p>Mobile Primary becomes available only after a later certified SMS verification flow verifies the approved number.</p> : null}<button type="button" disabled={editorLocked || loginDraft === selected.preferredLoginMethod} onClick={reviewLoginPreference}>Review Preference</button></> : <p>Read only in the current Production state.</p>}
            </article>
            <article><header><strong>Participant access</strong><span>{productionPlayerAccessStatusLabel(selected.participantAccessState)}</span></header>
              {can("suspend-access") ? <button type="button" disabled={editorLocked} onClick={() => reviewParticipantAccess("suspend-access")}>Review Access Suspension</button> : null}
              {can("resume-access") ? <button type="button" disabled={editorLocked} onClick={() => reviewParticipantAccess("resume-access")}>Review Access Resumption</button> : null}
              {!can("suspend-access") && !can("resume-access") ? <p>{["ACTIVE", "DIRECTOR", "OWNER"].includes(selected.directorStatus) ? "Director access must be reviewed separately before participant access can change." : "No participant access change is available for this state."}</p> : null}
            </article>
            <article><header><strong>2026 membership</strong><span>{productionPlayerAccessStatusLabel(selected.membership.status)}</span></header>
              <p>Tournament membership is read only in this phase. Activation and deactivation require a separate certified tournament-setup operation.</p>
            </article>
          </div>

          <div className={styles.deferredGrid}>
            <article><span>Coming Soon</span><strong>Global Player Creation</strong><p>Creating a new global player record is intentionally unavailable in this phase.</p></article>
            <article><span>Coming Soon</span><strong>Director Role Management</strong><p>Director grants and revocations remain read-only until their bounded Production operation is installed.</p></article>
          </div>
        </> : <p className={styles.empty}>Select a player to review membership and access.</p>}
      </section>
    </div>

    <section className={styles.bulk} aria-labelledby="players-access-bulk-title">
      <header><div><span>Atomic identifier approval</span><h3 id="players-access-bulk-title">Bulk Enroll</h3><p>Paste Player ID, email, and mobile. Every row needs at least one real identifier. Email approval enables controlled first login; a phone-only row remains approved but not enrolled until a later certified SMS verification milestone.</p></div><StateBadge value={can("bulk-enroll", null) ? "ACTIVE" : "UNAVAILABLE"}>{can("bulk-enroll", null) ? "Available" : "Read Only"}</StateBadge></header>
      <label htmlFor="players-access-bulk"><span>Player ID | Email | Phone</span><textarea id="players-access-bulk" value={bulkDraft} disabled={editorLocked || !can("bulk-enroll", null)} onChange={(event) => { setBulkDraft(event.target.value); setBulkErrors([]); }} placeholder={"Player ID | Email | Phone\nCB02 | [approved email] | [approved mobile]"} /></label>
      {bulkErrors.length ? <ul className={styles.errors} role="alert">{bulkErrors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
      <button type="button" disabled={editorLocked || !can("bulk-enroll", null) || !bulkDraft.trim()} onClick={reviewBulk}>Review Atomic Enrollment</button>
    </section>

    {review ? <section className={styles.review} aria-labelledby="players-access-review-title">
      <header><span>Review before commit</span><h3 id="players-access-review-title">{actionTitle(review.action)}</h3><p>No Production change has been made.</p></header>
      <dl><div><dt>Target</dt><dd>{review.display.player}</dd></div><div><dt>Requested change</dt><dd>{review.display.change}</dd></div><div><dt>Expected revision</dt><dd>{data.revision}</dd></div></dl>
      {review.rows.length ? <div className={styles.reviewTable} role="region" aria-label="Bulk enrollment review" tabIndex="0"><table><thead><tr><th>Player</th><th>Email</th><th>Mobile</th></tr></thead><tbody>{review.rows.map((row) => <tr key={row.playerId}><th scope="row"><strong>{row.displayName}</strong><span>{row.playerId}</span></th><td>{row.maskedEmail}</td><td>{row.maskedPhone}</td></tr>)}</tbody></table></div> : null}
      <p className={styles.consequence}>{review.display.consequence}</p>
      <label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the masked identifiers, target players, and effect of this Production update.</span></label>
      <div className={styles.reviewActions}><button type="button" className={styles.secondaryButton} disabled={phase === "submitting"} onClick={() => { setReview(null); setConfirmed(false); setPhase("ready"); }}>Return to Editing</button><button type="button" disabled={!confirmed || phase === "submitting"} onClick={commitReview}>{phase === "submitting" ? "Confirming…" : `Confirm ${actionTitle(review.action)}`}</button></div>
    </section> : null}

    {message ? <p className={styles.message} data-error={phase === "failure" || phase === "review" ? "true" : undefined} role={phase === "failure" ? "alert" : "status"}>{message}</p> : null}
    {receipt ? <p className={styles.receipt}><strong>{actionTitle(receipt.action)} confirmed</strong><span>{receipt.revision !== null ? `Directory revision ${receipt.revision}` : "Authoritative server response received"}{receipt.idempotent ? " · safe retry" : ""}{receipt.timestamp ? ` · ${timestamp(receipt.timestamp)}` : ""}</span></p> : null}

    <details className={styles.audit}><summary>Recent access activity <span>{data.audit.length}</span></summary>{data.audit.length ? <ol>{data.audit.map((item, index) => <li key={item.id || `${item.action}-${index}`}><div><strong>{productionPlayerAccessStatusLabel(item.action)}</strong><span>{item.targetPlayerId || "Production access"}</span></div><small>{item.actorDisplayName || "Tournament Director"}<br />{timestamp(item.timestamp)}</small><StateBadge value={item.result} /></li>)}</ol> : <p>No recent access activity is available.</p>}</details>
  </section>;
}
