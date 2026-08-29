import Link from "next/link";
import { Header, Footer } from "../components";
import styles from "../historical.module.css";
import { ErrorState } from "../ui/StatePrimitives";

export function HistoryUnavailableNotice({ year = "2026", participantPresentation = false }) {
  if (String(year) === "2026" && participantPresentation) return <ErrorState kind="inline" headingLevel={2} eyebrow="2026 Tournament Archive" title="History is temporarily unavailable." message="Check your connection and try again shortly." />;
  return (
    <div className={styles.roundArchiveEmpty} role="status">
      {year} History is temporarily unavailable. Please try again shortly.
    </div>
  );
}

export default function HistoryUnavailablePage({
  year = "2026",
  section = "History",
  participantPresentation = false,
}) {
  const historyHref = participantPresentation ? "/app/history" : "/history";
  if (String(year) === "2026" && participantPresentation) return <main><ErrorState eyebrow="2026 Tournament Archive" title={`${section} is temporarily unavailable.`} message="Check your connection and try again shortly." returnHref={historyHref} returnLabel="Tournament History" /></main>;
  return (
    <main>
      {participantPresentation ? null : <Header />}
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>{year} Tournament Archive</p>
        <h1>{section} is temporarily unavailable</h1>
        <p>
          The {year} archive could not be loaded. Please try again shortly.
        </p>
        <Link href={historyHref}>Return to Tournament History</Link>
      </section>
      {participantPresentation ? null : <Footer />}
    </main>
  );
}
