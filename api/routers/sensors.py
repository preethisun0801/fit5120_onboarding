from fastapi import APIRouter, Query
from db import get_conn

router = APIRouter()

@router.get("")
def list_sensors(active_only: bool = Query(True)):
    sql = "SELECT location_id, sensor_description, sensor_name, location_type, status, latitude, longitude FROM sensor"
    if active_only:
        sql += " WHERE status = 'A'"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


@router.get("/nearby")
def nearby_sensors(lat: float, lon: float, radius_m: int = 300):
    sql = """
        SELECT location_id, sensor_description, sensor_name, latitude, longitude, distance_m
        FROM (
            SELECT location_id, sensor_description, sensor_name, latitude, longitude,
                   2 * 6371000 * ASIN(SQRT(
                       POWER(SIN(RADIANS(latitude - %s) / 2), 2)
                       + COS(RADIANS(%s)) * COS(RADIANS(latitude))
                       * POWER(SIN(RADIANS(longitude - %s) / 2), 2)
                   )) AS distance_m
            FROM sensor
            WHERE latitude IS NOT NULL AND status = 'A'
        ) sub
        WHERE distance_m <= %s
        ORDER BY distance_m
    """
    params = [lat, lat, lon, radius_m]

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()