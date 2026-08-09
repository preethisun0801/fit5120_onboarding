// sensory-app/src/pages/Options.tsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Volume2, TreePine, Clock } from "lucide-react";
import { api, type ScoredRoute } from "../lib/api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import CrowdDot from "../components/ui/CrowdDot";

type NavState = {
  lat: number;
  lon: number;
  destLat: number;
  destLon: number;
  destination?: string;
};

// route.sensor_coverage below this share of sampled points had no sensor
// nearby — score exists but is thin, worth flagging rather than hiding.
const LOW_COVERAGE_THRESHOLD = 0.3;

function bandToCrowdLevel(band: ScoredRoute["band"]): "low" | "moderate" | "high" {
  if (band === "Low") return "low";
  if (band === "Moderate") return "moderate";
  return "high";
}

function formatDuration(seconds: number) {
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

export default function Options() {
  const { state } = useLocation() as { state: NavState | null };
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<ScoredRoute[]>([]);
  const [referenceTime, setReferenceTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    setLoading(true);
    setError(null);

    api
      .getRoutes(state.lat, state.lon, state.destLat, state.destLon)
      .then((res) => {
        setRoutes(res.routes);
        setReferenceTime(res.reference_time);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [state]);

  if (!state || state.destLat === undefined || state.destLon === undefined) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24">
        <p>No journey set. Go back and choose a starting point and destination.</p>
        <button onClick={() => navigate("/")} className="underline mt-2">
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 pt-6 md:pt-24 pb-24 md:pb-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate("/")} className="text-[var(--color-muted)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold">
          Route options{state.destination ? ` to ${state.destination}` : ""}
        </h1>
      </div>

      {loading && <p className="text-[var(--color-muted)]">Finding calmer routes…</p>}

      {error && (
        <Card className="border-[var(--color-danger)]">
          <p className="text-[var(--color-danger)] text-sm">{error}</p>
        </Card>
      )}

      {!loading && !error && routes.length === 0 && (
        <p className="text-[var(--color-muted)]">No routes found for this journey.</p>
      )}

      <ul className="space-y-3">
        {routes.map((route) => {
          const lowCoverage = route.sensor_coverage < LOW_COVERAGE_THRESHOLD;
          return (
            <li key={route.id}>
              <Card
                className="cursor-pointer hover:border-[var(--color-accent)] transition-colors"
                onClick={() =>
                  navigate("/Selected", {
                    state: {
                      routes,
                      selectedId: route.id,
                      start: [state.lat, state.lon] as [number, number],
                      end: [state.destLat, state.destLon] as [number, number],
                      destination: state.destination,
                      referenceTime,
                    },
                  })
                }
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--color-muted-bg)] text-xs font-semibold">
                      {route.rank}
                    </span>
                    <span className="font-medium">
                      {route.recommended ? "Recommended" : `Option ${route.rank}`}
                    </span>
                  </div>
                  <span className="text-sm text-[var(--color-muted)]">
                    {formatDuration(route.duration_s)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-[var(--color-muted)]">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    {route.band} crowd <CrowdDot level={bandToCrowdLevel(route.band)} />
                  </span>

                  {route.noise.shown && (
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4" />
                      {route.noise.label}
                    </span>
                  )}

                  <span className="flex items-center gap-1.5">
                    <TreePine className="w-4 h-4" />
                    {route.refuges.length} quiet {route.refuges.length === 1 ? "space" : "spaces"}
                  </span>

                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {formatDistance(route.distance_m)}
                  </span>
                </div>

                {lowCoverage && (
                  <p className="text-xs text-[var(--color-muted)] mt-2">
                    Limited real-time data for this area — route shown by distance and duration only.
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {referenceTime && !loading && routes.length > 0 && (
        <p className="text-xs text-[var(--color-muted)] mt-4">
          Conditions as of {new Date(referenceTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}