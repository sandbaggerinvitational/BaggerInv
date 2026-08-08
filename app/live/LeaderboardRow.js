import PlayerAvatar from "../PlayerAvatar";
import styles from "./scramble-leaderboard.module.css";

export function LeaderboardRank({ value }) {
  return <span className={styles.rank}><small>Rank</small><strong>{value || "—"}</strong></span>;
}

export function PlayerLeaderboardIdentity({ player, current = false, team = "", large = false }) {
  return <span className={styles.identity} data-individual="true" data-large={large || undefined}>
    <span className={styles.singleAvatar} aria-hidden="true"><PlayerAvatar filename={player?.photo} name={player?.name || player?.player} fallbackClassName={styles.avatarFallback} /></span>
    <span className={styles.names}><strong>{player?.name || player?.player}</strong>{team ? <small>{team}</small> : null}{current ? <em aria-label="Current player">YOU</em> : null}</span>
  </span>;
}

export function RoundLeaderboardSheet({ title, identity, rank, holes, gross, net, netToPar, matchId, returnTo = "/live?view=leaderboards", onClose }) {
  const final = Number(holes) >= 18;
  const scorecardHref = matchId ? `/game-center/${encodeURIComponent(matchId)}?from=${encodeURIComponent(returnTo)}` : "";
  return <div className={styles.sheetLayer} role="presentation">
    <button type="button" className={styles.backdrop} onClick={onClose} aria-label={`Close ${title} details`} />
    <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="round-leaderboard-subject">
      <header><span>{title}</span><button type="button" onClick={onClose} aria-label={`Close ${title} details`}>×</button></header>
      <div className={styles.sheetIdentity} id="round-leaderboard-subject">{identity}</div>
      <section className={styles.sheetMetrics} aria-label={`${title} summary`}>
        <p><small>{final ? "Final Rank" : "Current Rank"}</small><strong>{rank}</strong></p>
        <p><small>THRU</small><strong>{final ? "F" : holes}</strong></p>
        <p><small>Gross Score</small><strong>{gross}</strong></p>
        <p><small>Net Score</small><strong>{net}</strong></p>
        <p><small>Net +/-</small><strong>{netToPar}</strong></p>
      </section>
      {scorecardHref ? <a className={styles.scorecardAction} href={scorecardHref}>View Scorecard</a> : null}
    </section>
  </div>;
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
