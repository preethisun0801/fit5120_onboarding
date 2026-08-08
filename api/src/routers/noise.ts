import { Router } from "express";
import { pool } from "../db";
import { asyncHandler, melbourneDayHour } from "./utils";

const router = Router();

router.get(
  "/:deviceId/current",
  asyncHandler(async (req, res) => {
    const { deviceId } = req.params;

    const latestResult = await pool.query(
      `SELECT device_id, received_at, noise_db, is_valid
       FROM noise_reading
       WHERE device_id = $1 AND is_valid = TRUE
       ORDER BY received_at DESC
       LIMIT 1`,
      [deviceId]
    );
    const latest = latestResult.rows[0];

    if (!latest) {
      res.status(404).json({ detail: "No valid recent reading for this device" });
      return;
    }

    const { pyWeekday, hour: hourOfDay } = melbourneDayHour(latest.received_at);

    const baselineResult = await pool.query(
      `SELECT median_db, p25_db, p75_db, p90_db
       FROM noise_baseline
       WHERE device_id = $1 AND day_of_week = $2 AND hour_of_day = $3`,
      [deviceId, pyWeekday, hourOfDay]
    );
    const baseline = baselineResult.rows[0] || null;

    let label = "typical";
    if (baseline) {
      if (latest.noise_db < baseline.p25_db) label = "quieter than usual";
      else if (latest.noise_db > baseline.p75_db) label = "louder than usual";
    }

    res.json({ ...latest, baseline, label });
  })
);

router.get(
  "/devices",
  asyncHandler(async (req, res) => {
    const includeExcluded = req.query.include_excluded === "true";

    let sql = `SELECT device_id, latitude, longitude, is_excluded, exclusion_reason FROM microclimate_device`;
    if (!includeExcluded) sql += " WHERE is_excluded = FALSE";

    const { rows } = await pool.query(sql);
    res.json(rows);
  })
);

export default router;