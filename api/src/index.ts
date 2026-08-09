import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import sensorsRouter from "./routers/sensors";
import refugesRouter from "./routers/refuges";
import noiseRouter from "./routers/noise";
import pedestrianRouter from "./routers/pedestrian";
import routesRouter from "./routers/routes";
import liveRouter from "./routers/live";
import geocodeRouter from "./routers/geocode";

const app = express();

app.use(cors({ origin: "http://localhost:5173", methods: ["GET"] }));
app.use(express.json());

app.use("/sensors", sensorsRouter);
app.use("/routes", routesRouter);
app.use("/refuges", refugesRouter);
app.use("/noise", noiseRouter);
app.use("/pedestrian", pedestrianRouter);
app.use("/live", liveRouter);
app.use("/geocode", geocodeRouter);
app.get("/", (_req, res) => res.json({ status: "ok", message: "API is running" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Global error handler — must be last, and must have 4 args for Express to recognize it as one
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ detail: "Internal server error", path: req.path });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));