import PlayerAvatar from "../PlayerAvatar";
import styles from "./scramble-leaderboard.module.css";

const clean = (value) => String(value ?? "").trim();

export function resolveScrambleTeamPlayers(playerIds = [], players = []) {
  const directory = players instanceof Map
    ? players
    : new Map(players.map((player) => [clean(player.id), player]));
  return playerIds.map((id) => directory.get(clean(id)) || { id: clean(id), name: "Golfer" });
}

export function scrambleTeamName(playerIds = [], players = []) {
  return resolveScrambleTeamPlayers(playerIds, players).map((player) => player.name).join(" & ");
}

export default function ScrambleTeamIdentity({ playerIds = [], players = [], large = false }) {
  const members = resolveScrambleTeamPlayers(playerIds, players);
  return <span className={styles.identity} data-large={large || undefined}>
    <span className={styles.avatars} aria-hidden="true">
      {members.map((player) => <span key={player.id}><PlayerAvatar player={player} fallbackClassName={styles.avatarFallback} /></span>)}
    </span>
    <span className={styles.names}>{members.map((player) => <strong key={player.id}>{player.name}</strong>)}</span>
  </span>;
}
