import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

export const pool = new Pool({
  database: process.env.PGDATABASE || "ta17_onboarding",
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || "ta17",
  password: process.env.PGPASSWORD || "ta17_dev_password",
});