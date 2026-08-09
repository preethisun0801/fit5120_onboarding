// sensory-app/src/pages/Selected.tsx
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Users,
  Volume2,
  TreePine,
  Clock,
  AlertCircle
} from "lucide-react";
import type { ScoredRoute } from "../lib/api";
import RouteMap from "../components/RouteMap";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import CrowdDot from "../components/ui/CrowdDot";
import { useJourney } from "../context/JourneyContext";

type NavState = {
  routes: ScoredRoute[];
  selectedId: number;
  start: [number, number];
  end: [number, number];
  destination?: string;
  referenceTime: string | null;
  plannedTime?: string | null;
};

const LOW_COVERAGE_THRESHOLD = 0.3;

function bandToCrowdLevel(
  band: ScoredRoute["band"]
): "low" | "moderate" | "high" {
  if (band === "Low") return "low";
  if (band === "Moderate") return "moderate";
  return "high";
}

function formatDuration(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

export default function Selected() {
  const { startJourney } = useJourney();
  const { state } = useLocation() as { state: NavState | null };
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(
    state?.selectedId ?? null
  );

  if (!state || !state.routes?.length) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24">
        <p>No route selected.</p>
        <button onClick={() => navigate("/Options")} className="underline mt-2">
          Back to Options
        </button>
      </div>
    );
  }

  const active =
    state.routes.find((r) => r.id === selectedId) ?? state.routes[0];
  const lowCoverage = active.sensor_coverage < LOW_COVERAGE_THRESHOLD;

  return (
    <div className="md:grid md:grid-cols-[380px_1fr] md:h-[calc(100vh-4rem)]">
      {/* Detail panel */}
      <div className="p-5 md:p-6 md:border-r border-[var(--color-border)] md:overflow-y-auto order-2 md:order-1">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/Options")}
            className="text-[var(--color-muted)]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">
            {active.recommended
              ? "Recommended route"
              : `Route option ${active.rank}`}
          </h1>
        </div>
        {state.destination && (
          <p className="text-sm text-[var(--color-muted)] mb-4">
            To {state.destination}
          </p>
        )}
        {/* Other route options, tappable to switch which one is highlighted */}
        {state.routes.length > 1 && (
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
            {state.routes.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm border ${
                  r.id === active.id
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] border-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)]"
                }`}
              >
                Option {r.rank}
              </button>
            ))}
          </div>
        )}
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Crowd level
            </span>
            <span className="text-sm flex items-center gap-1.5">
              {active.band} <CrowdDot level={bandToCrowdLevel(active.band)} />
            </span>
          </div>

          {active.noise.shown && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Volume2 className="w-4 h-4" /> Noise
              </span>
              <span className="text-sm text-[var(--color-muted)]">
                {active.noise.label}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <TreePine className="w-4 h-4" /> Quiet spaces on the way
            </span>
            <span className="text-sm text-[var(--color-muted)]">
              {active.refuges.length}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> Distance / time
            </span>
            <span className="text-sm text-[var(--color-muted)]">
              {formatDistance(active.distance_m)} ·{" "}
              {formatDuration(active.duration_s)}
            </span>
          </div>

          {lowCoverage && (
            <div className="flex items-start gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
              <AlertCircle className="w-4 h-4 text-[var(--color-muted)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--color-muted)]">
                Limited real-time data for this area — this route is ranked
                mostly by distance and duration rather than measured crowd/noise
                conditions.
              </p>
            </div>
          )}
        </Card>
        {active.refuges.length > 0 && (
          <div className="mb-5">
            <p className="text-sm font-medium mb-2">
              Quiet spaces along the way
            </p>
            <ul className="space-y-2">
              {active.refuges.map((rf) => (
                <li
                  key={rf.landmark_id}
                  className="flex items-center justify-between text-sm border border-[var(--color-border)] rounded-lg px-3 py-2"
                >
                  <span>{rf.name}</span>
                  <span className="text-[var(--color-muted)]">
                    {rf.distance_m} m
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      
        <Button
          className="w-full mt-2"
          onClick={() => {
            startJourney(active, state.start, state.end, state.destination);
            navigate("/Way");
          }}
        >
          Start journey
        </Button>
        {state.referenceTime && (
          <p className="text-xs text-[var(--color-muted)] mt-4">
            Conditions as of{" "}
            {new Date(state.referenceTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })}
          </p>
        )}
        {state.plannedTime && (
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Planning for{" "}
            {new Date(state.plannedTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })}{" "}
            — shown conditions are current, not a forecast for that time.
          </p>
        )}
      </div>

      {/* Map panel */}
      <div className="order-1 md:order-2 h-[45vh] md:h-full p-0 md:p-6">
        <RouteMap
          routes={state.routes}
          selectedId={active.id}
          onSelect={setSelectedId}
          start={state.start}
          end={state.end}
        />
      </div>
    </div>
  );
}
