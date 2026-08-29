import Link from "next/link";
import styles from "./public-history.module.css";

function RoundLink({ direction, href, label }) {
  if (!href || !label) return <span aria-hidden="true" />;

  const previous = direction === "previous";
  return (
    <Link className={previous ? styles.detailPrevious : styles.detailNext} href={href}>
      <small>{previous ? "Previous Round" : "Next Round"}</small>
      <strong>
        {previous ? <span aria-hidden="true">←</span> : null}
        {label}
        {!previous ? <span aria-hidden="true">→</span> : null}
      </strong>
    </Link>
  );
}

export default function PublicHistoricalDetailNavigation({
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
      aria-label="Historical round navigation"
      className={`${styles.detailNavigation} ${position === "top" ? styles.detailNavigationTop : ""}`}
    >
      <RoundLink direction="previous" href={previousHref} label={previousLabel} />
      <Link className={styles.detailParent} href={backHref}>{backLabel}</Link>
      <RoundLink direction="next" href={nextHref} label={nextLabel} />
    </nav>
  );
}
