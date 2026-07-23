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
  await refreshHistoricalData();
  const { courseId } = await params;
  const course = getCourse(courseId);
  if (!course) notFound();

  const website = course.Website || "";

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
              <a
                className={styles.courseWebsiteLink}
                href={website}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit Course Website →
              </a>
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
      </section>

      <Footer />
    </main>
  );
}
