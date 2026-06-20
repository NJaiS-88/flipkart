import mongoose from "mongoose";

const HotspotSchema = new mongoose.Schema({
  cluster_id: { type: Number, required: true, unique: true, index: true },
  rank: { type: Number, required: true },
  avg_lat: { type: Number, required: true },
  avg_lon: { type: Number, required: true },
  violation_count: { type: Number, required: true },
  hotspot_impact_score: { type: Number, required: true },
  recurrence_rate: { type: Number, required: true },
  police_station: { type: String, default: "" },
  junction: { type: String, default: "" },
  dominant_violation: { type: String, default: "" },
  
  // Enforcement Outcomes (before vs after)
  violation_count_before: { type: Number, default: 0 },
  violation_count_after: { type: Number, default: 0 },
  percent_change: { type: Number, default: 0 },
  outcome_flag: { type: String, default: "no significant change" },
  impact_before: { type: Number, default: 0 },
  impact_after: { type: Number, default: 0 },
  impact_percent_change: { type: Number, default: 0 },

  // Anomalies
  latest_week_count: { type: Number, default: null },
  historical_avg: { type: Number, default: null },
  historical_std: { type: Number, default: null },
  z_score: { type: Number, default: null },
  anomaly_flag: { type: String, default: "" },

  // Forecast
  weeks_of_history: { type: Number, default: null },
  last_week_actual: { type: Number, default: null },
  avg_weekly: { type: Number, default: null },
  trend: { type: String, default: "" },
  trend_slope: { type: Number, default: null },
  predicted_next_week: { type: Number, default: null }
}, { timestamps: true });

const ViolationSchema = new mongoose.Schema({
  id: { type: String, required: true, index: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  location: { type: String, default: "" },
  vehicle_number: { type: String, default: "" },
  vehicle_type: { type: String, default: "" },
  description: { type: String, default: "" },
  violation_type: { type: String, default: "" },
  offence_code: { type: String, default: "" },
  created_datetime: { type: Date, required: true, index: true },
  police_station: { type: String, default: "", index: true },
  junction_name: { type: String, default: "" },
  validation_status: { type: String, default: "" },
  cluster_id: { type: Number, required: true, index: true },
  violation_impact: { type: Number, default: 0 }
}, { timestamps: true });

const RepeatOffenderSchema = new mongoose.Schema({
  vehicle_number: { type: String, required: true, unique: true, index: true },
  total_violations: { type: Number, required: true },
  distinct_hotspots: { type: Number, required: true },
  vehicle_type: { type: String, default: "" },
  first_seen: { type: Date },
  last_seen: { type: Date },
  hotspot_list: [{ type: Number }]
}, { timestamps: true });

const StationLoadSchema = new mongoose.Schema({
  police_station: { type: String, required: true, unique: true, index: true },
  total_violations: { type: Number, required: true },
  distinct_hotspots: { type: Number, required: true },
  avg_violation_impact: { type: Number, required: true },
  violations_per_hotspot: { type: Number, required: true }
}, { timestamps: true });

export const Hotspot = mongoose.model("Hotspot", HotspotSchema);
export const Violation = mongoose.model("Violation", ViolationSchema);
export const RepeatOffender = mongoose.model("RepeatOffender", RepeatOffenderSchema);
export const StationLoad = mongoose.model("StationLoad", StationLoadSchema);

