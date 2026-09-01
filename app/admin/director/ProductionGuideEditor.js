"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClientMutationOperationIdentityRegistry } from "../../../lib/client-mutation-operation-identity.js";
import styles from "./production-guide-editor.module.css";

const ENDPOINT = "/api/director/guide";
const PUBLISH_CONFIRMATION = "PUBLISH TOURNAMENT GUIDE";
const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const integer = (value) => Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const first = (value, ...keys) => {
  for (const key of keys) if (value?.[key] !== undefined && value?.[key] !== null) return value[key];
  return undefined;
};
const pretty = (value) => clean(value || "Unavailable").toLowerCase().replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());
const timestamp = (value) => Number.isFinite(Date.parse(clean(value)))
  ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  : "Not available";

const field = (key, label, type = "text", options = undefined) => Object.freeze({ key, label, type, options });
const STATUS = Object.freeze(["Draft", "Published", "Archived", "Cancelled"]);
const TIMELINE_STATUS = Object.freeze(["", "Upcoming", "Live", "Completed", "Complete", "Delayed", "Cancelled", "Canceled"]);
const DOMAINS = Object.freeze([
  Object.freeze({ key: "tournament", label: "Overview", singular: "Tournament presentation", singleton: true, fields: Object.freeze([
    field("Tournament ID", "Tournament ID", "readonly"), field("Year", "Year", "readonly"),
    field("Tournament Name", "Tournament name"), field("Tournament Edition", "Annual label"),
    field("Tournament Dates", "Dates"), field("Destination", "Destination"), field("Location", "Location"),
    field("Start Date", "Start date", "date"), field("End Date", "End date", "date"),
    field("Time Zone", "Time zone"), field("Annual Image", "Tournament logo / annual image", "asset"),
    field("Hero Image", "Website hero image", "asset"), field("Mobile Hero Image", "Mobile hero image", "asset"),
  ]) }),
  Object.freeze({ key: "overview", label: "Sections", singular: "Guide section", id: "Section ID", order: "Display Order", status: true, fields: Object.freeze([
    field("Section ID", "Section ID", "id"), field("Section Name", "Name"), field("Section Slug", "Slug"),
    field("Description", "Description", "textarea"), field("Display Order", "Display order", "number"),
    field("Status", "Status", "select", STATUS),
  ]) }),
  Object.freeze({ key: "schedule", label: "Schedule / Itinerary", singular: "Itinerary event", id: "Event ID", order: "Display Order", status: true, fields: Object.freeze([
    field("Event ID", "Event ID", "id"), field("Event Date", "Event date", "date"), field("Day Label", "Day label"),
    field("Start Time", "Start time"), field("End Time", "End time"), field("Event Type", "Event type"),
    field("Title", "Title"), field("Subtitle", "Subtitle"), field("Location", "Location"),
    field("Details", "Details", "textarea"), field("Round ID", "Round ID", "round"), field("Course ID", "Course ID", "course"),
    field("Display Order", "Display order", "number"), field("Status", "Status", "select", STATUS), field("Featured", "Featured", "boolean"),
  ]) }),
  Object.freeze({ key: "timelineRows", label: "Timeline", singular: "Timeline event", order: "Sort Order", fields: Object.freeze([
    field("Tournament Day", "Tournament day"), field("Event Date", "Event date", "date"),
    field("Start Time", "Start time"), field("End Time", "End time"), field("Event Type", "Event type"),
    field("Title", "Title"), field("Subtitle", "Subtitle"), field("Location", "Location"),
    field("Display on Home", "Display on Home", "boolean"), field("Notification Minutes", "Notification minutes", "number"),
    field("Sort Order", "Sort order", "number"), field("Status Override", "Status override", "select", TIMELINE_STATUS),
  ]) }),
  Object.freeze({ key: "ruleBook", label: "Rule Book", singular: "Rule", id: "Rule ID", order: "Display Order", status: true, fields: Object.freeze([
    field("Rule ID", "Rule ID", "id"), field("Category", "Category"), field("Subcategory", "Subcategory"),
    field("Title", "Title"), field("Body", "Body", "textarea"), field("Display Order", "Display order", "number"),
    field("Status", "Status", "select", STATUS), field("Effective Year", "Effective year", "number"), field("Important", "Important", "boolean"),
  ]) }),
  Object.freeze({ key: "tournamentRules", label: "Tournament Rules", singular: "Round rule presentation", fields: Object.freeze([
    field("Round", "Round", "round"), field("Format", "Format"), field("Team Size", "Team size", "number"),
    field("Points Available", "Points available"), field("Front 9 Used", "Front 9 used", "boolean"),
    field("Back 9 Used", "Back 9 used", "boolean"), field("Overall Used", "Overall used", "boolean"),
    field("Front 9 Points", "Front 9 points"), field("Back 9 Points", "Back 9 points"), field("Overall Points", "Overall points"),
    field("Description", "Description", "textarea"), field("Rules", "Rules", "textarea"), field("Handicap Allocation", "Handicap copy", "textarea"),
    field("Scoring Format", "Scoring presentation"), field("Match Format", "Match format copy"),
  ]) }),
  Object.freeze({ key: "rounds", label: "Rounds Presentation", singular: "Format presentation", id: "Format ID", fields: Object.freeze([
    field("Format ID", "Format ID", "id"), field("Name", "Name"), field("Team Size", "Team size", "number"),
    field("Description", "Description", "textarea"), field("Rules", "Rules", "textarea"), field("Handicap Allocation", "Handicap copy", "textarea"),
    field("Scoring Format", "Scoring presentation"), field("Match Format", "Match format copy"),
  ]) }),
  Object.freeze({ key: "dining", label: "Dining", singular: "Dining event", order: "Sort Order", fields: Object.freeze([
    field("Day", "Day"), field("Meal", "Meal"), field("Cuisine", "Cuisine"), field("Start Time", "Start time"),
    field("End Time", "End time"), field("Location", "Location"), field("Dress Code", "Dress code"),
    field("Reservations Required", "Reservation required", "boolean"), field("Notes", "Notes", "textarea"), field("Sort Order", "Sort order", "number"),
  ]) }),
  Object.freeze({ key: "localGuide", label: "Local Guide", singular: "Local guide item", order: "Sort Order", fields: Object.freeze([
    field("Section", "Section"), field("Title", "Title"), field("Description", "Description", "textarea"),
    field("Address", "Address"), field("Phone", "Phone", "phone"), field("Website", "Website", "url"), field("Sort Order", "Sort order", "number"),
  ]) }),
  Object.freeze({ key: "importantContacts", label: "Important Contacts", singular: "Participant-visible contact", order: "Sort Order", fields: Object.freeze([
    field("Category", "Category"), field("Name", "Name"), field("Role", "Role"), field("Phone", "Phone", "phone"),
    field("Text Enabled", "Text enabled", "boolean"), field("Email", "Email", "email"), field("Website", "Website", "url"), field("Sort Order", "Sort order", "number"),
  ]) }),
  Object.freeze({ key: "courses", label: "Courses", singular: "Course presentation", fields: Object.freeze([
    field("Course ID", "Canonical Course ID", "course"), field("Round", "Round", "round"), field("Format", "Format"),
    field("Course", "Course name"), field("City", "City"), field("State", "State"), field("Destination", "Destination"),
    field("Year Opened", "Year opened", "number"), field("Designer", "Designer"), field("Website", "Website", "url"),
    field("Course Logo", "Course logo", "asset"), field("Course Profile Image", "Course profile image", "asset"), field("GPS Link", "GPS link", "url"),
    field("Course Overview", "Overview", "textarea"), field("Playing Tips", "Playing tips", "textarea"),
    field("Signature Holes", "Signature holes", "textarea"), field("History", "History", "textarea"), field("Course Notes", "Notes", "textarea"),
  ]) }),
]);

const EMPTY_CONTENT = Object.freeze({ tournament: {}, overview: [], schedule: [], timelineRows: [], ruleBook: [], tournamentRules: [], rounds: [], dining: [], localGuide: [], importantContacts: [], courses: [] });

async function jsonRequest(body, query = "") {
  const response = await fetch(`${ENDPOINT}${query}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `The Guide operation did not complete (${response.status}).`);
    error.code = payload.code;
    error.issues = Array.isArray(payload.issues) ? payload.issues : [];
    throw error;
  }
  return payload;
}

function contentFrom(value) {
  const direct = first(value, "authoringContent", "authoring_content", "content", "guide");
  const projectionEnvelope = first(value, "projectionPayload", "projection_payload", "projection");
  const source = direct || first(projectionEnvelope, "content", "projection", "guide") || projectionEnvelope || value || {};
  return Object.fromEntries(Object.entries(EMPTY_CONTENT).map(([key, fallback]) => {
    const selected = source?.[key];
    if (Array.isArray(fallback)) return [key, Array.isArray(selected) ? selected.map((row) => ({ ...row })) : []];
    return [key, selected && typeof selected === "object" && !Array.isArray(selected) ? { ...selected } : {}];
  }));
}

function revisionNumber(value) {
  return integer(first(value, "revisionNumber", "revision_number", "revision", "currentRevision", "current_revision"));
}

function draftVersion(value) {
  return integer(first(value, "draftVersion", "draft_version", "version"));
}

function draftId(value) {
  return clean(first(value, "draftId", "draft_id", "id"));
}

function issueText(issue) {
  if (typeof issue === "string") return issue;
  return clean(issue?.message || issue?.reason || issue?.code || "Guide content needs review.");
}

function State({ value }) {
  const normalized = upper(value);
  return <span className={styles.state} data-state={["CURRENT", "PUBLISHED", "VALIDATED", "READY"].includes(normalized) ? "ready" : ["INVALID", "FAILED", "CONFLICT", "STALE"].includes(normalized) ? "attention" : "neutral"}>{pretty(value)}</span>;
}

function booleanValue(value) {
  return value === true || /^(?:true|yes|1|y)$/i.test(clean(value));
}

function itemStatus(row) {
  return clean(row?.Status) || (booleanValue(row?.Published) ? "Published" : "Draft");
}

function FieldControl({ definition, value, disabled, references, onChange, controlId }) {
  const safeControlId = clean(controlId).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const id = `guide-${safeControlId}-${definition.key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  if (definition.type === "textarea") return <label htmlFor={id}><span>{definition.label}</span><textarea id={id} rows={4} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
  if (definition.type === "boolean") return <label className={styles.check} htmlFor={id}><input id={id} type="checkbox" checked={booleanValue(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked ? "TRUE" : "FALSE")} /><span>{definition.label}</span></label>;
  if (definition.type === "select") return <label htmlFor={id}><span>{definition.label}</span><select id={id} value={value || definition.options?.[0] || ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{definition.options.map((option) => <option key={option || "derived"} value={option}>{option || "Automatic / derived"}</option>)}</select></label>;
  const referenceOptions = definition.type === "course" ? references.courses : definition.type === "round" ? references.rounds : [];
  if (referenceOptions.length) {
    const selectedReference = clean(value);
    const options = selectedReference && !referenceOptions.some((option) => option.id === selectedReference)
      ? [{ id: selectedReference, label: `${selectedReference} · Current value` }, ...referenceOptions]
      : referenceOptions;
    return <label htmlFor={id}><span>{definition.label}</span><select id={id} value={selectedReference} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Select {definition.type}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label || option.name || option.id}</option>)}</select></label>;
  }
  const inputType = definition.type === "phone" ? "tel" : ["date", "number", "email", "url"].includes(definition.type) ? definition.type : "text";
  return <label htmlFor={id}><span>{definition.label}</span><input id={id} type={inputType} value={value ?? ""} disabled={disabled} readOnly={definition.type === "readonly"} aria-readonly={definition.type === "readonly" || undefined} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Preview({ content, onClose }) {
  const closeButton = useRef(null);
  const tournament = content.tournament || {};
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const keepPrivatePreviewModal = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButton.current?.focus();
      }
    };
    window.addEventListener("keydown", keepPrivatePreviewModal);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keepPrivatePreviewModal);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);
  return <div className={styles.previewBackdrop} role="presentation" data-preview-visibility="director-only">
    <section className={styles.preview} role="dialog" aria-modal="true" aria-labelledby="guide-preview-title" aria-describedby="guide-preview-description">
      <header><div><span>DRAFT PREVIEW</span><h2 id="guide-preview-title">{tournament["Tournament Name"] || "Tournament Guide"}</h2><p>{[tournament["Tournament Dates"] || tournament.Dates, tournament.Destination || tournament.Location].filter(Boolean).join(" · ")}</p></div><button ref={closeButton} type="button" onClick={onClose}>Close Preview</button></header>
      <div className={styles.previewBody}>
        {DOMAINS.filter((domain) => !domain.singleton).map((domain) => {
          const rows = content[domain.key] || [];
          return <section key={domain.key}><h3>{domain.label}</h3>{rows.length ? rows.map((row, index) => <article key={`${domain.key}-${row.itemId || row.item_id || index}`}><strong>{row.Title || row.Name || row[domain.id] || row.Course || row.Meal || row.Category || `${domain.singular} ${index + 1}`}</strong><p>{row.Description || row.Details || row.Body || row.Location || row.Role || "Configured content"}</p></article>) : <p>No content in this section.</p>}</section>;
        })}
      </div>
      <footer id="guide-preview-description">This sanitized preview is visible only to the authenticated Director. It does not change the public website or participant/PWA Guide until Publish Revision succeeds.</footer>
    </section>
  </div>;
}

export default function ProductionGuideEditor({ onChanged }) {
  const [phase, setPhase] = useState("loading");
  const [data, setData] = useState(null);
  const [targetTournamentId, setTargetTournamentId] = useState("");
  const [activeDomain, setActiveDomain] = useState("tournament");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [content, setContent] = useState(contentFrom());
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const identities = useRef(null);
  const loadSequence = useRef(0);
  if (!identities.current) identities.current = createClientMutationOperationIdentityRegistry();

  const load = useCallback(async (target = "", quiet = false) => {
    const sequence = loadSequence.current + 1;
    loadSequence.current = sequence;
    if (!quiet) setPhase("loading");
    try {
      const query = target ? `?targetTournamentId=${encodeURIComponent(target)}` : "";
      const payload = await jsonRequest(null, query);
      if (sequence !== loadSequence.current) return null;
      const next = payload.data || {};
      const selected = clean(first(next, "targetTournamentId", "target_tournament_id", "tournamentId", "tournament_id")) || clean(target) || "2026";
      const draft = first(next, "openDraft", "open_draft", "draft");
      setData(next);
      setTargetTournamentId(selected);
      setContent(contentFrom(draft || next.current));
      setDirty(false);
      setReason("");
      setPreview(null);
      setSelectedIndex(0);
      setPhase("ready");
      return next;
    } catch (error) {
      if (sequence !== loadSequence.current) return null;
      setMessage(error.message);
      setPhase("failure");
      return null;
    }
  }, []);

  useEffect(() => {
    load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  const domain = DOMAINS.find((item) => item.key === activeDomain) || DOMAINS[0];
  const rows = domain.singleton ? [content[domain.key] || {}] : content[domain.key] || [];
  const selected = rows[selectedIndex] || {};
  const openDraft = first(data, "openDraft", "open_draft", "draft");
  const currentRevision = revisionNumber(data?.current);
  const currentRevisionId = clean(first(data?.current, "revisionId", "revision_id"));
  const targets = useMemo(() => (Array.isArray(data?.targets) ? data.targets : []).map((target) => ({
    tournamentId: clean(first(target, "tournamentId", "tournament_id", "id")),
    tournamentYear: integer(first(target, "tournamentYear", "tournament_year", "year")),
    lifecycle: clean(first(target, "lifecycle", "state", "status")),
    current: target?.current === true || target?.isCurrent === true,
  })).filter((target) => target.tournamentId), [data]);
  const currentTournamentId = clean(first(data, "currentTournamentId", "current_tournament_id")) || targets.find((target) => target.current)?.tournamentId || "2026";
  const currentTournamentYear = targets.find((target) => target.tournamentId === currentTournamentId)?.tournamentYear || integer(currentTournamentId);
  const selectedTournamentYear = targets.find((target) => target.tournamentId === targetTournamentId)?.tournamentYear || integer(targetTournamentId);
  const isFuture = Boolean(selectedTournamentYear && currentTournamentYear && selectedTournamentYear > currentTournamentYear);
  const state = upper(first(openDraft, "state", "status", "validationState", "validation_state") || "DRAFT");
  const storedIssues = first(openDraft, "validationIssues", "validation_issues", "issues");
  const issues = dirty ? [] : Array.isArray(storedIssues) ? storedIssues : [];
  const references = useMemo(() => {
    const context = first(data, "references", "canonicalContext", "canonical_context") || {};
    const courses = (Array.isArray(context.courses) ? context.courses : []).map((item) => {
      const id = clean(first(item, "id", "courseId", "course_id") ?? item);
      const assignedRounds = (Array.isArray(item?.rounds) ? item.rounds : []).map((round) => integer(first(round, "round", "roundId", "round_id"))).filter(Boolean);
      const suffix = assignedRounds.length ? ` · Round${assignedRounds.length === 1 ? "" : "s"} ${assignedRounds.join(", ")}` : "";
      return { id, label: `${clean(first(item, "label", "name", "courseName", "course_name")) || id}${suffix}` };
    }).filter((item) => item.id);
    const rounds = (Array.isArray(context.rounds) ? context.rounds : []).map((item) => {
      const id = clean(first(item, "id", "roundId", "round_id", "round") ?? item);
      const format = clean(first(item, "format", "name", "label"));
      return { id, label: [`Round ${id}`, format].filter(Boolean).join(" · ") };
    }).filter((item) => item.id);
    return { courses, rounds };
  }, [data]);

  const markDirty = () => {
    setDirty(true);
    setPreview(null);
    setMessage("Guide draft changes are unsaved. Save Draft Changes before validating or publishing.");
  };
  const setRow = (next) => {
    markDirty();
    setContent((current) => domain.singleton
      ? { ...current, [domain.key]: next }
      : { ...current, [domain.key]: (current[domain.key] || []).map((row, index) => index === selectedIndex ? next : row) });
  };
  const changeField = (key, value) => setRow({ ...selected, [key]: value });
  const addRow = () => {
    const next = Object.fromEntries(domain.fields.map((definition) => [definition.key, definition.type === "boolean" ? "FALSE" : definition.type === "select" ? definition.options[0] : ""]));
    if (domain.order) next[domain.order] = String(rows.length + 1);
    markDirty();
    setContent((current) => ({ ...current, [domain.key]: [...(current[domain.key] || []), next] }));
    setSelectedIndex(rows.length);
  };
  const removeRow = () => {
    if (domain.singleton || !globalThis.confirm?.(`Remove this ${domain.singular} from the draft?`)) return;
    markDirty();
    setContent((current) => ({ ...current, [domain.key]: (current[domain.key] || []).filter((_, index) => index !== selectedIndex) }));
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };
  const moveRow = (direction) => {
    const target = selectedIndex + direction;
    if (domain.singleton || !domain.order || target < 0 || target >= rows.length) return;
    const nextRows = rows.map((row) => ({ ...row }));
    [nextRows[selectedIndex], nextRows[target]] = [nextRows[target], nextRows[selectedIndex]];
    nextRows.forEach((row, index) => { row[domain.order] = String(index + 1); });
    markDirty();
    setContent((current) => ({ ...current, [domain.key]: nextRows }));
    setSelectedIndex(target);
  };

  const mutation = async (action, extra = {}) => {
    const currentDraftId = draftId(openDraft);
    const intent = {
      action,
      targetTournamentId,
      expectedRevision: currentRevision,
      ...(currentRevisionId ? { expectedRevisionId: currentRevisionId } : {}),
      ...(currentDraftId ? { expectedDraftVersion: draftVersion(openDraft), draftId: currentDraftId } : {}),
      ...extra,
    };
    const operation = identities.current.acquire(intent);
    setBusy(action); setMessage("");
    try {
      const result = await jsonRequest({ ...intent, operationRequestId: operation.operationRequestId });
      identities.current.confirm(operation);
      if (action === "preview") {
        setPreview(contentFrom(first(result.data, "preview", "content", "projection") || result.data));
      } else {
        await load(targetTournamentId, true);
        if (action === "publish") await onChanged?.();
      }
      setMessage({ stage: "Guide draft saved in Supabase. Published content is unchanged.", validate: "Validation passed. Preview the exact draft before publishing.", publish: "The reviewed Guide revision is now current. No Google synchronization is required.", discard: "The open Guide draft was discarded. Published content is unchanged.", "copy-previous": "The prior Guide was copied as an unpublished review draft. Dates, contacts, links, and publication state require review." }[action] || "Guide operation completed.");
      return result;
    } catch (error) {
      setMessage(error.issues?.length ? `${error.message} ${error.issues.map(issueText).join(" · ")}` : error.message);
      return null;
    } finally { setBusy(""); }
  };

  const stage = () => mutation("stage", { content, reason: clean(reason) || "Tournament Guide Director draft" });
  const validate = () => mutation("validate");
  const showPreview = () => mutation("preview");
  const publish = () => {
    if (!globalThis.confirm?.("Publish this validated Tournament Guide revision? Public and participant Guide reads will switch atomically.")) return;
    mutation("publish", {
      confirmation: PUBLISH_CONFIRMATION,
      contentFingerprint: first(openDraft, "contentFingerprint", "content_fingerprint", "projectionFingerprint", "projection_fingerprint"),
      reason: clean(reason) || "Publish validated Tournament Guide revision",
    });
  };
  const discard = () => {
    if (!globalThis.confirm?.("Discard this unpublished Guide draft? The current published Guide will not change.")) return;
    mutation("discard", { reason: "Discard unpublished Tournament Guide draft" });
  };
  const copyPrevious = () => {
    const priorYear = selectedTournamentYear - 1;
    const sourceTournamentId = targets.find((target) => target.tournamentYear === priorYear)?.tournamentId || String(priorYear);
    mutation("copy-previous", { sourceTournamentId, reason: "Copy previous Tournament Guide for annual review" });
  };

  if (phase === "loading") return <div className={styles.loading}>Loading authoritative Tournament Guide…</div>;
  if (phase === "failure" || !data) return <div className={styles.notice} role="alert">{message || "Guide authoring is temporarily unavailable."} <button type="button" onClick={() => load(targetTournamentId)}>Retry</button></div>;

  const history = Array.isArray(data.history) ? data.history : [];
  return <div className={styles.editor}>
    <div className={styles.toolbar}>
      <label><span>Tournament</span><select value={targetTournamentId} disabled={Boolean(busy)} onChange={(event) => load(event.target.value)}>{(targets.length ? targets : [{ tournamentId: targetTournamentId, current: true }]).map((target) => <option key={target.tournamentId || target.tournament_id} value={target.tournamentId || target.tournament_id}>{target.tournamentYear || target.tournament_year || target.tournamentId}{target.current ? " · Current" : target.lifecycle ? ` · ${pretty(target.lifecycle)}` : ""}</option>)}</select></label>
      <div><small>Published revision</small><strong>{currentRevision || "Imported current"}</strong><span>{first(data.current, "provenance", "authoringAuthority", "authoring_authority") || "Google import preserved"}</span></div>
      <div><small>Open draft</small><strong>{openDraft ? `Version ${draftVersion(openDraft) || 1}` : "None"}</strong>{openDraft ? <State value={dirty ? "DRAFT" : state} /> : <span>Published Guide unchanged</span>}</div>
      <div><small>Publication</small><strong>{data.current ? "Published" : "Not published"}</strong><State value={data.current ? "CURRENT" : "DRAFT"} /></div>
    </div>

    <nav className={styles.domainTabs} aria-label="Tournament Guide authoring sections">{DOMAINS.map((item) => <button type="button" key={item.key} disabled={Boolean(busy)} aria-current={activeDomain === item.key ? "page" : undefined} onClick={() => { setActiveDomain(item.key); setSelectedIndex(0); }}>{item.label}<small>{item.singleton ? 1 : (content[item.key] || []).length}</small></button>)}</nav>
    <p className={styles.statusScope}>Item publication status is available only for Sections, Schedule / Itinerary, and Rule Book. All other areas publish atomically with the validated Guide revision.</p>

    <div className={styles.workspace}>
      {!domain.singleton ? <aside><header><div><small>{domain.label}</small><strong>{rows.length} items</strong></div><button type="button" disabled={Boolean(busy)} onClick={addRow}>Add</button></header>{rows.length ? rows.map((row, index) => <button type="button" disabled={Boolean(busy)} key={`${domain.key}-${row.itemId || row.item_id || row[domain.id] || row.Title || row.Name || index}`} aria-current={selectedIndex === index ? "true" : undefined} onClick={() => setSelectedIndex(index)}><strong>{row.Title || row.Name || row[domain.id] || row.Course || row.Meal || row.Category || `${domain.singular} ${index + 1}`}</strong><span>{domain.order ? `Order ${row[domain.order] || index + 1}` : domain.status ? itemStatus(row) : domain.singular}</span></button>) : <p>No {domain.label.toLowerCase()} content is in this draft.</p>}</aside> : null}
      <section className={styles.formPanel}>
        <header><div><small>{domain.singleton ? "Guide presentation" : domain.singular}</small><h3>{domain.label}</h3></div>{!domain.singleton && rows.length ? <div className={styles.orderActions}>{domain.order ? <><button type="button" disabled={Boolean(busy) || selectedIndex === 0} aria-label={`Move ${domain.singular} up`} onClick={() => moveRow(-1)}>↑</button><button type="button" disabled={Boolean(busy) || selectedIndex >= rows.length - 1} aria-label={`Move ${domain.singular} down`} onClick={() => moveRow(1)}>↓</button></> : null}<button type="button" disabled={Boolean(busy)} data-impact="high" onClick={removeRow}>Remove</button></div> : null}</header>
        {domain.singleton || rows.length ? <div className={styles.formGrid}>{domain.fields.map((definition) => <FieldControl key={definition.key} definition={definition} value={definition.key === "Status" ? itemStatus(selected) : selected[definition.key]} disabled={Boolean(busy)} references={references} controlId={`${activeDomain}-${selected.itemId || selected.item_id || selectedIndex}`} onChange={(value) => changeField(definition.key, value)} />)}</div> : <div className={styles.empty}><strong>No item selected</strong><p>Add the first {domain.singular.toLowerCase()} to this draft.</p></div>}
        {domain.key === "importantContacts" ? <div className={styles.privacyNote}><strong>Participant-visible contact</strong><span>Only intentionally public tournament contacts belong here. Player enrollment email, phone, and Auth identity data are never sourced automatically.</span></div> : null}
        {["tournamentRules", "rounds", "courses"].includes(domain.key) ? <div className={styles.privacyNote}><strong>Presentation only</strong><span>Canonical scoring rounds, courses, tees, ratings, slopes, pars, and holes remain read-only Tournament Setup facts.</span></div> : null}
      </section>
    </div>

    <label className={styles.reason}><span>Draft note</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Describe this Guide revision for the Director audit." /></label>
    {dirty ? <div className={styles.dirtyNotice} role="status"><strong>Draft changes are not validated</strong><span>Save this draft before Validate, Preview, or Publish Revision. The current public and participant/PWA Guide remains unchanged.</span></div> : null}
    {issues.length ? <div className={styles.validation} role="alert"><strong>Validation needs attention</strong><ul>{issues.map((issue, index) => <li key={`${issueText(issue)}-${index}`}>{issueText(issue)}</li>)}</ul></div> : null}
    <div className={styles.actions}>
      <button type="button" disabled={Boolean(busy)} onClick={stage}>{busy === "stage" ? "Saving draft…" : openDraft ? "Save Draft Changes" : "Create Guide Draft"}</button>
      {openDraft ? <><button type="button" disabled={Boolean(busy) || dirty} onClick={validate}>{busy === "validate" ? "Validating…" : "Validate"}</button><button type="button" disabled={Boolean(busy) || dirty || state !== "VALIDATED"} onClick={showPreview}>{busy === "preview" ? "Preparing preview…" : "Preview"}</button><button type="button" className={styles.publish} disabled={Boolean(busy) || dirty || state !== "VALIDATED"} onClick={publish}>{busy === "publish" ? "Publishing…" : "Publish Revision"}</button><button type="button" className={styles.discard} disabled={Boolean(busy)} onClick={discard}>Discard Draft</button></> : null}
      {!openDraft && isFuture ? <button type="button" disabled={Boolean(busy)} onClick={copyPrevious}>{busy === "copy-previous" ? "Creating draft…" : "Copy Previous Guide as Draft"}</button> : null}
    </div>
    {message ? <p className={styles.message} role="status">{message}</p> : null}
    {history.length ? <details className={styles.history}><summary>Guide revision history · {history.length}</summary><ul>{history.map((item, index) => <li key={`${revisionNumber(item)}-${index}`}><span><strong>Guide Revision {revisionNumber(item) || index + 1}</strong><small>{first(item, "provenance", "authoringAuthority", "authoring_authority") || "Google import"} · {timestamp(first(item, "effectiveAt", "effective_at", "publishedAt", "published_at", "createdAt", "created_at", "importedAt", "imported_at"))}</small></span>{item.current ? <State value="CURRENT" /> : null}</li>)}</ul></details> : null}
    {preview ? <Preview content={preview} onClose={() => setPreview(null)} /> : null}
  </div>;
}
