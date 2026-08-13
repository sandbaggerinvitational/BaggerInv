import { NextResponse } from "next/server";
import { resolveTournamentGuideContent } from "../../../tournament-guide/resolveGuideContent";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return new NextResponse(null, { status: 404 });
  const content = await resolveTournamentGuideContent();
  return NextResponse.json({
    environment: "preview",
    activeTournamentYear: content.tournament.year,
    source: content.projection?.source || "google",
    projectionRevision: content.projection?.revision || null,
    contentFingerprint: content.projection?.fingerprint || null,
    googleRequests: content.projection?.googleRequests ?? null,
    modules: content.diagnostics,
  });
}
