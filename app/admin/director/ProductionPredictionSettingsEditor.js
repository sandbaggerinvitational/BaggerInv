"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClientMutationOperationIdentityRegistry } from "../../../lib/client-mutation-operation-identity.js";
import styles from "./production-director.module.css";

const ENDPOINT = "/api/director/prediction-settings";
const FUTURE_ENDPOINT = "/api/director/future-tournaments";
const SAVE_CONFIRMATION = "SAVE PREDICTION SETTINGS REVISION";
const ELIGIBLE_FUTURE_STATES = new Set(["DRAFT", "CONFIGURING", "READY_FOR_ACTIVATION"]);
const PERCENT_SETTING_KEYS = new Set(["Maximum Win Probability", "Minimum Win Probability"]);

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
    error.issues = Array.isArray(payload.issues) ? payload.issues : [];
    throw error;
  }
  return payload;
}

function State({ value, children }) {
  const normalized = upper(value);
  const ready = ["CURRENT", "PUBLISHED", "SUCCEEDED", "VALID", "VALIDATED"].includes(normalized);
  const attention = ["FAILED", "STALE", "RETRYABLE", "UNAVAILABLE"].includes(normalized);
  return <span className={styles.stateBadge} data-state={ready ? "ready" : attention ? "attention" : "neutral"}>{children || pretty(value)}</span>;
}

function provenanceLabel(value) {
  return upper(value) === "SUPABASE_DIRECTOR" ? "Director Console" : "Certified initial revision";
}

function displayValue(value) {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function displaySettingValue(key, value) {
  const rendered = displayValue(value);
  return PERCENT_SETTING_KEYS.has(key) && rendered !== "—" ? `${rendered}%` : rendered;
}

function comparableSettingValue(specification, value) {
  if (["number", "integer"].includes(specification?.type)) {
    if (clean(value) === "") return value;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return value;
    return specification.type === "integer"
      ? Math.max(specification.minimum ?? -Infinity, Math.round(parsed))
      : parsed;
  }
  if (specification?.type === "boolean") return value === true || upper(value) === "TRUE";
  return typeof value === "string" ? clean(value) : value;
}

function settingChanged(specification, current, proposed) {
  return JSON.stringify(comparableSettingValue(specification, current)) !==
    JSON.stringify(comparableSettingValue(specification, proposed));
}

function valuesFor(data) {
  return { ...(data?.draft?.canonicalSettings || data?.current?.canonicalSettings || {}) };
}

function SettingControl({ specification, value, disabled, onChange }) {
  const id = `prediction-setting-${specification.order}`;
  if (specification.type === "boolean") {
    return <span className={styles.predictionToggle}>
      <input id={id} type="checkbox" checked={value === true || upper(value) === "TRUE"} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{value === true || upper(value) === "TRUE" ? "Enabled" : "Disabled"}</span>
    </span>;
  }
  if (specification.type === "enum") {
    return <select id={id} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {specification.allowedValues.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>;
  }
  const control = <input
      id={id}
      type={["number", "integer"].includes(specification.type) ? "number" : "text"}
      inputMode={["number", "integer"].includes(specification.type) ? "decimal" : undefined}
      step={specification.type === "integer" ? "1" : specification.type === "number" ? "any" : undefined}
      min={specification.minimum}
      max={specification.maximum}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />;
  return PERCENT_SETTING_KEYS.has(specification.canonicalKey)
    ? <span className={styles.predictionPercentControl}>{control}<span aria-hidden="true">%</span></span>
    : control;
}

function Relationship({ relationship = {} }) {
  const calculationState = relationship.recalculationRequired ? "STALE" : "CURRENT";
  return <div className={styles.predictionRelationship}>
    <article>
      <small>Calculation relationship</small>
      <strong>{relationship.recalculationRequired ? "Recalculation needed" : "Current calculation available"}</strong>
      <State value={calculationState} />
    </article>
    <article>
      <small>Latest calculation</small>
      <strong>{pretty(relationship.latestCalculationStatus || "Not requested")}</strong>
      <span>Settings revision {relationship.latestCalculationSettingsRevision || "—"}</span>
    </article>
    <article>
      <small>Published Odds</small>
      <strong>{pretty(relationship.publicationState || "Unpublished")}</strong>
      <span>Publication {relationship.publishedRevision || "—"} · settings {relationship.publishedSettingsRevision || "—"}</span>
    </article>
    <article>
      <small>Save behavior</small>
      <strong>Published snapshot unchanged</strong>
      <span>A separate calculation and publish action is always required.</span>
    </article>
  </div>;
}

export default function ProductionPredictionSettingsEditor({ onChanged }) {
  const [phase, setPhase] = useState("loading");
  const [data, setData] = useState(null);
  const [targetTournamentId, setTargetTournamentId] = useState("");
  const [targets, setTargets] = useState([]);
  const [mode, setMode] = useState("view");
  const [values, setValues] = useState({});
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
      const next = payload.data;
      setData(next);
      setTargetTournamentId(next.tournamentId);
      setValues(valuesFor(next));
      setMode(forceReview || upper(next.draft?.state) === "VALIDATED" ? "review" : "view");
      setPhase("ready");
      return next;
    } catch (error) {
      setMessage(error.message);
      setPhase("failure");
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const [settings, future] = await Promise.all([
        load(),
        jsonRequest(FUTURE_ENDPOINT).catch(() => null),
      ]);
      if (!active || !settings) return;
      const futureData = future?.data;
      const current = {
        tournamentId: settings.tournamentId,
        tournamentYear: Number(settings.tournamentId),
        name: futureData?.currentTournament?.name || `Bagger Invitational ${settings.tournamentId}`,
        lifecycle: "ACTIVE",
        current: true,
      };
      const eligible = (futureData?.catalog || []).filter((item) =>
        item?.tournamentId && item.tournamentId !== current.tournamentId && ELIGIBLE_FUTURE_STATES.has(upper(item.lifecycle)));
      setTargets([current, ...eligible]);
    })();
    return () => { active = false; };
  }, [load]);

  const specifications = data?.specifications || [];
  const specByKey = useMemo(() => new Map(specifications.map((item) => [item.canonicalKey, item])), [specifications]);
  const currentValues = data?.current?.canonicalSettings || {};
  const currentEffectiveValues = data?.current?.effectiveSettings || {};
  const reviewDraft = data?.draft || null;
  const liveChangedKeys = specifications
    .map((item) => item.canonicalKey)
    .filter((key) => settingChanged(specByKey.get(key), currentValues[key], values[key]));
  const changedKeys = mode === "review" && reviewDraft ? reviewDraft.changedKeys : liveChangedKeys;
  const reviewKeys = reviewDraft ? specifications.map((item) => item.canonicalKey).filter((key) =>
    reviewDraft.changedKeys.includes(key) ||
    JSON.stringify(currentEffectiveValues[key]) !== JSON.stringify(reviewDraft.effectiveSettings[key])) : [];
  const effectiveChangedCount = reviewDraft ? reviewKeys.filter((key) =>
    JSON.stringify(currentEffectiveValues[key]) !== JSON.stringify(reviewDraft.effectiveSettings[key])).length : 0;
  const sourceTournamentId = targets.find((item) => item.current)?.tournamentId || data?.tournamentId || "";
  const isFuture = Boolean(targetTournamentId && sourceTournamentId && targetTournamentId !== sourceTournamentId);
  const editable = Boolean(data?.current || data?.draft);

  const startEdit = () => {
    setValues(valuesFor(data));
    setMode("edit");
    setMessage("");
    setReceipt(null);
  };

  const stageAndValidate = async () => {
    const expectedRevision = Number(data?.current?.revision || 0);
    const intent = {
      action: "stage",
      targetTournamentId,
      expectedRevision,
      settings: values,
      reason: clean(reason) || "Director reviewed Prediction Settings revision",
    };
    const operation = identities.current.acquire(intent);
    setBusy("review"); setMessage(""); setReceipt(null);
    try {
      const staged = await jsonRequest(ENDPOINT, { ...intent, operationRequestId: operation.operationRequestId });
      identities.current.confirm(operation);
      const validationIntent = {
        action: "validate",
        targetTournamentId,
        expectedRevision,
        draftId: staged.data.draftId,
      };
      const validationOperation = identities.current.acquire(validationIntent);
      await jsonRequest(ENDPOINT, {
        ...validationIntent,
        operationRequestId: validationOperation.operationRequestId,
      });
      identities.current.confirm(validationOperation);
      await load(targetTournamentId, { quiet: true, forceReview: true });
      setMessage("Validation passed. Review the exact canonical and effective changes before saving.");
    } catch (error) {
      setMessage(error.message);
      if (error.issues?.length) setMessage(`${error.message} ${error.issues.map((item) => item.key || pretty(item.code)).filter(Boolean).join(" · ")}`);
    } finally { setBusy(""); }
  };

  const validateStoredDraft = async () => {
    setBusy("validate"); setMessage(""); setReceipt(null);
    try {
      const validationIntent = {
        action: "validate",
        targetTournamentId,
        expectedRevision: Number(data?.current?.revision || 0),
        draftId: data.draft.draftId,
      };
      const validationOperation = identities.current.acquire(validationIntent);
      await jsonRequest(ENDPOINT, {
        ...validationIntent,
        operationRequestId: validationOperation.operationRequestId,
      });
      identities.current.confirm(validationOperation);
      await load(targetTournamentId, { quiet: true, forceReview: true });
      setMessage("Validation passed. Review the exact canonical and effective changes before saving.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };

  const saveRevision = async () => {
    if (!globalThis.confirm?.("Save this reviewed Prediction Settings revision? This makes the settings current, marks prior calculations stale, and does not calculate or publish Odds.")) return;
    const intent = {
      action: "commit",
      targetTournamentId,
      expectedRevision: Number(data?.current?.revision || 0),
      draftId: data.draft.draftId,
      confirmation: SAVE_CONFIRMATION,
    };
    const operation = identities.current.acquire(intent);
    setBusy("save"); setMessage(""); setReceipt(null);
    try {
      const result = await jsonRequest(ENDPOINT, { ...intent, operationRequestId: operation.operationRequestId });
      identities.current.confirm(operation);
      const readback = await load(targetTournamentId, { quiet: true });
      await onChanged?.();
      setReason("");
      const committedRevision = Number(result.data.configurationRevision || 0);
      const history = readback?.history?.find((item) =>
        Number(item.revision) === committedRevision && item.current === true);
      setReceipt({
        revision: committedRevision,
        effectiveAt: result.data.effectiveAt || readback?.current?.effectiveAt,
        director: result.data.directorPlayerId || history?.actorPlayerId,
        changedSettingCount: Number(result.data.changedSettingCount || 0),
        recalculationRequired: result.data.recalculationRequired === true || readback?.relationship?.recalculationRequired === true,
      });
      setMessage("The settings revision is current. No calculation or publication was requested.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };

  const copyPrevious = async () => {
    const intent = {
      action: "copy-previous",
      targetTournamentId,
      sourceTournamentId,
      expectedRevision: Number(data?.current?.revision || 0),
      reason: "Copy prior Prediction Settings for Director review",
    };
    const operation = identities.current.acquire(intent);
    setBusy("copy"); setMessage(""); setReceipt(null);
    try {
      await jsonRequest(ENDPOINT, { ...intent, operationRequestId: operation.operationRequestId });
      identities.current.confirm(operation);
      await load(targetTournamentId, { quiet: true });
      setMessage("Prior settings were copied into a review draft only. They are not current and no calculation or publication was created.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(""); }
  };

  if (phase === "loading") return <div className={styles.predictionLoading}>Loading authoritative Prediction Settings…</div>;
  if (phase === "failure" || !data) return <div className={styles.inlineNotice} role="alert">{message || "Prediction Settings are temporarily unavailable."} <button type="button" onClick={() => load(targetTournamentId)}>Retry</button></div>;

  return <div className={styles.predictionEditor}>
    <div className={styles.predictionToolbar}>
      <label>
        <span>Tournament</span>
        <select value={targetTournamentId} disabled={Boolean(busy)} onChange={(event) => { setMessage(""); setReceipt(null); load(event.target.value); }}>
          {(targets.length ? targets : [{ tournamentId: data.tournamentId, tournamentYear: Number(data.tournamentId), current: true }]).map((item) => <option key={item.tournamentId} value={item.tournamentId}>{item.tournamentYear || item.tournamentId}{item.current ? " · Current" : ` · ${pretty(item.lifecycle)}`}</option>)}
        </select>
      </label>
      <div>
        <small>Current revision</small>
        <strong>{data.current?.revision ?? "Not configured"}</strong>
        <span>{data.current ? `${provenanceLabel(data.current.authoringAuthority)} · ${timestamp(data.current.effectiveAt)}` : "No current revision"}</span>
      </div>
      <div>
        <small>Review draft</small>
        <strong>{data.draft ? `Draft ${data.draft.draftRevision}` : "None"}</strong>
        <State value={data.draft?.state || "NOT_STARTED"} />
      </div>
    </div>

    <Relationship relationship={data.relationship} />

    {mode === "review" && reviewDraft ? <section className={styles.predictionReview}>
      <header><div><span>Validated review</span><h3>{reviewDraft.changedSettingCount} canonical setting{reviewDraft.changedSettingCount === 1 ? "" : "s"} changed</h3></div><State value={reviewDraft.state} /></header>
      <p>Canonical values are stored exactly as reviewed. Effective values show the existing runtime interpretation{effectiveChangedCount ? ` across ${effectiveChangedCount} setting${effectiveChangedCount === 1 ? "" : "s"}` : ""}.</p>
      <div className={styles.predictionChanges} role="table" aria-label="Prediction Settings changes">
        <div role="row"><strong>Setting</strong><strong>Current</strong><strong>Proposed</strong><strong>Current effective</strong><strong>Proposed effective</strong></div>
        {reviewKeys.map((key) => <div role="row" key={key}>
          <span>{specByKey.get(key)?.displayLabel || key}</span>
          <span>{displaySettingValue(key, currentValues[key])}</span>
          <strong>{displaySettingValue(key, reviewDraft.canonicalSettings[key])}</strong>
          <span>{displaySettingValue(key, currentEffectiveValues[key])}</span>
          <span>{displaySettingValue(key, reviewDraft.effectiveSettings[key])}</span>
        </div>)}
      </div>
      <div className={styles.actionRow}>
        <button type="button" disabled={Boolean(busy)} onClick={startEdit}>Back to Edit</button>
        <button type="button" className={styles.primaryButton} disabled={Boolean(busy) || upper(reviewDraft.state) !== "VALIDATED"} onClick={saveRevision}>{busy === "save" ? "Saving revision…" : "Save Revision"}</button>
      </div>
    </section> : <>
      {data.categories.map((category) => <details className={styles.predictionCategory} key={category.id} open={mode === "edit" || category.id === "category-weight"}>
        <summary><span><strong>{category.label}</strong><small>{category.description}</small></span><b>{category.settings.length}</b></summary>
        <div className={styles.predictionSettingGrid}>
          {category.settings.map((key) => {
            const specification = specByKey.get(key);
            if (!specification) return null;
            const changed = settingChanged(specification, currentValues[key], values[key]);
            return <label className={styles.predictionSetting} key={key}>
              <span><strong>{specification.displayLabel}</strong><small>{specification.description}</small></span>
              {mode === "edit" ? <span className={styles.predictionEditValue} data-changed={changed}>
                <span className={styles.predictionEditComparison}><span>Current <b>{displaySettingValue(key, currentValues[key])}</b></span><em>{changed ? "Changed" : "Unchanged"}</em></span>
                <span className={styles.predictionProposedValue}><small>Proposed</small><SettingControl specification={specification} value={values[key]} disabled={Boolean(busy)} onChange={(value) => setValues((current) => ({ ...current, [key]: value }))} /></span>
              </span> : <b>{displaySettingValue(key, values[key])}</b>}
            </label>;
          })}
        </div>
      </details>)}
      {mode === "edit" ? <label className={styles.operationField}>Revision note<textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Briefly explain why these settings are changing." /><small>This note is stored with the reviewed revision.</small></label> : null}
      <div className={styles.actionRow}>
        {mode === "view" && editable ? <button type="button" className={styles.primaryButton} disabled={Boolean(busy)} onClick={startEdit}>{data.draft ? "Edit Draft" : "Edit Settings"}</button> : null}
        {mode === "view" && upper(data.draft?.state) === "STAGED" ? <button type="button" disabled={Boolean(busy)} onClick={validateStoredDraft}>{busy === "validate" ? "Validating…" : "Validate Stored Draft"}</button> : null}
        {mode === "edit" ? <><button type="button" disabled={Boolean(busy)} onClick={() => { setMode("view"); setValues(valuesFor(data)); }}>Cancel</button><button type="button" className={styles.primaryButton} disabled={Boolean(busy) || !changedKeys.length} onClick={stageAndValidate}>{busy === "review" ? "Validating…" : "Validate & Review"}</button></> : null}
        {mode === "view" && isFuture && !data.draft ? <button type="button" disabled={Boolean(busy)} onClick={copyPrevious}>{busy === "copy" ? "Creating draft…" : "Copy Previous as Draft"}</button> : null}
      </div>
    </>}

    {data.history?.length ? <details className={styles.predictionHistory}>
      <summary>Revision history · {data.history.length}</summary>
      <ul>{data.history.map((item) => <li key={item.configurationId}><span><strong>Revision {item.revision}</strong><small>{provenanceLabel(item.authoringAuthority)} · {timestamp(item.effectiveAt)}</small></span>{item.current ? <State value="CURRENT" /> : <span>{item.changedSettingCount ? `${item.changedSettingCount} changed` : "Certified revision"}</span>}</li>)}</ul>
    </details> : null}
    {receipt ? <div className={styles.predictionReceipt} role="status">
      <header><div><small>Revision saved</small><strong>Prediction Settings revision {receipt.revision}</strong></div><State value="CURRENT" /></header>
      <dl>
        <div><dt>Effective time</dt><dd>{timestamp(receipt.effectiveAt)}</dd></div>
        <div><dt>Director</dt><dd>{receipt.director || "Authorized Director"}</dd></div>
        <div><dt>Changed settings</dt><dd>{receipt.changedSettingCount}</dd></div>
        <div><dt>Recalculation</dt><dd>{receipt.recalculationRequired ? "Required" : "Current"}</dd></div>
      </dl>
      <p>No calculation or publication was requested.</p>
    </div> : null}
    {message ? <p className={styles.operationMessage} role="status">{message}</p> : null}
  </div>;
}
