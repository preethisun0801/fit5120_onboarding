type Level = "low" | "moderate" | "high" | "unknown";

const COLORS: Record<Exclude<Level, "unknown">, string> = {
  low: "var(--color-crowd-low)",
  moderate: "var(--color-crowd-moderate)",
  high: "var(--color-crowd-high)",
};

export default function CrowdDot({ level, size = 12 }: { level: Level; size?: number }) {
  if (level === "unknown") {
    return (
      <span
        className="inline-block rounded-full border border-dashed border-[var(--color-muted)]"
        style={{ width: size, height: size, backgroundColor: "transparent" }}
        aria-label="crowd level unknown"
      />
    );
  }

  return (
    <span
      className="inline-block rounded-full border border-black/10"
      style={{ width: size, height: size, backgroundColor: COLORS[level] }}
      aria-label={`${level} crowd level`}
    />
  );
}