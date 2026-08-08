import { Router } from "express";
import { pool } from "../db";
import { asyncHandler, melbourneDayHour } from "./utils";

const router = Router();

router.get(
  "/:locationId/current",
  asyncHandler(async (req, res) => {
    const locationId = Number(req.params.locationId);
    if (Number.isNaN(locationId)) {
      res.status(400).json({ detail: "locationId must be a number" });
      return;
    }

    const latestResult = await pool.query(
      `SELECT location_id, sensing_datetime, total_of_directions
       FROM pedestrian_count
       WHERE location_id = $1
       ORDER BY sensing_datetime DESC
       LIMIT 1`,
      [locationId]
    );
    const latest = latestResult.rows[0];

    if (!latest) {
      res.status(404).json({ detail: "No recent count for this sensor" });
      return;
    }

    const { pyWeekday, hour: hourOfDay } = melbourneDayHour(latest.sensing_datetime);

    const baselineResult = await pool.query(
      `SELECT median_count, p50_count, p80_count
       FROM pedestrian_baseline
       WHERE location_id = $1 AND day_of_week = $2 AND hour_of_day = $3`,
      [locationId, pyWeekday, hourOfDay]
    );
    const baseline = baselineResult.rows[0] || null;

    let label = "typical";
    if (baseline && latest.total_of_directions !== null) {
      if (latest.total_of_directions < baseline.p50_count) label = "quieter than usual";
      else if (latest.total_of_directions > baseline.p80_count) label = "busier than usual";
    }

    res.json({ ...latest, baseline, label });
  })
);

router.get(
  "/:locationId/baseline",
  asyncHandler(async (req, res) => {
    const locationId = Number(req.params.locationId);
    if (Number.isNaN(locationId)) {
      res.status(400).json({ detail: "locationId must be a number" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT day_of_week, hour_of_day, median_count, p50_count, p80_count
       FROM pedestrian_baseline
       WHERE location_id = $1
       ORDER BY day_of_week, hour_of_day`,
      [locationId]
    );
    res.json(rows);
  })
);

export default router;