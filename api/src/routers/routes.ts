import { Router } from "express";
import { pool } from "../db";
import { asyncHandler, melbourneDayHour } from "./utils";

const router = Router();

/**
 * Sensory-scored walking routes.
 *
 *   GET /routes?start_lat=..&start_lon=..&end_lat=..&end_lon=..
 *
 * Asks OpenRouteService for candidate walking routes, then re-ranks them using
 * our own sensory data. We order routes; we do not generate them. That matches
 * AC1.1.3 (Sort Routes by Sensory Load) and AC1.2.2 (Prioritise a
 * Lower-Congestion Route), both of which are about ordering.
 *
 * The ORS key stays server-side. It must never reach the browser.
 */

// ---------------------------------------------------------------- config

const ORS_URL =
  "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";

const SNAP_RADIUS_M = 150; // beyond this a reading doesn't describe where you are
const SAMPLE_SPACING_M = 50; // how often to sample along a route
const NOISE_RADIUS_M = 250; // sound falls ~6 dB per doubling of distance
const REFUGE_RADIUS_M = 300; // how close a refuge counts as "on the way"

// Ranking uses the worst 20% of sampled points. A route's mean hides the one
// block that is unbearable, and for a sensory-sensitive traveller a single
// intolerable stretch ruins the journey however calm the rest was.
const WORST_FRACTION = 0.2;

// Noise joins the score only where a device genuinely covers enough of the
// route. Below this, one device the route barely touches would swing the
// result. The same floor applies to display.
const MIN_NOISE_COVERAGE = 0.25;

// Sensor coverage is limited to the City of Melbourne, so requests outside it
// cannot be scored. Validating the area also satisfies the coordinate-range
// check in our security plan.
const BOUNDS = { minLat: -37.87, maxLat: -37.76, minLon: 144.87, maxLon: 145.02 };

// ---------------------------------------------------------------- types

type LatLon = [number, number];

interface Sensor {
  id: number;
  name: string;
  lat: number;
  lon: number;
  score: number;
}

interface NoiseDevice {
  id: string;
  lat: number;
  lon: number;
  score: number;
}

interface Refuge {
  landmark_id: number;
  name: string;
  tier: string;
  indoor: boolean;
  lat: number;
  lon: number;
}

interface RouteStep {
  instruction: string;
  name: string | null;
  distance_m: number;
  duration_s: number;
  maneuver_type: number | null;
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------- geometry

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dp = ((bLat - aLat) * Math.PI) / 180;
  const dl = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function inArea(lat: number, lon: number) {
  return (
    lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat &&
    lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon
  );
}

/**
 * ORS emits a geometry point wherever the path bends, so points cluster at
 * corners and thin out on long straights. Resampling at a fixed interval stops
 * the score being dominated by intersections.
 */
function sampleRoute(coords: LatLon[], spacing = SAMPLE_SPACING_M): LatLon[] {
  const first = coords[0];
  if (!first) return [];
  const out: LatLon[] = [first];
  let carried = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    // tsconfig has noUncheckedIndexedAccess on, so indexed access is typed as
    // possibly undefined. The guard is redundant at runtime but keeps the
    // compiler honest rather than silencing it with a non-null assertion.
    const a = coords[i];
    const b = coords[i + 1];
    if (!a || !b) continue;
    const [lat1, lon1] = a;
    const [lat2, lon2] = b;
    const seg = haversineM(lat1, lon1, lat2, lon2);
    if (seg === 0) continue;

    let travelled = spacing - carried;
    while (travelled <= seg) {
      const f = travelled / seg;
      out.push([lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f]);
      travelled += spacing;
    }
    carried = (carried + seg) % spacing;
  }
  return out;
}
// Spatial confidence: 1.0 when the sensor sits right at the sample point,
// decaying linearly to 0 at the radius edge. A sensor barely inside the
// cutoff describes "roughly this area", not "this exact spot" — blending
// its score toward a neutral midpoint rather than trusting it at full
// weight stops one distant, borderline reading swinging a route's score
// the same as a sensor standing directly on the path.

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function spatialConfidence(distanceM: number, radiusM: number): number {
  return clamp(1 - distanceM / radiusM, 0, 1);
}
/** Mean of the worst N% of values. */
function worstMean(values: number[], fraction = WORST_FRACTION): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => b - a);
  const k = Math.max(1, Math.floor(sorted.length * fraction));
  return sorted.slice(0, k).reduce((a, b) => a + b, 0) / k;
}

/**
 * Convert an observed value to a 0-100 sensory score against that location's
 * own distribution. Interpolating inside each band stops a route flipping
 * category because one sensor crossed a threshold by a single person.
 */
function bandScore(value: number, lower: number, upper: number): number {
  if (value <= lower) return lower > 0 ? 50 * (value / lower) : 0;
  if (value <= upper)
    return upper > lower ? 50 + (30 * (value - lower)) / (upper - lower) : 65;
  return Math.min(100, upper > 0 ? 80 + (20 * (value - upper)) / upper : 90);
}

function bandLabel(score: number) {
  return score > 80 ? "High" : score > 50 ? "Moderate" : "Low";
}

// ---------------------------------------------------------------- data

async function loadSensorState(): Promise<{ sensors: Sensor[]; ref: Date }> {
  const refResult = await pool.query(
    `SELECT MAX(sensing_datetime) AS ref FROM pedestrian_count`
  );
  const ref: Date | null = refResult.rows[0]?.ref;
  if (!ref) return { sensors: [], ref: new Date() };

  const { pyWeekday, hour } = melbourneDayHour(ref);

  // NOTE: the window needs BOTH bounds. With only a lower bound, an earlier
  // reference time sums every record through to the end of the table.
  //
  // NOTE: pedestrian_count is per-minute and pedestrian_baseline is per-hour,
  // so the counts MUST be summed over 60 minutes before comparison. Comparing
  // a single minute against an hourly baseline reads about 60x too low and
  // marks nearly everything "quieter than usual".
  const { rows } = await pool.query(
    `WITH recent AS (
       SELECT location_id, SUM(total_of_directions) AS hour_count
       FROM pedestrian_count
       WHERE sensing_datetime >  $1::timestamptz - INTERVAL '60 minutes'
         AND sensing_datetime <= $1::timestamptz
       GROUP BY location_id
     )
     SELECT s.location_id, s.sensor_description, s.latitude, s.longitude,
            r.hour_count, b.p50_count, b.p80_count
     FROM sensor s
     JOIN recent r ON r.location_id = s.location_id
     JOIN pedestrian_baseline b
       ON b.location_id = s.location_id
      AND b.day_of_week = $2
      AND b.hour_of_day = $3
     -- Indoor sensors count footfall inside buildings (library lifts,
     -- stairwells). Not comparable to street-level flow, so excluded.
     WHERE s.location_type = 'Outdoor'
       AND s.latitude IS NOT NULL`,
    [ref, pyWeekday, hour]
  );

  const sensors: Sensor[] = rows.map((r) => ({
    id: r.location_id,
    name: r.sensor_description,
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    score: bandScore(
      Number(r.hour_count ?? 0),
      Number(r.p50_count),
      Number(r.p80_count)
    )
  }));

  return { sensors, ref };
}

async function loadNoiseState(ref: Date): Promise<NoiseDevice[]> {
  const { pyWeekday, hour } = melbourneDayHour(ref);
  const { rows } = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (device_id) device_id, noise_db
       FROM noise_reading
       WHERE is_valid
       ORDER BY device_id, received_at DESC
     )
     SELECT d.device_id, d.latitude, d.longitude,
            l.noise_db, b.p25_db, b.p75_db
     FROM microclimate_device d
     JOIN latest l ON l.device_id = d.device_id
     JOIN noise_baseline b
       ON b.device_id = d.device_id
      AND b.day_of_week = $1
      AND b.hour_of_day = $2
     WHERE NOT d.is_excluded AND d.latitude IS NOT NULL`,
    [pyWeekday, hour]
  );

  return rows.map((r) => ({
    id: r.device_id,
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    score: bandScore(Number(r.noise_db), Number(r.p25_db), Number(r.p75_db))
  }));
}

async function loadRefuges(): Promise<Refuge[]> {
  const { rows } = await pool.query(
    `SELECT landmark_id, feature_name, latitude, longitude,
            sensory_tier, is_indoor
     FROM landmark
     WHERE sensory_tier IN ('PRIMARY', 'SECONDARY')
       AND latitude IS NOT NULL`
  );
  return rows.map((r) => ({
    landmark_id: r.landmark_id,
    name: r.feature_name,
    tier: r.sensory_tier,
    indoor: r.is_indoor,
    lat: Number(r.latitude),
    lon: Number(r.longitude)
  }));
}

// ---------------------------------------------------------------- ORS

async function fetchRoutes(start: LatLon, end: LatLon) {
  const key = process.env.ORS_API_KEY;
  if (!key) throw new Error("ORS_API_KEY is not set");

  const response = await fetch(ORS_URL, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000), // ORS should respond well under this; guards against a hung upstream call
    body: JSON.stringify({
      // ORS takes [lon, lat] — the reverse of how we store coordinates
      // everywhere else. Getting this backwards produces a route in the wrong
      // hemisphere without any error.
      coordinates: [
        [start[1], start[0]],
        [end[1], end[0]]
      ],
      instructions: true,
      instructions_format: "text",
      alternative_routes: {
        target_count: 3,
        // Caps how much two candidates may overlap. The default 0.6 lets them
        // share most of their length, which on a grid street layout produces
        // near-identical options.
        share_factor: 0.4,
        weight_factor: 2.0
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `ORS ${response.status}: ${(await response.text()).slice(0, 200)}`
    );
  }

  const json = (await response.json()) as any;
  return (json.features ?? []).map((f: any, i: number) => {
    const coords: LatLon[] = (f.geometry.coordinates as [number, number][]).map(
      ([lon, lat]) => [lat, lon] as LatLon
    );
    const rawSteps = f.properties?.segments?.[0]?.steps ?? [];
    const steps = rawSteps.map((s: any) => {
      const wp = Math.min(s.way_points?.[0] ?? 0, coords.length - 1);
      const [lon, lat] = coords[wp] ?? [0, 0];
      return {
        instruction: s.instruction as string,
        name: (s.name as string) || null,
        distance_m: Math.round(s.distance ?? 0),
        duration_s: Math.round(s.duration ?? 0),
        maneuver_type: typeof s.type === "number" ? s.type : null,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6))
      };
    });
    return {
      index: i,
      coords,
      distance_m: f.properties?.summary?.distance ?? 0,
      duration_s: f.properties?.summary?.duration ?? 0,
      steps
    };
  });
}

// ---------------------------------------------------------------- scoring

function scoreRoute(
  route: {
    index: number;
    coords: LatLon[];
    distance_m: number;
    duration_s: number;
    steps: RouteStep[];
  },
  sensors: Sensor[],
  devices: NoiseDevice[],
  refuges: Refuge[],
  steps: RouteStep[],
  wCrowd: number,
  wNoise: number
) {
  const samples = sampleRoute(route.coords);

  const points: {
    lat: number;
    lon: number;
    score: number | null;
    sensor: string | null;
    confidence: number;
  }[] = [];
  const crowdScores: number[] = [];
  const noiseScores: number[] = [];

  for (const [lat, lon] of samples) {
    let nearest: Sensor | null = null;
    let bestD = SNAP_RADIUS_M;
    for (const s of sensors) {
      const d = haversineM(lat, lon, s.lat, s.lon);
      if (d < bestD) {
        nearest = s;
        bestD = d;
      }
    }
    
    let confidence = 0;
    let blended: number | null = null;
    if (nearest) {
      confidence = spatialConfidence(bestD, SNAP_RADIUS_M);
      blended = nearest.score * confidence + 50 * (1 - confidence);
      crowdScores.push(blended);
    }
    points.push({
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      score: blended !== null ? Number(blended.toFixed(1)) : null,
      sensor: nearest ? nearest.name : null,
      confidence: Number(confidence.toFixed(2))
    });

    let nearestDev: NoiseDevice | null = null;
    let bestND = NOISE_RADIUS_M;
    for (const d of devices) {
      const dist = haversineM(lat, lon, d.lat, d.lon);
      if (dist < bestND) {
        nearestDev = d;
        bestND = dist;
      }
    }
    if (nearestDev) {
      const noiseConfidence = spatialConfidence(bestND, NOISE_RADIUS_M);
      noiseScores.push(
        nearestDev.score * noiseConfidence + 50 * (1 - noiseConfidence)
      );
    }
  }

  const crowdWorst = worstMean(crowdScores);
  const crowdMean =
    crowdScores.length > 0
      ? crowdScores.reduce((a, b) => a + b, 0) / crowdScores.length
      : null;
  const noiseWorst = worstMean(noiseScores);
  const noiseCoverage = samples.length
    ? noiseScores.length / samples.length
    : 0;
  const noiseCounts =
    noiseWorst !== null && noiseCoverage >= MIN_NOISE_COVERAGE;
  const nearby = refuges
    .map((rf) => ({
      rf,
      d: Math.min(
        ...samples.map(([la, lo]) => haversineM(la, lo, rf.lat, rf.lon))
      )
    }))
    .filter((x) => x.d <= REFUGE_RADIUS_M)
    .sort((a: any, b: any) => {
      if (a.rank_score === null && b.rank_score === null)
        return a.distance_m - b.distance_m;
      if (a.rank_score === null) return 1;
      if (b.rank_score === null) return -1;
      return a.rank_score - b.rank_score;
    });

  const noiseLabel = noiseCounts
    ? (noiseWorst as number) > 75
      ? "Louder than usual here"
      : (noiseWorst as number) > 50
        ? "About usual for here"
        : "Quieter than usual here"
    : null;
  const hasData = crowdWorst !== null && crowdMean !== null;
  if (!hasData) {
    return {
      id: route.index,
      band: "Unknown" as const,
      avg_score: null,
      worst_score: null,
      rank_score: null,
      distance_m: Math.round(route.distance_m),
      duration_s: Math.round(route.duration_s),
      sensor_coverage: 0,
      basis: "no data" as const,
      noise: { shown: false, label: null, coverage: 0 },
      geometry: route.coords.map(([la, lo]) => [
        Number(la.toFixed(6)),
        Number(lo.toFixed(6))
      ]),
      points,
      worst_cutoff: null,
      refuges: nearby.map(({ rf, d }) => ({
        landmark_id: rf.landmark_id,
        name: rf.name,
        tier: rf.tier,
        indoor: rf.indoor,
        lat: rf.lat,
        lon: rf.lon,
        distance_m: Math.round(d)
      })),
      steps: route.steps
    };
  }

  const rankScore = noiseCounts
    ? wCrowd * crowdWorst + wNoise * (noiseWorst as number)
    : crowdWorst;

  // The busiest 20% of points — the stretch that drives the ranking, and the
  // thing a user most needs to see marked on the map.
  const rated = points
    .filter((p) => p.score !== null)
    .map((p) => p.score as number);
  const ordered = [...rated].sort((a, b) => b - a);
  const cutoff =
    ordered.length > 0
      ? (ordered[
          Math.max(1, Math.floor(ordered.length * WORST_FRACTION)) - 1
        ] ?? null)
      : null;

  return {
    id: route.index,
    // Band comes from the whole-route mean, so "High" means the same thing to
    // a user regardless of noise coverage. The rank score orders candidates;
    // the band describes the route.
    band: bandLabel(crowdMean),
    steps,
    avg_score: Number(crowdMean.toFixed(1)),
    worst_score: Number(crowdWorst.toFixed(1)),
    rank_score: Number(rankScore.toFixed(1)),
    distance_m: Math.round(route.distance_m),
    duration_s: Math.round(route.duration_s),
    sensor_coverage: Number(
      (crowdScores.length / (samples.length || 1)).toFixed(3)
    ),
    basis: noiseCounts ? "crowd+noise" : "crowd only",
    noise: {
      shown: noiseCounts,
      label: noiseLabel,
      coverage: Number(noiseCoverage.toFixed(3))
    },
    geometry: route.coords.map(([la, lo]) => [
      Number(la.toFixed(6)),
      Number(lo.toFixed(6))
    ]),
    points,
    worst_cutoff: cutoff,
    refuges: nearby.map(({ rf, d }) => ({
      landmark_id: rf.landmark_id,
      name: rf.name,
      tier: rf.tier,
      indoor: rf.indoor,
      lat: rf.lat,
      lon: rf.lon,
      distance_m: Math.round(d)
    }))
  };
}

// ---------------------------------------------------------------- endpoint

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const TOTAL_TIMEOUT_MS = 20_000;

    const work = (async () => {
      const nums: number[] = [
        Number(req.query.start_lat),
        Number(req.query.start_lon),
        Number(req.query.end_lat),
        Number(req.query.end_lon)
      ];

      if (nums.some((n) => Number.isNaN(n))) {
        res.status(400).json({
          detail:
            "start_lat, start_lon, end_lat and end_lon are required and must be numbers"
        });
        return;
      }

      const startLat = nums[0] as number;
      const startLon = nums[1] as number;
      const endLat = nums[2] as number;
      const endLon = nums[3] as number;

      if (!inArea(startLat, startLon) || !inArea(endLat, endLon)) {   // ← new, insert here
        res.status(400).json({
          detail:
            "This app currently covers Melbourne's CBD only, where sensor data is available. Try a starting point or destination within the city centre.",
          code: "OUTSIDE_COVERAGE"
        });
        return;
      }

      // Optional client-supplied weighting — defaults match the original fixed
      // constants (0.7 / 0.3) so requests without these params behave unchanged.
      let wCrowd = 0.7;
      let wNoise = 0.3;
      const rawCrowdW = Number(req.query.crowd_weight);
      const rawNoiseW = Number(req.query.noise_weight);
      if (
        !Number.isNaN(rawCrowdW) &&
        !Number.isNaN(rawNoiseW) &&
        rawCrowdW >= 0 &&
        rawNoiseW >= 0
      ) {
        const total = rawCrowdW + rawNoiseW;
        if (total > 0) {
          wCrowd = rawCrowdW / total;
          wNoise = rawNoiseW / total;
        }
      }
      const [{ sensors, ref }, refuges] = await Promise.all([
        loadSensorState(),
        loadRefuges()
      ]);

      if (sensors.length === 0) {
        res.status(503).json({
          detail:
            "No current pedestrian data. The database may need refreshing."
        });
        return;
      }

      const devices = await loadNoiseState(ref);

      let raw;
      try {
        raw = await fetchRoutes([startLat, startLon], [endLat, endLon]);
      } catch (err) {
        console.error("Routing provider failed:", err);
        res
          .status(502)
          .json({ detail: "Could not reach the routing provider" });
        return;
      }

      const scored = raw
        .map((r: any) =>
          scoreRoute(r, sensors, devices, refuges, r.steps, wCrowd, wNoise)
        )
        .filter((r: any): r is NonNullable<typeof r> => r !== null)
        .sort((a: any, b: any) => a.rank_score - b.rank_score)
        .map((r: any, i: number) => ({
          ...r,
          rank: i + 1,
          recommended: i === 0
        }));

      if (scored.length === 0) {
        res.status(404).json({
          detail:
            "No route could be scored. It may fall outside sensor coverage."
        });
        return;
      }

      res.json({
        reference_time: ref.toISOString(),
        journey: {
          start: [startLat, startLon],
          end: [endLat, endLon]
        },
        scoring: {
          ranked_on: "worst 20% of sampled points",
          band_from: "whole-route mean",
          snap_radius_m: SNAP_RADIUS_M,
          noise_min_coverage: MIN_NOISE_COVERAGE,
          bands: { Low: "<= 50", Moderate: "50-80", High: "> 80" }
        },
        routes: scored
      });
    })();

    const timeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("route calculation timed out")),
        TOTAL_TIMEOUT_MS
      )
    );

    try {
      await Promise.race([work, timeout]);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "route calculation timed out"
      ) {
        res
          .status(504)
          .json({
            detail: "Route calculation took too long — please try again."
          });
        return;
      }
      throw err; // anything else still falls through to the global error handler
    }
  })
);

export default router;
