import { refreshHistoricalData } from "../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import {
  getLeaderboard,
} from "../../../lib/leaderboards";
import SortableLeaderboard from "../SortableLeaderboard";
import styles from "../../historical.module.css";
import { pageMetadata } from "../../../lib/seo";
import { loadScorecardAnalytics } from "../../../lib/scorecard-data";
import {
  buildScorecardRecordLeaderboards,
  scorecardLeaderboardRows,
} from "../../../lib/scorecard-record-leaderboards";
import {
  buildMatchProgressionAnalytics,
  matchProgressionLeaderboardRows,
} from "../../../lib/match-progression";

export const dynamic = "force-dynamic";

async function resolveLeaderboard(slug) {
  const existing = getLeaderboard(slug);
  if (existing) return { ...existing, scorecard: false };
  const analytics = await loadScorecardAnalytics();
  const playerNames = Object.fromEntries(analytics.scorecards
    .filter((card) => card.playerId)
    .map((card) => [card.playerId, card.playerName || card.playerId]));
  const record = buildScorecardRecordLeaderboards(analytics.scorecards, {
    playerNames,
    ghostMatchExclusions: analytics.ghostMatchExclusions,
  }).bySlug[slug];
  const progressionRecord = record ? null : buildMatchProgressionAnalytics(analytics.scorecards, {
    ghostMatchExclusions: analytics.ghostMatchExclusions,
  }).byRecordSlug[slug];
  const resolvedRecord = record || progressionRecord;
  if (!resolvedRecord) return null;
  const aggregateColumns = [
    { key: "value", label: "Career Value", numeric: true },
  ];
  const performanceColumns = [
    { key: "value", label: "Value", numeric: true },
    { key: "year", label: "Year", numeric: true },
    { key: "round", label: "Round" },
    { key: "format", label: "Format" },
    { key: "course", label: "Course" },
  ];
  return {
    title: resolvedRecord.title,
    description: "Complete leaderboard based only on available COMPLETE and VERIFIED hole-by-hole scorecards.",
    rows: record
      ? scorecardLeaderboardRows(record)
      : matchProgressionLeaderboardRows(progressionRecord),
    columns: resolvedRecord.aggregate ? aggregateColumns : performanceColumns,
    scorecard: true,
    direction: resolvedRecord.direction,
    entityLabel: resolvedRecord.entityType === "TEAM_PERFORMANCE"
      ? "Team Performance"
      : resolvedRecord.entityType === "COURSE_HOLE" ? "Course Hole" : progressionRecord ? "Player / Team / Match" : "Player",
    emptyState: resolvedRecord.emptyState,
  };
}

export async function generateMetadata({ params }) {
  await refreshHistoricalData();
  const { slug } = await params;
  const leaderboard = await resolveLeaderboard(slug);

  const title = leaderboard
    ? `${leaderboard.title} | The Sandbagger Invitational`
    : "Leaderboard | The Sandbagger Invitational";
  return pageMetadata({
    title,
    description:
      leaderboard?.description ||
      "Official Sandbagger Invitational historical leaderboard.",
    path: `/records/${slug}`,
  });
}

export default async function FullLeaderboardPage({ params }) {
  await refreshHistoricalData();
  const { slug } = await params;
  const leaderboard = await resolveLeaderboard(slug);
  if (!leaderboard) notFound();

  const defaultSort =
    leaderboard.columns.find((column) => column.numeric)?.key || "name";

  const ascending = leaderboard.scorecard
    ? leaderboard.direction === "lowest"
    : slug === "average-handicap";

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Full Leaderboard</p>
        <h1>{leaderboard.title}</h1>
        <p>{leaderboard.description}</p>
      </section>

      <section className={styles.content}>
        <div className={styles.leaderboardTopLinks}>
          <Link href="/records">← Records</Link>
          <Link href="/statistics">Statistics Center →</Link>
        </div>

        {leaderboard.rows.length ? (
          <SortableLeaderboard
            rows={leaderboard.rows}
            columns={leaderboard.columns}
            initialSort={defaultSort}
            initialDirection={ascending ? "asc" : "desc"}
            rankingKey={defaultSort}
            rankingDirection={ascending ? "asc" : "desc"}
            entityLabel={leaderboard.entityLabel}
            scorecard={leaderboard.scorecard}
          />
        ) : (
          <div className={styles.statisticsCallout}>
            <div>
              <span className={styles.sectionLabel}>No Qualifying Performance</span>
              <h2>{leaderboard.emptyState}</h2>
            </div>
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
