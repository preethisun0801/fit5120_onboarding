import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

const sslEnabled =
  process.env.PGSSL === "true" ||
  process.env.PGSSLMODE === "require" ||
  process.env.PGSSLMODE === "verify-ca" ||
  process.env.PGSSLMODE === "verify-full";

export const pool = new Pool({
  database: process.env.PGDATABASE || "ta17_onboarding",
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || "ta17",
  password: process.env.PGPASSWORD || "ta17_dev_password",
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
});