export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
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

function roundNumber(value) {
  return Number(String(value ?? "").replace(/\D/g, ""));
}

function points(value) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
}

export async function generateMetadata({ params }) {
  const { year } = await params;
  return { title: `${year} Champions | The Sandbagger Invitational` };
}

export default async function ChampionshipDetailPage({ params }) {
  await refreshHistoricalData();
  const { year } = await params;
  const tournament = getTournament(year);

  if (!tournament?.championTeamId) notFound();

  const champion = tournament.championTeam;
  const opponent = tournament.runnerUpTeam || tournament.teams.find(
    (team) => team.id !== champion.id
  );
  const leaderboardRows = getTournamentPlayerLeaderboard(year);
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
  const rounds = tournament.courses
    .map((course) => {
      const number = roundNumber(course.Round);
      const archive = getHistoricalRound(year, number);
      if (!archive) return null;
      const winningSide = champion.side === "Team 1" ? archive.teamOne : archive.teamTwo;
      const opposingSide = champion.side === "Team 1" ? archive.teamTwo : archive.teamOne;
      return { number, course, archive, winningSide, opposingSide };
    })
    .filter(Boolean);

  return (
    <main>
      <Header />

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
            <strong>{tournament["Final Score"] || "Score not recorded"}</strong>
            <p>
              Defeated {opponent?.name || "the opposing team"}
              {champion.captain?.["Display Name"]
                ? ` · Captain ${champion.captain["Display Name"]}`
                : ""}
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
                  <strong>{player["Display Name"]}</strong>
                  <span>Handicap {formatHandicap(handicap)}</span>
                  <span>
                    Record {standing ? `${standing.wins}-${standing.losses}-${standing.halves}` : "—"}
                  </span>
                  {pointsTracked ? <b>{points(standing?.points)} pts</b> : null}
                </Link>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>The Path to the Cup</span>
          <h2>Round-by-Round Points</h2>
          <div className={styles.championRounds}>
            {rounds.map(({ number, course, archive, winningSide, opposingSide }) => (
              <Link href={`/history/${year}/round/${number}`} key={number}>
                <div>
                  <span>Round {number} · {getFormatName(course.Format)}</span>
                  <strong>{archive.roundWinner}</strong>
                </div>
                <p><b>{champion.name}</b><strong>{points(winningSide.points)}</strong></p>
                <p><b>{opponent?.name || opposingSide.name}</b><strong>{points(opposingSide.points)}</strong></p>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <span className={styles.sectionLabel}>Tournament Standings</span>
          <h2>Individual Tournament Leaders</h2>
          <div className={styles.tournamentLeaderboard} data-points={pointsTracked}>
            <div className={`${styles.tournamentLeaderboardRow} ${styles.tournamentLeaderboardHead}`}>
              <span>Rank</span><span>Player</span><span>Record</span>{pointsTracked ? <span>Points</span> : null}
            </div>
            {leaderboard.map((row) => (
              <div className={`${styles.tournamentLeaderboardRow} ${row.tournamentRank === "1" ? styles.tournamentLeaderboardFirst : ""}`} key={row.id}>
                <strong>{row.tournamentRank}</strong>
                <span className={styles.tournamentLeaderboardPlayer}>
                  <i data-side={row.teamSide} />
                  {row.player?.slug ? <Link href={`/players/${row.player.slug}`}>{row.player["Display Name"]}</Link> : <b>{row.player?.["Display Name"] || row.id}</b>}
                </span>
                <span>{row.wins}-{row.losses}-{row.halves}</span>
                {pointsTracked ? <strong>{points(row.points)}</strong> : null}
              </div>
            ))}
          </div>
        </section>

        <div className={styles.championDetailLinks}>
          <Link href="/champions">← All Champions</Link>
          <Link href={`/history/${year}`}>View Full {year} Tournament →</Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
