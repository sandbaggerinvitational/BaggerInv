import Link from "next/link";
import TeamLogoPlate from "./TeamLogoPlate";

export default function TeamIdentity({ team, captain, href, variant = "homepage" }) {
  const name = team?.name || "Team";
  return <article className={`teamIdentity teamIdentity--${variant}`}>
    <TeamLogoPlate filename={team?.logo} teamName={name} variant="scoreboard" />
    <div className="teamIdentityContent">
      <h3>{name}</h3>
      {captain !== undefined ? <p>Captain: {captain || "To be announced"}</p> : null}
      {href ? <Link href={href}>View Team →</Link> : null}
    </div>
  </article>;
}
