export const dynamic = "force-dynamic";
import Link from "next/link";
import AssetImage from "../AssetImage";
import { courseLogo } from "../../lib/asset-paths";
import {
  buildHistoricalCourseArchive,
  courseRoundLabel,
  currentTournamentCourses,
} from "../../lib/course-archive";
import { COURSE_ORIGINS, courseProfileHref } from "../../lib/course-navigation";
import { resolveTournamentGuideContent } from "../tournament-guide/resolveGuideContent";
import styles from "../historical.module.css";
import guideStyles from "../tournament-guide/tournament-guide.module.css";
import courseStyles from "./course-directory.module.css";
import { pageMetadata } from "../../lib/seo";
import { requireHistoricalCourseReadSource } from "../../lib/historical-course-read-source";

export const metadata = pageMetadata({
  title: "Courses | The Sandbagger Invitational",
  description: "Explore every golf course that has hosted a round of the Sandbagger Invitational.",
  path: "/courses",
});

const formatName = (value) => ({ BB: "2v2 Best Ball", SC: "Scramble", SI: "Singles" })[String(value || "").trim().toUpperCase()] || value || "";

export default async function CoursesPage({ searchParams }) {
  const archive = String((await searchParams)?.view || "") === "archive";
  const archiveSource = archive ? requireHistoricalCourseReadSource(process.env) : null;
  const content = !archive
    ? await resolveTournamentGuideContent({ surface: "course" })
    : archiveSource.resolved === "supabase"
      ? await import("../../lib/historical-course-service").then((module) => module.loadHistoricalCourseArchive())
      : await import("../tournament-guide/resolveGuideContentGoogle.js").then((module) => module.resolveGoogleTournamentGuideContent());
  const { tournament } = content;
  const courses = archive ? [] : currentTournamentCourses(content.courses);
  const historicalArchive = archive ? buildHistoricalCourseArchive({
    tournaments: content.courseArchiveTournaments,
    courses: content.courseArchive,
    currentYear: tournament?.year,
  }) : null;

  return (
    <main data-historical-course-source={archive ? archiveSource.resolved : "current-guide"}>
      <section className={`${styles.content} ${guideStyles.guideDetailShell}`}>
        <Link className={guideStyles.backToGuide} href="/tournament-guide">‹ Tournament Guide</Link>
        <header className={guideStyles.detailHeading}>
          <p className={styles.eyebrow}>{archive ? "Course Archive" : `${tournament?.year || "Current"} Tournament`}</p>
          <h1>{archive ? "Every Tournament Course" : "Courses"}</h1>
          <p>{archive ? "Every course played in Sandbagger Invitational history, organized by tournament year and round." : "The courses being played during the active tournament."}</p>
        </header>
        {archive ? <div className={courseStyles.archiveGroups}>
          {historicalArchive.groups.map((group) => <section className={courseStyles.archiveYear} aria-labelledby={`course-year-${group.year}`} key={group.year}>
            <header className={courseStyles.archiveYearHeader}>
              <h2 id={`course-year-${group.year}`}>{group.year}</h2>
              {group.destination ? <p>{group.destination}</p> : null}
            </header>
            <div className={courseStyles.archiveCourseGrid}>
              {group.appearances.map((course) => <Link
                aria-label={`View ${group.year} Round ${course.round} — ${course.Course}`}
                className={`${styles.courseIndexCard} ${courseStyles.archiveCard}`}
                href={courseProfileHref({
                  courseId: course["Course ID"],
                  origin: COURSE_ORIGINS.ARCHIVE,
                  year: group.year,
                  round: course.round,
                })}
                key={`${group.year}-${course.round}-${course["Course ID"]}`}
                prefetch={false}
              >
                <div className={courseStyles.archiveCardLead}>
                  <AssetImage
                    src={courseLogo(course["Course Logo"])}
                    alt={`${course.Course} logo`}
                    className={`${styles.courseIndexLogo} ${courseStyles.archiveLogo}`}
                    fallbackClassName={styles.courseLogoPlaceholder}
                    fallback="⛳"
                  />
                  <span className={courseStyles.roundLabel}>Round {course.round}</span>
                </div>
                <h3>{course.Course}</h3>
                <p>{course.City}, {course.State}</p>
                {course.Designer ? <small>Architect · {course.Designer}</small> : null}
              </Link>)}
            </div>
          </section>)}
        </div> : <div className={styles.courseIndexGrid}>
          {courses.map((course) => <Link
            className={styles.courseIndexCard}
            href={courseProfileHref({ courseId: course["Course ID"], origin: COURSE_ORIGINS.CURRENT })}
            key={course["Course ID"]}
          >
            <AssetImage
              src={courseLogo(course["Course Logo"])}
              alt={`${course.Course} logo`}
              className={styles.courseIndexLogo}
              fallbackClassName={styles.courseLogoPlaceholder}
              fallback="⛳"
            />
            <h2>{course.Course}</h2>
            <p>{course.City}, {course.State}</p>
            <span>{[courseRoundLabel(course.Round), formatName(course.Format), course["Tee Played"] ? `${course["Tee Played"]} Tees` : ""].filter(Boolean).join(" • ")}</span>
          </Link>)}
        </div>}
        <Link className={guideStyles.secondaryAction} href={archive ? "/courses" : "/courses?view=archive"}>{archive ? "View Current Tournament" : "View Course Archive"} →</Link>
      </section>
    </main>
  );
}
