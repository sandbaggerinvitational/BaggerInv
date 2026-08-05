import { NextResponse } from "next/server";
import { POST as publishOfficialProjection } from "../publish/route";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return publishOfficialProjection(request);
}
