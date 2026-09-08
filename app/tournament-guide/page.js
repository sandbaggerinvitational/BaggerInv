import Link from "next/link";
import { redirect } from "next/navigation";
import { Header, Footer } from "../components";
import { resolveTournamentGuideContent } from "./resolveGuideContent";
import TournamentGuideHero from "./TournamentGuideHero";
import GuideDirectoryIcon from "./GuideDirectoryIcon";
import styles from "./tournament-guide.module.css";
import { pageMetadata } from "../../lib/seo";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";
import PublicTournamentGuide from "./PublicTournamentGuide";
import { guideDestinationAvailable } from "../../lib/guide-publication-policy.js";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "Tournament Guide | Sandbagger Invitational",
  description: "The official tournament-week guide for the Sandbagger Invitational.",
  path: "/tournament-guide",
});

const destinations = [
  { icon: "schedule", title: "Schedule", detail: "Tournament week itinerary", href: "/tournament-guide/schedule" },
  { icon: "courses", title: "Courses", detail: "Venues, tees, and course details", href: "/courses" },
  { icon: "rules", title: "Rules & Formats", detail: "Rules, points, and match formats", href: "/tournament-guide/rules" },
  { icon: "dining", title: "Dining", detail: "Meals and tournament gatherings", href: "/tournament-guide/dining" },
  { icon: "local", title: "Local Guide", detail: "Local resources and transportation", href: "/tournament-guide/getting-around" },
  { icon: "contacts", title: "Important Contacts", detail: "Tournament-week assistance", href: "/tournament-guide/contacts" },
];

const guidePresentationHref = (href, participantPresentation) => {
  if (!participantPresentation) return href;
  return String(href || "")
    .replace(/^\/tournament-guide(?=\/|\?|$)/, "/app/guide")
    .replace(/^\/courses(?=\/|\?|$)/, "/app/courses");
};

export default async function TournamentGuidePage({ searchParams, participantPresentation = false }) {
  const env = await applicationPageEnvironment();
  if (!participantPresentation) {
    const content = await resolveTournamentGuideContent({ env });
    return <PublicTournamentGuide content={content} />;
  }
  const legacySection = String((await searchParams)?.section || "");
  if (legacySection) {
    const destination = legacySection === "match-formats" ? "rules" : legacySection === "travel" ? "getting-around" : legacySection;
    if (["schedule", "rules", "dining", "getting-around", "contacts"].includes(destination)) redirect(`${participantPresentation ? "/app/guide" : "/tournament-guide"}/${destination}`);
  }

  const content = await resolveTournamentGuideContent({ env });
  const { tournamentIdentity, courses } = content;
  const availableDestinations = destinations.filter((item) => guideDestinationAvailable(content, item.icon));

  return <main>{participantPresentation ? null : <Header />}
    <TournamentGuideHero tournament={tournamentIdentity} courses={courses} />
    <div className={styles.shell}>
      {availableDestinations.length ? <section className={styles.directory} aria-labelledby="guide-directory-title"><header><p className={styles.eyebrow}>Tournament Weekend</p><h2 id="guide-directory-title">Find what you need</h2><span>Quick access to the information golfers use most.</span></header><div>{availableDestinations.map((item) => <Link href={guidePresentationHref(item.href, participantPresentation)} prefetch={false} key={item.href}><i><GuideDirectoryIcon name={item.icon} /></i><span><strong>{item.title}</strong><small>{item.detail}</small></span><b aria-hidden="true">›</b></Link>)}</div></section> : null}
    </div>{participantPresentation ? null : <Footer />}
  </main>;
}
