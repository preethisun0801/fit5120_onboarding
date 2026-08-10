// sensory-app/src/components/RouteMap.tsx
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ScoredRoute } from "../lib/api";

/**
 * Draws candidate walking routes and marks the busiest stretch of the selected
 * one.
 *
 * Colours come from the tokens in index.css. The crowd scale there is
 * value-based rather than hue-based, which stays readable without colour
 * discrimination, so nothing here introduces a competing palette.
 *
 * The selected route is drawn in --color-primary with its busiest stretch
 * overlaid in --color-route, reading like a highlighter over the path. That
 * stretch is the point of the product: an average hides the one block that is
 * unbearable, and for a sensory-sensitive traveller that block decides the walk.
 */

type Props = {
  routes: ScoredRoute[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  start: [number, number];
  end: [number, number];
  showWorst?: boolean;
};

function token(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function endpointIcon(letter: string, fill: string) {
  return L.divIcon({
    className: "",
    html: `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
             <circle cx="13" cy="13" r="12" fill="${fill}"/>
             <text x="13" y="17.5" text-anchor="middle" fill="#fff"
                   font-size="12" font-weight="600"
                   font-family="Geist, system-ui, sans-serif">${letter}</text>
           </svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function refugeIcon(indoor: boolean, fill: string) {
  const glyph = indoor
    ? `<rect x="7" y="9" width="10" height="8" rx="1" fill="#fff"/>
       <path d="M6 9.5 12 5l6 4.5" stroke="#fff" stroke-width="2"
             fill="none" stroke-linejoin="round"/>`
    : `<path d="M12 5.5c2.8 2.4 4.2 4.8 4.2 7.2a4.2 4.2 0 0 1-8.4 0c0-2.4 1.4-4.8 4.2-7.2z"
             fill="#fff"/>`;
  return L.divIcon({
    className: "",
    html: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
             <circle cx="12" cy="12" r="11" fill="${fill}"/>${glyph}
           </svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export default function RouteMap({
  routes,
  selectedId,
  onSelect,
  start,
  end,
  showWorst = true,
}: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const drawn = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!holder.current || map.current) return;

    map.current = L.map(holder.current, {
      zoomControl: true,
      // Inertia scrolling can feel disorienting; this audience does not need it.
      inertia: false,
    }).setView([-37.813, 144.963], 15);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, ' +
          '&copy; <a href="https://carto.com/attributions">CARTO</a> | ' +
          "Sensor data &copy; City of Melbourne (CC BY 4.0)",
        maxZoom: 19,
      }
    ).addTo(map.current);

    drawn.current = L.layerGroup().addTo(map.current);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !drawn.current) return;

    const primary = token("--color-primary", "#14171F");
    const highlight = token("--color-route", "#F5C518");
    const muted = token("--color-muted", "#6B7280");
    const accent = token("--color-accent", "#2F5FE0");

    const group = drawn.current;
    group.clearLayers();

    const active = routes.find((r) => r.id === selectedId) ?? null;

    routes
      .filter((r) => r.id !== selectedId)
      .forEach((r) => {
        L.polyline(r.geometry, { color: muted, weight: 4, opacity: 0.4 })
          .on("click", () => onSelect(r.id))
          .bindTooltip(`Option ${r.rank}`, { sticky: true })
          .addTo(group);
      });

    if (active) {
      L.polyline(active.geometry, {
        color: primary,
        weight: 6,
        opacity: 0.9,
      }).addTo(group);

      if (showWorst && active.worst_cutoff !== null) {
        const cutoff = active.worst_cutoff;
        active.points
          .filter((p) => p.score !== null && p.score >= cutoff)
          .forEach((p) => {
            L.circleMarker([p.lat, p.lon], {
              radius: 8,
              color: highlight,
              weight: 3,
              fillColor: highlight,
              fillOpacity: 0.45,
            })
              .bindTooltip(
                p.sensor ? `Busiest stretch — near ${p.sensor}` : "Busiest stretch",
                { direction: "top" }
              )
              .addTo(group);
          });
      }

      // Stretches with no sensor in range. Marked so a gap in the data reads as
      // a gap rather than as calm.
      active.points
        .filter((p) => p.score === null)
        .forEach((p) => {
          L.circleMarker([p.lat, p.lon], {
            radius: 4,
            color: muted,
            weight: 1,
            fillOpacity: 0,
            dashArray: "2,2",
          })
            .bindTooltip("No sensor nearby — not rated", { direction: "top" })
            .addTo(group);
        });

      active.refuges.forEach((rf) => {
        L.marker([rf.lat, rf.lon], { icon: refugeIcon(rf.indoor, accent) })
          .bindPopup(
            `<div style="font-family:Geist,system-ui,sans-serif;min-width:160px">
               <strong>${rf.name}</strong><br/>
               <span style="color:${muted};font-size:13px">
                 ${rf.indoor ? "Indoor" : "Outdoor"} &middot; ${rf.distance_m} m away
               </span>
             </div>`
          )
          .addTo(group);
      });

      map.current.fitBounds(L.polyline(active.geometry).getBounds(), {
        padding: [40, 40],
      });
    }

    L.marker(start, { icon: endpointIcon("A", primary) })
      .bindTooltip("Start", { direction: "top" })
      .addTo(group);
    L.marker(end, { icon: endpointIcon("B", primary) })
      .bindTooltip("Destination", { direction: "top" })
      .addTo(group);
  }, [routes, selectedId, onSelect, start, end, showWorst]);

  return (
    <div
      ref={holder}
      role="application"
      aria-label="Map of walking route options"
      className="w-full h-full rounded-lg border border-[var(--color-border)]"
    />
  );
}
