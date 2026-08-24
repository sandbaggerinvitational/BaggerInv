export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import ContextBackLink from "../../ContextBackLink";
import TeamLogoPlate from "../../TeamLogoPlate";
import {
  formatHandicap,
  getFormatName,
  getHistoricalRound,
  getTournament,
  getTournamentPlayerLeaderboard,
  refreshHistoricalData,
} from "../../../lib/stats";
import { addTournamentRanks } from "../../../lib/rankings";
import styles from "../../historical.module.css";
import { formatPlayerPoints, formatTeamPoints } from "../../../lib/formatters";
import TournamentLeaderboard from "../../TournamentLeaderboard";
import { pageMetadata } from "../../../lib/seo";
import {
  completedHistoryTournamentPageModel,
  isSupabaseCompletedHistoryYear,
  loadCompletedHistoryView,
} from "../../../lib/completed-history-service";
import HistoryUnavailablePage from "../../history/HistoryUnavailable";
import { applicationPageEnvironment } from "../../../lib/production-shadow-request-environment";

function roundNumber(value) {
  return Number(String(value ?? "").replace(/\D/g, ""));
}

function displayScore(value) {
  return String(value || "Score not recorded").replace(/\s+-\s+/g, " – ");
}

export async function generateMetadata({ params }) {
  const { year } = await params;
  return pageMetadata({
    title: `${year} Champions | The Sandbagger Invitational`,
    description: `The ${year} Sandbagger Invitational champions, winning roster, final score, and path to the Cup.`,
    path: `/champions/${year}`,
  });
}

export default async function ChampionshipDetailPage({ params }) {
  const env = await applicationPageEnvironment();
  const { year } = await params;
  const useSupabaseCompleted = isSupabaseCompletedHistoryYear(year, env);
  let tournament;
  let leaderboardRows;
  let completedRounds = null;
  if (useSupabaseCompleted) {
    try {
      const view = await loadCompletedHistoryView({ year: Number(year), env });
      const model = completedHistoryTournamentPageModel(view);
      tournament = model.tournament;
      leaderboardRows = model.leaderboardRows;
      completedRounds = view.rounds;
    } catch {
      return <HistoryUnavailablePage year={year} section="Championship History" />;
    }
  } else {
    await refreshHistoricalData();
    tournament = getTournament(year);
    leaderboardRows = getTournamentPlayerLeaderboard(year);
  }

  if (!tournament?.championTeam) notFound();

  const champion = tournament.championTeam;
  const opponent = tournament.runnerUpTeam || tournament.teams.find(
    (team) => team.id !== champion.id
  );
  const pointsTracked = leaderboardRows.some((row) => row.pointsTracked);
  const leaderboard = addTournamentRanks(
    leaderboardRows,
    pointsTracked
      ? "points"
      : (row) => `${row.winPercentage.toFixed(6)}|${row.wins}|${row.losses}|${row.halves}`
  );
  const standingsByPlayer = new Map(
    leaderboardRows.map((row) => [row.id, row])
  );
  const rounds = completedRounds || tournament.courses
    .map((course) => {
      const number = roundNumber(course.Round);
      const archive = getHistoricalRound(year, number);
      if (!archive) return null;
      const winningSide = champion.side === "Team 1" ? archive.teamOne : archive.teamTwo;
      const opposingSide = champion.side === "Team 1" ? archive.teamTwo : archive.teamOne;
      return { number, course, archive, winningSide, opposingSide };
    })
    .filter(Boolean);
  const championshipRounds = completedRounds
    ? completedRounds.map((archive) => ({
      number: archive.round,
      course: archive.course,
      archive,
      winningSide: champion.side === "Team 1" ? archive.teamOne : archive.teamTwo,
      opposingSide: champion.side === "Team 1" ? archive.teamTwo : archive.teamOne,
    }))
    : rounds;

  return (
    <main>
      <Header />
      <ContextBackLink
        href="/champions"
        label="Back to All Champions"
      />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Championship Summary</p>
        <h1>{tournament.year} Champions</h1>
        <p>{tournament.Destination} · {tournament.Dates}</p>
      </section>

      <section className={styles.content}>
        <div className={styles.championshipSummary}>
          <div>
            <TeamLogoPlate
              filename={champion.logo}
              teamName={champion.name}
              variant="roster"
              loading="eager"
            />
          </div>
          <div>
            <span>Winning Team</span>
            <h2>{champion.name}</h2>
            <strong>{displayScore(tournament["Final Score"])}</strong>
            <p>
              Defeated {opponent?.name || "the opposing team"}
              {` · Captain ${champion.captain?.["Display Name"] || champion.captainRecordedName || "not recorded"}`}
            </p>
          </div>
        </div>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>The Winning Team</span>
          <h2>Winning Roster</h2>
          <div className={styles.championRoster}>
            {champion.roster.map(({ player, handicap }) => {
              const standing = standingsByPlayer.get(player["Player ID"]);
              return (
                <Link href={`/players/${player.slug}`} key={player["Player ID"]}>
                  <strong>
                    {player["Display Name"]}
                    {champion.captainId === player["Player ID"] ? (
                      <i className={styles.rosterCaptainMarker} title="Captain" aria-label="Team Captain">C</i>
                    ) : null}
                  </strong>
                  <span>Handicap {formatHandicap(handicap)}</span>
                  <span>
                    Record {standing ? `${standing.wins}-${standing.losses}-${standing.halves}` : "—"}
                  </span>
                  {pointsTracked ? <b>{formatPlayerPoints(standing?.points)} pts</b> : null}
                </Link>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>The Path to the Cup</span>
          <h2>Round-by-Round Points</h2>
          <div className={styles.championRounds}>
            {championshipRounds.map(({ number, course, archive, winningSide, opposingSide }) => (
              <Link href={`/history/${year}/round/${number}`} key={number}>
                <div>
                  <span>Round {number} · {getFormatName(course.Format)}</span>
                  <strong>{archive.roundWinner}</strong>
                </div>
                <p><b>{champion.name}</b><strong>{formatTeamPoints(winningSide.points)}</strong></p>
                <p><b>{opponent?.name || opposingSide.name}</b><strong>{formatTeamPoints(opposingSide.points)}</strong></p>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Tournament Standings</span>
          <h2>Individual Tournament Leaders</h2>
          <TournamentLeaderboard rows={leaderboard} pointsTracked={pointsTracked} />
        </section>

        <div className={styles.championDetailLinks}>
          <Link href={`/history/${year}`}>View Full {year} Tournament →</Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
