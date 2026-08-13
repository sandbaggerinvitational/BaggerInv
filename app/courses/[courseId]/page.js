export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Header } from "../../components";
import AssetImage from "../../AssetImage";
import ExternalLinkConfirm from "../../ExternalLinkConfirm";
import { courseHero, courseLogo } from "../../../lib/asset-paths";
import { courseDetailModel } from "../../../lib/course-detail";
import { pageMetadata } from "../../../lib/seo";
import { resolveTournamentGuideContent } from "../../tournament-guide/resolveGuideContent";
import styles from "./course-detail.module.css";

const resolveCourse = cache(async (courseId, archive = false) => {
  const content = archive
    ? await import("../../tournament-guide/resolveGuideContentGoogle.js").then((module) => module.resolveGoogleTournamentGuideContent())
    : await resolveTournamentGuideContent({ surface: "course" });
  return courseDetailModel(courseId, content);
});

export async function generateMetadata({ params, searchParams }) {
  const { courseId } = await params;
  const archive = String((await searchParams)?.view || "") === "archive";
  const model = await resolveCourse(courseId, archive);
  return pageMetadata({
    title: model ? `${model.course.Course} | The Sandbagger Invitational` : "Course | The Sandbagger Invitational",
    description: model ? `${model.course.Course} tournament course details.` : "Sandbagger Invitational course details.",
    path: `/courses/${encodeURIComponent(courseId)}`,
    image: model?.images[0] ? courseHero(model.images[0]) : undefined,
  });
}

function TextSections({ sections }) {
  if (!sections.length) return null;
  return <div className={styles.textSections}>{sections.map(([title, value]) => <article key={title}><h3>{title}</h3>{String(value).split(/\n\s*\n/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</article>)}</div>;
}

function NineScorecard({ holes, label }) {
  if (!holes.length) return null;
  return <div className={styles.nine}>
    <h3>{label}</h3>
    <table aria-label={`${label} scorecard`}>
      <thead><tr><th>Hole</th>{holes.map((hole) => <th key={`h-${hole["Hole Number"]}`}>{hole["Hole Number"]}</th>)}</tr></thead>
      <tbody>
        <tr><th>Yds</th>{holes.map((hole) => <td key={`y-${hole["Hole Number"]}`}>{hole.Yardage || "—"}</td>)}</tr>
        <tr><th>Par</th>{holes.map((hole) => <td key={`p-${hole["Hole Number"]}`}>{hole.Par || "—"}</td>)}</tr>
        <tr><th>HCP</th>{holes.map((hole) => <td key={`s-${hole["Hole Number"]}`}>{hole["Stroke Index"] || "—"}</td>)}</tr>
      </tbody>
    </table>
  </div>;
}

export default async function CoursePage({ params, searchParams }) {
  const { courseId } = await params;
  const archive = String((await searchParams)?.view || "") === "archive";
  const model = await resolveCourse(courseId, archive);
  if (!model) notFound();
  const { course } = model;
  const website = model.website;
  return <main className={styles.page}>
    <Header homeHref="/home" />
    <section className={styles.hero}>
      {model.images[0] ? <AssetImage src={courseHero(model.images[0])} alt={`${course.Course} course`} className={styles.heroImage} fallbackClassName={styles.heroFallback} fallback={course.Course} loading="eager" /> : null}
      <div className={styles.heroShade} />
      <div className={styles.heroContent}>
        <Link href={archive ? "/courses?view=archive" : "/courses"}>‹ Courses</Link>
        <div className={styles.identity}>
          <div className={styles.logoPlate}><AssetImage src={courseLogo(course["Course Logo"])} alt={`${course.Course} logo`} className={styles.logo} fallbackClassName={styles.logoFallback} fallback="⛳" loading="eager" /></div>
          <div><span>{model.location}</span><h1>{course.Course}</h1>{course.Designer ? <p>{course.Designer}</p> : null}</div>
        </div>
      </div>
    </section>

    <div className={styles.shell}>
      {model.facts.length ? <section className={styles.section}><header><span>At a glance</span><h2>Course Quick Facts</h2></header><dl className={styles.facts}>{model.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section> : null}

      {model.experience.length ? <section className={`${styles.section} ${styles.experienceSection}`}><header><span>Explore the course</span><h2>Course Guide</h2></header><TextSections sections={model.experience} /></section> : null}

      {model.images.length > 1 ? <section className={styles.section}><header><span>Course gallery</span><h2>On the Course</h2></header><div className={styles.gallery}>{model.images.map((image, index) => <AssetImage src={courseHero(image)} alt={`${course.Course} view ${index + 1}`} className={styles.galleryImage} fallbackClassName={styles.galleryFallback} fallback={course.Course} key={image} />)}</div></section> : null}

      {model.holes.length ? <section className={`${styles.section} ${styles.scorecardSection}`} id="course-scorecard"><header><span>Hole by hole</span><h2>{model.tee ? `${model.tee} Tees Scorecard` : "Course Scorecard"}</h2></header><div className={styles.scorecard}><NineScorecard holes={model.holes.slice(0, 9)} label="Front Nine" /><NineScorecard holes={model.holes.slice(9, 18)} label="Back Nine" /></div></section> : null}

      {website ? <div className={styles.actions}><ExternalLinkConfirm href={website}>Visit Official Course Website →</ExternalLinkConfirm></div> : null}
    </div>
  </main>;
}
