import { Router } from "express";
import { pool } from "../db";
import { asyncHandler } from "./utils";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.active_only !== "false"; // defaults true

    let sql = `
      SELECT location_id, sensor_description, sensor_name, location_type, status, latitude, longitude
      FROM sensor
    `;
    if (activeOnly) sql += " WHERE status = 'A'";

    const { rows } = await pool.query(sql);
    res.json(rows);
  })
);

router.get(
  "/nearby",
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radiusM = Number(req.query.radius_m) || 300;

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      res.status(400).json({ detail: "lat and lon must be valid numbers" });
      return;
    }

    const sql = `
      SELECT location_id, sensor_description, sensor_name, latitude, longitude, distance_m
      FROM (
        SELECT location_id, sensor_description, sensor_name, latitude, longitude,
               2 * 6371000 * ASIN(SQRT(
                 POWER(SIN(RADIANS(latitude - $1) / 2), 2)
                 + COS(RADIANS($2)) * COS(RADIANS(latitude))
                 * POWER(SIN(RADIANS(longitude - $3) / 2), 2)
               )) AS distance_m
        FROM sensor
        WHERE latitude IS NOT NULL AND status = 'A'
      ) sub
      WHERE distance_m <= $4
      ORDER BY distance_m
    `;

    const { rows } = await pool.query(sql, [lat, lat, lon, radiusM]);
    res.json(rows);
  })
);

export default router;