import AssetImage from "../AssetImage";
import { tournamentLogo } from "../../lib/asset-paths";
import { formatTournamentDates, formatTournamentEdition } from "../../lib/tournament-branding";
import styles from "./tournament-guide.module.css";

function tournamentName(tournament) {
  return tournament?.["Tournament Name"] || tournament?.Name || tournament?.name || "";
}

function tournamentEdition(tournament) {
  return formatTournamentEdition(tournament?.["Tournament Edition"] || tournament?.editionTitle || tournament?.Annual);
}

function tournamentDates(tournament) {
  const dates = tournament?.["Tournament Dates"] || tournament?.Dates || tournament?.dates || tournament?.Date || "";
  return formatTournamentDates(dates);
}

export default function TournamentGuideHero({ tournament }) {
  const name = tournamentName(tournament);
  const edition = tournamentEdition(tournament);
  const dates = tournamentDates(tournament);
  const logoFileName = tournament?.["Tournament Logo"] || tournament?.["Tournament Logo Filename"] || tournament?.logoFileName || tournament?.["Annual Image"] || tournament?.["Logo Filename"] || tournament?.logo;

  return <section className={styles.tournamentIdentityHero} aria-label="Tournament identity">
    <div className={styles.tournamentIdentityInner}>
      <div className={styles.tournamentIdentityLogoPlate}>
        <AssetImage
          src={tournamentLogo(logoFileName)}
          alt={name ? `${name} logo` : "Tournament logo"}
          fallback={String(tournament?.year || "SBI")}
          className={styles.tournamentIdentityLogo}
          fallbackClassName={styles.tournamentIdentityLogoFallback}
          width={108}
          height={108}
          sizes="(max-width: 560px) 64px, 108px"
          decoding="async"
        />
      </div>
      <div className={styles.tournamentIdentityCopy}>
        {edition ? <p>{edition}</p> : null}
        {name ? <h1>{name}</h1> : null}
        <strong>Tournament Guide</strong>
        {dates ? <span>{dates}</span> : null}
      </div>
    </div>
  </section>;
}
