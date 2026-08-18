import styles from "./scoring-stats.module.css";
import Link from "next/link";

export function formatScoringNumber(value, { percentage = false, signed = false, decimals = 1 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  const rendered = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(decimals);
  if (percentage) return `${rendered}%`;
  if (signed && numeric > 0) return `+${rendered}`;
  return rendered;
}

export default function ScoringStatGrid({ items = [], dense = false, career = false, layout = "default" }) {
  const layoutClass = layout === "threeAcross"
    ? styles.threeAcross
    : layout === "fiveBalanced"
      ? styles.fiveBalanced
      : "";

  return (
    <div className={`${styles.grid} ${dense ? styles.dense : ""} ${career ? styles.career : ""} ${layoutClass}`}>
      {items.map((item) => (
        <article className={styles.card} key={item.label} aria-label={item.accessibleLabel || undefined}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.holders?.length ? (
            <div className={styles.holders}>
              {item.holders.map((holder) => (
                <div key={holder.id}>
                  <b>{holder.name}</b>
                  {holder.subtitle ? <em>{holder.subtitle}</em> : null}
                  {holder.context ? <small>{holder.context}</small> : null}
                </div>
              ))}
            </div>
          ) : item.detail ? <b>{item.detail}</b> : null}
          {item.sample ? <small>{item.sample}</small> : null}
          {item.leaderboardHref ? (
            <Link className={styles.leaderboardLink} href={item.leaderboardHref}>
              View Full Leaderboard →
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}
