"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { buildFutureYearAdministrationMutation } from "../../../lib/production-future-year-administration-contract.js";
import styles from "./ProductionFutureYearAdministrationPanel.module.css";

const ENDPOINT = "/api/director/future-tournaments";
const formatName = { BB: "Best Ball", SC: "Scramble", SI: "Singles" };
const pretty = (value) => String(value || "Unavailable").toLowerCase().replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function State({ value }) {
  const state = String(value || "").toUpperCase();
  const tone = ["READY", "READY_FOR_ACTIVATION", "COMPLETE", "ACTIVE", "NOT_REQUIRED"].includes(state)
    ? "ready" : ["BLOCKED", "UNAVAILABLE", "FAILED"].includes(state) ? "blocked" : "pending";
  return <span className={styles.state} data-tone={tone}>{pretty(value)}</span>;
}

function Empty({ title, children }) {
  return <section className={styles.empty}><span>Future tournament administration</span><h2>{title}</h2><p>{children}</p></section>;
}

function FutureList({ data, target, onSelect }) {
  return <aside className={styles.catalog} aria-label="Tournament catalog">
    <div className={styles.catalogHeading}><span>Tournament years</span><strong>Current & future</strong></div>
    <button type="button" className={styles.current} disabled>
      <span>{data.currentTournament.tournamentYear || "Current"}</span><strong>{data.currentTournament.name || "Current Production tournament"}</strong><State value="CURRENT" />
    </button>
    {data.catalog.filter((item) => !item.current).map((item) => <button type="button" key={item.tournamentId}
      aria-current={target === item.tournamentId ? "page" : undefined} onClick={() => onSelect(item.tournamentId)}>
      <span>{item.tournamentYear}</span><strong>{item.name || `Tournament ${item.tournamentYear}`}</strong><State value={item.lifecycle} />
    </button>)}
  </aside>;
}

function CreateTournament({ onStage, allowed, busy }) {
  const nextYear = new Date().getFullYear() + 1;
  const [form, setForm] = useState({ targetTournamentId: String(Math.max(nextYear, 2027)), name: "Sandbagger Invitational", destination: "", startDate: "", endDate: "", timeZone: "America/Chicago", creationMode: "BLANK", reason: "Create the next annual tournament setup." });
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return <section className={styles.create}>
    <header><span>Owner workflow</span><h2>Create a future tournament</h2><p>Start a clean annual record, or clone only the certified 2026 competition structure. No activation or external writer runs here.</p></header>
    <div className={styles.formGrid}>
      <label><span>Future year</span><input inputMode="numeric" value={form.targetTournamentId} onChange={change("targetTournamentId")} /></label>
      <label><span>Tournament name</span><input value={form.name} onChange={change("name")} /></label>
      <label><span>Destination</span><input value={form.destination} onChange={change("destination")} /></label>
      <label><span>Start date</span><input type="date" value={form.startDate} onChange={change("startDate")} /></label>
      <label><span>End date</span><input type="date" value={form.endDate} onChange={change("endDate")} /></label>
      <label><span>IANA time zone</span><input value={form.timeZone} onChange={change("timeZone")} /></label>
    </div>
    <fieldset className={styles.mode}><legend>Setup starting point</legend>
      <label><input type="radio" name="creation-mode" value="BLANK" checked={form.creationMode === "BLANK"} onChange={change("creationMode")} /> <span><strong>Start blank</strong><small>Create an empty annual setup record.</small></span></label>
      <label><input type="radio" name="creation-mode" value="CLONE_STRUCTURE" checked={form.creationMode === "CLONE_STRUCTURE"} onChange={change("creationMode")} /> <span><strong>Clone 2026 structure</strong><small>Copy only the certified competition structure; people and activation remain separate.</small></span></label>
    </fieldset>
    <label className={styles.reason}><span>Reason for the audit record</span><textarea value={form.reason} onChange={change("reason")} /></label>
    <button type="button" className={styles.primary} disabled={!allowed || busy} onClick={() => onStage("create", {
      ...form, tournamentYear: Number(form.targetTournamentId), cloneSourceTournamentId: form.creationMode === "CLONE_STRUCTURE" ? "2026" : "",
    }, `Create ${form.targetTournamentId} using ${form.creationMode === "BLANK" ? "a blank annual setup" : "the certified 2026 structure"}`)}>Review future tournament</button>
    {!allowed ? <p className={styles.note}>Production Owner access is required to create a future tournament.</p> : null}
  </section>;
}

function Basics({ tournament, allowed, busy, onStage }) {
  const [draft, setDraft] = useState(tournament);
  useEffect(() => setDraft(tournament), [tournament]);
  const change = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  return <section className={styles.card}><header><span>Annual identity</span><h3>Basics</h3></header><div className={styles.formGrid}>
    <label><span>Name</span><input value={draft.name} onChange={change("name")} disabled={!allowed || busy} /></label><label><span>Destination</span><input value={draft.destination} onChange={change("destination")} disabled={!allowed || busy} /></label>
    <label><span>Start date</span><input type="date" value={draft.startDate} onChange={change("startDate")} disabled={!allowed || busy} /></label><label><span>End date</span><input type="date" value={draft.endDate} onChange={change("endDate")} disabled={!allowed || busy} /></label><label><span>Time zone</span><input value={draft.timeZone} onChange={change("timeZone")} disabled={!allowed || busy} /></label>
  </div><ReasonAction allowed={allowed} busy={busy} label="Review basics" onStage={(reason) => onStage("update", { ...draft, targetTournamentId: tournament.tournamentId, tournamentYear: tournament.tournamentYear, reason }, `Update ${tournament.tournamentYear} tournament basics`)} /></section>;
}

function ReasonAction({ allowed, busy, label, onStage }) {
  const [reason, setReason] = useState("");
  return <div className={styles.action}><label><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Concise, non-sensitive audit reason" disabled={!allowed || busy} /></label><button type="button" disabled={!allowed || busy} onClick={() => onStage(reason)}>{label}</button></div>;
}

function Teams({ data, allowed, busy, onStage }) {
  return <section className={styles.card}><header><span>Competition sides</span><h3>Teams</h3></header><div className={styles.grid}>{data.teams.map((team) => <Team key={team.teamId} team={team} roster={data.roster} allowed={allowed} busy={busy} onStage={onStage} data={data} />)}</div><NewTeam data={data} allowed={allowed} busy={busy} onStage={onStage} /></section>;
}

function NewTeam({ data, allowed, busy, onStage }) {
  const [teamId, setTeamId] = useState(""); const [side, setSide] = useState("1"); const [name, setName] = useState(""); const [captain, setCaptain] = useState("");
  const usedSides = new Set(data.teams.map((item) => String(item.side)));
  return <article className={styles.newEntry}><header><strong>Add a bounded team</strong><small>Stable team ID and side are reviewed before the annual record changes.</small></header><div className={styles.inlineFields}><label><span>Team ID</span><input value={teamId} onChange={(event) => setTeamId(event.target.value.toUpperCase())} disabled={!allowed || busy} placeholder="CB" /></label><label><span>Side</span><select value={side} onChange={(event) => setSide(event.target.value)} disabled={!allowed || busy}>{["1", "2"].map((item) => <option key={item} value={item} disabled={usedSides.has(item)}>Team {item}{usedSides.has(item) ? " configured" : ""}</option>)}</select></label></div><label><span>Team name</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={!allowed || busy} /></label><label><span>Captain (optional)</span><select value={captain} onChange={(event) => setCaptain(event.target.value)} disabled={!allowed || busy}><option value="">No captain yet</option>{data.roster.filter((player) => player.teamId === teamId).map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName || player.playerId}</option>)}</select></label><ReasonAction allowed={allowed && !usedSides.has(side)} busy={busy} label="Review new team" onStage={(reason) => onStage("configure-team", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, teamId, teamSide: Number(side), teamName: name, captainPlayerId: captain, active: true, reason }, `Configure Team ${side} (${teamId})`)} /></article>;
}

function Team({ team, roster, data, allowed, busy, onStage }) {
  const [name, setName] = useState(team.name); const [captain, setCaptain] = useState(team.captainPlayerId);
  useEffect(() => { setName(team.name); setCaptain(team.captainPlayerId); }, [team]);
  return <article className={styles.subcard}><State value={team.active ? "ACTIVE" : "INACTIVE"} /><label><span>Team {team.side} name</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={!allowed || busy} /></label><label><span>Captain</span><select value={captain} onChange={(event) => setCaptain(event.target.value)} disabled={!allowed || busy}><option value="">No captain</option>{roster.filter((player) => player.teamId === team.teamId).map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName || player.playerId}</option>)}</select></label><ReasonAction allowed={allowed} busy={busy} label="Review team" onStage={(reason) => onStage("configure-team", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, teamId: team.teamId, teamSide: team.side, teamName: name, captainPlayerId: captain, active: team.active, reason }, `Configure Team ${team.side}`)} /></article>;
}

function Roster({ data, allowed, busy, onStage }) {
  const [draft, setDraft] = useState(data.roster);
  useEffect(() => setDraft(data.roster), [data.roster]);
  const playerCatalog = data.playerCatalog.filter((player) => !draft.some((item) => item.playerId === player.playerId));
  const addPlayer = (playerId) => {
    const player = playerCatalog.find((item) => item.playerId === playerId);
    if (player) setDraft((current) => [...current, { playerId: player.playerId, displayName: player.displayName, teamId: "", teamSide: 0, participationStatus: "ACTIVE" }]);
  };
  return <section className={styles.card}><header><span>Annual membership</span><h3>Roster</h3><p>Membership is maintained as one reviewed list. Global player creation remains outside this screen.</p></header>{playerCatalog.length ? <label className={styles.addEntry}><span>Add an existing player</span><select value="" disabled={!allowed || busy} onChange={(event) => addPlayer(event.target.value)}><option value="">Select an approved player</option>{playerCatalog.map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName || player.playerId}</option>)}</select></label> : null}<div className={styles.table}><div className={styles.tableHead}><span>Player</span><span>Team</span><span>Status</span></div>{draft.map((player, index) => <div className={styles.tableRow} key={player.playerId}><strong>{player.displayName || player.playerId}<small>{player.playerId}</small></strong><select value={player.teamId} disabled={!allowed || busy} onChange={(event) => setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, teamId: event.target.value, teamSide: data.teams.find((team) => team.teamId === event.target.value)?.side || 0 } : item))}><option value="">Unassigned</option>{data.teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}</select><select value={player.participationStatus} disabled={!allowed || busy} onChange={(event) => setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, participationStatus: event.target.value } : item))}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="WITHDRAWN">Withdrawn</option></select></div>)}</div><ReasonAction allowed={allowed} busy={busy} label="Review roster" onStage={(reason) => onStage("replace-roster", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, roster: draft, reason }, `Replace the reviewed ${data.selectedTournament.tournamentYear} roster`)} /></section>;
}

function Rounds({ data, allowed, busy, onStage }) {
  return <section className={styles.card}><header><span>Certified formats</span><h3>Rounds & course assignments</h3></header><div className={styles.grid}>{data.rounds.map((round) => <Round key={round.roundNumber} round={round} data={data} allowed={allowed} busy={busy} onStage={onStage} />)}</div><NewRound data={data} allowed={allowed} busy={busy} onStage={onStage} /></section>;
}

function NewRound({ data, allowed, busy, onStage }) {
  const [number, setNumber] = useState(""); const [name, setName] = useState(""); const [format, setFormat] = useState("BB"); const [points, setPoints] = useState("1"); const [allowance, setAllowance] = useState("1");
  const used = new Set(data.rounds.map((round) => String(round.roundNumber)));
  const teamSize = format === "SI" ? 1 : 2;
  return <article className={styles.newEntry}><header><strong>Add a certified round</strong><small>Only Best Ball, Scramble, and Singles are available.</small></header><div className={styles.inlineFields}><label><span>Round number</span><input type="number" min="1" max="12" value={number} onChange={(event) => setNumber(event.target.value)} disabled={!allowed || busy} /></label><label><span>Format</span><select value={format} onChange={(event) => setFormat(event.target.value)} disabled={!allowed || busy}><option value="BB">Best Ball</option><option value="SC">Scramble</option><option value="SI">Singles</option></select></label></div><label><span>Round name</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={!allowed || busy} /></label><div className={styles.inlineFields}><label><span>Points</span><input value={points} onChange={(event) => setPoints(event.target.value)} disabled={!allowed || busy} /></label><label><span>Handicap allowance</span><input value={allowance} onChange={(event) => setAllowance(event.target.value)} disabled={!allowed || busy} /></label></div><ReasonAction allowed={allowed && !used.has(number)} busy={busy} label="Review new round" onStage={(reason) => onStage("configure-round", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, roundNumber: number, roundName: name, format, teamSize, pointsAvailable: points, handicapAllowance: allowance, reason }, `Configure Round ${number} (${formatName[format]})`)} /></article>;
}

function Round({ round, data, allowed, busy, onStage }) {
  const [draft, setDraft] = useState(round); const course = data.courseAssignments.find((item) => item.roundNumber === round.roundNumber) || {};
  const [tee, setTee] = useState(course.tee || ""); const [courseId, setCourseId] = useState(course.courseId || "");
  useEffect(() => { setDraft(round); setTee(course.tee || ""); setCourseId(course.courseId || ""); }, [round, course.courseId, course.tee]);
  const change = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const scope = { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear };
  const selectedCourse = data.courseLibrary.find((item) => item.courseId === courseId);
  const chooseCourse = (event) => {
    const selectedId = event.target.value;
    const selected = data.courseLibrary.find((item) => item.courseId === selectedId);
    setCourseId(selectedId);
    setTee(selected?.tees?.includes(tee) ? tee : selected?.tees?.[0] || "");
  };
  return <article className={styles.subcard}><header><strong>Round {round.roundNumber}</strong><State value={round.format} /></header><label><span>Name</span><input value={draft.name} onChange={change("name")} disabled={!allowed || busy} /></label><div className={styles.inlineFields}><label><span>Format</span><select value={draft.format} onChange={(event) => { const format = event.target.value; setDraft((current) => ({ ...current, format, teamSize: format === "SI" ? 1 : 2 })); }} disabled={!allowed || busy}><option value="BB">Best Ball</option><option value="SC">Scramble</option><option value="SI">Singles</option></select></label><label><span>Team size</span><input type="number" value={draft.teamSize} disabled /></label></div><div className={styles.inlineFields}><label><span>Points</span><input value={draft.pointsAvailable} onChange={change("pointsAvailable")} disabled={!allowed || busy} /></label><label><span>Handicap allowance</span><input value={draft.handicapAllowance} onChange={change("handicapAllowance")} disabled={!allowed || busy} /></label></div><ReasonAction allowed={allowed} busy={busy} label="Review round" onStage={(reason) => onStage("configure-round", { ...scope, ...draft, roundNumber: round.roundNumber, roundName: draft.name, reason }, `Configure Round ${round.roundNumber} (${formatName[draft.format] || draft.format})`)} /><div className={styles.course}><strong>Existing course assignment</strong><small>{course.courseName || "Select a certified existing course; creating global courses is unavailable."}</small><div className={styles.inlineFields}><label><span>Existing course</span><select value={courseId} onChange={chooseCourse} disabled={!allowed || busy}><option value="">Select a certified course</option>{data.courseLibrary.map((item) => <option key={item.courseId} value={item.courseId}>{item.name || item.courseId}{item.location ? ` · ${item.location}` : ""}</option>)}</select></label><label><span>Certified tee</span><select value={tee} onChange={(event) => setTee(event.target.value)} disabled={!allowed || busy || !selectedCourse}><option value="">Select a certified tee</option>{(selectedCourse?.tees || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><ReasonAction allowed={allowed && Boolean(courseId) && Boolean(tee)} busy={busy} label="Review course" onStage={(reason) => onStage("assign-course", { ...scope, roundNumber: round.roundNumber, courseId, tee, reason }, `Assign existing course to Round ${round.roundNumber}`)} /></div></article>;
}

function MatchGeneration({ data, allowed, busy, onStage }) {
  const [counts, setCounts] = useState({});
  return <section className={styles.card}><header><span>Deterministic structure</span><h3>Match generation</h3><p>Generation uses the authoritative round setup and is always reviewed before it is committed.</p></header><div className={styles.matchGrid}>{data.rounds.map((round) => <article key={round.roundNumber}><strong>Round {round.roundNumber} · {formatName[round.format] || round.format}</strong><span>{data.matchDefinitions.filter((match) => match.roundNumber === round.roundNumber).length} generated definition(s)</span><label><span>Match count</span><input type="number" min="1" max="64" value={counts[round.roundNumber] || ""} onChange={(event) => setCounts((current) => ({ ...current, [round.roundNumber]: event.target.value }))} disabled={!allowed || busy} /></label><ReasonAction allowed={allowed} busy={busy} label="Review generation" onStage={(reason) => onStage("generate-match-structure", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, roundNumber: round.roundNumber, matchCount: counts[round.roundNumber], reason }, `Generate deterministic match structure for Round ${round.roundNumber}`)} /></article>)}</div></section>;
}

function Readiness({ data, allowed, busy, onStage }) {
  const blockers = data.readiness.blockers; const jobs = data.compatibilityJobs;
  return <section className={styles.card}><header><span>Activation preparation</span><h3>Readiness</h3></header><div className={styles.readiness}><article><State value={data.readiness.readyForActivation ? "READY_FOR_ACTIVATION" : "NEEDS_ATTENTION"} /><strong>{data.readiness.readyForActivation ? "Ready to mark for activation" : "Setup needs attention"}</strong><span>{blockers.length ? `${blockers.length} authoritative blocker(s)` : "No readiness blockers returned."}</span></article>{blockers.map((item, index) => <article className={styles.blocker} key={`${item.code}:${index}`}><strong>{pretty(item.section || item.code)}</strong><span>{item.message || item.code}</span></article>)}</div><ReasonAction allowed={allowed && data.readiness.readyForActivation} busy={busy} label="Review readiness" onStage={(reason) => onStage("mark-ready", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, reason }, `Mark ${data.selectedTournament.tournamentYear} ready for activation review`)} /><details className={styles.jobs}><summary>Compatibility jobs ({jobs.length})</summary>{jobs.length ? jobs.map((job) => <p key={job.jobId}><strong>{job.matchId || job.jobId}</strong><State value={job.status} />{job.safeError ? <span>{job.safeError}</span> : null}</p>) : <p>No compatibility jobs returned.</p>}</details><section className={styles.activation}><span>Explicitly unavailable</span><h4>Activation plan</h4><p>{data.activationPlan.code === "FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED" ? "Activation is not installed in this phase." : pretty(data.activationPlan.code)}</p><button type="button" disabled>Activate tournament unavailable</button><small>Close, archive, global course creation, and the Google compatibility writer remain disabled by contract.</small></section></section>;
}

function AuditTimeline({ audit = [] }) {
  if (!audit.length) return null;
  return <section className={styles.card}><header><span>Safe annual history</span><h3>Audit timeline</h3><p>Only the normalized action, target, actor, result, and timestamp are shown.</p></header><ol className={styles.audit}>{audit.map((item) => <li key={item.id}><div><strong>{pretty(item.action)}</strong><span>{item.summary || item.target || "Annual administration"}</span></div><div><small>Target</small><span>{item.target || "—"}</span></div><div><small>Actor</small><span>{item.actor || "Tournament Director"}</span></div><div><small>When</small><time>{item.timestamp ? new Date(item.timestamp).toLocaleString() : "Not recorded"}</time></div><State value={item.result} /></li>)}</ol></section>;
}

function Review({ review, confirmed, setConfirmed, busy, onCancel, onCommit }) {
  return <section className={styles.review}><span>Review before commit</span><h3>{pretty(review.action)}</h3><p>{review.description}</p><dl><div><dt>Target year</dt><dd>{review.values.targetTournamentId}</dd></div><div><dt>Expected revision</dt><dd>{review.expectedRevision}</dd></div><div><dt>Audit identity</dt><dd>One idempotent Production request</dd></div></dl><label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the selected annual record, exact effect, and authoritative readiness consequences.</span></label><div className={styles.buttons}><button type="button" onClick={onCancel} disabled={busy}>Return to editing</button><button type="button" className={styles.primary} disabled={!confirmed || busy} onClick={onCommit}>{busy ? "Confirming…" : "Confirm reviewed change"}</button></div></section>;
}

export default function ProductionFutureYearAdministrationPanel() {
  const [data, setData] = useState(null); const [target, setTarget] = useState(""); const [phase, setPhase] = useState("loading"); const [message, setMessage] = useState(""); const [review, setReview] = useState(null); const [confirmed, setConfirmed] = useState(false); const [receipt, setReceipt] = useState(null);
  const load = useCallback(async (targetTournamentId = "", quiet = false) => { if (!quiet) setPhase("loading"); try { const query = targetTournamentId ? `?targetTournamentId=${encodeURIComponent(targetTournamentId)}` : ""; const response = await fetch(`${ENDPOINT}${query}`, { cache: "no-store", credentials: "same-origin" }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Future Tournaments are temporarily unavailable."); setData(payload.data); setTarget(payload.data.selectedTournament?.tournamentId || targetTournamentId || ""); setPhase("ready"); return payload.data; } catch (error) { setMessage(error.message || "Future Tournaments are temporarily unavailable."); setPhase("failure"); return null; } }, []);
  useEffect(() => { load(""); }, [load]);
  const stage = useCallback((action, values, description) => { if (!data) return; try { const expectedRevision = action === "create" ? 0 : data.selectedTournament?.revision; const operationRequestId = uuid(); buildFutureYearAdministrationMutation(action, { ...values, expectedRevision, operationRequestId }); setReview({ action, values, description, expectedRevision, operationRequestId }); setConfirmed(false); setMessage(""); setReceipt(null); } catch (error) { setMessage(error.message || "Review the Future Tournament details."); setPhase("ready"); } }, [data]);
  const commit = useCallback(async () => { if (!review || !confirmed) return; setPhase("submitting"); try { const response = await fetch(ENDPOINT, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: review.action, expectedRevision: review.expectedRevision, operationRequestId: review.operationRequestId, ...review.values }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "The Future Tournament change did not complete."); setReceipt(payload.data); setReview(null); setConfirmed(false); setMessage(payload.data?.idempotent ? "The safe retry returned the authoritative result." : "Production confirmed the reviewed annual change."); await load(payload.data.targetTournamentId, true); } catch (error) { setMessage(error.message || "The Future Tournament change did not complete."); setPhase("ready"); } }, [confirmed, load, review]);
  const selected = data?.selectedTournament; const busy = phase === "submitting" || Boolean(review); const allowed = Boolean(data?.capabilities);
  const select = (id) => { setReview(null); setReceipt(null); setMessage(""); load(id); };
  if (phase === "loading" && !data) return <Empty title="Opening Future Tournaments">Reading the authoritative Production annual-administration catalog…</Empty>;
  if (!data) return <Empty title="Future Tournaments are unavailable">{message}<button type="button" onClick={() => load("")}>Try again</button></Empty>;
  return <section className={styles.shell} aria-labelledby="future-tournaments-title"><header className={styles.hero}><div><span>Production Owner annual administration</span><h2 id="future-tournaments-title">Future Tournaments</h2><p>Prepare a future annual tournament without changing the current tournament’s lifecycle.</p></div><State value={selected?.lifecycle || "CATALOG"} /></header><div className={styles.layout}><FutureList data={data} target={target} onSelect={select} /><main className={styles.main}>{!selected ? <CreateTournament onStage={stage} allowed={data.capabilities.createTournament} busy={busy} /> : <><div className={styles.selected}><div><span>Selected annual record</span><h3>{selected.name || `Tournament ${selected.tournamentYear}`}</h3><p>{selected.destination || "Destination pending"} · Revision {selected.revision}</p></div><State value={selected.lifecycle} /></div><Basics tournament={selected} allowed={data.capabilities.editTournament} busy={busy} onStage={stage} /><Teams data={data} allowed={data.capabilities.configureTeams} busy={busy} onStage={stage} /><Roster data={data} allowed={data.capabilities.replaceRoster} busy={busy} onStage={stage} /><Rounds data={data} allowed={data.capabilities.configureRounds || data.capabilities.assignExistingCourse} busy={busy} onStage={stage} /><MatchGeneration data={data} allowed={data.capabilities.generateMatchStructure} busy={busy} onStage={stage} /><Readiness data={data} allowed={data.capabilities.markReady} busy={busy} onStage={stage} /><AuditTimeline audit={data.audit} /></>}{review ? <Review review={review} confirmed={confirmed} setConfirmed={setConfirmed} busy={phase === "submitting"} onCancel={() => { setReview(null); setConfirmed(false); }} onCommit={commit} /> : null}{message ? <p className={styles.message} role="status">{message}</p> : null}{receipt ? <p className={styles.receipt}><strong>{pretty(receipt.operation)} confirmed</strong><span>Revision {receipt.revision}{receipt.idempotent ? " · safe retry" : ""}</span></p> : null}</main></div></section>;
}
