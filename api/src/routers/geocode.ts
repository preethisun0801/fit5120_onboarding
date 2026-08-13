import { Router } from "express";
import { asyncHandler } from "./utils";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const text = ((req.query.text as string) || "").trim();
    if (text.length < 3) {
      res.json({ results: [] });
      return;
    }

    const key = process.env.ORS_API_KEY;
    if (!key) throw new Error("ORS_API_KEY is not set");

    const url = new URL(
      "https://api.openrouteservice.org/geocode/autocomplete"
    );
    url.searchParams.set("api_key", key);
    url.searchParams.set("text", text);
    // Loosely bounds results to Greater Melbourne so "Preston" doesn't
    // suggest a Preston in another country.
    url.searchParams.set("boundary.rect.min_lon", "144.87");
    url.searchParams.set("boundary.rect.min_lat", "-37.87");
    url.searchParams.set("boundary.rect.max_lon", "145.02");
    url.searchParams.set("boundary.rect.max_lat", "-37.76");
    url.searchParams.set("size", "6");

    const orsRes = await fetch(url.toString());
    if (!orsRes.ok) {
      res.status(502).json({ detail: "Geocoding provider failed" });
      return;
    }
    const data = await orsRes.json();

    const results = (data.features || []).map((f: any) => ({
      label: f.properties.label as string,
      lat: f.geometry.coordinates[1] as number,
      lon: f.geometry.coordinates[0] as number
    }));

    res.json({ results });
  })
);

export default router;
