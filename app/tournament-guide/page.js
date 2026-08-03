import Link from "next/link";
import { redirect } from "next/navigation";
import { Header, Footer } from "../components";
import { paragraphs } from "../../lib/tournament-guide";
import { resolveTournamentGuideContent } from "./resolveGuideContent";
import TournamentGuideHero from "./TournamentGuideHero";
import styles from "./tournament-guide.module.css";
import { pageMetadata } from "../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "Tournament Guide | Sandbagger Invitational",
  description: "The official tournament-week guide for the Sandbagger Invitational.",
  path: "/tournament-guide",
});

const destinations = [
  { icon: "📅", title: "Schedule", detail: "Tournament week itinerary", href: "/tournament-guide/schedule" },
  { icon: "📍", title: "Courses", detail: "Venues, tees, and course details", href: "/courses" },
  { icon: "📜", title: "Rules & Formats", detail: "Rules, points, and match formats", href: "/tournament-guide/rules" },
  { icon: "🍽️", title: "Dining", detail: "Meals and tournament gatherings", href: "/tournament-guide/dining" },
  { icon: "🧳", title: "Getting Around", detail: "Arrival and transportation information", href: "/tournament-guide/getting-around" },
  { icon: "📞", title: "Important Contacts", detail: "Tournament-week assistance", href: "/tournament-guide/contacts" },
];

function Text({ value }) {
  return paragraphs(value).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>);
}

export default async function TournamentGuidePage({ searchParams }) {
  const legacySection = String((await searchParams)?.section || "");
  if (legacySection) {
    const destination = legacySection === "match-formats" ? "rules" : legacySection === "travel" ? "getting-around" : legacySection;
    if (["schedule", "rules", "dining", "getting-around", "contacts"].includes(destination)) redirect(`/tournament-guide/${destination}`);
  }

  const { tournament, overview: sections } = await resolveTournamentGuideContent();
  const sectionDescription = Object.fromEntries(sections.map((item) => [item["Section Slug"], item.Description]));
  const rosterCount = (tournament.team1?.roster?.length || 0) + (tournament.team2?.roster?.length || 0);
  const listedTeamSize = Number(tournament["Team Size"]);
  const playerCount = rosterCount || (Number.isFinite(listedTeamSize) && listedTeamSize > 0 ? listedTeamSize * 2 : 0);
  const overviewItems = [["Field", playerCount ? `${playerCount} players` : "Two teams"]].filter(([, value]) => String(value ?? "").trim());

  return <main><Header />
    <TournamentGuideHero tournament={tournament} />
    <div className={styles.shell}>
      <header className={styles.guidePageHeading}><p className={styles.eyebrow}>Official Player Resource</p><h1>Tournament Guide</h1></header>
      <section className={styles.directory} aria-labelledby="guide-directory-title"><header><p className={styles.eyebrow}>Tournament Weekend</p><h2 id="guide-directory-title">Find what you need</h2><span>Quick access to the information golfers use most.</span></header><div>{destinations.map((item) => <Link href={item.href} prefetch={false} key={item.href}><i aria-hidden="true">{item.icon}</i><span><strong>{item.title}</strong><small>{item.detail}</small></span><b aria-hidden="true">›</b></Link>)}</div></section>
      <section className={styles.overview} id="overview"><p className={styles.eyebrow}>Welcome</p><h2>{tournament.Location || `${tournament.year} Tournament Week`}</h2><Text value={sectionDescription.overview || "Schedules, rules, tournament tools, and important details for Sandbagger Invitational week."} />{overviewItems.length ? <dl>{overviewItems.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}</section>
    </div><Footer />
  </main>;
}
