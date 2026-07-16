import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import AssetImage from "../../AssetImage";
import {
  courseLogo,
  teamLogo,
  tournamentHero,
} from "../../../lib/asset-paths";
import {
  formatHandicap,
  getAdjacentTournamentYears,
  getFormatName,
  getTournament,
  getTournamentRoundPoints,
} from "../../../lib/stats";
import styles from "../../historical.module.css";

export async function generateMetadata({ params }) {
  const { year } = await params;
  return {
    title: `${year} | The Sandbagger Invitational`,
  };
}

function roundNumber(value) {
  return Number(String(value ?? "").replace(/\D/g, ""));
}

function pointsForRound(roundPoints, round) {
  return roundPoints.find((item) => item.round === round)?.pointsAvailable ?? null;
}

function tournamentStatus(tournament) {
  const hasWinner = Boolean(tournament["Winning Team"]);
  const hasRunnerUp = Boolean(tournament["Runner-Up Team"]);
  const hasScore = Boolean(tournament["Final Score"]);

  return hasWinner || hasRunnerUp || hasScore
    ? tournament["Final Score"] || "Final"
    : "Upcoming";
}

function tournamentIsComplete(tournament) {
  return Boolean(
    tournament["Winning Team"] ||
      tournament["Runner-Up Team"] ||
      tournament["Final Score"]
  );
}

export default async function TournamentYearPage({ params }) {
  const { year } = await params;
  const tournament = getTournament(year);
  if (!tournament) notFound();

  const roundPoints = getTournamentRoundPoints(year);
  const { previousYear, nextYear } =
    getAdjacentTournamentYears(year);

  return (
    <main>
      <Header />

      <section className={styles.tournamentHero}>
        <AssetImage
          src={tournamentHero(tournament["Hero Image"])}
          alt={`${tournament.year} ${tournament.Destination}`}
          className={styles.tournamentHeroImage}
          fallbackClassName={styles.tournamentHeroFallback}
          fallback={tournament.Destination}
          loading="eager"
        />
        <div className={styles.tournamentHeroOverlay} />

        <div className={styles.tournamentHeroContent}>
          <p>{tournament.Annual} Annual</p>
          <h1>{tournament.year}</h1>
          <h2>{tournament.Destination}</h2>
          <span>{tournament.Dates}</span>
        </div>
      </section>

      <nav className={styles.tournamentYearNavigation}>
        {previousYear ? (
          <Link href={`/history/${previousYear}`}>
            <span>← Previous Year</span>
            <strong>{previousYear}</strong>
          </Link>
        ) : (
          <span />
        )}

        <Link
          className={styles.tournamentHistoryHome}
          href="/history"
        >
          All Tournament Years
        </Link>

        {nextYear ? (
          <Link href={`/history/${nextYear}`}>
            <span>Next Year →</span>
            <strong>{nextYear}</strong>
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <section className={styles.content}>
        <div className={styles.finalScoreCard}>
          <div>
            <span>Champions</span>
            <strong>
              {tournament["Winning Team"] || "To Be Determined"}
            </strong>
          </div>
          <div className={styles.finalScoreCenter}>
            {tournamentIsComplete(tournament) ? (
              <span>Final</span>
            ) : null}
            <b>{tournamentStatus(tournament)}</b>
          </div>
          <div>
            <span>Runner-Up</span>
            <strong>
              {tournament["Runner-Up Team"] || "To Be Determined"}
            </strong>
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
                <AssetImage
                  src={teamLogo(team.logo)}
                  alt={`${team.name} logo`}
                  className={styles.teamCardLogo}
                  fallbackClassName={styles.teamCardLogoFallback}
                  fallback={team.name.slice(0, 2).toUpperCase()}
                />

                <div>
                  <h3>{team.name}</h3>
                  <p>
                    Captain: {team.captain?.["Display Name"] || "TBA"}
                  </p>
                  <strong>
                    Avg. Handicap: {formatHandicap(team.averageHandicap)}
                  </strong>
                  <em>View full roster →</em>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>The Destination</span>
          <h2>Courses Played</h2>

          <div className={styles.courseCardGrid}>
            {tournament.courses.map((course) => {
              const round = roundNumber(course.Round);

              return (
                <article
                  className={`${styles.courseCard} ${styles.courseRoundCard}`}
                  key={`${course["Course ID"]}-${course.Round}`}
                >
                  <Link
                    className={styles.courseRoundPrimary}
                    href={`/history/${tournament.year}/round/${round}`}
                  >
                    <AssetImage
                      src={courseLogo(course["Course Logo"])}
                      alt={`${course.Course} logo`}
                      className={styles.courseLogo}
                      fallbackClassName={styles.courseLogoPlaceholder}
                      fallback="⛳"
                    />
                    <span>{course.Round}</span>
                    <h3>{course.Course}</h3>
                    <p>
                      {course.City}, {course.State}
                    </p>
                    <strong>{getFormatName(course.Format)}</strong>
                    {pointsForRound(roundPoints, round) !== null ? (
                      <small className={styles.courseRoundPoints}>
                        {pointsForRound(roundPoints, round)} Points Available
                      </small>
                    ) : null}
                    <b>View Round Results →</b>
                  </Link>

                  <Link
                    className={styles.courseProfileLink}
                    href={`/courses/${course["Course ID"]}`}
                  >
                    View Course Profile
                  </Link>
                </article>
              );
            })}
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
                <strong>Not awarded</strong>
              </div>
            )}
          </div>
        </section>
      </section>

      <nav
        className={`${styles.tournamentYearNavigation} ${styles.tournamentYearNavigationBottom}`}
      >
        {previousYear ? (
          <Link href={`/history/${previousYear}`}>
            <span>← Previous Year</span>
            <strong>{previousYear}</strong>
          </Link>
        ) : (
          <span />
        )}

        <Link
          className={styles.tournamentHistoryHome}
          href="/history"
        >
          All Tournament Years
        </Link>

        {nextYear ? (
          <Link href={`/history/${nextYear}`}>
            <span>Next Year →</span>
            <strong>{nextYear}</strong>
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <Footer />
    </main>
  );
}
