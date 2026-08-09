import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Navigation2, MapPin, LogOut, Layers, X } from "lucide-react";
import { api, type Refuge } from "../lib/api";
import { useJourney } from "../context/JourneyContext";
import Button from "../components/ui/Button";
import CrowdDot from "../components/ui/CrowdDot";
import RouteMap from "../components/RouteMap";

// Close enough to a maneuver point to count as "arrived" and advance.
const ARRIVAL_RADIUS_M = 15;


function bandLevel(band: string): "low" | "moderate" | "high" {
  return band === "Low" ? "low" : band === "Moderate" ? "moderate" : "high";
}

function metres(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function minutes(seconds: number) {
  return Math.max(0, Math.round(seconds / 60));
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

export default function Way() {
  const navigate = useNavigate();
  const { journeyRef, route, position, geoError, routeChanged, loading, endJourney } = useJourney();

  const [localPosition, setLocalPosition] = useState<[number, number] | null>(null);
  const [localGeoError, setLocalGeoError] = useState<string | null>(null);
  const [quietOpen, setQuietOpen] = useState(false);
  const [quietLoading, setQuietLoading] = useState(false);
  const [quietError, setQuietError] = useState<string | null>(null);
  const [quietRefuges, setQuietRefuges] = useState<Refuge[]>([]);
  const watchId = useRef<number | null>(null);

  const nextStepIdx = journeyRef?.nextStepIdx ?? 1;
  const currentPosition = position ?? localPosition;
  const currentGeoError = geoError ?? localGeoError;

  useEffect(() => {
    if (!route || !navigator.geolocation) {
      setLocalGeoError(
        "Live location isn't available — showing the route without live tracking."
      );
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => setLocalPosition([pos.coords.latitude, pos.coords.longitude]),
      () =>
        setLocalGeoError(
          "Location access was denied — showing the route without live tracking."
        ),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [route]);

  // Advance through steps, persisted via Context — survives leaving this page.
  useEffect(() => {
    if (loading || (journeyRef && !route)) return;
    if (!route || !currentPosition) return;

    const target = route.steps[nextStepIdx];
    if (!target) return;

    const d = haversineM(
      currentPosition[0],
      currentPosition[1],
      target.lat,
      target.lon
    );

    if (d <= ARRIVAL_RADIUS_M) {
      if (nextStepIdx >= route.steps.length - 1) {
        endJourney();
      }
    }
  }, [currentPosition, route, nextStepIdx, endJourney, loading, journeyRef]);

  if (loading && !route) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24">
        <p className="text-[var(--color-muted)]">Resuming your journey…</p>
      </div>
    );
  }

  if (!journeyRef || !route) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24">
        <p>No active journey.</p>
        <button onClick={() => navigate("/Options")} className="underline mt-2">
          Back to Options
        </button>
      </div>
    );
  }

  const steps = route.steps;
  const upcoming = steps[nextStepIdx] ?? null;

  function openQuietSpaces() {
    setQuietOpen(true);
    if (quietRefuges.length > 0 || quietLoading) return;
    setQuietLoading(true);
    setQuietError(null);
    api
      .getRefuges()
      .then(setQuietRefuges)
      .catch(() => setQuietError("Couldn't load quiet places right now."))
      .finally(() => setQuietLoading(false));
  }

  const arrived =
    steps.length > 0 && nextStepIdx >= steps.length - 1 && !!upcoming;

  const distToNext =
    currentPosition && upcoming
      ? haversineM(
          currentPosition[0],
          currentPosition[1],
          upcoming.lat,
          upcoming.lon
        )
      : (upcoming?.distance_m ?? 0);

  // Approximation: remaining distance is what's left of the current leg plus
  // every full leg after it. This doesn't project your position onto the
  // path itself, so it can drift a little if you stray off-route, but it's
  // close enough to be useful without a full map-matching implementation.
  const remainingLegs = route.steps
    .slice(nextStepIdx)
    .reduce((sum, s) => sum + s.distance_m, 0);
  const remainingDistance = distToNext + remainingLegs;
  const rawRemainingDuration =
    route.distance_m > 0
      ? (remainingDistance / route.distance_m) * route.duration_s
      : 0;

  // Guards against a bad/mismatched GPS reading producing an absurd ETA even
  // if remainingDistance itself slips past the position-validity check above.
  const remainingDuration = Math.min(
    rawRemainingDuration,
    route.duration_s * 1.5
  );

  // Crowd warning ahead: any sampled point within the next ~250m scoring at
  // or above this route's worst_cutoff.
  const aheadWarning =
    currentPosition && route.worst_cutoff !== null
      ? route.points.some(
          (p) =>
            p.score !== null &&
            p.score >= (route.worst_cutoff as number) &&
            haversineM(currentPosition[0], currentPosition[1], p.lat, p.lon) <= 250
        )
      : false;
  // Leg length from the *previous* point to this one — the honest reference
  // for "how far this step should be." Falls back to the step's own forward
  // distance if there's no previous step (e.g. nextStepIdx === 0 case).
  const referenceLegLength =
    route.steps[nextStepIdx - 1]?.distance_m ?? upcoming?.distance_m ?? 0;

  const positionLooksValid =
    !currentPosition || !upcoming || referenceLegLength === 0
      ? true
      : distToNext <= Math.max(referenceLegLength * 3, 100); // generous slack, not exact

  const effectiveDistToNext = positionLooksValid
    ? distToNext
    : referenceLegLength;

  return (
    <div className="max-w-md mx-auto px-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">On your way</h1>
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <span>{minutes(remainingDuration)} min remaining</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1">
            Sensory load: {route.band}{" "}
            <CrowdDot level={bandLevel(route.band)} />
          </span>
        </div>
      </div>
      
      {currentGeoError && (
        <p className="text-xs text-[var(--color-muted)] mb-3">{currentGeoError}</p>
      )}

      <div className="rounded-lg border border-[var(--color-border)] h-48 md:h-56 mb-4 overflow-hidden">
        <RouteMap
          routes={[route]}
          selectedId={route.id}
          onSelect={() => {}}
          start={currentPosition ?? route.geometry[0]}
          end={route.geometry[route.geometry.length - 1]}
        />
      </div>
      {routeChanged && (
  <p className="text-xs text-[var(--color-muted)] mb-3">
    Conditions changed since you started — showing an updated route and
    restarting turn-by-turn from here.
  </p>
)}
      {arrived ? (
        <div className="rounded-lg border border-[var(--color-border)] p-4 mb-4">
          <p className="font-medium mb-1">You've arrived</p>
          <p className="text-sm text-[var(--color-muted)]">
            {journeyRef?.destinationLabel ?? "Destination"} is right here.
          </p>
        </div>
      ) : upcoming ? (
        <div className="rounded-lg border border-[var(--color-border)] p-4 mb-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">
            In {metres(effectiveDistToNext)}
          </p>
          <div className="flex items-center gap-2">
            <Navigation2 className="w-5 h-5 text-[var(--color-foreground)] shrink-0" />
            <p className="font-medium">{upcoming.instruction}</p>
          </div>
        </div>
      ) : null}
      {!positionLooksValid && (
        <p className="text-xs text-[var(--color-muted)] mb-2">
          Your location doesn't match this route — showing planned distances
          instead of live ones.
        </p>
      )}
      {aheadWarning && (
        <button
          onClick={() => navigate("/Selected", { state: { route } })}
          className="w-full flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-4 mb-4 text-left"
        >
          <Users className="w-5 h-5 text-[var(--color-muted)] shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Moderate crowd ahead</p>
            <p className="text-xs text-[var(--color-muted)]">
              A busier stretch is coming up on this route.
            </p>
          </div>
        </button>
      )}

      {quietOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/30">
          <div className="w-full md:max-w-sm bg-[var(--color-card)] rounded-t-2xl md:rounded-2xl border border-[var(--color-border)] max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <p className="font-medium">Quiet places nearby</p>
              <button
                onClick={() => setQuietOpen(false)}
                className="text-[var(--color-muted)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {quietLoading && (
                <p className="text-sm text-[var(--color-muted)]">Loading…</p>
              )}
              {quietError && (
                <p className="text-sm text-[var(--color-danger)]">
                  {quietError}
                </p>
              )}

              {!quietLoading && !quietError && (
                <ul className="space-y-2">
                  {quietRefuges
                    .map((r) => {
                      const anchor = position ?? route.geometry[0];
                      return {
                        r,
                        d: haversineM(
                          anchor[0],
                          anchor[1],
                          r.latitude,
                          r.longitude
                        )
                      };
                    })
                    .sort((a, b) => a.d - b.d)
                    .slice(0, 6)
                    .map(({ r, d }) => (
                      <li key={r.landmark_id}>
                        <button
                          onClick={() => {
                            const anchor = currentPosition ?? route.geometry[0];
                            setQuietOpen(false);
                            navigate("/Options", {
                              state: {
                                lat: anchor[0],
                                lon: anchor[1],
                                destLat: r.latitude,
                                destLon: r.longitude,
                                destination: r.feature_name
                              }
                            });
                          }}
                          className="w-full flex items-center justify-between text-left rounded-lg border border-[var(--color-border)] px-3 py-2.5 hover:border-[var(--color-accent)]"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {r.feature_name}
                            </p>
                            <p className="text-xs text-[var(--color-muted)]">
                              {r.is_indoor ? "Indoor" : "Outdoor"} ·{" "}
                              {r.sensory_tier}
                            </p>
                          </div>
                          <span className="text-xs text-[var(--color-muted)] shrink-0 ml-2">
                            {metres(d)}
                          </span>
                        </button>
                      </li>
                    ))}
                  {quietRefuges.length === 0 && (
                    <p className="text-sm text-[var(--color-muted)]">
                      No quiet places found.
                    </p>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Button
          className="w-full flex items-center justify-center gap-2"
          onClick={openQuietSpaces}
        >
          <MapPin className="w-4 h-4" /> Find quiet space
        </Button>
        <Button
          variant="outline"
          className="w-full flex items-center justify-center gap-2"
          onClick={() =>
            navigate("/Selected", {
              state: {
                routes: [route],
                selectedId: route.id,
                start: route.geometry[0],
                end: route.geometry[route.geometry.length - 1],
                destination: journeyRef?.destinationLabel,
                referenceTime: null
              }
            })
          }
        >
          <Layers className="w-4 h-4" /> View route overview
        </Button>
        <Button
          variant="ghost"
          className="w-full flex items-center justify-center gap-2"
          onClick={() => {
            endJourney();
            navigate("/");
          }}
        >
          <LogOut className="w-4 h-4" /> Exit
        </Button>
      </div>
    </div>
  );
}
