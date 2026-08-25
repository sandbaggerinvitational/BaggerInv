import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import {
  PRODUCTION_CANONICAL_HOSTNAME,
  PRODUCTION_VERCEL_PROJECT_NAME,
  assertProductionShadowCandidateRequest,
} from "../../../../lib/production-shadow-candidate.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "../../../../lib/production-foundation-resource-contract.js";
import {
  PRODUCTION_VERCEL_PROJECT_ID,
  withProductionGoogleServiceAccountCredentials,
} from "../../../../lib/production-google-service-account-server.js";
import {
  readWorkbookNativeMetadataSnapshot,
  withWorkbookWriteDiagnostics,
} from "../../../../lib/google-sheets-write.js";
import { canonicalJson } from "../../../../lib/scoring-shadow.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });

function safeFailureCode(error) {
  const existing = String(error?.code || "").trim();
  if (/^[A-Z][A-Z0-9_]{2,79}$/.test(existing)) return existing;
  const status = Number(error?.status || error?.cause?.status || 0);
  if (status === 401) return "PRODUCTION_GOOGLE_AUTHENTICATION_REJECTED";
  if (status === 403) return "PRODUCTION_GOOGLE_WORKBOOK_ACCESS_DENIED";
  if (status === 404) return "PRODUCTION_GOOGLE_WORKBOOK_NOT_FOUND";
  const message = String(error?.message || "");
  if (/Google authentication failed/i.test(message)) return "PRODUCTION_GOOGLE_AUTHENTICATION_FAILED";
  if (/timeout|timed out/i.test(message) || error?.name === "TimeoutError") {
    return "PRODUCTION_GOOGLE_REQUEST_TIMEOUT";
  }
  return "PRODUCTION_GOOGLE_METADATA_CERTIFICATION_FAILED";
}

function resources() {
  return {
    supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
    googleWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournamentId: PRODUCTION_TOURNAMENT_ID,
    tournamentYear: PRODUCTION_TOURNAMENT_YEAR,
    vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
    vercelProjectName: PRODUCTION_VERCEL_PROJECT_NAME,
    canonicalHostname: PRODUCTION_CANONICAL_HOSTNAME,
  };
}

export async function GET(request) {
  let candidate;
  try {
    candidate = assertProductionShadowCandidateRequest(request, process.env, { requireOrigin: false }).candidate;
  } catch {
    return unavailable();
  }
  const director = await authorizePreviewDirector({ request, env: process.env, allowBootstrap: false });
  if (director?.status !== "active") {
    return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401, headers: noStore });
  }
  try {
    const measured = await withProductionGoogleServiceAccountCredentials({
      env: process.env,
      operation: "PRODUCTION_WORKBOOK_METADATA_READ",
      resources: resources(),
    }, () => withWorkbookWriteDiagnostics("step11-production-workbook-metadata", () =>
      readWorkbookNativeMetadataSnapshot()));
    if (Number(measured.diagnostics?.workbookWrites || 0) !== 0) {
      throw Object.assign(new Error("A read-only metadata certificate attempted a Google write."), {
        code: "PRODUCTION_GOOGLE_METADATA_WRITE_DETECTED",
      });
    }
    const metadata = measured.result;
    if (metadata.spreadsheetId !== PRODUCTION_GOOGLE_WORKBOOK_ID) {
      throw Object.assign(new Error("The Production workbook identity did not match."), {
        code: "PRODUCTION_GOOGLE_METADATA_WORKBOOK_MISMATCH",
      });
    }
    const serialized = canonicalJson(metadata);
    return NextResponse.json({
      ok: true,
      contractVersion: "step11-production-google-metadata-v1",
      candidateSha: candidate.resources.commitSha,
      workbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
      workbookTitle: metadata.properties.title,
      metadataFingerprint: createHash("sha256").update(serialized).digest("hex"),
      sheetCount: metadata.sheets.length,
      protectedRangeCount: metadata.sheets.reduce((total, sheet) => total + sheet.protectedRanges.length, 0),
      filterViewCount: metadata.sheets.reduce((total, sheet) => total + sheet.filterViews.length, 0),
      namedRangeCount: metadata.namedRanges.length,
      metadata,
      googleRead: {
        httpRequests: Number(measured.diagnostics?.httpRequests || 0),
        sheetsApiCalls: Number(measured.diagnostics?.sheetsApiCalls || 0),
        writerOperations: Number(measured.diagnostics?.workbookWrites || 0),
      },
      previewWorkbookSelectable: false,
      fallbackUsed: false,
    }, { headers: noStore });
  } catch (error) {
    const code = safeFailureCode(error);
    const diagnostics = error?.workbookDiagnostics || {};
    console.error("Step 11 Production Google metadata certification failed", {
      code,
      status: Number(error?.status || error?.cause?.status || 0),
      category: String(error?.category || "unknown").slice(0, 40),
      googleHttpRequests: Number(diagnostics.httpRequests || 0),
      sheetsApiCalls: Number(diagnostics.sheetsApiCalls || 0),
      writerOperations: Number(diagnostics.workbookWrites || 0),
    });
    return NextResponse.json({
      ok: false,
      error: "Production Google metadata certification failed.",
      code,
      googleRead: {
        httpRequests: Number(diagnostics.httpRequests || 0),
        sheetsApiCalls: Number(diagnostics.sheetsApiCalls || 0),
        writerOperations: Number(diagnostics.workbookWrites || 0),
      },
    }, { status: Number(error?.status || 503), headers: noStore });
  }
}
