const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(BASE_URL + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
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

export const api = {
  getRefuges: (tier?: string) =>
    get<Refuge[]>("/refuges", tier ? { tier } : undefined),
  getNearbySensors: (lat: number, lon: number, radiusM = 300) =>
    get<NearbySensor[]>("/sensors/nearby", { lat, lon, radius_m: radiusM }),
};