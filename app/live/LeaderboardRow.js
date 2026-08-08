import PlayerAvatar from "../PlayerAvatar";
import styles from "./scramble-leaderboard.module.css";

export function LeaderboardRank({ value }) {
  return <span className={styles.rank}><small>Rank</small><strong>{value || "—"}</strong></span>;
}

export function PlayerLeaderboardIdentity({ player, current = false, team = "" }) {
  return <span className={styles.identity} data-individual="true">
    <span className={styles.singleAvatar} aria-hidden="true"><PlayerAvatar filename={player?.photo} name={player?.name || player?.player} fallbackClassName={styles.avatarFallback} /></span>
    <span className={styles.names}><strong>{player?.name || player?.player}</strong>{team ? <small>{team}</small> : null}{current ? <em aria-label="Current player">YOU</em> : null}</span>
  </span>;
}

export function LeaderboardMetrics({ metrics = [], variant = "round" }) {
  return <span className={styles.metrics} data-variant={variant}>{metrics.map((metric) => <span className={metric.secondary ? styles.gross : undefined} data-emphasis={metric.emphasis || undefined} key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></span>)}</span>;
}

export function LeaderboardEntry({ rank, identity, metrics, state = "live", current = false, onClick, label, expanded, children }) {
  const Component = onClick ? "button" : "div";
  return <Component type={onClick ? "button" : undefined} className={styles.entry} data-state={state} data-current={current || undefined} onClick={onClick} aria-label={label} aria-expanded={expanded}>
    <LeaderboardRank value={rank} />
    {identity}
    {metrics}
    {children}
  </Component>;
}
