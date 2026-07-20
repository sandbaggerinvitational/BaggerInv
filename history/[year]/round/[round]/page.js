export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components";
import AssetImage from "../../../../AssetImage";
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

function displayPoints(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? value : Number(value).toFixed(1);
}

function strokeLabel(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const strokes = Number(value);
  if (!Number.isFinite(strokes)) return null;

  return `${strokes} ${strokes === 1 ? "stroke" : "strokes"}`;
}


function handicapLabel(value) {
  if (value === null || value === undefined || value === "") return null;
  const handicap = Number(value);
  if (!Number.isFinite(handicap)) return null;
  return `(${Number.isInteger(handicap) ? handicap : handicap.toFixed(1)})`;
}

function playerHandicap(match, team, index) {
  if (match.format === "SC") return null;
  if (match.format === "SI" && index > 0) return null;
  return handicapLabel(team.playerHandicaps?.[index]);
}

function teamHandicap(match, team) {
  return match.format === "SC" ? handicapLabel(team.teamHandicap) : null;
}

function playerStroke(match, team, index) {
  if (match.format === "SC") return null;

  if (match.format === "SI" && index > 0) return null;

  return strokeLabel(team.playerStrokes?.[index]);
}

function teamStroke(match, team) {
  return match.format === "SC"
    ? strokeLabel(team.teamStrokes)
    : null;
}

function MatchTrophy() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M20 8h24v8c0 10-4.8 18.2-12 21.2C24.8 34.2 20 26 20 16V8Z"
        fill="currentColor"
      />
      <path
        d="M20 14H10v5c0 9 5.2 15 14 16M44 14h10v5c0 9-5.2 15-14 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M32 37v10M22 55h20M26 47h12v8H26z"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
                    {match.teamOne.players.map((player, index) => (
                      <div
                        className={styles.roundMatchPlayerEntry}
                        key={player.id}
                      >
                        <div className={styles.roundMatchPlayerName}>
                          <Link href={`/players/${player.slug}`}>
                            {player.name}
                          </Link>
                          {playerHandicap(match, match.teamOne, index) ? (
                            <small className={styles.roundMatchHandicap}>
                              {playerHandicap(match, match.teamOne, index)}
                            </small>
                          ) : null}
                        </div>
                        {playerStroke(match, match.teamOne, index) ? (
                          <small className={styles.roundMatchStroke}>
                            {playerStroke(match, match.teamOne, index)}
                          </small>
                        ) : null}
                      </div>
                    ))}
                    {teamHandicap(match, match.teamOne) ? (
                      <small className={styles.roundMatchTeamHandicap}>
                        Team Handicap {teamHandicap(match, match.teamOne)}
                      </small>
                    ) : null}
                    {teamStroke(match, match.teamOne) ? (
                      <small className={styles.roundMatchTeamStroke}>
                        {teamStroke(match, match.teamOne)}
                      </small>
                    ) : null}
                  </div>

                  <strong>VS</strong>

                  <div>
                    <span>{match.teamTwo.name}</span>
                    {match.teamTwo.players.map((player, index) => (
                      <div
                        className={styles.roundMatchPlayerEntry}
                        key={player.id}
                      >
                        <div className={styles.roundMatchPlayerName}>
                          <Link href={`/players/${player.slug}`}>
                            {player.name}
                          </Link>
                          {playerHandicap(match, match.teamTwo, index) ? (
                            <small className={styles.roundMatchHandicap}>
                              {playerHandicap(match, match.teamTwo, index)}
                            </small>
                          ) : null}
                        </div>
                        {playerStroke(match, match.teamTwo, index) ? (
                          <small className={styles.roundMatchStroke}>
                            {playerStroke(match, match.teamTwo, index)}
                          </small>
                        ) : null}
                      </div>
                    ))}
                    {teamHandicap(match, match.teamTwo) ? (
                      <small className={styles.roundMatchTeamHandicap}>
                        Team Handicap {teamHandicap(match, match.teamTwo)}
                      </small>
                    ) : null}
                    {teamStroke(match, match.teamTwo) ? (
                      <small className={styles.roundMatchTeamStroke}>
                        {teamStroke(match, match.teamTwo)}
                      </small>
                    ) : null}
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

                <div className={styles.roundMatchResult}>
                  <span className={styles.roundMatchResultLabel}>
                    Match Result
                  </span>

                  <div
                    className={`${styles.roundMatchWinnerBanner} ${winnerClass(
                      match.winner,
                      match.teamOne.name,
                      match.teamTwo.name
                    )}`}
                  >
                    {match.winner !== "Halved" &&
                    match.winner !== "Not recorded" ? (
                      <MatchTrophy />
                    ) : null}
                    <strong>
                      {match.winner === "Halved"
                        ? "Match Halved"
                        : match.winner}
                    </strong>
                  </div>

                  <div className={styles.roundMatchScoreTable}>
                    <div
                      className={`${styles.roundMatchScoreRow} ${
                        match.winner === match.teamOne.name
                          ? styles.roundMatchScoreWinner
                          : ""
                      }`}
                    >
                      <span>{match.teamOne.name}</span>
                      <strong>
                        {displayPoints(match.teamOne.points)}
                      </strong>
                    </div>

                    <div
                      className={`${styles.roundMatchScoreRow} ${
                        match.winner === match.teamTwo.name
                          ? styles.roundMatchScoreWinner
                          : ""
                      }`}
                    >
                      <span>{match.teamTwo.name}</span>
                      <strong>
                        {displayPoints(match.teamTwo.points)}
                      </strong>
                    </div>
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
