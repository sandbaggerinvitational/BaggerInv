import { NextResponse } from "next/server";

import { readTournamentFoundation } from "../../../../lib/tournament-foundation.js";
import { tournamentFoundationReadEnvironment } from "../../../../lib/tournament-read-source.js";
import { applicationRequestEnvironment } from "../../../../lib/production-shadow-request-environment.js";

export const dynamic = "force-dynamic";

const cache = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

function responseHeaders(source, googleRequests) {
  return {
    "Cache-Control": cache,
    "X-Tournament-Foundation-Read-Source": source,
    "X-Tournament-Foundation-Google-Requests": String(googleRequests),
  };
}

export async function GET(request) {
  const startedAt = performance.now();
  let env;
  let selected;
  try {
    env = applicationRequestEnvironment(request);
    selected = tournamentFoundationReadEnvironment(env);
    const read = await readTournamentFoundation({ env });
    const response = NextResponse.json({ data: read.data, readDiagnostics: read.diagnostics }, {
      headers: responseHeaders(read.diagnostics.source, read.diagnostics.googleRequests),
    });
    response.headers.set("Server-Timing", `tournamentFoundation;dur=${(performance.now() - startedAt).toFixed(1)}`);
    return response;
  } catch (error) {
    return NextResponse.json({ error: "Current tournament foundation is temporarily unavailable.",
      code: error?.code || "TOURNAMENT_FOUNDATION_UNAVAILABLE" }, {
      status: Number(error?.status || 503),
      headers: responseHeaders(selected?.requested === "supabase" ? "supabase" : selected?.resolved || "unavailable", 0),
    });
  }
}
