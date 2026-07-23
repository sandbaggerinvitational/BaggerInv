export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../../../lib/stats";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components";
import AssetImage from "../../../../AssetImage";
import PublicMatchCard from "../../../../PublicMatchCard";
import TeamLogoPlate from "../../../../TeamLogoPlate";
import {
  courseHero,
  courseLogo,
} from "../../../../../lib/asset-paths";
import {
  getFormatName,
  getHistoricalRound,
} from "../../../../../lib/stats";
import styles from "../../../../historical.module.css";
import { formatPoints } from "../../../../../lib/formatters";
import RoundNavigation from "./RoundNavigation";

function displayPoints(value) {
  return formatPoints(value);
}

export async function generateMetadata({ params }) {
  await refreshHistoricalData();
  const { year, round } = await params;
  const archive = getHistoricalRound(year, round);

  return {
    title: archive
      ? `${archive.year} Round ${archive.round} | The Sandbagger Invitational`
      : "Historical Round | The Sandbagger Invitational",
  };
}

export default async function HistoricalRoundPage({ params }) {
  await refreshHistoricalData();
  const { year, round } = await params;
  const archive = getHistoricalRound(year, round);
  if (!archive) notFound();

  return (
    <main>
      <Header />

      <section className={styles.roundArchiveHero}>
        <AssetImage
          src={courseHero(archive.course["Course Profile Image"])}
          alt={`${archive.course.Course} course`}
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
        <RoundNavigation
          year={archive.year}
          previousRound={archive.previousRound}
          nextRound={archive.nextRound}
          position="top"
        />

        <div className={styles.roundArchiveScoreboard}>
          <div className={styles.roundArchiveTeam}>
            <TeamLogoPlate
              filename={archive.teamOne.logo}
              teamName={archive.teamOne.name}
              variant="scoreboard"
            />
            <strong>{archive.teamOne.name}</strong>
            <b>{displayPoints(archive.teamOne.points)}</b>
          </div>

          <div className={styles.roundArchiveWinner}>
            <span>Round Winner</span>
            <strong>{archive.roundWinner}</strong>
          </div>

          <div className={styles.roundArchiveTeam}>
            <TeamLogoPlate
              filename={archive.teamTwo.logo}
              teamName={archive.teamTwo.name}
              variant="scoreboard"
            />
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
              <PublicMatchCard
                key={match.id}
                match={match}
                round={{ label: `Round ${archive.round}` }}
                tournament={archive}
                variant="historical"
              />
            ))}
          </div>
        )}

        <RoundNavigation
          year={archive.year}
          previousRound={archive.previousRound}
          nextRound={archive.nextRound}
        />
      </section>

      <Footer />
    </main>
  );
}
