import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { courseLogo } from "../../lib/asset-paths";
import { loadHistoricalCourseModel } from "../../lib/historical-course-service";
import { resolveTournamentGuideContent } from "../tournament-guide/resolveGuideContent";
import styles from "../historical.module.css";
import { publicCourseDirectory } from "./public-course-model";

export default async function PublicCoursesPage({ env }) {
  const [historicalModel, guideContent] = await Promise.all([
    loadHistoricalCourseModel({ env }),
    resolveTournamentGuideContent({ surface: "course", env }),
  ]);
  const courses = publicCourseDirectory(historicalModel, guideContent);

  return <main
    data-historical-course-source={historicalModel.source}
    data-guide-course-source={guideContent.projection?.source || "configured"}
  >
    <Header />
    <section className={styles.pageHero}>
      <p className={styles.eyebrow}>The Venues</p>
      <h1>Courses</h1>
      <p>Every course that has hosted a round of The Sandbagger Invitational.</p>
    </section>
    <section className={styles.content}>
      <div className={styles.courseIndexGrid}>
        {courses.map((course) => <Link
          className={styles.courseIndexCard}
          href={`/courses/${encodeURIComponent(course["Course ID"])}`}
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
          <p>{[course.City, course.State].filter(Boolean).join(", ")}</p>
          {course.Designer ? <span>{course.Designer}</span> : null}
        </Link>)}
      </div>
    </section>
    <Footer />
  </main>;
}
