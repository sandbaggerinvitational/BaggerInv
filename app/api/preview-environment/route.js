import { NextResponse } from "next/server";
import {
  previewEnvironmentDiagnostic,
} from "../../../lib/spreadsheet-environment";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(previewEnvironmentDiagnostic());
}
