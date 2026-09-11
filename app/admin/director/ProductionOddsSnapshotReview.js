"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./odds-snapshot-review.module.css";

const value = (number) => typeof number === "number" && Number.isFinite(number) ? String(number) : "Not retained";
const time = (date) => date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleString() : "Not retained";

export default function ProductionOddsSnapshotReview({ job, busy, onPublish }) {
  const [review, setReview] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const heading = useRef(null), trigger = useRef(null), request = useRef(0);
  useEffect(() => {
    request.current += 1; setReview(null); setError(""); setLoading(false);
    return () => { request.current += 1; };
  }, [job.job_id, job.input_fingerprint, job.publication_status]);
  useEffect(() => { if (review) heading.current?.focus(); }, [review]);
  const load = async () => {
    const identity = ++request.current;
    setLoading(true); setReview(null); setError("");
    try {
      const response = await fetch(`/api/admin/production-odds-calculations?job=${encodeURIComponent(job.job_id)}&review=1`, { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true || payload.review?.jobId !== job.job_id || !payload.review?.snapshot || payload.review.certification?.inputFingerprint !== job.input_fingerprint) {
        throw new Error(payload.error || "The snapshot could not be verified. Publication remains blocked.");
      }
      if (identity === request.current) setReview(payload.review);
    } catch (failure) { if (identity === request.current) setError(failure.message || "Snapshot review is unavailable."); }
    finally { if (identity === request.current) setLoading(false); }
  };
  const close = () => { setReview(null); trigger.current?.focus(); };
  const c = review?.certification || {};
  return <div className={styles.workspace}>
    <button ref={trigger} type="button" disabled={busy || loading} onClick={load} aria-expanded={Boolean(review)}>{loading ? "Checking snapshot…" : "Review Snapshot"}</button>
    {error ? <p role="alert">{error}</p> : null}
    {review ? <section className={styles.review} aria-label="Certified snapshot review">
      <header><h3 ref={heading} tabIndex={-1}>Review Snapshot · {review.milestone}</h3><p>{Number(review.iterations).toLocaleString()} iterations · Completed {time(review.completedAt)}</p><p role="status">{review.freshness === "CURRENT" ? "Current — inputs verified at review time" : "Historical — already published"}</p></header>
      <div className={styles.teams}>{(review.snapshot.teams || []).map((team) => <section key={team.side} aria-label={team.name}>
        <h4>{team.name}</h4><span>Championship probability</span><strong>{value(team.rawProbability ?? team.probability)}%</strong><span>Expected tournament points: <b>{value(team.expectedPoints)}</b></span><span>American odds: {team.americanOdds ?? "Not retained"}</span>
      </section>)}</div>
      <p>{review.titleBasis}</p>
      <h4>Player projections</h4>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Player projections, horizontally scrollable"><table>
        <thead><tr><th>Rank</th><th>Player</th><th>Probability</th><th>American odds</th><th>Expected points</th><th>Expected record</th><th>Average finish</th></tr></thead>
        <tbody>{(review.snapshot.players || []).map((player) => <tr key={player.id}><td>{value(player.rank)}</td><th scope="row">{player.name}</th><td>{value(player.probability)}%</td><td>{player.americanOdds ?? "Not retained"}</td><td>{value(player.expectedPoints)}</td><td>{player.expectedRecord ?? "Not retained"}</td><td>{value(player.averageFinish)}</td></tr>)}</tbody>
      </table></div>
      <h4>Calculation basis</h4>
      <ul>{review.rounds.map((round) => <li key={round.round}>Round {round.round}: {round.paired} / {round.total} complete pairings retained{round.round === 3 && round.paired === 0 ? " — Singles draw not yet set" : ""}.</li>)}</ul>
      <p>{review.singlesBasis}</p>
      <details><summary>Certification / authority</summary>
        <p>Current Setup revision: {c.currentSetupRevision ?? "Unavailable"}; approved Handicap revision: {c.currentHandicapRevision ?? "Unavailable"}.</p>
        <p>Separate Setup and Handicap revision numbers were not retained by this calculation. Current revisions are context, not retroactive artifact bindings.</p>
        <p>Prediction Settings revision consumed: {c.predictionSettingsRevision ?? "Not retained"}. Currentness is checked against retained input fingerprints; publication checks again independently.</p>
        <dl>{[["Calculation ID",review.jobId],["Deployment SHA",c.deploymentCommit],["Input fingerprint",c.inputFingerprint],["Result fingerprint",c.resultFingerprint],["Pairing fingerprint",c.pairingFingerprint],["Effective settings fingerprint",c.settingsFingerprint],["Engine",review.snapshot.engineVersion],["Inputs checked",time(review.checkedAt)]].map(([label,text]) => <div key={label}><dt>{label}</dt><dd>{text || "Not retained"}</dd></div>)}</dl>
        <details><summary>Retained full-precision player probabilities</summary><ul>{(review.snapshot.players || []).map(player => <li key={player.id}>{player.name}: {value(player.rawProbability)}%</li>)}</ul></details>
      </details>
      <div className={styles.actions}><button type="button" onClick={close}>Close Review</button>{review.freshness === "CURRENT" && review.publicationEligible === true ? <button type="button" disabled={busy} data-impact="high" onClick={() => { onPublish(job); close(); }}>Publish Certified Snapshot</button> : null}</div>
      <p>Publication requires a separate confirmation. Reviewing does not publish or recalculate anything.</p>
    </section> : null}
  </div>;
}
