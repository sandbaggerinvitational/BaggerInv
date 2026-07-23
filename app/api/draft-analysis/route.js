import OpenAI from "openai";
import { clientAddress, consumeRateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clean = (value) => String(value ?? "").trim();

function validate(data) {
  if (!data || typeof data !== "object") return "Draft analysis data is required.";
  if (!["projected", "live", "final"].includes(data.state)) return "Draft analysis state is invalid.";
  if (!Number.isInteger(Number(data.year))) return "Tournament year is invalid.";
  if (!clean(data.projectedFavorite?.team) || !clean(data.leader?.team)) return "Both draft teams are required.";
  if (!Array.isArray(data.grades) || data.grades.length !== 2) return "Both captain grades are required.";
  return "";
}

function safeError(error) {
  const status = Number(error?.status) || 500;
  if (status === 401) return "The OpenAI API key was rejected. Replace OPENAI_API_KEY in Vercel and redeploy.";
  if (status === 429) return "The OpenAI project is rate-limited or out of API credits. Try again shortly.";
  if (status >= 500) return "OpenAI is temporarily unavailable. Try the draft review again in a moment.";
  return "The SBI Draft Analyst could not generate a review right now.";
}

export async function POST(request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const rateLimit = consumeRateLimit(clientAddress(request));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many analyst requests. Please wait a minute and try again.", requestId },
      { status: 429 }
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "The SBI Draft Analyst is not configured. Add OPENAI_API_KEY in Vercel and redeploy.", requestId },
      { status: 503 }
    );
  }

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 20_000) {
      return Response.json({ error: "The draft analysis request was too large.", requestId }, { status: 413 });
    }
    const data = JSON.parse(raw);
    const validation = validate(data);
    if (validation) return Response.json({ error: validation, requestId }, { status: 400 });

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 50_000,
      maxRetries: 0,
    });
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";
    const response = await client.responses.create({
      model,
      store: false,
      ...(model.startsWith("gpt-5") ? { reasoning: { effort: "low" } } : {}),
      max_output_tokens: 260,
      instructions: [
        "You are the SBI Draft Analyst, the official analytics-desk voice of the Sandbagger Invitational.",
        "Write one polished paragraph of 70-110 words.",
        "Use only the supplied draft metrics and never invent facts, records, players, or explanations.",
        "For projected state, clearly treat every conclusion as a projection.",
        "For live state, contrast the original favorite with current production.",
        "For final state, write a historical review and do not describe anything as projected.",
        "Explain the strongest captain decision and the most important player value result.",
        "Use Draft Value Score naturally when provided.",
        "Never mention AI, prompts, supplied data, or a model.",
        "Do not use headings, bullets, markdown, or generic golf advice.",
      ].join(" "),
      input: `Review this ${data.year} draft analysis:\n${JSON.stringify(data)}`,
    });
    const summary = response.output_text?.trim();
    if (!summary) throw new Error("OpenAI returned an empty draft review.");
    return Response.json({ summary, requestId });
  } catch (error) {
    console.error("Draft analysis failed", {
      requestId,
      status: error?.status,
      code: error?.code,
      message: error?.message,
    });
    return Response.json(
      { error: safeError(error), requestId },
      { status: Number(error?.status) || 500 }
    );
  }
}
