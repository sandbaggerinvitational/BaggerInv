import Link from "next/link";
import { Header, Footer } from "../components";
import styles from "../historical.module.css";
import { ErrorState } from "../ui/StatePrimitives";

export function HistoryUnavailableNotice({ year = "2026" }) {
  if (String(year) === "2026") return <ErrorState kind="inline" headingLevel={2} eyebrow="2026 Tournament Archive" title="History is temporarily unavailable." message="Check your connection and try again shortly." />;
  return (
    <div className={styles.roundArchiveEmpty} role="status">
      {year} History is temporarily unavailable. Please try again shortly.
    </div>
  );
}

export default function HistoryUnavailablePage({
  year = "2026",
  section = "History",
}) {
  if (String(year) === "2026") return <main><Header /><ErrorState eyebrow="2026 Tournament Archive" title={`${section} is temporarily unavailable.`} message="Check your connection and try again shortly." returnHref="/history" returnLabel="Tournament History" /><Footer variant="app" /></main>;
  return (
    <main>
      <Header />
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>{year} Tournament Archive</p>
        <h1>{section} is temporarily unavailable</h1>
        <p>
          The {year} archive could not be loaded. Please try again shortly.
        </p>
        <Link href="/history">Return to Tournament History</Link>
      </section>
      <Footer variant="app" />
    </main>
  );
}
