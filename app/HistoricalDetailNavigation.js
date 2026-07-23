import Link from "next/link";
import styles from "./historical.module.css";

function RoundLink({ direction, href, label }) {
  if (!href || !label) return <span aria-hidden="true" />;

  const previous = direction === "previous";
  return (
    <Link
      className={
        previous
          ? styles.historicalDetailPrevious
          : styles.historicalDetailNext
      }
      href={href}
    >
      <small>{previous ? "Previous Round" : "Next Round"}</small>
      <strong>
        {previous ? <span aria-hidden="true">←</span> : null}
        {label}
        {!previous ? <span aria-hidden="true">→</span> : null}
      </strong>
    </Link>
  );
}

export default function HistoricalDetailNavigation({
  backHref,
  backLabel,
  previousHref,
  previousLabel,
  nextHref,
  nextLabel,
  position = "bottom",
}) {
  return (
    <nav
      className={`${styles.historicalDetailNavigation} ${
        position === "top" ? styles.historicalDetailNavigationTop : ""
      }`}
      aria-label="Historical round navigation"
    >
      <RoundLink
        direction="previous"
        href={previousHref}
        label={previousLabel}
      />

      <Link
        className={styles.historicalDetailParent}
        href={backHref}
      >
        {backLabel}
      </Link>

      <RoundLink
        direction="next"
        href={nextHref}
        label={nextLabel}
      />
    </nav>
  );
}
