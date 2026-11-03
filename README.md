# Travel Companion

A web app that plans a trip from a destination, a length and a travel style. It returns a day-by-day itinerary of sights and meals, shown on a map. Trips can be saved in the browser.

The interesting part is where the rules live. A language model on its own invents places and ignores instructions, so here it only **chooses** from places that were verified on a map, and every rule about the plan (a dinner each day, no zigzagging, a limit on museums) is **checked in code**. If a plan breaks a rule, the model is asked again with the exact problems listed.

**Live demo:** https://travel-companion-seven-gold.vercel.app (a plan takes about 20 to 45 seconds, and the free model tier is sometimes busy)

![Home screen](docs/images/home.png)
![A finished trip](docs/images/trip.png)

## Features

- Destination, 1 to 7 days, three travel styles (easy on the wallet, mid-range, treat yourself) and optional interests
- A day-by-day timeline with sights and a lunch and dinner each day
- Interactive map: one colour per day, dashed route lines, click a stop to zoom to it
- Saved trips in the browser, with open and delete
- A loading screen with stage messages (timed estimates, not live progress)
- Responsive layout: the map moves above the itinerary on small screens

## Tech stack

| Layer     | Technology                                                  |
|-----------|-------------------------------------------------------------|
| App       | Next.js (App Router), React, TypeScript                     |
| Styling   | Tailwind CSS, Fraunces and Figtree fonts through next/font  |
| Planning  | Google Gemini API (model names set by environment variable) |
| Places    | Geoapify geocoding and places (OpenStreetMap data)          |
| Map       | Leaflet, react-leaflet, OpenStreetMap tiles                 |
| Validation| Zod                                                         |
| Hosting   | Vercel                                                      |

## How it is built

```
Browser  ->  POST /api/plan (Next.js route)  ->  Gemini  +  Geoapify
```

One endpoint does the work. For each request:

1. **Rate limit** per visitor (5 plans per hour, kept in memory).
2. **Validate the input** with Zod.
3. **Nominate.** Gemini lists the famous landmarks of the destination, names only (`days * 5 + 3` names, at most 35).
4. **Verify.** Each name is geocoded with Geoapify. Names that don't resolve to a real place within 30 km of the destination are dropped. Only verified places continue.
5. **Gather restaurants** near each landmark cluster, so every day has food nearby.
6. **Plan.** Gemini receives only the verified list, using short ids such as `p12`, and returns the itinerary as JSON. Real place ids are long and models garble them.
7. **Ground the answer.** Any stop whose id is not in the list is discarded, and the real place data is attached.
8. **Check the rules** (below). If any fail, ask again with the exact problems, up to 3 attempts, and keep the best plan.
9. **Return** the plan. The page draws it.

### Rules enforced in code

| Rule                                                                  | Where                  |
|-----------------------------------------------------------------------|------------------------|
| The requested number of days, 3 or 4 attractions per day             | `validate` in the route |
| A lunch starting 11:30 to 14:30 and a dinner starting 18:30 or later  | `validate`             |
| At most 2 museums per day (matched by name)                           | `validate`             |
| At least 2 well-known landmarks per day when enough exist             | `validate`             |
| Every stop within about 4 km of the day's centre                      | `validate`, Haversine  |
| Under 10 km of travel between a day's stops                           | `validate`             |
| No gap over 2.5 hours between daytime stops                           | `validate`             |
| No cafeteria or pastry-shop names as lunch or dinner                  | `validate`             |
| No place used twice                                                   | `validate`             |
| Only verified places appear in the output                             | grounding step         |

### Handling failures

- **Busy model.** Overload (503) and rate-limit (429) errors are retried with a short pause, then the fallback model is tried.
- **Time budget.** The route may run 60 seconds. It stops starting new model calls after 48 seconds and returns the best plan it has once 35 seconds have passed.
- **Unusable replies.** Model output is stripped of code fences, parsed and checked against a schema. The page also handles a non-JSON reply from the host.

## API

| Route            | Purpose                                                              |
|------------------|----------------------------------------------------------------------|
| `POST /api/plan` | Body: `destination`, `days` (1 to 7), `budget`, `interests`. Returns `trip` and `warnings`. |

`warnings` lists any rule the best plan still breaks.

## Run it locally

Requires Node.js 18 or newer.

```
git clone https://github.com/harinandhreddy0411/travel-companion.git
cd travel-companion
npm install
```

Create `.env.local` (see `.env.example`):

```
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_FALLBACK_MODEL=
GEOAPIFY_API_KEY=
```

`GEMINI_FALLBACK_MODEL` is optional. Get a Gemini key from Google AI Studio and a Geoapify key from myprojects.geoapify.com; both have free tiers. Model names change often, so pick a current Flash or Flash-Lite model from AI Studio.

```
npm run dev
```

Open http://localhost:3000.

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the Vercel setup.

## Known limits

- **Opening hours and closed days are not checked.** The data source does not provide them, so a plan can include a place that is closed that day.
- **No ratings or prices.** OpenStreetMap data has neither, so the travel style only steers the model. It is not a cost estimate.
- **Data quality varies by city.** Large, well-mapped cities work best.
- **Plans are not repeatable.** The same request can give different results.
- **Slow and dependent on a free tier.** A plan takes 20 to 45 seconds, and a busy model can fail a request.
- **Saved trips live in your browser** (`localStorage`) and do not sync between devices.
- **The rate limit is in memory.** It resets whenever the server restarts, so it is only a basic guard.
- **No automated tests yet.**

## Possible next steps

- Opening-hours data and day-of-week checks
- Accounts and a database for saved trips
- A persistent rate limit and pre-generated sample trips
- Tests for the rule checker
- Shareable trip links

## Credits

- Map data from OpenStreetMap contributors, served through Geoapify. Map tiles from OpenStreetMap.
- Map library: Leaflet.
- Fonts: Fraunces and Figtree, SIL Open Font License, loaded with next/font.

## Author

HarinandhReddy A ([GitHub](https://github.com/harinandhreddy0411))

## License

MIT. See [LICENSE](LICENSE).
