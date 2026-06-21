import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import { Hotspot, Violation, RepeatOffender, StationLoad, Report } from "./models.js";
import cron from "node-cron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parking_db";
const PYTHON_BIN = process.env.PYTHON_PATH || "python";

// CORS — allow both localhost dev and production Vercel URL
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (e.g. mobile/curl) or from allowed list
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
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

    let queryBuilder = Hotspot.find(query).sort({ rank_v3: 1 });
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

// 6b. GET /api/severity-model-report - Get model diagnostics report
app.get("/api/severity-model-report", async (req, res) => {
  try {
    const reportPath = path.resolve("../severity_model_report.txt");
    if (fs.existsSync(reportPath)) {
      const content = fs.readFileSync(reportPath, "utf-8");
      res.json({ report: content });
    } else {
      res.status(404).json({ error: "Severity model report not found." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6c. GET /api/severity-weights - Get learned severity weights JSON
app.get("/api/severity-weights", async (req, res) => {
  try {
    const weightsPath = path.resolve("../learned_severity_weights.json");
    if (fs.existsSync(weightsPath)) {
      const content = fs.readFileSync(weightsPath, "utf-8");
      res.json(JSON.parse(content));
    } else {
      res.status(404).json({ error: "Learned severity weights not found." });
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
          totalImpact: { $sum: "$hotspot_impact_score_v3" },
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

// 7. POST /api/patrol-routes - Generate patrol routes via two.py (TSP optimizer)
app.post("/api/patrol-routes", async (req, res) => {
  try {
    const { zone, officers, topN, shift } = req.body;
    if (!officers || !topN || !shift) {
      return res.status(400).json({ error: "Missing required parameters: officers, topN, shift" });
    }

    const scriptPath = path.resolve(__dirname, "../two.py");
    const args = [
      scriptPath,
      zone || "",
      String(parseInt(officers)),
      String(parseInt(topN)),
      shift,
    ];

    execFile(PYTHON_BIN, args, { cwd: path.resolve(__dirname, "../"), env: { ...process.env } }, (error, stdout, stderr) => {
      if (error) {
        console.error("two.py error:", stderr);
        return res.status(500).json({ error: stderr || error.message });
      }

      // Parse ROUTE_JSON: line from stdout
      const lines = stdout.split("\n");
      const jsonLine = lines.find(l => l.startsWith("ROUTE_JSON:"));
      if (!jsonLine) {
        return res.status(500).json({ error: "No ROUTE_JSON output from two.py", stdout });
      }

      const jsonPath = jsonLine.replace("ROUTE_JSON:", "").trim();
      if (!fs.existsSync(jsonPath)) {
        return res.status(500).json({ error: `Route JSON file not found: ${jsonPath}` });
      }

      const routeData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      res.json(routeData);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. GET /api/reports - List available PDF reports
app.get("/api/reports", async (req, res) => {
  try {
    const { station, year, month } = req.query;
    let filter = {};
    if (station) filter.station = station;
    if (year) filter.year = parseInt(year);
    if (month) filter.month = parseInt(month);
    const reports = await Report.find(filter).sort({ createdAt: -1 }).select("-pdfData").exec();
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. GET /api/reports/:id/download - Download PDF binary
app.get("/api/reports/:id/download", async (req, res) => {
  try {
    const report = await Report.findById(req.params.id).exec();
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${report.station}_${report.year}_${report.month}.pdf"` });
    res.send(report.pdfData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. POST /api/reports/generate - Generate report for a station/year/month via one.py
app.post("/api/reports/generate", async (req, res) => {
  try {
    const { station, year, month } = req.body;
    if (!station || !year || !month)
      return res.status(400).json({ error: "Missing station, year, or month" });

    const scriptPath = path.resolve(__dirname, "../one.py");
    const args = [scriptPath, station, String(year), String(month)];

    execFile(PYTHON_BIN, args, { cwd: path.resolve(__dirname, "../"), env: { ...process.env } }, async (error, stdout, stderr) => {
      if (error) {
        console.error("Python error:", stderr);
        return res.status(500).json({ error: stderr || error.message });
      }

      // Parse PDF paths from stdout lines like "PDF_OUTPUT:/path/to/file.pdf"
      const lines = stdout.split("\n");
      const pdfLine = lines.find(l => l.startsWith("PDF_OUTPUT:"));

      if (!pdfLine) {
        // No PDF generated (maybe no data for that period) — still save a text record
        const existing = await Report.findOne({ station, year: parseInt(year), month: parseInt(month) });
        if (!existing) {
          const placeholder = Buffer.from(`No violation data found for ${station} in ${year}/${month}.`);
          const rec = new Report({ station, year: parseInt(year), month: parseInt(month), pdfData: placeholder, metadata: {} });
          await rec.save();
          return res.json({ success: true, id: rec._id, warning: "No violation data found for this period." });
        }
        return res.json({ success: true, id: existing._id, warning: "No violation data found for this period." });
      }

      const pdfPath = pdfLine.replace("PDF_OUTPUT:", "").trim();
      if (!fs.existsSync(pdfPath)) {
        return res.status(500).json({ error: `PDF file not found at: ${pdfPath}` });
      }

      const pdfData = fs.readFileSync(pdfPath);

      // Upsert report in MongoDB
      const existing = await Report.findOneAndUpdate(
        { station, year: parseInt(year), month: parseInt(month) },
        { pdfData, metadata: { generatedAt: new Date() } },
        { upsert: true, new: true }
      );

      res.json({ success: true, id: existing._id });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. GET /api/traffic-token - Return a fresh Mappls OAuth token for frontend map overlays
app.get("/api/traffic-token", async (req, res) => {
  try {
    const clientId = process.env.MAPMYINDIA_CLIENT_ID;
    const clientSecret = process.env.MAPMYINDIA_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: "MapmyIndia credentials not configured" });
    }
    const authRes = await fetch("https://outpost.mappls.com/api/security/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`
    });
    if (!authRes.ok) return res.status(502).json({ error: "Failed to get Mappls token" });
    const data = await authRes.json();
    res.json({ token: data.access_token, expires_in: data.expires_in });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CORRECT MAPPLS ENDPOINT: https://apis.mappls.com/advancedmaps/v1/{token}/distance_matrix/driving/{coords}
// CORRECT MAPPLS ENDPOINT: https://apis.mappls.com/advancedmaps/v1/{token}/distance_matrix/driving/{coords}
async function runTrafficSync() {
  try {
    const hotspots = await Hotspot.find({ avg_lat: { $exists: true }, avg_lon: { $exists: true } })
      .sort({ rank_v3: 1 }).limit(50);

    const clientId = process.env.MAPMYINDIA_CLIENT_ID;
    const clientSecret = process.env.MAPMYINDIA_CLIENT_SECRET;

    let useTomTomFallback = !clientId || !clientSecret;
    let token = null;

    if (!useTomTomFallback) {
      console.log("[Traffic Sync] Running MapmyIndia traffic sync for hotspots...");
      try {
        const authResponse = await fetch("https://outpost.mappls.com/api/security/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`
        });
        if (!authResponse.ok) {
          console.log("[Traffic Sync] MapmyIndia auth failed. Falling back to TomTom.");
          useTomTomFallback = true;
        } else {
          const authData = await authResponse.json();
          token = authData.access_token;
          console.log("[Traffic Sync] MapmyIndia Token obtained.");
        }
      } catch (err) {
        console.log("[Traffic Sync] MapmyIndia auth error, falling back to TomTom:", err.message);
        useTomTomFallback = true;
      }
    }

    // Load TomTom Key if needed
    let tomtomKey = "";
    if (useTomTomFallback) {
      console.log("[Traffic Sync] Running TomTom traffic sync fallback for hotspots...");
      tomtomKey = process.env.TOMTOM_KEY || process.env.VITE_TOMTOM_KEY;
      if (!tomtomKey) {
        try {
          const frontendEnvPath = path.join(__dirname, "../frontend/.env");
          if (fs.existsSync(frontendEnvPath)) {
            const content = fs.readFileSync(frontendEnvPath, "utf-8");
            const match = content.match(/VITE_TOMTOM_KEY\s*=\s*(.*)/);
            if (match && match[1]) {
              tomtomKey = match[1].trim();
            }
          }
        } catch (e) {
          console.log("[Traffic Sync] Failed to read frontend env for TomTom key:", e.message);
        }
      }

      if (!tomtomKey) {
        console.log("[Traffic Sync] Neither MapmyIndia nor TomTom credentials configured. Skipping sync.");
        return;
      }
    }

    let updated = 0;
    for (const hotspot of hotspots) {
      if (!hotspot.avg_lat || !hotspot.avg_lon) continue;

      const lat1 = parseFloat(hotspot.avg_lat);
      const lon1 = parseFloat(hotspot.avg_lon);
      const lat2 = lat1 + 0.005; // ~500m north
      const lon2 = lon1;

      try {
        let speed = null;
        if (!useTomTomFallback && token) {
          const coords = `${lon1},${lat1};${lon2},${lat2}`;
          const url = `https://apis.mappls.com/advancedmaps/v1/${token}/distance_matrix/driving/${coords}`;
          const apiRes = await fetch(url);
          if (apiRes.ok) {
            const data = await apiRes.json();
            const mDist = data.results?.distances?.[0]?.[1];
            const sDur  = data.results?.durations?.[0]?.[1];
            if (mDist > 0 && sDur > 0) {
              const km = mDist / 1000;
              const hours = sDur / 3600;
              speed = km / hours;
            }
          } else {
            console.log(`[Traffic Sync] MapmyIndia API error ${apiRes.status} for rank #${hotspot.rank_v3}. Trying TomTom fallback...`);
            // Set flag to true for this / remaining items if needed, or just try TomTom for this one
          }
        }

        // If MapmyIndia failed or was skipped, try TomTom
        if (speed === null && tomtomKey) {
          const url = `https://api.tomtom.com/routing/1/calculateRoute/${lat1},${lon1}:${lat2},${lon2}/json?key=${tomtomKey}`;
          const apiRes = await fetch(url);
          if (apiRes.ok) {
            const data = await apiRes.json();
            const route = data.routes?.[0];
            const mDist = route?.summary?.lengthInMeters;
            const sDur  = route?.summary?.travelTimeInSeconds;
            if (mDist > 0 && sDur > 0) {
              const km = mDist / 1000;
              const hours = sDur / 3600;
              speed = km / hours;
            }
          } else {
            console.log(`[Traffic Sync] TomTom API error ${apiRes.status} for rank #${hotspot.rank_v3}`);
          }
        }

        if (speed !== null) {
          let congestion_level = "low";
          let congestion_multiplier = 1.0;
          if (speed < 12.0) {
            congestion_level = "heavy";
            congestion_multiplier = 1.5;
          } else if (speed < 20.0) {
            congestion_level = "moderate";
            congestion_multiplier = 1.2;
          }

          hotspot.congestion_level = congestion_level;
          hotspot.congestion_multiplier = congestion_multiplier;
          hotspot.congestion_speed_kmh = Math.round(speed * 10) / 10;
          hotspot.congestion_updated_at = new Date();
          await hotspot.save();
          updated++;
          console.log(`[Traffic Sync - ${speed === null ? "Failed" : (token && !useTomTomFallback ? "MapmyIndia" : "TomTom")}] #${hotspot.rank_v3}: ${speed.toFixed(1)} km/h → ${congestion_level}`);
        }
      } catch (e) {
        console.log(`[Traffic Sync] fetch error for rank #${hotspot.rank_v3}: ${e.message}`);
      }
      // 300ms delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[Traffic Sync] Done. Updated ${updated}/${hotspots.length} hotspots.`);
  } catch (err) {
    console.error("[Traffic Sync] Error:", err.message);
  }
}

// Run sync every 10 minutes
cron.schedule("*/10 * * * *", runTrafficSync);

// Also run once 5 seconds after server starts (so you see it immediately)
setTimeout(runTrafficSync, 5000);

// Start server
const PORT_NUM = process.env.PORT || 5000;
app.listen(PORT_NUM, () => {
  console.log(`Server running on http://localhost:${PORT_NUM}`);
});
