import { Router } from "express";
import { pool } from "../db";
import { asyncHandler, melbourneDayHour } from "./utils";

const router = Router();

/**
 * Current sensory state across the whole sensor network, for the overview map
 * on the home page.
 *
 *   GET /live/sensors
 *   GET /live/refuges
 *
 * This answers a different question from /routes. Before a destination is
 * chosen there is no route to score, so what a user needs is a sense of how the
 * city feels right now and where they could step out of it.
 */

// Kept identical to /routes so the same location never reads differently
// between the two maps.
function bandScore(value: number, lower: number, upper: number): number {
  if (value <= lower) return lower > 0 ? 50 * (value / lower) : 0;
  if (value <= upper)
    return upper > lower ? 50 + (30 * (value - lower)) / (upper - lower) : 65;
  return Math.min(100, upper > 0 ? 80 + (20 * (value - upper)) / upper : 90);
}

function bandLabel(score: number) {
  return score > 80 ? "High" : score > 50 ? "Moderate" : "Low";
}

router.get(
  "/sensors",
  asyncHandler(async (_req, res) => {
    const refResult = await pool.query(
      `SELECT MAX(sensing_datetime) AS ref FROM pedestrian_count`
    );
    const ref: Date | null = refResult.rows[0]?.ref;

    if (!ref) {
      res.status(503).json({
        detail: "No pedestrian data loaded. The database may need refreshing.",
      });
      return;
    }

    const { pyWeekday, hour } = melbourneDayHour(ref);

    // Counts are per-minute and baselines are per-hour, so a 60-minute sum is
    // required before comparison. Both bounds are needed on the window.
    const { rows } = await pool.query(
      `WITH recent AS (
         SELECT location_id, SUM(total_of_directions) AS hour_count
         FROM pedestrian_count
         WHERE sensing_datetime >  $1::timestamptz - INTERVAL '60 minutes'
           AND sensing_datetime <= $1::timestamptz
         GROUP BY location_id
       )
       SELECT s.location_id, s.sensor_description,
              s.latitude, s.longitude,
              r.hour_count, b.p50_count, b.p80_count
       FROM sensor s
       JOIN recent r ON r.location_id = s.location_id
       JOIN pedestrian_baseline b
         ON b.location_id = s.location_id
        AND b.day_of_week = $2
        AND b.hour_of_day = $3
       -- Indoor sensors measure circulation inside buildings and are not
       -- comparable to street-level flow.
       WHERE s.location_type = 'Outdoor'
         AND s.latitude IS NOT NULL`,
      [ref, pyWeekday, hour]
    );

    const sensors = rows.map((r) => {
      const score = bandScore(
        Number(r.hour_count ?? 0),
        Number(r.p50_count),
        Number(r.p80_count)
      );
      return {
        location_id: r.location_id,
        name: r.sensor_description,
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        score: Number(score.toFixed(1)),
        band: bandLabel(score),
        count_last_hour: Number(r.hour_count ?? 0),
      };
    });

    // A one-line summary of the whole network, so the home page can say
    // something honest before a destination exists.
    const counts = { Low: 0, Moderate: 0, High: 0 } as Record<string, number>;
    sensors.forEach((s) => {
      counts[s.band] = (counts[s.band] ?? 0) + 1;
    });

    res.json({
      reference_time: ref.toISOString(),
      summary: {
        total: sensors.length,
        ...counts,
        // Whichever band holds the most sensors right now.
        dominant:
          (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
            "Moderate"),
      },
      sensors,
    });
  })
);

router.get(
  "/refuges",
  asyncHandler(async (_req, res) => {
    // Curated tiers only. The dataset's own classification puts Federation
    // Square and a football club under the same category as the gardens, so
    // sensory_tier rather than sub_theme is what decides.
    const { rows } = await pool.query(
      `SELECT landmark_id, feature_name, latitude, longitude,
              sensory_tier, is_indoor
       FROM landmark
       WHERE sensory_tier IN ('PRIMARY', 'SECONDARY')
         AND latitude IS NOT NULL
       ORDER BY sensory_tier, feature_name`
    );

    res.json(
      rows.map((r) => ({
        landmark_id: r.landmark_id,
        name: r.feature_name,
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        tier: r.sensory_tier,
        indoor: r.is_indoor,
      }))
    );
  })
);

export default router;
