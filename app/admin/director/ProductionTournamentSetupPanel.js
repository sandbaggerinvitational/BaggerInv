"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildTournamentSetupParticipantSlots,
  buildTournamentSetupMutation,
  productionTournamentFormatParticipantCount,
} from "../../../lib/production-tournament-setup-contract.js";
import ProductionTournamentAwardsPanel from "./ProductionTournamentAwardsPanel.js";
import styles from "./ProductionTournamentSetupPanel.module.css";

const ENDPOINT = "/api/director/tournament-setup";
const SECTIONS = Object.freeze([
  ["tournament", "Tournament"],
  ["teams", "Teams"],
  ["roster", "Roster"],
  ["rounds", "Rounds"],
  ["courses", "Courses"],
  ["matches", "Matches & Pairings"],
  ["awards", "Awards"],
  ["readiness", "Readiness"],
]);

const pretty = (value) => String(value || "Unavailable").toLowerCase().replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function StateBadge({ value, children }) {
  const normalized = String(value || "unavailable").toUpperCase();
  const state = ["READY", "COMPLETE", "ACTIVE", "PREPARED"].includes(normalized)
    ? "ready"
    : ["LOCKED", "BLOCKED", "UNAVAILABLE"].includes(normalized) ? "locked" : "attention";
  return <span className={styles.badge} data-state={state}>{children || pretty(value)}</span>;
}

function SectionHeader({ eyebrow, title, description, state }) {
  return <header className={styles.sectionHeader}>
    <div><span>{eyebrow}</span><h3>{title}</h3><p>{description}</p></div>
    {state ? <StateBadge value={state} /> : null}
  </header>;
}

function Blockers({ blockers = [], warnings = [] }) {
  if (!blockers.length && !warnings.length) return null;
  return <div className={styles.notices}>
    {blockers.map((item) => <p data-kind="blocker" key={item}><strong>Locked</strong>{item}</p>)}
    {warnings.map((item) => <p data-kind="warning" key={item}><strong>Needs attention</strong>{item}</p>)}
  </div>;
}

function TournamentEditor({ data, disabled, stage }) {
  const tournament = data.tournament;
  const [draft, setDraft] = useState(tournament);
  useEffect(() => setDraft(tournament), [tournament]);
  const change = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  return <section className={styles.card}>
    <SectionHeader eyebrow="Operational facts" title="Tournament" description="Supabase-authoritative competition identity and operating dates. Editorial Guide content remains separate." state={data.readiness.sections.find((item) => item.id === "tournament")?.state} />
    <div className={styles.formGrid}>
      <label><span>Tournament name</span><input value={draft.name} disabled={disabled} onChange={change("name")} /></label>
      <label><span>Destination</span><input value={draft.destination} disabled={disabled} onChange={change("destination")} /></label>
      <label><span>Start date</span><input type="date" value={draft.startDate} disabled={disabled} onChange={change("startDate")} /></label>
      <label><span>End date</span><input type="date" value={draft.endDate} disabled={disabled} onChange={change("endDate")} /></label>
      <label><span>Time zone</span><input value={draft.timeZone} disabled={disabled} onChange={change("timeZone")} /></label>
      <label><span>Operational status</span><input value={pretty(draft.operationalStatus)} disabled aria-describedby="tournament-status-note" /></label>
    </div>
    <p className={styles.help} id="tournament-status-note">Tournament ID, year, workbook binding, and lifecycle are protected. This phase does not invent a new lifecycle transition.</p>
    <button type="button" disabled={disabled} onClick={() => stage("update-tournament", {
      name: draft.name,
      destination: draft.destination,
      startDate: draft.startDate,
      endDate: draft.endDate,
      timeZone: draft.timeZone,
      operationalStatus: draft.operationalStatus || "UPCOMING",
    }, `Update ${tournament.name} operational metadata`)}>Review Tournament Update</button>
  </section>;
}

function TeamsEditor({ data, disabled, stage }) {
  const activeRoster = data.roster.filter((player) => player.membershipStatus === "ACTIVE");
  return <section className={styles.card}>
    <SectionHeader eyebrow="Stable team identities" title="Teams & Captains" description="Change an existing team name or captain without silently changing roster assignments." state={data.readiness.sections.find((item) => item.id === "teams")?.state} />
    <div className={styles.teamGrid}>{data.teams.map((team) => <TeamCard key={team.teamId} team={team} roster={activeRoster} disabled={disabled || team.locked} stage={stage} />)}</div>
    <p className={styles.help}>Creating, retiring, or re-keying teams is deferred because Production has no established team-ID lifecycle beyond the two stable sides.</p>
  </section>;
}

function TeamCard({ team, roster, disabled, stage }) {
  const [name, setName] = useState(team.name);
  const [captain, setCaptain] = useState(team.captainPlayerId);
  useEffect(() => { setName(team.name); setCaptain(team.captainPlayerId); }, [team]);
  const eligible = roster.filter((player) => player.teamId === team.teamId);
  return <article className={styles.subcard}>
    <header><div><small>Team {team.side}</small><h4>{team.name}</h4></div><StateBadge value={team.locked ? "LOCKED" : "READY"} /></header>
    <label><span>Team name</span><input value={name} disabled={disabled} onChange={(event) => setName(event.target.value)} /></label>
    <label><span>Captain</span><select value={captain} disabled={disabled} onChange={(event) => setCaptain(event.target.value)}><option value="">Select a roster member</option>{eligible.map((player) => <option value={player.playerId} key={player.playerId}>{player.displayName} · {player.playerId}</option>)}</select></label>
    <button type="button" disabled={disabled || !captain} onClick={() => stage("update-team", {
      teamId: team.teamId,
      teamName: name,
      captainPlayerId: captain,
    }, `Update ${team.name} and captain assignment`)}>Review Team Update</button>
  </article>;
}

function RosterEditor({ data, disabled, stage }) {
  const [teamDrafts, setTeamDrafts] = useState({});
  const [newPlayerId, setNewPlayerId] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  useEffect(() => setTeamDrafts(Object.fromEntries(data.roster.map((player) => [player.playerId, player.teamId]))), [data.roster]);
  return <section className={styles.card}>
    <SectionHeader eyebrow="Competition membership" title="Roster → Team Assignment" description="Add an existing global Player or change an unstarted Player assignment. Team, handicap, pairings, and Auth remain separate facts." state={data.readiness.sections.find((item) => item.id === "roster")?.state} />
    {data.availablePlayers.length ? <div className={styles.addRow}>
      <label><span>Existing global Player</span><select value={newPlayerId} disabled={disabled} onChange={(event) => setNewPlayerId(event.target.value)}><option value="">Select Player</option>{data.availablePlayers.map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName} · {player.playerId}</option>)}</select></label>
      <label><span>Team</span><select value={newTeamId} disabled={disabled} onChange={(event) => setNewTeamId(event.target.value)}><option value="">Select Team</option>{data.teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}</select></label>
      <button type="button" disabled={disabled || !newPlayerId || !newTeamId} onClick={() => stage("assign-roster-team", { playerId: newPlayerId, teamId: newTeamId }, `Add ${newPlayerId} to the tournament and assign ${newTeamId}`)}>Review Add to Tournament</button>
    </div> : null}
    <div className={styles.tableWrap}><table><thead><tr><th>Player</th><th>Status</th><th>Handicap</th><th>Team</th><th>Readiness</th><th /></tr></thead><tbody>{data.roster.map((player) => {
      const selectedTeam = teamDrafts[player.playerId] || "";
      const changed = selectedTeam && selectedTeam !== player.teamId;
      return <tr key={player.playerId}><th scope="row"><strong>{player.displayName}</strong><small>{player.playerId}</small></th><td><StateBadge value={player.membershipStatus} /></td><td>{player.tournamentHandicap || "Required"}</td><td><select aria-label={`Team for ${player.displayName}`} value={selectedTeam} disabled={disabled || !player.canAssignTeam} onChange={(event) => setTeamDrafts((current) => ({ ...current, [player.playerId]: event.target.value }))}>{data.teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}</select></td><td>{player.frozenMatchCount ? `${player.frozenMatchCount} frozen match${player.frozenMatchCount === 1 ? "" : "es"}` : player.pairedMatchCount ? `${player.pairedMatchCount} unstarted pairing${player.pairedMatchCount === 1 ? "" : "s"}` : "Pairing required"}</td><td><button type="button" disabled={disabled || !player.canAssignTeam || !changed} onClick={() => stage("assign-roster-team", { playerId: player.playerId, teamId: selectedTeam }, `Assign ${player.displayName} to ${data.teams.find((team) => team.teamId === selectedTeam)?.name || selectedTeam}`)}>Review</button></td></tr>;
    })}</tbody></table></div>
  </section>;
}

function RoundsEditor({ data, disabled, stage }) {
  return <section className={styles.card}>
    <SectionHeader eyebrow="Certified formats" title="Rounds & Formats" description="Configure only Best Ball, Scramble, and Singles. Started rounds remain locked." state={data.readiness.sections.find((item) => item.id === "rounds")?.state} />
    <div className={styles.roundGrid}>{data.rounds.map((round) => <RoundCard key={round.number} round={round} disabled={disabled || round.locked} stage={stage} />)}</div>
  </section>;
}

function RoundCard({ round, disabled, stage }) {
  const [draft, setDraft] = useState(round);
  useEffect(() => setDraft(round), [round]);
  const change = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  return <article className={styles.subcard}>
    <header><div><small>Round {round.number}</small><h4>{round.name}</h4></div><StateBadge value={round.locked ? "LOCKED" : round.status} /></header>
    <label><span>Name</span><input value={draft.name} disabled={disabled} onChange={change("name")} /></label>
    <div className={styles.formGrid}><label><span>Format</span><select value={draft.format} disabled={disabled} onChange={change("format")}><option value="BB">Best Ball</option><option value="SC">Scramble</option><option value="SI">Singles</option></select></label><label><span>Players per side</span><input type="number" value={draft.teamSize} disabled={disabled} onChange={change("teamSize")} /></label><label><span>Points per match</span><input inputMode="decimal" value={draft.pointsAvailable} disabled={disabled} onChange={change("pointsAvailable")} /></label><label><span>Handicap allowance</span><input inputMode="decimal" value={draft.handicapAllowance} disabled={disabled} onChange={change("handicapAllowance")} /></label></div>
    <button type="button" disabled={disabled} onClick={() => stage("update-round", {
      roundNumber: round.number,
      roundName: draft.name,
      format: draft.format,
      teamSize: draft.teamSize,
      pointsAvailable: draft.pointsAvailable,
      handicapAllowance: draft.handicapAllowance,
    }, `Update Round ${round.number} ${draft.format} configuration`)}>Review Round Update</button>
  </article>;
}

function CoursesEditor({ data, disabled, stage }) {
  const [newCourseId, setNewCourseId] = useState("");
  const [newRoundNumber, setNewRoundNumber] = useState(String(data.rounds[0]?.number || 1));
  const identity = data.availableCourseIdentities.find((course) => course.courseId === newCourseId);
  const newCourse = useMemo(() => identity ? {
    roundNumber: Number(newRoundNumber),
    courseId: identity.courseId,
    name: identity.name,
    city: "",
    state: "",
    tee: "",
    rating: "",
    slope: "",
    par: "",
    holes: [],
    complete: false,
    locked: false,
  } : null, [identity, newRoundNumber]);
  return <section className={styles.card}>
    <SectionHeader eyebrow="Scoring facts" title="Courses, Tees & Holes" description="Configure an existing canonical course identity with its tournament tee and complete 18-hole scoring context." state={data.readiness.sections.find((item) => item.id === "courses")?.state} />
    <p className={styles.help}>Creating a brand-new global course is deferred: Production has no certified Course-ID allocation lifecycle. Existing current/history course identities remain selectable.</p>
    {data.availableCourseIdentities.length ? <div className={styles.addRow}>
      <label><span>Existing global course</span><select value={newCourseId} disabled={disabled} onChange={(event) => setNewCourseId(event.target.value)}><option value="">Select Course</option>{data.availableCourseIdentities.map((course) => <option key={course.courseId} value={course.courseId}>{course.name} · {course.location || course.courseId}</option>)}</select></label>
      <label><span>Tournament round</span><select value={newRoundNumber} disabled={disabled} onChange={(event) => setNewRoundNumber(event.target.value)}>{data.rounds.map((round) => <option key={round.number} value={round.number}>Round {round.number} · {round.format}</option>)}</select></label>
      <p className={styles.help}>Selecting an identity does not copy or invent a tee, rating, slope, par, or hole facts.</p>
    </div> : null}
    {newCourse ? <CourseCard key={`new:${newCourse.roundNumber}:${newCourse.courseId}`} course={newCourse} disabled={disabled} stage={stage} newConfiguration /> : null}
    <div className={styles.courseList}>{data.courses.map((course) => <CourseCard key={`${course.roundNumber}:${course.courseId}`} course={course} disabled={disabled || course.locked} stage={stage} />)}</div>
  </section>;
}

function CourseCard({ course, disabled, stage, newConfiguration = false }) {
  const blankHoles = Array.from({ length: 18 }, (_, index) => ({ number: index + 1, par: "", strokeIndex: "", yardage: "" }));
  const [draft, setDraft] = useState({ ...course, holes: course.holes.length === 18 ? course.holes : blankHoles });
  useEffect(() => setDraft({ ...course, holes: course.holes.length === 18 ? course.holes : blankHoles }), [course]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const changeHole = (index, key) => (event) => setDraft((current) => ({ ...current, holes: current.holes.map((hole, holeIndex) => holeIndex === index ? { ...hole, [key]: event.target.value } : hole) }));
  return <details className={styles.courseCard} open={!course.complete}>
    <summary><div><span>{newConfiguration ? "New tournament configuration" : `Round ${course.roundNumber}`}</span><strong>{course.name || course.courseId}</strong><small>{course.tee || "Tee required"} · {course.complete ? "18 holes complete" : "Needs attention"}</small>{!newConfiguration ? <small>{course.setupManaged ? "Setup-managed" : course.complete ? "Imported course complete" : "Imported course incomplete"}</small> : null}</div><StateBadge value={course.locked ? "LOCKED" : course.complete ? "COMPLETE" : "NEEDS_ATTENTION"} /></summary>
    <div className={styles.formGrid}><label><span>Course ID</span><input value={draft.courseId} disabled /></label><label><span>Course name</span><input value={draft.name} disabled={disabled} onChange={change("name")} /></label><label><span>City</span><input value={draft.city} disabled={disabled} onChange={change("city")} /></label><label><span>State</span><input value={draft.state} disabled={disabled} onChange={change("state")} /></label><label><span>Tee</span><input value={draft.tee} disabled={disabled} onChange={change("tee")} /></label><label><span>Rating</span><input inputMode="decimal" value={draft.rating} disabled={disabled} onChange={change("rating")} /></label><label><span>Slope</span><input inputMode="numeric" value={draft.slope} disabled={disabled} onChange={change("slope")} /></label><label><span>Par</span><input inputMode="numeric" value={draft.par} disabled={disabled} onChange={change("par")} /></label></div>
    <div className={styles.holeGrid} aria-label={`Round ${course.roundNumber} hole definitions`}>{draft.holes.map((hole, index) => <fieldset key={hole.number || index}><legend>Hole {index + 1}</legend><label><span>Par</span><input inputMode="numeric" value={hole.par} disabled={disabled} onChange={changeHole(index, "par")} /></label><label><span>Stroke index</span><input inputMode="numeric" value={hole.strokeIndex} disabled={disabled} onChange={changeHole(index, "strokeIndex")} /></label><label><span>Yards</span><input inputMode="numeric" value={hole.yardage ?? ""} disabled={disabled} onChange={changeHole(index, "yardage")} /></label></fieldset>)}</div>
    <button type="button" disabled={disabled} onClick={() => stage("upsert-course", {
      roundNumber: course.roundNumber,
      courseId: draft.courseId,
      courseName: draft.name,
      city: draft.city,
      state: draft.state,
      tee: draft.tee,
      rating: draft.rating,
      slope: draft.slope,
      par: draft.par,
      holes: draft.holes,
    }, `Update Round ${course.roundNumber} course, tee, and 18-hole scoring context`)}>Review Course Update</button>
  </details>;
}

function MatchesEditor({ data, disabled, stage }) {
  return <section className={styles.card}>
    <SectionHeader eyebrow="Canonical competition structure" title="Matches & Pairings" description="Configure the existing Production match set, assign valid roster Players, then prepare the scoring snapshot the existing engine consumes." state={data.readiness.sections.find((item) => item.id === "matches")?.state} />
    <div className={styles.notices}><p data-kind="warning"><strong>Existing matches only</strong>New match creation is deferred until the certified Google mirror/archive provisioning path supports it.</p></div>
    <div className={styles.matchList}>{data.matches.map((match) => <MatchCard key={match.matchId} match={match} roster={data.roster} teams={data.teams} courses={data.courses} disabled={disabled || match.locked} stage={stage} />)}</div>
  </section>;
}

function MatchCard({ match, roster, teams, courses, disabled, stage }) {
  const expected = productionTournamentFormatParticipantCount(match.format);
  const [participants, setParticipants] = useState(() => buildTournamentSetupParticipantSlots(match.participants, match.format));
  const [metadata, setMetadata] = useState({ courseId: match.courseId, tee: match.tee, teeTime: match.teeTime });
  useEffect(() => setParticipants(buildTournamentSetupParticipantSlots(match.participants, match.format)), [match]);
  useEffect(() => setMetadata({ courseId: match.courseId, tee: match.tee, teeTime: match.teeTime }), [match]);
  const choose = (index) => (event) => setParticipants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, playerId: event.target.value } : item));
  const chooseCourse = (event) => {
    const selected = courses.find((course) => `${course.courseId}::${course.tee}` === event.target.value);
    if (selected) setMetadata((current) => ({ ...current, courseId: selected.courseId, tee: selected.tee }));
  };
  const matchCourses = courses.filter((course) => course.roundNumber === match.roundNumber);
  const scoringBlockers = match.scoringReady ? [] : match.scoringReadinessReasons;
  const pairingIncomplete = match.participantCount !== expected;
  return <details className={styles.matchCard} open={!match.scoringReady || match.blockers.length > 0}>
    <summary><div><span>Round {match.roundNumber} · {match.format}</span><strong>Match {match.matchNumber}</strong><small>{match.courseName || match.courseId} · {match.teeTime || "Tee time required"}</small></div><StateBadge value={match.locked ? "LOCKED" : match.scoringReady ? "READY" : "NEEDS_ATTENTION"} /></summary>
    <Blockers blockers={[...match.blockers, ...scoringBlockers.filter((item) => !match.blockers.includes(item))]} warnings={match.warnings} />
    <div className={styles.addRow}><label><span>Course & tee</span><select value={`${metadata.courseId}::${metadata.tee}`} disabled={disabled} onChange={chooseCourse}>{matchCourses.map((course) => <option key={`${course.courseId}:${course.tee}`} value={`${course.courseId}::${course.tee}`}>{course.name || course.courseId} · {course.tee}</option>)}</select></label><label><span>Tee time</span><input type="time" value={metadata.teeTime || ""} disabled={disabled} onChange={(event) => setMetadata((current) => ({ ...current, teeTime: event.target.value }))} /></label><button type="button" disabled={disabled || !metadata.courseId || !metadata.tee || !metadata.teeTime} onClick={() => stage("upsert-match", { matchId: match.matchId, roundNumber: match.roundNumber, matchNumber: match.matchNumber, ...metadata }, `Update ${match.matchId} course and tee time`)}>Review Match Details</button></div>
    <div className={styles.pairingBoard}>{participants.map((participant, index) => {
      const team = teams.find((item) => item.side === participant.teamSide);
      const eligible = roster.filter((player) => player.membershipStatus === "ACTIVE" && player.teamSide === participant.teamSide);
      return <label key={`${participant.teamSide}:${participant.playerSlot}`}><span>{team?.name || `Team ${participant.teamSide}`} · Slot {participant.playerSlot}</span><select value={participant.playerId} disabled={disabled} onChange={choose(index)}><option value="">Select Player</option>{eligible.map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName} · {player.tournamentHandicap || "handicap required"}</option>)}</select></label>;
    })}</div>
    {pairingIncomplete ? <p className={styles.help} role="status"><strong>Pairing incomplete.</strong> The assigned slots above are canonical. Complete every slot or safely clear the unstarted pairing.</p> : null}
    <div className={styles.buttonRow}><button type="button" disabled={disabled || participants.some((item) => !item.playerId)} onClick={() => stage("replace-pairings", { matchId: match.matchId, format: match.format, participants }, `Replace ${match.matchId} pairings and rebuild its unstarted context`)}>Review Pairings</button>{match.participants.length > 0 ? <button className={styles.secondaryButton} type="button" disabled={disabled || !match.canClearPairings} onClick={() => stage("replace-pairings", { matchId: match.matchId, format: match.format, participants: [] }, `Clear all participants from strictly unstarted ${match.matchId}`)}>Clear Pairings</button> : null}<button className={styles.secondaryButton} type="button" disabled={disabled || pairingIncomplete || participants.some((item) => !item.playerId)} onClick={() => stage("prepare-scoring-context", { matchId: match.matchId }, `Prepare immutable scoring context for ${match.matchId}`)}>{match.snapshot.prepared && !match.scoringReady ? "Prepare Current Scoring Context" : "Prepare Scoring Context"}</button></div>
    <p className={styles.help}>Pairing changes never activate scoring access. Clearing is limited to strictly unstarted matches and preserves prior snapshots as audit evidence. Tournament Day retains the separate certified access operation.</p>
  </details>;
}

function Readiness({ data }) {
  return <section className={styles.card}>
    <SectionHeader eyebrow="Server-authoritative validation" title="Tournament Readiness" description="This projection checks canonical Supabase facts; it does not infer or fabricate missing setup." state={data.readiness.state} />
    <div className={styles.readinessGrid}>{data.readiness.sections.map((section) => <article key={section.id}><header><strong>{section.label}</strong><StateBadge value={section.state} /></header><Blockers blockers={section.blockers} warnings={section.warnings} />{!section.blockers.length && !section.warnings.length ? <p>Complete.</p> : null}</article>)}</div>
    <Blockers blockers={data.readiness.blockers} warnings={data.readiness.warnings} />
    <div className={styles.dependencyGrid}><article><small>Odds</small><strong>{data.dependencies.oddsPublished ? "Published" : "No published blocker"}</strong></article><article><small>Net Skins</small><strong>{data.dependencies.netSkinsConfigured ? "Configured" : "Optional / Not Configured"}</strong></article><article><small>Calcutta</small><strong>{data.dependencies.calcuttaConfigured ? "Configured" : "Optional / Not Configured"}</strong></article><article><small>Draft picks</small><strong>{data.dependencies.draftPickCount}</strong></article></div>
    <p className={styles.help}>Net Skins readiness is derived from these same matches, pairings, handicaps, and holes. Calcutta remains optional unless separately configured.</p>
  </section>;
}

export default function ProductionTournamentSetupPanel() {
  const [data, setData] = useState(null);
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("");
  const [section, setSection] = useState("readiness");
  const [review, setReview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setPhase("loading");
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || "Tournament Setup is temporarily unavailable."), { code: payload.code });
      setData(payload.data);
      setPhase("ready");
      return payload.data;
    } catch (error) {
      setMessage(error?.message || "Tournament Setup is temporarily unavailable.");
      setPhase("failure");
      return null;
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const stage = useCallback((action, values, description) => {
    if (!data) return;
    try {
      const operationRequestId = uuid();
      buildTournamentSetupMutation(action, { ...values, expectedRevision: data.revision, operationRequestId });
      setReview({ action, values, description, expectedRevision: data.revision, operationRequestId });
      setConfirmed(false);
      setMessage("");
      setReceipt(null);
    } catch (error) {
      setMessage(error?.message || "Review the highlighted Tournament Setup fields.");
      setPhase("failure");
    }
  }, [data]);

  const commit = useCallback(async () => {
    if (!review || !confirmed) return;
    setPhase("submitting");
    setMessage("");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: review.action,
          expectedRevision: review.expectedRevision,
          operationRequestId: review.operationRequestId,
          ...review.values,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || "Tournament Setup did not complete."), { code: payload.code });
      setReceipt(payload.data);
      setReview(null);
      setConfirmed(false);
      setMessage(payload.data?.idempotent ? "The safe retry returned the existing authoritative result." : "Production confirmed the Tournament Setup change.");
      await load({ quiet: true });
    } catch (error) {
      setMessage(error?.message || "Tournament Setup did not complete.");
      setPhase("failure");
    }
  }, [confirmed, load, review]);

  const current = useMemo(() => data?.readiness.sections.find((item) => item.id === section), [data, section]);
  if (phase === "loading" && !data) return <section className={styles.loading} role="status"><strong>Opening Tournament Setup</strong><span>Reading authoritative Production tournament facts…</span></section>;
  if (!data) return <section className={styles.failure} role="alert"><h2>Tournament Setup is unavailable</h2><p>{message}</p><button type="button" onClick={() => load()}>Try Again</button></section>;
  const disabled = phase === "submitting" || Boolean(review);
  return <section className={styles.shell} aria-labelledby="tournament-setup-title">
    <header className={styles.hero}><div><span>Supabase-native tournament operations</span><h2 id="tournament-setup-title">Tournament Setup</h2><p>Build and validate the competition without SQL or Google canonical edits.</p></div><div><StateBadge value={data.readiness.state} /><small>Setup revision {data.revision}</small></div></header>
    <nav className={styles.sectionNav} aria-label="Tournament Setup sections">{SECTIONS.map(([id, label]) => {
      const state = data.readiness.sections.find((item) => item.id === id)?.state;
      return <button type="button" key={id} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><span>{label}</span>{state ? <StateBadge value={state} /> : null}</button>;
    })}</nav>
    {current ? <Blockers blockers={current.blockers} warnings={current.warnings} /> : null}
    {section === "tournament" ? <TournamentEditor data={data} disabled={disabled || !data.capabilities["update-tournament"].allowed} stage={stage} /> : null}
    {section === "teams" ? <TeamsEditor data={data} disabled={disabled || !data.capabilities["update-team"].allowed} stage={stage} /> : null}
    {section === "roster" ? <RosterEditor data={data} disabled={disabled || !data.capabilities["assign-roster-team"].allowed} stage={stage} /> : null}
    {section === "rounds" ? <RoundsEditor data={data} disabled={disabled || !data.capabilities["update-round"].allowed} stage={stage} /> : null}
    {section === "courses" ? <CoursesEditor data={data} disabled={disabled || !data.capabilities["upsert-course"].allowed} stage={stage} /> : null}
    {section === "matches" ? <MatchesEditor data={data} disabled={disabled || (!data.capabilities["upsert-match"].allowed && !data.capabilities["replace-pairings"].allowed)} stage={stage} /> : null}
    {section === "awards" ? <ProductionTournamentAwardsPanel disabled={disabled} /> : null}
    {section === "readiness" ? <Readiness data={data} /> : null}
    {review ? <section className={styles.review} aria-labelledby="tournament-setup-review-title"><header><span>Review before commit</span><h3 id="tournament-setup-review-title">{pretty(review.action)}</h3><p>No Production change has been made.</p></header><dl><div><dt>Requested change</dt><dd>{review.description}</dd></div><div><dt>Expected setup revision</dt><dd>{review.expectedRevision}</dd></div><div><dt>Operation identity</dt><dd>Prepared for one safe, idempotent Production operation</dd></div></dl><p>The server will revalidate exact resources, Director entitlement, revision, dependencies, and frozen competition facts atomically.</p><label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the target, current state, downstream consequences, and immutable audit effect.</span></label><div className={styles.buttonRow}><button type="button" className={styles.secondaryButton} disabled={phase === "submitting"} onClick={() => { setReview(null); setConfirmed(false); setPhase("ready"); }}>Return to Editing</button><button type="button" disabled={!confirmed || phase === "submitting"} onClick={commit}>{phase === "submitting" ? "Confirming…" : "Confirm Production Change"}</button></div></section> : null}
    {message ? <p className={styles.message} data-error={phase === "failure" ? "true" : undefined} role={phase === "failure" ? "alert" : "status"}>{message}</p> : null}
    {receipt ? <p className={styles.receipt}><strong>{pretty(receipt.action)} confirmed</strong><span>Setup revision {receipt.revision}{receipt.idempotent ? " · safe retry" : ""}</span></p> : null}
    {receipt ? <Blockers warnings={receipt.warnings} /> : null}
    <details className={styles.audit}><summary>Recent setup activity <span>{data.audit.length}</span></summary>{data.audit.length ? <ol>{data.audit.map((item) => <li key={item.id}><div><strong>{pretty(item.action)}</strong><span>{item.summary || item.target}</span></div><small>{item.actor || "Tournament Director"}<br />{item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}</small><StateBadge value={item.result} /></li>)}</ol> : <p>No setup changes have been recorded by this contract.</p>}</details>
  </section>;
}
