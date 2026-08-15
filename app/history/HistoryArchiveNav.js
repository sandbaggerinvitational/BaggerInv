import Link from "next/link";
import styles from "./history-archive-nav.module.css";

const number = (value) => Number(String(value ?? "").replace(/\D/g, ""));

export default function HistoryArchiveNav({
  year,
  rounds = [],
  teams = [],
  activeRound = null,
  activeSide = "",
}) {
  const roundItems = rounds
    .map((round) => ({
      number: number(round.number ?? round.round ?? round.Round),
      label: round.label || round.Round || `Round ${number(round.number ?? round.round ?? round.Round)}`,
    }))
    .filter((round) => round.number > 0);
  const normalizedSide = String(activeSide || "").toLowerCase();

  return (
    <nav className={styles.shell} aria-label={`${year} tournament history sections`}>
      <div className={styles.rail}>
        <Link href="/history">Archive</Link>
        <Link href={`/history/${year}`} aria-current={!activeRound && !activeSide ? "page" : undefined}>Overview</Link>
        {roundItems.map((round) => (
          <Link
            href={`/history/${year}/round/${round.number}`}
            aria-current={Number(activeRound) === round.number ? "page" : undefined}
            aria-label={`Round ${round.number} history`}
            key={round.number}
          >
            R{round.number}
          </Link>
        ))}
        {teams.map((team) => {
          const side = String(team.side || team.id || team.name || "");
          return (
            <Link
              href={`/history/${year}/team/${encodeURIComponent(side)}`}
              aria-current={normalizedSide && normalizedSide === side.toLowerCase() ? "page" : undefined}
              key={side}
            >
              {team.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
