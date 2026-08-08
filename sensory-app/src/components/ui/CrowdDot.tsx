type Level = "low" | "moderate" | "high";

const COLORS: Record<Level, string> = {
  low: "var(--color-crowd-low)",
  moderate: "var(--color-crowd-moderate)",
  high: "var(--color-crowd-high)",
};

export default function CrowdDot({ level, size = 12 }: { level: Level; size?: number }) {
  return (
    <span
      className="inline-block rounded-full border border-black/10"
      style={{ width: size, height: size, backgroundColor: COLORS[level] }}
      aria-label={`${level} crowd level`}
    />
  );
}