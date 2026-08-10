// sensory-app/src/pages/Selected.tsx
import { useLocation, useNavigate } from "react-router-dom";
import type { Refuge } from "../lib/api";

export default function Selected() {
  const { state } = useLocation() as {
  state: { refuge: Refuge; origin?: { lat: number; lon: number } } | null;
};
  const navigate = useNavigate();

  if (!state?.refuge) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24">
        <p>No refuge selected.</p>
        <button onClick={() => navigate("/Options")} className="underline mt-2">Back to Options</button>
      </div>
    );
  }

  const { feature_name, sensory_tier, is_indoor, latitude, longitude } = state.refuge;

  return (
    <div className="max-w-xl mx-auto px-6 pt-24">
      <h1 className="text-2xl font-semibold mb-2">{feature_name}</h1>
      <p className="text-[var(--color-muted)] mb-4">
        {sensory_tier} tier · {is_indoor ? "Indoor" : "Outdoor"}
      </p>
      <p className="text-sm text-[var(--color-muted)]">
        {latitude}, {longitude}
      </p>
      <button
        onClick={() => navigate("/Way", { state: { destination: state.refuge, origin: state.origin } })}
        className="mt-6 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-black font-medium px-4 py-2 rounded-md"
      >
        Navigate here
      </button>
    </div>
  );
}