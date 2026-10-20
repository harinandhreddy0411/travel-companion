"use client";

import { Fragment, useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DAY_COLORS } from "@/lib/colors";

type MapStop = { startTime: string; place: { name: string; lat: number; lng: number; type: string } };
type MapDay = { day: number; stops: MapStop[] };
export type Selected = { day: number; index: number } | null;

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    if (!points.length) return;
    map.invalidateSize();
    map.fitBounds(points, { padding: [30, 30], animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function FlyTo({ lat, lng }: { lat?: number; lng?: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true });
  }, [map, lat, lng]);
  return null;
}

export default function TripMap({ days, activeDay, selected }: { days: MapDay[]; activeDay: number | null; selected: Selected }) {
  const visible = activeDay === null ? days : days.filter((d) => d.day === activeDay);
  const points = visible.flatMap((d) => d.stops.map((s) => [s.place.lat, s.place.lng] as [number, number]));
  const sel = selected ? days.find((d) => d.day === selected.day)?.stops[selected.index]?.place : undefined;

  return (
    <MapContainer center={points[0] ?? [0, 0]} zoom={12} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit points={points} />
      <FlyTo lat={sel?.lat} lng={sel?.lng} />
      {visible.map((d) => {
        const color = DAY_COLORS[(d.day - 1) % DAY_COLORS.length];
        return (
          <Fragment key={d.day}>
            <Polyline positions={d.stops.map((s) => [s.place.lat, s.place.lng] as [number, number])} pathOptions={{ color, weight: 3, opacity: 0.6, dashArray: "6 6" }} />
            {d.stops.map((s, i) => {
              const isSel = selected?.day === d.day && selected.index === i;
              const meal = s.place.type === "restaurant";
              return (
                <CircleMarker
                  key={`${d.day}-${i}-${isSel}`}
                  center={[s.place.lat, s.place.lng]}
                  radius={isSel ? 13 : meal ? 6 : 9}
                  pathOptions={{ color: isSel ? "#2b2118" : color, fillColor: color, fillOpacity: meal && !isSel ? 0.3 : 0.9, weight: isSel ? 4 : 2 }}
                >
                  <Tooltip permanent={isSel} direction="top">{`${s.startTime} ${s.place.name}`}</Tooltip>
                </CircleMarker>
              );
            })}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}