"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./guide-editor.module.css";

const TYPES = [
  ["sections", "Sections", "Section ID"],
  ["itinerary", "Itinerary", "Event ID"],
  ["rules", "Rules", "Rule ID"],
  ["information", "Information", "Item ID"],
];

const FIELDS = {
  sections: [["Section Name", "text"], ["Section Slug", "text"], ["Description", "textarea"], ["Display Order", "number"], ["Status", "status"]],
  itinerary: [["Event Date", "date"], ["Day Label", "text"], ["Start Time", "time"], ["End Time", "time"], ["Event Type", "text"], ["Title", "text"], ["Subtitle", "text"], ["Location", "text"], ["Details", "textarea"], ["Round ID", "text"], ["Course ID", "text"], ["Display Order", "number"], ["Status", "status"], ["Featured", "boolean"]],
  rules: [["Category", "text"], ["Subcategory", "text"], ["Title", "text"], ["Body", "textarea"], ["Display Order", "number"], ["Status", "status"], ["Effective Year", "number"], ["Important", "boolean"]],
  information: [["Section", "section"], ["Title", "text"], ["Body", "textarea"], ["Label", "text"], ["Link Text", "text"], ["Link URL", "url"], ["Display Order", "number"], ["Status", "status"], ["Sensitive", "boolean"]],
};

const TITLES = { sections: "Section Name", itinerary: "Title", rules: "Title", information: "Title" };
const STATUS = ["Draft", "Published", "Archived", "Cancelled"];

function blank(tournamentId) { return { "Tournament ID": tournamentId, "Display Order": "0", Status: "Draft" }; }

function Field({ field, type, value, onChange }) {
  const id = `guide-${field.replace(/\s+/g, "-").toLowerCase()}`;
  if (type === "textarea") return <label htmlFor={id}>{field}<textarea id={id} rows={field === "Body" || field === "Details" ? 8 : 4} value={value || ""} onChange={(event) => onChange(field, event.target.value)} /></label>;
  if (type === "boolean") return <label className={styles.check} htmlFor={id}><input id={id} type="checkbox" checked={String(value).toLowerCase() === "true" || value === "TRUE"} onChange={(event) => onChange(field, event.target.checked ? "TRUE" : "FALSE")} />{field}</label>;
  if (type === "status") return <label htmlFor={id}>{field}<select id={id} value={value || "Draft"} onChange={(event) => onChange(field, event.target.value)}>{STATUS.map((option) => <option key={option}>{option}</option>)}</select></label>;
  if (type === "section") return <label htmlFor={id}>{field}<select id={id} value={value || "Important Information"} onChange={(event) => onChange(field, event.target.value)}><option>Golf Genius</option><option>Calcutta &amp; Skins</option><option>Important Information</option><option>Overview</option></select></label>;
  return <label htmlFor={id}>{field}<input id={id} type={type} value={value || ""} onChange={(event) => onChange(field, event.target.value)} /></label>;
}

export default function GuideEditor({ tournaments, embedded = false, sharedSecret = "", selectedTournamentId, onTournamentChange }) {
  const [secret, setSecret] = useState(sharedSecret);
  const [data, setData] = useState(null);
  const [active, setActive] = useState("sections");
  const [tournamentId, setTournamentId] = useState(String(selectedTournamentId || tournaments[0]?.id || tournaments[0]?.year || ""));
  const [record, setRecord] = useState(blank(tournamentId));
  const [status, setStatus] = useState("");
  const idField = TYPES.find(([type]) => type === active)?.[2];
  const records = useMemo(() => (data?.[active] || []).filter((item) => String(item["Tournament ID"]) === tournamentId).sort((a, b) => Number(a["Display Order"] || 0) - Number(b["Display Order"] || 0)), [data, active, tournamentId]);

  useEffect(() => { if (selectedTournamentId && String(selectedTournamentId) !== tournamentId) changeTournament(String(selectedTournamentId)); }, [selectedTournamentId]);
  useEffect(() => { if (sharedSecret) setSecret(sharedSecret); }, [sharedSecret]);
  useEffect(() => { if (embedded && sharedSecret && !data) load(); }, [embedded, sharedSecret]);

  async function request(method, body) {
    const response = await fetch("/api/tournament-guide", { method, headers: { "content-type": "application/json", "x-guide-admin-secret": secret }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Guide Editor request failed.");
    return payload;
  }

  async function load() {
    setStatus("Loading Guide content…");
    try { const payload = await request("GET"); setData(payload.data); setStatus("Guide Editor connected."); }
    catch (error) { setStatus(error.message); }
  }

  async function save(nextRecord = record) {
    setStatus("Saving to Google Sheets…");
    try {
      const payload = await request("POST", { type: active, record: { ...nextRecord, "Tournament ID": tournamentId } });
      setData((current) => ({ ...current, [active]: [...(current[active] || []).filter((item) => item[idField] !== payload.record[idField]), payload.record] }));
      setRecord(payload.record);
      setStatus("Saved successfully.");
    } catch (error) { setStatus(error.message); }
  }

  async function remove(item) {
    if (!window.confirm(`Delete “${item[TITLES[active]] || "this item"}”? This cannot be undone.`)) return;
    setStatus("Deleting…");
    try { await request("DELETE", { type: active, id: item[idField] }); setData((current) => ({ ...current, [active]: current[active].filter((row) => row[idField] !== item[idField]) })); setRecord(blank(tournamentId)); setStatus("Deleted successfully."); }
    catch (error) { setStatus(error.message); }
  }

  function switchType(type) { setActive(type); setRecord(blank(tournamentId)); }
  function changeTournament(value) { setTournamentId(value); setRecord(blank(value)); onTournamentChange?.(value); }
  function change(field, value) { setRecord((current) => ({ ...current, [field]: value })); }

  return <section className={`${styles.editor} ${embedded ? styles.embedded : ""}`}>
    {!embedded ? <header><p>SBI Administration</p><h1>Tournament Guide Editor</h1><span>Create, preview, and publish tournament-week information without changing website code.</span></header> : null}
    {!data ? <div className={styles.login}><label>Admin publishing password<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></label><button type="button" disabled={!secret} onClick={load}>Open Guide Editor</button>{status ? <p>{status}</p> : null}</div> : <>
      {!embedded ? <div className={styles.toolbar}><label>Tournament<select value={tournamentId} onChange={(event) => changeTournament(event.target.value)}>{tournaments.map((item) => <option key={item.id} value={item.id}>{item.year} — {item.label}</option>)}</select></label><a href="/tournament-guide" target="_blank" rel="noreferrer">Open public preview ↗</a></div> : null}
      <nav className={styles.tabs}>{TYPES.map(([type, label]) => <button className={active === type ? styles.active : ""} key={type} onClick={() => switchType(type)}>{label}</button>)}<button className={active === "preview" ? styles.active : ""} onClick={() => setActive("preview")}>Preview</button></nav>
      {active === "preview" ? <div className={styles.preview}><iframe title="Tournament Guide preview" src="/tournament-guide" /></div> : <div className={styles.workspace}>
        <aside><div><h2>{TYPES.find(([type]) => type === active)?.[1]}</h2><button onClick={() => setRecord(blank(tournamentId))}>+ New</button></div>{records.length ? records.map((item) => <button className={record[idField] === item[idField] ? styles.selected : ""} key={item[idField]} onClick={() => setRecord(item)}><strong>{item[TITLES[active]] || "Untitled"}</strong><span>{item.Status || "Draft"} · Order {item["Display Order"] || 0}</span></button>) : <p>No records for this tournament.</p>}</aside>
        <form onSubmit={(event) => { event.preventDefault(); save(); }}><h2>{record[idField] ? "Edit content" : "Create content"}</h2><div className={styles.formGrid}>{FIELDS[active].map(([field, type]) => <Field field={field} type={type} value={record[field]} onChange={change} key={field} />)}</div><div className={styles.actions}><button type="submit">Save</button>{record[idField] ? <><button type="button" className={styles.secondary} onClick={() => save({ ...record, Status: record.Status === "Published" ? "Draft" : "Published" })}>{record.Status === "Published" ? "Unpublish" : "Publish"}</button><button type="button" className={styles.danger} onClick={() => remove(record)}>Delete</button></> : null}</div>{status ? <p className={styles.status}>{status}</p> : null}</form>
      </div>}
    </>}
  </section>;
}
