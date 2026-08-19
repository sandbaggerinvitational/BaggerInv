import AssetImage from "../AssetImage";
import { optimizedAssetUrl } from "../../lib/asset-paths";
import { annualGuideHeroModel } from "../../lib/tournament-guide-hero";
import AnnualGuideHeroMedia from "./AnnualGuideHeroMedia";
import styles from "./tournament-guide.module.css";

export default function TournamentGuideHero({ tournament, courses = [] }) {
  const identity = annualGuideHeroModel({ tournament, courses });
  const fallback = identity.year || identity.name.slice(0, 3).toUpperCase() || "SBI";

  return <section className={styles.tournamentIdentityHero} aria-labelledby="tournament-guide-title">
    <AnnualGuideHeroMedia
      image={identity.heroImage}
      mobileImage={identity.mobileHeroImage}
      alt={identity.heroAlt}
      className={styles.tournamentIdentityMedia}
      imageClassName={styles.tournamentIdentityImage}
    />
    <div className={styles.tournamentIdentityShade} aria-hidden="true" />
    <div className={styles.tournamentIdentityInner}>
      <div className={styles.tournamentIdentityLogoPlate}>
        <AssetImage
          src={optimizedAssetUrl(identity.logoImage, 256, 82)}
          alt={identity.name ? `${identity.name} logo` : "Tournament logo"}
          fallback={fallback}
          className={styles.tournamentIdentityLogo}
          fallbackClassName={styles.tournamentIdentityLogoFallback}
          width={128}
          height={128}
          sizes="(max-width: 560px) 76px, 128px"
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      </div>
      <div className={styles.tournamentIdentityCopy}>
        {identity.edition || identity.name ? <p>{identity.edition || identity.name}</p> : null}
        <h1 id="tournament-guide-title">Tournament Guide</h1>
        {identity.dates ? <strong>{identity.dates}</strong> : null}
        {identity.destination ? <span>{identity.destination}</span> : null}
      </div>
    </div>
  </section>;
}
