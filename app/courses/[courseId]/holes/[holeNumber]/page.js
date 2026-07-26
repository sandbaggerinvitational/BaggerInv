export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components";
import ContextBackLink from "../../../../ContextBackLink";
import ScoringStatGrid, { formatScoringNumber } from "../../../../ScoringStatGrid";
import { loadScorecardAnalytics } from "../../../../../lib/scorecard-data";
import { getCourse, refreshHistoricalData } from "../../../../../lib/stats";
import { pageMetadata } from "../../../../../lib/seo";
import styles from "../../../../historical.module.css";

export async function generateMetadata({ params }) {
  await refreshHistoricalData();
  const { courseId, holeNumber } = await params;
  const course = getCourse(courseId);
  return pageMetadata({
    title: course
      ? `${course.Course} Hole ${holeNumber} | The Sandbagger Invitational`
      : "Course Hole | The Sandbagger Invitational",
    description: course
      ? `Recorded Sandbagger Invitational scoring analytics for hole ${holeNumber} at ${course.Course}.`
      : "Recorded Sandbagger Invitational course-hole analytics.",
    path: `/courses/${encodeURIComponent(courseId)}/holes/${holeNumber}`,
  });
}

export default async function CourseHolePage({ params, searchParams }) {
  const scorecardAnalyticsPromise = loadScorecardAnalytics();
  await refreshHistoricalData();
  const { courseId, holeNumber } = await params;
  const query = await searchParams;
  const course = getCourse(courseId);
  const number = Number(holeNumber);
  if (!course || !Number.isInteger(number) || number < 1 || number > 18) notFound();

  const analytics = await scorecardAnalyticsPromise;
  const candidates = analytics.courseHoleSummaries.filter((hole) =>
    String(hole.courseId).toUpperCase() === String(courseId).toUpperCase() &&
    hole.holeNumber === number
  );
  const requestedTee = String(query?.tee || "").trim();
  const hole = candidates.find((item) =>
    requestedTee && String(item.tee).toLowerCase() === requestedTee.toLowerCase()
  ) || candidates[0] || null;

  return (
    <main>
      <Header />
      <ContextBackLink href={`/courses/${encodeURIComponent(courseId)}`} label={`Back to ${course.Course}`} />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>{course.Course}{hole?.tee ? ` · ${hole.tee}` : ""}</p>
        <h1>Hole {number}</h1>
        <p>
          Par {hole?.par ?? "—"} · {hole?.yardage ?? "—"} yards · Stroke Index {hole?.strokeIndex ?? "—"}
        </p>
      </section>

      <section className={styles.content}>
        <section className={styles.section}>
          <span className={styles.sectionLabel}>Available Scorecard History</span>
          <h2>Hole Statistics</h2>
          {hole ? (
            <ScoringStatGrid items={[
              { label: "Average Score", value: formatScoringNumber(hole.scoringAverage.value), sample: hole.scoringAverage.label },
              { label: "Average To Par", value: formatScoringNumber(hole.averageToPar.value, { signed: true }), sample: hole.averageToPar.label },
              { label: "Birdie %", value: formatScoringNumber(hole.birdiePercentage.value, { percentage: true }), sample: hole.birdiePercentage.label },
              { label: "Par %", value: formatScoringNumber(hole.parPercentage.value, { percentage: true }), sample: hole.parPercentage.label },
              { label: "Bogey %", value: formatScoringNumber(hole.bogeyPercentage.value, { percentage: true }), sample: hole.bogeyPercentage.label },
              { label: "Double+ %", value: formatScoringNumber(hole.doubleOrWorsePercentage.value, { percentage: true }), sample: hole.doubleOrWorsePercentage.label },
              { label: "Difficulty Rank", value: `#${hole.difficultyRank}`, detail: `${hole.tee || "Recorded tee"} scorecard`, sample: hole.averageToPar.label },
              { label: "Best Score", value: formatScoringNumber(hole.bestScore.value), sample: hole.bestScore.label },
              { label: "Worst Score", value: formatScoringNumber(hole.worstScore.value), sample: hole.worstScore.label },
            ]} />
          ) : (
            <div className={styles.roundArchiveEmpty}>Scorecard unavailable for this hole.</div>
          )}
        </section>
      </section>
      <Footer />
    </main>
  );
}
