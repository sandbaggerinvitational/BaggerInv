import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import {
  formatHandicap,
  getTournament,
} from "../../../lib/stats";
import styles from "../../historical.module.css";

export async function generateMetadata({ params }) {
  const { year } = await params;
  return {
    title: `${year} | The Sandbagger Invitational`,
  };
}

export default async function TournamentYearPage({ params }) {
  const { year } = await params;
  const tournament = getTournament(year);
  if (!tournament) notFound();

  return (
    <main>
      <Header />

      <section className={styles.tournamentHero}>
        <div>
          <p>{tournament.Annual} Annual</p>
          <h1>{tournament.year}</h1>
          <h2>{tournament.Destination}</h2>
          <span>{tournament.Dates}</span>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.finalScoreCard}>
          <div>
            <span>Champions</span>
            <strong>
              {tournament["Winning Team"] || "To Be Determined"}
            </strong>
          </div>
          <b>{tournament["Final Score"] || "2026"}</b>
          <div>
            <span>Runner-Up</span>
            <strong>{tournament["Runner-Up Team"] || "To Be Determined"}</strong>
          </div>
        </div>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>The Teams</span>
          <h2>Rosters</h2>

          <div className={styles.teamSeasonGrid}>
            {tournament.teams.map((team) => (
              <Link
                className={styles.teamSeasonCard}
                href={`/history/${tournament.year}/team/${encodeURIComponent(
                  team.side
                )}`}
                key={team.side}
              >
                <span>{team.side}</span>
                <h3>{team.name}</h3>
                <p>
                  Captain: {team.captain?.["Display Name"] || "TBA"}
                </p>
                <strong>
                  Avg. Handicap: {formatHandicap(team.averageHandicap)}
                </strong>
                <em>View full roster →</em>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>The Destination</span>
          <h2>Courses Played</h2>

          <div className={styles.courseCardGrid}>
            {tournament.courses.map((course) => (
              <Link
                className={styles.courseCard}
                href={`/courses/${course["Course ID"]}`}
                key={`${course["Course ID"]}-${course.Round}`}
              >
                <div className={styles.courseLogoPlaceholder}>⛳</div>
                <span>{course.Round}</span>
                <h3>{course.Course}</h3>
                <p>
                  {course.City}, {course.State}
                </p>
                <strong>
                  {course["Course ID"] === tournament["Championship Course"]
                    ? "Championship Course"
                    : course.Format}
                </strong>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Tournament Honors</span>
          <h2>Awards</h2>

          <div className={styles.awardGrid}>
            {tournament.awards.length ? (
              tournament.awards.map((award) => (
                <div className={styles.awardCard} key={award.Award}>
                  <span>{award.Award}</span>
                  <strong>
                    {award.winnerPlayer?.["Display Name"] || award.Winner}
                  </strong>
                </div>
              ))
            ) : (
              <div className={styles.awardCard}>
                <span>Sandbagger of the Year</span>
                <strong>To Be Determined</strong>
              </div>
            )}
          </div>
        </section>
      </section>

      <Footer />
    </main>
  );
}
