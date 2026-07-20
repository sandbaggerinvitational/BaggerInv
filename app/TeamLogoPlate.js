import AssetImage from "./AssetImage";
import { teamLogo } from "../lib/asset-paths";
import styles from "./historical.module.css";

function teamInitials(name) {
  return String(name ?? "")
    .replace(/[^a-zA-Z0-9'’\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, "")[0])
    .filter(Boolean)
    .slice(0, 3)
    .join("")
    .toUpperCase() || "SBI";
}

export default function TeamLogoPlate({
  filename,
  teamName,
  variant = "card",
  loading = "lazy",
}) {
  const variantClass = {
    roster: styles.teamLogoPlateRoster,
    scoreboard: styles.teamLogoPlateScoreboard,
  }[variant] || styles.teamLogoPlateCard;

  return (
    <div className={`${styles.teamLogoPlate} ${variantClass}`}>
      <AssetImage
        src={teamLogo(filename)}
        alt={`${teamName} logo`}
        className={styles.teamLogoPlateImage}
        fallbackClassName={styles.teamLogoPlateFallback}
        fallback={teamInitials(teamName)}
        inferFallback={false}
        loading={loading}
      />
    </div>
  );
}
