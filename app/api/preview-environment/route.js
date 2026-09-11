import { NextResponse } from "next/server";
import {
  PRODUCTION_SPREADSHEET_ID,
  configuredSpreadsheetId,
  liveTournamentV2Enabled,
} from "../../../lib/spreadsheet-environment";

export const dynamic = "force-dynamic";

function redact(value) {
  if (!value) return "Not configured";
  if (value.length <= 8) return "Configured";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const spreadsheetId = configuredSpreadsheetId();
  return NextResponse.json({
    environment: "preview",
    label: "PREVIEW · TEST DATA",
    spreadsheet: redact(spreadsheetId),
    productionIsolated: Boolean(spreadsheetId) && spreadsheetId !== PRODUCTION_SPREADSHEET_ID,
    scoringEnvironment: process.env.SCORING_ENVIRONMENT === "test" ? "test" : "blocked",
    liveTournamentV2Enabled: liveTournamentV2Enabled(),
  });
}
