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
const GOVERNANCE_ACTIONS = new Set([
  "create-player",
  "set-global-status",
  "withdraw-membership",
  "reactivate-membership",
  "grant-director",
  "revoke-director",
]);
const EMPTY_PLAYER_DRAFT = Object.freeze({
  firstName: "",
  lastName: "",
  displayName: "",
  slug: "",
  globalStatus: "ACTIVE",
});

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
  const revision = Number(value.revision ?? value.governanceRevision ?? value.governance_revision ??
    value.currentRevision ?? value.current_revision);
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
    "create-player": "Create Global Player",
    "set-global-status": "Change Global Player Status",
    "withdraw-membership": "Withdraw Tournament Membership",
    "reactivate-membership": "Reactivate Tournament Membership",
    "grant-director": "Grant Director Access",
    "revoke-director": "Revoke Director Access",
  })[action] || "Update Participant Access";
}

function booleanValue(...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null);
  return value === true || /^(?:1|true|yes|on|enabled)$/i.test(String(value ?? "").trim());
}

function textList(...values) {
  const source = values.find((candidate) => Array.isArray(candidate));
  return (source || []).map((item) => {
    if (typeof item === "string") return item.trim();
    return String(item?.message || item?.label || item?.reason || item?.code || "").trim();
  }).filter(Boolean);
}

function membershipReadiness(player) {
  const membership = player?.membership || {};
  const readiness = membership.readiness || membership.readinessProjection || membership.readiness_projection || {};
  const summary = typeof readiness === "string"
    ? readiness
    : String(readiness.summary || readiness.message || readiness.label || membership.readinessMessage || "").trim();
  const blockers = textList(
    membership.blockers,
    readiness.blockers,
    readiness.items,
  );
  if (!blockers.length && membership.blocker) blockers.push(productionPlayerAccessStatusLabel(membership.blocker));
  return { summary, blockers };
}

function validatePlayerDraft(draft) {
  const firstName = String(draft.firstName || "").trim();
  const lastName = String(draft.lastName || "").trim();
  const displayName = String(draft.displayName || "").trim() || `${firstName} ${lastName}`.trim();
  const slug = String(draft.slug || "").trim().toLowerCase();
  const globalStatus = String(draft.globalStatus || "ACTIVE").trim().toUpperCase();
  const errors = [];
  if (!firstName) errors.push("First name is required.");
  if (!lastName) errors.push("Last name is required.");
  if (!displayName) errors.push("Display name is required.");
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errors.push("Profile slug may contain lowercase letters, numbers, and single hyphens only.");
  }
  if (!["ACTIVE", "ALUMNI"].includes(globalStatus)) errors.push("Choose Active or Alumni.");
  return { errors, value: { firstName, lastName, displayName, slug, globalStatus } };
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
  const [globalStatusDraft, setGlobalStatusDraft] = useState("ACTIVE");
  const [membershipReason, setMembershipReason] = useState("");
  const [directorReason, setDirectorReason] = useState("");
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [addPlayerStep, setAddPlayerStep] = useState("details");
  const [addPlayerDraft, setAddPlayerDraft] = useState(() => ({ ...EMPTY_PLAYER_DRAFT }));
  const [addPlayerErrors, setAddPlayerErrors] = useState([]);
  const [createdPlayer, setCreatedPlayer] = useState(null);
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
  const actorIsOwner = booleanValue(data?.actor?.owner, data?.actor?.isOwner, data?.actor?.is_owner);
  const ownerAdoptionRequired = booleanValue(
    data?.actor?.ownerAdoptionRequired,
    data?.actor?.owner_adoption_required,
    data?.ownerAdoptionRequired,
    data?.owner_adoption_required,
  );
  const governanceRevision = Number.isSafeInteger(Number(data?.governanceRevision))
    ? Number(data.governanceRevision)
    : Number(data?.revision || 0);
  const selectedReadiness = membershipReadiness(selected);

  useEffect(() => {
    setEmailDraft("");
    setPhoneDraft("");
    setLoginDraft(selected?.preferredLoginMethod || "EMAIL_PRIMARY");
    setGlobalStatusDraft(selected?.globalStatus || "ACTIVE");
    setMembershipReason("");
    setDirectorReason("");
    setReview(null);
    setConfirmed(false);
  }, [selected?.globalStatus, selected?.playerId, selected?.preferredLoginMethod]);

  const can = useCallback((action, player = selected) =>
    productionPlayerAccessActionAvailable(data?.capabilities || {}, action, player), [data?.capabilities, selected]);

  const governanceCapability = useCallback((action) =>
    data?.capabilities?.[action] === true || can(action), [can, data?.capabilities]);
  const canWithdrawMembership = Boolean(selected) && governanceCapability("withdraw-membership") &&
    booleanValue(selected?.membership?.canWithdraw, selected?.membership?.can_withdraw);
  const canReactivateMembership = Boolean(selected) && governanceCapability("reactivate-membership") &&
    booleanValue(selected?.membership?.canReactivate, selected?.membership?.can_reactivate);
  const selectedGovernance = selected?.governance || selected?.directorGovernance || selected?.director_governance || {};
  const selectedIsOwner = selected?.directorStatus === "OWNER" || selectedGovernance.ownerStatus === "ACTIVE" ||
    selectedGovernance.owner_status === "ACTIVE";
  const selectedIsDirector = ["ACTIVE", "DIRECTOR", "OWNER"].includes(selected?.directorStatus) ||
    booleanValue(selectedGovernance.director, selectedGovernance.isDirector, selectedGovernance.is_director);
  const canGrantDirector = actorIsOwner && !ownerAdoptionRequired && !selectedIsDirector &&
    governanceCapability("grant-director") && selectedGovernance.canGrant !== false && selectedGovernance.can_grant !== false;
  const canRevokeDirector = actorIsOwner && !ownerAdoptionRequired && selectedIsDirector && !selectedIsOwner &&
    governanceCapability("revoke-director") && selectedGovernance.canRevoke !== false && selectedGovernance.can_revoke !== false;

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

  const resetAddPlayer = useCallback(() => {
    setAddPlayerDraft({ ...EMPTY_PLAYER_DRAFT });
    setAddPlayerErrors([]);
    setAddPlayerStep("details");
    setCreatedPlayer(null);
  }, []);

  const validateAddPlayer = () => {
    const validation = validatePlayerDraft(addPlayerDraft);
    setAddPlayerErrors(validation.errors);
    if (validation.errors.length) {
      setMessage("Correct the Player details before continuing. No Production change has been made.");
      return;
    }
    setAddPlayerDraft(validation.value);
    setAddPlayerStep("validate");
    setMessage("");
  };

  const reviewAddPlayer = () => {
    const validation = validatePlayerDraft(addPlayerDraft);
    if (validation.errors.length || !governanceCapability("create-player")) {
      setAddPlayerErrors(validation.errors);
      setMessage(validation.errors.length
        ? "Correct the Player details before continuing."
        : "Global Player creation is not available for the current Production state.");
      setAddPlayerStep("details");
      return;
    }
    setAddPlayerStep("review");
    openReview("create-player", validation.value, {
      player: validation.value.displayName,
      change: `Create an ${productionPlayerAccessStatusLabel(validation.value.globalStatus).toLowerCase()} global Player`,
      consequence: "The server allocates the stable Player ID transactionally. This does not add tournament membership, a team, a handicap, login identifiers, Auth access, scoring permission, or Director access.",
    });
  };

  const reviewGlobalStatus = () => {
    if (!selected || !governanceCapability("set-global-status") || !booleanValue(selected.canSetGlobalStatus)) return;
    if (globalStatusDraft === "ALUMNI" && selected.membership.exists && selected.membership.status === "ACTIVE") {
      setMessage("Withdraw the Player from the active tournament before changing the global Player status to Alumni.");
      return;
    }
    openReview("set-global-status", {
      playerId: selected.playerId,
      globalStatus: globalStatusDraft,
      expectedProfileRevision: Number(selected.profile?.revision || 0),
    }, {
      player: `${selected.displayName} · ${selected.playerId}`,
      change: `Global Player status: ${productionPlayerAccessStatusLabel(globalStatusDraft)}`,
      consequence: "This changes only the global Player status. Stable identity, Auth linking, tournament history, scorecards, records, and audit history remain intact.",
    });
  };

  const reviewMembership = (action) => {
    const reason = membershipReason.trim();
    if (!selected || !reason || !governanceCapability(action)) {
      if (!reason) setMessage("Enter a reason before reviewing the membership change.");
      return;
    }
    const withdrawing = action === "withdraw-membership";
    openReview(action, {
      playerId: selected.playerId,
      reason,
      expectedMembershipRevision: Number(selected.membership.revision || 0),
    }, {
      player: `${selected.displayName} · ${selected.playerId}`,
      change: withdrawing ? "Withdraw from the active tournament" : "Reactivate tournament membership",
      consequence: withdrawing
        ? "The server will fail closed for live, scored, finalized, snapshot, Net Skins, Calcutta, or published Odds dependencies. Unstarted pairings, Draft selections, and completed history are preserved and reported as readiness items; no competition facts are deleted or rewritten."
        : "The Player returns only to the supported tournament membership state. Team, handicap, pairings, login identifiers, Auth, and scoring permission are not assigned automatically.",
    });
  };

  const reviewDirector = (action) => {
    const reason = directorReason.trim();
    if (!selected || !actorIsOwner || ownerAdoptionRequired || !reason || !governanceCapability(action)) {
      if (!actorIsOwner || ownerAdoptionRequired) setMessage("Owner authorization is required for Director governance.");
      else if (!reason) setMessage("Enter a governance reason before review.");
      return;
    }
    const granting = action === "grant-director";
    openReview(action, { playerId: selected.playerId, reason, confirmed: true }, {
      player: `${selected.displayName} · ${selected.playerId}`,
      change: granting ? "Grant Production Tournament Director access" : "Revoke Production Tournament Director access",
      consequence: granting
        ? "This grants high-impact Production Director authorization only. It does not alter Player identity, scoring facts, team assignment, or participant access."
        : "This removes Production Director authorization only. The Player, Auth link, tournament membership, participant access, and immutable audit history are preserved. Final-administrator protections remain server enforced.",
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
    const governanceAction = GOVERNANCE_ACTIONS.has(review.action);
    const expectedRevision = governanceAction ? governanceRevision : data.revision;
    const intent = governanceAction
      ? { endpoint: ENDPOINT, action: review.action, expectedRevision: governanceRevision, ...review.input }
      : { endpoint: ENDPOINT, action: review.action, expectedRevision: data.revision, ...review.input };
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
          expectedRevision,
          operationRequestId: operation.operationRequestId,
          ...review.input,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const returnedRevision = Number(governanceAction
        ? payload.data?.governanceRevision ?? payload.data?.governance_revision ?? payload.data?.revision
        : payload.data?.revision);
      if (!response.ok || payload.ok !== true || payload.data?.ok !== true ||
          !Number.isSafeInteger(returnedRevision) || returnedRevision < 0) {
        throw new Error(payload.error || `${actionTitle(review.action)} failed (${response.status}).`);
      }
      identityRegistry().confirm(operation);
      serverConfirmed = true;
      const nextReceipt = receiptFrom(payload, review.action);
      setReceipt(nextReceipt);
      const completedAction = review.action;
      const responsePlayer = payload.data?.player || payload.data?.createdPlayer || payload.data?.created_player || {};
      const responsePlayerId = String(
        responsePlayer.playerId || responsePlayer.player_id || payload.data?.playerId || payload.data?.player_id || "",
      ).trim().toUpperCase();
      setReview(null);
      setConfirmed(false);
      const refreshed = await load({ background: true });
      setEmailDraft(""); setPhoneDraft("");
      if (completedAction === "bulk-enroll") setBulkDraft("");
      if (completedAction === "create-player") {
        const refreshedPlayer = refreshed.players.find((player) => player.playerId === responsePlayerId);
        setCreatedPlayer(refreshedPlayer || {
          playerId: responsePlayerId,
          displayName: addPlayerDraft.displayName,
          globalStatus: addPlayerDraft.globalStatus,
        });
        setAddPlayerStep("created");
        if (refreshedPlayer) setSelectedPlayerId(refreshedPlayer.playerId);
      }
      if (["withdraw-membership", "reactivate-membership"].includes(completedAction)) setMembershipReason("");
      if (["grant-director", "revoke-director"].includes(completedAction)) setDirectorReason("");
      setBulkErrors([]);
      setPhase("ready");
      setMessage(`${actionTitle(completedAction)} completed and authoritative state was refreshed.`);
      onOperation?.({ label: actionTitle(completedAction), status: "success" });
    } catch (error) {
      if (serverConfirmed) {
        if (review.action === "create-player") {
          setCreatedPlayer({
            playerId: "",
            displayName: addPlayerDraft.displayName,
            globalStatus: addPlayerDraft.globalStatus,
          });
          setAddPlayerStep("created");
        }
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
        <p>Manage permanent Player records, tournament participation, approved login methods, and bounded access governance. Stored identifiers remain masked.</p></div>
      <div><small>Directory revision</small><strong>{data.revision}</strong><span>Governance revision {governanceRevision}</span><button type="button" className={styles.addPlayerButton} disabled={editorLocked || !governanceCapability("create-player")} onClick={() => { if (!addPlayerOpen) resetAddPlayer(); setAddPlayerOpen((current) => !current); }}>{addPlayerOpen ? "Close Add Player" : "Add Player"}</button></div>
    </header>

    <div className={styles.summary} aria-label="Participant access summary">
      <article><small>Directory</small><strong>{data.summary.total}</strong></article>
      <article><small>2026 Roster</small><strong>{data.summary.roster}</strong></article>
      <article><small>Enrolled</small><strong>{data.summary.enrolled}</strong></article>
      <article><small>Not Enrolled</small><strong>{data.summary.notEnrolled}</strong></article>
      <article data-attention={data.summary.needsAttention ? "true" : undefined}><small>Needs Attention</small><strong>{data.summary.needsAttention}</strong></article>
    </div>

    {addPlayerOpen ? <section className={styles.addPlayer} aria-labelledby="add-player-title" aria-label="Global Player Creation">
      <header><div><span>Permanent Player record</span><h3 id="add-player-title">Add Player</h3><p>Create a reusable global Player first. Tournament membership, contact identifiers, Auth, team, handicap, scoring permission, and Director access remain separate actions.</p></div><StateBadge value={governanceCapability("create-player") ? "ACTIVE" : "UNAVAILABLE"}>{governanceCapability("create-player") ? "Available" : "Read Only"}</StateBadge></header>
      <ol className={styles.steps} aria-label="Add Player progress">
        {["details", "validate", "review", "created"].map((step, index) => <li key={step} data-current={addPlayerStep === step ? "true" : undefined} data-complete={["details", "validate", "review", "created"].indexOf(addPlayerStep) > index ? "true" : undefined}><span>{index + 1}</span>{step === "created" ? "Create" : productionPlayerAccessStatusLabel(step)}</li>)}
      </ol>
      {addPlayerStep === "details" ? <>
        <div className={styles.playerForm}>
          <label htmlFor="add-player-first-name"><span>First name</span><input id="add-player-first-name" autoComplete="off" value={addPlayerDraft.firstName} disabled={editorLocked} onChange={(event) => setAddPlayerDraft((current) => ({ ...current, firstName: event.target.value }))} /></label>
          <label htmlFor="add-player-last-name"><span>Last name</span><input id="add-player-last-name" autoComplete="off" value={addPlayerDraft.lastName} disabled={editorLocked} onChange={(event) => setAddPlayerDraft((current) => ({ ...current, lastName: event.target.value }))} /></label>
          <label htmlFor="add-player-display-name"><span>Display name</span><input id="add-player-display-name" autoComplete="off" value={addPlayerDraft.displayName} disabled={editorLocked} placeholder="Defaults to first and last name" onChange={(event) => setAddPlayerDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
          <label htmlFor="add-player-slug"><span>Profile slug (optional)</span><input id="add-player-slug" autoComplete="off" value={addPlayerDraft.slug} disabled={editorLocked} placeholder="Allocated safely if omitted" onChange={(event) => setAddPlayerDraft((current) => ({ ...current, slug: event.target.value }))} /></label>
          <label htmlFor="add-player-global-status"><span>Global Player status</span><select id="add-player-global-status" value={addPlayerDraft.globalStatus} disabled={editorLocked} onChange={(event) => setAddPlayerDraft((current) => ({ ...current, globalStatus: event.target.value }))}><option value="ACTIVE">Active</option><option value="ALUMNI">Alumni</option></select></label>
        </div>
        {addPlayerErrors.length ? <ul className={styles.errors} role="alert">{addPlayerErrors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
        <div className={styles.flowActions}><button type="button" className={styles.secondaryButton} onClick={() => { resetAddPlayer(); setAddPlayerOpen(false); }}>Cancel</button><button type="button" disabled={editorLocked || !governanceCapability("create-player")} onClick={validateAddPlayer}>Validate Player</button></div>
      </> : null}
      {addPlayerStep === "validate" ? <div className={styles.validationResult}><StateBadge value="ELIGIBLE">Validated</StateBadge><h4>{addPlayerDraft.displayName}</h4><dl><DetailValue label="First name" value={addPlayerDraft.firstName} /><DetailValue label="Last name" value={addPlayerDraft.lastName} /><DetailValue label="Profile slug" value={addPlayerDraft.slug || "Server allocated"} /><DetailValue label="Global status" value={productionPlayerAccessStatusLabel(addPlayerDraft.globalStatus)} status={addPlayerDraft.globalStatus} /></dl><p>Names and format passed client review. The Production operation remains authoritative for duplicate identity, Player ID allocation, and slug collision checks.</p><div className={styles.flowActions}><button type="button" className={styles.secondaryButton} onClick={() => setAddPlayerStep("details")}>Edit Details</button><button type="button" onClick={reviewAddPlayer}>Continue to Review</button></div></div> : null}
      {addPlayerStep === "review" ? <p className={styles.flowNotice}>Review the Production operation below. Nothing is created until the confirmed server response succeeds.</p> : null}
      {addPlayerStep === "created" ? <div className={styles.createdPlayer}><StateBadge value="ACTIVE">Created</StateBadge><h4>{createdPlayer?.displayName || addPlayerDraft.displayName}</h4><p>{createdPlayer?.playerId ? `Stable Player ID ${createdPlayer.playerId} was allocated by Production.` : "Production confirmed the new global Player record."}</p><div className={styles.nextActions}><article><strong>Add to Tournament</strong><span>Separate operation. Team assignment and competition readiness remain in Tournament Setup.</span></article><article><strong>Add Email or Mobile</strong><span>Select the Player and use the existing approved-identifier workflow. No Auth user is created manually.</span></article></div><div className={styles.flowActions}><button type="button" className={styles.secondaryButton} onClick={() => { resetAddPlayer(); setAddPlayerOpen(false); }}>Done</button><button type="button" onClick={resetAddPlayer}>Create Another Player</button></div></div> : null}
    </section> : null}

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
            <span className={styles.directoryStates}><StateBadge value={player.globalStatus} /><StateBadge value={player.membership.status} /><StateBadge value={player.enrollmentState} /><StateBadge value={player.authLinkState} />{player.participantAccessState !== player.enrollmentState ? <StateBadge value={player.participantAccessState} /> : null}{["ACTIVE", "DIRECTOR", "OWNER"].includes(player.directorStatus) ? <StateBadge value={player.directorStatus}>Director</StateBadge> : null}{player.needsAttention ? <StateBadge value="NEEDS_REVIEW">Review</StateBadge> : null}</span>
          </button>
        </li>)}</ul> : <p className={styles.empty}>No players match this search and filter.</p>}
      </section>

      <section className={styles.detail} aria-label="Player access details">
        {selected ? <>
          <header className={styles.playerHeading}><div><span>{selected.playerId}</span><h3>{selected.displayName}</h3><p>{selected.membership.teamName || selected.membership.teamId || "No current team"}</p></div><StateBadge value={selected.participantAccessState} /></header>
          {selected.needsAttention ? <p className={styles.warning}><strong>Review needed.</strong> One or more identity or membership checks require Director attention.</p> : null}
          <dl className={styles.detailGrid}>
            <DetailValue label="Global Player" value={productionPlayerAccessStatusLabel(selected.globalStatus)} status={selected.globalStatus} />
            <DetailValue label="Public profile" value={selected.profile?.slug ? `/${selected.profile.slug}` : "No profile slug"} />
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
            <article aria-label="Tournament membership is read only when no bounded status action is available"><header><strong>2026 membership</strong><span>{productionPlayerAccessStatusLabel(selected.membership.status)}</span></header>
              <p><strong>Team:</strong> {selected.membership.teamName || selected.membership.teamId || "Team Not Assigned"}</p>
              {selectedReadiness.summary ? <p className={styles.readinessSummary}>{selectedReadiness.summary}</p> : null}
              {selectedReadiness.blockers.length ? <ul className={styles.readinessList}>{selectedReadiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
              {!selected.membership.exists ? <><button type="button" disabled>Add to Tournament</button><p>Team assignment is intentionally managed in Tournament Setup. Add to Tournament is disabled here until that bounded operation can preserve team, handicap, pairing, and scoring readiness.</p></> : null}
              {canWithdrawMembership || canReactivateMembership ? <label htmlFor="players-access-membership-reason"><span>Reason</span><textarea id="players-access-membership-reason" className={styles.reasonInput} value={membershipReason} disabled={editorLocked} onChange={(event) => setMembershipReason(event.target.value)} placeholder="Required for the immutable audit record" /></label> : null}
              {canWithdrawMembership ? <button type="button" disabled={editorLocked || membershipReason.trim().length < 10} onClick={() => reviewMembership("withdraw-membership")}>Review Withdrawal</button> : null}
              {canReactivateMembership ? <button type="button" disabled={editorLocked || membershipReason.trim().length < 10} onClick={() => reviewMembership("reactivate-membership")}>Review Reactivation</button> : null}
              {selected.membership.exists && !canWithdrawMembership && !canReactivateMembership ? <p>No membership status change is available. Any competition dependency remains protected.</p> : null}
            </article>
            <article><header><strong>Global Player status</strong><span>{productionPlayerAccessStatusLabel(selected.globalStatus)}</span></header>
              {booleanValue(selected.canSetGlobalStatus) && governanceCapability("set-global-status") ? <><label htmlFor="players-access-global-status"><span>Permanent Player status</span><select id="players-access-global-status" value={globalStatusDraft} disabled={editorLocked} onChange={(event) => setGlobalStatusDraft(event.target.value)}><option value="ACTIVE">Active</option><option value="ALUMNI" disabled={selected.membership.exists && selected.membership.status === "ACTIVE"}>Alumni</option></select></label>{selected.membership.exists && selected.membership.status === "ACTIVE" ? <p className={styles.readinessSummary}>Withdraw tournament membership first before changing this global Player to Alumni.</p> : null}<p>This status is separate from 2026 membership. Alumni retain identity, appearances, career statistics, championships, records, scorecards, and Auth history.</p><button type="button" disabled={editorLocked || globalStatusDraft === selected.globalStatus || (globalStatusDraft === "ALUMNI" && selected.membership.exists && selected.membership.status === "ACTIVE")} onClick={reviewGlobalStatus}>Review Global Status</button></> : <p>Global status is read only for this Player in the current Production state.</p>}
            </article>
            <article className={styles.governanceCard} aria-label="Director Role Management"><header><strong>Director governance</strong><span>{selectedIsDirector ? "Tournament Director" : "Not a Director"}</span></header>
              {ownerAdoptionRequired ? <div className={styles.lockedNotice}><strong>Initial Owner adoption required</strong><p>Production has not yet adopted an Owner-level administrator. Director grants and revocations remain locked until the separate explicit, audited Owner adoption procedure is authorized and completed.</p></div> : null}
              {!ownerAdoptionRequired && !actorIsOwner ? <div className={styles.lockedNotice}><strong>Owner authorization required</strong><p>Ordinary Directors may review entitlement status but cannot grant or revoke Director access.</p></div> : null}
              {actorIsOwner && !ownerAdoptionRequired ? <><StateBadge value="ACTIVE">Owner-authorized session</StateBadge>{selectedIsOwner ? <p className={styles.readinessSummary}>The adopted Production Owner cannot be revoked here. This prevents final-owner lockout.</p> : null}<label htmlFor="players-access-director-reason"><span>Governance reason</span><textarea id="players-access-director-reason" className={styles.reasonInput} value={directorReason} disabled={editorLocked || selectedIsOwner} onChange={(event) => setDirectorReason(event.target.value)} placeholder="At least 10 characters; stored in the immutable audit record" /></label>{canGrantDirector ? <button type="button" disabled={editorLocked || directorReason.trim().length < 10} onClick={() => reviewDirector("grant-director")}>Review Director Grant</button> : null}{canRevokeDirector ? <button type="button" disabled={editorLocked || directorReason.trim().length < 10} onClick={() => reviewDirector("revoke-director")}>Review Director Revocation</button> : null}{!canGrantDirector && !canRevokeDirector && !selectedIsOwner ? <p>The selected Player does not meet the current bounded grant/revoke prerequisites. Auth linking, active membership, self-lockout, and final-administrator protections are server enforced.</p> : null}</> : null}
            </article>
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
      <dl><div><dt>Target</dt><dd>{review.display.player}</dd></div><div><dt>Requested change</dt><dd>{review.display.change}</dd></div><div><dt>{GOVERNANCE_ACTIONS.has(review.action) ? "Expected governance revision" : "Expected directory revision"}</dt><dd>{GOVERNANCE_ACTIONS.has(review.action) ? governanceRevision : data.revision}</dd></div></dl>
      {review.rows.length ? <div className={styles.reviewTable} role="region" aria-label="Bulk enrollment review" tabIndex="0"><table><thead><tr><th>Player</th><th>Email</th><th>Mobile</th></tr></thead><tbody>{review.rows.map((row) => <tr key={row.playerId}><th scope="row"><strong>{row.displayName}</strong><span>{row.playerId}</span></th><td>{row.maskedEmail}</td><td>{row.maskedPhone}</td></tr>)}</tbody></table></div> : null}
      <p className={styles.consequence}>{review.display.consequence}</p>
      <label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{GOVERNANCE_ACTIONS.has(review.action) ? "I reviewed the target Player, current state, consequences, and immutable Production audit effect." : "I reviewed the masked identifiers, target players, and effect of this Production update."}</span></label>
      <div className={styles.reviewActions}><button type="button" className={styles.secondaryButton} disabled={phase === "submitting"} onClick={() => { if (review.action === "create-player") setAddPlayerStep("validate"); setReview(null); setConfirmed(false); setPhase("ready"); }}>Return to Editing</button><button type="button" disabled={!confirmed || phase === "submitting"} onClick={commitReview}>{phase === "submitting" ? "Confirming…" : `Confirm ${actionTitle(review.action)}`}</button></div>
    </section> : null}

    {message ? <p className={styles.message} data-error={phase === "failure" || phase === "review" ? "true" : undefined} role={phase === "failure" ? "alert" : "status"}>{message}</p> : null}
    {receipt ? <p className={styles.receipt}><strong>{actionTitle(receipt.action)} confirmed</strong><span>{receipt.revision !== null ? `${GOVERNANCE_ACTIONS.has(receipt.action) ? "Governance" : "Directory"} revision ${receipt.revision}` : "Authoritative server response received"}{receipt.idempotent ? " · safe retry" : ""}{receipt.timestamp ? ` · ${timestamp(receipt.timestamp)}` : ""}</span></p> : null}

    <details className={styles.audit}><summary>Recent access activity <span>{data.audit.length}</span></summary>{data.audit.length ? <ol>{data.audit.map((item, index) => <li key={item.id || `${item.action}-${index}`}><div><strong>{productionPlayerAccessStatusLabel(item.action)}</strong><span>{item.summary || item.targetPlayerId || "Production access"}</span></div><small>{item.actorDisplayName || "Tournament Director"}<br />{timestamp(item.timestamp)}</small><StateBadge value={item.result} /></li>)}</ol> : <p>No recent access activity is available.</p>}</details>
  </section>;
}
