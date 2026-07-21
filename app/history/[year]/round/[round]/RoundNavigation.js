import Link from "next/link";
import styles from "../../../../historical.module.css";

export default function RoundNavigation({
  year,
  previousRound,
  nextRound,
  position = "bottom",
}) {
  return (
    <nav
      className={`${styles.roundArchiveNavigation} ${
        position === "top" ? styles.roundArchiveNavigationTop : ""
      }`}
      aria-label={`${year} round navigation`}
    >
      <div className={styles.roundArchivePrevious}>
        {previousRound ? (
          <Link href={`/history/${year}/round/${previousRound.number}`}>
            ← {previousRound.label}
          </Link>
        ) : null}
      </div>

      <Link
        className={styles.roundArchiveTournamentLink}
        href={`/history/${year}`}
      >
        Back to {year}
      </Link>

      <div className={styles.roundArchiveNext}>
        {nextRound ? (
          <Link href={`/history/${year}/round/${nextRound.number}`}>
            {nextRound.label} →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
