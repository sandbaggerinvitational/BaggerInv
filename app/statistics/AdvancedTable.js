import { Children } from "react";
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

export function AdvancedTable({ headers, label, children }) {
  return (
    <div
      aria-label={`${label} table, scroll horizontally to view all columns`}
      className={styles.advancedTableWrap}
      role="region"
      tabIndex={0}
    >
      <table
        className={styles.advancedTable}
        style={{
          "--advanced-columns": `minmax(54px,.35fr) minmax(230px,1.7fr) repeat(${
            headers.length - 2
          },minmax(115px,.8fr))`,
        }}
      >
        <caption className={styles.advancedTableCaption}>{label}</caption>
        <thead>
          <tr className={styles.advancedTableHead}>
            {headers.map((header) => (
              <th key={header} scope="col">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function AdvancedRow({ children }) {
  return (
    <tr className={styles.advancedTableRow}>
      {Children.map(children, (child, index) => index === 1
        ? <th scope="row">{child}</th>
        : <td>{child}</td>)}
    </tr>
  );
}
