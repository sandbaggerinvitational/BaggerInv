"use client";
import { useEffect, useRef, useState } from "react";
import { entryDraft, entrySaveRequest, entriesChanged } from "../../../lib/net-skins-entry-workspace.js";
import styles from "./net-skins-entries.module.css";
const formats={BB:"Best Ball",SC:"Scramble",SI:"Singles"};
async function request(body) {
  const response=await fetch("/api/director/net-skins-entries",{method:body?"POST":"GET",cache:"no-store",credentials:"same-origin",
    headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const value=await response.json(); if(!response.ok) throw new Error(value.error||"Entries are unavailable."); return value.data;
}
export function SavedEntriesReview({rounds=[]}) {
  return <div className={styles.review}>{rounds.filter(r=>r.configured).map(r=><div key={r.roundNumber}>
    <strong>Round {r.roundNumber} · {r.scope==="PAIR"?"Pair Entries":"Individual Entries"}</strong>
    <p>{r.entrants.length} {r.scope==="PAIR"?"pairs":"golfers"} · {r.enteredCount} In · {r.entrants.length-r.enteredCount} Out · Saved Revision {r.revision}</p>
    <details><summary>Review saved In / Out selections</summary>{[true,false].map(entered=><section key={String(entered)}><h5>{entered?"IN":"OUT"}</h5><ul>{r.entrants.filter(e=>e.entered===entered).map(e=><li key={e.key}>{e.players.map(p=>p.name).join(" + ")} <small>· {e.teamName} · Match {e.matchNumber}</small></li>)}</ul>{!r.entrants.some(e=>e.entered===entered)?<p>None</p>:null}</section>)}</details>
  </div>)}</div>;
}
export function EntryCutoffHelp(){return <details className={styles.warning}><summary>When do participant selections close?</summary>
  <p>Participant selections can be changed only before the Net Skins entry cutoff. The server checks this every time you save.</p>
  <ul><li>Net Skins has been configured for the round.</li><li>A match is no longer truly unstarted, including Mark Live or existing scoring activity.</li><li>Participant scoring access is active or an active scoring lease exists.</li><li>A Net Skins result exists for the round.</li><li>A Net Skins calculation is pending or running for the round.</li></ul>
  <p>Do not wait until the first score. Locking scoring does not undo an entry cutoff.</p></details>;}
export function RoundEntries({round,onSaved,transport=request,frozen=false}) {
  const [draft,setDraft]=useState(()=>entryDraft(round)); const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(""); const [reviewed,setReviewed]=useState(false); const retry=useRef(null);
  const [query,setQuery]=useState("");const [filter,setFilter]=useState("All");
  const changed=entriesChanged(round,draft); const reviewRequired=round.staleEntries.length>0;
  const pair=round.scope==="PAIR";const unit=pair?"pairs":"golfers";
  const inCount=draft.configured?draft.entries.filter(e=>e.entered).length:0;
  const save=async event=>{
    event.preventDefault();if(frozen||busy)return;setBusy(true);setMessage("");
    const values=entrySaveRequest(round,draft,"pending"); const identity=JSON.stringify(values);
    if(retry.current?.identity!==identity) retry.current={identity,id:crypto.randomUUID()};
    try {await transport({...values,operationRequestId:retry.current.id});await onSaved(round.roundNumber);
    } catch(error){setMessage(error.message);} finally{setBusy(false);}
  };
  const visible=round.entrants.map((entrant,index)=>({entrant,index,entered:draft.configured&&draft.entries[index].entered})).filter(({entrant,entered})=>
    (filter==="All"||entered===(filter==="In"))&&`${entrant.players.map(p=>p.name).join(" ")} ${entrant.teamName} ${entrant.matchNumber}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <form className={styles.round} onSubmit={save} aria-label={`Round ${round.roundNumber} Net Skins entries`}>
    <header><div><h4>Round {round.roundNumber} — {formats[round.format]}</h4><p>{pair?"Pair Entries":"Individual Entries"} · {round.entrants.length} {unit}</p></div>
      <span className={styles.badge}>{frozen?"Configured · entries frozen":changed?"Unsaved changes":round.configured?"Entries saved":"Not enabled"}</span></header>
    {!round.entrants.length?<p>{round.roundNumber===3?"Round 3 entries will be available after Singles pairings are finalized.":"Waiting for canonical pairings."} This round does not block other rounds.</p>:<>
      <section><h5>1 · Enable round</h5><label className={styles.toggle}><input type="checkbox" role="switch" checked={draft.configured} disabled={busy||frozen}
        onChange={e=>setDraft(d=>({...d,configured:e.target.checked}))}/> Enable Net Skins for Round {round.roundNumber}</label>
      <p>Turn this on to select and save Net Skins participants for this round. This does not finalize the entries.</p>
      <p className={styles.helper}>New entries start OUT. Enabling the round does not select anyone. Changes stay here until you save.</p></section>
      {frozen?<p className={styles.warning}>This round is configured. Ordinary entry changes are no longer allowed.</p>:null}
      {reviewRequired?<div className={styles.warning} role="status"><strong>Pairings changed — entry review required</strong>
        <p>Previous entries no longer bound to these pairings are excluded. They have not transferred to new partners.</p>
        <ul>{round.staleEntries.map(e=><li key={e.key}>{e.players.map(p=>p.name).join(" + ")}</li>)}</ul>
        <label className={styles.toggle}><input type="checkbox" checked={reviewed} disabled={busy||frozen} onChange={e=>setReviewed(e.target.checked)}/> I reviewed the current field and the previous entries above.</label>
      </div>:null}
      {draft.configured?<section><h5>2 · Select participants</h5>{pair?<p>Round 2 Net Skins participation is selected by pair. Both golfers are In or Out together.</p>:<p>Each golfer is selected independently.</p>}
      <div className={styles.counts} aria-live="polite"><span><strong>{inCount}</strong> {pair?"PAIRS IN":"IN"}</span><span><strong>{round.entrants.length-inCount}</strong> {pair?"PAIRS OUT":"OUT"}</span><span><strong>{round.entrants.length}</strong> {pair?"TOTAL PAIRS":"TOTAL"}</span></div>
      <div className={styles.tools}><label>{pair?"Search player/pair":"Search players"}<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className={styles.segment} role="group" aria-label="Filter entries">{["All","In","Out"].map(value=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value}</button>)}</div></div>
      <div className={styles.field}>{visible.map(({entrant,index,entered})=><div className={styles.entrant} key={entrant.key}>
        <div><strong>{entrant.players.map(p=>p.name).join(" + ")}</strong><span>{entrant.teamName} · Match {entrant.matchNumber}</span></div>
        <div className={styles.segment} role="group" aria-label={`${entrant.players.map(p=>p.name).join(" and ")} — ${pair?"pair ":""}participation`}>
          {[true,false].map(value=><button type="button" key={String(value)} disabled={busy||frozen} aria-pressed={entered===value}
            onClick={()=>setDraft(d=>({...d,entries:d.entries.map((v,i)=>i===index?{...v,entered:value}:v)}))}>{value?"IN":"OUT"}</button>)}
        </div></div>)}</div>{!visible.length?<p>No entries match this search or filter.</p>:null}</section>:<p>Enable this round to select participants. Saving a disabled round records every entry as OUT.</p>}
      <section><h5>3 · Save entries</h5><p>Saving records these selections. You can still change them until Net Skins is configured or another cutoff is reached.</p>
      <button type="submit" disabled={busy||frozen||(!changed&&!reviewRequired)||(reviewRequired&&!reviewed)}>{busy?"Saving entries…":`Save Round ${round.roundNumber} Entries`}</button></section>
      <section><h5>4 · Review saved entries</h5>{round.configured?<SavedEntriesReview rounds={[round]}/>:<p>No enabled entries saved for this round.</p>}{changed?<p>Unsaved changes are not included in the saved review.</p>:null}</section>
    </>}
    {message?<p role="alert">{message}</p>:null}
  </form>;
}
export default function ProductionNetSkinsEntries({onStateChange,configuredRounds=[],transport=request} = {}){
  const [data,setData]=useState(null);const [error,setError]=useState("");const [notice,setNotice]=useState("");const [epoch,setEpoch]=useState(0);
  async function refresh(savedRound){onStateChange?.({phase:"loading"});try{const value=await transport();setData(value);if(!savedRound)setEpoch(e=>e+1);setError("");onStateChange?.({phase:"ready",rounds:value.rounds});
    const r=value.rounds.find(r=>r.roundNumber===savedRound);setNotice(r?`Round ${r.roundNumber} entries saved · Saved Revision ${r.revision} · ${r.enteredCount} In · ${r.entrants.length-r.enteredCount} Out · ${r.entrants.length} ${r.scope==="PAIR"?"pairs":"golfers"}. Entries are not finalized.`:"Saved selections reloaded.");
  }catch(e){setError(e.message);onStateChange?.({phase:"failure"});}}
  useEffect(()=>{let active=true;onStateChange?.({phase:"loading"});transport().then(v=>{if(active){setData(v);onStateChange?.({phase:"ready",rounds:v.rounds});}}).catch(e=>{if(active){setError(e.message);onStateChange?.({phase:"failure"});}});return()=>{active=false;};},[onStateChange,transport]);
  return <section className={styles.workspace} aria-label="Net Skins Round entries"><h3>Select and save round entries</h3>
    <p>Enable a round → select In / Out → save → review. Final configuration is a separate step below. Buy-in and pot remain separate; saving entries does not collect payment, calculate Full Net or publish results.</p>
    <EntryCutoffHelp/>
    {error?<p role="alert">{error}</p>:null}{notice?<p className={styles.notice} role="status">{notice}</p>:null}
    <div><button type="button" onClick={()=>{if(globalThis.confirm("Reload saved entries? Unsaved entry selections will be discarded."))refresh();}}>Reload Saved Entries</button><p className={styles.helper}>Discard unsaved changes and reload the last saved selections.</p></div>
    {!data&&!error?<p role="status">Loading entries…</p>:null}
    {data?.rounds.map(round=><RoundEntries key={`${epoch}-${round.roundNumber}-${round.revision}-${round.fieldFingerprint}`} round={round} frozen={configuredRounds.includes(round.roundNumber)} onSaved={refresh} transport={transport}/>)}</section>;
}
