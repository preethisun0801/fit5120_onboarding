// sensory-app/src/pages/Way.tsx
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type Refuge, type ScoredRoute, type RoutesResponse } from "../lib/api";
import RouteMap from "../components/RouteMap";

type NavState = {
  destination?: Refuge;
  origin?: { lat: number; lon: number };
};

// Flinders Street Station. Used when the page is opened without an origin —
// it keeps the route view demonstrable instead of dead-ending.
const FALLBACK_ORIGIN = { lat: -37.8183, lon: 144.9671 };

const BAND_DOT: Record<string, string> = {
  Low: "bg-[var(--color-crowd-low)]",
  Moderate: "bg-[var(--color-crowd-moderate)]",
  High: "bg-[var(--color-crowd-high)]",
};

const BAND_SENTENCE: Record<string, string> = {
  Low: "Quieter than this route usually is right now",
  Moderate: "About as busy as this route usually is",
  High: "Busier than this route usually is right now",
};

function minutes(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}

function distance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

export default function Way() {
  const { state } = useLocation() as { state: NavState | null };
  const navigate = useNavigate();

  const [data, setData] = useState<RoutesResponse | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWorst, setShowWorst] = useState(true);

  const destination = state?.destination;
  const origin = state?.origin ?? FALLBACK_ORIGIN;

  useEffect(() => {
    if (!destination) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getRoutes(origin.lat, origin.lon, destination.latitude, destination.longitude)
      .then((res) => {
        setData(res);
        setSelected(res.routes.find((r) => r.recommended)?.id ?? res.routes[0]?.id ?? null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [destination, origin.lat, origin.lon]);

  const handleSelect = useCallback((id: number) => setSelected(id), []);

  if (!destination) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24">
        <p>No destination chosen.</p>
        <button onClick={() => navigate("/Options")} className="underline mt-2">
          Back to Options
        </button>
      </div>
    );
  }

  const active = data?.routes.find((r) => r.id === selected) ?? null;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 pt-20 pb-24 md:pb-8">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Walking to
        </p>
        <h1 className="text-2xl font-semibold">{destination.feature_name}</h1>
        {data && (
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Conditions as at{" "}
            {new Date(data.reference_time).toLocaleString("en-AU", {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
      </header>

      {loading && <p className="text-[var(--color-muted)]">Finding routes…</p>}
      {error && <p className="text-[var(--color-danger)] text-sm">{error}</p>}

      {data && (
        <div className="grid gap-4 md:grid-cols-[1fr_360px]">
          <div className="h-[45vh] md:h-[70vh] order-1">
            <RouteMap
              routes={data.routes}
              selectedId={selected}
              onSelect={handleSelect}
              start={data.journey.start}
              end={data.journey.end}
              showWorst={showWorst}
            />
          </div>

          <div className="order-2 space-y-3">
            {data.routes.map((r: ScoredRoute) => {
              const on = r.id === selected;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  aria-pressed={on}
                  className={`w-full text-left rounded-lg border p-4 bg-[var(--color-card)] ${
                    on
                      ? "border-[var(--color-accent)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-muted)]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${BAND_DOT[r.band]}`}
                      aria-hidden
                    />
                    <span className="font-medium">{r.band}</span>
                    {r.recommended && (
                      <span className="text-[11px] px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-muted)]">
                        Suggested
                      </span>
                    )}
                    <span className="ml-auto text-sm text-[var(--color-muted)]">
                      {distance(r.distance_m)} · {minutes(r.duration_s)}
                    </span>
                  </div>

                  <p className="text-sm mb-3">{BAND_SENTENCE[r.band]}</p>

                  {/* Two numbers, because they answer different questions and
                      can disagree: a route can be calmer overall yet contain a
                      worse single stretch. The ranking follows the worst one. */}
                  <dl className="flex gap-8 mb-2">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                        Whole route
                      </dt>
                      <dd className="text-lg font-semibold">{r.avg_score}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                        Busiest stretch
                      </dt>
                      <dd className="text-lg font-semibold">{r.worst_score}</dd>
                    </div>
                  </dl>

                  <div
                    className="relative h-1.5 rounded bg-[var(--color-muted-bg)]"
                    role="img"
                    aria-label={`Whole route ${r.avg_score} out of 100, busiest stretch ${r.worst_score}`}
                  >
                    <div
                      className="h-full rounded bg-[var(--color-crowd-moderate)]"
                      style={{ width: `${r.avg_score}%` }}
                    />
                    <div
                      className="absolute -top-1 w-0.5 h-3.5 bg-[var(--color-route)]"
                      style={{ left: `${r.worst_score}%` }}
                    />
                  </div>

                  {r.sensor_coverage < 0.5 && (
                    <p className="mt-3 text-xs text-[var(--color-muted)] leading-relaxed">
                      Only {Math.round(r.sensor_coverage * 100)}% of this route has a
                      sensor nearby, so the rating covers part of the walk.
                    </p>
                  )}

                  {r.noise.shown && (
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
                      Sound: {r.noise.label}
                    </p>
                  )}
                </button>
              );
            })}

            {active && (
              <section className="pt-2">
                <h2 className="text-sm font-medium mb-2">Quiet places on the way</h2>
                {active.refuges.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)]">
                    No reviewed quiet place within 300 m of this route.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--color-border)]">
                    {active.refuges.map((rf) => (
                      <li
                        key={rf.landmark_id}
                        className="flex items-baseline gap-2 py-2 text-sm"
                      >
                        <span className="font-medium">{rf.name}</span>
                        <span className="ml-auto text-xs text-[var(--color-muted)]">
                          {rf.indoor ? "Indoor" : "Outdoor"} · {rf.distance_m} m
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <label className="flex items-center gap-2 text-sm text-[var(--color-muted)] pt-1">
              <input
                type="checkbox"
                checked={showWorst}
                onChange={(e) => setShowWorst(e.target.checked)}
              />
              Mark the busiest stretch on the map
            </label>

            <p className="text-xs text-[var(--color-muted)] leading-relaxed pt-3 border-t border-[var(--color-border)]">
              Crowding compares each sensor with its own history for this hour and
              weekday, so the same headcount reads differently at 8am and at
              midnight. Ranked on the busiest fifth of each route rather than its
              average.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
