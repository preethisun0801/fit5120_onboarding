import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DB = dict(
    dbname=os.getenv("PGDATABASE", "ta17_onboarding"),
    host=os.getenv("PGHOST", "localhost"),
    port=os.getenv("PGPORT", 5432),
    user=os.getenv("PGUSER", "ta17"),
    password=os.getenv("PGPASSWORD", "ta17_dev_password"),
)

def get_conn():
    return psycopg2.connect(**DB, cursor_factory=RealDictCursor)