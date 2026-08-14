import { NextResponse } from "next/server";

import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import {
  isPreviewImpersonationSession,
  previewDirectorPassportCookie,
  tournamentDirectorTokenFromRequest,
  verifyPlayerPassportSession,
} from "../../../../lib/player-passport.js";
import { inspectTournamentDirectorToken } from "../../../../lib/player-passport-server.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

function previewSupabaseDirectorNavigationEnabled() {
  if (process.env.VERCEL_ENV !== "preview") return false;
  try { return requireParticipantIdentityAuthority().resolved === "supabase"; }
  catch { return false; }
}

export async function GET(request) {
  if (!previewSupabaseDirectorNavigationEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  }

  const token = tournamentDirectorTokenFromRequest(request);
  const authorization = await inspectTournamentDirectorToken(token);
  if (authorization.status === "unavailable") {
    return NextResponse.json({ authorized: false }, {
      status: 503,
      headers: { ...headers, "Retry-After": "1", "X-Director-Retryable": "identity" },
    });
  }
  const response = NextResponse.json({ authorized: authorization.status === "active" }, { headers });
  if (authorization.status === "active") {
    const session = verifyPlayerPassportSession(token);
    if (!isPreviewImpersonationSession(session)) {
      const maxAge = Math.max(0, Number(session.exp || 0) - Math.floor(Date.now() / 1000));
      if (maxAge) response.cookies.set(previewDirectorPassportCookie(token, maxAge));
    }
  }
  return response;
}
