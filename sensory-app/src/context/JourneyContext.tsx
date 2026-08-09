import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ScoredRoute } from "../lib/api";
import { haversineM } from "../lib/geo";

export type ActiveJourney = {
  route: ScoredRoute;
  destination?: string;
  startedAt: string;
  nextStepIdx: number;
};

type Ctx = {
  activeJourney: ActiveJourney | null;
  position: [number, number] | null;
  geoError: string | null;
  startJourney: (route: ScoredRoute, destination?: string) => void;
  endJourney: () => void;
};

const KEY = "sensory-app:active-journey";
const ARRIVAL_RADIUS_M = 15;
const JourneyContext = createContext<Ctx | null>(null);

function load(): ActiveJourney | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveJourney) : null;
  } catch {
    return null;
  }
}

function persist(journey: ActiveJourney | null) {
  if (journey) localStorage.setItem(KEY, JSON.stringify(journey));
  else localStorage.removeItem(KEY);
}

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [activeJourney, setActiveJourney] = useState<ActiveJourney | null>(load());
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setActiveJourney(load());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Runs for as long as a journey is active, regardless of which page is
  // currently mounted — this is what makes the journey survive navigation.
  useEffect(() => {
    if (!activeJourney) {
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
  }, [activeJourney?.startedAt]); // re-subscribes only when a *new* journey starts

  // Step advancement + auto-arrival, now independent of which page is mounted.
  useEffect(() => {
    if (!activeJourney || !position) return;
    const target = activeJourney.route.steps[activeJourney.nextStepIdx];
    if (!target) return;
    const d = haversineM(position[0], position[1], target.lat, target.lon);
    if (d <= ARRIVAL_RADIUS_M) {
      if (activeJourney.nextStepIdx >= activeJourney.route.steps.length - 1) {
        persist(null);
        setActiveJourney(null);
      } else {
        setActiveJourney((prev) => {
          if (!prev) return prev;
          const next = { ...prev, nextStepIdx: prev.nextStepIdx + 1 };
          persist(next);
          return next;
        });
      }
    }
  }, [position, activeJourney]);

  function startJourney(route: ScoredRoute, destination?: string) {
    const journey: ActiveJourney = {
      route,
      destination,
      startedAt: new Date().toISOString(),
      nextStepIdx: 1,
    };
    persist(journey);
    setActiveJourney(journey);
  }

  function endJourney() {
    persist(null);
    setActiveJourney(null);
  }

  return (
    <JourneyContext.Provider value={{ activeJourney, position, geoError, startJourney, endJourney }}>
      {children}
    </JourneyContext.Provider>
  );
}

export function useJourney() {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used within JourneyProvider");
  return ctx;
}