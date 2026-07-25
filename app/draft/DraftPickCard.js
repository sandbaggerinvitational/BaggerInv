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

export default function DraftPickCard({ pick, compact = false }) {
  return (
    <article
      className={`${styles.pickCard} ${compact ? styles.compactPickCard : ""}`}
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
