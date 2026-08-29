"use client";

import { useMemo, useState } from "react";
import StatusBadge from "../StatusBadge";
import { formatPlayerPoints } from "../../lib/formatters";
import { participantRoundBreakdown } from "../../lib/leaderboard-round-breakdown";
import { roundCompetitionRows } from "../../lib/mobile-leaderboards";
import ScrambleTeamIdentity, { scrambleTeamName } from "./ScrambleTeamIdentity";
import { LeaderboardColumnHeader, LeaderboardEntry, LeaderboardMetrics, RoundLeaderboardSheet } from "./LeaderboardRow";
import styles from "./scramble-leaderboard.module.css";

const toPar = (value) => Number(value) === 0 ? "E" : Number(value) > 0 ? `+${value}` : String(value);
const columns = [["holes", "Thru"], ["gross", "Gross"], ["net", "Net"], ["netToPar", "Net +/-"], ["points", "Team Points"]];

function matchForPairing(row, matches) {
  return matches.find((match) => row.id.startsWith(`${match.id}:team-`)) || matches.find((match) => {
    const ids = [...(match.team1Players || []), ...(match.team2Players || [])].map((player) => String(player.id));
    return row.playerIds.every((id) => ids.includes(String(id)));
  });
}

function PairingSheet({ row, players, matches, round, roundLabel, courseName, tournament, returnTo, onClose }) {
  const match = matchForPairing(row, matches);
  const breakdown = { ...participantRoundBreakdown({ number: round, format: "SC", matches }, row.playerIds, row.points, tournament), pointsLabel: "Team Points" };
  const directory = new Map(players.map((player) => [String(player.id), player]));
  const playerPoints = (row.playerPoints || []).map((credit) => ({ id: credit.playerId, name: directory.get(String(credit.playerId))?.name || "Golfer", points: credit.points }));
  return <RoundLeaderboardSheet title="Scramble Pairing" identity={<ScrambleTeamIdentity playerIds={row.playerIds} players={players} large />} roundLabel={roundLabel} formatLabel="Scramble" courseName={courseName} rank={row.displayRank} holes={row.holes} gross={row.gross} net={row.net} netToPar={toPar(row.netToPar)} points={row.points} pointsLabel="Team Points" playerPoints={playerPoints} breakdown={breakdown} officialFinal={row.officialFinal} matchId={match?.id} returnTo={returnTo} onClose={onClose} />;
}

export default function ScrambleLeaderboard({ rows = [], round, players = [], matches = [], officialRows = [], tournament = {}, currentPlayerId = "", eyebrow = "Round Leaderboard", roundLabel = `Round ${round}`, courseName = "", returnTo = "/app/leaderboards?tab=players&round=2" }) {
  const [selectedId, setSelectedId] = useState("");
  const ranked = useMemo(() => roundCompetitionRows(rows, round, "SC", officialRows, matches), [rows, round, officialRows, matches]);
  const selected = ranked.find((row) => row.id === selectedId);
  const complete = ranked.length > 0 && ranked.every((row) => row.officialFinal);
  return <section className={styles.board} aria-label="Scramble pairing leaderboard">
    <header><span><small>{eyebrow}</small><h2>Scramble Pairing Leaderboard</h2></span>{ranked.length ? <StatusBadge status={complete ? "Final" : "Live"} /> : null}</header>
    {!ranked.length ? <div className={styles.empty}><strong>{matches.length ? "Scores pending." : "Round not started."}</strong><span>{matches.length ? "The leaderboard will update as official scores are recorded." : "Pairings and scores will appear when the round opens."}</span></div> : <>
      <LeaderboardColumnHeader identityLabel="Pairing" columns={columns.map(([key, label]) => ({ key, label, sortable: false }))} label="Scramble leaderboard columns" />
      <div className={styles.entries}>{ranked.map((row) => {
        const final = row.officialFinal;
        const thru = Number(row.holes) >= 18 ? "F" : row.holes;
        const name = scrambleTeamName(row.playerIds, players);
        const isCurrent = Boolean(currentPlayerId && row.playerIds.some((id) => String(id) === String(currentPlayerId)));
        return <LeaderboardEntry rank={row.displayRank} current={isCurrent} identity={<ScrambleTeamIdentity playerIds={row.playerIds} players={players} />} metrics={<LeaderboardMetrics metrics={[{ label: "THRU", value: thru, emphasis: final ? "" : "live" }, { label: "Gross", value: row.gross, secondary: true }, { label: "Net", value: row.net, emphasis: final ? "final" : "live" }, { label: "Net +/-", value: toPar(row.netToPar), emphasis: "live" }, { label: "Team Points", value: row.points === null ? "—" : formatPlayerPoints(row.points), emphasis: "points" }]} />} state={final ? "final" : "live"} onClick={() => setSelectedId(row.id)} label={`Open ${name}, rank ${row.displayRank}, ${final ? "final" : `through ${row.holes}`}, ${row.points === null ? "team points pending" : `${formatPlayerPoints(row.points)} team points`}, net ${row.net}, ${toPar(row.netToPar)}${isCurrent ? ", your pairing" : ""}`} key={`${row.round}-${row.id}`} />;
      })}</div>
    </>}
    {selected ? <PairingSheet row={selected} players={players} matches={matches} round={round} roundLabel={roundLabel} courseName={courseName} tournament={tournament} returnTo={returnTo} onClose={() => setSelectedId("")} /> : null}
  </section>;
}
