export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header, Footer } from "../components";
import TeamLogoPlate from "../TeamLogoPlate";
import { getTournaments, refreshHistoricalData } from "../../lib/stats";
import styles from "../historical.module.css";
import { pageMetadata } from "../../lib/seo";
import {
  isSupabaseCompletedHistoryYear,
  loadCompletedHistoryYears,
} from "../../lib/completed-history-service";
import { HistoryUnavailableNotice } from "../history/HistoryUnavailable";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";

export const metadata = pageMetadata({
  title: "Champions | The Sandbagger Invitational",
  description: "Every team to win the Sandbagger Invitational.",
  path: "/champions",
});

function displayScore(value) {
  return String(value || "Score not recorded").replace(/\s+-\s+/g, " – ");
}

function editionRibbon(value) {
  const edition = String(value || "").trim();
  if (!edition) return "";
  const annualLabel = edition.match(/\b\d+(?:st|nd|rd|th)\s+annual\b/i)?.[0];
  return annualLabel || `${edition} Annual`;
}

export default async function ChampionsPage() {
  const env = await applicationPageEnvironment();
  const useSupabaseCompleted = isSupabaseCompletedHistoryYear(2017, env);
  let unavailable = false;
  let champions;
  if (useSupabaseCompleted) {
    champions = await loadCompletedHistoryYears({ env })
      .then((result) => result.tournaments.filter((tournament) => tournament.championTeam))
      .catch(() => {
        unavailable = true;
        return [];
      });
  } else {
    await refreshHistoricalData();
    champions = getTournaments().filter((tournament) => tournament.championTeam);
  }

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
        {unavailable ? <HistoryUnavailableNotice year="2017–2025" /> : null}
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
