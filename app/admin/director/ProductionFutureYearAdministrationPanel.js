"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildFutureRuntimeMutation,
  buildFutureYearAdministrationMutation,
  PRODUCTION_FUTURE_RUNTIME_ACTIONS,
} from "../../../lib/production-future-year-administration-contract.js";
import styles from "./ProductionFutureYearAdministrationPanel.module.css";

const ENDPOINT = "/api/director/future-tournaments";
const formatName = { BB: "Best Ball", SC: "Scramble", SI: "Singles" };
const pretty = (value) => String(value || "Unavailable").toLowerCase().replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function parseCourseHoleRows(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim())
    .filter(Boolean).map((line) => {
      const [holeNumber, par, strokeIndex, yardage = ""] = line.split("|")
        .map((item) => item.trim());
      return { holeNumber, par, strokeIndex, yardage };
    });
}

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
    <button type="button" className={styles.current} disabled={Number(data.currentTournament.tournamentYear) <= 2026}
      onClick={() => Number(data.currentTournament.tournamentYear) > 2026 && onSelect(data.currentTournament.tournamentId)}>
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

function FutureDirectorGovernance({ data, busy, onStage }) {
  const runtime = data.futureRuntime;
  const governance = runtime?.futureDirectorGovernance || { revision: 0, directors: [] };
  const eligiblePlayers = data.roster.filter((player) =>
    player.participationStatus === "ACTIVE" &&
    !governance.directors.some((director) =>
      director.playerId === player.playerId && director.status === "ACTIVE" && director.roleActive));
  const [playerId, setPlayerId] = useState(eligiblePlayers[0]?.playerId || "");
  useEffect(() => {
    if (!eligiblePlayers.some((player) => player.playerId === playerId)) {
      setPlayerId(eligiblePlayers[0]?.playerId || "");
    }
  }, [eligiblePlayers, playerId]);
  if (!runtime) return null;
  return <section className={styles.card}><header><span>Annual access governance</span><h3>Future Tournament Director</h3><p>Select an active future roster member with one linked, verified Supabase identity. This does not clone 2026 Director rights or change participant identity.</p></header><div className={styles.grid}>{governance.directors.map((director) => <article className={styles.subcard} key={director.playerId}><strong>{director.displayName || director.playerId}<small>{director.playerId}</small></strong><State value={director.status === "ACTIVE" && director.roleActive ? "ACTIVE" : "NEEDS_ATTENTION"} /></article>)}</div>{eligiblePlayers.length ? <label><span>Eligible future roster member</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)} disabled={!runtime.capabilities.grantFutureDirector || busy}><option value="">Select a Player</option>{eligiblePlayers.map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName || player.playerId}</option>)}</select></label> : <p className={styles.note}>{governance.directors.length ? "A future Tournament Director is already selected." : "No eligible active future roster member is available."}</p>}<ReasonAction allowed={runtime.capabilities.grantFutureDirector && Boolean(playerId)} busy={busy} label="Review future Director grant" onStage={(reason) => onStage("grant-future-director", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, expectedRevision: governance.revision, targetPlayerId: playerId, reason }, `Grant ${playerId} Director access for ${data.selectedTournament.tournamentYear}`)} /></section>;
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

function GlobalCourseLibrary({ data, busy, onStage }) {
  const runtime = data.futureRuntime;
  const [name, setName] = useState(""); const [location, setLocation] = useState("");
  const [contextCourseId, setContextCourseId] = useState("");
  const [teeId, setTeeId] = useState(""); const [rating, setRating] = useState("");
  const [slope, setSlope] = useState(""); const [par, setPar] = useState("");
  const [holes, setHoles] = useState("");
  const [roundNumber, setRoundNumber] = useState("");
  const [assignmentCourseId, setAssignmentCourseId] = useState("");
  const [assignmentTeeId, setAssignmentTeeId] = useState("");
  if (!runtime) return null;
  const revision = Number(runtime.courseAllocatorRevision || 0);
  const allowed = runtime.capabilities.addGlobalCourse && revision > 0;
  const createdCourses = runtime.courseCatalog.filter((course) => course.source === "DIRECTOR_CREATED");
  const contextCourse = createdCourses.find((course) => course.courseId === contextCourseId);
  const assignableContexts = runtime.courseCatalog.flatMap((course) => course.teeContexts
    .filter((context) => context.scoringReady)
    .map((context) => ({ ...context, courseId: course.courseId, courseName: course.name })));
  const selectedAssignment = assignableContexts.find((context) =>
    context.courseId === assignmentCourseId && context.teeId === assignmentTeeId);
  const scope = {
    targetTournamentId: data.selectedTournament.tournamentId,
    tournamentYear: data.selectedTournament.tournamentYear,
  };
  return <section className={styles.card}><header><span>Permanent course identity</span><h3>Course Library</h3><p>Create a permanent Course, certify one tee with all 18 holes, then assign that exact context to a future round. Each step is separate and reviewed.</p></header><div className={styles.grid}>{runtime.courseCatalog.map((course) => <article className={styles.subcard} key={course.courseId}><strong>{course.name || course.courseId}</strong><span>{course.location || "Location pending"}</span><State value={course.status} />{course.teeContexts.map((context) => <small key={context.teeId}>{context.teeId} · {context.holeCount}/18 holes · {context.scoringReady ? "Scoring ready" : "Incomplete"}</small>)}</article>)}</div><div className={styles.inlineFields}><label><span>Course name</span><input value={name} onChange={(event) => setName(event.target.value)} disabled={!allowed || busy} /></label><label><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} disabled={!allowed || busy} /></label></div><ReasonAction allowed={allowed && Boolean(name)} busy={busy} label="Review new Course" onStage={(reason) => onStage("add-global-course", { ...scope, expectedRevision: revision, courseName: name, location, reason }, `Create permanent Course ${name}`)} />{!revision ? <p className={styles.note}>Course creation remains unavailable until the authoritative allocator revision is present.</p> : null}<article className={styles.subcard}><header><strong>Configure scoring context</strong><small>Only Director-created Courses can be configured here. Hole rows are: Hole | Par | Stroke index | Yardage (optional).</small></header><label><span>Course</span><select value={contextCourseId} onChange={(event) => setContextCourseId(event.target.value)} disabled={!runtime.capabilities.configureGlobalCourseContext || busy}><option value="">Select a Director-created Course</option>{createdCourses.map((course) => <option key={course.courseId} value={course.courseId}>{course.name || course.courseId}</option>)}</select></label><div className={styles.inlineFields}><label><span>Tee</span><input value={teeId} onChange={(event) => setTeeId(event.target.value)} disabled={!contextCourse || busy} /></label><label><span>Rating</span><input inputMode="decimal" value={rating} onChange={(event) => setRating(event.target.value)} disabled={!contextCourse || busy} /></label><label><span>Slope</span><input inputMode="numeric" value={slope} onChange={(event) => setSlope(event.target.value)} disabled={!contextCourse || busy} /></label><label><span>Par</span><input inputMode="numeric" value={par} onChange={(event) => setPar(event.target.value)} disabled={!contextCourse || busy} /></label></div><label><span>Holes 1–18</span><textarea value={holes} onChange={(event) => setHoles(event.target.value)} placeholder={"1 | 4 | 7 | 410\n2 | 3 | 17 | 165\n…"} disabled={!contextCourse || busy} /></label><ReasonAction allowed={runtime.capabilities.configureGlobalCourseContext && Boolean(contextCourse) && Boolean(teeId) && parseCourseHoleRows(holes).length === 18} busy={busy} label="Review scoring context" onStage={(reason) => onStage("configure-global-course-context", { ...scope, expectedRevision: contextCourse.revision, courseId: contextCourse.courseId, teeId, rating, slope, par, holes: parseCourseHoleRows(holes), reason }, `Configure ${contextCourse.name || contextCourse.courseId} · ${teeId}`)} /></article><article className={styles.subcard}><header><strong>Assign a certified Course</strong><small>Assignment copies the exact certified context into the selected future tournament only when runtime promotion has not begun.</small></header><div className={styles.inlineFields}><label><span>Round</span><select value={roundNumber} onChange={(event) => setRoundNumber(event.target.value)} disabled={!runtime.capabilities.assignFutureCourse || busy}><option value="">Select a round</option>{data.rounds.map((round) => <option key={round.roundNumber} value={round.roundNumber}>Round {round.roundNumber}</option>)}</select></label><label><span>Course</span><select value={assignmentCourseId} onChange={(event) => { setAssignmentCourseId(event.target.value); setAssignmentTeeId(""); }} disabled={!runtime.capabilities.assignFutureCourse || busy}><option value="">Select a scoring-ready Course</option>{runtime.courseCatalog.filter((course) => course.teeContexts.some((context) => context.scoringReady)).map((course) => <option key={course.courseId} value={course.courseId}>{course.name || course.courseId}</option>)}</select></label><label><span>Tee</span><select value={assignmentTeeId} onChange={(event) => setAssignmentTeeId(event.target.value)} disabled={!assignmentCourseId || busy}><option value="">Select a certified tee</option>{assignableContexts.filter((context) => context.courseId === assignmentCourseId).map((context) => <option key={context.teeId} value={context.teeId}>{context.teeId}</option>)}</select></label></div><ReasonAction allowed={runtime.capabilities.assignFutureCourse && Boolean(roundNumber) && Boolean(selectedAssignment)} busy={busy} label="Review Course assignment" onStage={(reason) => onStage("assign-future-course", { ...scope, expectedRevision: data.selectedTournament.setupRevision, roundNumber, courseId: selectedAssignment.courseId, teeId: selectedAssignment.teeId, courseContextRevision: selectedAssignment.contextRevision, reason }, `Assign ${selectedAssignment.courseName || selectedAssignment.courseId} · ${selectedAssignment.teeId} to Round ${roundNumber}`)} /></article></section>;
}

function RuntimePromotion({ data, busy, onStage }) {
  const runtime = data.futureRuntime;
  if (!runtime) return null;
  const promotion = runtime.runtimePromotion;
  const jobs = runtime.compatibilityJobs;
  const revision = promotion?.revision || 0;
  return <section className={styles.card}><header><span>Canonical Supabase runtime</span><h3>Runtime match promotion</h3><p>Promotion creates private, locked, unscored runtime Matches. Google compatibility remains downstream.</p></header><div className={styles.readiness}><article><State value={promotion?.status || "NOT_PROMOTED"} /><strong>{promotion ? `Runtime revision ${promotion.revision}` : "Structural Matches are not promoted"}</strong><span>{promotion?.fingerprint ? "Exact promoted structure is fingerprint-bound." : "Review the structural match set before promotion."}</span></article></div><ReasonAction allowed={runtime.capabilities.promoteRuntime && !promotion} busy={busy} label="Review runtime promotion" onStage={(reason) => onStage("promote-runtime", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, expectedRevision: revision, reason }, `Promote ${data.selectedTournament.tournamentYear} structural Matches into the private scoring runtime`)} /><details className={styles.jobs} open><summary>Downstream compatibility ({jobs.length})</summary>{jobs.length ? jobs.map((job) => <p key={job.jobId}><strong>{job.matchId || job.jobId}</strong><State value={job.status} /><span>Attempt {job.attempts || 0}</span>{job.safeError ? <span>{pretty(job.safeError)}</span> : null}</p>) : <p>No downstream provisioning jobs exist yet.</p>}</details><small>Failed jobs are claimed and retried only by the certified worker. This Director page cannot write Google or bypass readback certification.</small></section>;
}

function FutureHandicaps({ data, busy, onStage }) {
  const runtime = data.futureRuntime;
  const [effectiveDate, setEffectiveDate] = useState("");
  const [sourceYear, setSourceYear] = useState("2026");
  const [values, setValues] = useState({});
  useEffect(() => {
    const draft = new Map((runtime?.handicapDraft?.entries || [])
      .map((entry) => [entry.playerId, entry.tournamentHandicap]));
    setValues(Object.fromEntries(data.roster.filter((row) => row.participationStatus === "ACTIVE")
      .map((row) => [row.playerId, draft.get(row.playerId) || ""])));
  }, [data.roster, runtime?.handicapDraft?.revisionId]);
  if (!runtime) return null;
  const activeRoster = data.roster.filter((row) => row.participationStatus === "ACTIVE");
  const currentRevision = runtime.handicap?.revisionNumber || 0;
  const entries = activeRoster.map((row) => ({ playerId: row.playerId, tournamentHandicap: values[row.playerId] }));
  const complete = entries.length > 0 && entries.every((row) => String(row.tournamentHandicap || "").trim());
  const staged = runtime.handicapDraft?.status === "DRAFT" && runtime.handicapDraft.revisionId;
  const draftReviewable = staged && runtime.handicapDraft.entries.length === activeRoster.length;
  return <section className={styles.card}><header><span>Reviewed annual context</span><h3>Future Handicaps</h3><p>Prior-year values are proposed starting data only. A separate Director approval makes a complete revision current.</p></header><div className={styles.inlineFields}><label><span>Effective date</span><input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} disabled={busy} /></label><label><span>Proposed source year</span><input inputMode="numeric" value={sourceYear} onChange={(event) => setSourceYear(event.target.value)} disabled={busy} /></label></div><div className={styles.table}><div className={styles.tableHead}><span>Player</span><span>Team</span><span>Handicap</span></div>{activeRoster.map((player) => <div className={styles.tableRow} key={player.playerId}><strong>{player.displayName || player.playerId}<small>{player.playerId}</small></strong><span>{data.teams.find((team) => team.teamId === player.teamId)?.name || "Unassigned"}</span><input inputMode="decimal" value={values[player.playerId] || ""} onChange={(event) => setValues((current) => ({ ...current, [player.playerId]: event.target.value }))} disabled={!runtime.capabilities.stageHandicaps || busy} /></div>)}</div><ReasonAction allowed={runtime.capabilities.stageHandicaps && complete && Boolean(effectiveDate) && Boolean(runtime.runtimePromotion)} busy={busy} label="Review handicap draft" onStage={(reason) => onStage("stage-handicaps", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, expectedRevision: currentRevision, effectiveDate, sourceYear: Number(sourceYear), entries, reason }, `Stage a complete reviewed ${data.selectedTournament.tournamentYear} handicap revision`)} />{staged ? <ReasonAction allowed={runtime.capabilities.approveHandicaps && draftReviewable} busy={busy} label="Review handicap approval" onStage={(reason) => onStage("approve-handicaps", { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, expectedRevision: currentRevision, handicapRevisionId: runtime.handicapDraft.revisionId, reason }, `Approve future handicap revision ${runtime.handicapDraft.revisionNumber}`)} /> : null}{staged && !draftReviewable ? <p className={styles.note}>Approval remains unavailable until the complete stored draft can be reviewed.</p> : null}</section>;
}

function parsePairingRows(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [playerId, teamSide, slotNumber] = line.split(/[|,\t]/).map((item) => item.trim());
    return { playerId, teamSide: Number(teamSide), slotNumber: Number(slotNumber) };
  });
}

function RuntimeMatch({ match, data, busy, onStage }) {
  const runtime = data.futureRuntime;
  const definition = data.matchDefinitions.find((item) => item.matchId === match.matchId) || {};
  const assignment = data.courseAssignments.find((item) => item.roundNumber === match.roundNumber) || {};
  const course = { courseId: match.courseId || assignment.courseId, tee: match.teeId || assignment.tee,
    courseName: assignment.courseName };
  const initialPairings = (match.participants || []).map((participant) =>
    `${participant.playerId} | ${participant.teamSide} | ${participant.playerSlot}`).join("\n");
  const [teeTime, setTeeTime] = useState(match.teeTime || ""); const [startingHole, setStartingHole] = useState(String(match.startingHole || 1)); const [pairings, setPairings] = useState(initialPairings);
  const scope = { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear, expectedRevision: match.runtimeRevision, matchId: match.matchId };
  return <article className={styles.subcard}><header><strong>Round {match.roundNumber} · {match.matchId}</strong><State value={match.runtimeState} /></header><p className={styles.note}>{course.courseName || course.courseId || "Course pending"} · {course.tee || "Tee pending"}</p><div className={styles.inlineFields}><label><span>Tee time</span><input type="time" value={teeTime} onChange={(event) => setTeeTime(event.target.value)} disabled={!runtime.capabilities.configureMatch || busy} /></label><label><span>Starting hole</span><input type="number" min="1" max="18" value={startingHole} onChange={(event) => setStartingHole(event.target.value)} disabled={!runtime.capabilities.configureMatch || busy} /></label></div><ReasonAction allowed={runtime.capabilities.configureMatch && Boolean(teeTime) && Boolean(course.courseId) && Boolean(course.tee)} busy={busy} label="Review match context" onStage={(reason) => onStage("configure-match", { ...scope, matchNumber: match.matchNumber || definition.matchNumber, courseId: course.courseId, teeId: course.tee, teeTime, startingHole: Number(startingHole), reason }, `Configure tee time and starting hole for ${match.matchId}`)} /><label><span>Pairings · Player ID | Team side | Team slot</span><textarea value={pairings} onChange={(event) => setPairings(event.target.value)} placeholder={"CB01 | 1 | 1\nWD01 | 2 | 1"} disabled={!runtime.capabilities.replacePairings || busy} /></label><ReasonAction allowed={runtime.capabilities.replacePairings && Boolean(pairings.trim())} busy={busy} label="Review pairings" onStage={(reason) => onStage("replace-pairings", { ...scope, participants: parsePairingRows(pairings), reason }, `Replace the complete reviewed pairing for ${match.matchId}`)} /><ReasonAction allowed={runtime.capabilities.prepareScoringContext && match.runtimeState === "PAIRED"} busy={busy} label="Prepare scoring snapshot" onStage={(reason) => onStage("prepare-scoring-context", { ...scope, reason }, `Prepare the immutable scoring context for ${match.matchId}`)} /></article>;
}

function FutureRuntimeMatches({ data, busy, onStage }) {
  const runtime = data.futureRuntime;
  if (!runtime) return null;
  return <section className={styles.card}><header><span>Private competition preparation</span><h3>Pairings & scoring snapshots</h3><p>Every server mutation revalidates membership, team, format, handicap, Course, tee, and 18-hole context.</p></header><div className={styles.grid}>{runtime.matches.map((match) => <RuntimeMatch key={match.matchId} match={match} data={data} busy={busy} onStage={onStage} />)}</div>{!runtime.matches.length ? <p className={styles.note}>Promote the reviewed structural Matches before configuring pairings.</p> : null}</section>;
}

function Readiness({ data, busy, onStage }) {
  const runtime = data.futureRuntime;
  if (!runtime) return <section className={styles.card}><header><span>Activation preparation</span><h3>Readiness</h3></header><p>The bounded future runtime contract is not installed for this tournament.</p></section>;
  const readiness = runtime.readiness;
  const blockers = readiness.blockers;
  const scope = { targetTournamentId: data.selectedTournament.tournamentId, tournamentYear: data.selectedTournament.tournamentYear };
  return <section className={styles.card}><header><span>Owner-governed lifecycle</span><h3>Activation, Close & Archive readiness</h3></header><div className={styles.readiness}><article><State value={readiness.readyForActivation ? "READY_FOR_ACTIVATION" : "NEEDS_ATTENTION"} /><strong>{readiness.readyForActivation ? "Authoritative readiness passed" : "Setup needs attention"}</strong><span>{blockers.length ? `${blockers.length} authoritative blocker(s)` : "No readiness blockers returned."}</span></article>{blockers.map((item, index) => <article className={styles.blocker} key={`${item.code}:${index}`}><strong>{pretty(item.section || item.code)}</strong><span>{item.message || item.code}</span></article>)}</div><ReasonAction allowed={runtime.capabilities.markReady && readiness.readyForActivation && Boolean(readiness.fingerprint)} busy={busy} label="Review Ready for Activation" onStage={(reason) => onStage("mark-ready-v2", { ...scope, expectedRevision: data.selectedTournament.revision, readinessFingerprint: readiness.fingerprint, reason }, `Mark ${data.selectedTournament.tournamentYear} Ready for Activation using the current certified fingerprint`)} /><section className={styles.activation}><span>Owner confirmation required</span><h4>Prepare annual transition</h4><p>Preparation records exact generations and keeps the current pointer and scoring admission unchanged. Close, drain, and atomic activation remain separate reviewed stages.</p><ReasonAction allowed={runtime.capabilities.activateTournament && data.selectedTournament.lifecycle === "READY_FOR_ACTIVATION" && readiness.readyForActivation} busy={busy} label="Review transition preparation" onStage={(reason) => onStage("activate", { ...scope, expectedRevision: data.selectedTournament.lifecycleRevision, expectedCurrentTournamentId: runtime.currentTournament.tournamentId, expectedPointerRevision: runtime.currentTournament.pointerRevision, readinessFingerprint: readiness.fingerprint, reason }, `Prepare the explicit annual scoring transition to ${data.selectedTournament.tournamentYear}`)} /><p>The prepared receipt must be continued through the authorized annual-transition operator. This panel never closes admission or commits the current pointer.</p></section><section className={styles.activation}><span>Explicit post-competition lifecycle</span><h4>Close / Archive plan</h4><p>Current-tournament close is available only inside a prepared annual scoring transition after its explicit close and drain review. Archive execution remains unavailable.</p><button type="button" disabled>Close / drain / activation operator workflow</button><ReasonAction allowed={runtime.capabilities.prepareArchivePlan} busy={busy} label="Prepare archive plan" onStage={(reason) => onStage("prepare-archive-plan", { ...scope, expectedRevision: data.selectedTournament.lifecycleRevision, reason }, `Prepare the completed-history archive plan for ${data.selectedTournament.tournamentYear}`)} />{runtime.archivePlan ? <p><State value={runtime.archivePlan.status} /> Plan revision {runtime.archivePlan.planRevision} · {pretty(runtime.archivePlan.promotionStatus)}</p> : null}<button type="button" disabled>Archive execution unavailable</button></section></section>;
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
  const stage = useCallback((action, values, description) => { if (!data) return; try { const runtime = PRODUCTION_FUTURE_RUNTIME_ACTIONS.includes(action); const expectedRevision = values.expectedRevision ?? (action === "create" ? 0 : data.selectedTournament?.revision); const operationRequestId = uuid(); const builder = runtime ? buildFutureRuntimeMutation : buildFutureYearAdministrationMutation; builder(action, { ...values, expectedRevision, operationRequestId }); setReview({ action, values, description, expectedRevision, operationRequestId }); setConfirmed(false); setMessage(""); setReceipt(null); } catch (error) { setMessage(error.message || "Review the Future Tournament details."); setPhase("ready"); } }, [data]);
  const commit = useCallback(async () => { if (!review || !confirmed) return; setPhase("submitting"); try { const response = await fetch(ENDPOINT, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: review.action, expectedRevision: review.expectedRevision, operationRequestId: review.operationRequestId, ...review.values }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "The Future Tournament change did not complete."); setReceipt(payload.data); setReview(null); setConfirmed(false); setMessage(payload.data?.idempotent ? "The safe retry returned the authoritative result." : "Production confirmed the reviewed annual change."); await load(payload.data.targetTournamentId, true); } catch (error) { setMessage(error.message || "The Future Tournament change did not complete."); setPhase("ready"); } }, [confirmed, load, review]);
  const selected = data?.selectedTournament; const busy = phase === "submitting" || Boolean(review); const allowed = Boolean(data?.capabilities);
  const select = (id) => { setReview(null); setReceipt(null); setMessage(""); load(id); };
  if (phase === "loading" && !data) return <Empty title="Opening Future Tournaments">Reading the authoritative Production annual-administration catalog…</Empty>;
  if (!data) return <Empty title="Future Tournaments are unavailable">{message}<button type="button" onClick={() => load("")}>Try again</button></Empty>;
  return <section className={styles.shell} aria-labelledby="future-tournaments-title"><header className={styles.hero}><div><span>Production Owner annual administration</span><h2 id="future-tournaments-title">Future Tournaments</h2><p>Prepare a future annual tournament without changing the current tournament’s lifecycle.</p></div><State value={selected?.lifecycle || "CATALOG"} /></header><div className={styles.layout}><FutureList data={data} target={target} onSelect={select} /><main className={styles.main}>{!selected ? <CreateTournament onStage={stage} allowed={data.capabilities.createTournament} busy={busy} /> : <><div className={styles.selected}><div><span>Selected annual record</span><h3>{selected.name || `Tournament ${selected.tournamentYear}`}</h3><p>{selected.destination || "Destination pending"} · Revision {selected.revision}</p></div><State value={selected.lifecycle} /></div><Basics tournament={selected} allowed={data.capabilities.editTournament} busy={busy} onStage={stage} /><Teams data={data} allowed={data.capabilities.configureTeams} busy={busy} onStage={stage} /><Roster data={data} allowed={data.capabilities.replaceRoster} busy={busy} onStage={stage} /><FutureDirectorGovernance data={data} busy={busy} onStage={stage} /><Rounds data={data} allowed={data.capabilities.configureRounds || data.capabilities.assignExistingCourse} busy={busy} onStage={stage} /><MatchGeneration data={data} allowed={data.capabilities.generateMatchStructure} busy={busy} onStage={stage} /><GlobalCourseLibrary data={data} busy={busy} onStage={stage} /><RuntimePromotion data={data} busy={busy} onStage={stage} /><FutureHandicaps data={data} busy={busy} onStage={stage} /><FutureRuntimeMatches data={data} busy={busy} onStage={stage} /><Readiness data={data} busy={busy} onStage={stage} /><AuditTimeline audit={data.audit} /></>}{review ? <Review review={review} confirmed={confirmed} setConfirmed={setConfirmed} busy={phase === "submitting"} onCancel={() => { setReview(null); setConfirmed(false); }} onCommit={commit} /> : null}{message ? <p className={styles.message} role="status">{message}</p> : null}{receipt ? <p className={styles.receipt}><strong>{pretty(receipt.operation)} confirmed</strong><span>Revision {receipt.revision}{receipt.idempotent ? " · safe retry" : ""}</span></p> : null}</main></div></section>;
}
