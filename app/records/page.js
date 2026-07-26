export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../lib/stats";
import Link from "next/link";
import { Header, Footer } from "../components";
import {
  formatPercentage,
  formatRecord,
  getFormatName,
  getRecords,
} from "../../lib/stats";
import styles from "../historical.module.css";
import { addTournamentRanks } from "../../lib/rankings";
import { pageMetadata } from "../../lib/seo";
import { loadScorecardAnalytics } from "../../lib/scorecard-data";
import { buildScoringRecords } from "../../lib/scorecard-analytics";
import ScoringStatGrid, { formatScoringNumber } from "../ScoringStatGrid";

function LeaderSection({ title, slug, rows, value }) {
  const rankedRows = addTournamentRanks(rows, ({ stats }) => value(stats));
  return (
    <section>
      <div className={styles.recordSectionHeading}>
        <div>
          <span className={styles.sectionLabel}>All-Time Leaders</span>
          <h2>{title}</h2>
        </div>

        <Link
          className={styles.fullLeaderboardLink}
          href={`/records/${slug}`}
        >
          View Full Leaderboard →
        </Link>
      </div>

      <div className={styles.podium}>
        {rankedRows.slice(0, 5).map(({ player, stats, tournamentRank }) => (
          <Link
            className={styles.podiumCard}
            href={`/players/${player.slug}`}
            key={player["Player ID"]}
          >
            <b>{tournamentRank}</b>
            <h3>{player["Display Name"]}</h3>
            <strong>{value(stats)}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}

export const metadata = pageMetadata({
  title: "Records | The Sandbagger Invitational",
  description: "The official Sandbagger Invitational record book and all-time leaderboards.",
  path: "/records",
});

export default async function RecordsPage() {
  const scorecardAnalyticsPromise = loadScorecardAnalytics();
  await refreshHistoricalData();
  const records = getRecords();
  const scorecardAnalytics = await scorecardAnalyticsPromise;
  const scoringRecords = buildScoringRecords(scorecardAnalytics.usableScorecards);
  const participant = (record) =>
    record?.scorecard?.playerName || record?.scorecard?.teamName || record?.scorecard?.playerId || record?.scorecard?.teamId || "";
  const recordItem = (label, record, options = {}) => ({
    label,
    value: formatScoringNumber(record?.value, options),
    detail: participant(record),
    sample: record?.label ? `${record.label}. Based on recorded scorecards.` : "Based on recorded scorecards.",
  });
  const holeItem = (label, hole) => ({
    label,
    value: hole ? `#${hole.holeNumber}` : "—",
    detail: hole ? `${hole.courseId}${hole.tee ? ` · ${hole.tee}` : ""}` : "",
    sample: hole?.averageToPar?.label
      ? `${hole.averageToPar.label}. Based on recorded scorecards.`
      : "Based on recorded scorecards.",
  });

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
        <div className={styles.statisticsCallout}>
          <div>
            <span className={styles.sectionLabel}>Go Deeper</span>
            <h2>Statistics Center</h2>
            <p>
              Explore career efficiency, format leaders, competitive
              honors, and tournament-handicap statistics.
            </p>
          </div>

          <Link href="/statistics">Explore More Stats →</Link>
        </div>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Available Scorecard History</span>
          <h2>Scoring Records</h2>
          <p>Every scoring record below is based on recorded scorecards and does not imply complete all-time coverage.</p>
          <ScoringStatGrid items={[
            recordItem("Lowest Recorded Round", scoringRecords.lowestRecordedRound),
            recordItem("Lowest To Par", scoringRecords.lowestToPar, { signed: true }),
            recordItem("Lowest Front Nine", scoringRecords.lowestFrontNine),
            recordItem("Lowest Back Nine", scoringRecords.lowestBackNine),
            recordItem("Most Birdies", scoringRecords.mostBirdies),
            recordItem("Most Eagles", scoringRecords.mostEagles),
            recordItem("Most Consecutive Birdies", scoringRecords.mostConsecutiveBirdies),
            recordItem("Best Closing Stretch", scoringRecords.bestClosingStretch),
            recordItem("Best Par 3 Average", scoringRecords.bestPar3Average),
            recordItem("Best Par 4 Average", scoringRecords.bestPar4Average),
            recordItem("Best Par 5 Average", scoringRecords.bestPar5Average),
            holeItem("Hardest Historical Hole", scoringRecords.hardestHistoricalHole),
            holeItem("Easiest Historical Hole", scoringRecords.easiestHistoricalHole),
            recordItem("Lowest Scramble Round", scoringRecords.lowestScrambleRound),
            recordItem("Lowest Singles Round", scoringRecords.lowestSinglesRound),
          ]} />
        </section>

        <div className={styles.recordSections}>
          <LeaderSection
            title="Career Points"
            slug="career-points"
            rows={records.points}
            value={(stats) => stats.records.overall.points}
          />

          <LeaderSection
            title="Match Wins"
            slug="match-wins"
            rows={records.wins}
            value={(stats) => stats.records.overall.wins}
          />

          <LeaderSection
            title="Bagger Championships"
            slug="championships"
            rows={records.championships}
            value={(stats) => stats.championships.length}
          />

          <LeaderSection
            title="Point Win Percentage"
            slug="win-percentage"
            rows={records.percentage}
            value={(stats) => formatPercentage(stats.percentages.overall)}
          />

          {[
            ["BB", "best-ball"],
            ["SC", "scramble"],
            ["SI", "singles"],
          ].map(([format, slug]) => (
            <LeaderSection
              key={format}
              slug={slug}
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
