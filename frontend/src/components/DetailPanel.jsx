import React, { useState, useEffect } from "react";
import { Shield, MapPin, AlertTriangle, RefreshCw, Layers, TrendingUp, TrendingDown, Clock, ShieldAlert } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function DetailPanel({ selectedHotspot, vehicleTypes }) {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVehicleType, setSelectedVehicleType] = useState("");

  useEffect(() => {
    if (!selectedHotspot) return;

    const fetchViolations = async () => {
      setLoading(true);
      try {
        let url = `${API_URL}/api/hotspots/${selectedHotspot.cluster_id}/violations`;
        if (selectedVehicleType) {
          url += `?vehicle_type=${encodeURIComponent(selectedVehicleType)}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        setViolations(data);
      } catch (err) {
        console.error("Error fetching violations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchViolations();
  }, [selectedHotspot, selectedVehicleType]);

  // Reset inner filters when hotspot changes
  useEffect(() => {
    setSelectedVehicleType("");
  }, [selectedHotspot]);

  if (!selectedHotspot) {
    return (
      <div className="glass" style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
        <Layers size={48} style={{ marginBottom: "16px", color: "var(--accent-cyan)", opacity: 0.7 }} />
        <h3>No Hotspot Selected</h3>
        <p style={{ marginTop: "8px" }}>Click on a map marker or choose a hotspot from the sidebar to inspect detailed analytics.</p>
      </div>
    );
  }

  // Determine trend icon and color
  const getTrendIcon = (trend) => {
    if (trend === "increasing") {
      return <TrendingUp size={16} color="var(--accent-red)" />;
    } else if (trend === "decreasing") {
      return <TrendingDown size={16} color="var(--accent-green)" />;
    }
    return <Clock size={16} color="var(--text-secondary)" />;
  };

  // Determine outcome badge class
  const getOutcomeBadgeClass = (flag) => {
    if (flag === "improved") return "badge-success";
    if (flag === "worsened") return "badge-danger";
    return "badge-warning";
  };

  return (
    <div className="glass" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Title & Anomaly Alert Banner */}
      <div>
        {selectedHotspot.anomaly_flag && (
          <div className="alert-banner alert-banner-danger">
            <ShieldAlert size={20} style={{ color: "var(--accent-red)" }} />
            <div>
              <strong>Spike Alarm Active!</strong> {selectedHotspot.anomaly_flag} (Z-Score: {selectedHotspot.z_score?.toFixed(2)})
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span className="badge badge-red" style={{ fontSize: "0.8rem" }}>Rank #{selectedHotspot.rank_v3}</span>
            <h2 style={{ marginTop: "8px", fontSize: "1.4rem", color: "var(--text-primary)" }}>
              {selectedHotspot.junction !== "No Junction" ? selectedHotspot.junction : selectedHotspot.police_station}
            </h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Impact Score (OSM v3)</div>
            <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "var(--accent-cyan)" }}>
              {Math.round(selectedHotspot.hotspot_impact_score_v3)}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
              Base: {Math.round(selectedHotspot.hotspot_impact_score)}
            </div>
          </div>
        </div>
      </div>

      {/* Basic Metrics Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px" }}>
        <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Violations Count</div>
          <div style={{ fontSize: "1.1rem", fontWeight: "600", marginTop: "4px" }}>
            {selectedHotspot.violation_count.toLocaleString()}
          </div>

          {/* Last Active Date */}
          {selectedHotspot.last_active_date && (
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              <Clock size={14} style={{ verticalAlign: "middle", marginRight: "4px" }} />
              Last Active: {new Date(selectedHotspot.last_active_date).toLocaleDateString()}
            </div>
          )}

          {/* Trend Direction Badge */}
          {selectedHotspot.trend_direction && (
            <div style={{ marginTop: "4px" }}>
              <span className={`badge ${selectedHotspot.trend_direction === "increasing" ? "badge-danger" : selectedHotspot.trend_direction === "decreasing" ? "badge-success" : "badge-warning"}`}
                style={{ textTransform: "capitalize", fontSize: "0.75rem" }}>
                {selectedHotspot.trend_direction} Trend
              </span>
            </div>
          )}
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Recurrence Rate</div>
          <div style={{ fontSize: "1.1rem", fontWeight: "600", marginTop: "4px" }}>
            {Math.round(selectedHotspot.recurrence_rate * 100)}%
          </div>
        </div>
        <div style={{ 
          background: selectedHotspot.congestion_level === "heavy" ? "rgba(239, 68, 68, 0.05)" : selectedHotspot.congestion_level === "moderate" ? "rgba(249, 115, 22, 0.05)" : "rgba(255,255,255,0.02)", 
          border: selectedHotspot.congestion_level ? `1px solid ${selectedHotspot.congestion_level === "heavy" ? "rgba(239, 68, 68, 0.2)" : "rgba(249, 115, 22, 0.2)"}` : "none",
          padding: "12px", 
          borderRadius: "8px" 
        }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>MapmyIndia Traffic</div>
          <div style={{ fontSize: "1.1rem", fontWeight: "600", marginTop: "4px", color: selectedHotspot.congestion_level === "heavy" ? "#fca5a5" : selectedHotspot.congestion_level === "moderate" ? "#fed7aa" : "var(--accent-green)" }}>
            🚦 {selectedHotspot.congestion_level ? selectedHotspot.congestion_level.toUpperCase() : "NORMAL"}
          </div>
          {selectedHotspot.congestion_multiplier && (
            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "2px" }}>
              Congestion Weight: {selectedHotspot.congestion_multiplier}x
            </div>
          )}
        </div>
        {selectedHotspot.predicted_next_week !== undefined && selectedHotspot.predicted_next_week !== null && (
          <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Forecast (Next Week)</div>
            <div style={{ fontSize: "1.1rem", fontWeight: "600", marginTop: "4px", color: "var(--accent-cyan)" }}>
              {selectedHotspot.predicted_next_week}
            </div>
          </div>
        )}
      </div>

      {/* Enforcement & Trend Analytics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
        {/* Enforcement Feedback Loop */}
        <div className="sub-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="sub-card-title">Enforcement Outcome</span>
            <span className={`badge ${getOutcomeBadgeClass(selectedHotspot.outcome_flag)}`} style={{ textTransform: "capitalize" }}>
              {selectedHotspot.outcome_flag}
            </span>
          </div>
          <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Before Enforce.</div>
              <div style={{ fontSize: "1rem", fontWeight: "600" }}>{selectedHotspot.violation_count_before || 0} violations</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Impact: {selectedHotspot.impact_before?.toFixed(1) || 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>After Enforce.</div>
              <div style={{ fontSize: "1rem", fontWeight: "600" }}>{selectedHotspot.violation_count_after || 0} violations</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                Impact: {selectedHotspot.impact_after?.toFixed(1) || 0}
              </div>
            </div>
          </div>
          <div style={{ marginTop: "8px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "8px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Violation count change: <strong style={{ color: selectedHotspot.percent_change < 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
              {selectedHotspot.percent_change > 0 ? "+" : ""}{selectedHotspot.percent_change?.toFixed(1)}%
            </strong>
            <br />
            Impact score change: <strong style={{ color: selectedHotspot.impact_percent_change < 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
              {selectedHotspot.impact_percent_change > 0 ? "+" : ""}{selectedHotspot.impact_percent_change?.toFixed(1)}%
            </strong>
          </div>
        </div>

        {/* Trend Forecast */}
        {selectedHotspot.trend && (
          <div className="sub-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="sub-card-title">Forecast Analytics</span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {getTrendIcon(selectedHotspot.trend)}
                <span style={{ fontSize: "0.85rem", textTransform: "capitalize", fontWeight: "600" }}>
                  {selectedHotspot.trend} Trend
                </span>
              </div>
            </div>
            <div style={{ marginTop: "10px", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: "var(--text-secondary)" }}>Last Week Count:</span>
                <span>{selectedHotspot.last_week_actual}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: "var(--text-secondary)" }}>Average Weekly:</span>
                <span>{selectedHotspot.avg_weekly?.toFixed(1)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: "var(--text-secondary)" }}>Trend Velocity:</span>
                <span style={{ color: selectedHotspot.trend_slope > 0 ? "var(--accent-red)" : "var(--accent-green)" }}>
                  {selectedHotspot.trend_slope > 0 ? "+" : ""}{selectedHotspot.trend_slope?.toFixed(2)}/wk
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: "4px", paddingTop: "4px", fontWeight: "600" }}>
                <span style={{ color: "var(--text-secondary)" }}>Projected Violations:</span>
                <span style={{ color: "var(--accent-cyan)" }}>{selectedHotspot.predicted_next_week}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Details List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Shield size={16} color="var(--accent-cyan)" />
          <span><strong>Police Station:</strong> {selectedHotspot.police_station}</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <MapPin size={16} color="var(--accent-cyan)" />
          <span><strong>Dominant Violation:</strong> {selectedHotspot.dominant_violation}</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <AlertTriangle size={16} color="var(--accent-cyan)" />
          <span><strong>Junction:</strong> {selectedHotspot.junction}</span>
        </div>
        {selectedHotspot.road_name && (
          <>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <Layers size={16} color="var(--accent-cyan)" />
              <span><strong>OSM Road Name:</strong> {selectedHotspot.road_name} ({selectedHotspot.road_class})</span>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <Layers size={16} color="var(--accent-cyan)" />
              <span><strong>Road Class Weight:</strong> {selectedHotspot.road_class_weight}x</span>
            </div>
            {selectedHotspot.road_dist_m !== null && selectedHotspot.road_dist_m !== undefined && (
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <Layers size={16} color="var(--accent-cyan)" />
                <span>
                  <strong>Road Distance Match:</strong> {selectedHotspot.road_dist_m.toFixed(1)}m{" "}
                  <span style={{ 
                    fontSize: "0.75rem", 
                    padding: "2px 6px", 
                    borderRadius: "4px",
                    fontWeight: "600",
                    marginLeft: "6px",
                    background: selectedHotspot.road_dist_m < 50 ? "rgba(16, 185, 129, 0.15)" : selectedHotspot.road_dist_m < 150 ? "rgba(245, 158, 11, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    color: selectedHotspot.road_dist_m < 50 ? "var(--accent-green)" : selectedHotspot.road_dist_m < 150 ? "var(--accent-warning)" : "var(--accent-red)"
                  }}>
                    {selectedHotspot.road_dist_m < 50 ? "High Confidence" : selectedHotspot.road_dist_m < 150 ? "Medium Confidence" : "Low Confidence"}
                  </span>
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <hr style={{ borderColor: "var(--border-glass)" }} />

      {/* Drill-down Violations list */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "1rem", color: "var(--text-primary)" }}>Recent Violations</h3>
          
          {/* Inner Filter */}
          <select
            value={selectedVehicleType}
            onChange={(e) => setSelectedVehicleType(e.target.value)}
            className="filter-input"
            style={{ padding: "4px 8px", fontSize: "0.75rem", minWidth: "120px" }}
          >
            <option value="">All Vehicles</option>
            {vehicleTypes.map(vt => (
              <option key={vt} value={vt}>{vt}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>
            <RefreshCw className="animate-spin" size={24} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div className="violations-list">
            {violations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                No matching violations found.
              </div>
            ) : (
              violations.map((v) => (
                <div key={v.id} className="violation-row">
                  <div>
                    <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                      {v.vehicle_number || "Unknown Vehicle"} ({v.vehicle_type})
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {v.location}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "var(--accent-cyan)", fontWeight: "600" }}>
                      Score: {v.violation_impact.toFixed(1)}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {new Date(v.created_datetime).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

