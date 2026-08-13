// Mirrors api/src/routers/routes.ts's BOUNDS exactly — keep these two in sync
// if the coverage area ever changes.
export const CBD_BOUNDS = {
  minLat: -37.87,
  maxLat: -37.76,
  minLon: 144.87,
  maxLon: 145.02
};

export function isInCbdBounds(lat: number, lon: number): boolean {
  return (
    lat >= CBD_BOUNDS.minLat && lat <= CBD_BOUNDS.maxLat &&
    lon >= CBD_BOUNDS.minLon && lon <= CBD_BOUNDS.maxLon
  );
}