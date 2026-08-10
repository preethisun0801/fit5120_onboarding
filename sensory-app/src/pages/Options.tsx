// sensory-app/src/pages/Options.tsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Volume2, TreePine, Clock } from "lucide-react";
import { api, type ScoredRoute, type Refuge } from "../lib/api";
import Card from "../components/ui/Card";
import { usePreferences } from "../context/PreferencesContext";
import { toRouteWeights } from "../lib/preferences";

type NavState = {
  lat: number;
  lon: number;
  destLat: number;
  destLon: number;
  destination?: string;
  plannedTime?: string | null;
};

const LOW_COVERAGE_THRESHOLD = 0.3;

function formatDuration(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dp = ((bLat - aLat) * Math.PI) / 180;
  const dl = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function Options() {
  const { preferences } = usePreferences();
  const { state } = useLocation() as { state: NavState | null };
  const navigate = useNavigate();
  const hasJourney =
    !!state && state.destLat !== undefined && state.destLon !== undefined;

  // ---- Journey mode: rank routes between two points already chosen ----
  const [routes, setRoutes] = useState<ScoredRoute[]>([]);
  const [referenceTime, setReferenceTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasJourney) return;
    setLoading(true);
    setError(null);
    const weights = toRouteWeights(preferences);
    api
      .getRoutes(
        state!.lat,
        state!.lon,
        state!.destLat,
        state!.destLon,
        weights
      )
      .then((res) => {
        setRoutes(res.routes);
        setReferenceTime(res.reference_time);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [hasJourney, state]);

  // ---- Browse mode: no destination chosen yet — show nearby refuges ----
  const [here, setHere] = useState<[number, number] | null>(null);
  const [browseRefuges, setBrowseRefuges] = useState<Refuge[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [routingTo, setRoutingTo] = useState<number | null>(null);

  useEffect(() => {
    if (hasJourney) return;
    if (!navigator.geolocation) {
      setBrowseError("Geolocation isn't available in this browser.");
      setBrowseLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setHere([pos.coords.latitude, pos.coords.longitude]),
      () => {
        setBrowseError(
          "Couldn't get your location. Check browser permissions."
        );
        setBrowseLoading(false);
      }
    );
  }, [hasJourney]);

  useEffect(() => {
    if (hasJourney || !here) return;
    setBrowseLoading(true);
    api
      .getRefuges()
      .then(setBrowseRefuges)
      .catch(() => setBrowseError("Couldn't load quiet places right now."))
      .finally(() => setBrowseLoading(false));
  }, [hasJourney, here]);

  function routeToRefuge(r: Refuge) {
    if (!here) return;
    setRoutingTo(r.landmark_id);
    const weights = toRouteWeights(preferences);
    api
      .getRoutes(here[0], here[1], r.latitude, r.longitude, weights)
      .then((res) => {
        navigate("/Selected", {
          state: {
            routes: res.routes,
            selectedId:
              res.routes.find((x) => x.recommended)?.id ??
              res.routes[0]?.id ??
              null,
            start: [here[0], here[1]] as [number, number],
            end: [r.latitude, r.longitude] as [number, number],
            destination: r.feature_name,
            referenceTime: res.reference_time
          }
        });
      })
      .catch(() =>
        setBrowseError("Couldn't find a route to that spot right now.")
      )
      .finally(() => setRoutingTo(null));
  }

  // ---------------------------------------------------------------- browse mode UI
  if (!hasJourney) {
    return (
      <div className="max-w-2xl mx-auto px-6 pt-6 md:pt-24 pb-24 md:pb-6">
        <h1 className="text-xl font-semibold mb-1">Quiet spaces near you</h1>
        <p className="text-sm text-[var(--color-muted)] mb-4">
          Tap one to get walking directions from where you are now.
        </p>

        {browseLoading && (
          <p className="text-[var(--color-muted)]">Finding you…</p>
        )}
        {browseError && (
          <p className="text-[var(--color-danger)] text-sm">{browseError}</p>
        )}

        {!browseLoading && here && (
          <ul className="space-y-3">
            {browseRefuges
              .filter((r) => !preferences.indoorOnly || r.is_indoor)
              .map((r) => ({
                r,
                d: haversineM(here[0], here[1], r.latitude, r.longitude)
              }))
              .sort((a, b) => a.d - b.d)
              .map(({ r, d }) => (
                <li key={r.landmark_id}>
                  <Card
                    className="cursor-pointer hover:border-[var(--color-accent)] transition-colors"
                    onClick={() => routeToRefuge(r)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{r.feature_name}</span>
                      <span className="text-xs text-[var(--color-muted)]">
                        {routingTo === r.landmark_id
                          ? "Finding route…"
                          : formatDistance(d)}
                      </span>
                    </div>
                    <span className="text-xs uppercase text-[var(--color-muted)]">
                      {r.sensory_tier}
                      {r.is_indoor ? " · Indoor" : ""}
                    </span>
                  </Card>
                </li>
              ))}
          </ul>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- journey mode UI
  return (
    <div className="max-w-2xl mx-auto px-6 pt-6 md:pt-24 pb-24 md:pb-6">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-[var(--color-muted)]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold">
          Route options{state!.destination ? ` to ${state!.destination}` : ""}
        </h1>
      </div>

      {loading && (
        <p className="text-[var(--color-muted)]">Finding calmer routes…</p>
      )}
      {error && (
        <Card className="border-[var(--color-danger)]">
          <p className="text-[var(--color-danger)] text-sm">{error}</p>
        </Card>
      )}
      {!loading && !error && routes.length === 0 && (
        <p className="text-[var(--color-muted)]">
          No routes found for this journey.
        </p>
      )}
      {state!.plannedTime && (
        <p className="text-xs text-[var(--color-muted)] mb-3">
          Planning for{" "}
          {new Date(state!.plannedTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          })}{" "}
          — crowd and noise levels shown reflect current conditions, since
          future estimates aren't available yet.
        </p>
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
                      start: [state!.lat, state!.lon] as [number, number],
                      end: [state!.destLat, state!.destLon] as [number, number],
                      destination: state!.destination,
                      referenceTime,
                      plannedTime: state!.plannedTime
                    }
                  })
                }
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--color-muted-bg)] text-xs font-semibold">
                      {route.rank}
                    </span>
                    <span className="font-medium">
                      {route.recommended
                        ? "Recommended"
                        : `Option ${route.rank}`}
                    </span>
                  </div>
                  <span className="text-sm text-[var(--color-muted)]">
                    {formatDuration(route.duration_s)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-[var(--color-muted)]">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    {route.band} crowd
                  </span>
                  {route.noise.shown && (
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4" />
                      {route.noise.label}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <TreePine className="w-4 h-4" />
                    {route.refuges.length} quiet{" "}
                    {route.refuges.length === 1 ? "space" : "spaces"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {formatDistance(route.distance_m)}
                  </span>
                </div>

                {lowCoverage && (
                  <p className="text-xs text-[var(--color-muted)] mt-2">
                    Limited real-time data for this area — route shown by
                    distance and duration only.
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {referenceTime && !loading && routes.length > 0 && (
        <p className="text-xs text-[var(--color-muted)] mt-4">
          Conditions as of{" "}
          {new Date(referenceTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          })}
        </p>
      )}
    </div>
  );
}
