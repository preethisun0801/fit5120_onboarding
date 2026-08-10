import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type ScoredRoute } from "../lib/api";
import { haversineM } from "../lib/geo";

// Only what's needed to re-derive the journey — no route geometry, no
// turn-by-turn steps, no path points. Origin/destination coordinates are
// still present (required to refetch), which is a smaller but non-zero
// footprint of location data — see the note in App-level docs.
export type JourneyRef = {
  origin: [number, number];
  destination: [number, number];
  destinationLabel?: string;
  distance_m: number;
  duration_s: number;
  startedAt: string;
  nextStepIdx: number;
};

type Ctx = {
  journeyRef: JourneyRef | null;
  route: ScoredRoute | null; // in-memory only — never persisted
  position: [number, number] | null;
  geoError: string | null;
  routeChanged: boolean; // true if resume matched a different route than originally chosen
  loading: boolean;
  startJourney: (route: ScoredRoute, origin: [number, number], destination: [number, number], destinationLabel?: string) => void;
  endJourney: () => void;
};

const KEY = "sensory-app:active-journey-ref";
const ARRIVAL_RADIUS_M = 15;
const MATCH_TOLERANCE = 0.15; // 15% — how close distance/duration must be to count as "the same route"

const JourneyContext = createContext<Ctx | null>(null);

function load(): JourneyRef | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as JourneyRef) : null;
  } catch {
    return null;
  }
}

function persist(ref: JourneyRef | null) {
  if (ref) localStorage.setItem(KEY, JSON.stringify(ref));
  else localStorage.removeItem(KEY);
}

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [journeyRef, setJourneyRef] = useState<JourneyRef | null>(load());
  const [route, setRoute] = useState<ScoredRoute | null>(null);
  const [routeChanged, setRouteChanged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  // On mount (including after a page refresh), if a journeyRef exists but we
  // have no in-memory route yet, refetch and re-match it. This is the
  // "refetch on remount" behavior — the price of not persisting geometry.
  useEffect(() => {
    if (!journeyRef || route) return;
    setLoading(true);
    api
      .getRoutes(journeyRef.origin[0], journeyRef.origin[1], journeyRef.destination[0], journeyRef.destination[1])
      .then((res) => {
        const match = res.routes.find(
          (r) =>
            Math.abs(r.distance_m - journeyRef.distance_m) / journeyRef.distance_m <= MATCH_TOLERANCE &&
            Math.abs(r.duration_s - journeyRef.duration_s) / journeyRef.duration_s <= MATCH_TOLERANCE
        );
        if (match) {
          setRoute(match);
          setRouteChanged(false);
        } else {
          // Conditions changed enough that we can't confidently resume the
          // exact same route — fall back to whatever's recommended now, and
          // restart step tracking rather than risk wrong turn-by-turn
          // instructions against a mismatched route.
          const fallback = res.routes.find((r) => r.recommended) ?? res.routes[0] ?? null;
          setRoute(fallback);
          setRouteChanged(true);
          if (fallback) {
            setJourneyRef((prev) => {
              if (!prev) return prev;
              const next = { ...prev, distance_m: fallback.distance_m, duration_s: fallback.duration_s, nextStepIdx: 1 };
              persist(next);
              return next;
            });
          }
        }
      })
      .catch(() => setRoute(null))
      .finally(() => setLoading(false));
  }, [journeyRef, route]);

  useEffect(() => {
    if (!journeyRef) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      setPosition(null);
      return;
    }
    if (!navigator.geolocation) {
      setGeoError("Live location isn't available — showing the route without live tracking.");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
      () => setGeoError("Location access was denied — showing the route without live tracking."),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [journeyRef?.startedAt]);

  useEffect(() => {
    if (!journeyRef || !route || !position) return;
    const target = route.steps[journeyRef.nextStepIdx];
    if (!target) return;
    const d = haversineM(position[0], position[1], target.lat, target.lon);
    if (d <= ARRIVAL_RADIUS_M) {
      if (journeyRef.nextStepIdx >= route.steps.length - 1) {
        persist(null);
        setJourneyRef(null);
        setRoute(null);
      } else {
        setJourneyRef((prev) => {
          if (!prev) return prev;
          const next = { ...prev, nextStepIdx: prev.nextStepIdx + 1 };
          persist(next);
          return next;
        });
      }
    }
  }, [position, journeyRef, route]);

  function startJourney(
    r: ScoredRoute,
    origin: [number, number],
    destination: [number, number],
    destinationLabel?: string
  ) {
    const ref: JourneyRef = {
      origin,
      destination,
      destinationLabel,
      distance_m: r.distance_m,
      duration_s: r.duration_s,
      startedAt: new Date().toISOString(),
      nextStepIdx: 1,
    };
    persist(ref);
    setJourneyRef(ref);
    setRoute(r); // already have it in memory — no need to refetch immediately
    setRouteChanged(false);
  }

  function endJourney() {
    persist(null);
    setJourneyRef(null);
    setRoute(null);
  }

  return (
    <JourneyContext.Provider
      value={{ journeyRef, route, position, geoError, routeChanged, loading, startJourney, endJourney }}
    >
      {children}
    </JourneyContext.Provider>
  );
}

export function useJourney() {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used within JourneyProvider");
  return ctx;
}