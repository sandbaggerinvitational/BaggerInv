export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../lib/stats";
import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { courseLogo } from "../../lib/asset-paths";
import { getCourses } from "../../lib/stats";
import styles from "../historical.module.css";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Courses | The Sandbagger Invitational",
  description: "Explore every golf course that has hosted a round of the Sandbagger Invitational.",
  path: "/courses",
});

export default async function CoursesPage() {
  await refreshHistoricalData();
  const courses = getCourses();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>The Venues</p>
        <h1>Courses</h1>
        <p>
          Every course that has hosted a round of The Sandbagger
          Invitational.
        </p>
      </section>

      <section className={styles.content}>
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
              <span>{course.Designer}</span>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
