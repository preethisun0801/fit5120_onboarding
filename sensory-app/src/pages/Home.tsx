import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  Navigation,
  Clock,
  Users,
  ChevronRight,
  LocateFixed
} from "lucide-react";
import Button from "../components/ui/Button";
import CrowdDot from "../components/ui/CrowdDot.tsx";
import LiveConditionsMap from "../components/LiveConditionsMap";
import AddressAutocomplete, {
  type LatLon
} from "../components/AddressAutocomplete.tsx";

export default function Home() {
  const navigate = useNavigate();
  const [crowdSummary, setCrowdSummary] = useState<{
    band: "Low" | "Moderate" | "High";
    low: number;
    moderate: number;
    high: number;
  } | null>(null);
  const [from, setFrom] = useState<LatLon | null>(null);
  const [fromText, setFromText] = useState("");
  const [to, setTo] = useState<LatLon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [leaveMode, setLeaveMode] = useState<"now" | "later">("now");
  const [leaveTime, setLeaveTime] = useState("");

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
        setFrom({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: "Your Current Location"
        });
        setFromText("Your Current Location");
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
      setError(
        "Set a starting point — or tap the location icon to use where you are."
      );
      return;
    }
    if (!to) {
      setError("Pick a destination from the suggestions list.");
      return;
    }

    let plannedTime: string | null = null;
    if (leaveMode === "later") {
      if (!leaveTime) {
        setError("Pick a departure time, or switch back to Leave now.");
        return;
      }
      const [h, m] = leaveTime.split(":").map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); // rolls to tomorrow if that time already passed today
      plannedTime = d.toISOString();
    }

    navigate("/Options", {
      state: {
        lat: from.lat,
        lon: from.lon,
        destLat: to.lat,
        destLon: to.lon,
        destination: to.label,
        plannedTime
      }
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

          <label className="block">
            <span className="text-xs text-[var(--color-muted)] mb-1 block">
              Leave
            </span>
            <div className="flex items-center gap-2 border border-[var(--color-border)] rounded-lg px-3 py-2.5">
              <Clock className="w-4 h-4 text-[var(--color-muted)] shrink-0" />
              <select
                value={leaveMode}
                onChange={(e) =>
                  setLeaveMode(e.target.value as "now" | "later")
                }
                className="bg-transparent outline-none text-sm"
              >
                <option value="now">Leave now</option>
                <option value="later">Leave at…</option>
              </select>
              {leaveMode === "later" && (
                <input
                  type="time"
                  value={leaveTime}
                  onChange={(e) => setLeaveTime(e.target.value)}
                  className="bg-transparent outline-none text-sm ml-auto"
                />
              )}
            </div>
          </label>
        </div>

        {locating && (
          <p className="text-[var(--color-muted)] text-sm mt-3">Finding you…</p>
        )}
        {error && (
          <p className="text-[var(--color-danger)] text-sm mt-3">{error}</p>
        )}

        <Button className="w-full mt-5" onClick={handleFindRoutes}>
          Find sensory-aware routes
        </Button>

        <div className="mt-5 md:hidden">
          <p className="text-sm font-medium mb-2">Conditions right now</p>
          <LiveConditionsMap
            className="h-32"
            interactive={false}
            onSummary={setCrowdSummary}
          />
        </div>

        <div className="hidden md:block mt-6">
          <ConditionsRow summary={crowdSummary} />
        </div>
      </div>

      <div className="hidden md:flex md:flex-col p-6 min-h-0">
        <p className="text-sm font-medium mb-3">Conditions right now</p>
        <LiveConditionsMap
          className="flex-1 min-h-0"
          onSummary={setCrowdSummary}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--color-muted)] mb-1 block">
        {label}
      </span>
      <div className="flex items-center gap-2 border border-[var(--color-border)] rounded-lg px-3 py-2.5">
        {children}
      </div>
    </label>
  );
}

function ConditionsRow({
  summary
}: {
  summary: {
    band: "Low" | "Moderate" | "High";
    low: number;
    moderate: number;
    high: number;
  } | null;
}) {
  const level = summary
    ? (summary.band.toLowerCase() as "low" | "moderate" | "high")
    : "moderate";
  const label = summary ? `${summary.band} crowds` : "Checking conditions…";
  const detail = summary
    ? `${summary.low} sensor${summary.low === 1 ? "" : "s"} quiet, ${summary.moderate} moderate, ${summary.high} busy right now.`
    : "Loading live sensor data.";

  return (
    <div className="flex items-center gap-3 pt-3 mt-3 border-t border-[var(--color-border)]">
      <Users className="w-5 h-5 text-[var(--color-muted)]" />
      <div className="flex-1">
        <p className="text-sm font-medium flex items-center gap-1.5">
          {label} {summary && <CrowdDot level={level} />}
        </p>
        <p className="text-xs text-[var(--color-muted)]">{detail}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-[var(--color-muted)]" />
    </div>
  );
}
