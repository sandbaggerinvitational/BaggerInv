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
export function RoundEntries({round,onSaved,transport=request}) {
  const [draft,setDraft]=useState(()=>entryDraft(round)); const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(""); const [reviewed,setReviewed]=useState(false); const retry=useRef(null);
  const changed=entriesChanged(round,draft); const reviewRequired=round.staleEntries.length>0;
  const save=async event=>{
    event.preventDefault();setBusy(true);setMessage("");
    const values=entrySaveRequest(round,draft,"pending"); const identity=JSON.stringify(values);
    if(retry.current?.identity!==identity) retry.current={identity,id:crypto.randomUUID()};
    try {await transport({...values,operationRequestId:retry.current.id});
      setMessage("Entry revision saved. No calculation or publication was created.");await onSaved();
    } catch(error){setMessage(error.message);} finally{setBusy(false);}
  };
  return <form className={styles.round} onSubmit={save} aria-label={`Round ${round.roundNumber} Net Skins entries`}>
    <header><div><h4>Round {round.roundNumber} · {formats[round.format]}</h4><p>{round.scope==="PAIR"?"Scramble pairs":"Individual golfers"} · Revision {round.revision}</p></div>
      <span>{round.enteredCount} saved {round.enteredCount===1?"entry":"entries"} · {round.entrants.length} canonical {round.scope==="PAIR"?"pairs":"golfers"}</span></header>
    <p role="status">{{NOT_CONFIGURED:"Not configured",REVIEW_REQUIRED:"Entry review required",WAITING_FOR_PAIRINGS:"Waiting for pairings",ENTRIES_SAVED:"Entry revision saved"}[round.state]}</p>
    {!round.entrants.length?<p>Waiting for canonical pairings. This Round is not required to configure other Rounds.</p>:<>
      <label className={styles.toggle}><input type="checkbox" checked={draft.configured} disabled={busy}
        onChange={e=>setDraft(d=>({...d,configured:e.target.checked}))}/> Configure Net Skins entries for this Round</label>
      <p>Match participation is not entry. Mark each golfer or complete pair In or Out. Buy-in and pot remain separate calculation configuration; this save does not set or collect either.</p>
      {reviewRequired?<div className={styles.warning} role="status"><strong>Pairings changed — entry review required</strong>
        <p>Previous entries no longer bound to these pairings are excluded. They have not transferred to new partners.</p>
        <ul>{round.staleEntries.map(e=><li key={e.key}>{e.players.map(p=>p.name).join(" · ")}</li>)}</ul>
        <label className={styles.toggle}><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed the current field and the previous entries above.</label>
      </div>:null}
      <div className={styles.field}>{round.entrants.map((entrant,index)=><div className={styles.entrant} key={entrant.key}>
        <div><strong>{entrant.players.map(p=>p.name).join(" · ")}</strong><span>{entrant.teamName} · Match {entrant.matchNumber}</span></div>
        <label className={styles.toggle}><input type="checkbox" checked={draft.configured&&draft.entries[index].entered} disabled={busy||!draft.configured}
          aria-label={`${entrant.players.map(p=>p.name).join(" and ")} — ${round.scope==="PAIR"?"pair ":""}entered`}
          onChange={e=>setDraft(d=>({...d,entries:d.entries.map((v,i)=>i===index?{...v,entered:e.target.checked}:v)}))}/>
          {draft.configured&&draft.entries[index].entered?"In":"Out"}</label>
      </div>)}</div>
      <button type="submit" disabled={busy||(!changed&&!reviewRequired)||(reviewRequired&&!reviewed)}>{busy?"Saving entries…":"Save Round Entries"}</button>
    </>}
    {message?<p role="status">{message}</p>:null}
  </form>;
}
export default function ProductionNetSkinsEntries(){
  const [data,setData]=useState(null);const [error,setError]=useState("");
  async function refresh(){try{setData(await request());setError("");}catch(e){setError(e.message);}}
  useEffect(()=>{let active=true;request().then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  return <section className={styles.workspace} aria-label="Net Skins Round entries"><h3>Round Entries</h3>
    <p>Explicit Director entry only. Saving entries does not calculate Full Net, configure awards, or publish results.</p>
    {error?<p role="alert">{error}</p>:null}
    <button type="button" onClick={()=>{if(globalThis.confirm("Reload saved entries? Unsaved entry selections will be discarded."))refresh();}}>Reload Saved Entries</button>
    {!data&&!error?<p role="status">Loading entries…</p>:null}
    {data?.rounds.map(round=><RoundEntries key={`${round.roundNumber}-${round.revision}-${round.fieldFingerprint}`} round={round} onSaved={refresh}/>)}</section>;
}
