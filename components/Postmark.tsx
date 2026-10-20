import { useId } from "react";

// A postmark stamp: the one decorative element in the design.
export default function Postmark({ city, days }: { city: string; days: number }) {
  const id = useId().replace(/:/g, "");
  const label = `${city} - ${days} ${days === 1 ? "day" : "days"}`.toUpperCase().slice(0, 30);
  return (
    <svg viewBox="0 0 160 160" className="h-28 w-28 shrink-0 -rotate-6 text-moss" role="img" aria-label={`${days} days in ${city}`}>
      <defs>
        <path id={`${id}a`} d="M80,80 m-57,0 a57,57 0 1,1 114,0 a57,57 0 1,1 -114,0" />
      </defs>
      <circle cx="80" cy="80" r="75" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="80" cy="80" r="42" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text fontSize="12.5" fontWeight="700" letterSpacing="2.2" fill="currentColor" style={{ fontFamily: "var(--font-figtree)" }}>
        <textPath href={`#${id}a`}>{label}</textPath>
      </text>
      <text x="80" y="92" textAnchor="middle" fontSize="40" fontWeight="700" fill="currentColor" style={{ fontFamily: "var(--font-fraunces)" }}>
        {days}
      </text>
    </svg>
  );
}