import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { annualGuideHeroModel } from "../../lib/tournament-guide-hero";
import { groupBy, isTruthy, paragraphs } from "../../lib/tournament-guide";
import { itineraryGroups, itineraryViewModel } from "../../lib/tournament-guide-schedule";
import { GUIDE_FORMAT_NAMES, guideFormatCode } from "../../lib/tournament-guide-rules";
import { diningGroups, diningViewModel } from "../../lib/tournament-guide-dining";
import {
  localGuideDirections,
  localGuideGroups,
  localGuidePhone,
  localGuideViewModel,
  localGuideWebsite,
} from "../../lib/tournament-guide-local";
import {
  contactCallHref,
  contactEmailHref,
  contactGroups,
  contactsViewModel,
  contactWebsiteHref,
} from "../../lib/tournament-guide-contacts";
import { publicGuideOverviewFallback } from "../../lib/tournament-guide-overview";
import styles from "./public-tournament-guide.module.css";

const clean = (value) => String(value ?? "").trim();

function Text({ value }) {
  return paragraphs(value).map((paragraph, index) =>
    <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
  );
}

function scheduleModel(content) {
  return itineraryViewModel({
    records: content.schedule,
    tournament: content.liveTournament || content.tournamentIdentity,
    rounds: content.liveRounds,
    courses: content.courses,
    tournamentRules: content.tournamentRules,
    formatRules: content.rounds,
    now: content.timelineNow ? new Date(content.timelineNow) : new Date(),
  });
}

function Schedule({ content, description }) {
  const model = scheduleModel(content);
  const groups = itineraryGroups(model.events);
  const featured = new Set(content.schedule
    .filter((event) => isTruthy(event.Featured))
    .map((event) => clean(event["Event ID"])));
  return <section className={styles.guideSection} id="schedule">
    <header>
      <p className={styles.eyebrow}>Tournament Week</p>
      <h2>Schedule</h2>
      <Text value={description} />
    </header>
    <div className={styles.timeline}>
      {[...groups.entries()].map(([day, events]) => <section className={styles.day} key={day}>
        <h3>{events[0]?.dateLabel ? `${day} · ${events[0].dateLabel}` : day}</h3>
        {events.map((event) => <article
          className={`${styles.event} ${featured.has(event.id) ? styles.featured : ""}`}
          key={event.id}
        >
          <div className={styles.eventTime}>{event.timeLabel}</div>
          <div>
            <span>{event.type}</span>
            <h4>{event.title}</h4>
            {event.subtitle ? <strong>{event.subtitle}</strong> : null}
            {event.location ? <p className={styles.location}>{event.location}</p> : null}
            {[event.roundNumber ? `Round ${event.roundNumber}` : "", event.formatLabel, event.tee ? `${event.tee} Tees` : ""].filter(Boolean).length
              ? <p className={styles.roundMeta}>{[
                event.roundNumber ? `Round ${event.roundNumber}` : "",
                event.formatLabel,
                event.tee ? `${event.tee} Tees` : "",
              ].filter(Boolean).join(" • ")}</p>
              : null}
            <Text value={event.details} />
            {event.roundNumber && content.liveTournament?.year ? <Link href={`/history/${content.liveTournament.year}/round/${event.roundNumber}`}>View Round {event.roundNumber} details →</Link> : null}
          </div>
        </article>)}
      </section>)}
    </div>
  </section>;
}

function configurationText(record = {}, format = {}) {
  return [
    clean(record.Description || format.Description),
    clean(record.Rules || format.Rules),
    clean(record["Handicap Allocation"] || record["Playing Handicap"] || record["Handicap Rules"] || record.Handicap || format["Handicap Allocation"] || format["Playing Handicap"] || format["Handicap Rules"] || format.Handicap),
    clean(record["Scoring Format"] || record.Scoring || record["Match Format"] || format["Scoring Format"] || format.Scoring || format["Match Format"]),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function Rules({ content, description }) {
  const categories = groupBy(content.ruleBook, "Category");
  const formatCatalog = new Map(content.rounds.map((format) => [
    guideFormatCode(format["Format ID"] || format.Format),
    format,
  ]));
  const roundConfigurations = [...content.tournamentRules].sort((left, right) =>
    Number(left.Round || 0) - Number(right.Round || 0)
  );
  return <section className={styles.guideSection} id="rules">
    <header>
      <p className={styles.eyebrow}>Official Competition</p>
      <h2>Rules &amp; Formats</h2>
      <Text value={description} />
    </header>
    <div className={styles.rules}>
      {roundConfigurations.length ? <section>
        <h3>Round Formats</h3>
        {roundConfigurations.map((configuration) => {
          const code = guideFormatCode(configuration.Format);
          const format = formatCatalog.get(code) || {};
          const title = clean(format.Name) || GUIDE_FORMAT_NAMES[code] || clean(configuration.Format) || "Round Format";
          const points = clean(configuration["Points Available"]);
          return <details key={`${configuration.Round}-${code}`}>
            <summary><span>{[`Round ${configuration.Round}`, points ? `${points} points available` : ""].filter(Boolean).join(" • ")}</span>{title}</summary>
            <div>{configurationText(configuration, format).map((value) => <Text value={value} key={value} />)}</div>
          </details>;
        })}
      </section> : null}
      {Object.entries(categories).map(([category, rules]) => <section key={category}>
        <h3>{category}</h3>
        {rules.map((rule) => <details
          className={isTruthy(rule.Important) ? styles.important : ""}
          key={rule["Rule ID"]}
          open={isTruthy(rule.Important)}
        >
          <summary><span>{rule.Subcategory || "Rule"}</span>{rule.Title}</summary>
          <div><Text value={rule.Body} />{rule["Effective Year"] ? <small>Effective {rule["Effective Year"]}</small> : null}</div>
        </details>)}
      </section>)}
    </div>
  </section>;
}

function Dining({ records, description }) {
  const groups = diningGroups(diningViewModel(records));
  return <section className={styles.guideSection} id="dining">
    <header><p className={styles.eyebrow}>Tournament Dining</p><h2>Dining</h2><Text value={description} /></header>
    <div className={styles.infoGrid}>
      {[...groups.entries()].flatMap(([day, meals]) => meals.map((meal) => <article className={styles.infoCard} key={meal.id}>
        <span>{[day, meal.time].filter(Boolean).join(" · ")}</span>
        <h3>{meal.meal}</h3>
        {meal.location ? <strong>{meal.location}</strong> : null}
        {[meal.cuisine, meal.dressCode, meal.reservationLabel].filter(Boolean).length ? <p>{[meal.cuisine, meal.dressCode, meal.reservationLabel].filter(Boolean).join(" • ")}</p> : null}
        <Text value={meal.notes} />
      </article>))}
    </div>
  </section>;
}

function LocalGuide({ records, description }) {
  const groups = localGuideGroups(localGuideViewModel(records));
  return <section className={styles.guideSection} id="local-guide">
    <header><p className={styles.eyebrow}>Local Concierge</p><h2>Local Guide</h2><Text value={description} /></header>
    <div className={styles.infoGrid}>
      {[...groups.entries()].flatMap(([section, records]) => records.map((record) => <article className={styles.infoCard} key={record.id}>
        <span>{section}</span><h3>{record.title}</h3>{record.description ? <p>{record.description}</p> : null}
        {record.address ? <a href={localGuideDirections(record.address)}>Directions →</a> : null}
        {record.phone ? <a href={localGuidePhone(record.phone)}>Call →</a> : null}
        {record.website ? <a href={localGuideWebsite(record.website)} target="_blank" rel="noreferrer">Website →</a> : null}
      </article>))}
    </div>
  </section>;
}

function Contacts({ records, description }) {
  const groups = contactGroups(contactsViewModel(records));
  return <section className={styles.guideSection} id="contacts">
    <header><p className={styles.eyebrow}>Tournament Concierge</p><h2>Important Contacts</h2><Text value={description} /></header>
    <div className={styles.infoGrid}>
      {[...groups.entries()].flatMap(([category, contacts]) => contacts.map((contact) => <article className={styles.infoCard} key={contact.id}>
        <span>{category}</span><h3>{contact.name}</h3>{contact.role ? <p>{contact.role}</p> : null}
        {contact.phone ? <a href={contactCallHref(contact.phone)}>Call →</a> : null}
        {contact.email ? <a href={contactEmailHref(contact.email)}>Email →</a> : null}
        {contact.website ? <a href={contactWebsiteHref(contact.website)} target="_blank" rel="noreferrer">Website →</a> : null}
      </article>))}
    </div>
  </section>;
}

export default function PublicTournamentGuide({ content }) {
  const identity = annualGuideHeroModel({ tournament: content.tournamentIdentity, courses: content.courses });
  const descriptions = Object.fromEntries(content.overview.map((item) => [clean(item["Section Slug"]), item.Description]));
  const uniqueCourseCount = new Set(content.courses.map((course) => clean(course["Course ID"])).filter(Boolean)).size;
  const overviewItems = [
    ["Edition", identity.edition || identity.year],
    ["Dates", identity.dates],
    ["Destination", identity.destination],
    ["Venues", uniqueCourseCount ? `${uniqueCourseCount} courses` : ""],
  ].filter(([, value]) => clean(value));
  const sections = [
    ["overview", "Overview", true],
    ["schedule", "Schedule", content.schedule.length],
    ["rules", "Rules", content.ruleBook.length || content.tournamentRules.length],
    ["dining", "Dining", content.dining.length],
    ["local-guide", "Local Guide", content.localGuide.length],
    ["contacts", "Important Contacts", content.importantContacts.length],
  ].filter(([, , visible]) => visible);

  return <main data-guide-source={content.projection?.source || "configured"}>
    <Header />
    <section className={styles.hero}>
      <div>
        <p>Official Player Resource</p>
        <h1>Tournament Guide</h1>
        <strong>{identity.edition || identity.name || `${identity.year} Sandbagger Invitational`}</strong>
        <span>{[identity.destination, identity.dates].filter(Boolean).join(" • ")}</span>
      </div>
      <div className={styles.logoPlate}>
        <div className={styles.logoInner}>
          <AssetImage
            src={identity.logoImage}
            alt={`${identity.year || "Tournament"} tournament logo`}
            fallback={identity.year || "SBI"}
            className={styles.logo}
            fallbackClassName={styles.logoFallback}
          />
        </div>
      </div>
    </section>

    <nav className={styles.sectionNav} aria-label="Tournament Guide sections">
      {sections.map(([slug, label]) => <a href={`#${slug}`} key={slug}>{label}</a>)}
    </nav>

    <div className={styles.shell}>
      <section className={styles.overview} id="overview">
        <p className={styles.eyebrow}>Everything You Need</p>
        <h2>{identity.destination || `${identity.year} Tournament Week`}</h2>
        <Text value={descriptions.overview || publicGuideOverviewFallback(content)} />
        {overviewItems.length ? <dl>{overviewItems.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
      </section>
      {content.schedule.length ? <Schedule content={content} description={descriptions.itinerary || descriptions.schedule} /> : null}
      {content.ruleBook.length || content.tournamentRules.length ? <Rules content={content} description={descriptions.rules} /> : null}
      {content.dining.length ? <Dining records={content.dining} description={descriptions.dining} /> : null}
      {content.localGuide.length ? <LocalGuide records={content.localGuide} description={descriptions["local-guide"] || descriptions["getting-around"]} /> : null}
      {content.importantContacts.length ? <Contacts records={content.importantContacts} description={descriptions.contacts || descriptions["important-contacts"]} /> : null}
    </div>
    <Footer />
  </main>;
}
