export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "../../components";
import AssetImage from "../../AssetImage";
import ExternalLinkConfirm from "../../ExternalLinkConfirm";
import { courseHero, courseLogo } from "../../../lib/asset-paths";
import { courseDetailModel } from "../../../lib/course-detail";
import { pageMetadata } from "../../../lib/seo";
import { resolveTournamentGuideContent } from "../../tournament-guide/resolveGuideContent";
import styles from "./course-detail.module.css";

async function resolveCourse(courseId) {
  const content = await resolveTournamentGuideContent();
  return courseDetailModel(courseId, content);
}

export async function generateMetadata({ params }) {
  const { courseId } = await params;
  const model = await resolveCourse(courseId);
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

export default async function CoursePage({ params }) {
  const { courseId } = await params;
  const model = await resolveCourse(courseId);
  if (!model) notFound();
  const { course } = model;
  const website = model.website;
  return <main className={styles.page}>
    <Header homeHref="/home" />
    <section className={styles.hero}>
      {model.images[0] ? <AssetImage src={courseHero(model.images[0])} alt={`${course.Course} course`} className={styles.heroImage} fallbackClassName={styles.heroFallback} fallback={course.Course} loading="eager" /> : null}
      <div className={styles.heroShade} />
      <div className={styles.heroContent}>
        <Link href="/courses">‹ Courses</Link>
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

      {model.holes.length ? <section className={`${styles.section} ${styles.scorecardSection}`} id="course-scorecard"><header><span>Hole by hole</span><h2>Course Scorecard</h2></header><div className={styles.scorecard} role="table" aria-label={`${course.Course} scorecard`}><div role="row"><b role="columnheader">Hole</b>{model.holes.map((hole) => <b role="columnheader" key={`h-${hole["Hole Number"]}`}>{hole["Hole Number"]}</b>)}</div><div role="row"><span role="rowheader">Par</span>{model.holes.map((hole) => <span role="cell" key={`p-${hole["Hole Number"]}`}>{hole.Par || "—"}</span>)}</div><div role="row"><span role="rowheader">HCP</span>{model.holes.map((hole) => <span role="cell" key={`s-${hole["Hole Number"]}`}>{hole["Stroke Index"] || "—"}</span>)}</div></div></section> : null}

      <div className={styles.actions}>{model.holes.length ? <Link href="#course-scorecard">View Scorecard</Link> : null}{website ? <ExternalLinkConfirm href={website}>Visit Official Course Website →</ExternalLinkConfirm> : null}</div>
    </div>
  </main>;
}
