import fs from "fs";
import path from "path";
import csv from "csv-parser";
import mongoose from "mongoose";
import { Hotspot, Violation, RepeatOffender, StationLoad } from "./models.js";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parking_db";

console.log("Connecting to MongoDB:", MONGO_URI);
await mongoose.connect(MONGO_URI);
console.log("Connected successfully.");

// Helper function to parse a CSV file and return array of objects
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      return resolve([]);
    }
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (err) => reject(err));
  });
}

async function seedHotspots() {
  console.log("Seeding Hotspots...");
  await Hotspot.deleteMany({});
  
  const hotspotsRaw = await parseCSV(path.resolve("../hotspots (1).csv"));
  const enforcementRaw = await parseCSV(path.resolve("../enforcement_outcome_report.csv"));
  const anomaliesRaw = await parseCSV(path.resolve("../hotspot_anomalies.csv"));
  const forecastRaw = await parseCSV(path.resolve("../hotspot_forecast.csv"));

  // Index maps by cluster_id
  const enforcementMap = new Map();
  enforcementRaw.forEach(row => {
    enforcementMap.set(parseInt(row.cluster_id), {
      violation_count_before: parseInt(row.violation_count_before) || 0,
      violation_count_after: parseInt(row.violation_count_after) || 0,
      percent_change: parseFloat(row.percent_change) || 0,
      outcome_flag: row.outcome_flag || "no significant change",
      impact_before: parseFloat(row.impact_before) || 0,
      impact_after: parseFloat(row.impact_after) || 0,
      impact_percent_change: parseFloat(row.impact_percent_change) || 0,
    });
  });

  const anomaliesMap = new Map();
  anomaliesRaw.forEach(row => {
    anomaliesMap.set(parseInt(row.cluster_id), {
      latest_week_count: parseInt(row.latest_week_count) || 0,
      historical_avg: parseFloat(row.historical_avg) || 0,
      historical_std: parseFloat(row.historical_std) || 0,
      z_score: parseFloat(row.z_score) || 0,
      anomaly_flag: row.flag || "",
    });
  });

  const forecastMap = new Map();
  forecastRaw.forEach(row => {
    forecastMap.set(parseInt(row.cluster_id), {
      weeks_of_history: parseInt(row.weeks_of_history) || 0,
      last_week_actual: parseInt(row.last_week_actual) || 0,
      avg_weekly: parseFloat(row.avg_weekly) || 0,
      trend: row.trend || "",
      trend_slope: parseFloat(row.trend_slope) || 0,
      predicted_next_week: parseInt(row.predicted_next_week) || 0,
    });
  });

  const hotspotsList = hotspotsRaw.map(row => {
    const clusterId = parseInt(row.cluster_id);
    const enforcement = enforcementMap.get(clusterId) || {};
    const anomaly = anomaliesMap.get(clusterId) || {};
    const forecast = forecastMap.get(clusterId) || {};

    return {
      cluster_id: clusterId,
      rank: parseInt(row.rank),
      avg_lat: parseFloat(row.avg_lat),
      avg_lon: parseFloat(row.avg_lon),
      violation_count: parseInt(row.violation_count),
      hotspot_impact_score: parseFloat(row.hotspot_impact_score),
      recurrence_rate: parseFloat(row.recurrence_rate),
      police_station: row.top_police_station || "",
      junction: row.top_junction || "",
      dominant_violation: row.dominant_violation || "",
      
      // Merged enforcement outcome metrics
      ...enforcement,

      // Merged anomaly metrics
      ...anomaly,

      // Merged forecast metrics
      ...forecast
    };
  });

  if (hotspotsList.length > 0) {
    await Hotspot.insertMany(hotspotsList);
    console.log(`Inserted ${hotspotsList.length} enriched hotspots.`);
  }
}

async function seedViolations() {
  console.log("Seeding Violations (Streaming)...");
  await Violation.deleteMany({});

  const violationsPath = path.resolve("../violations_scored (1).csv");
  let batch = [];
  let totalInserted = 0;
  const BATCH_SIZE = 10000;

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(violationsPath).pipe(csv());
    
    stream.on("data", async (row) => {
      const lat = parseFloat(row.latitude);
      const lon = parseFloat(row.longitude);
      const clusterId = parseInt(row.cluster_id);
      
      if (isNaN(lat) || isNaN(lon) || clusterId === -1) {
        return;
      }

      batch.push({
        id: row.id,
        latitude: lat,
        longitude: lon,
        location: row.location || "",
        vehicle_number: row.vehicle_number || "",
        vehicle_type: row.vehicle_type || "",
        description: row.description || "",
        violation_type: row.violation_type || "",
        offence_code: row.offence_code || "",
        created_datetime: new Date(row.created_datetime),
        police_station: row.police_station || "",
        junction_name: row.junction_name || "",
        validation_status: row.validation_status || "",
        cluster_id: clusterId,
        violation_impact: parseFloat(row.violation_impact) || 0
      });

      if (batch.length >= BATCH_SIZE) {
        stream.pause();
        const currentBatch = batch;
        batch = [];
        try {
          await Violation.insertMany(currentBatch, { ordered: false });
          totalInserted += currentBatch.length;
          console.log(`  Inserted ${totalInserted} violations...`);
          stream.resume();
        } catch (err) {
          console.error("Batch insert error:", err.message);
          stream.resume();
        }
      }
    });

    stream.on("end", async () => {
      try {
        if (batch.length > 0) {
          await Violation.insertMany(batch, { ordered: false });
          totalInserted += batch.length;
        }
        console.log(`Finished seeding violations. Total clustered violations: ${totalInserted}`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    stream.on("error", reject);
  });
}

async function seedRepeatOffenders() {
  console.log("Seeding Repeat Offenders...");
  await RepeatOffender.deleteMany({});
  const raw = await parseCSV(path.resolve("../repeat_offenders.csv"));
  
  const list = raw.map(row => {
    let hotspotList = [];
    try {
      hotspotList = JSON.parse(row.hotspot_list || "[]");
    } catch (e) {
      // If parsing fails, extract numbers using regex
      hotspotList = (row.hotspot_list || "").match(/\d+/g)?.map(Number) || [];
    }

    return {
      vehicle_number: row.vehicle_number,
      total_violations: parseInt(row.total_violations) || 0,
      distinct_hotspots: parseInt(row.distinct_hotspots) || 0,
      vehicle_type: row.vehicle_type || "",
      first_seen: row.first_seen ? new Date(row.first_seen) : null,
      last_seen: row.last_seen ? new Date(row.last_seen) : null,
      hotspot_list: hotspotList
    };
  });

  if (list.length > 0) {
    await RepeatOffender.insertMany(list);
    console.log(`Inserted ${list.length} repeat offenders.`);
  }
}

async function seedStationLoad() {
  console.log("Seeding Station Load...");
  await StationLoad.deleteMany({});
  const raw = await parseCSV(path.resolve("../station_load.csv"));
  
  const list = raw.map(row => ({
    police_station: row.police_station,
    total_violations: parseInt(row.total_violations) || 0,
    distinct_hotspots: parseInt(row.distinct_hotspots) || 0,
    avg_violation_impact: parseFloat(row.avg_violation_impact) || 0,
    violations_per_hotspot: parseFloat(row.violations_per_hotspot) || 0
  }));

  if (list.length > 0) {
    await StationLoad.insertMany(list);
    console.log(`Inserted ${list.length} station load logs.`);
  }
}

try {
  await seedHotspots();
  await seedViolations();
  await seedRepeatOffenders();
  await seedStationLoad();
  console.log("All seeding completed successfully!");
} catch (err) {
  console.error("Seeding failed:", err);
} finally {
  mongoose.connection.close();
}

