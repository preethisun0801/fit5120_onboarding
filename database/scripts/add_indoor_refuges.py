"""
FIT5120 TA17 — Add indoor refuges and classify indoor sensor purpose

Background:
    We originally found only one library in the Landmarks dataset and recorded
    "no library data available" as a limitation. That was wrong. All seven City
    of Melbourne libraries exist in the pedestrian sensor table, they are simply
    absent from the landmarks table.

    The limitation is therefore withdrawn. What replaces it is more useful: the
    same category of facility in the same city may be recorded in only one
    dataset. Not finding something in one dataset does not mean it does not exist.

This script does two things:
    1. Adds seven indoor public venues to the landmark table as refuges
    2. Adds an indoor_purpose column to sensor, separating the three very
       different things the indoor sensors actually measure

Run:
    cd scripts
    python3 add_indoor_refuges.py

Safe to run more than once, nothing tobe duplicated
"""

import sys

import psycopg2

DB = dict(dbname="ta17_onboarding", host="localhost", port=5432)


# ------------------------------------------------------------
# Indoor sensor purpose
#
# VENUE       A whole-building entrance. The count represents how busy the
#             place actually is.
# INTERNAL    Footfall through one lift or stairwell inside a building. A busy
#             third-floor children's area says nothing about whether the ground
#             floor reading room is noisy. Misleading if used on its own.
# NOT_REFUGE  Not a public space you can walk into and sit down in.
# ------------------------------------------------------------

SENSOR_PURPOSE = {
    # --- whole-venue entrances ---
    89: "VENUE",  # City Library
    93: "VENUE",  # East Melbourne Library
    102: "VENUE",  # North Melbourne Library
    104: "VENUE",  # Kathleen Syme Library Main
    90: "VENUE",  # Boyd Community Hub - Library
    91: "VENUE",  # Library at The Dock - North side
    92: "VENUE",  # Library at The Dock - South side
    94: "VENUE",  # Fitzroy Garden - The Conservatory
    149: "VENUE",  # narrm ngarrgu Level 1 Main Stairs A
    150: "VENUE",  # narrm ngarrgu Level 1 Main Stairs B
    # --- internal circulation only ---
    105: "INTERNAL",  # Kathleen Syme Library Lib
    106: "INTERNAL",  # Kathleen Syme Library Cafe
    95: "INTERNAL",  # Fitzroy Garden Visitor Centre External
    96: "INTERNAL",  # Fitzroy Garden Visitor Centre Internal
    116: "INTERNAL",  # Fitzroy Garden Visitor Centre Cafe Verandah
    144: "INTERNAL",
    145: "INTERNAL",
    146: "INTERNAL",
    147: "INTERNAL",
    148: "INTERNAL",
    151: "INTERNAL",
    152: "INTERNAL",
    153: "INTERNAL",
    154: "INTERNAL",
    155: "INTERNAL",
    # --- not refuges ---
    80: "NOT_REFUGE",  # Boyd Community rear door (duplicates the library entry)
    81: "NOT_REFUGE",  # Boyd Community front door
    82: "NOT_REFUGE",  # 512 Elizabeth Street — a street address, venue unknown
    83: "NOT_REFUGE",  # 510 Elizabeth Street
    158: "NOT_REFUGE",  # 514 Elizabeth Street
    159: "NOT_REFUGE",  # 516 Elizabeth Street
    160: "NOT_REFUGE",  # City Baths — paid swimming facility
    103: "NOT_REFUGE",  # Kensington Town Hall — council offices
    99: "NOT_REFUGE",  # Town Hall Visitor Centre — council offices
}


# ------------------------------------------------------------
# Indoor refuges to add
#
# Coordinates are taken from the sensor locations. Library at The Dock has north
# and south entrances and narrm ngarrgu has a dozen internal sensors; one point
# is used to represent each venue.
#
# Note: these venues have live footfall data but no historical baseline, because
# the historical dataset covers outdoor sensors only. We can therefore say how
# many people entered in the last hour, but not whether that is busy or quiet.
# Until a baseline exists, only the location is exposed, not the occupancy.
#
# This follows the same principle applied to noise: better to show one fewer
# indicator than to show a number the user cannot interpret.
# ------------------------------------------------------------

INDOOR_REFUGES = [
    # (name, latitude, longitude, tier, note)
    (
        "City Library",
        -37.8168596,
        144.9658658,
        "PRIMARY",
        "Free public library in the central city; quiet indoor space",
    ),
    (
        "narrm ngarrgu Library",
        -37.8078116,
        144.9582219,
        "PRIMARY",
        "Municipal library opened 2023; multiple quiet floors",
    ),
    (
        "Library at The Dock",
        -37.8200188,
        144.9402986,
        "PRIMARY",
        "Free public library, Docklands",
    ),
    (
        "Kathleen Syme Library",
        -37.7986355,
        144.9654821,
        "PRIMARY",
        "Free public library and community centre, Carlton",
    ),
    (
        "North Melbourne Library",
        -37.8034054,
        144.9497701,
        "SECONDARY",
        "Free public library, outside the CBD walking core",
    ),
    (
        "East Melbourne Library",
        -37.8149841,
        144.9863881,
        "SECONDARY",
        "Free public library, outside the CBD walking core",
    ),
    (
        "Boyd Community Hub Library",
        -37.8255621,
        144.9611542,
        "SECONDARY",
        "Community library, Southbank",
    ),
]

# The Conservatory already exists in the landmarks data, so it is not added
# again — only its missing coordinates are filled in.
CONSERVATORY_COORDS = (-37.8142453, 144.9785186)


def log(m):
    print(m, flush=True)


def main():
    try:
        conn = psycopg2.connect(**DB)
    except psycopg2.OperationalError as e:
        log(f"Could not connect to the database: {e}")
        sys.exit(1)

    conn.autocommit = False
    cur = conn.cursor()

    try:
        # --- 1. add the column ---
        log("\n[1/4] Adding indoor_purpose to sensor")
        cur.execute("""
            ALTER TABLE sensor
            ADD COLUMN IF NOT EXISTS indoor_purpose TEXT
            CHECK (indoor_purpose IN ('VENUE','INTERNAL','NOT_REFUGE'))
        """)

        for loc_id, purpose in SENSOR_PURPOSE.items():
            cur.execute(
                "UPDATE sensor SET indoor_purpose = %s WHERE location_id = %s",
                (purpose, loc_id),
            )

        cur.execute("""
            SELECT indoor_purpose, COUNT(*) FROM sensor
            WHERE indoor_purpose IS NOT NULL
            GROUP BY indoor_purpose ORDER BY indoor_purpose
        """)
        for purpose, n in cur.fetchall():
            log(f"    {purpose:<12} {n:>3}")

        # --- 2. fill in the Conservatory coordinates ---
        log("\n[2/4] Filling in Conservatory coordinates")
        cur.execute(
            """
            UPDATE landmark SET latitude = %s, longitude = %s
            WHERE feature_name = 'Conservatory'
              AND (latitude IS NULL OR longitude IS NULL)
        """,
            CONSERVATORY_COORDS,
        )
        log(f"    {cur.rowcount} row(s) updated")

        # --- 3. add the indoor refuges ---
        log("\n[3/4] Adding indoor refuges")
        added = 0
        for name, lat, lon, tier, note in INDOOR_REFUGES:
            cur.execute("SELECT 1 FROM landmark WHERE feature_name = %s", (name,))
            if cur.fetchone():
                log(f"    already present, skipping: {name}")
                continue
            cur.execute(
                """
                INSERT INTO landmark
                    (feature_name, theme_id, latitude, longitude,
                     sensory_tier, is_indoor, exclusion_reason)
                VALUES (%s, NULL, %s, %s, %s, TRUE, NULL)
            """,
                (name, lat, lon, tier),
            )
            added += 1
        log(f"    {added} added")

        # --- 4. rebuild proximity, outdoor sensors only ---
        # Indoor sensors measure circulation inside buildings, which is not
        # comparable to street-level pedestrian flow. They must not appear in
        # the proximity table that drives route-level refuge suggestions.
        log("\n[4/4] Rebuilding proximity (outdoor sensors only)")
        cur.execute("DELETE FROM sensor_landmark_proximity")
        cur.execute("""
            INSERT INTO sensor_landmark_proximity (location_id, landmark_id, distance_in_m)
            SELECT s.location_id, l.landmark_id,
                   ROUND(
                     2 * 6371000 * ASIN(SQRT(
                       POWER(SIN(RADIANS(l.latitude - s.latitude) / 2), 2)
                       + COS(RADIANS(s.latitude)) * COS(RADIANS(l.latitude))
                       * POWER(SIN(RADIANS(l.longitude - s.longitude) / 2), 2)
                     ))
                   )::INT
            FROM sensor s
            JOIN landmark l ON l.latitude IS NOT NULL
            WHERE s.location_type = 'Outdoor'
              AND s.latitude IS NOT NULL
              AND l.sensory_tier IS NOT NULL
              AND l.sensory_tier <> 'EXCLUDED'
              AND 2 * 6371000 * ASIN(SQRT(
                    POWER(SIN(RADIANS(l.latitude - s.latitude) / 2), 2)
                    + COS(RADIANS(s.latitude)) * COS(RADIANS(l.latitude))
                    * POWER(SIN(RADIANS(l.longitude - s.longitude) / 2), 2)
                  )) <= 500
        """)
        log(f"    {cur.rowcount} proximity rows written")

        conn.commit()

        # --- summary ---
        log("\n" + "=" * 52)
        cur.execute("""
            SELECT sensory_tier, is_indoor, COUNT(*) FROM landmark
            WHERE sensory_tier IS NOT NULL
            GROUP BY sensory_tier, is_indoor ORDER BY sensory_tier, is_indoor
        """)
        log(f"{'tier':<14}{'indoor':<10}{'count':>6}")
        for tier, indoor, n in cur.fetchall():
            log(f"{tier:<14}{'yes' if indoor else 'no':<10}{n:>6}")

        cur.execute("SELECT COUNT(*) FROM landmark WHERE sensory_tier IS NOT NULL")
        log(f"\nTiered refuges total: {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM landmark WHERE is_indoor")
        log(f"Of which indoor: {cur.fetchone()[0]}")
        log("=" * 52)

    except Exception as e:
        conn.rollback()
        log(f"\nFailed, rolled back:\n{type(e).__name__}: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
