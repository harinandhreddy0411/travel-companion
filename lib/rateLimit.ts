// Simple per-IP limiter. In-memory only: resets on server restart / serverless cold start.
// Good enough to protect a free-tier demo; swap for Upstash Redis if you deploy publicly.
const hits = new Map<string, number[]>();

export function rateLimit(ip: string, max = 5, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}