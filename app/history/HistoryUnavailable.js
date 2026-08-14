import Link from "next/link";
import { Header, Footer } from "../components";
import styles from "../historical.module.css";

export function HistoryUnavailableNotice({ year = "2026" }) {
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
      <Footer />
    </main>
  );
}
