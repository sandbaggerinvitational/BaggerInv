import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Retired consumer: retained endpoint explicitly rejects old schedulers without
// reading credentials, claiming historical jobs, or invoking an external adapter.
export function futureMatchGoogleCompatibilityWorkerEnabled() { return false; }

function retired() {
  return NextResponse.json({ ok: false, retired: true, code: "FUTURE_MATCH_GOOGLE_COMPATIBILITY_RETIRED" }, {
    status: 410,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() { return retired(); }
export async function POST() { return retired(); }
