import Link from "next/link";
import { redirect } from "next/navigation";
import { Header, Footer } from "../components";
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
  { icon: "🧳", title: "Local Guide", detail: "Tournament-week local concierge", href: "/tournament-guide/getting-around" },
  { icon: "📞", title: "Important Contacts", detail: "Tournament-week assistance", href: "/tournament-guide/contacts" },
];

export default async function TournamentGuidePage({ searchParams }) {
  const legacySection = String((await searchParams)?.section || "");
  if (legacySection) {
    const destination = legacySection === "match-formats" ? "rules" : legacySection === "travel" ? "getting-around" : legacySection;
    if (["schedule", "rules", "dining", "getting-around", "contacts"].includes(destination)) redirect(`/tournament-guide/${destination}`);
  }

  const { tournamentIdentity } = await resolveTournamentGuideContent();

  return <main><Header />
    <TournamentGuideHero tournament={tournamentIdentity} />
    <div className={styles.shell}>
      <section className={styles.directory} aria-labelledby="guide-directory-title"><header><p className={styles.eyebrow}>Tournament Weekend</p><h2 id="guide-directory-title">Find what you need</h2><span>Quick access to the information golfers use most.</span></header><div>{destinations.map((item) => <Link href={item.href} prefetch={false} key={item.href}><i aria-hidden="true">{item.icon}</i><span><strong>{item.title}</strong><small>{item.detail}</small></span><b aria-hidden="true">›</b></Link>)}</div></section>
    </div><Footer />
  </main>;
}
