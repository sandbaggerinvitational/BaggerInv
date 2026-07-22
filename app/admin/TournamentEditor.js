"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./admin-center.module.css";

const LABELS = {
  Annual: "Annual edition", "Tournament Status": "Tournament status", Status: "Status", Dates: "Dates",
  Location: "Location", Destination: "Destination", "Hero Image Filename": "Hero image filename",
  "Homepage Image": "Homepage image", "Mobile Hero Image Filename": "Mobile hero image filename",
  "Mobile Hero Image": "Mobile hero image", "Annual Image": "Tournament logo filename",
  "Captain Team 1": "Team 1 captain ID", "Captain Team 2": "Team 2 captain ID",
  "Current Round": "Current round", "Format Label": "Format label",
};

export default function TournamentEditor({ tournamentId, secret, sharedUpdatedBy = "" }) {
  const [data, setData] = useState(null), [draft, setDraft] = useState({}), [updatedBy, setUpdatedBy] = useState(sharedUpdatedBy), [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const fields = useMemo(() => data?.editableFields || [], [data]);
  async function request(method, body) {
    const response = await fetch(`/api/admin/tournament?tournament=${encodeURIComponent(tournamentId)}`, { method, headers: { "content-type": "application/json", "x-admin-secret": secret }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Tournament request failed."); return payload;
  }
  async function load() { setBusy(true); setStatus("Loading tournament settings…"); try { const payload = await request("GET"); setData(payload); setDraft(payload.record); setDirty(false); setStatus(""); } catch (error) { setStatus(error.message); } finally { setBusy(false); } }
  useEffect(() => { if (tournamentId && secret) load(); }, [tournamentId, secret]);
  useEffect(() => { if (sharedUpdatedBy) setUpdatedBy(sharedUpdatedBy); }, [sharedUpdatedBy]);
  async function save(event) { event.preventDefault(); if (!updatedBy.trim()) { setStatus("Enter your name before saving."); return; } setBusy(true); setStatus("Saving…"); try { const payload = await request("POST", { tournament: tournamentId, updates: draft, updatedBy }); setDraft(payload.record); setDirty(false); setStatus("Saved successfully."); } catch (error) { setStatus(`Save failed: ${error.message}`); } finally { setBusy(false); } }
  const change = (name, value) => { setDraft((current) => ({ ...current, [name]: value })); setDirty(true); setStatus("Unsaved changes"); };
  return <section className={styles.tournamentEditor}><div className={styles.editorHeading}><p>Google Sheets</p><h2>Tournament settings</h2><span>Control the tournament identity, dates, status, homepage presentation, captains, and final result from one record.</span></div>{!data ? <div className={styles.notice}>{status || "Loading…"}</div> : <form onSubmit={save}><div className={styles.editorGrid}>{fields.map((field) => {
    const name = field.name;
    if (field.type === "boolean") return <label key={name}>{field.label}<select value={String(draft[name] || "FALSE")} onChange={(event) => change(name, event.target.value)}><option value="TRUE">Yes</option><option value="FALSE">No</option></select></label>;
    if (field.type === "select") return <label key={name}>{field.label}<select value={draft[name] || ""} onChange={(event) => change(name, event.target.value)}><option value="">Select…</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
    return <label key={name}>{field.label || LABELS[name] || name}<input type={["number", "date"].includes(field.type) ? field.type : "text"} value={draft[name] || ""} readOnly={field.type === "readonly"} onChange={(event) => change(name, event.target.value)} /></label>;
  })}<label>Updated by<input value={updatedBy} onChange={(event) => setUpdatedBy(event.target.value)} placeholder="Recorded with the update" /></label></div><div className={styles.editorActions}><button type="submit" disabled={!dirty || busy}>{busy ? "Saving…" : "Save Tournament"}</button><span data-dirty={dirty ? "true" : "false"}>{status || "Saved"}</span></div></form>}</section>;
}
