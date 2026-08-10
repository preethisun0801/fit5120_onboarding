import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import sensorsRouter from "./routers/sensors";
import refugesRouter from "./routers/refuges";
import noiseRouter from "./routers/noise";
import pedestrianRouter from "./routers/pedestrian";
import routesRouter from "./routers/routes";
import liveRouter from "./routers/live";
import geocodeRouter from "./routers/geocode";
import { startRefreshJob } from "./jobs/refreshSensorData";

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://sensory-aware.onrender.com"
  ],
  methods: ["GET"]
}));

// All endpoints are GET-only and none expect a body — bodies aren't part of
// this API's design, so the limit only needs to be large enough that a
// malformed/oversized request fails fast rather than being processed at all.
app.use(express.json({ limit: "20kb" }));

// General limiter across the whole API. 120 requests/minute is generous for
// a single person actively planning routes (autocomplete alone can fire
// several requests per keystroke burst), while still bounding repeated or
// scripted abuse from a single IP.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: "Too many requests — please slow down and try again shortly." },
});

// /routes is the most expensive endpoint — an ORS call plus per-route
// scoring against every nearby sensor — so it gets its own tighter limit
// independent of the lighter-weight endpoints like /refuges or /health.
const routesLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: "Too many route requests — please wait a moment and try again." },
});

app.use(generalLimiter);

app.use("/sensors", sensorsRouter);
app.use("/routes", routesLimiter, routesRouter);
app.use("/refuges", refugesRouter);
app.use("/noise", noiseRouter);
app.use("/pedestrian", pedestrianRouter);
app.use("/live", liveRouter);
app.use("/geocode", geocodeRouter);
app.get("/", (_req, res) => res.json({ status: "ok", message: "API is running" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ detail: "Internal server error", path: req.path });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  startRefreshJob();
});