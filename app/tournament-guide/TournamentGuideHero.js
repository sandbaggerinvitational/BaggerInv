import AssetImage from "../AssetImage";
import { tournamentLogo } from "../../lib/asset-paths";
import styles from "./tournament-guide.module.css";

function tournamentName(tournament) {
  return tournament?.["Tournament Name"] || tournament?.Name || tournament?.name || "";
}

function tournamentEdition(tournament) {
  const edition = String(tournament?.["Tournament Edition"] || tournament?.editionTitle || tournament?.Annual || "").trim();
  if (!edition) return "";
  return /annual$/i.test(edition) ? edition : `${edition} Annual`;
}

function tournamentDates(tournament) {
  const dates = tournament?.["Tournament Dates"] || tournament?.Dates || tournament?.dates || tournament?.Date || "";
  return String(dates).replace(/\s+-\s+/g, "–");
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
        />
      </div>
      <div className={styles.tournamentIdentityCopy}>
        {edition ? <p>{edition}</p> : null}
        {name ? <h1>{name}</h1> : null}
        {dates ? <span>{dates}</span> : null}
      </div>
    </div>
  </section>;
}
