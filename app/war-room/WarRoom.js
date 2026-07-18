"use client";
import { useMemo,useState } from "react";
import styles from "./war-room.module.css";
import { allocateStrokes, courseHandicap, formatCode, pick, playingHandicaps, predict, settingsMap } from "../../lib/prediction-engine";

const n=(v,f=0)=>{const x=Number.parseFloat(String(v??"").replace(/,/g,""));return Number.isFinite(x)?x:f};
const clean=(v)=>String(v??"").trim();
function playerName(row){return pick(row,"Display Name","Player Name","Name") || `${pick(row,"First","First Name")} ${pick(row,"Last","Last Name")}`.trim()}

export default function WarRoom({initialData,loadError}){
  const sheets=initialData?.sheets||{};
  const players=useMemo(()=>(sheets.players||[]).filter(r=>!pick(r,"Active")||["true","yes","1","active"].includes(clean(pick(r,"Active")).toLowerCase())).map(r=>({id:clean(pick(r,"Player ID","ID")),name:playerName(r)})).filter(p=>p.id&&p.name).sort((a,b)=>a.name.localeCompare(b.name)),[sheets.players]);
  const live=useMemo(()=>(sheets.liveTournaments||[]).find(r=>pick(r,"Year"))||{},[sheets.liveTournaments]);
  const year=n(pick(live,"Year"),new Date().getFullYear());
  const rounds=useMemo(()=>[...new Set((sheets.liveRoundHandicaps||[]).filter(r=>!pick(r,"Year")||n(pick(r,"Year"))===year).map(r=>clean(pick(r,"Round"))).filter(Boolean))].sort((a,b)=>n(a)-n(b)),[sheets.liveRoundHandicaps,year]);
  const [format,setFormat]=useState("BB"); const [round,setRound]=useState(rounds[0]||"1");
  const required=formatCode(format)==="SI"?2:4;
  const [selected,setSelected]=useState([]);
  const chosen=Array.from({length:required},(_,i)=>selected[i]||"");
  const roundRows=(sheets.liveRoundHandicaps||[]).filter(r=>(!pick(r,"Year")||n(pick(r,"Year"))===year)&&(!round||clean(pick(r,"Round"))===clean(round)));
  const firstRound=roundRows[0]||{}; const courseId=clean(pick(firstRound,"Course ID"));
  const course=(sheets.courses||[]).find(r=>clean(pick(r,"Course ID"))===courseId)||{};
  const defaultTee=clean(pick(firstRound,"Tee","Tee Name")); const [teeOverride,setTeeOverride]=useState("");
  const scorecards=(sheets.scorecards||[]).filter(r=>!courseId||clean(pick(r,"Course ID"))===courseId);
  const tees=[...new Set(scorecards.map(r=>clean(pick(r,"Tee","Tee Name"))).filter(Boolean))];
  const tee=teeOverride||defaultTee||tees[0]||"";
  const scorecard=scorecards.find(r=>clean(pick(r,"Tee","Tee Name"))===tee)||scorecards[0]||{};
  const holes=(sheets.holes||[]).filter(r=>(!courseId||clean(pick(r,"Course ID"))===courseId)&&(!tee||clean(pick(r,"Tee","Tee Name"))===tee)).sort((a,b)=>n(pick(a,"Hole"))-n(pick(b,"Hole")));
  const historical=initialData?.historical||{}; const settings=settingsMap(sheets.settings||[]);
  const details=chosen.map(id=>{
    const p=players.find(x=>x.id===id)||{id,name:"Select player"};
    const liveRow=roundRows.find(r=>clean(pick(r,"Player ID"))===id);
    const handicapRow=(sheets.handicaps||[]).find(r=>clean(pick(r,"Player ID"))===id&&n(pick(r,"Year"))===year);
    const tournament=n(pick(liveRow,"Tournament Handicap","Hybrid Handicap"),n(pick(handicapRow,"Tournament Handicap"),n(historical[id]?.handicapHistory?.find(h=>h.year===year)?.handicap,0)));
    const stored=pick(liveRow,"Course Handicap");
    const hcp=stored!==""&&!teeOverride?n(stored):courseHandicap(tournament,pick(scorecard,"Course Rating","Rating"),pick(scorecard,"Slope Rating","Slope"),pick(scorecard,"Par"));
    return {...p,tournamentHandicap:tournament,courseHandicap:hcp};
  });
  const ready=details.length===required&&details.every(p=>p.id);
  const handicaps=details.map(p=>p.courseHandicap); const play=ready?playingHandicaps(format,handicaps):null;
  const prediction=ready?predict({format,players:details,historical,partnership:initialData.partnerships||{},headToHead:initialData.headToHead||{},handicap:play,settings}):null;
  const teamStrokeMaps=play?{a:allocateStrokes(play.strokesA,holes),b:allocateStrokes(play.strokesB,holes)}:null;
  function update(index,value){const next=[...chosen];next[index]=value;setSelected(next)}
  if(!initialData) return <section className={styles.shell}><div className={styles.error}><h1>War Room</h1><p>{loadError||"Prediction data is unavailable."}</p></div></section>;
  return <>
    <section className={styles.hero}><p>Captain's Analytics</p><h1>War Room</h1><span>Build a matchup. See the strokes. Make the call.</span></section>
    <section className={styles.shell}>
      {loadError?<div className={styles.notice}>{loadError}</div>:null}
      <div className={styles.setupCard}>
        <div className={styles.sectionTitle}><span>01</span><div><p>Match Setup</p><h2>Choose the battlefield</h2></div></div>
        <div className={styles.controls}>
          <label>Format<select value={format} onChange={e=>{setFormat(e.target.value);setSelected([])}}><option value="BB">Best Ball</option><option value="SC">2-Man Scramble</option><option value="SI">Singles</option></select></label>
          <label>Round<select value={round} onChange={e=>{setRound(e.target.value);setTeeOverride("")}}>{rounds.map(r=><option key={r} value={r}>Round {r}</option>)}</select></label>
          <label>Course<input value={pick(course,"Course Name","Course")||courseId||"Not assigned"} readOnly/></label>
          <label>Tee<select value={tee} onChange={e=>setTeeOverride(e.target.value)}>{tees.length?tees.map(t=><option key={t}>{t}</option>):<option>{tee||"Assigned tee"}</option>}</select></label>
        </div>
        <div className={styles.matchupGrid}>
          {[0,1].map(side=><div className={styles.teamPanel} key={side}><div><span>TEAM {side?"B":"A"}</span><strong>{formatCode(format)==="SI"?"Singles Player":"Pairing"}</strong></div>{Array.from({length:formatCode(format)==="SI"?1:2},(_,slot)=>{const index=side*(formatCode(format)==="SI"?1:2)+slot;return <label key={index}>Player {slot+1}<select value={chosen[index]} onChange={e=>update(index,e.target.value)}><option value="">Select player</option>{players.filter(p=>!chosen.includes(p.id)||chosen[index]===p.id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>})}</div>)}
        </div>
      </div>
      {!ready?<div className={styles.emptyState}><span>Complete the matchup</span><h2>Select every player to run the prediction.</h2></div>:<>
        <div className={styles.predictionCard}>
          <div className={styles.model}>{prediction.model} · {prediction.confidence} confidence</div>
          <div className={styles.probabilities}><div><span>TEAM A</span><strong>{prediction.teamA}%</strong></div><div className={styles.tie}><span>HALVE</span><strong>{prediction.tie}%</strong></div><div><span>TEAM B</span><strong>{prediction.teamB}%</strong></div></div>
          <div className={styles.bar}><i style={{width:`${prediction.teamA}%`}}/><b style={{width:`${prediction.tie}%`}}/><em style={{width:`${prediction.teamB}%`}}/></div>
          <div className={styles.factors}>{prediction.factors.map((f,i)=><div key={i} data-side={f.side}>{f.label}</div>)}</div>
        </div>
        <div className={styles.breakdownCard}><div className={styles.sectionTitle}><span>02</span><div><p>Handicap Breakdown</p><h2>Where the strokes fall</h2></div></div>
          <div className={styles.playerTable}><div className={styles.tableHead}><span>Player</span><span>TH</span><span>CH</span><span>Net</span></div>{details.map((p,i)=><div key={p.id}><strong>{p.name}</strong><span>{p.tournamentHandicap.toFixed(1)}</span><span>{p.courseHandicap}</span><b>{formatCode(format)==="BB"?play.playerStrokes[i]:formatCode(format)==="SI"?play.playerStrokes[i]:i===0?play.strokesA:i===2?play.strokesB:"—"}</b></div>)}</div>
          <div className={styles.strokeSummary}><div><span>Team A receives</span><strong>{play.strokesA} stroke{play.strokesA===1?"":"s"}</strong></div><div><span>Team B receives</span><strong>{play.strokesB} stroke{play.strokesB===1?"":"s"}</strong></div></div>
          {holes.length===18?<div className={styles.holeGrid}>{holes.map((h,i)=><div key={i}><span>{pick(h,"Hole")||i+1}</span><small>SI {pick(h,"Stroke Index","Handicap","HCP")}</small><b>{teamStrokeMaps.a[i]?`A +${teamStrokeMaps.a[i]}`:teamStrokeMaps.b[i]?`B +${teamStrokeMaps.b[i]}`:"—"}</b></div>)}</div>:<p className={styles.noHoles}>Add all 18 rows to Course Holes to display the hole-by-hole stroke map.</p>}
        </div>
      </>}
    </section>
  </>;
}
