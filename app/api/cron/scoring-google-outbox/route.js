import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Retired consumer: retained endpoint explicitly rejects old schedulers without
// reading credentials, claiming historical jobs, or invoking an external adapter.
function retired() {
  return NextResponse.json({ ok: false, retired: true, code: "SCORING_GOOGLE_OUTBOX_RETIRED" }, {
    status: 410,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() { return retired(); }
export async function POST() { return retired(); }
