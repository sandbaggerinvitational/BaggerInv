"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./cms-manager.module.css";

const truthy = (value) => value === true || /^(true|yes|y|1|active)$/i.test(String(value ?? ""));
const displayValue = (value) => value === "TRUE" ? "Yes" : value === "FALSE" ? "No" : String(value ?? "").trim() || "—";

async function adminRequest(secret, resource, { method = "GET", tournament = "", year = "", body } = {}) {
  const query = new URLSearchParams({ resource, tournament: String(tournament || ""), year: String(year || "") });
  const response = await fetch(`/api/admin/cms?${query}`, {
    method,
    headers: { "content-type": "application/json", "x-admin-secret": secret },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Admin Center request failed.");
  return payload.data;
}

function FieldEditor({ field, value, onChange, locked = false }) {
  if (field.type === "readonly") return <label><span>{field.label}</span><input value={value || ""} readOnly /></label>;
  if (field.type === "boolean") return <label className={styles.toggle}><input type="checkbox" checked={truthy(value)} onChange={(event) => onChange(event.target.checked ? "TRUE" : "FALSE")} /><span>{field.label}</span></label>;
  if (field.type === "textarea") return <label className={styles.wide}><span>{field.label}</span><textarea rows="5" value={value || ""} onChange={(event) => onChange(event.target.value)} /></label>;
  if (field.type === "reference" && field.searchable) {
    const listId = `reference-${field.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    const selected = (field.options || []).find((option) => option.value === value);
    return <label><span>{field.label}</span><input list={listId} value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder="Search by name or ID…" /><datalist id={listId}>{(field.options || []).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</datalist>{field.previewImage && selected?.image ? <span className={styles.referencePreview}><img src={selected.image} alt="" />{selected.label}</span> : selected ? <small>{selected.label}</small> : null}</label>;
  }
  if (field.type === "select" || field.type === "reference") return <label><span>{field.label}</span><select value={value || ""} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{(field.options || []).map((option) => typeof option === "string" ? <option key={option}>{option}</option> : <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
  const type = ["number", "date", "time", "url", "color"].includes(field.type) ? field.type : "text";
  return <label><span>{field.label}</span><input type={type} value={value || ""} readOnly={locked} aria-readonly={locked ? "true" : undefined} title={locked ? "Stable IDs cannot be changed after a record is created." : undefined} onChange={(event) => onChange(event.target.value)} /></label>;
}

export default function CmsManager({ resource, secret, tournamentId, year, updatedBy, title, description }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editingKey, setEditingKey] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(message = "Loading…") {
    setBusy(true); setStatus(message);
    try { setData(await adminRequest(secret, resource, { tournament: tournamentId, year })); setStatus(""); }
    catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (secret) load(); }, [resource, secret, tournamentId, year]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.rows || [];
    return (data?.rows || []).filter((row) => Object.entries(row).some(([key, value]) => key !== "__key" && String(value ?? "").toLowerCase().includes(query)));
  }, [data, search]);

  function startNew() {
    const blank = Object.fromEntries((data?.fields || []).map((field) => [field.name, field.type === "boolean" ? "FALSE" : ""]));
    if (resource === "teams") blank.Year = String(year || "");
    if (resource === "schedule") blank["Tournament ID"] = String(tournamentId || "");
    if (resource === "courses" || resource === "matches" || resource === "awards" || resource === "draft-settings" || resource === "draft-picks") blank.Year = String(year || "");
    setEditingKey(""); setDraft(blank); setStatus("");
  }

  function startEdit(row) { setEditingKey(row.__key); setDraft({ ...row }); setStatus(""); }
  function change(name, value) { setDraft((current) => ({ ...current, [name]: value })); }

  async function act(action, row, extras = {}) {
    if (!updatedBy.trim()) { setStatus("Enter your name in the Admin Center bar before making changes."); return; }
    if (action === "delete" && !window.confirm(`Permanently delete this ${data.singular.toLowerCase()}? The action will be recorded in the Audit Log.`)) return;
    if (action === "archive" && !window.confirm(`Archive this ${data.singular.toLowerCase()}?`)) return;
    setBusy(true); setStatus(`${action === "save" ? "Saving" : action === "reorder" ? "Reordering" : `${action[0].toUpperCase()}${action.slice(1)}ing`}…`);
    try {
      await adminRequest(secret, resource, {
        method: "POST", tournament: tournamentId, year,
        body: { resource, action, key: row?.__key || editingKey, record: action === "save" ? draft : undefined, tournament: tournamentId, year, updatedBy, ...extras },
      });
      setDraft(null); setEditingKey(""); await load("Refreshing…"); setStatus("Saved successfully.");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  if (!data) return <section className={styles.manager}><div className={styles.notice}>{status || "Loading…"}</div></section>;
  return <section className={styles.manager}>
    <header className={styles.heading}><div><p>Google Sheets CMS</p><h2>{title || data.label}</h2><span>{description || `Create, edit, archive, and manage ${data.label.toLowerCase()} without opening the spreadsheet.`}</span></div><button type="button" onClick={startNew}>Add {data.singular}</button></header>
    <div className={styles.toolbar}><label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${data.label.toLowerCase()}…`} /></label><strong>{rows.length} records</strong><button type="button" onClick={() => load("Refreshing…")} disabled={busy}>Refresh</button></div>
    {status ? <div className={styles.notice}>{status}</div> : null}
    {draft ? <form className={styles.editor} onSubmit={(event) => { event.preventDefault(); act("save"); }}><div className={styles.editorTitle}><div><p>{editingKey ? "Edit record" : "New record"}</p><h3>{editingKey ? data.singular : `Add ${data.singular}`}</h3></div><button type="button" onClick={() => setDraft(null)} aria-label="Close editor">×</button></div><div className={styles.formGrid}>{data.fields.map((field) => <FieldEditor key={field.name} field={field} value={draft[field.name]} locked={Boolean(editingKey && field.type === "id")} onChange={(value) => change(field.name, value)} />)}</div><div className={styles.formActions}><button type="submit" disabled={busy}>{busy ? "Saving…" : `Save ${data.singular}`}</button><button type="button" className={styles.secondary} onClick={() => setDraft(null)}>Cancel</button></div></form> : null}
    <div className={styles.list}>{rows.map((row, index) => <article key={row.__key || index}><div className={styles.rowSummary}>{(data.summary || []).map((field, fieldIndex) => <div key={field}><span>{field}</span><strong className={fieldIndex === 0 ? styles.primary : ""}>{displayValue(row[field])}</strong></div>)}</div><div className={styles.rowActions}>{data.fields.some((field) => field.name === "Display Order") ? <><button type="button" disabled={busy || index === 0} onClick={() => act("reorder", row, { direction: "up" })}>↑</button><button type="button" disabled={busy || index === rows.length - 1} onClick={() => act("reorder", row, { direction: "down" })}>↓</button></> : null}<button type="button" onClick={() => startEdit(row)}>Edit</button>{["players", "schedule", "media"].includes(resource) ? <button type="button" onClick={() => act("archive", row)}>Archive</button> : null}<button type="button" className={styles.danger} onClick={() => act("delete", row)}>Delete</button></div></article>)}</div>
    {!rows.length ? <div className={styles.empty}>No {data.label.toLowerCase()} match the current tournament and search.</div> : null}
  </section>;
}

export function DashboardPanel({ secret, tournamentId, year, onNavigate }) {
  const [data, setData] = useState(null), [status, setStatus] = useState("");
  useEffect(() => { adminRequest(secret, "dashboard", { tournament: tournamentId, year }).then(setData).catch((error) => setStatus(error.message)); }, [secret, tournamentId, year]);
  if (!data) return <div className={styles.notice}>{status || "Loading command center…"}</div>;
  const cards = [
    ["Tournament status", data.tournamentStatus], ["Current round", data.currentRound], ["Live matches", data.liveMatches],
    ["Matches remaining", data.matchesRemaining], ["Team score", `${data.teamScore.teamOne} – ${data.teamScore.teamTwo}`],
    ["Last published odds", data.lastPublishedOdds], ["Data health", data.dataHealth ? `${data.dataHealth} warnings` : "Healthy"],
    ["Missing images", data.missingImages], ["Last admin activity", data.lastActivity?.Action || "No activity"],
  ];
  const actions = [["Start Tournament", "tournament"], ["Publish Odds", "odds"], ["Update Live Match", "live-scoring"], ["Open Match Center", "/live"], ["Open Guide", "/tournament-guide"], ["Open Public Site", "/"]];
  return <section>{data.overrideActive ? <div className={styles.notice}>Manual override is active. Public tournament status will not advance automatically.</div> : null}<div className={styles.dashboard}>{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{displayValue(value)}</strong>{label === "Last admin activity" && data.lastActivity?.["Updated By"] ? <small>{data.lastActivity["Updated By"]}</small> : null}</article>)}</div><div className={styles.quickActions}>{actions.map(([label, target]) => target.startsWith("/") ? <a href={target} target="_blank" rel="noreferrer" key={label}>{label}<span>↗</span></a> : <button type="button" key={label} onClick={() => onNavigate(target)}>{label}<span>→</span></button>)}</div></section>;
}

export function StandingsPanel({ secret, year }) {
  const [data, setData] = useState(null), [status, setStatus] = useState("");
  const load = () => { setStatus("Recalculating…"); adminRequest(secret, "standings", { year }).then((result) => { setData(result); setStatus(""); }).catch((error) => setStatus(error.message)); };
  useEffect(load, [secret, year]);
  return <section className={styles.manager}><header className={styles.heading}><div><p>Official results</p><h2>Standings</h2><span>Calculated live from finalized matches. Public pages continue to use the same source rows.</span></div><button type="button" onClick={load}>Recalculate</button></header>{status ? <div className={styles.notice}>{status}</div> : null}{data ? <><div className={styles.teamStandings}>{data.teams.map((team, index) => { const side = data.tournamentState?.[index ? "teamTwo" : "teamOne"]; return <article key={team.side}><span>{team.name}<small>{side?.pointsToClinch > 0 ? `Need ${side.pointsToClinch.toFixed(1)} to clinch` : "At clinching target"}</small></span><strong>{team.points.toFixed(1)}</strong></article>; })}</div><div className={styles.standingsTable}><div><b>Rank</b><b>Player</b><b>Record</b><b>Points</b></div>{data.players.map((player, index) => <div key={player.id}><span>{index + 1}</span><strong>{player.name}</strong><span>{player.wins}-{player.losses}-{player.halves}</span><b>{player.points.toFixed(2)}</b></div>)}</div></> : null}</section>;
}

export function AuditLogPanel({ secret }) {
  const [rows, setRows] = useState([]), [status, setStatus] = useState("Loading audit history…");
  useEffect(() => { adminRequest(secret, "audit").then((data) => { setRows(data); setStatus(""); }).catch((error) => setStatus(error.message)); }, [secret]);
  return <section className={styles.manager}><header className={styles.heading}><div><p>Accountability</p><h2>Audit Log</h2><span>Every CMS create, edit, archive, delete, and reorder action is preserved here.</span></div></header>{status ? <div className={styles.notice}>{status}</div> : null}<div className={styles.audit}>{rows.map((row) => <article key={row["Audit ID"]}><div><strong>{row["Updated By"] || "Admin"}</strong><span>{row.Action} {row.Resource}</span></div><div><b>{row["Record ID"]}</b><time>{row["Updated At"] ? new Date(row["Updated At"]).toLocaleString() : ""}</time></div></article>)}</div>{!status && !rows.length ? <div className={styles.empty}>No Admin Center changes have been recorded yet.</div> : null}</section>;
}
