import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const secret = request.headers.get("x-admin-secret");
  const allowed = [process.env.ADMIN_SECRET, process.env.GUIDE_ADMIN_SECRET, process.env.ODDS_ADMIN_SECRET, process.env.LIVE_ADMIN_SECRET].filter(Boolean);
  if (!secret || !allowed.includes(secret)) return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
