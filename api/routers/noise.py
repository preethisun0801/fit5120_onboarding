from fastapi import APIRouter, HTTPException
from datetime import datetime
from db import get_conn

router = APIRouter()

@router.get("/{device_id}/current")
def current_noise(device_id: str):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT device_id, received_at, noise_db, is_valid
            FROM noise_reading
            WHERE device_id = %s AND is_valid = TRUE
            ORDER BY received_at DESC
            LIMIT 1
            """,
            (device_id,),
        )
        latest = cur.fetchone()
        if not latest:
            raise HTTPException(status_code=404, detail="No valid recent reading for this device")

        now = latest["received_at"]
        cur.execute(
            """
            SELECT median_db, p25_db, p75_db, p90_db
            FROM noise_baseline
            WHERE device_id = %s AND day_of_week = %s AND hour_of_day = %s
            """,
            (device_id, now.weekday(), now.hour),
        )
        baseline = cur.fetchone()

        cur.execute(
            "SELECT value FROM routing_parameter WHERE parameter_name = 'noise_quiet_percentile'"
        )
        quiet_p = cur.fetchone()
        cur.execute(
            "SELECT value FROM routing_parameter WHERE parameter_name = 'noise_loud_percentile'"
        )
        loud_p = cur.fetchone()

        label = "typical"
        if baseline:
            if latest["noise_db"] < baseline["p25_db"]:
                label = "quieter than usual"
            elif latest["noise_db"] > baseline["p75_db"]:
                label = "louder than usual"

        return {
            **latest,
            "baseline": baseline,
            "label": label,
        }


@router.get("/devices")
def list_devices(include_excluded: bool = False):
    sql = "SELECT device_id, latitude, longitude, is_excluded, exclusion_reason FROM microclimate_device"
    if not include_excluded:
        sql += " WHERE is_excluded = FALSE"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()