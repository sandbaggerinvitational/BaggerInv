import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { tournamentLogo } from "../../lib/asset-paths";
import { loadTournamentGuideSheets } from "../../lib/google-sheets-data";
import { getTournaments, refreshHistoricalData } from "../../lib/stats";
import {
  groupBy,
  informationForSection,
  isTruthy,
  paragraphs,
  publicGuideRecords,
  visibleGuideSections,
} from "../../lib/tournament-guide";
import styles from "./tournament-guide.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Tournament Guide | Sandbagger Invitational",
  description: "The official tournament-week guide for the Sandbagger Invitational.",
};

function Text({ value }) {
  return paragraphs(value).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>);
}

function InformationCards({ records }) {
  return <div className={styles.infoGrid}>{records.map((item) => (
    <article className={styles.infoCard} key={item["Item ID"]}>
      {item.Label ? <span>{item.Label}</span> : null}
      <h3>{item.Title}</h3>
      <Text value={item.Body} />
      {item["Link URL"] && item["Link Text"] ? <a href={item["Link URL"]} target="_blank" rel="noreferrer">{item["Link Text"]} →</a> : null}
    </article>
  ))}</div>;
}

function timeRange(event) {
  const start = event["Start Time"] || "";
  const end = event["End Time"] || "";
  return [start, end].filter(Boolean).join(" – ");
}

export default async function TournamentGuidePage() {
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
  const visibleSections = visibleGuideSections(guide);
  const days = groupBy(guide.itinerary, "Day Label");
  const ruleCategories = groupBy(guide.rules, "Category");
  const sectionDescription = Object.fromEntries(guide.sections.map((section) => [section["Section Slug"], section.Description]));

  return <main>
    <Header />
    <section className={styles.hero}>
      <div>
        <p>Official Player Resource</p>
        <h1>Tournament Guide</h1>
        <strong>{tournament.editionTitle || `${tournament.year} Sandbagger Invitational`}</strong>
        <span>{[tournament.Location, tournament.Dates || tournament.Date].filter(Boolean).join(" • ")}</span>
      </div>
      <AssetImage src={tournamentLogo(tournament.logoFileName)} alt={`${tournament.year} tournament logo`} fallback={String(tournament.year)} className={styles.logo} fallbackClassName={styles.logoFallback} />
    </section>

    <nav className={styles.sectionNav} aria-label="Tournament Guide sections">
      {visibleSections.map(([slug, label]) => <a href={`#${slug}`} key={slug}>{label}</a>)}
    </nav>

    <div className={styles.shell}>
      <section className={styles.overview} id="overview">
        <p className={styles.eyebrow}>Everything You Need</p>
        <h2>{tournament.Location || `${tournament.year} Tournament Week`}</h2>
        <Text value={sectionDescription.overview || "Schedules, rules, tournament tools, and important details for Sandbagger Invitational week."} />
        <dl>
          <div><dt>Edition</dt><dd>{tournament.editionTitle || tournament.year}</dd></div>
          {tournament.Dates || tournament.Date ? <div><dt>Dates</dt><dd>{tournament.Dates || tournament.Date}</dd></div> : null}
          {tournament.Location ? <div><dt>Location</dt><dd>{tournament.Location}</dd></div> : null}
          <div><dt>Field</dt><dd>{tournament["Team Size"] ? `${Number(tournament["Team Size"]) * 2} players` : "Two teams"}</dd></div>
        </dl>
      </section>

      {guide.itinerary.length ? <section className={styles.guideSection} id="itinerary">
        <header><p className={styles.eyebrow}>Tournament Week</p><h2>Itinerary</h2><Text value={sectionDescription.itinerary} /></header>
        <div className={styles.timeline}>{Object.entries(days).map(([day, events]) => <section className={styles.day} key={day}>
          <h3>{day}</h3>
          {events.map((event) => {
            const round = tournament.courses.find((item) => String(item["Round ID"] || item.Round) === String(event["Round ID"]));
            return <article className={`${styles.event} ${isTruthy(event.Featured) ? styles.featured : ""}`} key={event["Event ID"]}>
              <div className={styles.eventTime}>{timeRange(event) || event["Event Date"]}</div>
              <div><span>{event["Event Type"]}</span><h4>{event.Title}</h4>{event.Subtitle ? <strong>{event.Subtitle}</strong> : null}{event.Location ? <p className={styles.location}>{event.Location}</p> : null}<Text value={event.Details} />
              {round ? <Link href={`/history/${tournament.year}/round/${round.Round}`}>View Round {round.Round} details →</Link> : null}</div>
            </article>;
          })}
        </section>)}</div>
      </section> : null}

      {guide.rules.length ? <section className={styles.guideSection} id="rules">
        <header><p className={styles.eyebrow}>Official Competition</p><h2>Rules</h2><Text value={sectionDescription.rules} /></header>
        <div className={styles.rules}>{Object.entries(ruleCategories).map(([category, rules]) => <section key={category}><h3>{category}</h3>{rules.map((rule) => <details className={isTruthy(rule.Important) ? styles.important : ""} key={rule["Rule ID"]} open={isTruthy(rule.Important)}><summary><span>{rule.Subcategory || "Rule"}</span>{rule.Title}</summary><div><Text value={rule.Body} />{rule["Effective Year"] ? <small>Effective {rule["Effective Year"]}</small> : null}</div></details>)}</section>)}</div>
      </section> : null}

      {[["golf-genius", "Golf Genius"], ["calcutta-skins", "Calcutta & Skins"], ["important-information", "Important Information"]].map(([slug, title]) => {
        const records = informationForSection(guide.information, slug);
        return records.length ? <section className={styles.guideSection} id={slug} key={slug}><header><p className={styles.eyebrow}>Tournament Information</p><h2>{title}</h2><Text value={sectionDescription[slug]} /></header><InformationCards records={records} /></section> : null;
      })}

      {visibleSections.length === 1 ? <div className={styles.empty}><span>Guide content is being prepared</span><h2>Information coming soon</h2><p>The official tournament-week details will appear here as they are published.</p></div> : null}
    </div>
    <Footer />
  </main>;
}
