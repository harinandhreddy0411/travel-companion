"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DAY_COLORS } from "@/lib/colors";

// Leaflet touches `window`, so it must only load in the browser.
const TripMap = dynamic(() => import("@/components/TripMap"), {
  ssr: false,
  loading: () => <div className="h-[28rem] w-full animate-pulse rounded-lg bg-gray-100" />,
});

type Place = { id: string; name: string; address: string; lat: number; lng: number; type: "attraction" | "restaurant" };
type Stop = { startTime: string; durationMin: number; note: string; place: Place };
type Day = { day: number; theme: string; stops: Stop[] };
type TripResult = { input: { destination: string; days: number; budget: string }; trip: { title: string; days: Day[] } };
type SavedTrip = { id: string; savedAt: number; result: TripResult };

const STORAGE_KEY = "ai-travel-planner:saved-trips";

export default function Home() {
  const [destination, setDestination] = useState("Lisbon");
  const [days, setDays] = useState(3);
  const [budget, setBudget] = useState<"budget" | "mid" | "luxury">("mid");
  const [interests, setInterests] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TripResult | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedTrip[]>([]);

  // Saved trips live in this browser's localStorage (read after mount to avoid hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, []);

  function persist(next: SavedTrip[]) {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  const isSaved = result
    ? saved.some((s) => s.result.trip.title === result.trip.title && s.result.input.destination === result.input.destination)
    : false;

  function saveCurrent() {
    if (!result || isSaved) return;
    persist([{ id: crypto.randomUUID(), savedAt: Date.now(), result }, ...saved].slice(0, 20));
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          days,
          budget,
          interests: interests.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Invalid input. Check the form.");
      setResult(data);
      setActiveDay(null);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const shownDays = result ? (activeDay === null ? result.trip.days : result.trip.days.filter((d) => d.day === activeDay)) : [];

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold">AI Travel Planner</h1>
        <p className="mt-1 text-gray-600">Pick a destination and travel style. Every place is verified on the map.</p>

        <form onSubmit={generate} className="mt-6 grid gap-3 rounded-lg border p-4 sm:grid-cols-5">
          <input className="rounded border px-3 py-2 sm:col-span-2" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination" required minLength={2} />
          <select className="rounded border px-3 py-2" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} day{n > 1 ? "s" : ""}</option>)}
          </select>
          <select className="rounded border px-3 py-2" value={budget} onChange={(e) => setBudget(e.target.value as typeof budget)}>
            <option value="budget">Budget style</option>
            <option value="mid">Mid-range style</option>
            <option value="luxury">Luxury style</option>
          </select>
          <button disabled={loading} className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
            {loading ? "Planning…" : "Plan trip"}
          </button>
          <input className="rounded border px-3 py-2 sm:col-span-5" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Interests, comma separated (optional): food, history, parks" />
        </form>

        {saved.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Saved trips</h2>
            <ul className="mt-2 space-y-2">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <span>
                    <span className="font-medium">{s.result.input.destination}</span> · {s.result.input.days} days · {s.result.trip.title}
                    <span className="ml-2 text-gray-400">{new Date(s.savedAt).toLocaleDateString()}</span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button onClick={() => { setResult(s.result); setActiveDay(null); }} className="rounded border px-2 py-1">Open</button>
                    <button onClick={() => persist(saved.filter((x) => x.id !== s.id))} className="rounded border px-2 py-1 text-red-600">Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading && <p className="mt-4 text-gray-600">Finding real places and building your itinerary. This can take 20–40 seconds.</p>}
        {error && <p className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">{error}</p>}

        {result && (
          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold">{result.trip.title}</h2>
              <button onClick={saveCurrent} disabled={isSaved} className="shrink-0 rounded border px-3 py-1 text-sm disabled:opacity-50">
                {isSaved ? "Saved ✓" : "Save trip"}
              </button>
            </div>
            <p className="text-sm text-gray-500">Opening hours are not checked. Confirm them before you go.</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => setActiveDay(null)} className={`rounded-full border px-3 py-1 text-sm ${activeDay === null ? "bg-gray-900 text-white" : ""}`}>All days</button>
              {result.trip.days.map((d) => (
                <button key={d.day} onClick={() => setActiveDay(d.day)} className={`rounded-full border px-3 py-1 text-sm ${activeDay === d.day ? "bg-gray-900 text-white" : ""}`}>
                  Day {d.day}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                {shownDays.map((d) => (
                  <div key={d.day}>
                    <h3 className="flex items-center gap-2 text-lg font-semibold">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: DAY_COLORS[(d.day - 1) % DAY_COLORS.length] }} />
                      Day {d.day}: {d.theme}
                    </h3>
                    <ol className="mt-2 space-y-2">
                      {[...d.stops].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((s, i) => (
                        <li key={i} className="rounded-lg border p-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{s.place.name}</span>
                            <span className="shrink-0 text-sm text-gray-500">{s.startTime} · {s.durationMin} min</span>
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${s.place.type === "restaurant" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                              {s.place.type === "restaurant" ? "Meal" : "Sight"}
                            </span>
                            {s.note}
                          </div>
                          <div className="mt-1 text-xs text-gray-400">{s.place.address}</div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
              <div className="lg:sticky lg:top-4 lg:self-start">
                <TripMap days={result.trip.days} activeDay={activeDay} />
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}