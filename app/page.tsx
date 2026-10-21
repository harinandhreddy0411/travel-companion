"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { DAY_COLORS } from "@/lib/colors";
import Postmark from "@/components/Postmark";
import type { Selected } from "@/components/TripMap";

const TripMap = dynamic(() => import("@/components/TripMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-rule/60" />,
});

type Place = { id: string; name: string; address: string; lat: number; lng: number; type: "attraction" | "restaurant" };
type Stop = { startTime: string; durationMin: number; note: string; place: Place };
type Day = { day: number; theme: string; stops: Stop[] };
type TripResult = { input: { destination: string; days: number; budget: string }; trip: { title: string; days: Day[] } };
type SavedTrip = { id: string; savedAt: number; result: TripResult };

const STORAGE_KEY = "ai-travel-planner:saved-trips";
const EXAMPLES = ["Lisbon", "Kyoto", "Rome", "Marrakech", "Mexico City"];
const INTERESTS = ["Food", "History", "Parks", "Art", "Architecture", "Viewpoints"];
const STYLES = [
  { id: "budget", label: "Easy on the wallet", hint: "Free sights, casual food" },
  { id: "mid", label: "Mid-range", hint: "A bit of everything" },
  { id: "luxury", label: "Treat yourself", hint: "Fine dining, paid highlights" },
] as const;
const STAGES = [
  "Choosing landmarks worth the trip",
  "Checking each place on the map",
  "Finding restaurants near every stop",
  "Sorting the places into days",
  "Checking the plan for gaps and long detours",
];

const titleCase = (s: string) => s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
const duration = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
const Icon = ({ meal }: { meal: boolean }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {meal ? <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10" /> : <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>}
  </svg>
);

export default function Home() {
  const [destination, setDestination] = useState("");
  const [days, setDays] = useState(3);
  const [budget, setBudget] = useState<"budget" | "mid" | "luxury">("mid");
  const [interests, setInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TripResult | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [saved, setSaved] = useState<SavedTrip[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, []);

  // Stage messages are timed estimates, not live progress.
  useEffect(() => {
    if (!loading) return;
    setStage(0);
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 7000);
    return () => clearInterval(t);
  }, [loading]);

  const persist = (next: SavedTrip[]) => {
    setSaved(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };
  const isSaved = !!result && saved.some((s) => s.result.trip.title === result.trip.title && s.result.input.destination === result.input.destination);
  const open = (r: TripResult) => { setResult(r); setActiveDay(null); setSelected(null); window.scrollTo({ top: 0 }); };
  const reset = () => { setResult(null); setError(null); setSelected(null); setActiveDay(null); };

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: destination.trim(), days, budget, interests: interests.map((i) => i.toLowerCase()) }),
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        // The host (not our code) answered with plain text, usually because the request timed out.
        throw new Error("The planner took too long or crashed. Try again, or choose fewer days.");
      }
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "The form has an invalid value. Check the destination and try again.");
      open(data);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Try again in a minute.");
    } finally {
      setLoading(false);
    }
  }

  const sortedDays = useMemo(
    () => (result ? result.trip.days.map((d) => ({ ...d, stops: [...d.stops].sort((a, b) => a.startTime.localeCompare(b.startTime)) })) : []),
    [result]
  );
  const shown = activeDay === null ? sortedDays : sortedDays.filter((d) => d.day === activeDay);
  const chip = "rounded-full border px-3.5 py-1.5 text-sm transition-colors";

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between px-5 py-4 sm:px-8">
          <span className="font-display text-xl font-semibold tracking-tight">Travel Companion</span>
          {(result || loading) && !loading && <button onClick={reset} className="text-sm underline underline-offset-4 hover:text-moss">Plan another trip</button>}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        {loading && (
          <section className="pt-16 sm:pt-24" aria-live="polite">
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-6xl">Planning {titleCase(destination)}</h1>
            <p className="mt-5 text-xl text-sepia">{STAGES[stage]}</p>
            <div className="mt-6 h-1 w-full max-w-md overflow-hidden rounded bg-rule"><div className="sweep h-full w-1/3 bg-moss" /></div>
            <p className="mt-3 text-sm text-sepia">This usually takes 20 to 45 seconds.</p>
            <div className="mt-10 max-w-2xl space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-md border border-rule bg-bone" />)}</div>
          </section>
        )}

        {!loading && !result && (
          <section className="pt-12 sm:pt-20">
            <h1 className="font-display text-[clamp(3rem,9vw,6.5rem)] font-semibold leading-[0.95] tracking-[-0.03em]">Where to next?</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-sepia">Name a city and how you like to travel. You get a day-by-day plan with real places, meals and a map.</p>

            <form onSubmit={generate} className="mt-10 max-w-3xl space-y-7 rounded-md border border-rule bg-bone p-5 sm:p-8">
              <label className="block">
                <span className="text-sm font-medium text-sepia">Destination</span>
                <input value={destination} onChange={(e) => setDestination(e.target.value)} required minLength={2} maxLength={80} placeholder="Lisbon"
                  className="mt-1 w-full border-0 border-b-2 border-ink bg-transparent pb-2 font-display text-3xl outline-none placeholder:text-sepia/40 focus:border-moss sm:text-4xl" />
              </label>
              <div className="flex flex-wrap gap-2" aria-label="Example destinations">
                {EXAMPLES.map((c) => <button type="button" key={c} onClick={() => setDestination(c)} className={`${chip} border-rule text-sepia hover:border-ink hover:text-ink`}>{c}</button>)}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-sepia">Length of trip</span>
                <div className="flex items-center rounded-full border border-ink">
                  <button type="button" aria-label="Fewer days" disabled={days <= 1} onClick={() => setDays(days - 1)} className="h-10 w-10 text-xl disabled:opacity-30">−</button>
                  <span className="w-20 text-center font-medium" aria-live="polite">{days} {days === 1 ? "day" : "days"}</span>
                  <button type="button" aria-label="More days" disabled={days >= 7} onClick={() => setDays(days + 1)} className="h-10 w-10 text-xl disabled:opacity-30">+</button>
                </div>
              </div>

              <div>
                <span className="text-sm font-medium text-sepia">Travel style</span>
                <div role="radiogroup" aria-label="Travel style" className="mt-2 grid gap-2 sm:grid-cols-3">
                  {STYLES.map((s) => (
                    <button type="button" role="radio" aria-checked={budget === s.id} key={s.id} onClick={() => setBudget(s.id)}
                      className={`rounded-md border p-3 text-left transition-colors ${budget === s.id ? "border-moss bg-moss text-bone" : "border-rule hover:border-ink"}`}>
                      <span className="block font-medium">{s.label}</span>
                      <span className={`block text-sm ${budget === s.id ? "text-bone/80" : "text-sepia"}`}>{s.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-sm font-medium text-sepia">Interests (optional)</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INTERESTS.map((i) => {
                    const on = interests.includes(i);
                    return <button type="button" key={i} aria-pressed={on} onClick={() => setInterests(on ? interests.filter((x) => x !== i) : interests.length < 6 ? [...interests, i] : interests)}
                      className={`${chip} ${on ? "border-ink bg-ink text-bone" : "border-rule hover:border-ink"}`}>{i}</button>;
                  })}
                </div>
              </div>

              {error && <p role="alert" className="rounded-md border border-brick/40 bg-brick/10 p-3 text-brick">{error}</p>}
              <button className="w-full rounded-md bg-moss px-6 py-3.5 text-lg font-medium text-bone hover:bg-ink sm:w-auto">Plan my trip</button>
            </form>

            {saved.length > 0 && (
              <div className="mt-14 max-w-3xl">
                <h2 className="font-display text-3xl font-semibold">Saved trips</h2>
                <ul className="mt-4 divide-y divide-rule border-y border-rule">
                  {saved.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-display text-xl">{s.result.trip.title}</p>
                        <p className="text-sm text-sepia">{s.result.input.days} days in {titleCase(s.result.input.destination)}, saved {new Date(s.savedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex shrink-0 gap-2 text-sm">
                        <button onClick={() => open(s.result)} className="rounded-md border border-ink px-3 py-1.5 hover:bg-ink hover:text-bone">Open</button>
                        <button onClick={() => persist(saved.filter((x) => x.id !== s.id))} className="rounded-md border border-rule px-3 py-1.5 text-brick hover:border-brick">Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {!loading && result && (
          <section className="pt-10">
            <div className="flex items-start justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-sepia">{result.input.days} {result.input.days === 1 ? "day" : "days"} in {titleCase(result.input.destination)}</p>
                <h1 className="mt-1 font-display text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">{result.trip.title}</h1>
                <button disabled={isSaved} onClick={() => persist([{ id: crypto.randomUUID(), savedAt: Date.now(), result }, ...saved].slice(0, 20))}
                  className="mt-5 rounded-md border border-ink px-4 py-2 text-sm font-medium hover:bg-ink hover:text-bone disabled:border-rule disabled:text-sepia disabled:hover:bg-transparent">
                  {isSaved ? "Saved" : "Save trip"}
                </button>
              </div>
              <Postmark city={titleCase(result.input.destination)} days={result.input.days} />
            </div>

            <p className="mt-6 max-w-2xl border-l-4 border-ochre pl-4 text-sepia">Check opening hours before you go. This planner can&apos;t see them, so a place may be closed on the day you visit.</p>

            <div role="tablist" className="mt-8 flex gap-1 overflow-x-auto border-b border-rule">
              {[null, ...result.trip.days.map((d) => d.day)].map((d) => (
                <button key={d ?? "all"} role="tab" aria-selected={activeDay === d} onClick={() => setActiveDay(d)}
                  className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${activeDay === d ? "border-ink text-ink" : "border-transparent text-sepia hover:text-ink"}`}>
                  {d === null ? "All days" : `Day ${d}`}
                </button>
              ))}
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
              <div className="h-72 overflow-hidden rounded-md border border-rule lg:sticky lg:top-6 lg:order-2 lg:h-[34rem] lg:self-start">
                <TripMap days={sortedDays} activeDay={activeDay} selected={selected} />
              </div>

              <div className="lg:order-1">
                {shown.map((d) => {
                  const color = DAY_COLORS[(d.day - 1) % DAY_COLORS.length];
                  return (
                    <section key={d.day} className="mb-12">
                      <h2 className="font-display text-3xl font-semibold leading-tight">Day {d.day}<span className="ml-3 text-xl font-normal italic text-sepia">{d.theme}</span></h2>
                      <ol className="mt-5 space-y-3 border-l-2 pl-7" style={{ borderColor: color }}>
                        {d.stops.map((s, i) => {
                          const on = selected?.day === d.day && selected.index === i;
                          return (
                            <li key={i} className="relative">
                              <span className="absolute -left-10 top-4 flex h-6 w-6 items-center justify-center rounded-full text-bone" style={{ background: color }}><Icon meal={s.place.type === "restaurant"} /></span>
                              <button type="button" aria-pressed={on} onClick={() => setSelected({ day: d.day, index: i })}
                                className={`w-full rounded-md border bg-bone p-4 text-left transition-colors hover:border-ink ${on ? "border-ink ring-1 ring-ink" : "border-rule"}`}>
                                <div className="flex items-baseline justify-between gap-3 text-sm text-sepia">
                                  <span>{s.place.type === "restaurant" ? "Meal" : "Sight"}</span>
                                  <span className="tabular-nums">{s.startTime}, {duration(s.durationMin)}</span>
                                </div>
                                <p className="mt-1 font-display text-xl font-semibold leading-snug">{s.place.name}</p>
                                <p className="mt-1 leading-relaxed text-sepia">{s.note}</p>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-rule px-5 py-6 text-center text-sm text-sepia">Places come from OpenStreetMap data, matched through Geoapify.</footer>
    </div>
  );
}