import { NextResponse } from "next/server";
import {
  previewEnvironmentDiagnostic,
} from "../../../lib/spreadsheet-environment";
import { readNormalizedSheetValues } from "../../../lib/google-sheets-server-read";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const standings = await readNormalizedSheetValues("Calcutta Standings");
  console.info("Preview Calcutta Standings schema", { headers: standings[0] || [] });
  return NextResponse.json(previewEnvironmentDiagnostic());
}
