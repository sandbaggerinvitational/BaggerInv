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
import ScoringStatGrid from "../ScoringStatGrid";
import {
  formatRecordValue,
} from "../../lib/scorecard-record-leaderboards";
import {
  getLeaderboardFromRecords,
  getLeaderboardSlugs,
} from "../../lib/leaderboards";
import { buildCanonicalRecordHolderAuthority } from "../../lib/record-holder-authority";
import { isSupabaseSecondaryHistory } from "../../lib/secondary-history-read-source";
import { loadSecondaryHistoryModel } from "../../lib/secondary-history-service";

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
  const useSupabase = isSupabaseSecondaryHistory();
  const secondaryHistory = useSupabase ? await loadSecondaryHistoryModel() : null;
  const scorecardAnalyticsPromise = useSupabase
    ? Promise.resolve(secondaryHistory.scorecardAnalytics)
    : loadScorecardAnalytics();
  if (!useSupabase) await refreshHistoricalData();
  const records = useSupabase
    ? secondaryHistory.calculations.getRecords()
    : getRecords();
  const scorecardAnalytics = await scorecardAnalyticsPromise;
  const playerNames = Object.fromEntries(
    records.points.map(({ player }) => [player["Player ID"], player["Display Name"]])
  );
  const recordAuthority = buildCanonicalRecordHolderAuthority({
    officialLeaderboards: getLeaderboardSlugs().map((slug) =>
      getLeaderboardFromRecords(slug, records)
    ),
    scorecards: scorecardAnalytics.scorecards,
    playerNames,
    ghostMatchExclusions: scorecardAnalytics.ghostMatchExclusions,
  });
  const scorecardRecords = recordAuthority.scorecardCatalog;
  const matchProgression = recordAuthority.matchProgression;
  const scoreToPar = (value) => Number(value) === 0
    ? "Even"
    : `${Number(value) > 0 ? "+" : ""}${value}`;
  const recordItem = (record) => ({
    label: record.title,
    value: record.formatter && record.winners[0]
      ? record.formatter(record.winners[0])
      : formatRecordValue(record.winners[0]?.value, record),
    detail: record.winners.length ? "" : record.emptyState,
    holders: record.winners.map((winner, index) => ({
      id: `${record.slug}-${winner.matchId || winner.playerId || winner.teamId || winner.name}-${index}`,
      name: winner.entityType === "PLAYER"
        ? winner.playerName
        : winner.teamName || winner.name || "Recorded performance",
      subtitle: winner.entityType === "TEAM_PERFORMANCE"
        ? winner.playerNames.join(" & ")
        : "",
      context: record.aggregate
        ? ""
        : [
            winner.year,
            winner.round ? `Round ${winner.round}` : "",
            winner.formatName || "",
            winner.courseName || "",
            Number.isFinite(Number(winner.secondaryValue))
              ? scoreToPar(winner.secondaryValue)
              : "",
          ].filter(Boolean).join(" · "),
    })),
    leaderboardHref: `/records/${record.slug}`,
  });

  return (
    <main data-secondary-history-source={useSupabase ? "supabase" : "google"}>
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
          <p>Records and leaderboards are based only on available COMPLETE and VERIFIED hole-by-hole scorecards. Historical coverage is not complete.</p>
          <h3>Individual Scoring Records</h3>
          <ScoringStatGrid items={scorecardRecords.groups.individual.map(recordItem)} />
          <h3>Team Scoring Records</h3>
          <ScoringStatGrid items={scorecardRecords.groups.team.map(recordItem)} />
          <h3>Course Hole Records</h3>
          <ScoringStatGrid items={scorecardRecords.groups.courseHole.map(recordItem)} />
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Complete Scorecards Only</span>
          <h2>Advanced Hole-by-Hole Analytics</h2>
          <h3>Hole Statistics</h3>
          <ScoringStatGrid items={scorecardRecords.groups.advanced.map(recordItem)} />
          <h3>Match Play Statistics</h3>
          <ScoringStatGrid items={scorecardRecords.groups.matchPlay.map(recordItem)} />
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Reconstructed Match Play</span>
          <h2>Match Progression Records</h2>
          <ScoringStatGrid items={matchProgression.records.map(recordItem)} />
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
