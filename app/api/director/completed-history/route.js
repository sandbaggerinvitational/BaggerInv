import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  importCompletedHistoryYear,
  inspectCompletedHistory,
  inspectCompletedHistorySecurity,
  prepareCompletedHistoryYear,
  prepareCompletedHistoryYears,
  readCompletedHistory,
} from "../../../../lib/completed-history-supabase.js";
import { completedHistoryYearCertificationSummary } from "../../../../lib/completed-history-contract.js";
import { compareCompletedHistoryYearRead } from "../../../../lib/completed-history-parity.js";
import {
  buildCompletedHistoryDerivedShadow,
  compareCompletedHistoryDerivedShadows,
  completedHistoryYearReadToShadowPayload,
} from "../../../../lib/completed-history-shadow.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const clean = (value) => String(value ?? "").trim();
const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "Not found." }, { status: 404, headers });

async function authorize(request) {
  if (process.env.VERCEL_ENV !== "preview") return { response: unavailable() };
  const authorization = await authorizePreviewDirector({ request, allowBootstrap: false });
  if (authorization.status === "unavailable") {
    return { response: NextResponse.json({ error: "Director verification is temporarily unavailable." }, {
      status: 503,
      headers: { ...headers, "X-Director-Retryable": "identity" },
    }) };
  }
  if (authorization.status !== "active") {
    return { response: NextResponse.json({ error: "Tournament Director access is required." }, { status: 403, headers }) };
  }
  return { identity: authorization.identity };
}

function actorId(identity = {}) {
  return clean(identity.actor?.id || identity.player?.id || identity.authUserId || "preview-director");
}

function safeError(error) {
  return {
    error: "Completed History operation did not complete.",
    code: clean(error?.code || "COMPLETED_HISTORY_OPERATION_FAILED"),
  };
}

export async function GET(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const year = Number(new URL(request.url).searchParams.get("year")) || undefined;
    const [diagnostics, security] = await Promise.all([
      inspectCompletedHistory({ year }),
      inspectCompletedHistorySecurity(),
    ]);
    return NextResponse.json({
      ok: diagnostics.payload?.ok === true && security.payload?.ok === true,
      actor: actorId(access.identity),
      diagnostics: diagnostics.payload,
      security: security.payload,
      durations: { diagnosticsMs: diagnostics.durationMs, securityMs: security.durationMs },
    }, { headers });
  } catch (error) {
    return NextResponse.json(safeError(error), { status: 503, headers });
  }
}

export async function POST(request) {
  const access = await authorize(request);
  if (access.response) return access.response;
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action).toLowerCase();
  const year = Number(body.year);
  const requestedBy = actorId(access.identity);
  try {
    if (action === "validate") {
      const input = await prepareCompletedHistoryYear({ year, requestedBy });
      return NextResponse.json({ ok: true, action, summary: completedHistoryYearCertificationSummary(input) }, { headers });
    }
    if (action === "parity") {
      const canonical = await prepareCompletedHistoryYear({ year, requestedBy });
      const stored = await readCompletedHistory({ year, mode: "YEAR" });
      if (stored.payload?.ok !== true) {
        return NextResponse.json({ ok: false, action, result: stored.payload }, { status: 503, headers });
      }
      const parity = compareCompletedHistoryYearRead(canonical, stored.payload.data);
      return NextResponse.json({ ok: parity.pass, action, parity, durationMs: stored.durationMs }, {
        status: parity.pass ? 200 : 409,
        headers,
      });
    }
    if (action === "shadow") {
      const canonicalYears = await prepareCompletedHistoryYears({ requestedBy });
      const storedReads = await Promise.all(canonicalYears.map((item) =>
        readCompletedHistory({ year: item.source_year, mode: "YEAR" })
      ));
      const unavailableRead = storedReads.find((item) => item.payload?.ok !== true);
      if (unavailableRead) {
        return NextResponse.json({ ok: false, action, result: unavailableRead.payload }, { status: 503, headers });
      }
      const sourceShadow = buildCompletedHistoryDerivedShadow(canonicalYears);
      const storedShadow = buildCompletedHistoryDerivedShadow(storedReads.map((item) =>
        completedHistoryYearReadToShadowPayload(item.payload.data)
      ));
      const parity = compareCompletedHistoryDerivedShadows(sourceShadow, storedShadow);
      return NextResponse.json({
        ok: parity.pass,
        action,
        parity,
        source: { fingerprint: sourceShadow.fingerprint, totals: sourceShadow.totals, recordHolders: sourceShadow.recordHolders },
        supabase: { fingerprint: storedShadow.fingerprint, totals: storedShadow.totals, recordHolders: storedShadow.recordHolders },
      }, { status: parity.pass ? 200 : 409, headers });
    }
    if (action === "import") {
      const correction = body.correction && typeof body.correction === "object"
        ? {
          expected_source_fingerprint: clean(body.correction.expected_source_fingerprint),
          reason: clean(body.correction.reason),
        }
        : null;
      const result = await importCompletedHistoryYear({
        year,
        requestedBy,
        authorization: {
          authorized: true,
          scope: "COMPLETED_HISTORY_IMPORT",
          actor_id: requestedBy,
          authorization_id: randomUUID(),
          authorized_at: new Date().toISOString(),
        },
        correction,
      });
      const payload = result.rpc.payload || {};
      return NextResponse.json({
        ok: payload.ok === true,
        action,
        summary: result.summary,
        result: payload,
        durationMs: result.rpc.durationMs,
      }, {
        status: payload.ok === true ? 200
          : payload.code === "HISTORICAL_RECONCILIATION_REQUIRED" ? 409
          : 422,
        headers,
      });
    }
    return NextResponse.json({ error: "Unsupported completed History operation." }, { status: 400, headers });
  } catch (error) {
    return NextResponse.json(safeError(error), { status: 503, headers });
  }
}
