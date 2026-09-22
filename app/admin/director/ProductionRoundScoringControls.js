'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './round-scoring.module.css';
const labels = { OPEN: 'Open Round for Scoring', LOCK: 'Lock Round Scoring', RESUME: 'Resume Round Scoring' };
const verbs = { OPEN: 'Open', LOCK: 'Lock', RESUME: 'Resume' };
const titles = { OPEN: 'open for scoring', LOCK: 'scoring locked', RESUME: 'scoring resumed' };
async function request(round, body) {
  const response = await fetch(`/api/director/round-scoring?round=${round}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const value = await response.json();
  if (response.status >= 500 || !value || typeof value.ok !== 'boolean') throw new Error('ROUND_UNCONFIRMED');
  return value;
}
function Failures({ values = [] }) {
  return values.length ? <ul className={styles.failures}>{values.map((f, i) => <li key={`${f.matchId}-${f.code}-${i}`}><strong>{f.matchId || 'Round'}</strong> · {f.code}</li>)}</ul> : null;
}
function Receipt({ value }) {
  return <details className={styles.receipt}><summary>Round {value.round} {titles[value.operation]} · {value.affectedMatches.length} matches · Success</summary>
    <p>Director {value.director} · {new Date(value.at).toLocaleString()}<br />Operation <code>{value.operationId}</code></p>
    <ul>{value.affectedMatches.map(id => { const m = value.after.find(m => m.matchId === id); return <li key={id}>{id} · {m.status} · {m.locked ? 'Locked' : 'Unlocked'} · Access {m.accessActive ? 'Active' : 'Revoked'} · match revision {m.matchRevision} / access revision {m.permissionRevision}</li>; })}</ul>
  </details>;
}
export default function ProductionRoundScoringControls({ roundNumber, disabled = false, refresh, onBusy, refreshKey }) {
  const [state, setState] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null), [unknown, setUnknown] = useState(null), [message, setMessage] = useState(''), [failures, setFailures] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const flight = useRef(false), dialog = useRef(null), priorFocus = useRef(null);
  const storageKey = `bagger-round-intent-2026-${roundNumber}`;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const value = await request(roundNumber);
      if (!value.ok) throw new Error('READ_DENIED');
      setState(value.data);
      return value.data;
    } catch { setState(null); setMessage('Round state is unavailable. Individual controls remain below. Refresh before a round action.'); return null; }
    finally { setLoading(false); }
  }, [roundNumber]);
  const settleUnknown = useCallback((fresh, intent) => {
    const committed = fresh?.history?.find(h => h.operationId === intent?.operationId);
    if (committed) { setReceipt(committed); setUnknown(null); sessionStorage.removeItem(storageKey); setMessage(`Round ${roundNumber} ${titles[committed.operation]}. The saved operation completed; no repeat is needed. Current state is shown below.`); return true; }
    return false;
  }, [roundNumber, storageKey]);
  useEffect(() => { let saved; try { saved = JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* No credential storage here. */ }
    if (saved) { setUnknown(saved); setMessage('Checking the previous round operation.'); }
    load().then(fresh => { if (saved && !settleUnknown(fresh, saved)) setMessage('The previous outcome is not confirmed. Refresh state or retry the same operation.'); });
  }, [load, settleUnknown, storageKey, refreshKey]);
  useEffect(() => { if (!pending) return; priorFocus.current = document.activeElement; const node = dialog.current; node?.focus(); return () => priorFocus.current?.focus?.(); }, [pending]);
  const run = async intent => {
    if (flight.current) return;
    flight.current = true; setBusy(true); onBusy?.(true); setMessage(''); setFailures([]);
    try {
      // Keep only the reviewed, non-secret operation identity across refresh.
      sessionStorage.setItem(storageKey, JSON.stringify(intent));
      const result = await request(roundNumber, intent);
      if (!result.ok) {
        if (result.data) setState(result.data);
        setMessage(`Round action denied: ${result.code || 'DIRECTOR_AUTHORIZATION_REQUIRED'}. No matches changed by this request. Refresh and review.`);
        setFailures(result.failures || []); setPending(null); setUnknown(null); sessionStorage.removeItem(storageKey); return;
      }
      setReceipt(result.receipt); setState(result.data); setPending(null); setUnknown(null); sessionStorage.removeItem(storageKey);
      setMessage(`Round ${roundNumber} ${titles[intent.operation]}. ${result.receipt.affectedMatches.length} matches confirmed. 0 failures.`);
      await refresh?.(); await load();
    } catch {
      setPending(null); setUnknown(intent); setMessage('Outcome unknown. The server may have committed. Refresh authoritative state or retry this same operation; do not create a second request.');
      const fresh = await load(); settleUnknown(fresh, intent);
    } finally { flight.current = false; setBusy(false); onBusy?.(false); }
  };
  const review = async operation => {
    if (flight.current) return; const fresh = await load();
    if (!fresh?.actions?.[operation]?.allowed) { setMessage('Round action is not ready. No matches were changed.'); setFailures(fresh?.actions?.[operation]?.failures || []); return; }
    setPending({ round: roundNumber, operation, operationId: crypto.randomUUID(), expectedFingerprint: fresh.fingerprint });
  };
  const blocked = busy || disabled || loading || !!unknown;
  const summary = state?.summary;
  const confirm = pending && state?.actions[pending.operation];
  return <section className={styles.card} aria-label={`Round ${roundNumber} scoring controls`}>
    <header><div><span className={styles.eyebrow}>Round scoring controls</span><h3>Round {roundNumber} · {{ BB: 'Best Ball', SC: 'Scramble', SI: 'Singles' }[state?.format] || 'Scoring'}</h3></div><span className={styles.count}>{summary ? `${summary.total} matches` : 'Checking state'}</span></header>
    {summary && <dl className={styles.stats}>{[['READY', `${summary.ready} / ${state.expectedMatches}`], ['UPCOMING', summary.upcoming], ['LIVE', summary.live], ['FINAL', summary.final], ['ACCESS ACTIVE', summary.accessActive], ['LOCKED', summary.locked], ['ACTIVE LEASES', summary.activeLeases]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {summary?.final === state?.expectedMatches && state ? <p className={styles.complete}>Round Complete · Review results using individual match cards.</p> : <>
      <p className={styles.note}>Whole-round checks run before any change. Finalize and Reopen remain individual match actions.</p>
      <div className={styles.actions}>{Object.entries(labels).map(([op,label]) => <button key={op} type="button" disabled={blocked || !state?.actions[op]?.allowed} onClick={() => review(op)}>{label}</button>)}</div>
      {state && !state.actions.OPEN.allowed && summary.live === 0 && summary.final === 0 && <details className={styles.denial}><summary>Why this round cannot open</summary><Failures values={state.actions.OPEN.failures} /></details>}
      {state && !state.actions.RESUME.allowed && summary.locked > 0 && summary.live > 0 && <details className={styles.denial}><summary>Why this round cannot resume</summary><Failures values={state.actions.RESUME.failures} /></details>}
      {summary && summary.live > 0 && (summary.final > 0 || summary.upcoming > 0) && <p className={styles.note}>Mixed state: Lock targets {state.actions.LOCK.targets.length} Live matches. {summary.final} Final and {summary.upcoming} Upcoming matches stay unchanged. Use individual cards for other transitions.</p>}
    </>}
    {message && <p className={styles.notice} role="status">{message}</p>}<Failures values={failures} />
    <div className={styles.secondary}><button type="button" disabled={busy || loading} onClick={async () => { const fresh = await load(); if (unknown) settleUnknown(fresh, unknown); }}>Refresh Authoritative State</button>{unknown && <button type="button" disabled={busy || loading || disabled} onClick={() => run(unknown)}>Retry Same Operation</button>}</div>
    {receipt && <Receipt value={receipt} />}
    {!!state?.history?.length && <details className={styles.history}><summary>Round operation history ({state.history.length})</summary>{state.history.map(h => <Receipt key={h.operationId} value={h} />)}</details>}
    {pending && confirm && <div className={styles.backdrop}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`round-confirm-${roundNumber}`} className={styles.dialog} onKeyDown={event => {
      if (event.key === 'Escape' && !busy) setPending(null);
      if (event.key === 'Tab') { const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]; const first=buttons[0], last=buttons.at(-1); if(event.shiftKey && (document.activeElement===first||document.activeElement===event.currentTarget)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();} }
    }}><span className={styles.eyebrow}>Confirm Director action</span><h2 id={`round-confirm-${roundNumber}`}>{verbs[pending.operation]} Round {roundNumber}{pending.operation==='OPEN'?' for Scoring?':' Scoring?'}</h2>
      <strong>{confirm.targets.length} matches will {pending.operation==='OPEN'?'open':pending.operation==='LOCK'?'pause':'resume'} together.</strong>
      {pending.operation === 'OPEN' ? <><ul><li>{summary.ready}/{state.expectedMatches} READY</li><li>All matches Upcoming and Unlocked</li><li>Participant access Revoked · 0 active scoring leases</li><li>Handicap revision {state.handicapRevision} current</li><li>Course, tee, pairings and scoring contexts current</li></ul><p>This marks all {confirm.targets.length} matches Live, then activates participant scoring access. No scores will be entered.</p></> : pending.operation === 'LOCK' ? <><p>Scores and running results will be preserved. Participant scoring access will be revoked.</p><p>{summary.final} Final and {summary.upcoming} Upcoming matches will not change.</p></> : <><p>Retained scoring contexts, assignments, handicaps, course/tee authority and score history have passed validation.</p><p>Scoring will unlock and participant access will activate. Existing scores and results stay intact. No scoring context is regenerated.</p></>}
      <details><summary>Affected matches</summary><ul>{confirm.targets.map(id=><li key={id}>{id}</li>)}</ul></details>
      <p className={styles.note}>If any authority changes before commit, the entire action is denied.</p>
      <div className={styles.actions}><button type="button" disabled={busy} onClick={()=>setPending(null)}>Cancel</button><button type="button" disabled={busy} onClick={()=>run(pending)}>{busy?'Waiting for confirmation…':`${verbs[pending.operation]} Round ${roundNumber}`}</button></div>
    </section></div>}
  </section>;
}
