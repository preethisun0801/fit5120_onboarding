from fastapi import APIRouter, Query
from db import get_conn

router = APIRouter()

@router.get("")
def list_refuges(tier: str | None = Query(None, description="PRIMARY, SECONDARY, OUTER")):
    sql = """
        SELECT landmark_id, feature_name, latitude, longitude,
               sensory_tier, is_indoor
        FROM landmark
        WHERE sensory_tier IS NOT NULL AND sensory_tier <> 'EXCLUDED'
    """
    params = []
    if tier:
        sql += " AND sensory_tier = %s"
        params.append(tier.upper())

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()