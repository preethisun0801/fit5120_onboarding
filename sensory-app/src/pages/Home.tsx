import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Navigation, Clock, Users, ChevronRight, LocateFixed } from "lucide-react";
import Button from "../components/ui/Button";
import CrowdDot from "../components/ui/CrowdDot.tsx";
import LiveConditionsMap from "../components/LiveConditionsMap";
import AddressAutocomplete, { type LatLon } from "../components/AddressAutocomplete.tsx";

export default function Home() {
  const navigate = useNavigate();
  const [from, setFrom] = useState<LatLon | null>(null);
  const [fromText, setFromText] = useState("");
  const [to, setTo] = useState<LatLon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  function useCurrentLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setFrom({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Current location" });
        setFromText("Current location");
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Check browser permissions.");
      }
    );
  }

  function handleFindRoutes() {
    setError(null);
    if (!from) {
      setError("Set a starting point — or tap the location icon to use where you are.");
      return;
    }
    if (!to) {
      setError("Pick a destination from the suggestions list.");
      return;
    }
    navigate("/Options", {
      state: { lat: from.lat, lon: from.lon, destLat: to.lat, destLon: to.lon, destination: to.label },
    });
  }

  return (
    <div className="md:grid md:grid-cols-[380px_1fr] md:h-[calc(100vh-4rem)]">
      <div className="p-5 md:p-6 md:border-r border-[var(--color-border)] md:overflow-y-auto">
        <h1 className="text-xl font-semibold mb-5">Plan a calmer journey</h1>

        <div className="space-y-4">
          <Field label="From">
            <MapPin className="w-4 h-4 text-[var(--color-muted)] shrink-0" />
            <AddressAutocomplete
              initialValue={fromText}
              placeholder="Enter starting point"
              onSelect={(loc, text) => {
                setFrom(loc);
                setFromText(text);
              }}
            />
            <button
              type="button"
              onClick={useCurrentLocation}
              title="Use current location"
              className="shrink-0 text-[var(--color-accent)]"
            >
              <LocateFixed className="w-4 h-4" />
            </button>
          </Field>

          <Field label="To">
            <Navigation className="w-4 h-4 text-[var(--color-muted)] shrink-0" />
            <AddressAutocomplete
              placeholder="Enter destination"
              onSelect={(loc) => setTo(loc)}
            />
          </Field>

          <Field label="Leave">
            <Clock className="w-4 h-4 text-[var(--color-muted)]" />
            <span>Leave now</span>
          </Field>
        </div>

        {locating && <p className="text-[var(--color-muted)] text-sm mt-3">Finding you…</p>}
        {error && <p className="text-[var(--color-danger)] text-sm mt-3">{error}</p>}

        <Button className="w-full mt-5" onClick={handleFindRoutes}>
          Find sensory-aware routes
        </Button>

        <div className="mt-5 md:hidden">
          <p className="text-sm font-medium mb-2">Conditions right now</p>
          <LiveConditionsMap className="h-[280px]" />
        </div>

        <div className="hidden md:block mt-6">
          <ConditionsRow />
        </div>
      </div>

      <div className="hidden md:flex md:flex-col p-6 min-h-0">
        <p className="text-sm font-medium mb-3">Conditions right now</p>
        <LiveConditionsMap className="flex-1 min-h-0" />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--color-muted)] mb-1 block">{label}</span>
      <div className="flex items-center gap-2 border border-[var(--color-border)] rounded-lg px-3 py-2.5">
        {children}
      </div>
    </label>
  );
}

function ConditionsRow() {
  return (
    <div className="flex items-center gap-3 pt-3 mt-3 border-t border-[var(--color-border)]">
      <Users className="w-5 h-5 text-[var(--color-muted)]" />
      <div className="flex-1">
        <p className="text-sm font-medium flex items-center gap-1.5">
          Moderate crowds <CrowdDot level="moderate" />
        </p>
        <p className="text-xs text-[var(--color-muted)]">Crowd levels are moderate in most areas.</p>
      </div>
      <ChevronRight className="w-4 h-4 text-[var(--color-muted)]" />
    </div>
  );
}