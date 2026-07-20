"use client";
import { useMemo, useState } from "react";
import styles from "./odds.module.css";

export default function OddsCenter({ snapshots, error }) {
  const latest = snapshots.at(-1), [selectedPhase,setSelectedPhase]=useState(latest?.phase || "");
  const current = snapshots.find((s)=>s.phase===selectedPhase) || latest;
  const prior = current ? snapshots.filter((s)=>s.phaseOrder<current.phaseOrder).at(-1) : null;
  const movers = useMemo(()=>{ if(!current||!prior)return []; const old=Object.fromEntries(prior.players.map(p=>[p.id,p])); return current.players.filter(p=>old[p.id]).map(p=>({...p,change:p.probability-old[p.id].probability,previous:old[p.id]})).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,4); },[current,prior]);
  if (!current) return <><section className={styles.hero}><p>SBI Analytics</p><h1>Odds Center</h1><span>Championship and player projections through every official tournament milestone.</span></section><section className={styles.shell}><div className={styles.empty}><span>Projections Coming Soon</span><h2>Odds are not available yet</h2><p>{error || "Official tournament odds have not been published yet."}</p></div></section></>;
  return <>
    <section className={styles.hero}><p>SBI Analytics</p><h1>Odds Center</h1><span>Championship and player projections through every official tournament milestone.</span></section>
    <section className={styles.shell}>
      <nav className={styles.timeline}>{snapshots.map(s=><button className={s.phase===current.phase?styles.active:""} onClick={()=>setSelectedPhase(s.phase)} key={s.phase}><i/><span>{s.phase}</span><small>{new Date(s.publishedAt).toLocaleDateString()}</small></button>)}</nav>
      <div className={styles.heading}><div><span>Official Snapshot</span><h2>{current.phase}</h2></div><small>{current.iterations.toLocaleString()} tournament simulations</small></div>
      <div className={styles.teamGrid}>{current.teams.map(t=><article key={t.side}><span>Championship Odds</span><h3>{t.name}</h3><strong>{t.probability.toFixed(1)}%</strong><b>{t.americanOdds}</b><p>Expected points <em>{t.expectedPoints.toFixed(2)}</em></p></article>)}</div>
      <section className={styles.board}><div className={styles.boardTitle}><span>Top Player Odds</span><h2>Projected individual champion</h2></div><div className={`${styles.row} ${styles.head}`}><span>Rank</span><span>Player</span><span>Probability</span><span>Odds</span><span>Exp. Points</span><span>Exp. Record</span><span>Avg. Finish</span></div>{current.players.map((p,i)=><div className={styles.row} key={p.id}><strong>{i+1}</strong><b>{p.name}</b><strong>{p.probability.toFixed(1)}%</strong><span>{p.americanOdds}</span><span>{p.expectedPoints.toFixed(2)}</span><span>{p.expectedRecord}</span><span>{p.averageFinish.toFixed(1)}</span></div>)}</section>
      {movers.length?<section className={styles.movers}><span>Biggest Movers</span><div>{movers.map(p=><article key={p.id} data-up={p.change>0}><i>{p.change>0?"▲":"▼"}</i><b>{p.name}</b><span>{p.previous.americanOdds} → {p.americanOdds}</span><strong>{p.change>0?"+":""}{p.change.toFixed(1)} pts</strong></article>)}</div></section>:null}
      <section className={styles.playerTimeline}><span>Player Odds Timelines</span>{current.players.slice(0,8).map(p=><div key={p.id}><b>{p.name}</b>{snapshots.map(s=>{const x=s.players.find(v=>v.id===p.id);return <span key={s.phase}><small>{s.phase}</small><strong>{s.phase==="Final Results"&&x?.probability===100?"Winner":x?.americanOdds||"—"}</strong></span>})}</div>)}</section>
    </section>
  </>;
}
