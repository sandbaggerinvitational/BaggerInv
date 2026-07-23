export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components";
import ContextBackLink from "../../../../ContextBackLink";
import TeamLogoPlate from "../../../../TeamLogoPlate";
import {
  formatHandicap,
  getTeamSeason,
} from "../../../../../lib/stats";
import styles from "../../../../historical.module.css";

export async function generateMetadata({ params }) {
  await refreshHistoricalData();
  const { year, side } = await params;
  const team = getTeamSeason(year, decodeURIComponent(side));

  return {
    title: team
      ? `${team.name} | ${year} | The Sandbagger Invitational`
      : "Team | The Sandbagger Invitational",
  };
}

export default async function TeamSeasonPage({ params }) {
  await refreshHistoricalData();
  const { year, side } = await params;
  const team = getTeamSeason(year, decodeURIComponent(side));
  if (!team) notFound();

  return (
    <main>
      <Header />
      <ContextBackLink
        href={`/history/${team.year}`}
        label={`Back to ${team.year} Tournament`}
      />

      <section className={`${styles.pageHero} ${styles.teamRosterHero}`}>
        <TeamLogoPlate
          filename={team.logo}
          teamName={team.name}
          variant="roster"
          loading="eager"
        />
        <div>
        <p className={styles.eyebrow}>{team.year} Team Roster</p>
        <h1>{team.name}</h1>
        <p>
          Captain: {team.captain?.["Display Name"] || team.captainRecordedName || "Captain not recorded"} · Average
          handicap {formatHandicap(team.averageHandicap)}
        </p>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.rosterGrid}>
          {team.roster.map(({ player, handicap }) => (
            <Link
              className={styles.rosterCard}
              href={`/players/${player.slug}`}
              key={player["Player ID"]}
            >
              <span>
                {player["Display Name"]}
                {team.captainId === player["Player ID"] ? (
                  <i className={styles.rosterCaptainMarker} title="Captain" aria-label="Team Captain">C</i>
                ) : null}
              </span>
              <strong>{formatHandicap(handicap)}</strong>
              <small>Tournament Handicap</small>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
