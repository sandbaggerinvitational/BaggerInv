import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { participantIdentityAuthorityEnvironment } from "../../../../../lib/participant-identity-authority.js";
import { recordSingleParticipantAuthClientDiagnostics } from "../../../../../lib/participant-identity-supabase.js";
import { verifyParticipantAuthClaims } from "../../../../../lib/supabase-auth-server.js";

export const dynamic = "force-dynamic";
export async function POST(request) {
  const authority = participantIdentityAuthorityEnvironment();
  if (!authority.participantAuthEnabled) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const verified = await verifyParticipantAuthClaims(await cookies());
  if (verified.status !== "active") return NextResponse.json({ error: "Preview Auth session required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const input = await request.json().catch(() => ({}));
  const samples = Array.isArray(input.samples) ? input.samples.slice(0, 50) : [];
  const result = await recordSingleParticipantAuthClientDiagnostics({ auth_user_id: verified.claims.sub, samples });
  return NextResponse.json({ ok: result.payload?.ok === true, inserted: Number(result.payload?.inserted || 0) }, { headers: { "Cache-Control": "private, no-store" } });
}
