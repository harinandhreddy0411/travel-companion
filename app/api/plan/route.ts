import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { PlanInput, Trip } from "@/lib/schema";
import { getCandidates, distanceKm, type Place } from "@/lib/places";
import { rateLimit } from "@/lib/rateLimit";

// Planning takes 20-45 s (model calls + retries). On Vercel the default function limit is much lower.
export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SHAPE = `Return ONLY JSON of this exact shape (no markdown, no commentary):
{
  "title": string,
  "days": [
    {
      "day": number,
      "theme": string,
      "stops": [
        { "placeId": string, "type": "attraction" | "restaurant", "startTime": "HH:MM", "durationMin": number, "note": string }
      ]
    }
  ]
}
"placeId" must be the exact "id" value of a place from the list (for example "p12").`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(e: any): boolean {
  const msg = String(e?.message ?? e);
  return e?.status === 503 || e?.status === 429 || /"code":\s*(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(msg);
}

function extractJson(text: string): string {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
}

type ModelResult = { text: string; finishReason?: string };

async function generateWithRetry(args: { systemInstruction: string; contents: string }): Promise<ModelResult> {
  const models = [
    process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
    process.env.GEMINI_FALLBACK_MODEL,
  ].filter(Boolean) as string[];

  let lastError: any;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: args.contents,
          config: { systemInstruction: args.systemInstruction, responseMimeType: "application/json" },
        });
        if (!res.text) throw new Error("Empty response from model");
        return { text: res.text, finishReason: res.candidates?.[0]?.finishReason as string | undefined };
      } catch (e: any) {
        lastError = e;
        if (!isTransient(e)) throw e;
        console.warn(`[plan] ${model} attempt ${attempt + 1} failed (transient), retrying`);
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

// ---------- Rule checks done in code, because prompts alone don't enforce them ----------
type GroundedStop = Trip["days"][number]["stops"][number] & { place: Place };
type GroundedTrip = { title: string; days: { day: number; theme: string; stops: GroundedStop[] }[] };

const toMin = (t: string) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};
// Approximate: matches Portuguese and English museum-like names.
const CAFETERIA = /cafeteri|cafetaria|pastelaria|padaria|pastry|bakery|snack/i;
const MUSEUM = /museu|museum|galeria|núcleo|nucleo|centro interpretativo|fundação|fundacao/i;

function validate(trip: GroundedTrip, expectedDays: number, totalMustSee: number): string[] {
  const problems: string[] = [];
  if (trip.days.length !== expectedDays) {
    problems.push(`Expected ${expectedDays} days but got ${trip.days.length}.`);
  }
  const seen = new Set<string>();
  for (const d of trip.days) {
    const restaurants = d.stops.filter((s) => s.place.type === "restaurant");
    const attractions = d.stops.filter((s) => s.place.type === "attraction");
    const hasLunch = restaurants.some((s) => toMin(s.startTime) >= 690 && toMin(s.startTime) <= 870); // 11:30-14:30
    const hasDinner = restaurants.some((s) => toMin(s.startTime) >= 1110); // 18:30+
    if (!hasLunch) problems.push(`Day ${d.day} has no lunch restaurant between 11:30 and 14:30.`);
    if (!hasDinner) problems.push(`Day ${d.day} has no dinner restaurant at 18:30 or later.`);
    if (attractions.length < 3 || attractions.length > 4) {
      problems.push(`Day ${d.day} has ${attractions.length} attractions; it needs 3 or 4.`);
    }
    if (totalMustSee >= expectedDays * 2) {
      const famous = attractions.filter((s) => s.place.mustSee).length;
      if (famous < 2) problems.push(`Day ${d.day} has only ${famous} mustSee attractions; use at least 2 places flagged mustSee: true.`);
    }
    if (d.stops.length > 1) {
      const lat = d.stops.reduce((a, s) => a + s.place.lat, 0) / d.stops.length;
      const lng = d.stops.reduce((a, s) => a + s.place.lng, 0) / d.stops.length;
      const far = d.stops.filter((s) => distanceKm(s.place, { lat, lng }) > 4);
      if (far.length) {
        problems.push(`Day ${d.day} is too spread out (${far.map((s) => s.place.name).join(", ")} are far from the other stops). Keep a day's stops within about 4 km of each other.`);
      }
    }
    const museums = attractions.filter((s) => MUSEUM.test(s.place.name)).length;
    if (museums > 2) problems.push(`Day ${d.day} has ${museums} museums; the maximum is 2.`);
    // Gaps: the model tends to leave long empty afternoons.
    const byTime = [...d.stops].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    // The free evening before dinner is normal, so gaps are only checked up to the last attraction.
    const timed = byTime.filter((s) => !(s.place.type === "restaurant" && toMin(s.startTime) >= 1110));
    for (let i = 1; i < timed.length; i++) {
      const gap = toMin(timed[i].startTime) - (toMin(timed[i - 1].startTime) + timed[i - 1].durationMin);
      if (gap > 150) {
        problems.push(`Day ${d.day} has a ${(gap / 60).toFixed(1)} hour gap between "${timed[i - 1].place.name}" and "${timed[i].place.name}". Add a stop or adjust times.`);
      }
    }
    // Zigzag check: total travel between consecutive stops in time order.
    let travelKm = 0;
    for (let i = 1; i < byTime.length; i++) travelKm += distanceKm(byTime[i - 1].place, byTime[i].place);
    if (travelKm > 10) {
      problems.push(`Day ${d.day} zigzags: about ${travelKm.toFixed(0)} km of travel between stops. Reorder or choose stops in one or two neighbouring areas so the day's total travel is under 10 km.`);
    }
    for (const r of restaurants) {
      if (CAFETERIA.test(r.place.name)) problems.push(`Day ${d.day}: "${r.place.name}" looks like a cafeteria or pastry shop; choose a proper restaurant.`);
    }
    for (const s of d.stops) {
      if (seen.has(s.place.id)) problems.push(`"${s.place.name}" is used more than once.`);
      seen.add(s.place.id);
    }
  }
  return problems;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit reached. Try again in an hour." }, { status: 429 });
  }

  const parsed = PlanInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  let places: Place[];
  try {
    places = await getCandidates(input);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
  if (places.length < input.days * 3) {
    return NextResponse.json({ error: "Not enough places found for that destination." }, { status: 422 });
  }

  // Short ids (p0, p1, ...) keep the prompt small and stop the model mangling long hex ids.
  const byShortId = new Map(places.map((p, i) => [`p${i}`, p]));
  const candidateList = places.map((p, i) => ({
    id: `p${i}`, name: p.name, type: p.type, mustSee: p.mustSee ?? false, notable: p.notable ?? false,
    lat: +p.lat.toFixed(4), lng: +p.lng.toFixed(4),
  }));

  const totalMustSee = places.filter((p) => p.mustSee).length;

  const systemInstruction =
    "You are a trip planner. Build a day-by-day itinerary using ONLY places from the provided list, referenced by their exact id. " +
    "EVERY day must contain exactly: 3 or 4 attractions (at least one before lunch and at least one after lunch), 1 lunch restaurant (start 11:45-13:30) and 1 dinner restaurant (start 19:00-20:30). " +
    "No gap between consecutive stops may exceed 2.5 hours. Do not use cafeterias, museum cafes, pastry shops or snack bars as lunch or dinner. " +
    "A day without a dinner is invalid. Start the first attraction between 09:00 and 10:00. " +
    "At most 2 museums per day. Do not use plain squares, streets or plazas as attractions unless nothing better exists. " +
    "Places flagged mustSee: true are the city's famous landmarks: build each day around at least 2 of them and use as many as fit. Fill gaps with notable: true places. " +
    "Use different neighbourhoods on different days, but keep each day compact (use lat/lng). Never repeat a place. " +
    "The budget level (budget/mid/luxury) is a style hint: favour free or cheap attractions and casual food for 'budget', and the reverse for 'luxury'. " +
    SHAPE;

  const makeContents = (fixThese?: string[]) =>
    JSON.stringify({
      destination: input.destination,
      days: input.days,
      budget: input.budget,
      interests: input.interests,
      places: candidateList,
      ...(fixThese?.length ? { fixThese: ["Your previous plan broke these rules. Fix them:", ...fixThese] } : {}),
    });

  // Up to 3 attempts. Keep the best plan seen (fewest rule violations); stop early if it's clean.
  let best: { trip: GroundedTrip; problems: string[] } | null = null;
  let feedback: string[] | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    let result: ModelResult;
    try {
      result = await generateWithRetry({ systemInstruction, contents: makeContents(feedback) });
    } catch (e: any) {
      if (best) break; // already have something usable
      const busy = isTransient(e);
      return NextResponse.json(
        { error: busy ? "The AI model is busy right now. Please try again in a minute." : `Model call failed: ${e.message}` },
        { status: busy ? 503 : 502 }
      );
    }

    let tripData: Trip | null = null;
    try {
      const check = Trip.safeParse(JSON.parse(extractJson(result.text)));
      if (check.success) tripData = check.data;
      else console.error("[plan] schema mismatch:", JSON.stringify(check.error.issues).slice(0, 500));
    } catch {
      console.error(
        `[plan] invalid JSON (attempt ${attempt + 1}). finishReason=${result.finishReason}, length=${result.text.length}\n` +
          `START: ${result.text.slice(0, 300)}\nEND: ${result.text.slice(-300)}`
      );
    }
    if (!tripData) continue;

    // Grounding check: drop stops whose id isn't a real candidate, then attach place data.
    const grounded: GroundedTrip = {
      ...tripData,
      days: tripData.days.map((d) => ({
        ...d,
        stops: d.stops
          .filter((s) => byShortId.has(s.placeId))
          .map((s) => ({ ...s, placeId: byShortId.get(s.placeId)!.id, place: byShortId.get(s.placeId)! })),
      })),
    };

    const problems = validate(grounded, input.days, totalMustSee);
    console.log(`[plan] attempt ${attempt + 1}: ${problems.length} rule problems`, problems);
    if (!best || problems.length < best.problems.length) best = { trip: grounded, problems };
    if (problems.length === 0) break;
    feedback = problems;
  }

  if (!best) {
    return NextResponse.json({ error: "The AI returned an unusable plan. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ input, trip: best.trip, warnings: best.problems });
}