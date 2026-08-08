// sensory-app/src/pages/Home.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Navigation, Clock, Users, ChevronRight } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import CrowdDot from "../components/ui/CrowdDot";

export default function Home() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  function handleFindRoutes() {
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
            destination,
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
    <div className="md:grid md:grid-cols-[380px_1fr] md:h-[calc(100vh-4rem)]">
      {/* Form panel */}
      <div className="p-5 md:p-6 md:border-r border-[var(--color-border)] md:overflow-y-auto">
        <h1 className="text-xl font-semibold mb-5">Plan a calmer journey</h1>

        <div className="space-y-4">
          <Field label="From">
            <MapPin className="w-4 h-4 text-[var(--color-muted)]" />
            <span className="text-[var(--color-muted)]">Current location</span>
          </Field>

          <Field label="To">
            <Navigation className="w-4 h-4 text-[var(--color-muted)]" />
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Enter destination"
              className="bg-transparent outline-none flex-1 text-sm placeholder:text-[var(--color-muted)]"
            />
          </Field>

          <Field label="Leave">
            <Clock className="w-4 h-4 text-[var(--color-muted)]" />
            <span>Leave now</span>
          </Field>
        </div>

        {error && <p className="text-[var(--color-danger)] text-sm mt-3">{error}</p>}

        <Button className="w-full mt-5" onClick={handleFindRoutes} disabled={locating}>
          {locating ? "Finding you…" : "Find sensory-aware routes"}
        </Button>

        {/* Map preview — mobile only, links out to the full map tab */}
        <Card
          className="mt-5 p-3 md:hidden cursor-pointer"
          onClick={() => navigate("/Way")}
        >
          <MapPreviewThumb />
          <ConditionsRow />
        </Card>

        {/* Conditions summary — desktop, below the form */}
        <div className="hidden md:block mt-6">
          <ConditionsRow />
        </div>
      </div>

      {/* Map panel — desktop only, inline */}
      <div className="hidden md:block p-6">
        <p className="text-sm font-medium mb-3">Map</p>
        <MapPreviewThumb tall />
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

function MapPreviewThumb({ tall = false }: { tall?: boolean }) {
  // Static styled placeholder until the live map (react-leaflet / mapbox-gl)
  // is wired up in the Way page — see note below.
  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-[#EDE9DD] ${tall ? "h-full min-h-[400px]" : "h-32"}`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(#00000008_1px,transparent_1px),linear-gradient(90deg,#00000008_1px,transparent_1px)] bg-[size:24px_24px]" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 150" preserveAspectRatio="none">
        <path d="M20,110 L180,110 L280,40" stroke="var(--color-route)" strokeWidth="4" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}