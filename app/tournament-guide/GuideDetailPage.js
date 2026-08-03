import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { tournamentLogo } from "../../lib/asset-paths";
import { formatRuleSummary } from "../../lib/rules-format-summary";
import { getFormatName } from "../../lib/stats";
import { groupBy, isTruthy, paragraphs } from "../../lib/tournament-guide";
import { resolveTournamentGuideContent } from "./resolveGuideContent";
import ScheduleItinerary from "./ScheduleItinerary";
import styles from "./tournament-guide.module.css";

const titles = { schedule: "Schedule", rules: "Rules & Formats", dining: "Dining", "getting-around": "Getting Around", contacts: "Important Contacts" };
const formatTerms = { BB: ["best ball", "four-ball", "four ball", "fourball"], SC: ["scramble"], SI: ["singles", "single match"] };
const ruleSections = [
  { id: "tournament", icon: "🏆", title: "Tournament Rules", matches: /tournament|handicap|scoring/i },
  { id: "local", icon: "📍", title: "Local Rules", matches: /local/i },
  { id: "equipment", icon: "📏", title: "Equipment & Devices", matches: /equipment|device|distance|rangefinder/i },
  { id: "practice", icon: "👨‍🦯", title: "Practice & Caddies", matches: /practice|cadd/i },
  { id: "shotgun", icon: "🎯", title: "Shotgun Mulligans", matches: /shotgun|mulligan/i },
  { id: "general", icon: "📋", title: "General Competition Rules", matches: /general|competition/i },
];
const categoryTitles = {
  general: "General Competition Rules",
  handicaps: "Handicap Rules",
  handicap: "Handicap Rules",
  scoring: "Scoring Rules",
  practice: "Practice Rules",
  equipment: "Equipment & Distance Devices",
};
const text = (record) => Object.values(record || {}).join(" ").toLowerCase();
const code = (value) => String(value || "").trim().toUpperCase();
const categoryTitle = (value) => categoryTitles[String(value || "").trim().toLowerCase()] || value || "Competition Rules";

function Text({ value }) { return paragraphs(value).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>); }
function Empty({ title }) { return <div className={styles.empty}><span>Tournament Guide</span><h2>{title}</h2><p>Published tournament information will appear here when available.</p></div>; }

function Schedule({ tournament, records, description, rounds, courses, initialNow }) {
  if (!records.length) return <Empty title="Schedule" />;
  return <section className={`${styles.focusedContent} ${styles.scheduleExperience}`}><header><p className={styles.eyebrow}>Tournament Week</p><h1>Schedule</h1><Text value={description} /></header><ScheduleItinerary records={records} tournament={tournament} rounds={rounds} courses={courses} initialNow={initialNow} /></section>;
}

function RuleList({ records }) { return <div className={styles.rules}>{Object.entries(groupBy(records, "Category")).map(([category, rules]) => <section key={category}><h3>{categoryTitle(category)}</h3>{rules.map((rule) => <details className={isTruthy(rule.Important) ? styles.important : ""} key={rule["Rule ID"]} open={isTruthy(rule.Important)}><summary><span>{rule.Subcategory || "Rule"}</span>{rule.Title}</summary><div><Text value={rule.Body} />{rule["Effective Year"] ? <small>Effective {rule["Effective Year"]}</small> : null}</div></details>)}</section>)}</div>; }
function TournamentRuleSummary({ records }) { return <div className={styles.tournamentRuleSummary}>{records.map((rule) => { const format = code(rule.Format); const segments = [rule["Front 9 Used"] ? `Front 9: ${rule["Front 9 Points"]} pt` : "", rule["Back 9 Used"] ? `Back 9: ${rule["Back 9 Points"]} pt` : "", rule["Overall Used"] ? `Overall: ${rule["Overall Points"]} pt` : ""].filter(Boolean); return <article key={`${rule.Year}-${rule.Round}-${format}`}><span>{rule.Round}</span><h3>{getFormatName(format)}</h3>{rule["Points Available"] !== null && rule["Points Available"] !== undefined ? <strong>{rule["Points Available"]} points available</strong> : null}{segments.length ? <p>{segments.join(" • ")}</p> : null}</article>; })}</div>; }
function FormatCard({ format, configuration, rules }) {
  const formatCode = code(format["Format ID"] || format.Format);
  const description = format.Description || configuration?.Description;
  const formatRules = [format.Rules, configuration?.Rules].filter(Boolean);
  const sources = [configuration, format, ...rules].filter(Boolean);
  const points = configuration?.["Points Available"];
  const summary = formatRuleSummary(formatCode, sources, points);
  return <details className={styles.formatCard}><summary><span>{formatCode}</span><div><h3>{format.Name || getFormatName(formatCode)}</h3>{summary.length ? <ul>{summary.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div><b aria-hidden="true">⌄</b></summary><div className={styles.formatDetails}>{description ? <Text value={description} /> : null}{formatRules.map((value, index) => <Text value={value} key={`${formatCode}-${index}`} />)}{rules.length ? <div className={styles.formatRules}>{rules.map((rule) => <div key={rule["Rule ID"]}><b>{rule.Title}</b><Text value={rule.Body} /></div>)}</div> : null}</div></details>;
}

function RuleSection({ id, icon, title, records, children }) {
  if (!records.length && !children) return null;
  return <section className={`${styles.ruleCollection} ${id === "local" ? styles.localRules : ""}`}><h2><span aria-hidden="true">{icon}</span>{title}</h2>{records.length ? <RuleList records={records} /> : null}{children}</section>;
}

function Rules({ ruleBook, tournamentRules, rounds }) {
  const forFormat = (format) => ruleBook.filter((rule) => formatTerms[format].some((term) => text(rule).includes(term)));
  const formatIds = new Set(Object.keys(formatTerms).flatMap((format) => forFormat(format).map((rule) => rule["Rule ID"])));
  const remaining = ruleBook.filter((rule) => !formatIds.has(rule["Rule ID"]));
  const sectionRecords = Object.fromEntries(ruleSections.map((section) => [section.id, []]));
  remaining.forEach((rule) => {
    const searchable = [rule.Category, rule.Subcategory, rule.Title].filter(Boolean).join(" ");
    const section = ruleSections.slice(1).find((candidate) => candidate.matches.test(searchable))
      || ruleSections[0].matches.test(searchable) && ruleSections[0]
      || ruleSections.at(-1);
    sectionRecords[section.id].push(rule);
  });
  const formats = ["BB", "SC", "SI"].map((format) => rounds.find((row) => code(row["Format ID"] || row.Format) === format) || { "Format ID": format, Name: getFormatName(format) });
  return <section className={`${styles.focusedContent} ${styles.rulesExperience}`}><header><p className={styles.eyebrow}>Official Competition</p><h1>Rules & Formats</h1><p>Official tournament rules and the format for every round, combined from the existing workbook.</p></header><section className={styles.formatCollection}><header><h2><span aria-hidden="true">⛳</span>Round Formats</h2><p>Best Ball, Scramble & Singles</p></header><div>{formats.map((format) => { const formatCode = code(format["Format ID"] || format.Format); return <FormatCard format={format} configuration={tournamentRules.find((rule) => code(rule.Format) === formatCode)} rules={forFormat(formatCode)} key={formatCode} />; })}</div></section>{ruleSections.map((section) => <RuleSection {...section} records={sectionRecords[section.id]} key={section.id}>{section.id === "tournament" ? (tournamentRules.length ? <TournamentRuleSummary records={tournamentRules} /> : <p className={styles.supporting}>No tournament-specific scoring rules are configured for this year.</p>) : null}</RuleSection>)}</section>;
}

function Placeholder({ title, detail }) { return <section className={styles.placeholder}><span>Tournament Guide</span><h1>{title}</h1><p>{detail}</p></section>; }

export default async function GuideDetailPage({ section }) {
  const content = await resolveTournamentGuideContent();
  const { tournament, schedule: itinerary, ruleBook } = content;
  const descriptions = Object.fromEntries(content.overview.map((item) => [item["Section Slug"], item.Description]));
  const title = titles[section];
  return <main><Header /><section className={`${styles.hero} ${styles.heroCompact}`}><div><p>Tournament Guide</p><h1>{title}</h1><strong>{tournament.editionTitle || `${tournament.year} Sandbagger Invitational`}</strong><span>{[tournament.Location, tournament.Dates || tournament.Date].filter(Boolean).join(" • ")}</span></div><div className={styles.logoPlate}><div className={styles.logoInner}><AssetImage src={tournamentLogo(tournament.logoFileName)} alt={`${tournament.year} tournament logo`} fallback={String(tournament.year)} className={styles.logo} fallbackClassName={styles.logoFallback} /></div></div></section><div className={styles.shell}><Link className={styles.backToGuide} href="/tournament-guide">‹ Tournament Guide</Link>{section === "schedule" ? <Schedule tournament={content.liveTournament} records={itinerary} description={descriptions.itinerary} rounds={content.liveRounds} courses={content.courses} initialNow={content.timelineNow} /> : null}{section === "rules" ? <Rules ruleBook={ruleBook} tournamentRules={content.tournamentRules} rounds={content.rounds} /> : null}{section === "dining" ? <Placeholder title="Dining" detail="Tournament dining information will be available here once its shared content structure is finalized." /> : null}{section === "getting-around" ? <Placeholder title="Getting Around" detail="Tournament transportation and arrival information will be available here once its shared content structure is finalized." /> : null}{section === "contacts" ? <Placeholder title="Important Contacts" detail="Tournament contact information will be available here once its shared content structure is finalized." /> : null}</div><Footer /></main>;
}
