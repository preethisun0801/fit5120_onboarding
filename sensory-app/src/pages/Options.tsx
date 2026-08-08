// sensory-app/src/pages/Options.tsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type Refuge, type NearbySensor } from "../lib/api";

type NavState = {
  lat: number;
  lon: number;
  preferences: { avoidCrowds: boolean; avoidNoise: boolean; indoorOnly: boolean };
};

export default function Options() {
  const { state } = useLocation() as { state: NavState | null };
  const navigate = useNavigate();
  const [refuges, setRefuges] = useState<Refuge[]>([]);
  const [sensors, setSensors] = useState<NearbySensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return; // no location passed — see note below
    setLoading(true);
    Promise.all([
      api.getRefuges(),
      api.getNearbySensors(state.lat, state.lon, 500),
    ])
      .then(([r, s]) => {
        let filtered = r;
        if (state.preferences.indoorOnly) {
          filtered = filtered.filter((x) => x.is_indoor);
        }
        setRefuges(filtered);
        setSensors(s);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [state]);

  if (!state) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24">
        <p>No location set. Go back and start from the home page.</p>
        <button onClick={() => navigate("/")} className="underline mt-2">Back to Home</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 pt-24">
      <h1 className="text-2xl font-semibold mb-4">Options near you</h1>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-400">{error}</p>}

      <ul className="space-y-3">
        {refuges.map((r) => (
          <li
            key={r.landmark_id}
            onClick={() => navigate("/Selected", { state: { refuge: r } })}
            className="cursor-pointer border border-[var(--color-border)] rounded-md p-4 hover:border-[var(--color-accent)]"
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{r.feature_name}</span>
              <span className="text-xs uppercase text-[var(--color-muted)]">{r.sensory_tier}</span>
            </div>
            {r.is_indoor && <span className="text-xs text-[var(--color-accent)]">Indoor</span>}
          </li>
        ))}
      </ul>

      <p className="text-xs text-[var(--color-muted)] mt-6">
        {sensors.length} pedestrian sensor(s) found within 500m of you.
      </p>
    </div>
  );
}