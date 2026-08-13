import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Navigation2,
  MapPin,
  LogOut,
  Layers,
  X,
  ArrowLeft,
  Volume2,
  TreePine,
  Clock
} from "lucide-react";
import { api, type Refuge, type ScoredRoute } from "../lib/api";
import { useJourney } from "../context/JourneyContext";
import Button from "../components/ui/Button";
import CrowdDot from "../components/ui/CrowdDot";
import RouteMap from "../components/RouteMap";
import { isInCbdBounds } from "../lib/bounds";

const ARRIVAL_RADIUS_M = 15;
const LOW_COVERAGE_THRESHOLD = 0.3;

function bandLevel(band: string): "low" | "moderate" | "high" | "unknown" {
  if (band === "Low") return "low";
  if (band === "Moderate") return "moderate";
  if (band === "High") return "high";
  return "unknown";
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

type ModalStep = "refuges" | "routes" | "detail";

export default function Way() {
  const navigate = useNavigate();
  const {
    journeyRef,
    route,
    position,
    geoError,
    routeChanged,
    loading,
    startJourney,
    endJourney
  } = useJourney();

  const [localPosition, setLocalPosition] = useState<[number, number] | null>(
    null
  );
  const [localGeoError, setLocalGeoError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  // Quiet-space modal — now a 3-step in-modal flow instead of navigating away.
  const [quietOpen, setQuietOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("refuges");

  const [refugeLoading, setRefugeLoading] = useState(false);
  const [refugeError, setRefugeError] = useState<string | null>(null);
  const [refuges, setRefuges] = useState<Refuge[]>([]);

  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [modalRoutes, setModalRoutes] = useState<ScoredRoute[]>([]);
  const [modalSelectedId, setModalSelectedId] = useState<number | null>(null);
  const [modalReferenceTime, setModalReferenceTime] = useState<string | null>(
    null
  );
  const [modalDestLabel, setModalDestLabel] = useState<string>("");
  const [modalAnchor, setModalAnchor] = useState<[number, number] | null>(null);
  const [modalDest, setModalDest] = useState<[number, number] | null>(null);

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
      if (watchId.current !== null)
        navigator.geolocation.clearWatch(watchId.current);
    };
  }, [route]);

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
    if (d <= ARRIVAL_RADIUS_M && nextStepIdx >= route.steps.length - 1) {
      endJourney();
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

  const remainingLegs = route.steps
    .slice(nextStepIdx)
    .reduce((sum, s) => sum + s.distance_m, 0);
  const remainingDistance = distToNext + remainingLegs;
  const rawRemainingDuration =
    route.distance_m > 0
      ? (remainingDistance / route.distance_m) * route.duration_s
      : 0;
  const remainingDuration = Math.min(
    rawRemainingDuration,
    route.duration_s * 1.5
  );

  const aheadWarning =
    currentPosition && route.worst_cutoff !== null
      ? route.points.some(
          (p) =>
            p.score !== null &&
            p.score >= (route.worst_cutoff as number) &&
            haversineM(currentPosition[0], currentPosition[1], p.lat, p.lon) <=
              250
        )
      : false;

  const referenceLegLength =
    route.steps[nextStepIdx - 1]?.distance_m ?? upcoming?.distance_m ?? 0;
  const positionLooksValid =
    !currentPosition || !upcoming || referenceLegLength === 0
      ? true
      : distToNext <= Math.max(referenceLegLength * 3, 100);
  const effectiveDistToNext = positionLooksValid
    ? distToNext
    : referenceLegLength;

  function openQuietSpaces() {
    setQuietOpen(true);
    setModalStep("refuges");
    const anchor = currentPosition ?? route!.geometry[0];
    if (!isInCbdBounds(anchor[0], anchor[1])) {
      setRefugeError(
        "You're currently outside Melbourne's CBD, where this feature is available."
      );
      return;
    }
    if (refuges.length > 0 || refugeLoading) return;
    setRefugeLoading(true);
    setRefugeError(null);
    api
      .getRefuges()
      .then(setRefuges)
      .catch(() => setRefugeError("Couldn't load quiet places right now."))
      .finally(() => setRefugeLoading(false));
  }

  function selectRefuge(r: Refuge) {
    const anchor = currentPosition ?? route!.geometry[0];
    setModalAnchor(anchor);
    setModalDest([r.latitude, r.longitude]);
    setModalDestLabel(r.feature_name);
    setRoutesLoading(true);
    setRoutesError(null);
    api
      .getRoutes(anchor[0], anchor[1], r.latitude, r.longitude)
      .then((res) => {
        setModalRoutes(res.routes);
        setModalReferenceTime(res.reference_time);
        setModalSelectedId(
          res.routes.find((x) => x.recommended)?.id ?? res.routes[0]?.id ?? null
        );
        setModalStep("routes");
      })
      .catch(() =>
        setRoutesError("Couldn't find a route to that spot right now.")
      )
      .finally(() => setRoutesLoading(false));
  }

  function confirmNewJourney() {
    const active = modalRoutes.find((r) => r.id === modalSelectedId);
    if (!active || !modalAnchor || !modalDest) return;
    startJourney(active, modalAnchor, modalDest, modalDestLabel);
    setQuietOpen(false);
  }

  // ---- shared content pieces, reused by both the mobile and desktop layouts ----

  const header = (
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-lg font-semibold">On your way</h1>
      <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <span>{minutes(remainingDuration)} min remaining</span>
        <span aria-hidden>·</span>
        <span className="flex items-center gap-1">
          Sensory load: {route.band} <CrowdDot level={bandLevel(route.band)} />
        </span>
      </div>
    </div>
  );

  const geoErrorNote = currentGeoError && (
    <p className="text-xs text-[var(--color-muted)] mb-3">{currentGeoError}</p>
  );

  const instructionPanel = (
    <>
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
    </>
  );

  const actionButtons = (
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
  );

  const mapElement = (
    <RouteMap
      routes={[route]}
      selectedId={route.id}
      onSelect={() => {}}
      start={currentPosition ?? route.geometry[0]}
      end={route.geometry[route.geometry.length - 1]}
    />
  );

  return (
    <>
      {/* Mobile — unchanged order: header, map, instructions, buttons */}
      <div className="md:hidden max-w-md mx-auto px-4 pt-6 pb-24">
        {header}
        {geoErrorNote}
        <div className="rounded-lg border border-[var(--color-border)] h-48 mb-4 overflow-hidden">
          {mapElement}
        </div>
        {instructionPanel}
        {actionButtons}
      </div>

      {/* Desktop — same split-panel layout as Selected.tsx */}
      <div className="hidden md:grid md:grid-cols-[380px_1fr] md:h-[calc(100vh-4rem)]">
        <div className="p-6 md:border-r border-[var(--color-border)] overflow-y-auto">
          {header}
          {geoErrorNote}
          {instructionPanel}
          {actionButtons}
        </div>
        <div className="h-full p-6">
          <div className="h-full rounded-lg border border-[var(--color-border)] overflow-hidden">
            {mapElement}
          </div>
        </div>
      </div>

      {/* Quiet-space modal — 3 steps, all in-place, no map, no navigation away */}
      {quietOpen && (
        <div className="fixed inset-0 z-[1100] flex items-end md:items-center md:justify-center bg-black/30">
          <div className="w-full md:max-w-sm bg-[var(--color-card)] rounded-t-2xl md:rounded-2xl border border-[var(--color-border)] max-h-[70vh] overflow-y-auto">
            <div className="flex items-center gap-2 p-4 border-b border-[var(--color-border)]">
              {modalStep !== "refuges" && (
                <button
                  onClick={() =>
                    setModalStep(modalStep === "detail" ? "routes" : "refuges")
                  }
                  className="text-[var(--color-muted)] shrink-0"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <p className="font-medium flex-1 truncate">
                {modalStep === "refuges" && "Quiet places nearby"}
                {modalStep === "routes" && `Routes to ${modalDestLabel}`}
                {modalStep === "detail" && "Route details"}
              </p>
              <button
                onClick={() => setQuietOpen(false)}
                className="text-[var(--color-muted)] shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {routesError && (
                <p className="text-sm text-[var(--color-danger)] mb-3">
                  {routesError}
                </p>
              )}
              {/* Step 1 — refuge list */}
              {modalStep === "refuges" && (
                <>
                  {refugeLoading && (
                    <p className="text-sm text-[var(--color-muted)]">
                      Loading…
                    </p>
                  )}
                  {refugeError && (
                    <p className="text-sm text-[var(--color-danger)]">
                      {refugeError}
                    </p>
                  )}
                  {!refugeLoading && !refugeError && (
                    <ul className="space-y-2">
                      {refuges
                        .map((r) => {
                          const anchor = currentPosition ?? route!.geometry[0];
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
                              onClick={() => selectRefuge(r)}
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
                      {refuges.length === 0 && (
                        <p className="text-sm text-[var(--color-muted)]">
                          No quiet places found.
                        </p>
                      )}
                    </ul>
                  )}
                </>
              )}

              {/* Step 2 — route options, same info as Options.tsx's cards */}
              {modalStep === "routes" && (
                <>
                  {routesLoading && (
                    <p className="text-sm text-[var(--color-muted)]">
                      Finding calmer routes…
                    </p>
                  )}
                  {routesError && (
                    <p className="text-sm text-[var(--color-danger)]">
                      {routesError}
                    </p>
                  )}
                  {!routesLoading && !routesError && (
                    <ul className="space-y-3">
                      {modalRoutes.map((r) => {
                        const lowCoverage =
                          r.sensor_coverage < LOW_COVERAGE_THRESHOLD;
                        return (
                          <li key={r.id}>
                            <button
                              onClick={() => {
                                setModalSelectedId(r.id);
                                setModalStep("detail");
                              }}
                              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                                r.recommended
                                  ? "border-2 border-[var(--color-route)] bg-[var(--color-route)]/5"
                                  : "border-[var(--color-border)] hover:border-[var(--color-accent)]"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                {r.recommended ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-route)] text-[#3d2f00]">
                                    Recommended
                                  </span>
                                ) : (
                                  <span className="text-sm font-medium">
                                    Option {r.rank}
                                  </span>
                                )}
                                <span className="text-xs text-[var(--color-muted)]">
                                  {minutes(r.duration_s)} min
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
                                <span className="flex items-center gap-1">
                                  <Users className="w-3.5 h-3.5" /> {r.band}{" "}
                                  crowd
                                </span>
                                {r.noise.shown && (
                                  <span className="flex items-center gap-1">
                                    <Volume2 className="w-3.5 h-3.5" />{" "}
                                    {r.noise.label}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <TreePine className="w-3.5 h-3.5" />{" "}
                                  {r.refuges.length}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />{" "}
                                  {metres(r.distance_m)}
                                </span>
                              </div>
                              {lowCoverage && (
                                <p className="text-xs text-[var(--color-muted)] mt-1.5">
                                  Limited real-time data for this area.
                                </p>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {modalReferenceTime && !routesLoading && !routesError && (
                    <p className="text-xs text-[var(--color-muted)] mt-3">
                      Conditions as of{" "}
                      {new Date(modalReferenceTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  )}
                </>
              )}

              {/* Step 3 — chosen route's detail, same info as Selected.tsx's cards */}
              {modalStep === "detail" &&
                (() => {
                  const active = modalRoutes.find(
                    (r) => r.id === modalSelectedId
                  );
                  if (!active) return null;
                  return (
                    <>
                      <div className="rounded-lg border border-[var(--color-border)] p-3 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            <Users className="w-4 h-4" /> Crowd level
                          </span>
                          <span className="text-sm flex items-center gap-1.5">
                            {active.band}{" "}
                            <CrowdDot level={bandLevel(active.band)} />
                          </span>
                        </div>
                        {active.noise.shown && (
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium flex items-center gap-1.5">
                              <Volume2 className="w-4 h-4" /> Noise
                            </span>
                            <span className="text-sm text-[var(--color-muted)]">
                              {active.noise.label}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            <Clock className="w-4 h-4" /> Distance / time
                          </span>
                          <span className="text-sm text-[var(--color-muted)]">
                            {metres(active.distance_m)} ·{" "}
                            {minutes(active.duration_s)} min
                          </span>
                        </div>
                      </div>

                      {active.refuges.length > 0 && (
                        <div className="mb-3">
                          <p className="text-sm font-medium mb-1.5">
                            Quiet spaces along the way
                          </p>
                          <ul className="space-y-1.5">
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

                      <Button className="w-full" onClick={confirmNewJourney}>
                        Start this journey
                      </Button>
                      <p className="text-xs text-[var(--color-muted)] mt-2">
                        This replaces your current journey to{" "}
                        {journeyRef?.destinationLabel ?? "your destination"}.
                      </p>
                    </>
                  );
                })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
