import { Router } from "express";
import { pool } from "../db";
import { asyncHandler } from "./utils";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const tier = req.query.tier as string | undefined;

    let sql = `
      SELECT landmark_id, feature_name, latitude, longitude, sensory_tier, is_indoor
      FROM landmark
      WHERE sensory_tier IS NOT NULL AND sensory_tier <> 'EXCLUDED'
    `;
    const params: string[] = [];

    if (tier) {
      sql += " AND sensory_tier = $1";
      params.push(tier.toUpperCase());
    }

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  })
);

export default router;