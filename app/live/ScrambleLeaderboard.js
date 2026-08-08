"use client";

import { useMemo, useState } from "react";
import StatusBadge from "../StatusBadge";
import { roundScoreRows } from "../../lib/mobile-leaderboards";
import ScrambleTeamIdentity, { scrambleTeamName } from "./ScrambleTeamIdentity";
import styles from "./scramble-leaderboard.module.css";

const toPar = (value) => Number(value) === 0 ? "E" : Number(value) > 0 ? `+${value}` : String(value);
const columns = [["holes", "Thru"], ["gross", "Gross"], ["net", "Net"], ["netToPar", "Net +/-"]];

function PairingSheet({ row, players, onClose }) {
  const name = scrambleTeamName(row.playerIds, players);
  const final = Number(row.holes) >= 18;
  const scorecard = [...(row.scorecard || [])].sort((a, b) => Number(a.hole) - Number(b.hole));
  return <div className={styles.sheetLayer} role="presentation">
    <button type="button" className={styles.backdrop} onClick={onClose} aria-label="Close Scramble pairing details" />
    <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="scramble-pairing-name">
      <header><span>Scramble Pairing</span><button type="button" onClick={onClose} aria-label="Close Scramble pairing details">×</button></header>
      <div className={styles.sheetIdentity}><ScrambleTeamIdentity playerIds={row.playerIds} players={players} large /><div><small>Team Members</small><h3 id="scramble-pairing-name">{name}</h3></div></div>
      <section className={styles.sheetMetrics} aria-label="Scramble pairing summary">
        <p><small>Current Rank</small><strong>{row.displayRank}</strong></p>
        <p><small>THRU</small><strong>{final ? "F" : row.holes}</strong></p>
        <p><small>Gross Score</small><strong>{row.gross}</strong></p>
        <p><small>Net Score</small><strong>{row.net}</strong></p>
        <p><small>Net +/-</small><strong>{toPar(row.netToPar)}</strong></p>
      </section>
      {scorecard.length ? <section className={styles.holes}><header><small>Hole-by-Hole Scoring</small><strong>{scorecard.length} of 18</strong></header>{scorecard.map((hole) => <article key={`${hole.match}-${hole.hole}`}><strong>Hole {hole.hole}</strong><span><small>Gross</small><b>{hole.gross}</b></span><span><small>Net</small><b>{hole.net}</b></span></article>)}</section> : null}
    </section>
  </div>;
}

export default function ScrambleLeaderboard({ rows = [], round, players = [], eyebrow = "Round Leaderboard" }) {
  const [sort, setSort] = useState({ key: "netToPar", direction: "asc" });
  const [selectedId, setSelectedId] = useState("");
  const ranked = useMemo(() => roundScoreRows(rows, round, "SC", sort), [rows, round, sort]);
  const selected = ranked.find((row) => row.id === selectedId);
  const select = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const complete = ranked.length > 0 && ranked.every((row) => Number(row.holes) >= 18);
  return <section className={styles.board} aria-label="Scramble pairing leaderboard">
    <header><span><small>{eyebrow}</small><h2>Scramble Pairing Leaderboard</h2></span>{ranked.length ? <StatusBadge status={complete ? "Final" : "Live"} /> : null}</header>
    {!ranked.length ? <div className={styles.empty}><strong>Standings will appear after the first recorded score.</strong><span>Partial standings publish as valid holes are confirmed.</span></div> : <>
      <div className={styles.sorts} role="group" aria-label="Sort Scramble leaderboard">{columns.map(([key, label]) => <button type="button" onClick={() => select(key)} aria-pressed={sort.key === key} aria-label={key === "netToPar" ? "Net score relative to par" : label} key={key}>{label}{sort.key === key ? <i aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</i> : null}</button>)}</div>
      <div className={styles.entries}>{ranked.map((row) => {
        const final = Number(row.holes) >= 18;
        const name = scrambleTeamName(row.playerIds, players);
        return <button type="button" className={styles.entry} data-state={final ? "final" : "live"} onClick={() => setSelectedId(row.id)} aria-label={`Open ${name}, rank ${row.displayRank}, ${final ? "final" : `through ${row.holes}`}, net ${row.net}, ${toPar(row.netToPar)}`} key={`${row.round}-${row.id}`}>
          <span className={styles.rank}><small>Rank</small><strong>{row.displayRank}</strong></span>
          <ScrambleTeamIdentity playerIds={row.playerIds} players={players} />
          <span className={styles.metrics}><span><small>THRU</small><strong>{final ? "F" : row.holes}</strong></span><span className={styles.gross}><small>Gross</small><strong>{row.gross}</strong></span><span><small>Net</small><strong>{row.net}</strong></span><span><small>Net +/-</small><strong>{toPar(row.netToPar)}</strong></span></span>
        </button>;
      })}</div>
    </>}
    {selected ? <PairingSheet row={selected} players={players} onClose={() => setSelectedId("")} /> : null}
  </section>;
}
