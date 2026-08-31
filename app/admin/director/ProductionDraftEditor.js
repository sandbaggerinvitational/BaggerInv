"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClientMutationOperationIdentityRegistry } from "../../../lib/client-mutation-operation-identity.js";
import styles from "./production-director.module.css";

const ENDPOINT = "/api/director/draft";
const SAVE_CONFIRMATION = "SAVE DRAFT REVISION";
const STATUS_OPTIONS = Object.freeze(["Automatic", "Unscheduled", "Scheduled", "Live", "Complete"]);
const EDITABLE_LIFECYCLES = new Set(["DRAFT", "CONFIGURING", "READY_FOR_ACTIVATION", "EDITABLE", "MUTABLE", "OPEN"]);
const FROZEN_LIFECYCLES = new Set(["COMPLETE", "COMPLETED", "FROZEN", "HISTORICAL", "ARCHIVED", "CORRECTION_REQUIRED"]);
const DEPENDENCY_ISSUE_LABELS = Object.freeze({
  DRAFT_SELECTED_PLAYER_INACTIVE_OR_MISSING: "Drafted Players are no longer active in the canonical tournament roster",
  DRAFT_SELECTED_PLAYER_TEAM_CONFLICT: "Drafted Players no longer match their recorded canonical Team",
  DRAFT_CANONICAL_TEAM_MISSING: "A Team referenced by this Draft is missing from canonical tournament setup",
});
const VALIDATION_ISSUE_LABELS = Object.freeze({
  DRAFT_TOURNAMENT_MISMATCH: "Draft year does not match the selected tournament",
  DRAFT_DATE_INVALID: "Draft date is not a valid calendar date",
  DRAFT_TIME_INVALID: "Draft time is not in a supported format",
  DRAFT_TIME_ZONE_INVALID: "Draft time zone is not recognized",
  DRAFT_TOTAL_PICKS_INVALID: "Total picks must be a positive whole number",
  DRAFT_TEAM_INVALID: "Select two distinct canonical Teams",
  DRAFT_FIRST_PICK_TEAM_INVALID: "First-pick Team must be one of the configured Teams",
  DRAFT_STATUS_INVALID: "Select a supported Draft status",
  DRAFT_CAPTAIN_INVALID: "A captain is not an active tournament Player",
  DRAFT_CAPTAINS_CONFLICT: "Each Draft Team must have a different captain",
  DRAFT_PICK_COUNT_MISMATCH: "The Draft Board must contain every configured pick row",
  DRAFT_PICK_NUMBER_INVALID: "A pick number is invalid",
  DRAFT_PICK_NUMBER_DUPLICATE: "Pick numbers must be unique",
  DRAFT_PICK_SEQUENCE_INVALID: "Pick numbers must be contiguous",
  DRAFT_PLAYER_TEAM_INVALID: "A selected Player is not active on the chosen canonical Team",
  DRAFT_PLAYER_DUPLICATE: "A Player may be selected only once",
  DRAFT_CAPTAIN_PICK_PROHIBITED: "Captains cannot also be Draft picks",
  DRAFT_COMPLETED_PICK_MISSING: "A completed Draft must contain every selection",
});
const SETUP_FIELDS = Object.freeze([
  ["name", "Draft name override"],
  ["date", "Draft date"],
  ["time", "Draft time"],
  ["time_zone", "Time zone"],
  ["location", "Location"],
  ["status_mode", "Status"],
  ["format", "Format"],
  ["total_picks", "Total picks"],
  ["team_1_id", "Team 1"],
  ["team_2_id", "Team 2"],
  ["team_1_captain_player_id", "Team 1 captain"],
  ["team_2_captain_player_id", "Team 2 captain"],
  ["first_pick_team_id", "First-pick team"],
  ["notes", "Notes"],
]);

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const integer = (value) => Number.isInteger(Number(value)) ? Number(value) : 0;
const positiveInteger = (value) => integer(value) > 0 ? integer(value) : 0;
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
    const error = new Error(payload.error || `The Draft operation did not complete (${response.status}).`);
    error.code = payload.code;
    error.issues = Array.isArray(payload.issues) ? payload.issues : [];
    throw error;
  }
  return payload;
}

function State({ value, children }) {
  const normalized = upper(value);
  const ready = ["CURRENT", "VALID", "VALIDATED", "EDITABLE", "MUTABLE", "OPEN", "SUPABASE_DIRECTOR"].includes(normalized);
  const attention = ["FAILED", "BLOCKED", "UNAVAILABLE", "CORRECTION_REQUIRED", "CONFLICT"].includes(normalized);
  return <span className={styles.stateBadge} data-state={ready ? "ready" : attention ? "attention" : "neutral"}>{children || pretty(value)}</span>;
}

function first(object, ...keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) return object[key];
  }
  return undefined;
}

function canonicalStatus(value) {
  return STATUS_OPTIONS.find((option) => upper(option) === upper(value)) || clean(value) || "Automatic";
}

function normalizeConfiguration(source = {}, fallbackYear = 0) {
  return {
    year: positiveInteger(first(source, "year", "tournament_year", "Year")) || positiveInteger(fallbackYear),
    name: clean(first(source, "name", "draft_name", "Draft Name Override")),
    date: clean(first(source, "date", "draft_date", "Draft Date")),
    time: clean(first(source, "time", "draft_time", "Draft Time")),
    time_zone: clean(first(source, "time_zone", "timeZone", "Time Zone")),
    location: clean(first(source, "location", "Draft Location")),
    status_mode: canonicalStatus(first(source, "status_mode", "statusMode", "Draft Status Mode")),
    format: clean(first(source, "format", "draft_format", "Draft Format")),
    total_picks: positiveInteger(first(source, "total_picks", "totalPicks", "totalDraftPicks", "Total Picks", "Total Draft Picks")),
    team_1_id: clean(first(source, "team_1_id", "team1Id", "Team 1 ID", "Team One ID")),
    team_2_id: clean(first(source, "team_2_id", "team2Id", "Team 2 ID", "Team Two ID")),
    team_1_captain_player_id: clean(first(source, "team_1_captain_player_id", "team1CaptainPlayerId", "Team 1 Captain Player ID", "Team One Captain Player ID")),
    team_2_captain_player_id: clean(first(source, "team_2_captain_player_id", "team2CaptainPlayerId", "Team 2 Captain Player ID", "Team Two Captain Player ID")),
    first_pick_team_id: clean(first(source, "first_pick_team_id", "firstPickTeamId", "First Pick Team ID")),
    notes: clean(first(source, "notes", "Notes")),
  };
}

function normalizePick(source = {}, pickNumber = 0) {
  const playerId = clean(first(source, "player_id", "playerId"));
  return {
    pick_number: positiveInteger(first(source, "pick_number", "pickNumber")) || positiveInteger(pickNumber),
    team_id: clean(first(source, "team_id", "teamId")),
    player_id: playerId,
    selected_at: clean(first(source, "selected_at", "selectedAt", "selected_at_source")),
    selected_by: clean(first(source, "selected_by", "selectedBy", "selected_by_source")),
    notes: clean(first(source, "notes", "Notes")),
  };
}

function completePicks(source, totalPicks) {
  const rows = Array.isArray(source) ? source.map((pick, index) => normalizePick(pick, index + 1)) : [];
  const byNumber = new Map(rows.map((pick) => [pick.pick_number, pick]));
  const total = positiveInteger(totalPicks) || rows.reduce((maximum, pick) => Math.max(maximum, pick.pick_number), 0);
  return Array.from({ length: total }, (_, index) => byNumber.get(index + 1) || normalizePick({}, index + 1));
}

function revisionForm(value, fallbackYear = 0) {
  const source = value?.projection || value || {};
  const configuration = normalizeConfiguration(first(source, "configuration", "setup") || {}, fallbackYear);
  return {
    configuration,
    picks: completePicks(first(source, "picks", "normalized_picks", "normalizedPicks"), configuration.total_picks),
  };
}

function mutationPayload(form) {
  const configuration = normalizeConfiguration(form?.configuration, form?.configuration?.year);
  return {
    configuration,
    picks: completePicks(form?.picks, configuration.total_picks).map((pick) => ({
      pick_number: pick.pick_number,
      team_id: clean(pick.team_id),
      player_id: clean(pick.player_id),
      selected_at: clean(pick.selected_at),
      selected_by: clean(pick.selected_by),
      notes: clean(pick.notes),
    })),
  };
}

function targetOptions(data, selectedTournamentId) {
  const values = first(data, "targets", "tournaments") || [];
  const normalized = (Array.isArray(values) ? values : []).map((item) => ({
    tournamentId: clean(first(item, "tournamentId", "tournament_id", "id")),
    tournamentYear: positiveInteger(first(item, "tournamentYear", "tournament_year", "year")),
    name: clean(first(item, "name", "label")),
    lifecycle: upper(first(item, "lifecycle", "state", "status")),
    current: item?.current === true || item?.isCurrent === true || upper(first(item, "lifecycle", "state")) === "ACTIVE",
  })).filter((item) => item.tournamentId);
  const target = clean(first(data, "targetTournamentId", "tournamentId", "tournament_id")) || clean(selectedTournamentId);
  if (target && !normalized.some((item) => item.tournamentId === target)) {
    normalized.push({ tournamentId: target, tournamentYear: positiveInteger(target), name: "", lifecycle: upper(first(data, "lifecycle", "state")), current: false });
  }
  return normalized;
}

function teamOptions(data, forms) {
  const values = [
    ...(Array.isArray(data?.teams) ? data.teams : []),
    ...(Array.isArray(data?.canonicalTeams) ? data.canonicalTeams : []),
    ...(Array.isArray(data?.referenceData?.teams) ? data.referenceData.teams : []),
  ];
  for (const form of forms) {
    const config = form?.configuration || {};
    for (const id of [config.team_1_id, config.team_2_id]) if (id) values.push({ id });
  }
  const unique = new Map();
  for (const value of values) {
    const id = clean(first(value, "id", "teamId", "team_id"));
    if (!id || unique.has(id)) continue;
    unique.set(id, {
      id,
      name: clean(first(value, "name", "displayName", "display_name")) || id,
      side: clean(first(value, "side", "teamSide", "team_side")),
    });
  }
  return [...unique.values()];
}

function playerOptions(data, forms) {
  const values = [
    ...(Array.isArray(data?.eligiblePlayers) ? data.eligiblePlayers : []),
    ...(Array.isArray(data?.players) ? data.players : []),
    ...(Array.isArray(data?.referenceData?.players) ? data.referenceData.players : []),
  ];
  for (const form of forms) {
    for (const pick of form?.picks || []) if (pick.player_id) values.push({ id: pick.player_id, name: first(pick, "player_name", "playerName"), teamId: pick.team_id });
  }
  const unique = new Map();
  for (const value of values) {
    const id = clean(first(value, "id", "playerId", "player_id"));
    if (!id || unique.has(id)) continue;
    unique.set(id, {
      id,
      name: clean(first(value, "name", "displayName", "display_name")) || id,
      teamId: clean(first(value, "teamId", "team_id")),
    });
  }
  return [...unique.values()];
}

function expectedRevision(data) {
  return integer(first(data?.current, "revision", "revisionNumber", "revision_number") ?? first(data, "currentRevision", "current_revision"));
}

function provenanceLabel(value) {
  const authority = upper(first(value, "authoringAuthority", "authoring_authority", "provenance", "source"));
  if (authority === "SUPABASE_DIRECTOR") return "Director Console";
  if (authority === "GOOGLE_IMPORT" || authority === "GOOGLE_SYNCHRONIZATION") return "Google synchronization";
  return "Certified revision";
}

function revisionNumber(value) {
  return integer(first(value, "revision", "revisionNumber", "revision_number"));
}

function mutationMessage(error) {
  const fields = (error?.issues || []).map((issue) => {
    const code = upper(first(issue, "code"));
    const label = VALIDATION_ISSUE_LABELS[code] || clean(first(issue, "field", "key", "message"));
    const pickNumber = positiveInteger(first(issue, "pickNumber", "pick_number"));
    return label && pickNumber ? `${label} (Pick ${pickNumber})` : label;
  }).filter(Boolean);
  return fields.length ? `${error.message} Review: ${[...new Set(fields)].join(" · ")}.` : error.message;
}

function display(value) {
  return clean(value) || "—";
}

function dependencyIssueSummary(issue) {
  const label = DEPENDENCY_ISSUE_LABELS[upper(first(issue, "code"))] ||
    "A canonical tournament dependency needs Director review";
  const count = positiveInteger(first(issue, "count", "issueCount", "issue_count"));
  return count ? `${label} · ${count}` : label;
}

function SetupControl({ field, value, disabled, teams, players, onChange }) {
  if (["team_1_id", "team_2_id", "first_pick_team_id"].includes(field)) {
    return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select a canonical Team</option>
      {teams.map((team) => <option key={team.id} value={team.id}>{team.name}{team.side ? ` · ${team.side}` : ""}</option>)}
    </select>;
  }
  if (["team_1_captain_player_id", "team_2_captain_player_id"].includes(field)) {
    return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select a tournament Player</option>
      {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
    </select>;
  }
  if (field === "status_mode") {
    return <select value={canonicalStatus(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>;
  }
  if (field === "notes") return <textarea value={value} disabled={disabled} maxLength={2000} onChange={(event) => onChange(event.target.value)} />;
  return <input type={field === "total_picks" ? "number" : "text"} inputMode={field === "total_picks" ? "numeric" : undefined} min={field === "total_picks" ? 1 : undefined} step={field === "total_picks" ? 1 : undefined} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}

function SetupEditor({ form, current, mode, teams, players, onChange }) {
  const editable = mode === "edit";
  return <section className={styles.draftSection}>
    <header><div><span>Draft Setup</span><h3>Configuration</h3></div><State value={editable ? "EDITABLE" : "CURRENT"}>{editable ? "Editing" : "Authoritative"}</State></header>
    <div className={styles.draftSetupGrid}>
      <label><span>Year / tournament</span><strong>{form.configuration.year || "Not selected"}</strong><small>Tournament scope cannot be changed inside a Draft revision.</small></label>
      {SETUP_FIELDS.map(([field, label]) => <label key={field} data-wide={field === "notes" ? "true" : undefined}>
        <span>{label}</span>
        {editable ? <SetupControl field={field} value={form.configuration[field]} teams={teams} players={players} onChange={(value) => onChange(field, value)} /> : <strong>{field === "total_picks" ? form.configuration[field] || "—" : display(form.configuration[field])}</strong>}
        {editable && current?.configuration?.[field] !== undefined ? <small>Current: {display(current.configuration[field])}</small> : null}
      </label>)}
    </div>
  </section>;
}

function PickBoard({ form, mode, teams, players, captainIds, onChange }) {
  const editable = mode === "edit";
  const picks = completePicks(form.picks, form.configuration.total_picks);
  const usedPlayers = new Map(picks.filter((pick) => pick.player_id).map((pick) => [pick.player_id, pick.pick_number]));
  return <section className={styles.draftSection}>
    <header><div><span>Draft Board / Picks</span><h3>{picks.length} official pick{picks.length === 1 ? "" : "s"}</h3></div><State value={picks.every((pick) => pick.player_id) && picks.length ? "COMPLETE" : "OPEN"} /></header>
    <div className={styles.draftBoard} role="table" aria-label="Draft Board">
      <div className={styles.draftBoardHeading} role="row"><strong>Pick #</strong><strong>Team</strong><strong>Selected Player</strong><strong>Status / Notes</strong></div>
      {picks.map((pick) => {
        const availablePlayers = players.filter((player) => {
          const selectedElsewhere = usedPlayers.has(player.id) && usedPlayers.get(player.id) !== pick.pick_number;
          const wrongTeam = pick.team_id && player.teamId && player.teamId !== pick.team_id;
          return player.id === pick.player_id || (!selectedElsewhere && !captainIds.has(player.id) && !wrongTeam);
        });
        return <div className={styles.draftBoardRow} role="row" key={pick.pick_number}>
          <strong>#{pick.pick_number}</strong>
          {editable ? <select aria-label={`Pick ${pick.pick_number} Team`} value={pick.team_id} onChange={(event) => onChange(pick.pick_number, "team_id", event.target.value)}><option value="">Select Team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select> : <span>{teams.find((team) => team.id === pick.team_id)?.name || display(pick.team_id)}</span>}
          {editable ? <select aria-label={`Pick ${pick.pick_number} selected Player`} value={pick.player_id} onChange={(event) => onChange(pick.pick_number, "player_id", event.target.value)}><option value="">Pending selection</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}{player.teamId ? ` · ${teams.find((team) => team.id === player.teamId)?.name || player.teamId}` : ""}</option>)}</select> : <span>{players.find((player) => player.id === pick.player_id)?.name || (pick.player_id ? pick.player_id : "Pending")}</span>}
          <div className={styles.draftPickStatus}><State value={pick.player_id ? "SELECTED" : "PENDING"} />{editable ? <input aria-label={`Pick ${pick.pick_number} notes`} value={pick.notes} maxLength={500} placeholder="Optional notes" onChange={(event) => onChange(pick.pick_number, "notes", event.target.value)} /> : <span>{pick.notes || [pick.selected_by, pick.selected_at && timestamp(pick.selected_at)].filter(Boolean).join(" · ") || "No notes"}</span>}</div>
        </div>;
      })}
    </div>
  </section>;
}

function ReviewChanges({ current, draft }) {
  const currentForm = current || { configuration: {}, picks: [] };
  const setupChanges = SETUP_FIELDS.filter(([field]) => clean(currentForm.configuration?.[field]) !== clean(draft.configuration?.[field]));
  const currentPicks = new Map((currentForm.picks || []).map((pick) => [pick.pick_number, pick]));
  const pickChanges = (draft.picks || []).filter((pick) => {
    const before = currentPicks.get(pick.pick_number) || {};
    return ["team_id", "player_id", "notes"].some((field) => clean(before[field]) !== clean(pick[field]));
  });
  return <section className={styles.draftReview}>
    <header><div><span>Validated review</span><h3>Review exact Draft changes</h3></div><State value="VALIDATED" /></header>
    <p>Saving creates one immutable Draft revision for this tournament. It does not change tournament teams, captains, or roster membership.</p>
    <div className={styles.draftReviewGroup}><h4>Draft Setup</h4>{setupChanges.length ? <div className={styles.draftChanges} role="table" aria-label="Draft Setup changes"><div role="row"><strong>Field</strong><strong>Current</strong><strong>Proposed</strong></div>{setupChanges.map(([field, label]) => <div role="row" key={field}><span>{label}</span><span>{display(currentForm.configuration?.[field])}</span><strong>{display(draft.configuration?.[field])}</strong></div>)}</div> : <p>No Draft Setup fields changed.</p>}</div>
    <div className={styles.draftReviewGroup}><h4>Draft Board / Picks</h4>{pickChanges.length ? <div className={styles.draftChanges} role="table" aria-label="Draft Pick changes"><div role="row"><strong>Pick</strong><strong>Current</strong><strong>Proposed</strong></div>{pickChanges.map((pick) => { const before = currentPicks.get(pick.pick_number) || {}; return <div role="row" key={pick.pick_number}><span>Pick {pick.pick_number}</span><span>{[before.team_id, before.player_id].filter(Boolean).join(" · ") || "Pending"}</span><strong>{[pick.team_id, pick.player_id].filter(Boolean).join(" · ") || "Pending"}</strong></div>; })}</div> : <p>No Draft Pick fields changed.</p>}</div>
  </section>;
}

export default function ProductionDraftEditor({ onChanged }) {
  const [phase, setPhase] = useState("loading");
  const [data, setData] = useState(null);
  const [targets, setTargets] = useState([]);
  const [targetTournamentId, setTargetTournamentId] = useState("");
  const [mode, setMode] = useState("view");
  const [form, setForm] = useState(revisionForm());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState(null);
  const identities = useRef(null);
  if (!identities.current) identities.current = createClientMutationOperationIdentityRegistry();

  const load = useCallback(async (target = "", { quiet = false, forceReview = false } = {}) => {
    if (!quiet) setPhase("loading");
    try {
      const query = target ? `?targetTournamentId=${encodeURIComponent(target)}` : "";
      const payload = await jsonRequest(`${ENDPOINT}${query}`);
      const next = payload.data || {};
      const nextTargets = targetOptions(next, target);
      const selected = clean(first(next, "targetTournamentId", "tournamentId", "tournament_id")) || clean(target) || nextTargets.find((item) => item.current)?.tournamentId || nextTargets[0]?.tournamentId || "";
      const year = positiveInteger(first(next, "tournamentYear", "tournament_year")) || positiveInteger(selected);
      const draft = first(next, "openDraft", "open_draft", "draft");
      const source = draft || next.current || {};
      setData(next);
      setTargetTournamentId(selected);
      setTargets((current) => nextTargets.length ? nextTargets : current);
      setForm(revisionForm(source, year));
      setMode(forceReview || upper(first(draft, "state", "validationState", "validation_state")) === "VALIDATED" ? "review" : "view");
      setPhase("ready");
      return next;
    } catch (error) {
      setMessage(error.message);
      setPhase("failure");
      return null;
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentForm = useMemo(() => revisionForm(data?.current, targetTournamentId), [data?.current, targetTournamentId]);
  const storedDraft = first(data, "openDraft", "open_draft", "draft");
  const draftForm = useMemo(() => revisionForm(storedDraft, targetTournamentId), [storedDraft, targetTournamentId]);
  const teams = useMemo(() => teamOptions(data || {}, [currentForm, draftForm, form]), [currentForm, data, draftForm, form]);
  const players = useMemo(() => playerOptions(data || {}, [currentForm, draftForm, form]), [currentForm, data, draftForm, form]);
  const currentTarget = targets.find((target) => target.current) || null;
  const selectedTarget = targets.find((target) => target.tournamentId === targetTournamentId) || null;
  const currentTournamentId = clean(first(data, "currentTournamentId", "current_tournament_id")) || currentTarget?.tournamentId || "2026";
  const isFuture = Boolean(targetTournamentId && currentTournamentId && targetTournamentId !== currentTournamentId);
  const sourceTournamentId = isFuture
    ? String(Number(targetTournamentId) - 1)
    : currentTournamentId;
  const lifecycle = upper(first(data?.mutability, "state", "lifecycle") || first(data, "lifecycle", "state") || selectedTarget?.lifecycle);
  const selectedCount = form.picks.filter((pick) => pick.player_id).length;
  const totalPicks = positiveInteger(form.configuration.total_picks) || form.picks.length;
  const completed = upper(form.configuration.status_mode) === "COMPLETE" || FROZEN_LIFECYCLES.has(lifecycle) || (totalPicks > 0 && selectedCount === totalPicks);
  const explicitlyMutable = data?.mutable === true || data?.mutability?.editable === true || data?.mutability?.canEdit === true || EDITABLE_LIFECYCLES.has(lifecycle);
  const correctionRequired = completed || upper(first(data?.mutability, "state", "code") || first(data, "mutability")) === "CORRECTION_REQUIRED";
  const editable = explicitlyMutable && !correctionRequired;
  const dependencyReadiness = first(data, "dependencyReadiness", "dependency_readiness") || {};
  const dependencyIssues = Array.isArray(dependencyReadiness.issues) ? dependencyReadiness.issues : [];
  const dependencyConflict = upper(first(dependencyReadiness, "status", "state")) === "CONFLICT";
  const currentAvailable = Boolean(data?.current);
  const changed = JSON.stringify(mutationPayload(form)) !== JSON.stringify(mutationPayload(currentForm));
  const captainIds = new Set([form.configuration.team_1_captain_player_id, form.configuration.team_2_captain_player_id].filter(Boolean));

  const startEdit = () => {
    if (!editable) return;
    setForm(revisionForm(storedDraft || data.current || {}, targetTournamentId));
    setMode("edit");
    setMessage("");
    setReceipt(null);
  };
  const updateSetup = (field, value) => setForm((current) => ({ ...current, configuration: { ...current.configuration, [field]: value } }));
  const updatePick = (pickNumber, field, value) => setForm((current) => ({
    ...current,
    picks: completePicks(current.picks, current.configuration.total_picks).map((pick) => pick.pick_number === pickNumber ? { ...pick, [field]: value } : pick),
  }));

  const stageAndValidate = async () => {
    const expected = expectedRevision(data);
    const proposed = mutationPayload(form);
    const stageIntent = {
      action: "stage",
      targetTournamentId,
      expectedRevision: expected,
      configuration: proposed.configuration,
      picks: proposed.picks,
      reason: clean(reason),
    };
    const operation = identities.current.acquire(stageIntent);
    setBusy("review"); setMessage(""); setReceipt(null);
    try {
      const staged = await jsonRequest(ENDPOINT, { ...stageIntent, operationRequestId: operation.operationRequestId });
      identities.current.confirm(operation);
      const draftId = clean(first(staged.data, "draftId", "draft_id"));
      const validationIntent = { action: "validate", targetTournamentId, expectedRevision: expected, draftId };
      const validationOperation = identities.current.acquire(validationIntent);
      await jsonRequest(ENDPOINT, { ...validationIntent, operationRequestId: validationOperation.operationRequestId });
      identities.current.confirm(validationOperation);
      await load(targetTournamentId, { quiet: true, forceReview: true });
      setMessage("Validation passed. Review Draft Setup and every changed pick before saving.");
    } catch (error) { setMessage(mutationMessage(error)); }
    finally { setBusy(""); }
  };

  const validateStoredDraft = async () => {
    const intent = {
      action: "validate",
      targetTournamentId,
      expectedRevision: expectedRevision(data),
      draftId: clean(first(storedDraft, "draftId", "draft_id")),
    };
    const operation = identities.current.acquire(intent);
    setBusy("validate"); setMessage(""); setReceipt(null);
    try {
      await jsonRequest(ENDPOINT, { ...intent, operationRequestId: operation.operationRequestId });
      identities.current.confirm(operation);
      await load(targetTournamentId, { quiet: true, forceReview: true });
      setMessage("Validation passed. Review Draft Setup and every changed pick before saving.");
    } catch (error) { setMessage(mutationMessage(error)); }
    finally { setBusy(""); }
  };

  const saveRevision = async () => {
    if (!globalThis.confirm?.("Save this reviewed Draft revision? The complete setup and Draft Board become current for this tournament.")) return;
    const intent = {
      action: "commit",
      targetTournamentId,
      expectedRevision: expectedRevision(data),
      draftId: clean(first(storedDraft, "draftId", "draft_id")),
      confirmation: SAVE_CONFIRMATION,
    };
    const operation = identities.current.acquire(intent);
    setBusy("save"); setMessage(""); setReceipt(null);
    try {
      const result = await jsonRequest(ENDPOINT, { ...intent, operationRequestId: operation.operationRequestId });
      identities.current.confirm(operation);
      const committedRevision = integer(first(result.data, "revision", "revisionNumber", "revision_number"));
      const committedPickValue = first(result.data,
        "selectedPickCount", "selected_pick_count", "pickCount", "pick_count");
      const committedPicks = committedPickValue == null
        ? selectedCount
        : integer(committedPickValue);
      await load(targetTournamentId, { quiet: true });
      await onChanged?.();
      setReason("");
      setReceipt({ revision: committedRevision, pickCount: committedPicks, effectiveAt: first(result.data, "effectiveAt", "effective_at", "committedAt", "committed_at") });
      setMessage("The reviewed Supabase Draft revision is current. No Google synchronization is required.");
    } catch (error) { setMessage(mutationMessage(error)); }
    finally { setBusy(""); }
  };

  const copyPrevious = async () => {
    const intent = {
      action: "copy-previous",
      targetTournamentId,
      sourceTournamentId,
      expectedRevision: expectedRevision(data),
      reason: "Copy prior Draft Setup for Director review",
    };
    const operation = identities.current.acquire(intent);
    setBusy("copy"); setMessage(""); setReceipt(null);
    try {
      await jsonRequest(ENDPOINT, { ...intent, operationRequestId: operation.operationRequestId });
      identities.current.confirm(operation);
      await load(targetTournamentId, { quiet: true });
      setMessage("Previous Draft Setup was copied into a review draft only. No prior selections, timestamps, or completed status were copied.");
    } catch (error) { setMessage(mutationMessage(error)); }
    finally { setBusy(""); }
  };

  if (phase === "loading") return <div className={styles.draftLoading}>Loading authoritative Draft…</div>;
  if (phase === "failure" || !data) return <div className={styles.inlineNotice} role="alert">{message || "Draft authoring is temporarily unavailable."} <button type="button" onClick={() => load(targetTournamentId)}>Retry</button></div>;

  const history = Array.isArray(data.history) ? data.history : [];
  return <div className={styles.draftEditor}>
    <div className={styles.draftToolbar}>
      <label><span>Tournament</span><select value={targetTournamentId} disabled={Boolean(busy)} onChange={(event) => { setMessage(""); setReceipt(null); load(event.target.value); }}>{(targets.length ? targets : [{ tournamentId: targetTournamentId, tournamentYear: positiveInteger(targetTournamentId), current: true }]).map((target) => <option key={target.tournamentId} value={target.tournamentId}>{target.tournamentYear || target.tournamentId}{target.current ? " · Current" : target.lifecycle ? ` · ${pretty(target.lifecycle)}` : ""}</option>)}</select></label>
      <div><small>Current revision</small><strong>{currentAvailable ? revisionNumber(data.current) || "Current" : "Not configured"}</strong><span>{currentAvailable ? `${provenanceLabel(data.current)} · ${timestamp(first(data.current, "effectiveAt", "effective_at", "synchronizedAt", "synchronized_at"))}` : "No current Draft revision"}</span></div>
      <div><small>Lifecycle</small><strong>{correctionRequired ? "Correction required" : pretty(lifecycle || "Not configured")}</strong><State value={correctionRequired ? "CORRECTION_REQUIRED" : lifecycle || "NOT_CONFIGURED"} /></div>
      <div><small>Selections</small><strong>{selectedCount} / {totalPicks || 0}</strong><span>Stable Player IDs</span></div>
    </div>

    {correctionRequired ? <div className={styles.draftCorrection} role="status" data-code="DRAFT_CORRECTION_REQUIRED"><State value="CORRECTION_REQUIRED">Correction Required</State><div><strong>Completed Draft is read-only</strong><p>Ordinary editing cannot rewrite this immutable Draft history. A separately authorized historical correction workflow is not installed.</p></div></div> : null}
    {dependencyConflict ? <div className={styles.draftCorrection} role="status"><State value="CONFLICT">Needs Attention</State><div><strong>Draft dependencies need review</strong><p>Canonical tournament Team or roster facts no longer agree with this Draft. Existing Draft history remains unchanged.</p>{dependencyIssues.length ? <ul>{dependencyIssues.map((issue, index) => <li key={`${upper(first(issue, "code")) || "dependency"}-${index}`}>{dependencyIssueSummary(issue)}</li>)}</ul> : <p>{positiveInteger(first(dependencyReadiness, "issueCount", "issue_count")) || 1} dependency issue requires Director review.</p>}</div></div> : null}

    {mode === "review" && storedDraft ? <>
      <ReviewChanges current={currentAvailable ? currentForm : null} draft={draftForm} />
      <SetupEditor form={draftForm} current={currentForm} mode="view" teams={teams} players={players} onChange={updateSetup} />
      <PickBoard form={draftForm} mode="view" teams={teams} players={players} captainIds={captainIds} onChange={updatePick} />
      <div className={styles.actionRow}><button type="button" disabled={Boolean(busy)} onClick={startEdit}>Back to Edit</button><button type="button" className={styles.primaryButton} disabled={Boolean(busy) || upper(first(storedDraft, "state", "validationState", "validation_state")) !== "VALIDATED"} onClick={saveRevision}>{busy === "save" ? "Saving revision…" : "Save Revision"}</button></div>
    </> : <>
      <SetupEditor form={form} current={currentForm} mode={mode} teams={teams} players={players} onChange={updateSetup} />
      <PickBoard form={form} mode={mode} teams={teams} players={players} captainIds={captainIds} onChange={updatePick} />
      {mode === "edit" ? <label className={styles.operationField}>Revision note<textarea value={reason} minLength={10} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Explain this complete Draft revision (10 characters minimum)." /><small>The note is retained with the immutable Director audit.</small></label> : null}
      <div className={styles.actionRow}>
        {mode === "view" && editable ? <button type="button" className={styles.primaryButton} disabled={Boolean(busy)} onClick={startEdit}>{storedDraft ? "Edit Draft" : currentAvailable ? "Edit Draft Setup" : "Create Draft Setup"}</button> : null}
        {mode === "view" && editable && upper(first(storedDraft, "state", "validationState", "validation_state")) === "STAGED" ? <button type="button" disabled={Boolean(busy)} onClick={validateStoredDraft}>{busy === "validate" ? "Validating…" : "Validate Stored Draft"}</button> : null}
        {mode === "edit" ? <><button type="button" disabled={Boolean(busy)} onClick={() => { setMode("view"); setForm(revisionForm(storedDraft || data.current, targetTournamentId)); }}>Cancel</button><button type="button" className={styles.primaryButton} disabled={Boolean(busy) || !changed || clean(reason).length < 10} onClick={stageAndValidate}>{busy === "review" ? "Validating…" : "Validate & Review"}</button></> : null}
        {mode === "view" && isFuture && explicitlyMutable && !currentAvailable && !storedDraft ? <button type="button" className={styles.primaryButton} disabled={Boolean(busy)} onClick={copyPrevious}>{busy === "copy" ? "Creating review draft…" : "Copy Previous Draft Setup as Draft"}</button> : null}
      </div>
    </>}

    {history.length ? <details className={styles.draftHistory}><summary>Revision history · {history.length}</summary><ul>{history.map((item, index) => <li key={`${revisionNumber(item)}-${index}`}><span><strong>Draft Revision {revisionNumber(item) || index + 1}</strong><small>{provenanceLabel(item)} · {timestamp(first(item, "effectiveAt", "effective_at", "synchronizedAt", "synchronized_at", "createdAt", "created_at"))}</small></span>{item.current === true || item.isCurrent === true ? <State value="CURRENT" /> : <span>{integer(first(item, "selectedPickCount", "selected_pick_count", "pickCount", "pick_count"))} picks</span>}</li>)}</ul></details> : null}
    {receipt ? <div className={styles.draftReceipt} role="status"><header><div><small>Revision saved</small><strong>Draft Revision {receipt.revision || "current"} saved</strong></div><State value="CURRENT" /></header><dl><div><dt>Tournament</dt><dd>{targetTournamentId}</dd></div><div><dt>Official picks</dt><dd>{receipt.pickCount}</dd></div><div><dt>Effective time</dt><dd>{timestamp(receipt.effectiveAt)}</dd></div><div><dt>Provenance</dt><dd>Director Console</dd></div></dl></div> : null}
    {message ? <p className={styles.operationMessage} role="status">{message}</p> : null}
  </div>;
}
