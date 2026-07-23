import Link from "next/link";
import AssetImage from "../AssetImage";
import TeamLogoPlate from "../TeamLogoPlate";
import { formatHandicap } from "../../lib/formatters";
import styles from "./draft.module.css";

function initials(name) {
  return String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SBI";
}

function dateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function DraftTeam({ team }) {
  return (
    <article
      className={styles.team}
      style={{ "--draft-team": team.primaryColor }}
    >
      <TeamLogoPlate
        filename={team.logo}
        teamName={team.name}
        variant="card"
        loading="eager"
      />
      <div>
        <h2>{team.name}</h2>
        <span>Captain</span>
        <strong>{team.captain?.name || "Captain not recorded"}</strong>
      </div>
    </article>
  );
}

function DraftedPlayer({ pick }) {
  return (
    <article
      className={styles.pickCard}
      style={{ "--draft-team": pick.team?.primaryColor || "#0b4a3a" }}
    >
      <div className={styles.pickNumber}>Pick {pick.pickNumber}</div>
      <AssetImage
        src={pick.player.image}
        alt={pick.player.name}
        className={styles.playerImage}
        fallbackClassName={styles.playerFallback}
        fallback={initials(pick.player.name)}
        inferFallback={false}
      />
      <h3>{pick.player.name}</h3>
      <p>Handicap {formatHandicap(pick.player.handicap)}</p>
      <div className={styles.draftedBy}>
        {pick.team ? (
          <TeamLogoPlate
            filename={pick.team.logo}
            teamName={pick.team.name}
            variant="scoreboard"
          />
        ) : null}
        <span>
          Drafted By
          <strong>{pick.team?.name || pick.teamId || "Team not recorded"}</strong>
        </span>
      </div>
      {pick.selectedAt ? <time>{pick.selectedAt}</time> : null}
    </article>
  );
}

function PendingPick({ pick }) {
  return (
    <article
      className={`${styles.pickCard} ${styles.pendingPick}`}
      style={{ "--draft-team": pick.team?.primaryColor || "#b9913f" }}
    >
      <div className={styles.pickNumber}>Pick {pick.pickNumber}</div>
      <span>Draft Order</span>
      <div className={styles.pendingTeam}>
        {pick.team ? (
          <TeamLogoPlate
            filename={pick.team.logo}
            teamName={pick.team.name}
            variant="scoreboard"
          />
        ) : null}
        <strong>{pick.team?.name || pick.teamId || "Team not assigned"}</strong>
      </div>
    </article>
  );
}

function DraftStatus({ draft }) {
  if (draft.state === "unscheduled") {
    return (
      <section className={styles.statusCard}>
        <span>Draft Date Not Yet Announced</span>
        <h2>The {draft.year} Sandbagger Draft has not been scheduled yet.</h2>
        <p>Check back soon.</p>
      </section>
    );
  }

  if (draft.state === "scheduled") {
    return (
      <section className={styles.statusCard}>
        <span>Draft Scheduled</span>
        <h2>{dateLabel(draft.date)}</h2>
        <p>
          {[draft.time, draft.timeZone, draft.location]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <strong>The draft board will populate once the draft begins.</strong>
      </section>
    );
  }

  if (draft.state === "live") {
    return (
      <section className={`${styles.statusCard} ${styles.liveStatus}`}>
        <span>Live Draft</span>
        <h2>
          Pick {draft.nextPick?.pickNumber || draft.draftedCount + 1} of{" "}
          {draft.totalDraftPicks}
        </h2>
        <p>Next Pick</p>
        <strong>
          {draft.nextPick?.team?.name ||
            draft.nextPick?.teamId ||
            "To Be Announced"}
        </strong>
      </section>
    );
  }

  return (
    <section className={styles.statusCard}>
      <span>Draft Complete</span>
      <h2>{draft.year} Draft Complete</h2>
      <p>All {draft.totalDraftPicks} selections are official.</p>
    </section>
  );
}

function CompletedRosters({ draft }) {
  if (draft.state !== "complete") return null;
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <span>Final Teams</span>
        <h2>Completed Rosters</h2>
      </div>
      <div className={styles.rosterGrid}>
        {draft.rosters.map(({ team, picks }) => (
          <article
            className={styles.roster}
            style={{ "--draft-team": team.primaryColor }}
            key={team.id}
          >
            <TeamLogoPlate
              filename={team.logo}
              teamName={team.name}
              variant="card"
            />
            <h3>{team.name}</h3>
            <div className={styles.captainRow}>
              <div>
                <span>Captain</span>
                <strong>{team.captain?.name || "Captain not recorded"}</strong>
              </div>
              <div>
                <span>Average Team Handicap</span>
                <strong>{formatHandicap(team.averageHandicap)}</strong>
              </div>
            </div>
            <span className={styles.rosterLabel}>Draft Picks</span>
            <ol>
              {picks.map((pick) => (
                <li key={pick.pickNumber}>
                  <span>{pick.pickNumber}</span>
                  <strong>{pick.player.name}</strong>
                  <em>{formatHandicap(pick.player.handicap)}</em>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function DraftExperience({ draft, previousDrafts = [] }) {
  return (
    <>
      <section className={styles.hero}>
        <p>Sandbagger Invitational</p>
        <h1>{draft.name}</h1>
        <span>
          {[draft.format, draft.location].filter(Boolean).join(" · ") ||
            "The official team selection"}
        </span>
      </section>

      <section className={styles.shell}>
        <div className={styles.teamGrid}>
          {draft.teams.map((team) => (
            <DraftTeam team={team} key={team.id} />
          ))}
        </div>

        <DraftStatus draft={draft} />

        {draft.state !== "unscheduled" ? (
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <span>
                {draft.state === "scheduled" ? "Official Order" : "Selections"}
              </span>
              <h2>Draft Board</h2>
              <p>
                {draft.draftedCount} of {draft.totalDraftPicks} golfers selected
              </p>
            </div>
            <div className={styles.board}>
              {draft.picks.map((pick) =>
                pick.player ? (
                  <DraftedPlayer pick={pick} key={pick.pickNumber} />
                ) : (
                  <PendingPick pick={pick} key={pick.pickNumber} />
                )
              )}
            </div>
          </section>
        ) : null}

        <CompletedRosters draft={draft} />

        {previousDrafts.length ? (
          <section className={styles.history}>
            <div className={styles.sectionHeading}>
              <span>Draft Archive</span>
              <h2>Previous Drafts</h2>
            </div>
            <div>
              {previousDrafts.map((item) => (
                <Link href={`/draft/${item.year}`} key={item.year}>
                  <strong>{item.year} Sandbagger Draft</strong>
                  <span>View Draft →</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </>
  );
}
