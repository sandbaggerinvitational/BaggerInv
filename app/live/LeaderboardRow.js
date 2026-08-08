import PlayerAvatar from "../PlayerAvatar";
import StatusBadge from "../StatusBadge";
import { formatPlayerPoints } from "../../lib/formatters";
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

export function LeaderboardColumnHeader({ identityLabel = "Player", columns = [], sort, onSelect, variant = "round", label = "Leaderboard columns" }) {
  return <div className={styles.columnGrid} data-variant={variant} role="group" aria-label={label}>
    <span>Rank</span><span>{identityLabel}</span>
    <span className={styles.columnMetrics}>{columns.map(({ key, label: columnLabel, sortable = true }) => sortable && onSelect ? <button type="button" onClick={() => onSelect(key)} aria-pressed={sort?.key === key} aria-label={key === "netToPar" ? "Net score relative to par" : columnLabel} key={key}>{columnLabel}{sort?.key === key ? <i aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</i> : null}</button> : <span key={key}>{columnLabel}</span>)}</span>
  </div>;
}

export function LeaderboardDetailSheet({ title, identity, context, status, metrics = [], children, action, onClose }) {
  return <div className={styles.sheetLayer} role="presentation">
    <button type="button" className={styles.backdrop} onClick={onClose} aria-label={`Close ${title} details`} />
    <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="leaderboard-detail-subject">
      <header><span>{title}</span><button type="button" onClick={onClose} aria-label={`Close ${title} details`}>×</button></header>
      <div className={styles.sheetIdentity} id="leaderboard-detail-subject">{identity}</div>
      {context || status ? <div className={styles.sheetContext}><span>{context?.primary ? <strong>{context.primary}</strong> : null}{context?.secondary ? <small>{context.secondary}</small> : null}</span>{status ? <StatusBadge status={status} /> : null}</div> : null}
      <section className={styles.sheetMetrics} aria-label={`${title} summary`}>{metrics.map((metric) => <p data-emphasis={metric.emphasis || undefined} key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></p>)}</section>
      {children}
      {action}
    </section>
  </div>;
}

export function MatchBreakdown({ breakdown }) {
  if (!breakdown) return null;
  const singles = breakdown.segments.length === 1;
  return <section className={styles.matchBreakdown}>
    <header><span>{singles ? "Match Result" : "Match Breakdown"}</span><StatusBadge status={breakdown.label} /></header>
    {breakdown.state === "pending" ? <p>Pending</p> : <div>{breakdown.segments.map((segment) => <span key={segment.label}><small>{segment.label}</small><strong>{segment.value}</strong></span>)}{breakdown.points !== null ? <span data-points="true"><small>{breakdown.pointsLabel || "Points"}</small><strong>{formatPlayerPoints(breakdown.points)}</strong></span> : null}</div>}
  </section>;
}

export function RoundLeaderboardSheet({ title, identity, roundLabel, formatLabel, courseName, rank, holes, gross, net, netToPar, points, pointsLabel = "Round Points", playerPoints = [], breakdown, officialFinal, matchId, returnTo = "/live?view=leaderboards", onClose }) {
  const final = officialFinal ?? Number(holes) >= 18;
  const scorecardHref = matchId ? `/game-center/${encodeURIComponent(matchId)}?from=${encodeURIComponent(returnTo)}` : "";
  return <LeaderboardDetailSheet title={title} identity={identity} context={{ primary: [roundLabel, formatLabel].filter(Boolean).join(" • "), secondary: courseName }} status={final ? "Final" : "Live"} metrics={[
    { label: final ? "Final Rank" : "Current Rank", value: rank },
    { label: "THRU", value: final ? "F" : holes },
    { label: "Gross Score", value: gross },
    { label: "Net Score", value: net },
    { label: "Net +/-", value: netToPar, emphasis: "score" },
    { label: pointsLabel, value: points === null || points === undefined ? "—" : formatPlayerPoints(points), emphasis: "points" },
  ]} action={<><MatchBreakdown breakdown={breakdown} />{playerPoints.length ? <section className={styles.playerPoints}><header>Player Points</header>{playerPoints.map((player) => <p key={player.id}><span>{player.name}</span><strong>{formatPlayerPoints(player.points)} pts</strong></p>)}</section> : null}{scorecardHref ? <a className={styles.scorecardAction} href={scorecardHref}>View Scorecard</a> : null}</>} onClose={onClose} />;
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
