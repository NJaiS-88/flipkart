import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Hotspot, Violation, RepeatOffender, StationLoad } from "./models.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parking_db";

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB for Server"))
  .catch(err => console.error("Database connection error:", err));

// 1. GET /api/hotspots - Get all hotspots, sorted by rank or impact score
app.get("/api/hotspots", async (req, res) => {
  try {
    const { limit, police_station } = req.query;
    
    let query = {};
    if (police_station) {
      // Case insensitive match
      query.police_station = { $regex: new RegExp(police_station, "i") };
    }

    let queryBuilder = Hotspot.find(query).sort({ rank: 1 });
    if (limit) {
      queryBuilder = queryBuilder.limit(parseInt(limit));
    }

    const hotspots = await queryBuilder.exec();
    res.json(hotspots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/hotspots/:cluster_id/violations - Get violations inside a hotspot
app.get("/api/hotspots/:cluster_id/violations", async (req, res) => {
  try {
    const { cluster_id } = req.params;
    const { vehicle_type, start_date, end_date } = req.query;

    let query = { cluster_id: parseInt(cluster_id) };

    if (vehicle_type) {
      query.vehicle_type = { $regex: new RegExp(vehicle_type, "i") };
    }

    if (start_date || end_date) {
      query.created_datetime = {};
      if (start_date) query.created_datetime.$gte = new Date(start_date);
      if (end_date) query.created_datetime.$lte = new Date(end_date);
    }

    const violations = await Violation.find(query)
      .sort({ created_datetime: -1 })
      .limit(1000)
      .exec();

    res.json(violations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET /api/repeat-offenders - Get repeat offenders list with filter & pagination
app.get("/api/repeat-offenders", async (req, res) => {
  try {
    const { search, limit = 50, page = 1 } = req.query;
    let query = {};
    if (search) {
      query.vehicle_number = { $regex: new RegExp(search, "i") };
    }
    const offenders = await RepeatOffender.find(query)
      .sort({ total_violations: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .exec();
    
    const total = await RepeatOffender.countDocuments(query);
    res.json({ offenders, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET /api/station-load - Get station workloads
app.get("/api/station-load", async (req, res) => {
  try {
    const loads = await StationLoad.find({}).sort({ total_violations: -1 }).exec();
    res.json(loads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/severity-calibration - Get severity calibration report text
app.get("/api/severity-calibration", async (req, res) => {
  try {
    const reportPath = path.resolve("../severity_calibration.txt");
    if (fs.existsSync(reportPath)) {
      const content = fs.readFileSync(reportPath, "utf-8");
      res.json({ report: content });
    } else {
      res.status(404).json({ error: "Severity calibration report not found." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/meta - Get metadata for filtering
app.get("/api/meta", async (req, res) => {
  try {
    const policeStations = await Hotspot.distinct("police_station");
    const vehicleTypes = await Violation.distinct("vehicle_type");
    
    const totalHotspots = await Hotspot.countDocuments();
    const totalViolations = await Violation.countDocuments();
    
    const summaryStats = await Hotspot.aggregate([
      {
        $group: {
          _id: null,
          totalImpact: { $sum: "$hotspot_impact_score" },
          avgRecurrence: { $avg: "$recurrence_rate" }
        }
      }
    ]);

    // Aggregate statistics from enforcement report
    const enforcementStats = await Hotspot.aggregate([
      {
        $group: {
          _id: null,
          totalBefore: { $sum: "$violation_count_before" },
          totalAfter: { $sum: "$violation_count_after" },
          totalImpactBefore: { $sum: "$impact_before" },
          totalImpactAfter: { $sum: "$impact_after" },
          improvedCount: {
            $sum: { $cond: [{ $eq: ["$outcome_flag", "improved"] }, 1, 0] }
          },
          worsenedCount: {
            $sum: { $cond: [{ $eq: ["$outcome_flag", "worsened"] }, 1, 0] }
          },
          stableCount: {
            $sum: { $cond: [{ $eq: ["$outcome_flag", "no significant change"] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      policeStations: policeStations.filter(Boolean).sort(),
      vehicleTypes: vehicleTypes.filter(Boolean).sort(),
      stats: {
        totalHotspots,
        totalViolations,
        totalImpact: summaryStats[0] ? Math.round(summaryStats[0].totalImpact) : 0,
        avgRecurrence: summaryStats[0] ? Math.round(summaryStats[0].avgRecurrence * 100) / 100 : 0,
        enforcement: enforcementStats[0] || {
          totalBefore: 0,
          totalAfter: 0,
          totalImpactBefore: 0,
          totalImpactAfter: 0,
          improvedCount: 0,
          worsenedCount: 0,
          stableCount: 0
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

