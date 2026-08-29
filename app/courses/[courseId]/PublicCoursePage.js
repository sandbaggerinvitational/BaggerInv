import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Header, Footer } from "../../components";
import AssetImage from "../../AssetImage";
import ScoringStatGrid, { formatScoringNumber } from "../../ScoringStatGrid";
import { courseDetailModel } from "../../../lib/course-detail";
import { courseHero, courseLogo, defaultAssets } from "../../../lib/asset-paths";
import { loadHistoricalCourseModel } from "../../../lib/historical-course-service";
import {
  buildScoringHighlights,
  filterScorecards,
  summarizeScorecards,
} from "../../../lib/scorecard-analytics";
import { resolveTournamentGuideContent } from "../../tournament-guide/resolveGuideContent";
import historicalStyles from "../../historical.module.css";
import styles from "./public-course-profile.module.css";
import {
  canonicalPublicCourseHoles,
  canonicalPublicCourseId,
  canonicalPublicCourseScorecards,
  publicCourseDetailContent,
} from "../public-course-model";

const formatName = (value) => ({
  BB: "2v2 Best Ball",
  SC: "Scramble",
  SI: "Singles",
})[String(value || "").trim().toUpperCase()] || value || "—";

export const resolvePublicCourse = cache(async (courseId, env) => {
  const [historicalModel, guideContent] = await Promise.all([
    loadHistoricalCourseModel({ env }),
    resolveTournamentGuideContent({ surface: "course", env }),
  ]);
  const canonicalCourseId = canonicalPublicCourseId(courseId, historicalModel.aliases);
  const content = publicCourseDetailContent(historicalModel, guideContent);
  const model = courseDetailModel(canonicalCourseId, content);
  if (!model) return null;

  const scorecards = canonicalPublicCourseScorecards(
    historicalModel.allScorecards,
    historicalModel.aliases,
  );
  const expectedScorecards = filterScorecards(scorecards, { courseId: canonicalCourseId });
  const usableScorecards = expectedScorecards.filter((scorecard) =>
    String(scorecard.status || "").trim().toUpperCase() !== "MISSING"
  );
  const courseStatistics = summarizeScorecards(usableScorecards, expectedScorecards.length);
  const courseHighlights = buildScoringHighlights(usableScorecards, expectedScorecards.length);
  const holeStatistics = canonicalPublicCourseHoles(
    historicalModel.courseHoleSummaries,
    historicalModel.aliases,
  ).filter((hole) => String(hole.courseId).toUpperCase() === canonicalCourseId);

  return {
    canonicalCourseId,
    courseHighlights,
    courseStatistics,
    guideSource: guideContent.projection?.source || "configured",
    historicalSource: historicalModel.source,
    holeStatistics,
    model,
  };
});

function statisticsItems(courseStatistics, courseHighlights) {
  return [
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
  ];
}

export default async function PublicCoursePage({ courseId, env }) {
  const resolved = await resolvePublicCourse(courseId, env);
  if (!resolved) notFound();
  const { canonicalCourseId, courseHighlights, courseStatistics, holeStatistics, model } = resolved;
  const { course } = model;
  const heroImage = model.images[0] || course["Course Profile Image"];
  const designLine = [
    course.Designer ? `Designed by ${course.Designer}` : "",
    course["Year Opened"] ? `Opened ${course["Year Opened"]}` : "",
  ].filter(Boolean).join(" · ");

  return <main
    className={styles.page}
    data-historical-course-source={resolved.historicalSource}
    data-guide-course-source={resolved.guideSource}
  >
    <Header />
    <section className={styles.hero}>
      <AssetImage
        src={courseHero(heroImage) || defaultAssets.courseHero}
        alt={`${course.Course} course`}
        className={styles.heroImage}
        fallbackClassName={styles.heroFallback}
        fallback={course.Course}
        loading="eager"
        width={1440}
        height={720}
        sizes="100vw"
      />
      <div className={styles.heroShade} />
      <div className={styles.heroContent}>
        <div className={styles.logoWrap}>
          <AssetImage
            src={courseLogo(course["Course Logo"]) || defaultAssets.courseLogo}
            alt={`${course.Course} logo`}
            className={styles.logo}
            fallbackClassName={styles.logoFallback}
            fallback="⛳"
            loading="eager"
          />
        </div>
        <div>
          {model.location ? <p className={styles.eyebrow}>{model.location}</p> : null}
          <h1>{course.Course}</h1>
          {designLine ? <p>{designLine}</p> : null}
        </div>
      </div>
    </section>

    <section className={`${historicalStyles.content} ${styles.content}`}>
      <div className={historicalStyles.courseDetailGrid}>
        <div className={historicalStyles.detailCard}>
          <h2>Course Details</h2>
          <div className={historicalStyles.detailList}>
            <div><span>Par</span><strong>{course.Par ?? "—"}</strong></div>
            <div><span>Yardage</span><strong>{course.Yardage ?? "—"}</strong></div>
            <div><span>Rating</span><strong>{course.Rating ?? "—"}</strong></div>
            <div><span>Slope</span><strong>{course.Slope ?? "—"}</strong></div>
            <div><span>Tee Played</span><strong>{course["Tee Played"] ?? "—"}</strong></div>
          </div>
          {model.website ? <a
            className={historicalStyles.courseWebsiteLink}
            href={model.website}
            target="_blank"
            rel="noopener noreferrer"
          >Visit Course Website →</a> : null}
        </div>

        <div className={historicalStyles.detailCard}>
          <h2>Sandbagger History</h2>
          <div className={historicalStyles.detailList}>
            {model.appearances.map((appearance) => <div key={`${appearance.Year}-${appearance.Round}`}>
              <span>{appearance.Year} · {appearance.Round}</span>
              <strong>{formatName(appearance.Format)}</strong>
            </div>)}
          </div>
        </div>
      </div>

      <section className={historicalStyles.section}>
        <span className={historicalStyles.sectionLabel}>Available Scorecard History</span>
        <h2>Course Statistics</h2>
        <ScoringStatGrid items={statisticsItems(courseStatistics, courseHighlights)} />
      </section>

      <section className={historicalStyles.section}>
        <span className={historicalStyles.sectionLabel}>Hole Analytics</span>
        <h2>Course Holes</h2>
        {holeStatistics.length ? <div className={historicalStyles.courseHoleGrid}>
          {holeStatistics.map((hole) => <Link
            href={`/courses/${encodeURIComponent(canonicalCourseId)}/holes/${hole.holeNumber}${hole.tee ? `?tee=${encodeURIComponent(hole.tee)}` : ""}`}
            key={`${hole.tee}-${hole.holeNumber}`}
          >
            <span>Hole {hole.holeNumber}</span>
            <strong>{formatScoringNumber(hole.scoringAverage.value)}</strong>
            <small>{hole.tee || "Recorded tee"} · {hole.scoringAverage.label}</small>
          </Link>)}
        </div> : <div className={historicalStyles.roundArchiveEmpty}>Scorecard unavailable for this course.</div>}
      </section>
    </section>
    <Footer />
  </main>;
}
