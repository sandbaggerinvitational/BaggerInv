import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import ExternalLinkConfirm from "../ExternalLinkConfirm";
import { tournamentLogo } from "../../lib/asset-paths";
import { loadTournamentGuideSheets } from "../../lib/google-sheets-data";
import { getFormatName, getTournaments, refreshHistoricalData } from "../../lib/stats";
import { groupBy, informationForSection, isTruthy, paragraphs, publicGuideRecords } from "../../lib/tournament-guide";
import styles from "./tournament-guide.module.css";
import { pageMetadata } from "../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "Tournament Guide | Sandbagger Invitational",
  description: "The official tournament-week guide for the Sandbagger Invitational.",
  path: "/tournament-guide",
});

const destinations = [
  { id: "schedule", icon: "📅", title: "Schedule", detail: "Tournament week itinerary", href: "/tournament-guide?section=schedule" },
  { id: "courses", icon: "📍", title: "Courses", detail: "Venues, tees, and course details", href: "/courses" },
  { id: "rules", icon: "📜", title: "Rules & Formats", detail: "Official competition rules", href: "/tournament-guide?section=rules" },
  { id: "match-formats", icon: "⛳", title: "Match Formats", detail: "Best Ball, Scramble, and Singles", href: "/tournament-guide?section=match-formats" },
  { id: "dining", icon: "🍽️", title: "Dining", detail: "Meals and tournament gatherings", href: "/tournament-guide?section=dining" },
  { id: "travel", icon: "🧳", title: "Travel", detail: "Arrival, lodging, and transportation", href: "/tournament-guide?section=travel" },
  { id: "contacts", icon: "📞", title: "Important Contacts", detail: "Tournament-week assistance", href: "/tournament-guide?section=contacts" },
];

function Text({ value }) {
  return paragraphs(value).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>);
}

function InformationCards({ records }) {
  return <div className={styles.infoGrid}>{records.map((item) => <article className={styles.infoCard} key={item["Item ID"]}>
    {item.Label ? <span>{item.Label}</span> : null}<h3>{item.Title}</h3><Text value={item.Body} />
    {item["Link URL"] && item["Link Text"] ? <ExternalLinkConfirm href={item["Link URL"]}>{item["Link Text"]} →</ExternalLinkConfirm> : null}
  </article>)}</div>;
}

function GuideDirectory({ compact = false }) {
  return <section className={`${styles.directory} ${compact ? styles.directoryCompact : ""}`} aria-labelledby={compact ? "more-guide-title" : "guide-directory-title"}>
    <header><p className={styles.eyebrow}>{compact ? "Explore the Guide" : "Tournament Weekend"}</p><h2 id={compact ? "more-guide-title" : "guide-directory-title"}>Find what you need</h2>{compact ? null : <span>Quick access to the information golfers use most.</span>}</header>
    <div>{destinations.map((item) => <Link href={item.href} prefetch={false} key={item.id}><i aria-hidden="true">{item.icon}</i><span><strong>{item.title}</strong><small>{item.detail}</small></span><b aria-hidden="true">›</b></Link>)}</div>
  </section>;
}

const timeRange = (event) => [event["Start Time"], event["End Time"]].filter(Boolean).join(" – ");
const roundNumber = (value) => {
  const parsed = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const linkedRoundForEvent = (tournament, event) => {
  const eventRound = roundNumber(event["Round ID"]);
  return eventRound ? tournament.courses.find((course) => roundNumber(course.Round) === eventRound) || null : null;
};
const recordText = (record) => Object.values(record || {}).join(" ").toLowerCase();
const matching = (records, terms) => records.filter((record) => terms.some((term) => recordText(record).includes(term)));

function EmptySection({ title }) {
  return <div className={styles.empty}><span>Tournament Guide</span><h2>{title}</h2><p>Published tournament information will appear here when available.</p></div>;
}

function ScheduleSection({ tournament, itinerary, description }) {
  if (!itinerary.length) return <EmptySection title="Schedule" />;
  const days = groupBy(itinerary, "Day Label");
  return <section className={styles.focusedContent}><header><p className={styles.eyebrow}>Tournament Week</p><h1>Schedule</h1><Text value={description} /></header>
    <div className={styles.timeline}>{Object.entries(days).map(([day, events]) => <section className={styles.day} key={day}><h3>{day}</h3>{events.map((event) => {
      const round = linkedRoundForEvent(tournament, event);
      const venue = round?.Course || event.Location;
      const roundMeta = round ? [`Round ${roundNumber(round.Round)}`, getFormatName(round.Format), round["Tee Played"] ? `${round["Tee Played"]} Tees` : ""].filter(Boolean) : [];
      return <article className={`${styles.event} ${isTruthy(event.Featured) ? styles.featured : ""}`} key={event["Event ID"]}><div className={styles.eventTime}>{timeRange(event) || event["Event Date"]}</div><div><span>{event["Event Type"]}</span><h4>{event.Title}</h4>{event.Subtitle ? <strong>{event.Subtitle}</strong> : null}{venue ? <p className={styles.location}>{venue}</p> : null}{roundMeta.length ? <p className={styles.roundMeta}>{roundMeta.join(" • ")}</p> : null}<Text value={event.Details} /></div></article>;
    })}</section>)}</div>
  </section>;
}

function RulesSection({ records, title, description }) {
  if (!records.length) return <EmptySection title={title} />;
  return <section className={styles.focusedContent}><header><p className={styles.eyebrow}>Official Competition</p><h1>{title}</h1><Text value={description} /></header><div className={styles.rules}>{Object.entries(groupBy(records, "Category")).map(([category, rules]) => <section key={category}><h3>{category}</h3>{rules.map((rule) => <details className={isTruthy(rule.Important) ? styles.important : ""} key={rule["Rule ID"]} open={isTruthy(rule.Important)}><summary><span>{rule.Subcategory || "Rule"}</span>{rule.Title}</summary><div><Text value={rule.Body} />{rule["Effective Year"] ? <small>Effective {rule["Effective Year"]}</small> : null}</div></details>)}</section>)}</div></section>;
}

function InformationSection({ records, title, eyebrow }) {
  return records.length ? <section className={styles.focusedContent}><header><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1></header><InformationCards records={records} /></section> : <EmptySection title={title} />;
}

export default async function TournamentGuidePage({ searchParams }) {
  await refreshHistoricalData();
  const tournament = getTournaments()[0];
  if (!tournament) throw new Error("Tournament Guide could not resolve the current tournament.");
  const sheets = await loadTournamentGuideSheets();
  const guide = {
    sections: publicGuideRecords(sheets.sections, tournament),
    itinerary: publicGuideRecords(sheets.itinerary, tournament),
    rules: publicGuideRecords(sheets.rules, tournament),
    information: publicGuideRecords(sheets.information, tournament),
  };
  const requested = String((await searchParams)?.section || "");
  const section = destinations.some((item) => item.id === requested && item.id !== "courses") ? requested : "";
  const sectionDescription = Object.fromEntries(guide.sections.map((item) => [item["Section Slug"], item.Description]));
  const rosterCount = (tournament.team1?.roster?.length || 0) + (tournament.team2?.roster?.length || 0);
  const listedTeamSize = Number(tournament["Team Size"]);
  const playerCount = rosterCount || (Number.isFinite(listedTeamSize) && listedTeamSize > 0 ? listedTeamSize * 2 : 0);
  const overviewItems = [["Edition", tournament.editionTitle || tournament.year], ["Dates", tournament.Dates || tournament.Date], ["Field", playerCount ? `${playerCount} players` : "Two teams"]].filter(([, value]) => String(value ?? "").trim());
  const selectedTitle = destinations.find((item) => item.id === section)?.title;
  const matchFormatRules = matching(guide.rules, ["format", "best ball", "scramble", "singles", "match play"]);
  const dining = matching(guide.information, ["dining", "dinner", "breakfast", "lunch", "meal", "restaurant", "food"]);
  const travel = matching(guide.information, ["travel", "hotel", "lodging", "airport", "arrival", "departure", "transport", "shuttle"]);
  const contacts = informationForSection(guide.information, "important-information");

  return <main><Header />
    <section className={`${styles.hero} ${section ? styles.heroCompact : ""}`}><div><p>{section ? "Tournament Guide" : "Official Player Resource"}</p><h1>{selectedTitle || "Tournament Guide"}</h1><strong>{tournament.editionTitle || `${tournament.year} Sandbagger Invitational`}</strong><span>{[tournament.Location, tournament.Dates || tournament.Date].filter(Boolean).join(" • ")}</span></div><div className={styles.logoPlate}><div className={styles.logoInner}><AssetImage src={tournamentLogo(tournament.logoFileName)} alt={`${tournament.year} tournament logo`} fallback={String(tournament.year)} className={styles.logo} fallbackClassName={styles.logoFallback} /></div></div></section>
    <div className={styles.shell}>
      {section ? <Link className={styles.backToGuide} href="/tournament-guide">‹ Tournament Guide</Link> : <GuideDirectory />}
      {section === "schedule" ? <ScheduleSection tournament={tournament} itinerary={guide.itinerary} description={sectionDescription.itinerary} /> : null}
      {section === "rules" ? <RulesSection records={guide.rules} title="Rules & Formats" description={sectionDescription.rules} /> : null}
      {section === "match-formats" ? <RulesSection records={matchFormatRules} title="Match Formats" description="How each tournament round is played and scored." /> : null}
      {section === "dining" ? <InformationSection records={dining} title="Dining" eyebrow="Meals & Gatherings" /> : null}
      {section === "travel" ? <InformationSection records={travel} title="Travel" eyebrow="Getting There" /> : null}
      {section === "contacts" ? <InformationSection records={contacts} title="Important Contacts" eyebrow="Tournament Assistance" /> : null}
      {section ? <GuideDirectory compact /> : <section className={styles.overview} id="overview"><p className={styles.eyebrow}>Welcome</p><h2>{tournament.Location || `${tournament.year} Tournament Week`}</h2><Text value={sectionDescription.overview || "Schedules, rules, tournament tools, and important details for Sandbagger Invitational week."} />{overviewItems.length ? <dl>{overviewItems.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}</section>}
    </div><Footer />
  </main>;
}
