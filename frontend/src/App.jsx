import React, { useState, useEffect } from "react";
import { 
  AlertCircle, Shield, TrendingUp, BarChart2, Filter, RefreshCw, AlertTriangle, 
  Map as MapIcon, ShieldCheck, Activity, Users, FileText, Search, ChevronLeft, ChevronRight, TrendingDown 
} from "lucide-react";
import MapComponent from "./components/MapComponent";
import DetailPanel from "./components/DetailPanel";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState("map");

  // Core Data
  const [hotspots, setHotspots] = useState([]);
  const [meta, setMeta] = useState({ 
    policeStations: [], 
    vehicleTypes: [], 
    stats: {
      enforcement: {
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
  const [selectedHotspot, setSelectedHotspot] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Filter States (Map Tab)
  const [selectedPoliceStation, setSelectedPoliceStation] = useState("");
  const [limit, setLimit] = useState(50);

  // Station Workload Tab
  const [stationLoads, setStationLoads] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);

  // Offender Registry Tab
  const [offenders, setOffenders] = useState([]);
  const [offenderSearch, setOffenderSearch] = useState("");
  const [offenderPage, setOffenderPage] = useState(1);
  const [totalOffenders, setTotalOffenders] = useState(0);
  const [loadingOffenders, setLoadingOffenders] = useState(false);

  // Calibration Tab
  const [calibrationReport, setCalibrationReport] = useState("");
  const [loadingCalibration, setLoadingCalibration] = useState(false);

  // Fetch Meta & Stats
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await fetch(`${API_URL}/api/meta`);
        const data = await res.json();
        setMeta(data);
      } catch (err) {
        console.error("Error fetching meta:", err);
      }
    };
    fetchMeta();
  }, []);

  // Fetch Hotspots (Map / Enforcement list)
  useEffect(() => {
    const fetchHotspots = async () => {
      setLoading(true);
      try {
        let url = `${API_URL}/api/hotspots?limit=${limit}`;
        if (selectedPoliceStation) {
          url += `&police_station=${encodeURIComponent(selectedPoliceStation)}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        setHotspots(data);
        
        // Auto-select first hotspot in list if not empty and none is currently selected
        if (data.length > 0 && !selectedHotspot) {
          setSelectedHotspot(data[0]);
        }
      } catch (err) {
        console.error("Error fetching hotspots:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHotspots();
  }, [selectedPoliceStation, limit]);

  // Fetch Station Loads
  useEffect(() => {
    if (activeTab !== "stations") return;
    const fetchStationLoads = async () => {
      setLoadingStations(true);
      try {
        const res = await fetch(`${API_URL}/api/station-load`);
        const data = await res.json();
        setStationLoads(data);
      } catch (err) {
        console.error("Error fetching stations:", err);
      } finally {
        setLoadingStations(false);
      }
    };
    fetchStationLoads();
  }, [activeTab]);

  // Fetch Repeat Offenders
  useEffect(() => {
    if (activeTab !== "offenders") return;
    const fetchOffenders = async () => {
      setLoadingOffenders(true);
      try {
        const res = await fetch(`${API_URL}/api/repeat-offenders?search=${encodeURIComponent(offenderSearch)}&page=${offenderPage}&limit=15`);
        const data = await res.json();
        setOffenders(data.offenders);
        setTotalOffenders(data.total);
      } catch (err) {
        console.error("Error fetching offenders:", err);
      } finally {
        setLoadingOffenders(false);
      }
    };
    fetchOffenders();
  }, [activeTab, offenderSearch, offenderPage]);

  // Fetch Calibration text
  useEffect(() => {
    if (activeTab !== "calibration") return;
    const fetchCalibration = async () => {
      setLoadingCalibration(true);
      try {
        const res = await fetch(`${API_URL}/api/severity-calibration`);
        const data = await res.json();
        setCalibrationReport(data.report || "No report found.");
      } catch (err) {
        console.error("Error fetching calibration:", err);
        setCalibrationReport("Failed to load calibration report.");
      } finally {
        setLoadingCalibration(false);
      }
    };
    fetchCalibration();
  }, [activeTab]);

  // Helper for quick map tab jumping
  const jumpToHotspotMap = (spot) => {
    setSelectedHotspot(spot);
    setActiveTab("map");
  };

  const enforcement = meta.stats.enforcement || {};
  const violationDiff = enforcement.totalAfter - enforcement.totalBefore;
  const violationDiffPct = enforcement.totalBefore ? (violationDiff / enforcement.totalBefore) * 100 : 0;

  const impactDiff = enforcement.totalImpactAfter - enforcement.totalImpactBefore;
  const impactDiffPct = enforcement.totalImpactBefore ? (impactDiff / enforcement.totalImpactBefore) * 100 : 0;

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="header">
        <div>
          <h1>Parking Violations Hotspot Inspector</h1>
          <p>Data-Driven Targeted Enforcement & Feedback Loop System</p>
        </div>
        <div style={{ color: "var(--accent-cyan)", fontSize: "0.85rem", fontWeight: "600", display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent-cyan)", display: "inline-block" }}></span>
          System Database Online
        </div>
      </header>

      {/* Primary Navigation Tabs */}
      <nav className="tabs-nav">
        <button 
          onClick={() => setActiveTab("map")} 
          className={`tab-btn ${activeTab === "map" ? "active" : ""}`}
        >
          <MapIcon size={18} />
          Hotspot Map & Details
        </button>
        <button 
          onClick={() => setActiveTab("enforcement")} 
          className={`tab-btn ${activeTab === "enforcement" ? "active" : ""}`}
        >
          <ShieldCheck size={18} />
          Enforcement Effectiveness
        </button>
        <button 
          onClick={() => setActiveTab("stations")} 
          className={`tab-btn ${activeTab === "stations" ? "active" : ""}`}
        >
          <Activity size={18} />
          Station Workloads
        </button>
        <button 
          onClick={() => setActiveTab("offenders")} 
          className={`tab-btn ${activeTab === "offenders" ? "active" : ""}`}
        >
          <Users size={18} />
          Offender Registry
        </button>
        <button 
          onClick={() => setActiveTab("calibration")} 
          className={`tab-btn ${activeTab === "calibration" ? "active" : ""}`}
        >
          <FileText size={18} />
          Severity Calibration
        </button>
      </nav>

      {/* Tab: Map View */}
      {activeTab === "map" && (
        <>
          {/* Metrics Grid */}
          <section className="metrics-grid">
            <div className="glass metric-card">
              <div className="icon-wrapper">
                <AlertTriangle size={24} />
              </div>
              <div>
                <div className="metric-val">{meta.stats.totalHotspots?.toLocaleString() || "0"}</div>
                <div className="metric-label">Detected Hotspots</div>
              </div>
            </div>

            <div className="glass metric-card">
              <div className="icon-wrapper">
                <BarChart2 size={24} />
              </div>
              <div>
                <div className="metric-val">{meta.stats.totalViolations?.toLocaleString() || "0"}</div>
                <div className="metric-label">Analyzed Violations</div>
              </div>
            </div>

            <div className="glass metric-card">
              <div className="icon-wrapper">
                <TrendingUp size={24} />
              </div>
              <div>
                <div className="metric-val">{meta.stats.totalImpact?.toLocaleString() || "0"}</div>
                <div className="metric-label">Total Traffic Impact</div>
              </div>
            </div>

            <div className="glass metric-card">
              <div className="icon-wrapper">
                <Shield size={24} />
              </div>
              <div>
                <div className="metric-val">{meta.stats.avgRecurrence ? `${Math.round(meta.stats.avgRecurrence * 100)}%` : "0%"}</div>
                <div className="metric-label">Average Recurrence Rate</div>
              </div>
            </div>
          </section>

          {/* Filters Bar */}
          <section className="glass filters-bar">
            <div className="filter-group">
              <label className="filter-label">Police Station Jurisdiction</label>
              <select
                value={selectedPoliceStation}
                onChange={(e) => setSelectedPoliceStation(e.target.value)}
                className="filter-input"
              >
                <option value="">All Stations</option>
                {meta.policeStations.map((station) => (
                  <option key={station} value={station}>{station}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Display Limit</label>
              <select
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="filter-input"
              >
                <option value={20}>Top 20 Hotspots</option>
                <option value={50}>Top 50 Hotspots</option>
                <option value={100}>Top 100 Hotspots</option>
                <option value={1000}>All Hotspots</option>
              </select>
            </div>
          </section>

          {/* Main Map & List Grid */}
          <section className="main-grid">
            <div className="glass map-wrapper" style={{ padding: "8px" }}>
              <MapComponent 
                hotspots={hotspots} 
                selectedHotspot={selectedHotspot} 
                onSelectHotspot={setSelectedHotspot}
              />
            </div>

            <div className="sidebar">
              <h3 style={{ fontSize: "1.1rem", marginBottom: "8px", fontWeight: "600" }}>
                Hotspot Rankings ({hotspots.length})
              </h3>
              
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px" }}>
                  <RefreshCw className="animate-spin" size={24} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              ) : (
                hotspots.map((spot) => (
                  <div
                    key={spot.cluster_id}
                    onClick={() => setSelectedHotspot(spot)}
                    className={`glass hotspot-item ${selectedHotspot?.cluster_id === spot.cluster_id ? "active" : ""}`}
                  >
                    <div className="header-row">
                      <span className="badge badge-cyan">Rank #{spot.rank}</span>
                      {spot.anomaly_flag && <span className="badge badge-red" style={{ fontSize: "0.7rem" }}>⚠️ SPIKE</span>}
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        Impact: <strong>{Math.round(spot.hotspot_impact_score)}</strong>
                      </span>
                    </div>
                    <div style={{ fontWeight: "600", fontSize: "0.95rem", color: "var(--text-primary)" }}>
                      {spot.junction !== "No Junction" ? spot.junction : `Near ${spot.police_station}`}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      <span>Count: {spot.violation_count}</span>
                      <span>Recurrence: {Math.round(spot.recurrence_rate * 100)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <DetailPanel 
              selectedHotspot={selectedHotspot} 
              vehicleTypes={meta.vehicleTypes}
            />
          </section>
        </>
      )}

      {/* Tab: Enforcement Outcomes */}
      {activeTab === "enforcement" && (
        <div className="glass" style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "8px" }}>Enforcement Performance & Outcome Feedback Loop</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
            Compare pre-enforcement baseline snapshots with post-enforcement outcomes to quantify impact reduction.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <div className="sub-card">
              <span className="sub-card-title">Violation Count Change</span>
              <div className="sub-card-value" style={{ color: violationDiff < 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {violationDiff > 0 ? "+" : ""}{violationDiff.toLocaleString()}
              </div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Total: {enforcement.totalBefore?.toLocaleString()} ➔ {enforcement.totalAfter?.toLocaleString()} ({violationDiffPct > 0 ? "+" : ""}{violationDiffPct.toFixed(1)}%)
              </span>
            </div>

            <div className="sub-card">
              <span className="sub-card-title">Impact Score Change</span>
              <div className="sub-card-value" style={{ color: impactDiff < 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {impactDiff > 0 ? "+" : ""}{Math.round(impactDiff).toLocaleString()}
              </div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Total: {Math.round(enforcement.totalImpactBefore || 0).toLocaleString()} ➔ {Math.round(enforcement.totalImpactAfter || 0).toLocaleString()} ({impactDiffPct > 0 ? "+" : ""}{impactDiffPct.toFixed(1)}%)
              </span>
            </div>

            <div className="sub-card">
              <span className="sub-card-title">Hotspots Improved</span>
              <div className="sub-card-value" style={{ color: "var(--accent-green)" }}>
                {enforcement.improvedCount}
              </div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Measurable decrease in count</span>
            </div>

            <div className="sub-card">
              <span className="sub-card-title">Hotspots Worsened</span>
              <div className="sub-card-value" style={{ color: "var(--accent-red)" }}>
                {enforcement.worsenedCount}
              </div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Measurable increase in count</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1.1rem" }}>Detailed Hotspot Enforcement Log</h3>
            <div style={{ display: "flex", gap: "12px" }}>
              <select
                value={selectedPoliceStation}
                onChange={(e) => setSelectedPoliceStation(e.target.value)}
                className="filter-input"
                style={{ padding: "6px 12px", fontSize: "0.85rem" }}
              >
                <option value="">All Stations</option>
                {meta.policeStations.map((station) => (
                  <option key={station} value={station}>{station}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <RefreshCw className="animate-spin" size={24} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Junction/Location</th>
                    <th>Police Station</th>
                    <th>Before Count</th>
                    <th>After Count</th>
                    <th>Count Change</th>
                    <th>Outcome Flag</th>
                    <th>Before Impact</th>
                    <th>After Impact</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hotspots.slice(0, 100).map((spot) => (
                    <tr key={spot.cluster_id}>
                      <td style={{ fontWeight: "600" }}>#{spot.rank}</td>
                      <td style={{ fontWeight: "600" }}>{spot.junction !== "No Junction" ? spot.junction : "Open Road stretch"}</td>
                      <td>{spot.police_station}</td>
                      <td>{spot.violation_count_before}</td>
                      <td>{spot.violation_count_after}</td>
                      <td style={{ color: spot.percent_change < 0 ? "var(--accent-green)" : "var(--accent-red)", fontWeight: "600" }}>
                        {spot.percent_change > 0 ? "+" : ""}{spot.percent_change.toFixed(1)}%
                      </td>
                      <td>
                        <span className={`badge ${spot.outcome_flag === "improved" ? "badge-success" : spot.outcome_flag === "worsened" ? "badge-danger" : "badge-warning"}`}>
                          {spot.outcome_flag}
                        </span>
                      </td>
                      <td>{spot.impact_before.toFixed(1)}</td>
                      <td>{spot.impact_after.toFixed(1)}</td>
                      <td>
                        <button 
                          onClick={() => jumpToHotspotMap(spot)} 
                          className="pagination-btn"
                          style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                        >
                          View Map
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Station Workloads */}
      {activeTab === "stations" && (
        <div className="glass" style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "8px" }}>Enforcement Jurisdiction Workload Metrics</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
            Overview of enforcement resource demands across various station jurisdictions based on violation density and hotspot count.
          </p>

          {loadingStations ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <RefreshCw className="animate-spin" size={24} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : (
            <>
              {stationLoads.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                  <div className="sub-card" style={{ borderLeft: "4px solid var(--accent-red)" }}>
                    <span className="sub-card-title">Highest Traffic Load Station</span>
                    <div className="sub-card-value" style={{ color: "var(--accent-red)" }}>{stationLoads[0].police_station}</div>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {stationLoads[0].total_violations.toLocaleString()} violations across {stationLoads[0].distinct_hotspots} hotspots
                    </span>
                  </div>

                  <div className="sub-card" style={{ borderLeft: "4px solid var(--accent-cyan)" }}>
                    <span className="sub-card-title">Total Stations Monitored</span>
                    <div className="sub-card-value">{stationLoads.length}</div>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Active traffic enforcement zones in Bengaluru
                    </span>
                  </div>
                </div>
              )}

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Police Station</th>
                      <th>Total Violations</th>
                      <th>Hotspots Quantity</th>
                      <th>Avg Violation Impact</th>
                      <th>Violations Per Hotspot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stationLoads.map((station) => (
                      <tr key={station.police_station}>
                        <td style={{ fontWeight: "600" }}>{station.police_station}</td>
                        <td style={{ fontWeight: "600" }}>{station.total_violations.toLocaleString()}</td>
                        <td>{station.distinct_hotspots}</td>
                        <td>{station.avg_violation_impact.toFixed(2)}</td>
                        <td>{station.violations_per_hotspot.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Offender Registry */}
      {activeTab === "offenders" && (
        <div className="glass" style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "8px" }}>Repeat Offenders Intelligence Registry</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
            Track specific high-frequency vehicles contributing to systemic parking disruption in grid clusters.
          </p>

          <div className="search-wrapper">
            <Search size={18} style={{ color: "var(--text-secondary)" }} />
            <input
              type="text"
              placeholder="Search by Vehicle Licence Number (e.g. FKN00GL4424)..."
              value={offenderSearch}
              onChange={(e) => {
                setOffenderSearch(e.target.value);
                setOffenderPage(1);
              }}
              className="search-input"
            />
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Found {totalOffenders.toLocaleString()} offenders
            </span>
          </div>

          {loadingOffenders ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <RefreshCw className="animate-spin" size={24} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Vehicle Number</th>
                      <th>Vehicle Type</th>
                      <th>Total Violations</th>
                      <th>Distinct Hotspots Visited</th>
                      <th>First Seen Date</th>
                      <th>Last Seen Date</th>
                      <th>Cluster Hotspots List</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offenders.map((offender) => (
                      <tr key={offender.vehicle_number}>
                        <td style={{ fontWeight: "700", color: "var(--accent-cyan)" }}>{offender.vehicle_number}</td>
                        <td style={{ textTransform: "capitalize" }}>{offender.vehicle_type}</td>
                        <td style={{ fontWeight: "600" }}>{offender.total_violations}</td>
                        <td>{offender.distinct_hotspots}</td>
                        <td>{offender.first_seen ? new Date(offender.first_seen).toLocaleString() : "N/A"}</td>
                        <td>{offender.last_seen ? new Date(offender.last_seen).toLocaleString() : "N/A"}</td>
                        <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {offender.hotspot_list.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="pagination">
                <button 
                  disabled={offenderPage === 1}
                  onClick={() => setOffenderPage(prev => Math.max(1, prev - 1))}
                  className="pagination-btn"
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <span style={{ alignSelf: "center", fontSize: "0.85rem", color: "var(--text-secondary)", padding: "0 8px" }}>
                  Page {offenderPage} of {Math.ceil(totalOffenders / 15) || 1}
                </span>
                <button 
                  disabled={offenderPage >= Math.ceil(totalOffenders / 15)}
                  onClick={() => setOffenderPage(prev => prev + 1)}
                  className="pagination-btn"
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Severity Calibration */}
      {activeTab === "calibration" && (
        <div className="glass" style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "8px" }}>Statistical Severity Weight Calibration Report</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
            T-test validation comparing processed violations versus unprocessed violations to check model parameter sanity.
          </p>

          {loadingCalibration ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <RefreshCw className="animate-spin" size={24} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : (
            <div className="pre-formatted">
              {calibrationReport}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

