"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildTournamentAwardsMutation,
  PRODUCTION_TOURNAMENT_AWARD_RECIPIENT_KINDS,
  PRODUCTION_TOURNAMENT_AWARD_STATES,
} from "../../../lib/production-tournament-awards-contract.js";
import styles from "./ProductionTournamentSetupPanel.module.css";

const ENDPOINT = "/api/director/tournament-awards";
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

function blankAward(displayOrder) {
  return {
    awardId: uuid(),
    title: "",
    description: "",
    displayOrder,
    publicationState: "DRAFT",
    recipientKind: "UNAVAILABLE",
    winnerPlayerId: "",
    winnerTeamId: "",
    recipientDisplay: "",
    recipient: { kind: "UNAVAILABLE" },
    isNew: true,
  };
}

function renumber(awards) {
  return awards.map((award, index) => ({ ...award, displayOrder: index + 1 }));
}

function AwardEditor({ award, roster, teams, disabled, update, move, remove }) {
  const retired = award.publicationState === "RETIRED";
  const set = (key) => (event) => update(award.awardId, { [key]: event.target.value });
  return <article className={styles.awardCard} data-retired={retired || undefined}>
    <header>
      <div><small>Position {award.displayOrder}</small><h4>{award.title || "New Award"}</h4></div>
      <span className={styles.badge} data-state={award.publicationState === "PUBLISHED" ? "ready" : retired ? "locked" : "attention"}>{pretty(award.publicationState)}</span>
    </header>
    <div className={styles.formGrid}>
      <label><span>Award title</span><input value={award.title} maxLength={160} disabled={disabled || retired} onChange={set("title")} /></label>
      <label><span>Winner type</span><select value={award.recipientKind} disabled={disabled || retired} onChange={set("recipientKind")}>{PRODUCTION_TOURNAMENT_AWARD_RECIPIENT_KINDS.map((kind) => <option key={kind} value={kind}>{kind === "UNAVAILABLE" ? "Pending" : pretty(kind)}</option>)}</select></label>
      {award.recipientKind === "PLAYER" ? <label><span>Current roster Player</span><select value={award.winnerPlayerId} disabled={disabled || retired} onChange={set("winnerPlayerId")}><option value="">Select Player</option>{roster.map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName} · {player.teamName}</option>)}</select></label> : null}
      {award.recipientKind === "TEAM" ? <label><span>Current tournament Team</span><select value={award.winnerTeamId} disabled={disabled || retired} onChange={set("winnerTeamId")}><option value="">Select Team</option>{teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}</select></label> : null}
      {award.recipientKind === "TEXT" ? <label><span>Display winner</span><input value={award.recipientDisplay} maxLength={160} disabled={disabled || retired} onChange={set("recipientDisplay")} /></label> : null}
      <label><span>Publication</span><select value={award.publicationState} disabled={disabled || retired} onChange={set("publicationState")}>{PRODUCTION_TOURNAMENT_AWARD_STATES.filter((state) => state !== "RETIRED").map((state) => <option key={state} value={state}>{pretty(state)}</option>)}</select></label>
    </div>
    <label><span>Description (optional)</span><textarea rows={3} maxLength={1000} value={award.description} disabled={disabled || retired} onChange={set("description")} /></label>
    <div className={styles.buttonRow}>
      <button type="button" className={styles.secondaryButton} disabled={disabled || award.displayOrder === 1} onClick={() => move(award.awardId, -1)}>Move Up</button>
      <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={() => move(award.awardId, 1)}>Move Down</button>
      {!retired ? <button type="button" className={styles.dangerButton} disabled={disabled} onClick={() => remove(award.awardId)}>{award.publicationState === "PUBLISHED" ? "Retire Award" : "Remove Draft Award"}</button> : null}
    </div>
  </article>;
}

export default function ProductionTournamentAwardsPanel({ disabled: parentDisabled = false }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState([]);
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("");
  const [review, setReview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setPhase("loading");
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Awards are temporarily unavailable.");
      setData(payload.data);
      setDraft(payload.data.awards || []);
      setPhase("ready");
    } catch (error) {
      setMessage(error?.message || "Awards are temporarily unavailable.");
      setPhase("failure");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changed = useMemo(() => data && JSON.stringify(draft.map(({ recipient, isNew, ...award }) => award)) !== JSON.stringify(data.awards.map(({ recipient, ...award }) => award)), [data, draft]);
  const disabled = parentDisabled || phase === "submitting" || Boolean(review);
  const update = useCallback((awardId, change) => setDraft((current) => current.map((award) => award.awardId === awardId ? {
    ...award,
    ...change,
    ...(change.recipientKind ? { winnerPlayerId: "", winnerTeamId: "", recipientDisplay: "" } : {}),
  } : award)), []);
  const move = useCallback((awardId, direction) => setDraft((current) => {
    const index = current.findIndex((award) => award.awardId === awardId);
    const target = Math.max(0, Math.min(current.length - 1, index + direction));
    if (index < 0 || target === index) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return renumber(next);
  }), []);
  const remove = useCallback((awardId) => setDraft((current) => {
    const selected = current.find((award) => award.awardId === awardId);
    if (selected?.publicationState === "PUBLISHED") {
      return current.map((award) => award.awardId === awardId ? { ...award, publicationState: "RETIRED" } : award);
    }
    return renumber(current.filter((award) => award.awardId !== awardId));
  }), []);

  const stage = useCallback(() => {
    try {
      const operationRequestId = uuid();
      buildTournamentAwardsMutation({ awards: draft, expectedRevision: data.revision, operationRequestId });
      setReview({ awards: draft, expectedRevision: data.revision, operationRequestId });
      setConfirmed(false);
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "Review the Award fields before continuing.");
      setPhase("failure");
    }
  }, [data, draft]);

  const commit = useCallback(async () => {
    if (!review || !confirmed) return;
    setPhase("submitting");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(review),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Awards did not save.");
      setReview(null);
      setConfirmed(false);
      setMessage(payload.data?.idempotent ? "The safe retry returned the existing Awards revision." : "Production confirmed the Awards revision.");
      await load({ quiet: true });
    } catch (error) {
      setMessage(error?.message || "Awards did not save.");
      setPhase("failure");
    }
  }, [confirmed, load, review]);

  if (phase === "loading" && !data) return <section className={styles.loading} role="status"><strong>Opening Awards</strong><span>Reading the current Supabase Awards revision…</span></section>;
  if (!data) return <section className={styles.failure} role="alert"><h3>Awards are unavailable</h3><p>{message}</p><button type="button" onClick={() => load()}>Try Again</button></section>;

  return <section className={styles.awardsShell} aria-labelledby="tournament-awards-title">
    <section className={styles.card}>
      <header className={styles.sectionHeader}><div><span>Tournament honors</span><h3 id="tournament-awards-title">Awards</h3><p>Create pending Awards, assign canonical Players or Teams, control publication, and preserve every committed revision.</p></div><span className={styles.badge} data-state="ready">Revision {data.revision}</span></header>
      {!draft.length ? <p className={styles.emptyState}>No tournament awards configured.</p> : <div className={styles.awardList}>{draft.map((award) => <AwardEditor key={award.awardId} award={award} roster={data.roster} teams={data.teams} disabled={disabled} update={update} move={move} remove={remove} />)}</div>}
      <div className={styles.buttonRow}>
        <button type="button" className={styles.secondaryButton} disabled={disabled || draft.length >= 100} onClick={() => setDraft((current) => [...current, blankAward(current.length + 1)])}>Add Award</button>
        <button type="button" disabled={disabled || !changed} onClick={stage}>Review Awards Changes</button>
      </div>
      <p className={styles.help}>Pending and Draft Awards remain Director-only. Published Awards are eligible for future canonical public/history projections; this phase adds no new public section.</p>
    </section>
    {review ? <section className={styles.review} aria-labelledby="awards-review-title"><header><span>Review before commit</span><h3 id="awards-review-title">Save Awards Revision</h3><p>No Production change has been made.</p></header><dl><div><dt>Expected Awards revision</dt><dd>{review.expectedRevision}</dd></div><div><dt>Awards</dt><dd>{review.awards.length}</dd></div><div><dt>Published</dt><dd>{review.awards.filter((award) => award.publicationState === "PUBLISHED").length}</dd></div></dl><p>The server will revalidate the current tournament, Director entitlement, stable identities, publication rules, revision, and idempotency atomically.</p><label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the Award winners, visibility, order, and immutable audit effect.</span></label><div className={styles.buttonRow}><button type="button" className={styles.secondaryButton} disabled={phase === "submitting"} onClick={() => { setReview(null); setConfirmed(false); setPhase("ready"); }}>Return to Editing</button><button type="button" disabled={!confirmed || phase === "submitting"} onClick={commit}>{phase === "submitting" ? "Confirming…" : "Confirm Production Change"}</button></div></section> : null}
    {message ? <p className={styles.message} data-error={phase === "failure" ? "true" : undefined} role={phase === "failure" ? "alert" : "status"}>{message}</p> : null}
    <details className={styles.audit}><summary>Awards revision history <span>{data.history.length}</span></summary>{data.history.length ? <ol>{data.history.map((item) => <li key={item.revisionId}><div><strong>Revision {item.revision}</strong><span>{item.itemCount} Awards · {item.publishedCount} published</span></div><small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</small></li>)}</ol> : <p>No Awards revisions have been created.</p>}</details>
  </section>;
}
