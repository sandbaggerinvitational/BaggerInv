import { NextResponse } from "next/server";

import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { compareDraftProjection, DRAFT_CONTRACT_VERSION, DRAFT_SOURCE_TABS } from "../../../../lib/draft-contract.js";
import { draftProjectionFreshness } from "../../../../lib/draft-freshness.js";
import { draftReadEnvironment } from "../../../../lib/draft-read-source.js";
import {
  buildDraftSourceProjection,
  readStoredDraftProjection,
  synchronizeDraftProjection,
} from "../../../../lib/draft-synchronization.js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const clean = (value) => String(value ?? "").trim();

async function directorFor(request) {
  const result = await authorizePreviewDirector({ request, allowBootstrap: true });
  return result?.status === "active" ? result : null;
}

function safeError(error) {
  return {
    code: clean(error?.code || "DRAFT_PROJECTION_OPERATION_FAILED"),
    message: clean(error?.message || "Draft projection operation failed."),
    ...(error?.diagnostics ? { diagnostics: error.diagnostics } : {}),
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function uiResponse(payload) {
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Preview Draft Projection</title></head><body><main><h1>Preview Draft Projection</h1><p>Google remains the Tournament Director authoring authority. Synchronization reads only Draft Settings and Draft Picks.</p><form action="/api/admin/draft-projection" method="post"><input type="hidden" name="action" value="synchronize"><label for="correctionReason">Historical correction reason (required only when correcting a completed Draft)</label><br><input id="correctionReason" name="correctionReason" type="text" minlength="10" autocomplete="off"><br><button type="submit">Synchronize Draft Projection</button></form><h2>Diagnostics</h2><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre></main></body></html>`, {
    headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await directorFor(request);
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  const verifySource = new URL(request.url).searchParams.get("verify") === "source";
  try {
    const stored = await readStoredDraftProjection();
    let sourceProjection = null;
    let sourceError = null;
    if (verifySource) {
      try {
        sourceProjection = await buildDraftSourceProjection({ actorId: director.identity?.player?.id });
      } catch (error) {
        sourceError = safeError(error);
      }
    }
    const parity = sourceProjection && stored.drafts.length
      ? compareDraftProjection(sourceProjection.drafts, stored.drafts)
      : null;
    const payload = {
      ok: stored.drafts.length > 0,
      sourceAuthority: "GOOGLE",
      projectionDatastore: "SUPABASE",
      readSource: draftReadEnvironment(),
      contractVersion: DRAFT_CONTRACT_VERSION,
      sourceTabs: [...DRAFT_SOURCE_TABS],
      revisions: stored.drafts.map((draft) => ({
        year: Number(draft.tournament_year),
        revision: Number(draft.revision_number),
        revisionId: draft.revision_id,
        sourceFingerprint: draft.source_fingerprint,
        payloadFingerprint: draft.payload_fingerprint,
        synchronizedAt: draft.synchronized_at,
        operation: draft.operation,
      })),
      freshness: draftProjectionFreshness({ storedDrafts: stored.drafts, sourceProjection, sourceError }),
      parity,
      sourceVerification: verifySource
        ? sourceError ? { ok: false, ...sourceError } : {
          ok: true,
          synchronizationFingerprint: sourceProjection.synchronization_fingerprint,
          years: sourceProjection.drafts.map((draft) => draft.tournament_year),
        }
        : { ok: false, status: "NOT_REQUESTED" },
      googleRead: verifySource
        ? { tabs: [...DRAFT_SOURCE_TABS], broadPredictionLoaderUsed: false, historicalLoaderUsed: false }
        : { tabs: [], broadPredictionLoaderUsed: false, historicalLoaderUsed: false },
      fallbackUsed: false,
    };
    if (new URL(request.url).searchParams.get("ui") === "1") return uiResponse(payload);
    return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({ ok: false, ...safeError(error) }, { status: error?.status || 503 });
  }
}

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const director = await directorFor(request);
  if (!director) return NextResponse.json({ error: "Tournament Director access is required." }, { status: 401 });
  try {
    const input = clean(request.headers.get("content-type")).includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    if (input.action !== "synchronize") return NextResponse.json({ error: "Unsupported Draft projection action." }, { status: 400 });
    const result = await synchronizeDraftProjection({
      actorId: clean(director.identity?.player?.id || "Tournament Director"),
      correctionReason: clean(input.correctionReason),
    });
    const payload = {
      ok: true,
      action: input.action,
      changed: result.changed,
      changedCount: result.changedCount,
      duplicateCount: result.duplicateCount,
      revisions: result.results,
      sourceAuthority: result.sourceAuthority,
      projectionDatastore: result.projectionDatastore,
      contractVersion: DRAFT_CONTRACT_VERSION,
      synchronizationFingerprint: result.synchronizationFingerprint,
      parity: result.parity,
      freshness: result.freshness,
      googleRead: result.googleRead,
      fallbackUsed: false,
    };
    if (!clean(request.headers.get("content-type")).includes("application/json")) return uiResponse(payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Draft projection synchronization failed", safeError(error));
    return NextResponse.json({ error: "Draft projection could not be synchronized.", ...safeError(error) }, { status: error?.status || 503 });
  }
}
