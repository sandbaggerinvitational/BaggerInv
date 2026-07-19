import OpenAI from "openai";
import { clientAddress, consumeRateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 40_000;
const MAX_NAME_LENGTH = 100;

function safeError(error) {
  const status = Number(error?.status) || 500;
  if (status === 401) return "The OpenAI API key was rejected. Replace OPENAI_API_KEY in Vercel and redeploy.";
  if (status === 403) return "This OpenAI project is not allowed to use the configured model.";
  if (status === 404) return "The configured OpenAI model is unavailable. Remove OPENAI_MODEL or set it to gpt-5-mini.";
  if (status === 429) return "The OpenAI project is rate-limited or out of API credits. Check usage and billing, then try again.";
  if (status >= 500) return "OpenAI is temporarily unavailable. Try the briefing again in a moment.";
  return "The AI briefing could not be generated right now.";
}

function validatePayload(data) {
  if (!data || typeof data !== "object") return "Missing matchup data.";
  if (!data.selectedMatchup?.probabilities) return "The matchup probabilities are missing.";
  if (!Array.isArray(data.teams) || data.teams.length !== 2) return "Both team names are required.";
  if (!Array.isArray(data.selectedMatchup?.players) || data.selectedMatchup.players.length < 2) return "The selected players are missing.";
  if (data.selectedMatchup.players.length > 4) return "Too many selected players were provided.";
  if (![...data.teams, ...data.selectedMatchup.players.map((player) => player?.name)].every(
    (value) => typeof value === "string" && value.trim() && value.length <= MAX_NAME_LENGTH
  )) return "Team and player names must be valid.";
  const probabilities = data.selectedMatchup.probabilities;
  const values = [probabilities.team1, probabilities.halve, probabilities.team2];
  if (!values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) return "The matchup probabilities are invalid.";
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) > 0.01) return "The matchup probabilities must total 100.";
  return "";
}

export async function POST(request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const rateLimit = consumeRateLimit(clientAddress(request));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many briefing requests. Please wait a minute and try again.", requestId },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))) },
      }
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "AI briefing is not configured. Add OPENAI_API_KEY to the Production environment in Vercel, then redeploy.", requestId },
      { status: 503 }
    );
  }

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return Response.json({ error: "The matchup briefing request was too large.", requestId }, { status: 413 });
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return Response.json({ error: "The request body must contain valid JSON.", requestId }, { status: 400 });
    }
    const validationError = validatePayload(data);
    if (validationError) return Response.json({ error: validationError, requestId }, { status: 400 });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 1 });
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";
    const response = await client.responses.create({
      model,
      store: false,
      max_output_tokens: 500,
      instructions: [
        "You are the Sandbagger Invitational captain's analyst.",
        "Use only the supplied deterministic analytics. Never invent records, scores, players, or percentages.",
        "Write a sharp scouting briefing in 130-190 words.",
        "Return exactly four short paragraphs separated by blank lines.",
        "Start each paragraph with one of these labels exactly: MATCHUP CALL:, WHY IT LEANS:, DANGER ZONE:, CAPTAIN'S MOVE:.",
        "Keep each paragraph to two or three crisp sentences. Do not use bullets, numbered lists, markdown headings, or run-on sentences.",
        "Vary the opening language, cadence, golf metaphors, and strategic angle from matchup to matchup.",
        "Avoid stock phrases including viable path, match play remains volatile, gets the nod, and not a walkover.",
        "Use actual player and team names. Add tournament-style flair but stay faithful to the supplied numbers.",
        "Do not mention that you are an AI or describe the data as supplied.",
      ].join(" "),
      input: `Analyze this matchup data:\n${JSON.stringify(data)}`,
    });
    const briefing = response.output_text?.trim();
    if (!briefing) throw new Error("OpenAI returned an empty briefing.");
    return Response.json({ briefing, requestId });
  } catch (error) {
    console.error("Captain briefing failed", { requestId, status: error?.status, code: error?.code, message: error?.message });
    return Response.json({ error: safeError(error), requestId }, { status: Number(error?.status) || 500 });
  }
}
