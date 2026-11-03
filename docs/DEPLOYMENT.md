# Deployment

The app runs on Vercel. GitHub Pages cannot host it: Pages serves static files only, and this app needs server code (`/api/plan`) that keeps the API keys secret.

## What you need

- A GitHub repository with the code
- A Gemini API key (Google AI Studio)
- A Geoapify API key (myprojects.geoapify.com)
- A free Vercel account, signed in with GitHub

## 1. Before pushing

- Run `npm run build` locally. It must finish without errors, because Vercel runs the same build.
- Confirm `.env.local` is ignored: `git check-ignore -v .env.local` must print a line.
- `.env.example` lists the variable names with empty values. It is committed on purpose.

## 2. Deploy

1. In Vercel choose **Add New, Project** and import the repository.
2. Leave the framework as **Next.js**. Do not change the build settings.
3. Under **Environment Variables** add:

| Name                    | Value                                  | Required |
|-------------------------|----------------------------------------|----------|
| `GEMINI_API_KEY`        | your Gemini key                        | yes      |
| `GEMINI_MODEL`          | a current Flash or Flash-Lite model    | yes      |
| `GEMINI_FALLBACK_MODEL` | a second model, used when the first is busy | no  |
| `GEOAPIFY_API_KEY`      | your Geoapify key                      | yes      |

4. Click **Deploy**. Open the address listed under **Domains**.

## 3. Updating

Every push to `main` starts a new build and deploys it. Nothing needs to be clicked.

**Changing an environment variable does not affect existing builds.** After editing one, open Deployments, pick the latest one and choose Redeploy.

## 4. Which address to share

- **The address under Domains** (for example `project-name.vercel.app`) always points to the newest production build. Share this one.
- The long addresses with random letters point to one specific build. Vercel can protect them with a login, so visitors may see a sign-in page.

Test the shared address in a private window, signed out of Vercel.

## 5. Limits to know

- The route sets `maxDuration = 60`. A plan takes 20 to 45 seconds, so a slow run can approach the limit. The app stops starting new model calls after 48 seconds. Check your plan's function time limit in Vercel if requests time out.
- The rate limit and the one-hour cache live in server memory. On Vercel the server restarts often and runs as several instances, so neither is reliable. Use a shared store such as Redis if you need real limits.
- Free tiers of Gemini and Geoapify have daily and per-minute limits. Public traffic can use them up.

## Troubleshooting

| Symptom                                                    | Likely cause and fix                                                                 |
|------------------------------------------------------------|--------------------------------------------------------------------------------------|
| "The planner took too long or crashed"                     | The request ran past the time limit. Open Vercel **Logs** and look for a timeout. Try fewer days. |
| "The AI model is busy right now"                           | Gemini returned overload errors. Wait a minute, or set `GEMINI_FALLBACK_MODEL`.       |
| "Rate limit reached"                                       | More than 5 plans in an hour from one address. Wait, or raise the limit in `lib/rateLimit.ts`. |
| Error mentioning a key or `undefined`                      | An environment variable is missing or misspelled. Fix it in Vercel, then redeploy.    |
| "model not found"                                          | The model name is wrong or retired. Pick a current name from AI Studio.               |
| Build fails on Vercel                                      | Run `npm run build` locally and fix the first error it prints.                        |
| Map is blank or in the wrong place                         | Hard refresh. Check the browser console for errors.                                   |

## Making the repository public

- Search the history for secrets: `git log --all -p | Select-String "AIza"` on PowerShell, and search for the first characters of your Geoapify key. Nothing should match.
- `git log --all --oneline -- .env.local` must print nothing.
- If a key ever reached GitHub, rotate it in Google AI Studio or Geoapify before publishing. Deleting the file is not enough, because history keeps it.
