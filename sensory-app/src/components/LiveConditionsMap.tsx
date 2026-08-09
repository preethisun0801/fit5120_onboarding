// sensory-app/src/components/LiveConditionsMap.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Overview map for the home page.
 *
 * Before a destination is chosen there is no route to score, so this answers a
 * different question: how does the city feel right now, and where could I step
 * out of it. Sensors are drawn as graduated dots and curated quiet places as
 * markers.
 *
 * Colours come from the crowd scale in index.css, which is value-based rather
 * than hue-based and so stays readable without colour discrimination. Size
 * carries the same information as value, so the busiest places read as busiest
 * even in greyscale.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

type Band = "Low" | "Moderate" | "High";

type LiveSensor = {
  location_id: number;
  name: string;
  lat: number;
  lon: number;
  score: number;
  band: Band;
  count_last_hour: number;
};

type LiveResponse = {
  reference_time: string;
  summary: {
    total: number;
    Low: number;
    Moderate: number;
    High: number;
    dominant: Band;
  };
  sensors: LiveSensor[];
};

type LiveRefuge = {
  landmark_id: number;
  name: string;
  lat: number;
  lon: number;
  tier: string;
  indoor: boolean;
};

function token(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
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
    html: `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
             <circle cx="12" cy="12" r="11" fill="${fill}"/>${glyph}
           </svg>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

export default function LiveConditionsMap({
  className = "",
  interactive = true,
  onSummary
}: {
  className?: string;
  interactive?: boolean;
  onSummary?: (
    summary: {
      band: "Low" | "Moderate" | "High";
      low: number;
      moderate: number;
      high: number;
    } | null
  ) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  const [data, setData] = useState<LiveResponse | null>(null);
  const [refuges, setRefuges] = useState<LiveRefuge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showRefuges, setShowRefuges] = useState(true);

  useLayoutEffect(() => {
    if (!holder.current || map.current) return;

    const mapInstance = L.map(holder.current, {
      zoomControl: interactive,
      inertia: false,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive
    }).setView([-37.8136, 144.9631], 14);

    map.current = mapInstance;

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, ' +
          '&copy; <a href="https://carto.com/attributions">CARTO</a> | ' +
          "Sensor data &copy; City of Melbourne (CC BY 4.0)",
        maxZoom: 19
      }
    ).addTo(mapInstance);

    layer.current = L.layerGroup().addTo(mapInstance);

    const refreshMap = () => mapInstance.invalidateSize();
    refreshMap();
    window.addEventListener("resize", refreshMap);
    window.addEventListener("orientationchange", refreshMap);

    return () => {
      window.removeEventListener("resize", refreshMap);
      window.removeEventListener("orientationchange", refreshMap);
      mapInstance.remove();
      map.current = null;
      layer.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${BASE_URL}/live/sensors`).then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<LiveResponse>;
      }),
      fetch(`${BASE_URL}/live/refuges`).then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<LiveRefuge[]>;
      })
    ]).then(([live, rf]) => {
      if (cancelled) return;
      setData(live);
      setRefuges(rf);

      if (onSummary) {
        const sensors = live.sensors ?? [];
        if (sensors.length === 0) {
          onSummary(null);
        } else {
          const counts = { Low: 0, Moderate: 0, High: 0 };
          for (const s of sensors) counts[s.band]++;
          // Overall band = whichever level has the most sensors reporting it —
          // a simple majority vote rather than averaging raw scores, so one
          // extreme outlier sensor can't skew the headline summary.
          const band = (Object.keys(counts) as (keyof typeof counts)[]).reduce(
            (a, b) => (counts[a] >= counts[b] ? a : b)
          );
          onSummary({
            band,
            low: counts.Low,
            moderate: counts.Moderate,
            high: counts.High
          });
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current || !data) return;

    const scale: Record<Band, string> = {
      Low: token("--color-crowd-low", "#D4D4D2"),
      Moderate: token("--color-crowd-moderate", "#6B7280"),
      High: token("--color-crowd-high", "#1F2430")
    };
    const accent = token("--color-accent", "#2F5FE0");
    const muted = token("--color-muted", "#6B7280");

    const group = layer.current;
    group.clearLayers();

    data.sensors.forEach((s) => {
      // Radius carries the same message as the fill value, so the map still
      // reads if colour is hard to distinguish.
      const radius = s.band === "High" ? 9 : s.band === "Moderate" ? 6.5 : 4.5;
      L.circleMarker([s.lat, s.lon], {
        radius,
        color: scale[s.band],
        weight: 1,
        fillColor: scale[s.band],
        fillOpacity: 0.75
      })
        .bindPopup(
          `<div style="font-family:Geist,system-ui,sans-serif;min-width:170px">
             <strong>${s.name}</strong><br/>
             <span style="color:${muted};font-size:13px">
               ${s.band} for this hour &middot;
               ${s.count_last_hour.toLocaleString()} people in the last hour
             </span>
           </div>`
        )
        .addTo(group);
    });

    if (showRefuges) {
      refuges.forEach((rf) => {
        L.marker([rf.lat, rf.lon], { icon: refugeIcon(rf.indoor, accent) })
          .bindPopup(
            `<div style="font-family:Geist,system-ui,sans-serif;min-width:150px">
               <strong>${rf.name}</strong><br/>
               <span style="color:${muted};font-size:13px">
                 ${rf.indoor ? "Indoor" : "Outdoor"} quiet place
               </span>
             </div>`
          )
          .addTo(group);
      });
    }
  }, [data, refuges, showRefuges]);

  return (
    <div className={`flex h-full min-h-[320px] flex-col gap-2 ${className}`}>
      <div
        ref={holder}
        role="application"
        aria-label="Live sensory conditions across the central city"
        className={`h-full min-h-[320px] w-full rounded-lg border border-[var(--color-border)] ${
          !interactive ? "pointer-events-none" : ""
        }`}
      />

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      {interactive && data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-crowd-low)]" />
            Quieter than usual ({data.summary.Low})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-crowd-moderate)]" />
            About usual ({data.summary.Moderate})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[var(--color-crowd-high)]" />
            Busier than usual ({data.summary.High})
          </span>

          <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={showRefuges}
              onChange={(e) => setShowRefuges(e.target.checked)}
            />
            Show quiet places
          </label>
        </div>
      )}

      {interactive && data && (
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          Each sensor is compared with its own history for this hour and
          weekday, so a busy street at midday can read calmer than a quiet one
          at midnight. As at{" "}
          {new Date(data.reference_time).toLocaleString("en-AU", {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit"
          })}
          .
        </p>
      )}
    </div>
  );
}
