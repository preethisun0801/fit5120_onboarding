import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ScoredRoute } from "../lib/api";

export type ActiveJourney = {
  route: ScoredRoute;
  destination?: string;
  startedAt: string;
  nextStepIdx: number;
};

type Ctx = {
  activeJourney: ActiveJourney | null;
  startJourney: (route: ScoredRoute, destination?: string) => void;
  updateProgress: (nextStepIdx: number) => void;
  endJourney: () => void;
};

const KEY = "sensory-app:active-journey";
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

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setActiveJourney(load());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function startJourney(route: ScoredRoute, destination?: string) {
    const journey: ActiveJourney = {
      route,
      destination,
      startedAt: new Date().toISOString(),
      nextStepIdx: 1, // matches Way.tsx's convention: step 0 is "Depart"
    };
    persist(journey);
    setActiveJourney(journey);
  }

  function updateProgress(nextStepIdx: number) {
    setActiveJourney((prev) => {
      if (!prev) return prev;
      const next = { ...prev, nextStepIdx };
      persist(next);
      return next;
    });
  }

  function endJourney() {
    persist(null);
    setActiveJourney(null);
  }

  return (
    <JourneyContext.Provider value={{ activeJourney, startJourney, updateProgress, endJourney }}>
      {children}
    </JourneyContext.Provider>
  );
}

export function useJourney() {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used within JourneyProvider");
  return ctx;
}