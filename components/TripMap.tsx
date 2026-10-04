"use client";

import { Fragment, useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DAY_COLORS } from "@/lib/colors";

type MapStop = { startTime: string; place: { name: string; lat: number; lng: number; type: string } };
type MapDay = { day: number; stops: MapStop[] };

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    if (!points.length) return;
    // The container may have been measured before layout settled; re-measure, then fit.
    map.invalidateSize();
    map.fitBounds(points, { padding: [30, 30], animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export default function TripMap({ days, activeDay }: { days: MapDay[]; activeDay: number | null }) {
  const visible = activeDay === null ? days : days.filter((d) => d.day === activeDay);
  const points: [number, number][] = visible.flatMap((d) => d.stops.map((s) => [s.place.lat, s.place.lng] as [number, number]));

  return (
    <MapContainer center={points[0] ?? [0, 0]} zoom={12} className="h-[28rem] w-full rounded-lg" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Fit points={points} />
      {visible.map((d) => {
        const color = DAY_COLORS[(d.day - 1) % DAY_COLORS.length];
        const ordered = [...d.stops].sort((a, b) => a.startTime.localeCompare(b.startTime));
        return (
          <Fragment key={d.day}>
            <Polyline positions={ordered.map((s) => [s.place.lat, s.place.lng] as [number, number])} pathOptions={{ color, weight: 3, opacity: 0.6, dashArray: "6 6" }} />
            {ordered.map((s, i) => (
              <CircleMarker
                key={`${d.day}-${i}`}
                center={[s.place.lat, s.place.lng]}
                radius={s.place.type === "restaurant" ? 6 : 9}
                pathOptions={{ color, fillColor: color, fillOpacity: s.place.type === "restaurant" ? 0.25 : 0.9, weight: 2 }}
              >
                <Tooltip>{`${s.startTime} · ${s.place.name}`}</Tooltip>
              </CircleMarker>
            ))}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}