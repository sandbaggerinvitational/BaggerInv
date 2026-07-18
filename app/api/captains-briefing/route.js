import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "AI briefing is not configured. Add OPENAI_API_KEY in Vercel Environment Variables." },
      { status: 503 }
    );
  }

  try {
    const data = await request.json();
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      store: false,
      instructions: [
        "You are the Sandbagger Invitational captain's analyst.",
        "Use only the supplied deterministic analytics. Never invent records, scores, players, or percentages.",
        "Write a sharp scouting briefing in 120-180 words.",
        "Lead with the matchup call, explain the two biggest drivers, identify one risk for the favorite, and finish with one actionable lineup recommendation.",
        "Keep the tone confident, golf-savvy, and useful to a captain. Do not mention that you are an AI.",
      ].join(" "),
      input: `Analyze this matchup data:\n${JSON.stringify(data)}`,
    });
    return Response.json({ briefing: response.output_text?.trim() || "No briefing was returned." });
  } catch (error) {
    console.error("Captain briefing failed", error);
    return Response.json({ error: "The AI briefing could not be generated right now." }, { status: 500 });
  }
}
