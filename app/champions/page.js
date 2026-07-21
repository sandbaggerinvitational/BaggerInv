export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header, Footer } from "../components";
import TeamLogoPlate from "../TeamLogoPlate";
import { getTournaments, refreshHistoricalData } from "../../lib/stats";
import styles from "../historical.module.css";

export const metadata = {
  title: "Champions | The Sandbagger Invitational",
  description: "Every team to win the Sandbagger Invitational.",
};

function displayScore(value) {
  return String(value || "Score not recorded").replace(/\s+-\s+/g, " – ");
}

function editionRibbon(value) {
  const edition = String(value || "").trim();
  if (!edition) return "";
  return /annual/i.test(edition) ? edition : `${edition} Annual`;
}

export default async function ChampionsPage() {
  await refreshHistoricalData();
  const champions = getTournaments().filter(
    (tournament) => tournament.championTeamId
  );

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>The Honor Roll</p>
        <h1>Champions</h1>
        <p>
          Every team that lifted the Cup, with its captain, final score, and
          championship roster preserved by tournament year.
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.championGrid}>
          {champions.map((tournament) => (
            <article className={styles.championCard} key={tournament.id}>
              {tournament.editionTitle ? (
                <span className={styles.championEditionRibbon}>{editionRibbon(tournament.editionTitle)}</span>
              ) : null}
              <div className={styles.championCardHeading}>
                <strong>{tournament.year}</strong>
                <span>{tournament.Destination}</span>
              </div>
              <TeamLogoPlate
                filename={tournament.championTeam.logo}
                teamName={tournament.championTeam.name}
                variant="card"
              />
              <div className={styles.championCardCopy}>
                <h2>{tournament.championTeam.name}</h2>
                <strong>{displayScore(tournament["Final Score"])}</strong>
                {tournament.championTeam.captain ? (
                  <p>
                    Captain: {tournament.championTeam.captain["Display Name"]}
                  </p>
                ) : null}
                <Link href={`/champions/${tournament.year}`}>
                  View {tournament.year} Championship →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
