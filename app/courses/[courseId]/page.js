export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../lib/stats";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import AssetImage from "../../AssetImage";
import {
  courseHero,
  courseLogo,
} from "../../../lib/asset-paths";
import { getCourse, getFormatName } from "../../../lib/stats";
import styles from "../../historical.module.css";
import { pageMetadata } from "../../../lib/seo";
import ExternalLinkConfirm from "../../ExternalLinkConfirm";
import Link from "next/link";
import { loadScorecardAnalytics } from "../../../lib/scorecard-data";
import {
  buildScoringHighlights,
  filterScorecards,
  summarizeScorecards,
} from "../../../lib/scorecard-analytics";
import ScoringStatGrid, { formatScoringNumber } from "../../ScoringStatGrid";

export async function generateMetadata({ params }) {
  await refreshHistoricalData();
  const { courseId } = await params;
  const course = getCourse(courseId);

  const title = course
    ? `${course.Course} | The Sandbagger Invitational`
    : "Course | The Sandbagger Invitational";
  return pageMetadata({
    title,
    description: course
      ? `${course.Course} tournament details and Sandbagger Invitational history.`
      : "Sandbagger Invitational course details and tournament history.",
    path: `/courses/${encodeURIComponent(courseId)}`,
    image: course?.["Course Profile Image"]
      ? courseHero(course["Course Profile Image"])
      : undefined,
  });
}

export default async function CoursePage({ params }) {
  const scorecardAnalyticsPromise = loadScorecardAnalytics();
  await refreshHistoricalData();
  const { courseId } = await params;
  const course = getCourse(courseId);
  if (!course) notFound();

  const website = course.Website || "";
  const scorecardAnalytics = await scorecardAnalyticsPromise;
  const courseScorecards = filterScorecards(scorecardAnalytics.usableScorecards, { courseId });
  const missingCourseScorecards = scorecardAnalytics.missingScorecards.filter(
    (scorecard) => String(scorecard.courseId).toUpperCase() === String(courseId).toUpperCase()
  );
  const courseStatistics = summarizeScorecards(
    courseScorecards,
    courseScorecards.length + missingCourseScorecards.length
  );
  const courseHighlights = buildScoringHighlights(
    courseScorecards,
    courseScorecards.length + missingCourseScorecards.length
  );
  const holeStatistics = scorecardAnalytics.courseHoleSummaries.filter(
    (hole) => String(hole.courseId).toUpperCase() === String(courseId).toUpperCase()
  );

  return (
    <main>
      <Header />

      <section className={styles.courseProfileHero}>
        <AssetImage
          src={courseHero(course["Course Profile Image"])}
          alt={`${course.Course} course`}
          className={styles.courseProfileHeroImage}
          fallbackClassName={styles.courseProfileHeroFallback}
          fallback={course.Course}
          loading="eager"
        />
        <div className={styles.courseProfileHeroShade} />

        <div className={styles.courseProfileHeroContent}>
          <div className={styles.courseProfileLogoWrap}>
            <AssetImage
              src={courseLogo(course["Course Logo"])}
              alt={`${course.Course} logo`}
              className={styles.courseProfileLogo}
              fallbackClassName={styles.courseProfileLogoFallback}
              fallback="⛳"
              loading="eager"
            />
          </div>

          <div>
            <p className={styles.eyebrow}>
              {course.City}, {course.State}
            </p>
            <h1>{course.Course}</h1>
            <p>
              Designed by {course.Designer} · Opened {course["Year Opened"]}
            </p>
          </div>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.courseDetailGrid}>
          <div className={styles.detailCard}>
            <h2>Course Details</h2>
            <div className={styles.detailList}>
              <div><span>Par</span><strong>{course.Par ?? "—"}</strong></div>
              <div><span>Yardage</span><strong>{course.Yardage ?? "—"}</strong></div>
              <div><span>Rating</span><strong>{course.Rating ?? "—"}</strong></div>
              <div><span>Slope</span><strong>{course.Slope ?? "—"}</strong></div>
              <div><span>Tee Played</span><strong>{course["Tee Played"] ?? "—"}</strong></div>
            </div>

            {website ? (
              <ExternalLinkConfirm
                className={styles.courseWebsiteLink}
                href={website}
              >
                Visit Course Website →
              </ExternalLinkConfirm>
            ) : null}
          </div>

          <div className={styles.detailCard}>
            <h2>Sandbagger History</h2>
            <div className={styles.detailList}>
              {course.appearances.map((appearance) => (
                <div key={`${appearance.Year}-${appearance.Round}`}>
                  <span>{appearance.Year} · {appearance.Round}</span>
                  <strong>{getFormatName(appearance.Format)}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Available Scorecard History</span>
          <h2>Course Statistics</h2>
          <ScoringStatGrid items={[
            {
              label: "Average Score",
              value: formatScoringNumber(courseStatistics.recordedScoringAverage.value),
              sample: courseStatistics.recordedScoringAverage.label,
            },
            {
              label: "Average To Par",
              value: formatScoringNumber(courseStatistics.averageToPar.value, { signed: true }),
              sample: courseStatistics.averageToPar.label,
            },
            {
              label: "Hardest Hole",
              value: courseHighlights.hardestHole ? `#${courseHighlights.hardestHole.holeNumber}` : "—",
              detail: courseHighlights.hardestHole?.tee,
              sample: courseHighlights.hardestHole?.averageToPar.label,
            },
            {
              label: "Easiest Hole",
              value: courseHighlights.easiestHole ? `#${courseHighlights.easiestHole.holeNumber}` : "—",
              detail: courseHighlights.easiestHole?.tee,
              sample: courseHighlights.easiestHole?.averageToPar.label,
            },
            {
              label: "Lowest Round",
              value: formatScoringNumber(courseStatistics.lowestRecordedRound.value),
              sample: courseStatistics.lowestRecordedRound.label,
            },
            {
              label: "Birdie %",
              value: formatScoringNumber(courseStatistics.birdiePercentage.value, { percentage: true }),
              sample: courseStatistics.birdiePercentage.label,
            },
            {
              label: "Par %",
              value: formatScoringNumber(courseStatistics.parPercentage.value, { percentage: true }),
              sample: courseStatistics.parPercentage.label,
            },
            {
              label: "Bogey %",
              value: formatScoringNumber(courseStatistics.bogeyPercentage.value, { percentage: true }),
              sample: courseStatistics.bogeyPercentage.label,
            },
            {
              label: "Double+ %",
              value: formatScoringNumber(courseStatistics.doubleOrWorsePercentage.value, { percentage: true }),
              sample: courseStatistics.doubleOrWorsePercentage.label,
            },
            {
              label: "Average Front",
              value: formatScoringNumber(courseStatistics.averageFrontNine.value),
              sample: courseStatistics.averageFrontNine.label,
            },
            {
              label: "Average Back",
              value: formatScoringNumber(courseStatistics.averageBackNine.value),
              sample: courseStatistics.averageBackNine.label,
            },
            {
              label: "Recorded Scorecards",
              value: `${courseStatistics.scorecardCoverage.available} of ${courseStatistics.scorecardCoverage.expected}`,
              sample: courseStatistics.scorecardCoverage.label,
            },
          ]} />
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Hole Analytics</span>
          <h2>Course Holes</h2>
          {holeStatistics.length ? (
            <div className={styles.courseHoleGrid}>
              {holeStatistics.map((hole) => (
                <Link
                  href={`/courses/${encodeURIComponent(courseId)}/holes/${hole.holeNumber}${hole.tee ? `?tee=${encodeURIComponent(hole.tee)}` : ""}`}
                  key={`${hole.tee}-${hole.holeNumber}`}
                >
                  <span>Hole {hole.holeNumber}</span>
                  <strong>{formatScoringNumber(hole.scoringAverage.value)}</strong>
                  <small>{hole.tee || "Recorded tee"} · {hole.scoringAverage.label}</small>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.roundArchiveEmpty}>Scorecard unavailable for this course.</div>
          )}
        </section>
      </section>

      <Footer />
    </main>
  );
}
