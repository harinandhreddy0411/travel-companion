import type { PlanInput } from "./schema";
import { nominateLandmarks } from "./landmarks";

export type Place = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  priceLevel: string | null;
  type: "attraction" | "restaurant";
  notable?: boolean; // has a Wikipedia/Wikidata entry in OpenStreetMap
  mustSee?: boolean; // famous landmark, nominated by the model then verified on the map
};

type LatLng = { lat: number; lng: number };

const BASE = "https://api.geoapify.com";
const KEY = () => process.env.GEOAPIFY_API_KEY!;

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function geocode(destination: string): Promise<LatLng> {
  const url = `${BASE}/v1/geocode/search?text=${encodeURIComponent(destination)}&limit=1&format=json&apiKey=${KEY()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geoapify geocode ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const hit = data.results?.[0];
  if (!hit) throw new Error(`Could not find destination "${destination}"`);
  return { lat: hit.lat, lng: hit.lon };
}

// Turn a landmark name into a real map result. Returns null if it can't be verified.
async function resolveLandmark(name: string, destination: string, center: LatLng): Promise<Place | null> {
  try {
    const url =
      `${BASE}/v1/geocode/search?text=${encodeURIComponent(`${name}, ${destination}`)}` +
      `&bias=proximity:${center.lng},${center.lat}&limit=1&format=json&apiKey=${KEY()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const hit = (await res.json()).results?.[0];
    if (!hit?.place_id) return null;
    if (["city", "state", "country", "county", "postcode"].includes(hit.result_type)) return null; // matched the whole city, not the place
    if (distanceKm(center, { lat: hit.lat, lng: hit.lon }) > 30) return null; // wrong place with the same name elsewhere
    return {
      id: hit.place_id,
      // Prefer the friendlier requested name when the map name is just a fragment of it ("Carmo" vs "Convento do Carmo").
      name:
        hit.name && name.length > hit.name.length && name.toLowerCase().includes(String(hit.name).toLowerCase())
          ? name
          : hit.name ?? hit.address_line1 ?? name,
      address: hit.formatted ?? "",
      lat: hit.lat,
      lng: hit.lon,
      rating: null,
      priceLevel: null,
      type: "attraction",
      notable: true,
      mustSee: true,
    };
  } catch {
    return null;
  }
}

// Categories that are technically "sights" but useless on an itinerary.
const JUNK = /memorial|plaque|artwork|statue|bust|bench|fountain/i;

async function searchCategory(
  categories: string,
  center: LatLng,
  type: Place["type"],
  limit: number,
  radius = 12000
): Promise<Place[]> {
  const url =
    `${BASE}/v2/places?categories=${categories}` +
    `&filter=circle:${center.lng},${center.lat},${radius}` +
    `&bias=proximity:${center.lng},${center.lat}` +
    `&limit=${limit}&apiKey=${KEY()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geoapify places ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.features ?? [])
    .filter((f: any) => f.properties?.name)
    .filter((f: any) => !(f.properties.categories ?? []).some((c: string) => JUNK.test(c)))
    .map((f: any) => {
      const p = f.properties;
      const raw = p.datasource?.raw ?? {};
      return {
        id: p.place_id,
        name: p.name,
        address: p.formatted ?? "",
        lat: p.lat,
        lng: p.lon,
        rating: null,
        priceLevel: null,
        type,
        notable: Boolean(raw.wikidata || raw.wikipedia || p.wiki_and_media?.wikidata),
      } as Place;
    });
}

// Greedy clustering: one centre per ~1.5 km group of landmarks.
function clusterCentres(points: LatLng[], radiusKm = 1.5): LatLng[] {
  const centres: LatLng[] = [];
  for (const p of points) {
    if (!centres.some((c) => distanceKm(c, p) < radiusKm)) centres.push({ lat: p.lat, lng: p.lng });
  }
  return centres;
}

const cache = new Map<string, { at: number; value: Place[] }>();
const TTL_MS = 60 * 60 * 1000;

export async function getCandidates(input: PlanInput): Promise<Place[]> {
  const key = `${input.destination.trim().toLowerCase()}|${input.days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const center = await geocode(input.destination);

  // 1) Famous landmarks: model proposes names, the map verifies them.
  const names = await nominateLandmarks(input.destination, Math.min(35, input.days * 5 + 3));
  const resolved = (await Promise.all(names.map((n) => resolveLandmark(n, input.destination, center)))).filter(
    (p): p is Place => p !== null
  );
  const landmarks: Place[] = [];
  for (const p of resolved) {
    if (!landmarks.some((l) => l.id === p.id || distanceKm(l, p) < 0.05)) landmarks.push(p);
  }
  console.log(`[places] landmarks resolved: ${landmarks.length}/${names.length}`, landmarks.map((l) => l.name));

  let value: Place[];
  if (landmarks.length >= 3) {
    // 2) A little filler from map data, 3) restaurants near each landmark cluster.
    const filler = (
      await searchCategory("tourism.sights,entertainment.museum,leisure.park", center, "attraction", 100)
    )
      .filter((p) => p.notable && !landmarks.some((l) => distanceKm(l, p) < 0.08))
      .slice(0, 12);

    const clusters = clusterCentres(landmarks).slice(0, 8);
    const restaurantLists = await Promise.all(
      clusters.map((c) => searchCategory("catering.restaurant", c, "restaurant", 12, 1200).catch(() => []))
    );
    const seen = new Set<string>();
    const restaurants = restaurantLists.flat().filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

    value = [...landmarks, ...filler, ...restaurants.slice(0, 80)];
  } else {
    // Fallback: nomination failed, use nearest map results only.
    const [attractions, restaurants] = await Promise.all([
      searchCategory("tourism.sights,entertainment.museum,leisure.park", center, "attraction", 100),
      searchCategory("catering.restaurant", center, "restaurant", 40),
    ]);
    value = [
      ...[...attractions.filter((p) => p.notable), ...attractions.filter((p) => !p.notable)].slice(0, 40),
      ...restaurants.slice(0, 30),
    ];
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}