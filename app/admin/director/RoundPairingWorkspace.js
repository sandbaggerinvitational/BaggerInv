"use client";
import { createPairingDraft, detailsDirty, pairingDirty, pairingKey, validatePairingWorkspace } from '../../../lib/round-pairing-workspace.js';
import styles from './ProductionTournamentSetupPanel.module.css';
const label=(p,roster)=>roster.find(r=>r.playerId===p.playerId)?.displayName || p.playerId || 'Unassigned';

export function PairingReview({review,data}) {
  const rows=review.values.matches || (review.action==='replace-pairings'?[review.values]:[]);
  if(!rows.length) return null;
  return <div className={styles.roundReview}>
    <p>Approved handicap revision: {data.approvedHandicapRevisionNumber || 'Unavailable'} · {data.approvedHandicapRevisionId || 'Unavailable'}</p>
    {review.summary?<p>{review.summary.coverage}/{review.summary.total} Players assigned · {review.summary.duplicates} duplicates · {review.summary.missing} missing.<br />This will update {review.summary.changed} matches and {review.summary.changedAssignments} Player assignments.</p>:null}
    {rows.map(row=>{const m=data.matches.find(m=>m.matchId===row.matchId);return <article key={row.matchId}>
      <strong>{row.matchId} · {m?.format} · {m?.courseName} · {m?.teeTime}</strong>
      {[1,2].map(side=><p key={side}>{data.teams.find(t=>t.side===side)?.name}: {row.participants.filter(p=>p.teamSide===side).map(p=>`${label(p,data.roster)} (${p.playerId})`).join(' + ') || 'Empty'}</p>)}
      <small>{pairingKey(row.participants)===pairingKey(m?.participants)?'Unchanged canonical pairing':'Changed pairing'} · Server revalidation required</small>
    </article>;})}
    <p>Pairings only. Changed unstarted contexts are invalidated; no scoring snapshot is prepared and no scoring access is granted. Prepare Scoring Context remains separate.</p>
  </div>;
}

export default function RoundPairingWorkspace({data,drafts,setDrafts,round,setRound,disabled,stage,reload}) {
  const matches=data.matches.filter(m=>m.roundNumber===round);
  const validation=validatePairingWorkspace(data,drafts,round);
  const update=(m,patch)=>setDrafts(current=>({...current,[m.matchId]:{...(current[m.matchId]||createPairingDraft(m)),...patch}}));
  const selectRound=(event,index)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?data.rounds.length-1:(index+(event.key==='ArrowRight'?1:-1)+data.rounds.length)%data.rounds.length;
    setRound(data.rounds[next].number); document.getElementById(`pairing-round-tab-${data.rounds[next].number}`)?.focus();
  };
  return <section className={styles.card} aria-label="Round pairing workspace">
    <h3>Matches & Pairings</h3>
    <div className={styles.roundTabs} role="tablist" aria-label="Pairing round">{data.rounds.map((r,i)=><button key={r.number} id={`pairing-round-tab-${r.number}`} type="button" role="tab" aria-selected={round===r.number} aria-controls={`pairing-round-${r.number}`} tabIndex={round===r.number?0:-1} onKeyDown={e=>selectRound(e,i)} onClick={()=>setRound(r.number)}>Round {r.number} · {r.format}</button>)}</div>
    <div role="tabpanel" id={`pairing-round-${round}`} aria-labelledby={`pairing-round-tab-${round}`}>
      <header className={styles.roundActions}><h4>Round {round} Pairings</h4>
        <p role="status">{matches.filter(m=>(drafts[m.matchId]||createPairingDraft(m)).participants.every(p=>p.playerId)).length}/{matches.length} matchups entered · {validation.changed} unsaved · {validation.coverage}/{validation.total} Players assigned</p>
        <div className={styles.buttonRow}><button type="button" disabled={disabled||validation.errors.length>0||!validation.changed} onClick={()=>stage('replace-round-pairings',{roundNumber:round,matches:validation.assignments,expectedHandicapRevisionId:data.approvedHandicapRevisionId},`Save all Round ${round} pairings atomically`,validation)}>Review All Round {round} Pairings</button>
        <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={reload}>Refresh Saved State — Preserve Drafts</button></div>
        <p>Save one matchup independently or review the complete round. Unchanged saved pairings are retained. Reloading or leaving this page can lose unsaved work.</p>
        {validation.errors.length>0?<details><summary>Round review needs attention ({validation.errors.length})</summary><ul>{validation.errors.map(e=><li key={e}>{e}</li>)}</ul></details>:null}
      </header>
      <div className={styles.matchList}>{matches.map(match=>{
        const d=drafts[match.matchId]||createPairingDraft(match),dirty=pairingDirty(d),detailPending=detailsDirty(d);
        const individual=validatePairingWorkspace(data,drafts,round,{fullRound:false,matchId:match.matchId});
        const blocked=disabled||match.locked;
        return <article className={styles.matchCard} key={match.matchId} aria-label={`Match ${match.matchNumber} pairing card`}>
          <header className={styles.pairingHeading}><h4>Match {match.matchNumber} · {match.matchId}</h4><p>{match.courseName} · {match.teeTime} · {match.status}</p><strong role="status">{dirty?'Unsaved pairing changes':'Canonical saved pairings'}{d.needsReview?' · Needs review':''}</strong></header>
          <p>Saved: {[1,2].map(side=>`${data.teams.find(t=>t.side===side)?.name}: ${match.participants.filter(p=>p.teamSide===side).map(p=>label(p,data.roster)).join(' + ') || 'Not configured'}`).join(' / ')}</p>
          <div className={styles.addRow}>
            <label>Course & tee<select value={`${d.metadata.courseId}::${d.metadata.tee}`} disabled={blocked} onChange={e=>{const c=data.courses.find(c=>`${c.courseId}::${c.tee}`===e.target.value);if(c)update(match,{metadata:{...d.metadata,courseId:c.courseId,tee:c.tee}});}}>{data.courses.filter(c=>c.roundNumber===round).map(c=><option key={`${c.courseId}:${c.tee}`} value={`${c.courseId}::${c.tee}`}>{c.name} · {c.tee}</option>)}</select></label>
            <label>Tee time<input type="time" value={d.metadata.teeTime} disabled={blocked} onChange={e=>update(match,{metadata:{...d.metadata,teeTime:e.target.value}})} /></label>
            <button type="button" disabled={blocked||d.conflict||!d.metadata.teeTime} onClick={()=>stage('upsert-match',{matchId:match.matchId,roundNumber:round,matchNumber:match.matchNumber,...d.metadata},`Save ${match.matchId} Match Details; retain pending Player selections`)}>Review Match Details</button>
          </div>
          {(detailPending||!match.detailsManaged)?<p role="status">Save Match Details before committing pairings. Your Player selections will be preserved.</p>:null}
          {d.conflict?<p role="alert">Saved pairings or context changed concurrently. Pending selections are retained but blocked. Record them before discarding to use the new saved state.</p>:null}
          <div className={styles.pairingBoard}>{d.participants.map((p,index)=><label key={`${p.teamSide}:${p.playerSlot}`}>{data.teams.find(t=>t.side===p.teamSide)?.name} · Slot {p.playerSlot}<select value={p.playerId} disabled={blocked} onChange={e=>update(match,{participants:d.participants.map((old,i)=>i===index?{...old,playerId:e.target.value}:old),needsReview:true})}><option value="">Select Player</option>{data.roster.filter(r=>r.membershipStatus==='ACTIVE'&&r.teamSide===p.teamSide).map(r=><option key={r.playerId} value={r.playerId}>{r.displayName} · {r.tournamentHandicap===''?'Handicap required':r.tournamentHandicap}</option>)}</select></label>)}</div>
          {individual.errors.length?<ul>{individual.errors.map(e=><li key={e}>{e}</li>)}</ul>:null}
          <div className={styles.buttonRow}>
            <button type="button" disabled={blocked||individual.errors.length>0||!dirty} onClick={()=>stage('replace-pairings',{matchId:match.matchId,format:match.format,participants:d.participants},`Save Match ${match.matchNumber} Pairings (${match.matchId}) only`)}>Review Match {match.matchNumber} Pairings</button>
            {(dirty||detailPending||d.conflict)?<button type="button" className={styles.secondaryButton} disabled={disabled} onClick={()=>{if(window.confirm(`Discard unsaved selections/details for ${match.matchId} and use canonical saved state?`))update(match,createPairingDraft(match));}}>Discard This Match’s Draft</button>:null}
            {match.participants.length>0?<button type="button" className={styles.secondaryButton} disabled={blocked||dirty||detailPending||!match.canClearPairings} onClick={()=>stage('replace-pairings',{matchId:match.matchId,format:match.format,participants:[]},`Clear saved pairings for ${match.matchId}`)}>Clear Pairings</button>:null}
            <button type="button" className={styles.secondaryButton} disabled={blocked||dirty||detailPending||d.conflict||match.participantCount!==(match.format==='SI'?2:4)} onClick={()=>stage('prepare-scoring-context',{matchId:match.matchId},`Prepare scoring context for ${match.matchId}`)}>Prepare Scoring Context</button>
          </div>
          <p className={styles.help}>Scoring readiness: {match.scoringReady?'Ready':match.scoringReadinessReasons.join(' ') || 'Not prepared'}. Pairing saves do not prepare snapshots or activate scoring.</p>
        </article>;
      })}</div>
    </div>
  </section>;
}
