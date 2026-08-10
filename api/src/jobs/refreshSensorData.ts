import { pool } from "../db";

const BASE = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog";
const DS_REALTIME = "pedestrian-counting-system-past-hour-counts-per-minute";
const DS_MICRO = "microclimate-sensors-data";
const DB_MIN = 25.0;
const DB_MAX = 100.0;
const NOISE_WINDOW_HOURS = 3; // narrow recent window — NOT load_data.py's full HISTORY_FROM pull
const INTERVAL_MS = 5 * 60 * 1000;

let isRunning = false;

// Mirrors load_data.py's api_export(): the ODS CSV bulk-export endpoint,
// chosen (not the paginated JSON /records endpoint) because these datasets
// can run into the thousands of rows and JSON pagination elsewhere in this
// codebase caps at a handful of pages.
async function apiExportCsv(dsid: string, where?: string, select?: string): Promise<string> {
  const url = new URL(`${BASE}/datasets/${dsid}/exports/csv`);
  if (where) url.searchParams.set("where", where);
  if (select) url.searchParams.set("select", select);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${dsid} export failed: ${res.status}`);
  return res.text();
}

// Minimal CSV parser matching this API's output — no external dependency.
// Handles the ';' vs ',' delimiter switch the same way load_data.py does,
// and unquotes simple quoted fields. Not a general-purpose RFC4180 parser;
// sufficient for this API's consistent, unquoted-except-for-commas output.
function parseCsv(text: string): Record<string, string>[] {
  const delim = text.slice(0, 300).includes(";") ? ";" : ",";
  const lines = text.trim().split("\n");
  const firstLine = lines[0];
  if (!firstLine || lines.length < 2) return [];

  const headers = firstLine.split(delim).map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cells = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

const BATCH_SIZE = 500;

async function batchedInsert(
  table: string,
  columns: string[],
  rows: any[][],
  conflictCols: string[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const placeholders: string[] = [];
    const values: any[] = [];
    let i = 1;

    for (const row of batch) {
      placeholders.push(`(${row.map(() => `$${i++}`).join(", ")})`);
      values.push(...row);
    }

    const sql = `
      INSERT INTO ${table} (${columns.join(", ")})
      VALUES ${placeholders.join(",")}
      ON CONFLICT (${conflictCols.join(", ")}) DO NOTHING
    `;
    const result = await pool.query(sql, values);
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

async function refreshPedestrian() {
  const csv = await apiExportCsv(
    DS_REALTIME,
    undefined,
    "location_id,sensing_datetime,direction_1,direction_2,total_of_directions"
  );
  const parsed = parseCsv(csv);

  const seen = new Set<string>();
  const rows: any[][] = [];

  for (const r of parsed) {
    if (!r.location_id || !r.sensing_datetime) continue;
    const key = `${r.location_id}|${r.sensing_datetime}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const d1 = r.direction_1 === "" ? null : Number(r.direction_1);
    const d2 = r.direction_2 === "" ? null : Number(r.direction_2);
    const total = r.total_of_directions === "" ? null : Number(r.total_of_directions);

    rows.push([Number(r.location_id), r.sensing_datetime, d1, d2, total, false]);
  }

  return batchedInsert(
    "pedestrian_count",
    ["location_id", "sensing_datetime", "direction_1_count", "direction_2_count", "total_of_directions", "is_estimated"],
    rows,
    ["location_id", "sensing_datetime"]
  );
}

async function refreshNoise() {
  const since = new Date(Date.now() - NOISE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const csv = await apiExportCsv(
    DS_MICRO,
    `noise is not null and received_at >= date'${since}'`,
    "device_id,received_at,noise"
  );
  const parsed = parseCsv(csv);

  const seen = new Set<string>();
  const rows: any[][] = [];

  for (const r of parsed) {
    if (!r.device_id || !r.received_at || r.noise === "") continue;
    const key = `${r.device_id}|${r.received_at}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const noise = Number(r.noise);
    const isValid = noise >= DB_MIN && noise <= DB_MAX;
    rows.push([r.device_id, r.received_at, noise, isValid]);
  }

  return batchedInsert(
    "noise_reading",
    ["device_id", "received_at", "noise_db", "is_valid"],
    rows,
    ["device_id", "received_at"]
  );
}

async function runRefresh() {
  if (isRunning) {
    console.warn("[refresh] Previous refresh still running — skipping this cycle.");
    return;
  }
  isRunning = true;
  const startedAt = new Date().toISOString();
  console.log(`[refresh] Starting at ${startedAt}`);

  try {
    const [pedRows, noiseRows] = await Promise.all([refreshPedestrian(), refreshNoise()]);
    console.log(
      `[refresh] Done — ${pedRows} new pedestrian rows, ${noiseRows} new noise rows.`
    );
  } catch (err) {
    console.error("[refresh] Failed:", err);
  } finally {
    isRunning = false;
  }
}

export function startRefreshJob() {
  runRefresh();
  setInterval(runRefresh, INTERVAL_MS);
}