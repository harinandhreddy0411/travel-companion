import { z } from "zod";

// ---------- Input (what the form sends) ----------
export const PlanInput = z.object({
  destination: z.string().min(2).max(80),
  days: z.number().int().min(1).max(7),
  budget: z.enum(["budget", "mid", "luxury"]),
  interests: z.array(z.string().max(30)).max(6).default([]),
});
export type PlanInput = z.infer<typeof PlanInput>;

// ---------- Output (what the LLM must return) ----------
// NOTE: OpenAI structured outputs require every field present; use nullable, not optional.
export const Stop = z.object({
  placeId: z.string(), // must come from the candidate list
  type: z.enum(["attraction", "restaurant"]),
  startTime: z.string(), // "09:30"
  durationMin: z.number(),
  note: z.string(),
});

export const Day = z.object({
  day: z.number(),
  theme: z.string(),
  stops: z.array(Stop),
});

export const Trip = z.object({
  title: z.string(),
  days: z.array(Day),
});
export type Trip = z.infer<typeof Trip>;