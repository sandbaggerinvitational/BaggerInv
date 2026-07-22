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

export default function TournamentEditor({ tournamentId, secret }) {
  const [data, setData] = useState(null), [draft, setDraft] = useState({}), [updatedBy, setUpdatedBy] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const fields = useMemo(() => data?.editableFields || [], [data]);
  async function request(method, body) {
    const response = await fetch(`/api/admin/tournament?tournament=${encodeURIComponent(tournamentId)}`, { method, headers: { "content-type": "application/json", "x-admin-secret": secret }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Tournament request failed."); return payload;
  }
  async function load() { setBusy(true); setStatus("Loading tournament settings…"); try { const payload = await request("GET"); setData(payload); setDraft(payload.record); setDirty(false); setStatus(""); } catch (error) { setStatus(error.message); } finally { setBusy(false); } }
  useEffect(() => { if (tournamentId && secret) load(); }, [tournamentId, secret]);
  async function save(event) { event.preventDefault(); if (!updatedBy.trim()) { setStatus("Enter your name before saving."); return; } setBusy(true); setStatus("Saving…"); try { const payload = await request("POST", { tournament: tournamentId, updates: draft, updatedBy }); setDraft(payload.record); setDirty(false); setStatus("Saved successfully."); } catch (error) { setStatus(`Save failed: ${error.message}`); } finally { setBusy(false); } }
  return <section className={styles.tournamentEditor}><div className={styles.editorHeading}><p>Google Sheets</p><h2>Tournament settings</h2><span>Edits update the selected row in the existing Tournaments sheet. Stable IDs and header names are preserved.</span></div>{!data ? <div className={styles.notice}>{status || "Loading…"}</div> : <form onSubmit={save}><div className={styles.editorGrid}>{fields.map((field) => <label key={field}>{LABELS[field] || field}<input value={draft[field] || ""} onChange={(event) => { setDraft((current) => ({ ...current, [field]: event.target.value })); setDirty(true); setStatus("Unsaved changes"); }} /></label>)}<label>Updated by<input value={updatedBy} onChange={(event) => setUpdatedBy(event.target.value)} placeholder="Recorded with the update" /></label></div><div className={styles.editorActions}><button type="submit" disabled={!dirty || busy}>{busy ? "Saving…" : "Save Tournament"}</button><span data-dirty={dirty ? "true" : "false"}>{status || "Saved"}</span></div></form>}</section>;
}
