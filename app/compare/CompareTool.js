"use client";
import { useMemo, useState } from "react";
import styles from "./compare.module.css";

const formatRecord = (r) => `${r.wins}-${r.losses}-${r.halves}`;
const formatPct = (v) => `${v.toFixed(1)}%`;

export default function CompareTool({ players, headToHead }) {
  const [oneId, setOneId] = useState(players[0]?.id ?? "");
  const [twoId, setTwoId] = useState(players[1]?.id ?? "");
  const one = players.find((p) => p.id === oneId);
  const two = players.find((p) => p.id === twoId);
  const key = [oneId, twoId].sort().join("|");
  const raw = headToHead[key];
  const h2h = useMemo(() => {
    if (!raw || oneId < twoId) return raw;
    const flip = (r) => ({ ...r, wins: r.losses, losses: r.wins });
    return { ...raw, overall: flip(raw.overall), byFormat: Object.fromEntries(Object.entries(raw.byFormat).map(([k,v]) => [k, flip(v)])) };
  }, [raw, oneId, twoId]);

  return <>
    <section className={styles.hero}><p>HEAD TO HEAD</p><h1>Compare Players</h1><span>Select any two Sandbaggers and compare careers and direct meetings.</span></section>
    <section className={styles.content}>
      <div className={styles.selectors}>
        <label>Player One<select value={oneId} onChange={(e) => setOneId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <b>VS</b>
        <label>Player Two<select value={twoId} onChange={(e) => setTwoId(e.target.value)}>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </div>
      {one && two && one.id !== two.id ? <>
        <div className={styles.names}><h2>{one.name}</h2><span>Career Comparison</span><h2>{two.name}</h2></div>
        <div className={styles.comparisonGrid}>
          {[
            ["Sandbagger Rating", one.rating, two.rating],
            ["Career Record", formatRecord(one.record), formatRecord(two.record)],
            ["Point Win %", formatPct(one.percentage), formatPct(two.percentage)],
            ["Career Points", one.points, two.points],
            ["Bagger Championships", one.championships, two.championships],
            ["Tracked Appearances", one.appearances, two.appearances],
          ].map(([label,a,b]) => <div className={styles.statRow} key={label}><strong>{a}</strong><span>{label}</span><strong>{b}</strong></div>)}
        </div>
        <div className={styles.h2hCard}><span>DIRECT HEAD TO HEAD</span><h2>{h2h?.overall.matches ? formatRecord(h2h.overall) : "No direct meetings"}</h2><p>Record shown from {one.name}'s perspective.</p>
          {h2h?.overall.matches ? <div className={styles.formatRows}>{[["2v2 Best Ball","BB"],["Scramble","SC"],["Singles","SI"]].map(([label,key]) => <div key={key}><span>{label}</span><strong>{formatRecord(h2h.byFormat[key])}</strong></div>)}</div> : null}
        </div>
      </> : <div className={styles.empty}>Choose two different players.</div>}
    </section>
  </>;
}
