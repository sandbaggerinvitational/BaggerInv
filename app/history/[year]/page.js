import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import { getPlayerMap, getTournament } from "../../../lib/stats";
import styles from "../../historical.module.css";

export async function generateMetadata({ params }) {
  const { year } = await params;
  return {
    title: `${year} Tournament | Sandbagger Invitational`,
  };
}

export default async function TournamentYearPage({ params }) {
  const { year } = await params;
  const tournament = getTournament(year);

  if (!tournament) notFound();

  const players = getPlayerMap();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>{tournament.Location}</p>
        <h1>{tournament.year}</h1>
        <p>
          {tournament["Winning Team"]
            ? `${tournament["Winning Team"]} captured the Sandbagger Invitational.`
            : "The next chapter of the Sandbagger Invitational."}
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.tournamentGrid}>
          <div className={styles.detailCard}>
            <h2>Tournament Result</h2>
            <div className={styles.detailList}>
              <div>
                <span>Winning Team</span>
                <strong>{tournament["Winning Team"] || "TBA"}</strong>
              </div>
              <div>
                <span>Losing Team</span>
                <strong>{tournament["Losing Team"] || "TBA"}</strong>
              </div>
              <div>
                <span>Final Score</span>
                <strong>{tournament["Final Score"] || "TBA"}</strong>
              </div>
              <div>
                <span>Winning Captain</span>
                <strong>
                  {players[tournament["Winning Captain"]]?.["Display Name"] || "TBA"}
                </strong>
              </div>
            </div>
          </div>

          <div className={styles.detailCard}>
            <h2>Courses</h2>
            <div className={styles.detailList}>
              {tournament.courses.map((course) => (
                <div key={`${course.Year}-${course.Round}`}>
                  <span>{course.Round}</span>
                  <strong>{course.Course}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.detailCard}>
            <h2>Competing Teams</h2>
            <div className={styles.teamMatchup}>
              <strong>{tournament.teams?.["Team 1"] || "TBA"}</strong>
              <span>vs.</span>
              <strong>{tournament.teams?.["Team 2"] || "TBA"}</strong>
            </div>
          </div>

          <div className={styles.detailCard}>
            <h2>Awards</h2>
            <div className={styles.detailList}>
              {tournament.awards.length ? (
                tournament.awards.map((award) => (
                  <div key={`${award.Year}-${award.Award}`}>
                    <span>{award.Award}</span>
                    <strong>
                      {players[award.Winner]?.["Display Name"] || award.Winner}
                    </strong>
                  </div>
                ))
              ) : (
                <div>
                  <span>Awards</span>
                  <strong>TBA</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
