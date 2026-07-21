import { Header, Footer } from "../components";
import styles from "../historical.module.css";

export const metadata = {
  title: "Tournament Rules | The Sandbagger Invitational",
  description:
    "Official rules, scoring procedures, formats, eligibility requirements, and policies for the Sandbagger Invitational.",
};

export default function RulesPage() {
  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Tournament Information</p>
        <h1>Tournament Rules</h1>
        <p>
          The official Sandbagger Invitational rules, scoring procedures,
          competition formats, eligibility requirements, and tournament policies
          will be published here.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.roundArchiveEmpty}>
          The complete tournament rules are coming soon.
        </div>
      </section>

      <Footer />
    </main>
  );
}
