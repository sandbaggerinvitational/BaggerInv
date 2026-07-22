import styles from "../historical.module.css";
import { LeaderboardPlayer } from "../TournamentLeaderboard";

export function PlayerPair({ first, second }) {
  return (
    <span className={styles.playerPair}>
      <LeaderboardPlayer
        compact
        name={first["Display Name"]}
        slug={first.slug}
        photo={first["Photo Filename"]}
      />
      <b>+</b>
      <LeaderboardPlayer
        compact
        name={second["Display Name"]}
        slug={second.slug}
        photo={second["Photo Filename"]}
      />
    </span>
  );
}

export function AdvancedTable({ headers, children }) {
  return (
    <div className={styles.advancedTableWrap}>
      <div
        className={styles.advancedTable}
        style={{
          "--advanced-columns": `minmax(54px,.35fr) minmax(230px,1.7fr) repeat(${
            headers.length - 2
          },minmax(115px,.8fr))`,
        }}
      >
        <div className={styles.advancedTableHead}>
          {headers.map((header) => (
            <span key={header}>{header}</span>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

export function AdvancedRow({ children }) {
  return <div className={styles.advancedTableRow}>{children}</div>;
}
