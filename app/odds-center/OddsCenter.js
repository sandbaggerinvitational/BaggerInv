"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./odds.module.css";
import { formatChampionshipOdds } from "../../lib/championship-odds-format";
import { clearOddsCenterLoadingReload } from "../../lib/odds-center-loading-recovery";
import { reconcileOddsCenterSelection } from "../../lib/odds-center-selection";
import { isTournamentRecapPhase, projectionPresentationLabel, tournamentRecapFromSnapshot } from "../../lib/projection-phases";

export default function OddsCenter({ snapshots, error }) {
  const router = useRouter();
  const latest = snapshots.at(-1), [selectedPhase,setSelectedPhase]=useState(latest?.phase || "");
  const userSelectedPhase = useRef(false), lastRefreshAt = useRef(0);
  const selection = reconcileOddsCenterSelection(snapshots,selectedPhase,userSelectedPhase.current);
  const current = snapshots.find((s)=>s.phase===selection.phase) || latest;
  const prior = current ? snapshots.filter((s)=>s.phaseOrder<current.phaseOrder).at(-1) : null;
  const movers = useMemo(()=>{ if(!current||!prior)return []; const old=Object.fromEntries(prior.players.map(p=>[p.id,p])); return current.players.filter(p=>old[p.id]).map(p=>({...p,change:p.probability-old[p.id].probability,previous:old[p.id]})).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,4); },[current,prior]);
  useEffect(()=>{ try{ clearOddsCenterLoadingReload(window.sessionStorage); }catch{} },[]);
  useEffect(()=>{ setSelectedPhase((phase)=>{ const next=reconcileOddsCenterSelection(snapshots,phase,userSelectedPhase.current); userSelectedPhase.current=next.userSelected; return next.phase; }); },[snapshots]);
  useEffect(()=>{
    lastRefreshAt.current=Date.now();
    const refresh=()=>{
      if(document.visibilityState!=="visible")return;
      const now=Date.now();
      if(now-lastRefreshAt.current<2_000)return;
      lastRefreshAt.current=now;
      router.refresh();
    };
    const visible=()=>{ if(document.visibilityState==="visible")refresh(); };
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",visible);
    return ()=>{ window.removeEventListener("focus",refresh); document.removeEventListener("visibilitychange",visible); };
  },[router]);
  const selectPhase=(phase)=>{ userSelectedPhase.current=true; setSelectedPhase(phase); };
  if (!current) return <><section className={styles.hero}><p>SBI Analytics</p><h1>Odds Center</h1><span>Championship and player projections through every official tournament milestone.</span></section><section className={styles.shell}><div className={styles.empty}><span>Projections Coming Soon</span><h2>Odds are not available yet</h2><p>{error || "Official tournament odds have not been published yet."}</p></div></section></>;
  if (isTournamentRecapPhase(current.phase)) {
    const recap = tournamentRecapFromSnapshot(current), tied = recap.champions.length > 1;
    return <><section className={styles.hero}><p>SBI Analytics</p><h1>Tournament Recap</h1><span>The official conclusion to this year’s Championship Projection story.</span></section><section className={styles.shell}>
      <nav className={styles.timeline}>{snapshots.map((snapshot)=><button className={snapshot.phase===current.phase?styles.active:""} onClick={()=>selectPhase(snapshot.phase)} key={snapshot.phase}><i/><span>{projectionPresentationLabel(snapshot.phase)}</span><small>{new Date(snapshot.publishedAt).toLocaleDateString()}</small></button>)}</nav>
      <div className={styles.heading}><div><span>Official Tournament Result</span><h2>Tournament Recap</h2></div><small>{new Date(current.publishedAt).toLocaleString()}</small></div>
      <div className={styles.recapChampion}><span>{tied ? "Tournament Result" : "Tournament Champions"}</span><h3>{recap.champions.map((team)=>team.name).join(" and ")}</h3><div>{recap.teams.map((team)=><p key={team.side}><small>{team.name}</small><strong>{Number(team.expectedPoints).toFixed(1)}</strong></p>)}</div></div>
      <section className={styles.recapLeaders}><div className={styles.boardTitle}><span>Tournament Points Leaders</span><h2>Final individual standings</h2></div>{recap.players.map((player,index)=><div key={player.id}><strong>{index+1}</strong><b>{player.name}</b><span>{Number(player.expectedPoints).toFixed(2)} points</span><span>{player.expectedRecord}</span></div>)}</section>
    </section></>;
  }
  return <>
    <section className={styles.hero}><p>SBI Analytics</p><h1>Odds Center</h1><span>Championship and player projections through every official tournament milestone.</span></section>
    <section className={styles.shell}>
      <nav className={styles.timeline}>{snapshots.map(s=><button className={s.phase===current.phase?styles.active:""} onClick={()=>selectPhase(s.phase)} key={s.phase}><i/><span>{projectionPresentationLabel(s.phase)}</span><small>{new Date(s.publishedAt).toLocaleDateString()}</small></button>)}</nav>
      <div className={styles.heading}><div><span>Official Snapshot</span><h2>{projectionPresentationLabel(current.phase)}</h2></div><small>{current.iterations.toLocaleString()} tournament simulations</small></div>
      <div className={styles.teamGrid}>{current.teams.map(t=><article key={t.side}><span>Championship Odds</span><h3>{t.name}</h3><strong>{t.probability.toFixed(1)}%</strong><b>{formatChampionshipOdds(t.americanOdds)}</b><p>Expected points · Out of {current.totalPointsAvailable || 72} <em>{t.expectedPoints.toFixed(2)}</em></p></article>)}</div>
      <section className={styles.board}><div className={styles.boardTitle}><span>Top Player Odds</span><h2>Projected individual champion</h2></div><div className={`${styles.row} ${styles.head}`}><span>Rank</span><span>Player</span><span>Probability</span><span>Odds</span><span>Exp. Points</span><span>Exp. Record</span><span>Avg. Finish</span></div>{current.players.map((p,i)=><div className={styles.row} key={p.id}><strong>{Number.isInteger(Number(p.rank)) ? Number(p.rank) : i+1}</strong><b>{p.name}</b><strong>{p.probability.toFixed(1)}%</strong><span>{formatChampionshipOdds(p.americanOdds)}</span><span>{p.expectedPoints.toFixed(2)}</span><span>{p.expectedRecord}</span><span>{p.averageFinish.toFixed(1)}</span></div>)}</section>
      {movers.length?<section className={styles.movers}><span>Biggest Movers</span><div>{movers.map(p=><article key={p.id} data-up={p.change>0}><i>{p.change>0?"▲":"▼"}</i><b>{p.name}</b><span>{formatChampionshipOdds(p.previous.americanOdds)} → {formatChampionshipOdds(p.americanOdds)}</span><strong>{p.change>0?"+":""}{p.change.toFixed(1)} pts</strong></article>)}</div></section>:null}
      <section className={styles.playerTimeline}><span>Player Projection Timeline</span>{current.players.slice(0,8).map(p=><div key={p.id}><b>{p.name}</b>{snapshots.map(s=>{const x=s.players.find(v=>v.id===p.id);return <span key={s.phase}><small>{projectionPresentationLabel(s.phase)}</small><strong>{s.phase==="Final Results"&&x?.probability===100?"Winner":formatChampionshipOdds(x?.americanOdds)}</strong></span>})}</div>)}</section>
    </section>
  </>;
}
