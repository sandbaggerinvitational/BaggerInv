import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components";
import AssetImage from "../../../../AssetImage";
import {
  courseLogo,
  teamLogo,
  tournamentHero,
} from "../../../../../lib/asset-paths";
import {
  getFormatName,
  getHistoricalRound,
} from "../../../../../lib/stats";
import styles from "../../../../historical.module.css";

function displayPoints(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? value : Number(value).toFixed(1);
}

function winnerClass(winner, teamOne, teamTwo) {
  if (winner === teamOne) return styles.roundTeamOneWinner;
  if (winner === teamTwo) return styles.roundTeamTwoWinner;
  if (winner === "Halved") return styles.roundHalved;
  return styles.roundNotRecorded;
}

function visibleSegments(match) {
  const front = match.segments.find((segment) => segment.label === "Front 9");
  const back = match.segments.find((segment) => segment.label === "Back 9");
  const overall = match.segments.find((segment) => segment.label === "18-Hole");

  const frontMissing = !front || front.winner === "Not recorded";
  const backMissing = !back || back.winner === "Not recorded";

  return frontMissing && backMissing && overall
    ? [{ ...overall, label: "Overall" }]
    : match.segments;
}

export async function generateMetadata({ params }) {
  const { year, round } = await params;
  const archive = getHistoricalRound(year, round);

  return {
    title: archive
      ? `${archive.year} Round ${archive.round} | The Sandbagger Invitational`
      : "Historical Round | The Sandbagger Invitational",
  };
}

export default async function HistoricalRoundPage({ params }) {
  const { year, round } = await params;
  const archive = getHistoricalRound(year, round);
  if (!archive) notFound();

  return (
    <main>
      <Header />

      <section className={styles.roundArchiveHero}>
        <AssetImage
          src={tournamentHero(archive.tournament["Hero Image"])}
          alt={`${archive.year} ${archive.tournament.Destination}`}
          className={styles.roundArchiveHeroImage}
          fallbackClassName={styles.roundArchiveHeroFallback}
          fallback={archive.tournament.Destination}
          loading="eager"
        />
        <div className={styles.roundArchiveHeroShade} />

        <div className={styles.roundArchiveHeroContent}>
          <div className={styles.roundArchiveCourseLogo}>
            <AssetImage
              src={courseLogo(archive.course["Course Logo"])}
              alt={`${archive.course.Course} logo`}
              className={styles.roundArchiveCourseLogoImage}
              fallbackClassName={styles.roundArchiveCourseLogoFallback}
              fallback="⛳"
            />
          </div>

          <div>
            <p>
              {archive.year} · Round {archive.round}
            </p>
            <h1>{archive.course.Course}</h1>
            <h2>{getFormatName(archive.format)}</h2>
            <span>
              {archive.course.City}, {archive.course.State}
            </span>
          </div>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.roundArchiveScoreboard}>
          <div className={styles.roundArchiveTeam}>
            <AssetImage
              src={teamLogo(archive.teamOne.logo)}
              alt={`${archive.teamOne.name} logo`}
              className={styles.roundArchiveTeamLogo}
              fallbackClassName={styles.roundArchiveTeamLogoFallback}
              fallback={archive.teamOne.name.slice(0, 2).toUpperCase()}
            />
            <span>Team One</span>
            <strong>{archive.teamOne.name}</strong>
            <b>{displayPoints(archive.teamOne.points)}</b>
          </div>

          <div className={styles.roundArchiveWinner}>
            <span>Round Winner</span>
            <strong>{archive.roundWinner}</strong>
          </div>

          <div className={styles.roundArchiveTeam}>
            <AssetImage
              src={teamLogo(archive.teamTwo.logo)}
              alt={`${archive.teamTwo.name} logo`}
              className={styles.roundArchiveTeamLogo}
              fallbackClassName={styles.roundArchiveTeamLogoFallback}
              fallback={archive.teamTwo.name.slice(0, 2).toUpperCase()}
            />
            <span>Team Two</span>
            <strong>{archive.teamTwo.name}</strong>
            <b>{displayPoints(archive.teamTwo.points)}</b>
          </div>
        </div>

        {!archive.matches.length ? (
          <div className={styles.roundArchiveEmpty}>
            No matchups have been recorded for this round.
          </div>
        ) : (
          <div className={styles.roundMatchGrid}>
            {archive.matches.map((match) => (
              <article className={styles.roundMatchCard} key={match.id}>
                <header className={styles.roundMatchHeader}>
                  <span>
                    Round {archive.round} · Match {match.matchNumber}
                  </span>
                  <b>{match.status}</b>
                </header>

                <div className={styles.roundMatchPlayers}>
                  <div>
                    <span>{match.teamOne.name}</span>
                    {match.teamOne.players.map((player) => (
                      <Link
                        href={`/players/${player.slug}`}
                        key={player.id}
                      >
                        {player.name}
                      </Link>
                    ))}
                  </div>

                  <strong>VS</strong>

                  <div>
                    <span>{match.teamTwo.name}</span>
                    {match.teamTwo.players.map((player) => (
                      <Link
                        href={`/players/${player.slug}`}
                        key={player.id}
                      >
                        {player.name}
                      </Link>
                    ))}
                  </div>
                </div>

                <div
                  className={`${styles.roundSegmentResults} ${
                    visibleSegments(match).length === 1
                      ? styles.roundSegmentResultsSingle
                      : ""
                  }`}
                >
                  {visibleSegments(match).map((segment) => (
                    <div key={segment.label}>
                      <span>{segment.label}</span>
                      <strong
                        className={winnerClass(
                          segment.winner,
                          match.teamOne.name,
                          match.teamTwo.name
                        )}
                      >
                        {segment.winner}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className={styles.roundMatchPoints}>
                  <div>
                    <span>{match.teamOne.name}</span>
                    <strong>{displayPoints(match.teamOne.points)}</strong>
                  </div>
                  <div>
                    <span>Match Points</span>
                    <b
                      className={winnerClass(
                        match.winner,
                        match.teamOne.name,
                        match.teamTwo.name
                      )}
                    >
                      {match.winner}
                    </b>
                  </div>
                  <div>
                    <span>{match.teamTwo.name}</span>
                    <strong>{displayPoints(match.teamTwo.points)}</strong>
                  </div>
                </div>

                {match.notes ? (
                  <p className={styles.roundMatchNotes}>{match.notes}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}

        <nav className={styles.roundArchiveNavigation}>
          {archive.previousRound ? (
            <Link
              href={`/history/${archive.year}/round/${archive.previousRound}`}
            >
              ← Round {archive.previousRound}
            </Link>
          ) : (
            <span />
          )}

          <Link href={`/history/${archive.year}`}>
            Back to {archive.year}
          </Link>

          {archive.nextRound ? (
            <Link
              href={`/history/${archive.year}/round/${archive.nextRound}`}
            >
              Round {archive.nextRound} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </section>

      <Footer />
    </main>
  );
}
