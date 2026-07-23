import OpenAI from "openai";
import { NextResponse } from "next/server";
import { clientAddress, consumeRateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";

const clean = (value) => String(value ?? "").trim();

export async function POST(request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Historical analyst review is unavailable." }, { status: 503 });
  const limit = consumeRateLimit(`draft-history:${clientAddress(request)}`, { limit: 8, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Please wait before requesting another review." }, { status: 429 });
  try {
    const raw = await request.text();
    if (raw.length > 30_000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    const data = JSON.parse(raw);
    const drafts = Number(data?.summary?.draftsRecorded);
    if (!Number.isFinite(drafts) || drafts < 1) return NextResponse.json({ error: "Historical draft data is required." }, { status: 400 });
    const context = {
      summary: data.summary,
      topClasses: (data.topClasses || []).slice(0, 5).map((row) => ({
        year: row.year, captain: clean(row.captain), team: clean(row.team), score: row.score, grade: clean(row.grade),
      })),
      topSteals: (data.topSteals || []).slice(0, 5).map((row) => ({
        year: row.year, player: clean(row.player), pick: row.pick, finish: row.finish, dvs: row.dvs,
      })),
      captains: (data.captains || []).slice(0, 5).map((row) => ({
        name: clean(row.name), averageDraftScore: row.averageDraftScore, draftChampionships: row.draftChampionships,
      })),
      trends: (data.trends || []).slice(0, 5).map(clean),
    };
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.45,
      max_tokens: 180,
      messages: [
        { role: "system", content: "You are the official SBI Historical Draft Analyst. Write like an ESPN analytics desk: authoritative, concise, and natural. Use only supplied facts. Identify long-term drafting patterns without mentioning AI, ChatGPT, prompts, or models. If the sample is small, acknowledge that briefly. Return one paragraph of 80–120 words." },
        { role: "user", content: JSON.stringify(context) },
      ],
    });
    const summary = clean(completion.choices?.[0]?.message?.content);
    if (!summary) throw new Error("Empty analyst response.");
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Historical Draft Analyst failed.", { reason: error?.message || String(error) });
    return NextResponse.json({ error: "Historical review is temporarily unavailable." }, { status: 502 });
  }
}
