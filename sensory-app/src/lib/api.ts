const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

async function get<T>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  const url = new URL(BASE_URL + path);
  if (params)
    Object.entries(params).forEach(([k, v]) =>
      url.searchParams.set(k, String(v))
    );
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = new Error(body?.detail ?? `API error ${res.status}`);
    (err as any).code = body?.code;
    throw err;
  }
  return res.json();
}

export type Refuge = {
  landmark_id: number;
  feature_name: string;
  latitude: number;
  longitude: number;
  sensory_tier: "PRIMARY" | "SECONDARY" | "OUTER";
  is_indoor: boolean;
};

export type NearbySensor = {
  location_id: number;
  sensor_description: string;
  sensor_name: string;
  latitude: number;
  longitude: number;
  distance_m: number;
};

// ---------------------------------------------------------------- routes

export type Band = "Low" | "Moderate" | "High" | "Unknown";

export type RoutePoint = {
  lat: number;
  lon: number;
  /** null where no sensor sits within the snap radius of this point */
  score: number | null;
  sensor: string | null;
  /** 0–1 spatial confidence: 1 at the sensor, decaying to 0 at the snap radius edge */
  confidence: number;
};

export type RouteRefuge = {
  landmark_id: number;
  name: string;
  tier: string;
  indoor: boolean;
  lat: number;
  lon: number;
  distance_m: number;
};

export type ScoredRoute = {
  id: number;
  rank: number;
  recommended: boolean;
  band: Band;
  /** whole-route mean — sets the band a user reads */
  avg_score: number | null;
  /** mean of the worst 20% of points — what the ranking is based on */
  worst_score: number | null;
  rank_score: number | null;
  distance_m: number;
  duration_s: number;
  /** share of sampled points with a sensor in range; below 0.5 warn the user */
  sensor_coverage: number;
  basis: "crowd only" | "crowd+noise" | "no data";
  noise: { shown: boolean; label: string | null; coverage: number };
  geometry: [number, number][];
  points: RoutePoint[];
  /** points scoring at or above this are the busiest stretch */
  worst_cutoff: number | null;
  refuges: RouteRefuge[];
  steps: RouteStep[];
};

export type RoutesResponse = {
  reference_time: string;
  journey: { start: [number, number]; end: [number, number] };
  scoring: {
    ranked_on: string;
    band_from: string;
    snap_radius_m: number;
    noise_min_coverage: number;
    bands: Record<string, string>;
  };
  routes: ScoredRoute[];
};

export type RouteStep = {
  instruction: string;
  name: string | null;
  distance_m: number;
  duration_s: number;
  maneuver_type: number | null;
  lat: number;
  lon: number;
};

export const api = {
  getRefuges: (tier?: string) =>
    get<Refuge[]>("/refuges", tier ? { tier } : undefined),
  getNearbySensors: (lat: number, lon: number, radiusM = 300) =>
    get<NearbySensor[]>("/sensors/nearby", { lat, lon, radius_m: radiusM }),
  getRoutes: (
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    weights?: { crowdWeight: number; noiseWeight: number }
  ) =>
    get<RoutesResponse>("/routes", {
      start_lat: startLat,
      start_lon: startLon,
      end_lat: endLat,
      end_lon: endLon,
      ...(weights
        ? {
            crowd_weight: weights.crowdWeight,
            noise_weight: weights.noiseWeight
          }
        : {})
    })
};
