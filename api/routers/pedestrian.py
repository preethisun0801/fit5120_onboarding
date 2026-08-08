from fastapi import APIRouter, HTTPException
from db import get_conn

router = APIRouter()

@router.get("/{location_id}/current")
def current_pedestrian(location_id: int):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT location_id, sensing_datetime, total_of_directions
            FROM pedestrian_count
            WHERE location_id = %s
            ORDER BY sensing_datetime DESC
            LIMIT 1
            """,
            (location_id,),
        )
        latest = cur.fetchone()
        if not latest:
            raise HTTPException(status_code=404, detail="No recent count for this sensor")

        now = latest["sensing_datetime"]
        cur.execute(
            """
            SELECT median_count, p50_count, p80_count
            FROM pedestrian_baseline
            WHERE location_id = %s AND day_of_week = %s AND hour_of_day = %s
            """,
            (location_id, now.weekday(), now.hour),
        )
        baseline = cur.fetchone()

        label = "typical"
        if baseline and latest["total_of_directions"] is not None:
            if latest["total_of_directions"] < baseline["p50_count"]:
                label = "quieter than usual"
            elif latest["total_of_directions"] > baseline["p80_count"]:
                label = "busier than usual"

        return {**latest, "baseline": baseline, "label": label}


@router.get("/{location_id}/baseline")
def full_baseline(location_id: int):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT day_of_week, hour_of_day, median_count, p50_count, p80_count
            FROM pedestrian_baseline
            WHERE location_id = %s
            ORDER BY day_of_week, hour_of_day
            """,
            (location_id,),
        )
        return cur.fetchall()