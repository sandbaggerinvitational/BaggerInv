"use client";

import { useMemo, useState } from "react";
import StatusBadge from "../StatusBadge";
import { roundScoreRows } from "../../lib/mobile-leaderboards";
import ScrambleTeamIdentity, { scrambleTeamName } from "./ScrambleTeamIdentity";
import { LeaderboardEntry, LeaderboardMetrics, RoundLeaderboardSheet } from "./LeaderboardRow";
import styles from "./scramble-leaderboard.module.css";

const toPar = (value) => Number(value) === 0 ? "E" : Number(value) > 0 ? `+${value}` : String(value);
const columns = [["holes", "Thru"], ["gross", "Gross"], ["net", "Net"], ["netToPar", "Net +/-"]];

function matchForPairing(row, matches) {
  return matches.find((match) => row.id.startsWith(`${match.id}:team-`)) || matches.find((match) => {
    const ids = [...(match.team1Players || []), ...(match.team2Players || [])].map((player) => String(player.id));
    return row.playerIds.every((id) => ids.includes(String(id)));
  });
}

function PairingSheet({ row, players, matches, returnTo, onClose }) {
  const name = scrambleTeamName(row.playerIds, players);
  const match = matchForPairing(row, matches);
  return <RoundLeaderboardSheet title="Scramble Pairing" identity={<><ScrambleTeamIdentity playerIds={row.playerIds} players={players} large /><div><small>Team Members</small><h3>{name}</h3></div></>} rank={row.displayRank} holes={row.holes} gross={row.gross} net={row.net} netToPar={toPar(row.netToPar)} matchId={match?.id} returnTo={returnTo} onClose={onClose} />;
}

export default function ScrambleLeaderboard({ rows = [], round, players = [], matches = [], eyebrow = "Round Leaderboard", returnTo = "/live?view=leaderboards&tab=players&round=2" }) {
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
        return <LeaderboardEntry rank={row.displayRank} identity={<ScrambleTeamIdentity playerIds={row.playerIds} players={players} />} metrics={<LeaderboardMetrics metrics={[{ label: "THRU", value: final ? "F" : row.holes, emphasis: final ? "" : "live" }, { label: "Gross", value: row.gross, secondary: true }, { label: "Net", value: row.net, emphasis: final ? "final" : "live" }, { label: "Net +/-", value: toPar(row.netToPar), emphasis: "live" }]} />} state={final ? "final" : "live"} onClick={() => setSelectedId(row.id)} label={`Open ${name}, rank ${row.displayRank}, ${final ? "final" : `through ${row.holes}`}, net ${row.net}, ${toPar(row.netToPar)}`} key={`${row.round}-${row.id}`} />;
      })}</div>
    </>}
    {selected ? <PairingSheet row={selected} players={players} matches={matches} returnTo={returnTo} onClose={() => setSelectedId("")} /> : null}
  </section>;
}
