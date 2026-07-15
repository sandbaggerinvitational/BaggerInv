import { Header, Footer } from "../components";
import {
  formatPercentage,
  formatRecord,
  getFormatName,
  getRecords,
} from "../../lib/stats";
import styles from "../historical.module.css";

function LeaderSection({ title, rows, value }) {
  return (
    <section>
      <span className={styles.sectionLabel}>All-Time Leaders</span>
      <h2>{title}</h2>
      <div className={styles.podium}>
        {rows.slice(0, 5).map(({ player, stats }, index) => (
          <div className={styles.podiumCard} key={player["Player ID"]}>
            <b>#{index + 1}</b>
            <h3>{player["Display Name"]}</h3>
            <strong>{value(stats)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export const metadata = {
  title: "Records | The Sandbagger Invitational",
};

export default function RecordsPage() {
  const records = getRecords();

  return (
    <main>
      <Header />
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>The Record Book</p>
        <h1>Records</h1>
        <p>
          Complete match records begin in 2017. Percentage leaderboards
          require at least five tournament appearances. Career points are
          incomplete for 2017 and 2018.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.recordSections}>
          <LeaderSection
            title="Career Points"
            rows={records.points}
            value={(stats) => stats.records.overall.points}
          />
          <LeaderSection
            title="Match Wins"
            rows={records.wins}
            value={(stats) => stats.records.overall.wins}
          />
          <LeaderSection
            title="Bagger Championships"
            rows={records.championships}
            value={(stats) => stats.championships.length}
          />
          <LeaderSection
            title="Point Win Percentage"
            rows={records.percentage}
            value={(stats) => formatPercentage(stats.percentages.overall)}
          />
          {["BB", "SC", "SI"].map((format) => (
            <LeaderSection
              key={format}
              title={`${getFormatName(format)} Leaders`}
              rows={records.byFormat[format]}
              value={(stats) =>
                `${formatRecord(stats.records[format])} · ${formatPercentage(
                  stats.percentages[format]
                )}`
              }
            />
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
