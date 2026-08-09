import { useLocation, useNavigate } from "react-router-dom";
import { Navigation2, X } from "lucide-react";
import { useJourney } from "../../context/JourneyContext";
import { haversineM, minutes, metres } from "../../lib/geo";

export default function JourneyBanner() {
  const { journeyRef, route, position, endJourney } = useJourney();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Already on the full turn-by-turn screen — no need for the summary banner.
  if (!journeyRef || !route || pathname === "/Way") return null;

  const nextStepIdx = journeyRef.nextStepIdx;
  const destination = journeyRef.destinationLabel ?? "Destination";
  const upcoming = route.steps[nextStepIdx];

  const distToNext = position && upcoming
    ? haversineM(position[0], position[1], upcoming.lat, upcoming.lon)
    : upcoming?.distance_m ?? 0;

  const remainingLegs = route.steps.slice(nextStepIdx).reduce((sum, s) => sum + s.distance_m, 0);
  const remainingDistance = distToNext + remainingLegs;
  const rawRemainingDuration = route.distance_m > 0
    ? (remainingDistance / route.distance_m) * route.duration_s
    : 0;
  const remainingDuration = Math.min(rawRemainingDuration, route.duration_s * 1.5);

  return (
    <div className="fixed left-0 right-0 z-[1000] bottom-16 md:bottom-0 md:top-16">
      <button
        onClick={() => navigate("/Way")}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
      >
        <Navigation2 className="w-4 h-4 shrink-0" />
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium truncate">
            {destination ? `Walking to ${destination}` : "Journey in progress"}
          </p>
          <p className="text-xs opacity-80">
            {minutes(remainingDuration)} min · {metres(remainingDistance)} remaining
          </p>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            endJourney();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              endJourney();
            }
          }}
          className="shrink-0 p-1 -mr-1"
          aria-label="End journey"
        >
          <X className="w-4 h-4" />
        </span>
      </button>
    </div>
  );
}