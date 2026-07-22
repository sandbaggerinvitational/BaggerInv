export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import AssetImage from "../../AssetImage";
import TeamLogoPlate from "../../TeamLogoPlate";
import {
  courseLogo,
  tournamentHero,
  tournamentLogo,
} from "../../../lib/asset-paths";
import {
  formatHandicap,
  getAdjacentTournamentYears,
  getFormatName,
  getTournament,
  getTournamentPlayerLeaderboard,
  getTournamentRoundPoints,
} from "../../../lib/stats";
import { addTournamentRanks } from "../../../lib/rankings";
import styles from "../../historical.module.css";
import { formatPoints } from "../../../lib/formatters";
import TournamentLeaderboard from "../../TournamentLeaderboard";

export async function generateMetadata({ params }) {
  await refreshHistoricalData();
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
  const score = String(tournament["Final Score"] ?? "").trim();
  const winner = tournament.championTeamId;
  const runnerUp = tournament.runnerUpTeamId;
  const complete = Boolean(score || winner || runnerUp);

  return {
    complete,
    label: complete ? "Final" : "Upcoming",
    score: score || null,
  };
}

export default async function TournamentYearPage({ params }) {
  await refreshHistoricalData();
  const { year } = await params;
  const tournament = getTournament(year);
  if (!tournament) notFound();

  const roundPoints = getTournamentRoundPoints(year);
  const leaderboardRows = getTournamentPlayerLeaderboard(year);
  const pointsTracked = leaderboardRows.some((row) => row.pointsTracked);
  const leaderboard = addTournamentRanks(
    leaderboardRows,
    pointsTracked
      ? "points"
      : (row) => `${row.winPercentage.toFixed(6)}|${row.wins}|${row.losses}|${row.halves}`
  );
  const { previousYear, nextYear } =
    getAdjacentTournamentYears(year);
  const status = tournamentStatus(tournament);

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
          {tournament.logoFileName ? (
            <AssetImage
              src={tournamentLogo(tournament.logoFileName)}
              alt={`${tournament.year} Sandbagger Invitational tournament logo`}
              className={styles.tournamentEditionLogo}
              fallbackClassName={styles.tournamentEditionLogoFallback}
              fallback=""
              loading="eager"
            />
          ) : null}
          <p>{tournament.editionTitle}</p>
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
              {tournament.championTeam?.name || "To Be Determined"}
            </strong>
          </div>
          <div className={styles.finalScoreCenter}>
            <span>{status.label}</span>
            {status.score ? <b>{status.score}</b> : null}
          </div>
          <div>
            <span>Runner-Up</span>
            <strong>
              {tournament.runnerUpTeam?.name || "To Be Determined"}
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
                <TeamLogoPlate
                  filename={team.logo}
                  teamName={team.name}
                  variant="card"
                />

                <div>
                  <h3>{team.name}</h3>
                  <p>
                    Captain: {team.captain?.["Display Name"] || "TBA"}
                  </p>
                  <strong>
                    Avg. Team Handicap: {formatHandicap(team.averageHandicap)}
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
              const availablePoints = pointsForRound(roundPoints, round);

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
                    <small
                      className={styles.courseRoundPoints}
                      data-empty={availablePoints === null}
                      aria-hidden={availablePoints === null ? "true" : undefined}
                    >
                      {availablePoints !== null
                        ? `${availablePoints} Points Available`
                        : "\u00a0"}
                    </small>
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
          <span className={styles.sectionLabel}>Player Standings</span>
          <h2>{tournament.year} Leaderboard</h2>

          <TournamentLeaderboard rows={leaderboard} pointsTracked={pointsTracked} emptyMessage="No completed matches have been recorded for this tournament yet." />
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
