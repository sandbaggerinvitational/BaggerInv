export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../../../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../../components";
import ContextBackLink from "../../../../ContextBackLink";
import TeamLogoPlate from "../../../../TeamLogoPlate";
import PublicMatchCard from "../../../../PublicMatchCard";
import {
  formatHandicap,
  getTeamSeason,
} from "../../../../../lib/stats";
import styles from "../../../../historical.module.css";
import { pageMetadata } from "../../../../../lib/seo";
import { filterScorecards } from "../../../../../lib/scorecard-analytics";
import {
  history2026TeamPageModel,
  isSupabaseHistory2026,
  loadHistory2026View,
} from "../../../../../lib/history-2026-service";
import HistoryUnavailablePage from "../../../HistoryUnavailable";

export async function generateMetadata({ params }) {
  const { year, side } = await params;
  const decodedSide = decodeURIComponent(side);
  let team;

  if (isSupabaseHistory2026(year)) {
    try {
      team = history2026TeamPageModel(
        await loadHistory2026View({ year: Number(year) }),
        decodedSide
      );
      if (team && !Array.isArray(team.roster)) {
        throw new Error("The 2026 historical team view is incomplete.");
      }
    } catch {
      team = null;
    }
  } else {
    await refreshHistoricalData();
    team = getTeamSeason(year, decodedSide);
  }

  const title = team
    ? `${team.name} | ${year} | The Sandbagger Invitational`
    : "Team | The Sandbagger Invitational";
  return pageMetadata({
    title,
    description: team
      ? `${team.name}'s ${year} Sandbagger Invitational roster, captain, and tournament handicaps.`
      : "Historical Sandbagger Invitational team roster.",
    path: `/history/${year}/team/${encodeURIComponent(side)}`,
  });
}

export default async function TeamSeasonPage({ params }) {
  const { year, side } = await params;
  const decodedSide = decodeURIComponent(side);
  let team;

  if (isSupabaseHistory2026(year)) {
    try {
      team = history2026TeamPageModel(
        await loadHistory2026View({ year: Number(year) }),
        decodedSide
      );
      if (
        team && (
          !Array.isArray(team.roster) ||
          !Array.isArray(team.roundGroups) ||
          !team.tournament ||
          !team.scorecardAnalytics
        )
      ) {
        throw new Error("The 2026 historical team match view is incomplete.");
      }
    } catch {
      return <HistoryUnavailablePage year={year} section="Team History" />;
    }
  } else {
    await refreshHistoricalData();
    team = getTeamSeason(year, decodedSide);
  }

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

        {team.roundGroups?.length ? (
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Tournament Matches</span>
            <h2>{team.name} by Round</h2>
            {team.roundGroups.map((group) => (
              <section className={styles.section} key={group.number}>
                <span className={styles.sectionLabel}>
                  {group.label} · {group.course?.Course || group.format}
                </span>
                <h3>
                  {group.opponent?.name
                    ? `${team.name} vs ${group.opponent.name}`
                    : `${group.label} Matchups`}
                </h3>
                <div className={styles.roundMatchGrid}>
                  {group.matches.map((match) => (
                    <PublicMatchCard
                      key={match.id}
                      match={match}
                      round={{ label: group.label, format: group.format }}
                      tournament={team.tournament}
                      variant="historical"
                      scorecards={filterScorecards(
                        team.scorecardAnalytics.scorecards,
                        { matchId: match.id }
                      )}
                    />
                  ))}
                </div>
              </section>
            ))}
          </section>
        ) : null}
      </section>

      <Footer />
    </main>
  );
}
