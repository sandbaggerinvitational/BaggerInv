export const dynamic = "force-dynamic";
import { refreshCanonical2017To2022HistoricalData, refreshHistoricalData } from "../../../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "../../../../components";
import TeamLogoPlate from "../../../../TeamLogoPlate";
import PublicMatchCard from "../../../../PublicMatchCard";
import {
  formatHandicap,
  getFormatName,
  getPlayerBySlug,
  getTeamSeason,
} from "../../../../../lib/stats";
import { formatTeamPoints } from "../../../../../lib/formatters";
import styles from "../../../../historical.module.css";
import { pageMetadata } from "../../../../../lib/seo";
import {
  history2026TeamPageModel,
  isSupabaseHistory2026,
  loadHistory2026View,
} from "../../../../../lib/history-2026-service";
import { formatHistoryTournamentHandicap } from "../../../../../lib/history-team-metadata";
import HistoryUnavailablePage from "../../../HistoryUnavailable";
import pwaStyles from "../../../history-participant.module.css";
import HistoryBackToTop from "../../../HistoryBackToTop";
import HistoryNavigation from "../../../HistoryNavigation";
import { isStep3CCompletedHistoryYear } from "../../../../../lib/history-2017-2022-migration";
import {
  isCompletedHistoryPlayerYear,
  playerOriginReturnContext,
} from "../../../../../lib/context-navigation";
import PlayerProfileReturnNavigation from "../../../../PlayerProfileReturnNavigation";
import {
  completedHistoryResolvePlayer,
  completedHistoryTeamPageModel,
  isSupabaseCompletedHistoryYear,
  loadCompletedHistoryView,
} from "../../../../../lib/completed-history-service";
import { applicationPageEnvironment } from "../../../../../lib/production-shadow-request-environment";

function roundStatusLabel(value) {
  if (value === "FINAL") return "Final";
  if (value === "IN PROGRESS" || value === "LIVE") return "In progress";
  return "Upcoming";
}

export async function generateMetadata({ params }) {
  const env = await applicationPageEnvironment();
  const { year, side } = await params;
  const decodedSide = decodeURIComponent(side);
  let team;

  if (isSupabaseHistory2026(year, env)) {
    try {
      team = history2026TeamPageModel(
        await loadHistory2026View({ year: Number(year), env }),
        decodedSide
      );
      if (team && !Array.isArray(team.roster)) {
        throw new Error("The 2026 historical team view is incomplete.");
      }
    } catch {
      team = null;
    }
  } else if (isSupabaseCompletedHistoryYear(year, env)) {
    try {
      team = completedHistoryTeamPageModel(
        await loadCompletedHistoryView({ year: Number(year), env }),
        decodedSide
      );
    } catch {
      team = null;
    }
  } else {
    try {
      await (isStep3CCompletedHistoryYear(year)
        ? refreshCanonical2017To2022HistoricalData()
        : refreshHistoricalData());
      team = getTeamSeason(year, decodedSide);
    } catch {
      team = null;
    }
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

export default async function TeamSeasonPage({ params, searchParams }) {
  const env = await applicationPageEnvironment();
  const { year, side } = await params;
  const query = await searchParams;
  const decodedSide = decodeURIComponent(side);
  const useSupabase2026 = isSupabaseHistory2026(year, env);
  const useSupabaseCompleted = isSupabaseCompletedHistoryYear(year, env);
  let team;
  let resolveHistoryPlayer = getPlayerBySlug;

  if (useSupabase2026) {
    try {
      team = history2026TeamPageModel(
        await loadHistory2026View({
          year: Number(year),
          env,
          includeTournamentPlayerMetadata: true,
        }),
        decodedSide
      );
      if (
        team && (
          !Array.isArray(team.roster) ||
          !Array.isArray(team.roundGroups) ||
          !team.tournament
        )
      ) {
        throw new Error("The 2026 historical team match view is incomplete.");
      }
    } catch {
      return <HistoryUnavailablePage year={year} section="Team History" />;
    }
  } else if (useSupabaseCompleted) {
    try {
      const view = await loadCompletedHistoryView({ year: Number(year), env });
      team = completedHistoryTeamPageModel(view, decodedSide);
      if (
        team && (
          !Array.isArray(team.roster) ||
          !Array.isArray(team.roundGroups) ||
          !team.tournament
        )
      ) {
        throw new Error("The completed historical team view is incomplete.");
      }
      resolveHistoryPlayer = (slug) => completedHistoryResolvePlayer(view, slug);
    } catch {
      return <HistoryUnavailablePage year={year} section="Team History" />;
    }
  } else {
    try {
      await (isStep3CCompletedHistoryYear(year)
        ? refreshCanonical2017To2022HistoricalData()
        : refreshHistoricalData());
    } catch {
      if (isStep3CCompletedHistoryYear(year)) {
        return <HistoryUnavailablePage year={year} section="Team History" />;
      }
      throw new Error(`Unable to load ${year} Team History.`);
    }
    team = getTeamSeason(year, decodedSide);
  }

  if (!team) notFound();
  const playerReturnContext = isCompletedHistoryPlayerYear(team.year)
    ? useSupabaseCompleted
      ? playerOriginReturnContext(query, resolveHistoryPlayer)
      : playerOriginReturnContext(query, getPlayerBySlug)
    : null;

  return (
    <main>
      <Header />
      <section className={`${styles.pageHero} ${styles.teamRosterHero} ${useSupabase2026 ? pwaStyles.teamHero : ""}`}>
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

      <PlayerProfileReturnNavigation context={playerReturnContext} />

      <HistoryNavigation
        ariaLabel={`${team.year} team history navigation`}
        left={{
          href: `/history/${team.year}`,
          label: "Tournament",
          detail: String(team.year),
          direction: "left",
          ariaLabel: `${team.year} Tournament`,
        }}
        surface="team"
      />

      <section className={`${styles.content} ${useSupabase2026 ? pwaStyles.teamContent : ""}`}>
        {useSupabase2026 && team.roundGroups?.length ? (
          <section className={pwaStyles.teamRounds} aria-labelledby="team-round-results-heading">
            <span className={styles.sectionLabel}>Round Results</span>
            <h2 id="team-round-results-heading">Tournament Performance</h2>
            <div className={pwaStyles.teamRoundList}>
              {team.roundGroups.map((group) => (
                <Link
                  aria-label={`${group.label}, ${getFormatName(group.format)}, ${group.course?.Course || "course not recorded"}, ${roundStatusLabel(group.lifecycle)}. View round results.`}
                  className={pwaStyles.teamRoundSummary}
                  href={`/history/${team.year}/round/${group.number}`}
                  key={group.number}
                >
                  <span>
                    <b>{group.label} · {getFormatName(group.format)}</b>
                    <strong>{group.course?.Course || "Course not recorded"}</strong>
                    <small>{team.name} {formatTeamPoints(group.selectedTeamPoints)} · {group.opponent?.name || "Opponent"} {formatTeamPoints(group.opponentTeamPoints)}</small>
                  </span>
                  <span className={pwaStyles.teamRoundAction} data-state={group.lifecycle}>
                    <i>{roundStatusLabel(group.lifecycle)}</i>
                    <b>View Round →</b>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className={useSupabase2026 ? pwaStyles.teamRoster : ""} aria-labelledby="team-roster-heading">
        {useSupabase2026 ? <><span className={styles.sectionLabel}>2026 Roster</span><h2 id="team-roster-heading">Tournament Handicaps</h2></> : null}
        <div className={styles.rosterGrid}>
          {team.roster.map(({ player, handicap }) => {
            const isCaptain = team.captainId === player["Player ID"];
            const handicapLabel = handicap === null || handicap === undefined
              ? "unavailable"
              : formatHistoryTournamentHandicap(handicap);
            return (
            <Link
              aria-label={`${player["Display Name"]}${isCaptain ? ", Team Captain" : ""}, Tournament Handicap ${handicapLabel}`}
              className={styles.rosterCard}
              href={`/players/${player.slug}`}
              key={player["Player ID"]}
            >
              <span>
                {player["Display Name"]}
                {isCaptain ? (
                  <i className={styles.rosterCaptainMarker} title="Captain" aria-label="Team Captain">C</i>
                ) : null}
              </span>
              <strong>{formatHistoryTournamentHandicap(handicap)}</strong>
              <small>Tournament Handicap</small>
            </Link>
            );
          })}
        </div>
        </section>

        {!useSupabase2026 && team.roundGroups?.length ? (
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Tournament Matches</span>
            <h2>{team.name} by Round</h2>
            {team.roundGroups.map((group) => (
              <section className={`${styles.section} ${useSupabase2026 ? pwaStyles.teamRoundGroup : ""}`} key={group.number}>
                <span className={styles.sectionLabel}>
                  {group.label} · {group.course?.Course || group.format}
                </span>
                <h3>
                  {group.opponent?.name
                    ? `${team.name} vs ${group.opponent.name}`
                    : `${group.label} Matchups`}
                </h3>
                <div className={`${styles.roundMatchGrid} ${useSupabase2026 ? pwaStyles.teamMatchList : ""}`}>
                  {group.matches.map((match) => (
                    <PublicMatchCard key={match.id} match={match} round={{ label: group.label, format: group.format }} tournament={team.tournament} variant="historical" />
                  ))}
                </div>
              </section>
            ))}
          </section>
        ) : null}
      </section>
      <HistoryBackToTop />
    </main>
  );
}
