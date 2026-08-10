export type Preferences = {
  crowdSensitivity: "low" | "medium" | "high";
  noiseSensitivity: "low" | "medium" | "high";
  indoorOnly: boolean;
};

const KEY = "sensory-app:preferences";

export const DEFAULT_PREFERENCES: Preferences = {
  crowdSensitivity: "high",
  noiseSensitivity: "medium",
  indoorOnly: false,
};

// Raw weight per sensitivity level. These get normalized to sum to 1 before
// being sent to the API — the backend's W_CROWD/W_NOISE defaults are 0.7/0.3,
// so "high crowd + medium noise" reproduces that default almost exactly.
const LEVEL_WEIGHT: Record<Preferences["crowdSensitivity"], number> = {
  low: 0.2,
  medium: 0.5,
  high: 0.8,
};

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: Preferences) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}

// Converts the two independent sensitivity levels into normalized weights
// that sum to 1, matching what the /routes endpoint expects.
export function toRouteWeights(prefs: Preferences): { crowdWeight: number; noiseWeight: number } {
  const c = LEVEL_WEIGHT[prefs.crowdSensitivity];
  const n = LEVEL_WEIGHT[prefs.noiseSensitivity];
  const total = c + n;
  return { crowdWeight: c / total, noiseWeight: n / total };
}