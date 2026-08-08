import { Request, Response, NextFunction } from "express";

export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
}

const MELB_TZ = "Australia/Melbourne";
const WEEKDAY_MAP: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

/**
 * Converts a JS Date to Melbourne-local day-of-week (Python .dt.dayofweek
 * convention: 0=Monday..6=Sunday) and hour-of-day, matching how
 * load_data.py built noise_baseline/pedestrian_baseline.
 */
export function melbourneDayHour(date: Date): { pyWeekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: MELB_TZ,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  
  const weekdayStr = parts.find((p) => p.type === "weekday")!.value;
  const hourStr = parts.find((p) => p.type === "hour")!.value;
  const pyWeekday = WEEKDAY_MAP[weekdayStr] ?? 0;

  return { pyWeekday, hour: Number(hourStr) };
}