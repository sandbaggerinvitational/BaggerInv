import { Header } from "../../components";
import PreviewModeBadge from "../../PreviewModeBadge";
import { privatePageMetadata } from "../../../lib/seo";
import GameCenter from "../GameCenter";
import { getGameCenterData } from "../gameCenterData";
import { cookies } from "next/headers";
import { PLAYER_PASSPORT_COOKIE, playerPassportEffectivePlayerId, verifyPlayerPassportSession } from "../../../lib/player-passport";
import { requireParticipantIdentityAuthority } from "../../../lib/participant-identity-authority";
import { resolveSupabaseParticipantIdentity } from "../../../lib/participant-identity-resolver";
import { guideReadEnvironment } from "../../../lib/guide-read-source";
import { readGuideProjection } from "../../../lib/guide-supabase";
import { applyGuideCourseToGameCenter } from "../../../lib/guide-participant-adapter";
import styles from "../game-center.module.css";
import { applicationPageEnvironment } from "../../../lib/production-shadow-request-environment";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Game Center | Sandbagger Invitational");

function safeReturnContext(value) {
  const context = String(value || "").trim();
  if (["home", "my-match", "tournament"].includes(context)) return context;
  if (context.startsWith("/live?view=leaderboards")) return context;
  return "my-match";
}

export default async function GameCenterPage({ params, searchParams }) {
  const env = await applicationPageEnvironment();
  const { matchId } = await params;
  const query = await searchParams;
  const cookieStore = await cookies();
  let currentPlayerId = "";
  const authority = requireParticipantIdentityAuthority(env);
  try {
    currentPlayerId = authority.resolved === "supabase"
      ? (await resolveSupabaseParticipantIdentity({ cookieStore, env })).playerId
      : playerPassportEffectivePlayerId(verifyPlayerPassportSession(cookieStore.get(PLAYER_PASSPORT_COOKIE)?.value || ""));
  } catch {}
  const guideSource = guideReadEnvironment(env).course;
  const [assembled, guideRead] = await Promise.all([
    getGameCenterData(matchId, currentPlayerId, { env }),
    guideSource.resolved === "supabase"
      ? readGuideProjection({ surface: "course", env }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const initialData = guideRead?.payload?.ok ? applyGuideCourseToGameCenter(assembled, guideRead) : assembled;
  const backTo = safeReturnContext(query?.from);

  return <main className={styles.page}>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <Header homeHref="/home" />
    <div className={styles.content}>
      <GameCenter initialData={initialData} matchId={matchId} backTo={backTo} />
    </div>
  </main>;
}
