import Link from "next/link";
import { Header, Footer } from "../components";
import { getCourses } from "../../lib/stats";
import styles from "../historical.module.css";

export const metadata = {
  title: "Courses | The Sandbagger Invitational",
};

export default function CoursesPage() {
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
              <div className={styles.courseLogoPlaceholder}>⛳</div>
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
