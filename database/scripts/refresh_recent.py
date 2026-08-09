# database/scripts/refresh_recent.py
import sys
import psycopg2
from load_data import DB, load_pedestrian_realtime, load_noise, log

def main():
    try:
        conn = psycopg2.connect(**DB)
    except psycopg2.OperationalError as e:
        log(f"Could not connect to the database: {e}")
        sys.exit(1)

    conn.autocommit = False
    cur = conn.cursor()

    try:
        load_pedestrian_realtime(cur)
        load_noise(cur)
        conn.commit()
        log("\nRefreshed pedestrian + noise readings.")
    except Exception as e:
        conn.rollback()
        log(f"\nFailed, rolled back: {type(e).__name__}: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()