import PlayerAvatar from "../PlayerAvatar";
import TeamLogoPlate from "../TeamLogoPlate";
import { formatHandicap } from "../../lib/formatters";
import styles from "./draft.module.css";

export default function DraftPickCard({ pick, compact = false }) {
  return (
    <article
      className={`${styles.pickCard} ${compact ? styles.compactPickCard : ""}`}
      style={{ "--draft-team": pick.team?.primaryColor || "#0b4a3a" }}
    >
      <div className={styles.pickNumber}>Pick {pick.pickNumber}</div>
      <PlayerAvatar
        src={pick.player.image}
        name={pick.player.name}
        alt={pick.player.name}
        className={styles.playerImage}
        fallbackClassName={styles.playerFallback}
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
