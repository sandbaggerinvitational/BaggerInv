import Link from "next/link";
import styles from "../historical.module.css";

export function PlayerPair({ first, second }) {
  return (
    <span className={styles.playerPair}>
      <Link href={`/players/${first.slug}`}>{first["Display Name"]}</Link>
      <b>+</b>
      <Link href={`/players/${second.slug}`}>{second["Display Name"]}</Link>
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
