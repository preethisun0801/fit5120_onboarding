// sensory-app/src/pages/Home.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  const [avoidCrowds, setAvoidCrowds] = useState(true);
  const [avoidNoise, setAvoidNoise] = useState(true);
  const [indoorOnly, setIndoorOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  function handlePlan() {
    setError(null);
    if (!navigator.geolocation) {
      setError("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        navigate("/Options", {
          state: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            preferences: { avoidCrowds, avoidNoise, indoorOnly },
          },
        });
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Check browser permissions.");
      }
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 pt-24">
      <h1 className="text-2xl font-semibold mb-2">Plan your journey</h1>
      <p className="text-[var(--color-muted)] mb-6">
        Tell us what to avoid, and we'll find calmer routes and refuges nearby.
      </p>

      <div className="space-y-3 mb-6">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={avoidCrowds} onChange={(e) => setAvoidCrowds(e.target.checked)} />
          Avoid crowded areas
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={avoidNoise} onChange={(e) => setAvoidNoise(e.target.checked)} />
          Avoid loud areas
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={indoorOnly} onChange={(e) => setIndoorOnly(e.target.checked)} />
          Indoor refuges only
        </label>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <button
        onClick={handlePlan}
        disabled={locating}
        className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-black font-medium px-4 py-2 rounded-md disabled:opacity-50"
      >
        {locating ? "Finding you..." : "Find quiet spaces near me"}
      </button>
    </div>
  );
}