export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../lib/stats";
import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { courseLogo } from "../../lib/asset-paths";
import { getCourses, getFormatName, getTournaments } from "../../lib/stats";
import { getTournamentData } from "../live/sheetData";
import styles from "../historical.module.css";
import guideStyles from "../tournament-guide/tournament-guide.module.css";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Courses | The Sandbagger Invitational",
  description: "Explore every golf course that has hosted a round of the Sandbagger Invitational.",
  path: "/courses",
});

export default async function CoursesPage({ searchParams }) {
  const [liveResult] = await Promise.allSettled([getTournamentData(), refreshHistoricalData()]);
  const liveData = liveResult.status === "fulfilled" ? liveResult.value : null;
  if (liveResult.status === "rejected") console.error("Courses could not refresh normalized tournament data; using last confirmed historical data.", liveResult.reason);
  const tournament = getTournaments().find((item) => Number(item.year) === Number(liveData?.tournament?.year)) || getTournaments()[0];
  const archive = String((await searchParams)?.view || "") === "archive";
  const courses = archive
    ? getCourses()
    : [...new Map((liveData?.guide?.courses?.length ? liveData.guide.courses : tournament?.courses || []).map((course) => [course["Course ID"], course])).values()];

  return (
    <main>
      <Header />

      <section className={`${styles.content} ${guideStyles.guideDetailShell}`}>
        <Link className={guideStyles.backToGuide} href="/tournament-guide">‹ Tournament Guide</Link>
        <header className={guideStyles.detailHeading}>
          <p className={styles.eyebrow}>{archive ? "Course Archive" : `${tournament?.year || "Current"} Tournament`}</p>
          <h1>{archive ? "Every Tournament Course" : "Courses"}</h1>
          <p>{archive ? "Every venue that has hosted a Sandbagger Invitational round." : "The courses being played during the active tournament."}</p>
        </header>
        <div className={styles.courseIndexGrid}>
          {courses.map((course) => (
            <Link
              className={styles.courseIndexCard}
              href={`/courses/${course["Course ID"]}`}
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
              <p>
                {course.City}, {course.State}
              </p>
              <span>{archive ? course.Designer : [course.Round, getFormatName(course.Format), course["Tee Played"] ? `${course["Tee Played"]} Tees` : ""].filter(Boolean).join(" • ")}</span>
            </Link>
          ))}
        </div>
        <Link className={guideStyles.secondaryAction} href={archive ? "/courses" : "/courses?view=archive"}>{archive ? "View Current Tournament" : "View Course Archive"} →</Link>
      </section>

      <Footer />
    </main>
  );
}
