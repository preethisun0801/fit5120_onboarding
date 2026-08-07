"""
FIT5120 TA17 — data loader

Pulls the City of Melbourne open data, cleans it, and writes it into PostgreSQL.

Run:
    python3 load_data.py

The first run takes 5–15 minutes, almost all of it downloading 1.3M historical
pedestrian rows. Progress is printed as it goes.

Run add_indoor_refuges.py afterwards. It adds the indoor library refuges, adds
the indoor_purpose column, and rebuilds the proximity table using outdoor
sensors only. Skipping it leaves indoor sensors mixed into street-level data.

The write order follows the foreign key dependencies and must not be reordered:
    sensor              -> pedestrian_count / pedestrian_baseline
    microclimate_device -> noise_reading / noise_baseline
    theme -> landmark   -> sensor_landmark_proximity

The whole run is a single transaction. If any step fails, everything is rolled
back and the database is left exactly as it was.
"""

import io
import math
import sys

import pandas as pd
import psycopg2
import requests
from psycopg2.extras import execute_values

# ------------------------------------------------------------
# Configuration
# ------------------------------------------------------------

DB = dict(dbname="ta17_onboarding", host="localhost", port=5432)
# If you are running the database in Docker, add the credentials:
# DB = dict(dbname="ta17_onboarding", host="localhost", port=5432,
#           user="ta17", password="ta17_dev_password")

BASE = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog"
TIMEOUT = 300

DS_SENSOR = "pedestrian-counting-system-sensor-locations"
DS_REALTIME = "pedestrian-counting-system-past-hour-counts-per-minute"
DS_HISTORY = "pedestrian-counting-system-monthly-counts-per-hour"
DS_MICRO = "microclimate-sensors-data"
DS_LANDMARK = (
    "landmarks-and-places-of-interest-including-schools-"
    "theatres-health-services-spor"
)

HISTORY_FROM = "2025-01-01"
MELB = "Australia/Melbourne"

# Noise cleaning bounds. Rationale recorded in the DMP:
#   0 dB is the threshold of human hearing and cannot occur outdoors — these are
#     missing values encoded as zero
#   sustained street-level readings above 100 dB are more consistent with a
#     device fault than with the environment
DB_MIN, DB_MAX = 25.0, 100.0

# Faulty devices. ICTMicroclimate-03 varied by only 1.1 dB across 25 continuous
# hours spanning overnight and morning peak, which is not physically plausible
# for an outdoor sensor.
EXCLUDED_DEVICES = {
    "ICTMicroclimate-03": "Stuck sensor: 1.1 dB variation across 25 continuous hours",
}
STALE_AFTER_DAYS = 30

# Radii for the spatial relationship tables
LANDMARK_RADIUS_M = 500
DEVICE_RADIUS_M = 300


# ------------------------------------------------------------
# Curated refuge tiers
#
# The council's classification serves municipal asset management, not sensory
# accessibility. A single sub_theme holds traditional gardens alongside
# Federation Square and a football club. Used unfiltered, the product would
# direct someone in sensory overload to the worst places in the city.
# ------------------------------------------------------------

TIERS = {
    # Primary: traditional gardens — tree canopy, seating, established paths,
    # set back from arterial roads
    "Fitzroy Gardens": ("PRIMARY", False, None),
    "Treasury Gardens": ("PRIMARY", False, None),
    "Carlton Gardens North": ("PRIMARY", False, None),
    "Carlton Gardens South": ("PRIMARY", False, None),
    "Flagstaff Gardens": ("PRIMARY", False, None),
    "Queen Victoria Gardens": ("PRIMARY", False, None),
    "Royal Botanic Gardens": ("PRIMARY", False, None),
    "Kings Domain": ("PRIMARY", False, None),
    # Indoor: remain usable in rain and extreme heat, when gardens do not
    "State Library Victoria": ("PRIMARY", True, None),
    "Conservatory": ("PRIMARY", True, None),
    # Secondary: urban squares and smaller parks — usable, but less shelter or
    # smaller scale
    "Argyle Square": ("SECONDARY", False, None),
    "Lincoln Square": ("SECONDARY", False, None),
    "University Square": ("SECONDARY", False, None),
    "Macarthur Square": ("SECONDARY", False, None),
    "Murchinson Square": ("SECONDARY", False, None),
    "Darling Square": ("SECONDARY", False, None),
    "Piazza Italia": ("SECONDARY", False, None),
    "Parliament Reserve": ("SECONDARY", False, None),
    "Batman Park": ("SECONDARY", False, None),
    "Alexandra Gardens": ("SECONDARY", False, None),
    # Retained with a caveat: the adjacent sensor measured 70.3 dB, reflecting
    # its position against Flinders Street and the river road. Being a park does
    # not imply a low-stimulation environment — this entry is the evidence.
    "Enterprize Park": ("SECONDARY", False, None),
    "Shrine of Remembrance": ("SECONDARY", True, None),
    "NGV International": ("SECONDARY", True, None),
    # Outer: beyond CBD walking range for the commuting scenario
    "Fawkner Park": ("OUTER", False, None),
    "Princes Park": ("OUTER", False, None),
    "Royal Park": ("OUTER", False, None),
    "Westgate Park": ("OUTER", False, None),
    "J.J Holland Park": ("OUTER", False, None),
    "Newmarket Reserve": ("OUTER", False, None),
    "Powlett Reserve": ("OUTER", False, None),
    "North Melbourne Recreation Reserve": ("OUTER", False, None),
    "Shrine of Rembrance Reserve": ("OUTER", False, None),
    # Excluded on three stated grounds: not a publicly accessible rest space,
    # a known high-stimulation event venue, or an exposed waterfront site
    # lacking shelter. Rows are kept rather than deleted so that "why isn't this
    # recommended" is answerable from the data.
    "Federation Square": (
        "EXCLUDED",
        False,
        "High-stimulation venue: permanent large-format screens, " "near-weekly events",
    ),
    "Yarra Park": (
        "EXCLUDED",
        False,
        "MCG parking and egress area; extreme crowding on event days",
    ),
    "Richmond Football Club": (
        "EXCLUDED",
        False,
        "Classification error: private club facility, " "not a public open space",
    ),
    "Riverslide Skate Park": (
        "EXCLUDED",
        False,
        "Continuous impact noise from skating",
    ),
    "Sandridge Rail Bridge": (
        "EXCLUDED",
        False,
        "Classification error: a bridge, not a rest space",
    ),
    "Birrarung Marr": ("EXCLUDED", False, "Major event venue"),
    "Docklands Park": (
        "EXCLUDED",
        False,
        "Exposed waterfront: high wind, poor acoustic shelter",
    ),
    "New Quay": (
        "EXCLUDED",
        False,
        "Exposed waterfront: high wind, poor acoustic shelter",
    ),
    "Point Park": (
        "EXCLUDED",
        False,
        "Exposed waterfront: high wind, poor acoustic shelter",
    ),
}


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------


def log(msg):
    print(msg, flush=True)


def api_records(dsid, pages=5, **params):
    """Paginated fetch, 100 records per page."""
    out = []
    for i in range(pages):
        r = requests.get(
            f"{BASE}/datasets/{dsid}/records",
            params={"limit": 100, "offset": i * 100, **params},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        page = r.json().get("results", [])
        if not page:
            break
        out.extend(page)
    return out


def api_export(dsid, where=None, select=None):
    """Bulk CSV download. Far faster than paging for large history."""
    params = {}
    if where:
        params["where"] = where
    if select:
        params["select"] = select
    r = requests.get(
        f"{BASE}/datasets/{dsid}/exports/csv", params=params, timeout=TIMEOUT
    )
    r.raise_for_status()
    head = r.text[:300]
    return pd.read_csv(io.StringIO(r.text), sep=";" if ";" in head else ",")


def latlon(v):
    if isinstance(v, dict):
        lat = v.get("lat") or v.get("latitude")
        lon = v.get("lon") or v.get("lng") or v.get("longitude")
        if lat is not None and lon is not None:
            return float(lat), float(lon)
    return None, None


def haversine_m(a, b, c, d):
    R = 6371000.0
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def insert(cur, table, columns, rows):
    if not rows:
        log(f"    {table}: nothing to write")
        return
    sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s ON CONFLICT DO NOTHING"
    execute_values(cur, sql, rows, page_size=1000)
    log(f"    {table}: {len(rows):,} rows written")


# ------------------------------------------------------------
# Stages
# ------------------------------------------------------------


def load_sensor(cur):
    log("\n[1/8] Pedestrian sensor locations")
    rows = api_records(DS_SENSOR, pages=3)
    data = [
        (
            r["location_id"],
            r.get("sensor_description"),
            r.get("sensor_name"),
            r.get("installation_date"),
            r.get("note"),
            r.get("location_type"),
            r.get("status"),
            r.get("direction_1"),
            r.get("direction_2"),
            r.get("latitude"),
            r.get("longitude"),
        )
        for r in rows
        if r.get("location_id") is not None
    ]
    insert(
        cur,
        "sensor",
        [
            "location_id",
            "sensor_description",
            "sensor_name",
            "installation_date",
            "note",
            "location_type",
            "status",
            "direction_1",
            "direction_2",
            "latitude",
            "longitude",
        ],
        data,
    )
    return {
        r["location_id"]: (r.get("latitude"), r.get("longitude"))
        for r in rows
        if r.get("latitude") is not None
    }


def load_pedestrian_realtime(cur):
    log("\n[2/8] Pedestrian real-time counts")
    df = api_export(
        DS_REALTIME,
        select="location_id, sensing_datetime, direction_1, "
        "direction_2, total_of_directions",
    )
    df = df.dropna(subset=["location_id", "sensing_datetime"])
    # The provider reports an unresolved defect producing duplicate records for
    # sensors 67, 68 and 69.
    df = df.drop_duplicates(subset=["location_id", "sensing_datetime"])
    data = [
        (
            int(r.location_id),
            r.sensing_datetime,
            None if pd.isna(r.direction_1) else int(r.direction_1),
            None if pd.isna(r.direction_2) else int(r.direction_2),
            None if pd.isna(r.total_of_directions) else int(r.total_of_directions),
            False,
        )
        for r in df.itertuples()
    ]
    insert(
        cur,
        "pedestrian_count",
        [
            "location_id",
            "sensing_datetime",
            "direction_1_count",
            "direction_2_count",
            "total_of_directions",
            "is_estimated",
        ],
        data,
    )


def load_pedestrian_baseline(cur, sensors):
    log("\n[3/8] Pedestrian historical baseline (1.3M rows, takes a few minutes)")
    df = api_export(
        DS_HISTORY,
        where=f"sensing_date >= date'{HISTORY_FROM}'",
        select="location_id, sensing_date, hourday, pedestriancount",
    )
    df = df.dropna(subset=["location_id", "sensing_date", "hourday", "pedestriancount"])
    log(f"    downloaded: {len(df):,} rows")

    df["sensing_date"] = pd.to_datetime(df["sensing_date"], errors="coerce")
    df = df.dropna(subset=["sensing_date"])

    # The history contains sensors that have since been removed, while the
    # locations table lists only the ones still in service. Sensors have been
    # added, moved and decommissioned since 2009, some because of construction.
    # The foreign key would reject rows pointing at a sensor that no longer
    # exists, so they are filtered out here.
    before = df["location_id"].nunique()
    df = df[df["location_id"].isin(sensors.keys())]
    after = df["location_id"].nunique()
    log(
        f"    history covers {before} sensors, {after} still in service, "
        f"{before - after} decommissioned and excluded from the baseline"
    )

    df["day_of_week"] = df["sensing_date"].dt.dayofweek
    df["hour_of_day"] = df["hourday"].astype(int)

    g = (
        df.groupby(["location_id", "day_of_week", "hour_of_day"])["pedestriancount"]
        .agg(
            median_count="median",
            p50_count=lambda s: s.quantile(0.50),
            p80_count=lambda s: s.quantile(0.80),
            observation_count="count",
        )
        .reset_index()
    )
    log(f"    aggregated into {len(g):,} baseline rows")

    data = [
        (
            int(r.location_id),
            int(r.day_of_week),
            int(r.hour_of_day),
            float(r.median_count),
            float(r.p50_count),
            float(r.p80_count),
            int(r.observation_count),
        )
        for r in g.itertuples()
    ]
    insert(
        cur,
        "pedestrian_baseline",
        [
            "location_id",
            "day_of_week",
            "hour_of_day",
            "median_count",
            "p50_count",
            "p80_count",
            "observation_count",
        ],
        data,
    )


def load_noise(cur):
    log("\n[4/8] Noise readings and devices")
    df = api_export(
        DS_MICRO,
        where=f"noise is not null and received_at >= date'{HISTORY_FROM}'",
        select="device_id, received_at, noise, latlong",
    )
    df["received_at"] = pd.to_datetime(df["received_at"], utc=True, errors="coerce")
    df = df.dropna(subset=["device_id", "received_at", "noise"])
    raw_n = len(df)
    log(f"    raw readings: {raw_n:,}")

    # Device coordinates come from the readings table. The official locations
    # table is keyed on site_id, which has zero overlap with device_id.
    devices = {}
    for r in df.drop_duplicates("device_id").itertuples():
        lat, lon = latlon(r.latlong) if isinstance(r.latlong, dict) else (None, None)
        if lat is None and isinstance(r.latlong, str) and "," in r.latlong:
            try:
                a, b = r.latlong.split(",")
                lat, lon = float(a), float(b)
            except ValueError:
                pass
        devices[r.device_id] = [lat, lon, False, None]

    # Devices that have stopped reporting
    last_seen = df.groupby("device_id")["received_at"].max()
    cutoff = df["received_at"].max() - pd.Timedelta(days=STALE_AFTER_DAYS)
    for d, ts in last_seen.items():
        if ts < cutoff:
            devices[d][2] = True
            devices[d][3] = f"Stale: last reading {ts:%Y-%m-%d}"
    # Known faulty devices
    for d, reason in EXCLUDED_DEVICES.items():
        if d in devices:
            devices[d][2] = True
            devices[d][3] = reason

    insert(
        cur,
        "microclimate_device",
        ["device_id", "latitude", "longitude", "is_excluded", "exclusion_reason"],
        [(d, v[0], v[1], v[2], v[3]) for d, v in devices.items()],
    )

    df["is_valid"] = (df["noise"] >= DB_MIN) & (df["noise"] <= DB_MAX)
    invalid = (~df["is_valid"]).sum()
    log(f"    flagged invalid: {invalid:,} readings ({invalid/raw_n*100:.2f}%)")

    # Only the last 7 days of raw readings are stored. The full history is used
    # to compute the baseline but is not itself persisted.
    recent = df[df["received_at"] >= df["received_at"].max() - pd.Timedelta(days=7)]
    recent = recent.drop_duplicates(subset=["device_id", "received_at"])
    insert(
        cur,
        "noise_reading",
        ["device_id", "received_at", "noise_db", "is_valid"],
        [
            (r.device_id, r.received_at, float(r.noise), bool(r.is_valid))
            for r in recent.itertuples()
        ],
    )
    return df, devices


def load_noise_baseline(cur, df):
    log("\n[5/8] Noise baseline")
    clean = df[df["is_valid"]].copy()
    clean = clean[~clean["device_id"].isin(EXCLUDED_DEVICES)]
    local = clean["received_at"].dt.tz_convert(MELB)
    clean["day_of_week"] = local.dt.dayofweek
    clean["hour_of_day"] = local.dt.hour

    g = (
        clean.groupby(["device_id", "day_of_week", "hour_of_day"])["noise"]
        .agg(
            median_db="median",
            p25_db=lambda s: s.quantile(0.25),
            p75_db=lambda s: s.quantile(0.75),
            p90_db=lambda s: s.quantile(0.90),
            observation_count="count",
        )
        .reset_index()
    )
    insert(
        cur,
        "noise_baseline",
        [
            "device_id",
            "day_of_week",
            "hour_of_day",
            "median_db",
            "p25_db",
            "p75_db",
            "p90_db",
            "observation_count",
        ],
        [
            (
                r.device_id,
                int(r.day_of_week),
                int(r.hour_of_day),
                float(r.median_db),
                float(r.p25_db),
                float(r.p75_db),
                float(r.p90_db),
                int(r.observation_count),
            )
            for r in g.itertuples()
        ],
    )


def load_landmarks(cur):
    log("\n[6/8] Landmarks and refuge curation")
    rows = api_records(DS_LANDMARK, pages=3)

    themes, tid = {}, 1
    theme_rows, landmark_rows = [], []
    for r in rows:
        key = (r.get("theme"), r.get("sub_theme"))
        if key not in themes:
            themes[key] = tid
            theme_rows.append((tid, key[0], key[1]))
            tid += 1
        lat, lon = latlon(r.get("co_ordinates"))
        name = r.get("feature_name")
        tier, indoor, reason = TIERS.get(name, (None, False, None))
        landmark_rows.append((name, themes[key], lat, lon, tier, indoor, reason))

    insert(cur, "theme", ["theme_id", "theme", "sub_theme"], theme_rows)
    cur.execute("SELECT setval('theme_theme_id_seq', %s)", (tid,))

    insert(
        cur,
        "landmark",
        [
            "feature_name",
            "theme_id",
            "latitude",
            "longitude",
            "sensory_tier",
            "is_indoor",
            "exclusion_reason",
        ],
        landmark_rows,
    )

    tiered = sum(1 for r in landmark_rows if r[4])
    log(f"    {tiered} manually tiered; the rest remain unclassified landmarks")


def load_proximity(cur, sensors, devices):
    log("\n[7/8] Spatial proximity")

    cur.execute(
        "SELECT landmark_id, latitude, longitude FROM landmark "
        "WHERE latitude IS NOT NULL AND sensory_tier IS NOT NULL"
    )
    landmarks = cur.fetchall()

    pairs = []
    for lid, (slat, slon) in sensors.items():
        for landmark_id, llat, llon in landmarks:
            d = haversine_m(float(slat), float(slon), float(llat), float(llon))
            if d <= LANDMARK_RADIUS_M:
                pairs.append((lid, landmark_id, round(d)))
    insert(
        cur,
        "sensor_landmark_proximity",
        ["location_id", "landmark_id", "distance_in_m"],
        pairs,
    )

    dpairs = []
    for lid, (slat, slon) in sensors.items():
        for did, v in devices.items():
            if v[0] is None or v[2]:
                continue
            d = haversine_m(float(slat), float(slon), v[0], v[1])
            if d <= DEVICE_RADIUS_M:
                dpairs.append((lid, did, round(d)))
    insert(
        cur,
        "sensor_device_proximity",
        ["location_id", "device_id", "distance_in_m"],
        dpairs,
    )


def load_parameters(cur):
    log("\n[8/8] Configuration parameters")
    params = [
        (
            "crowd_low_upper_percentile",
            "50",
            "Boundary between Low and Moderate sensory bands",
            "Percentile of each sensor's own history for the same hour-of-week, "
            "computed from 1.3M historical records",
        ),
        (
            "crowd_moderate_upper_percentile",
            "80",
            "Boundary between Moderate and High sensory bands",
            "As above",
        ),
        (
            "sensor_snap_radius_m",
            "150",
            "Maximum distance from a route sample point to an attributable sensor",
            "Chosen so a reading describes the corridor the user is walking",
        ),
        (
            "refuge_pairing_radius_m",
            "250",
            "Maximum distance for a noise device to describe a refuge",
            "Sound pressure falls ~6 dB per doubling of distance; beyond this a "
            "reading carries little information about the location",
        ),
        (
            "noise_quiet_percentile",
            "25",
            "Below this percentile of the site's own history, report quieter than usual",
            "Absolute decibel values are not interpretable to users; each site is "
            "compared against itself",
        ),
        (
            "noise_loud_percentile",
            "75",
            "Above this percentile, report louder than usual",
            "As above",
        ),
        (
            "noise_valid_min_db",
            str(DB_MIN),
            "Readings below this are treated as invalid",
            "0 dB is the threshold of human hearing and cannot occur outdoors; "
            "these are missing values encoded as zero",
        ),
        (
            "noise_valid_max_db",
            str(DB_MAX),
            "Readings above this are treated as invalid",
            "Sustained street-level readings above this are more consistent with "
            "device fault than with the environment",
        ),
    ]
    insert(
        cur,
        "routing_parameter",
        ["parameter_name", "value", "description", "evidence_source"],
        params,
    )


# ------------------------------------------------------------


def main():
    try:
        conn = psycopg2.connect(**DB)
    except psycopg2.OperationalError as e:
        log(f"Could not connect to the database: {e}")
        log("Check that PostgreSQL is running (Postgres.app, or the Docker container).")
        sys.exit(1)

    conn.autocommit = False
    cur = conn.cursor()

    try:
        sensors = load_sensor(cur)
        load_pedestrian_realtime(cur)
        load_pedestrian_baseline(cur, sensors)
        noise_df, devices = load_noise(cur)
        load_noise_baseline(cur, noise_df)
        load_landmarks(cur)
        load_proximity(cur, sensors, devices)
        load_parameters(cur)
        conn.commit()
        log("\nCommitted successfully.")
        log("Now run add_indoor_refuges.py to complete the load.")
    except Exception as e:
        conn.rollback()
        log(
            f"\nFailed, rolled back — the database is unchanged:\n"
            f"{type(e).__name__}: {e}"
        )
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
