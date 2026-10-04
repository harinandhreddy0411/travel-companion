import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractJson(text: string): string {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
}

// Ask the model only for NAMES of famous places. These are just search seeds:
// every name is later resolved against the maps API, and only real map results
// (with real ids and coordinates) ever reach the itinerary.
export async function nominateLandmarks(destination: string, count: number): Promise<string[]> {
  const models = [
    process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
    process.env.GEMINI_FALLBACK_MODEL,
  ].filter(Boolean) as string[];

  const prompt =
    `List the ${count} most famous must-see tourist attractions in ${destination} that a first-time visitor should not miss. ` +
    `Include a mix: landmarks, historic sites, viewpoints, parks, and a few well-known museums, spread across different neighbourhoods. ` +
    `Only individually named, real places (no districts, no generic categories). Use the name as it appears on maps. ` +
    `Return ONLY JSON: {"names": ["...", "..."]}`;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" },
        });
        const names = JSON.parse(extractJson(res.text ?? "")).names;
        if (Array.isArray(names)) {
          return names.filter((n: unknown): n is string => typeof n === "string" && n.length > 1).slice(0, count);
        }
      } catch (e: any) {
        console.warn(`[landmarks] ${model} attempt ${attempt + 1} failed: ${String(e?.message ?? e).slice(0, 120)}`);
        await sleep(1500);
      }
    }
  }
  return []; // caller falls back to map-only results
}