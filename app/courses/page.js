export const dynamic = "force-dynamic";
import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { courseLogo } from "../../lib/asset-paths";
import { resolveTournamentGuideContent } from "../tournament-guide/resolveGuideContent";
import TournamentGuideHero from "../tournament-guide/TournamentGuideHero";
import styles from "../historical.module.css";
import guideStyles from "../tournament-guide/tournament-guide.module.css";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Courses | The Sandbagger Invitational",
  description: "Explore every golf course that has hosted a round of the Sandbagger Invitational.",
  path: "/courses",
});

const formatName = (value) => ({ BB: "2v2 Best Ball", SC: "Scramble", SI: "Singles" })[String(value || "").trim().toUpperCase()] || value || "";

export default async function CoursesPage({ searchParams }) {
  const archive = String((await searchParams)?.view || "") === "archive";
  const content = archive
    ? await import("../tournament-guide/resolveGuideContentGoogle.js").then((module) => module.resolveGoogleTournamentGuideContent())
    : await resolveTournamentGuideContent({ surface: "course" });
  const { tournament } = content;
  const courses = archive
    ? content.courseArchive
    : [...new Map(content.courses.map((course) => [course["Course ID"], course])).values()];

  return (
    <main>
      <Header />
      <TournamentGuideHero tournament={content.tournamentIdentity} />

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
              href={`/courses/${course["Course ID"]}${archive ? "?view=archive" : ""}`}
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
              <span>{archive ? course.Designer : [course.Round, formatName(course.Format), course["Tee Played"] ? `${course["Tee Played"]} Tees` : ""].filter(Boolean).join(" • ")}</span>
            </Link>
          ))}
        </div>
        <Link className={guideStyles.secondaryAction} href={archive ? "/courses" : "/courses?view=archive"}>{archive ? "View Current Tournament" : "View Course Archive"} →</Link>
      </section>

      <Footer />
    </main>
  );
}
