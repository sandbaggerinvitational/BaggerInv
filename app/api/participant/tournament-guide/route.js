import { NextResponse } from "next/server";

import { guideParticipantProjection } from "../../../../lib/guide-participant-adapter.js";
import { readGuideProjection } from "../../../../lib/guide-supabase.js";

export const dynamic = "force-dynamic";

const RESPONSE_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const clean = (value) => String(value ?? "").trim();

const SECTION_READERS = {
  landing: (content) => ({
    tournament: content.tournament,
    tournamentIdentity: content.tournamentIdentity,
    overview: content.overview,
    guideSections: content.overview,
  }),
  schedule: (content) => ({ schedule: content.schedule, timeline: content.timelineRows }),
  itinerary: (content) => ({ schedule: content.schedule, timeline: content.timelineRows }),
  timeline: (content) => ({ timeline: content.timelineRows }),
  rules: (content) => ({ ruleBook: content.ruleBook, tournamentRules: content.tournamentRules, rounds: content.rounds }),
  dining: (content) => ({ dining: content.dining }),
  "getting-around": (content) => ({ localGuide: content.localGuide }),
  "local-guide": (content) => ({ localGuide: content.localGuide }),
  contacts: (content) => ({ importantContacts: content.importantContacts }),
  courses: (content) => ({ courses: content.courses, courseHoles: content.courseHoles }),
};

function participantContent(data = {}) {
  return guideParticipantProjection({ payload: { data } }).content;
}

function requestHasEtag(request, fingerprint) {
  const supplied = clean(request.headers.get("if-none-match"));
  if (!supplied || !fingerprint) return false;
  return supplied.split(",").some((value) => clean(value).replace(/^W\//, "").replace(/^"|"$/g, "") === fingerprint);
}

function publishedHeaders(fingerprint = "") {
  return {
    "Cache-Control": RESPONSE_CACHE,
    "Content-Type": "application/json; charset=utf-8",
    "X-Guide-Read-Source": "supabase",
    "X-Guide-Google-Requests": "0",
    ...(fingerprint ? { ETag: `"${fingerprint}"` } : {}),
  };
}

export async function GET(request) {
  const startedAt = performance.now();
  try {
    const section = clean(request.nextUrl.searchParams.get("section")).toLowerCase();
    if (section && !SECTION_READERS[section]) {
      return NextResponse.json({ error: "Guide section not found." }, { status: 404, headers: publishedHeaders() });
    }
    const read = await readGuideProjection({ surface: section === "courses" ? "course" : "guide" });
    if (!read.payload?.ok || !read.payload?.data) {
      throw Object.assign(new Error("Published Guide content is unavailable."), { code: read.payload?.code || "GUIDE_PROJECTION_UNAVAILABLE" });
    }
    const data = read.payload.data;
    const fingerprint = clean(data.delivery_fingerprint || data.content_fingerprint);
    if (requestHasEtag(request, fingerprint)) {
      return new NextResponse(null, { status: 304, headers: publishedHeaders(fingerprint) });
    }
    const content = participantContent(data);
    const selected = section ? SECTION_READERS[section](content) : content;
    const response = NextResponse.json({
      source: "supabase",
      tournamentId: "2026",
      revision: Number(data.projection_revision || 0),
      publicationSequence: Number(data.publication_sequence || 0),
      contentFingerprint: fingerprint,
      publishedAt: clean(data.published_at),
      content: selected,
    }, { headers: publishedHeaders(fingerprint) });
    response.headers.set("Server-Timing", `supabase;dur=${Number(read.durationMs || 0).toFixed(1)}, total;dur=${(performance.now() - startedAt).toFixed(1)}`);
    return response;
  } catch (error) {
    return NextResponse.json({
      error: "Tournament Guide content is temporarily unavailable.",
      code: "GUIDE_PROJECTION_UNAVAILABLE",
    }, { status: Number(error?.status || 503), headers: publishedHeaders() });
  }
}
