import styles from "./scoring-stats.module.css";

export function formatScoringNumber(value, { percentage = false, signed = false, decimals = 1 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  const rendered = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(decimals);
  if (percentage) return `${rendered}%`;
  if (signed && numeric > 0) return `+${rendered}`;
  return rendered;
}

export default function ScoringStatGrid({ items = [] }) {
  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <article className={styles.card} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail ? <b>{item.detail}</b> : null}
          <small>{item.sample || "Based on available recorded scorecards"}</small>
        </article>
      ))}
    </div>
  );
}
