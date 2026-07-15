import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components";
import {
  formatHandicap,
  getTeamSeason,
} from "../../../../../lib/stats";
import styles from "../../../../historical.module.css";

export async function generateMetadata({ params }) {
  const { year, side } = await params;
  const team = getTeamSeason(year, decodeURIComponent(side));

  return {
    title: team
      ? `${team.name} | ${year} | The Sandbagger Invitational`
      : "Team | The Sandbagger Invitational",
  };
}

export default async function TeamSeasonPage({ params }) {
  const { year, side } = await params;
  const team = getTeamSeason(year, decodeURIComponent(side));
  if (!team) notFound();

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>{team.year} Team Roster</p>
        <h1>{team.name}</h1>
        <p>
          Captain: {team.captain?.["Display Name"] || "TBA"} · Average
          handicap {formatHandicap(team.averageHandicap)}
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.rosterGrid}>
          {team.roster.map(({ player, handicap }) => (
            <Link
              className={styles.rosterCard}
              href={`/players/${player.slug}`}
              key={player["Player ID"]}
            >
              <span>{player["Display Name"]}</span>
              <strong>{formatHandicap(handicap)}</strong>
              <small>Tournament Handicap</small>
              {team.captain?.["Player ID"] === player["Player ID"] ? (
                <b>Captain</b>
              ) : null}
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
