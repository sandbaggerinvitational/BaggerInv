import { NextResponse } from "next/server";

import { requireParticipantIdentityAuthority } from "../../../../lib/participant-identity-authority.js";
import { playerPassportTokenFromRequest } from "../../../../lib/player-passport.js";
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

  const authorization = await inspectTournamentDirectorToken(playerPassportTokenFromRequest(request));
  if (authorization.status === "unavailable") {
    return NextResponse.json({ authorized: false }, {
      status: 503,
      headers: { ...headers, "Retry-After": "1", "X-Director-Retryable": "identity" },
    });
  }
  return NextResponse.json({ authorized: authorization.status === "active" }, { headers });
}
