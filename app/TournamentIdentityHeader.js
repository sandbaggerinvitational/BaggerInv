import MobileIdentityImage from "./MobileIdentityImage";
import StatusBadge from "./StatusBadge";
import { tournamentLogo } from "../lib/asset-paths";
import headerStyles from "./tournament-identity-header.module.css";
import styles from "./tournament-command-center.module.css";

function logoSource(value, year) {
  const source = String(value || "").trim();
  if (!source) return tournamentLogo(`sandbagger-${year}`);
  return /^(https?:)?\/\//i.test(source) || source.startsWith("/")
    ? source
    : tournamentLogo(source);
}

export default function TournamentIdentityHeader({
  year,
  name = "Sandbagger Invitational",
  location = "Tournament week",
  logo,
  status = "Live",
  compact = false,
}) {
  return (
    <header className={`${styles.homeHeader} ${headerStyles.tokens}`} data-density={compact ? "compact" : "standard"}>
      <MobileIdentityImage
        sources={[logoSource(logo, year)]}
        name={name}
        alt={name}
        className={styles.tournamentLogo}
        fallbackClassName={styles.tournamentLogoFallback}
      />
      <div>
        <p>{year} Tournament</p>
        <h1>{name}</h1>
        <span>{location}</span>
      </div>
      <StatusBadge status={status} />
    </header>
  );
}
