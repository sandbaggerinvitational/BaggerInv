export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../lib/stats";
import Link from "next/link";
import { Header, Footer } from "../../components";
import {
  formatPercentage,
  formatRecord,
  getPartnershipStats,
} from "../../../lib/stats";
import {
  AdvancedRow,
  AdvancedTable,
  PlayerPair,
} from "../AdvancedTable";
import styles from "../../historical.module.css";
import { addTournamentRanks } from "../../../lib/rankings";
import { LeaderboardRank } from "../../TournamentLeaderboard";

export const metadata = {
  title: "Partnership Analytics | The Sandbagger Invitational",
};

function PartnershipTable({ title, description, rows, valueLabel, value }) {
  const rankedRows = addTournamentRanks(rows, value);
  return (
    <section className={styles.advancedStatSection}>
      <span className={styles.sectionLabel}>Team Golf</span>
      <h2>{title}</h2>
      <p>{description}</p>

      <AdvancedTable
        headers={[
          "Rank",
          "Partnership",
          "Record",
          "Win %",
          valueLabel,
        ]}
      >
        {rankedRows.map((row) => (
          <AdvancedRow key={row.key}>
            <LeaderboardRank rank={row.tournamentRank} />
            <PlayerPair
              first={row.playerOne}
              second={row.playerTwo}
            />
            <span>{formatRecord(row.record)}</span>
            <span>{formatPercentage(row.percentage)}</span>
            <strong>{value(row)}</strong>
          </AdvancedRow>
        ))}
      </AdvancedTable>
    </section>
  );
}

export default async function PartnershipsPage() {
  await refreshHistoricalData();
  const partnerships = getPartnershipStats();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Team Golf</p>
        <h1>Partnership Analytics</h1>
        <p>
          The most productive, most successful, and most frequently used
          partnerships in tournament history.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.leaderboardTopLinks}>
          <Link href="/records">← Records</Link>
          <Link href="/statistics">Statistics Center →</Link>
        </div>

        <div className={styles.advancedStatsStack}>
          <PartnershipTable
            title="Most Partnership Points"
            description="Individual point shares earned while playing together."
            rows={partnerships.byPoints}
            valueLabel="Points"
            value={(row) => row.record.points}
          />

          <PartnershipTable
            title="Best Partnership Win Percentage"
            description="Requires at least four matches played together."
            rows={partnerships.byPercentage}
            valueLabel="Matches"
            value={(row) => row.record.matches}
          />

          <PartnershipTable
            title="Most Matches Together"
            description="The most frequently used pairings in tournament history."
            rows={partnerships.byMatches}
            valueLabel="Matches"
            value={(row) => row.record.matches}
          />
        </div>
      </section>

      <Footer />
    </main>
  );
}
