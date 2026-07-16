import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import AssetImage from "../../AssetImage";
import { courseLogo } from "../../../lib/asset-paths";
import { getCourse, getFormatName } from "../../../lib/stats";
import styles from "../../historical.module.css";

export async function generateMetadata({ params }) {
  const { courseId } = await params;
  const course = getCourse(courseId);

  return {
    title: course
      ? `${course.Course} | The Sandbagger Invitational`
      : "Course | The Sandbagger Invitational",
  };
}

export default async function CoursePage({ params }) {
  const { courseId } = await params;
  const course = getCourse(courseId);
  if (!course) notFound();

  return (
    <main>
      <Header />

      <section className={`${styles.pageHero} ${styles.coursePageHero}`}>
        <div className={styles.courseHeroLogoWrap}>
          <AssetImage
            src={courseLogo(course["Course Logo"])}
            alt={`${course.Course} logo`}
            className={styles.courseHeroLogo}
            fallbackClassName={styles.courseHeroLogoFallback}
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
      </section>

      <Footer />
    </main>
  );
}
