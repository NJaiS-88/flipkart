// backend/patrolOptimizer.js
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { Hotspot } from "./models.js";

// Helper: read CSV of static patrol stops (if needed)
export async function loadPatrolStops(csvFile) {
  const stops = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFile)
      .pipe(csv())
      .on("data", (row) => stops.push(row))
      .on("end", () => resolve(stops))
      .on("error", reject);
  });
}

// Haversine distance (km)
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Nearest‑neighbor simple TSP for a list of points
export function nearestNeighborRoute(startPoint, points) {
  const route = [];
  const remaining = points.slice();
  let current = startPoint;
  while (remaining.length) {
    let nearestIdx = 0;
    let minDist = Infinity;
    remaining.forEach((pt, i) => {
      const d = haversine(current.lat, current.lon, pt.lat, pt.lon);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    });
    const next = remaining.splice(nearestIdx, 1)[0];
    route.push({ ...next, travel_km: minDist });
    current = next;
  }
  return route;
}

/**
 * Generate patrol routes for a shift.
 * @param {Date} shiftStart - start of shift
 * @param {Date} shiftEnd - end of shift
 * @param {number} officers - number of officers
 * @param {string} zone - zone filter (matches police_station field)
 * @param {number} topN - how many hotspots to include
 * @returns {Promise<Array>} array of officer routes
 */
export async function generatePatrolRoutes({ shiftStart, shiftEnd, officers, zone, topN }) {
  // Fetch top N active hotspots, optionally filter by zone
  let query = {};
  if (zone) query.police_station = { $regex: new RegExp(zone, "i") };
  const hotspots = await Hotspot.find(query)
    .sort({ rank_v3: 1 })
    .limit(topN)
    .lean();

  // Convert to simple lat/lon points
  const points = hotspots.map((h) => ({
    cluster_id: h.cluster_id,
    address: h.junction || h.road_name || "Hotspot",
    lat: h.avg_lat,
    lon: h.avg_lon,
    impact: h.hotspot_impact_score_v3,
  }));

  // Simple split of points among officers (round robin)
  const officerBuckets = Array.from({ length: officers }, () => []);
  points.forEach((pt, idx) => {
    officerBuckets[idx % officers].push(pt);
  });

  // For each officer, build route starting from first point (or a base location if needed)
  const routes = officerBuckets.map((bucket, idx) => {
    if (bucket.length === 0) return { officer: idx + 1, route: [] };
    const start = bucket[0]; // use first as start
    const ordered = nearestNeighborRoute(start, bucket.slice(1));
    const fullRoute = [start, ...ordered];
    // Compute cumulative travel time assuming 40 km/h average speed
    let cumulative = 0;
    const timedRoute = fullRoute.map((pt, i) => {
      const travel_min = i === 0 ? 0 : Math.round((pt.travel_km / 40) * 60);
      cumulative += travel_min;
      return {
        stop_order: i + 1,
        address: pt.address,
        travel_km: pt.travel_km ? Number(pt.travel_km.toFixed(2)) : 0,
        travel_min,
        cumulative_min: cumulative,
        impact: pt.impact,
      };
    });
    return { officer: idx + 1, route: timedRoute };
  });
  return routes;
}
