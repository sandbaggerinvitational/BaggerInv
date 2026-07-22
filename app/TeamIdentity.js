import Link from "next/link";
import TeamLogoPlate from "./TeamLogoPlate";

export default function TeamIdentity({ team, captain, score, detail, href, variant = "homepage" }) {
  const name = team?.name || "Team";
  return <article className={`teamIdentity teamIdentity--${variant}`}>
    <TeamLogoPlate filename={team?.logo} teamName={name} variant="scoreboard" />
    <div className="teamIdentityContent">
      <h3>{name}</h3>
      {detail ? <p>{detail}</p> : null}
      {!detail && score !== undefined ? <p>{score} points</p> : null}
      {!detail && score === undefined && captain !== undefined ? <p>Captain: {captain || "To be announced"}</p> : null}
      {href ? <Link href={href}>View Team →</Link> : null}
    </div>
  </article>;
}
