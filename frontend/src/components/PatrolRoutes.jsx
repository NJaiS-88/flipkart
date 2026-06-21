// frontend/src/components/PatrolRoutes.jsx
import React, { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Pre-computed morning routes (static fallback / demo)
const MORNING_STATIC = {
  generated_at: "2026-06-21T07:00:00",
  shift: "morning",
  n_officers: 3,
  top_n_hotspots: 15,
  zone_filter: null,
  dwell_minutes_per_stop: 20,
  avg_speed_kmph: 25,
  routes: [
    {
      officer_id: 1, shift: "morning", shift_start: "07:00", shift_end: "12:00",
      n_stops: 5, total_km: 5.8, total_patrol_minutes: 130, estimated_finish: "09:10",
      stops: [
        { stop_order:1, cluster_id:"7374", label:"MG Road Junction", police_station:"", lat:12.975, lon:77.607, score:98.5, eta:"07:00", depart:"07:20", dwell_minutes:20, travel_km_from_prev:0, travel_min_from_prev:0 },
        { stop_order:2, cluster_id:"7375", label:"Brigade Road", police_station:"", lat:12.972, lon:77.609, score:87.2, eta:"07:21", depart:"07:41", dwell_minutes:20, travel_km_from_prev:0.35, travel_min_from_prev:1 },
        { stop_order:3, cluster_id:"7708", label:"Residency Road", police_station:"", lat:12.969, lon:77.614, score:76.1, eta:"07:43", depart:"08:03", dwell_minutes:20, travel_km_from_prev:0.6, travel_min_from_prev:2 },
        { stop_order:4, cluster_id:"7356", label:"Richmond Circle", police_station:"", lat:12.963, lon:77.607, score:65.4, eta:"08:05", depart:"08:25", dwell_minutes:20, travel_km_from_prev:0.8, travel_min_from_prev:2 },
        { stop_order:5, cluster_id:"6234", label:"Lal Bagh Road", police_station:"", lat:12.951, lon:77.585, score:54.3, eta:"08:57", depart:"09:17", dwell_minutes:20, travel_km_from_prev:2.5, travel_min_from_prev:6 },
      ]
    },
    {
      officer_id: 2, shift: "morning", shift_start: "07:00", shift_end: "12:00",
      n_stops: 3, total_km: 2.1, total_patrol_minutes: 82, estimated_finish: "08:22",
      stops: [
        { stop_order:1, cluster_id:"3188", label:"Cubbon Park Road", police_station:"", lat:12.979, lon:77.592, score:91.0, eta:"07:00", depart:"07:20", dwell_minutes:20, travel_km_from_prev:0, travel_min_from_prev:0 },
        { stop_order:2, cluster_id:"2727", label:"Raj Bhavan Road", police_station:"", lat:12.985, lon:77.578, score:73.5, eta:"07:52", depart:"08:12", dwell_minutes:20, travel_km_from_prev:1.4, travel_min_from_prev:3 },
        { stop_order:3, cluster_id:"2695", label:"Queens Road", police_station:"", lat:12.982, lon:77.576, score:60.2, eta:"08:13", depart:"08:33", dwell_minutes:20, travel_km_from_prev:0.3, travel_min_from_prev:1 },
      ]
    },
    {
      officer_id: 3, shift: "morning", shift_start: "07:00", shift_end: "12:00",
      n_stops: 2, total_km: 1.2, total_patrol_minutes: 61, estimated_finish: "08:01",
      stops: [
        { stop_order:1, cluster_id:"12139", label:"Infantry Road", police_station:"", lat:12.983, lon:77.607, score:88.7, eta:"07:00", depart:"07:20", dwell_minutes:20, travel_km_from_prev:0, travel_min_from_prev:0 },
        { stop_order:2, cluster_id:"12145", label:"St. Marks Road", police_station:"", lat:12.976, lon:77.612, score:71.3, eta:"07:49", depart:"08:09", dwell_minutes:20, travel_km_from_prev:1.2, travel_min_from_prev:3 },
      ]
    }
  ]
};

const OFFICER_COLORS = ["#22d3ee", "#a78bfa", "#34d399", "#f97316", "#f43f5e"];

const SHIFTS = [
  { value: "morning",   label: "🌅 Morning Shift",   hours: "07:00 – 12:00", start: 7,  end: 12 },
  { value: "afternoon", label: "☀️ Afternoon Shift", hours: "12:00 – 17:00", start: 12, end: 17 },
  { value: "evening",   label: "🌆 Evening Shift",   hours: "17:00 – 21:00", start: 17, end: 21 },
  { value: "night",     label: "🌙 Night Shift",     hours: "21:00 – 07:00", start: 21, end: 7  },
];

const TOP_N_OPTIONS = [5, 10, 15, 20, 30, 50];
const OFFICER_OPTIONS = [1, 2, 3, 4, 5, 6];

export default function PatrolRoutes() {
  const [activeView, setActiveView] = useState("morning"); // "morning" | "generate"
  const [policeStations, setPoliceStations] = useState([]);

  // Generate form state
  const [zone, setZone] = useState("");
  const [officers, setOfficers] = useState(3);
  const [topN, setTopN] = useState(15);
  const [shift, setShift] = useState("morning");

  // Result state
  const [genData, setGenData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load police stations from API
  useEffect(() => {
    fetch(`${API_URL}/api/meta`)
      .then(r => r.json())
      .then(d => setPoliceStations(d.policeStations || []))
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    setError("");
    setLoading(true);
    setGenData(null);
    try {
      const res = await fetch(`${API_URL}/api/patrol-routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone, officers: parseInt(officers), topN: parseInt(topN), shift }),
      });
      const data = await res.json();
      if (res.ok) {
        setGenData(data);
        setActiveView("results");
      } else {
        setError(data.error || "Failed to generate routes.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const displayData = activeView === "results" && genData ? genData : MORNING_STATIC;
  const selectedShift = SHIFTS.find(s => s.value === (activeView === "results" ? genData?.shift : "morning")) || SHIFTS[0];

  return (
    <div style={{ color: "var(--text-primary)" }}>

      {/* ── Header ─────────────────────────────── */}
      <div className="glass" style={{ padding: "20px 24px", borderRadius: "16px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>🚔 Patrol Route Optimizer</h2>
          <p style={{ color: "var(--text-secondary)", margin: "4px 0 0", fontSize: "0.9rem" }}>
            TSP-optimised patrol assignments · KMeans officer clustering · Nearest-Neighbour routing
          </p>
        </div>
        {/* Tab switcher */}
        <div style={{ display: "flex", gap: "8px" }}>
          {[
            { key: "morning",  label: "📋 Morning Demo" },
            { key: "generate", label: "⚡ Generate Routes" },
            ...(genData ? [{ key: "results", label: "✅ Last Result" }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              style={{
                padding: "8px 16px", borderRadius: "8px", border: "none",
                cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", transition: "all 0.2s",
                background: activeView === tab.key ? "var(--accent-cyan)" : "rgba(255,255,255,0.08)",
                color: activeView === tab.key ? "#000" : "var(--text-primary)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Generate Form ──────────────────────── */}
      {activeView === "generate" && (
        <div className="glass" style={{ borderRadius: "16px", padding: "24px", marginBottom: "20px" }}>
          <h3 style={{ margin: "0 0 20px", fontSize: "1.1rem" }}>Configure Route Generation</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>

            {/* Zone / Police Station */}
            <div>
              <label className="filter-label">Zone / Police Station</label>
              <select value={zone} onChange={e => setZone(e.target.value)} className="filter-input">
                <option value="">All Zones (Citywide)</option>
                {policeStations.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                Filter hotspots by jurisdiction
              </span>
            </div>

            {/* Shift */}
            <div>
              <label className="filter-label">Shift Period</label>
              <select value={shift} onChange={e => setShift(e.target.value)} className="filter-input">
                {SHIFTS.map(s => (
                  <option key={s.value} value={s.value}>{s.label} ({s.hours})</option>
                ))}
              </select>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                Hotspots filtered by dominant hour
              </span>
            </div>

            {/* Officers */}
            <div>
              <label className="filter-label">Number of Officers</label>
              <select value={officers} onChange={e => setOfficers(e.target.value)} className="filter-input">
                {OFFICER_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} Officer{n > 1 ? "s" : ""}</option>
                ))}
              </select>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                KMeans clusters routes between officers
              </span>
            </div>

            {/* Top N Hotspots */}
            <div>
              <label className="filter-label">Top N Hotspots to Cover</label>
              <select value={topN} onChange={e => setTopN(e.target.value)} className="filter-input">
                {TOP_N_OPTIONS.map(n => (
                  <option key={n} value={n}>Top {n} Hotspots</option>
                ))}
              </select>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                Sorted by hotspot impact score
              </span>
            </div>
          </div>

          {/* Generate button */}
          <div style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <button
              onClick={handleGenerate}
              disabled={loading}
              style={{
                padding: "12px 32px", borderRadius: "10px", border: "none",
                cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.95rem",
                background: loading ? "rgba(102,252,241,0.4)" : "var(--accent-cyan)",
                color: "#000", transition: "all 0.2s",
                boxShadow: loading ? "none" : "0 4px 16px rgba(102,252,241,0.3)"
              }}
            >
              {loading ? "⏳ Running two.py optimizer…" : "🚀 Generate Patrol Routes"}
            </button>
            {loading && (
              <span style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                TSP + KMeans running on {topN} hotspots across {officers} officer{officers > 1 ? "s" : ""}…
              </span>
            )}
          </div>

          {error && (
            <div style={{ marginTop: "16px", padding: "12px 16px", borderRadius: "8px",
              background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
              color: "#fca5a5", fontSize: "0.9rem" }}>
              ❌ {error}
            </div>
          )}
        </div>
      )}

      {/* ── Routes Display (Morning Demo or Generated Results) ── */}
      {(activeView === "morning" || activeView === "results") && (
        <>
          {/* Summary Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
            {[
              { label: "Officers",      value: displayData.n_officers,            icon: "👮" },
              { label: "Hotspots",      value: displayData.top_n_hotspots,        icon: "📍" },
              { label: "Avg Speed",     value: `${displayData.avg_speed_kmph} km/h`, icon: "🚗" },
              { label: "Dwell/Stop",    value: `${displayData.dwell_minutes_per_stop} min`, icon: "⏱️" },
              { label: "Zone",          value: displayData.zone_filter || "All",  icon: "🗺️" },
              { label: "Shift",         value: displayData.shift?.toUpperCase() || "—", icon: "🕐" },
            ].map(s => (
              <div key={s.label} className="glass" style={{ padding: "14px 16px", borderRadius: "12px" }}>
                <div style={{ fontSize: "1.4rem" }}>{s.icon}</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "4px" }}>{s.value}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Officer Route Cards */}
          {displayData.routes.map((officer, oi) => (
            <div
              key={officer.officer_id}
              className="glass"
              style={{ borderRadius: "14px", marginBottom: "20px", overflow: "hidden",
                border: `1px solid ${OFFICER_COLORS[oi % OFFICER_COLORS.length]}33` }}
            >
              {/* Officer Header */}
              <div style={{
                background: `linear-gradient(90deg, ${OFFICER_COLORS[oi % OFFICER_COLORS.length]}22, transparent)`,
                padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)",
                display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "50%",
                    background: OFFICER_COLORS[oi % OFFICER_COLORS.length],
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#000", fontWeight: 800, fontSize: "0.9rem", flexShrink: 0
                  }}>
                    O{officer.officer_id}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1rem" }}>Officer {officer.officer_id}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {officer.shift_start} → Est. finish {officer.estimated_finish}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "20px" }}>
                  {[
                    { label: "Stops",       val: officer.n_stops },
                    { label: "Distance",    val: `${officer.total_km} km` },
                    { label: "Patrol Time", val: `${officer.total_patrol_minutes} min` },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700, color: OFFICER_COLORS[oi % OFFICER_COLORS.length], fontSize: "1rem" }}>{m.val}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stops Timeline */}
              <div style={{ padding: "16px 20px" }}>
                {officer.stops.map((stop, si) => (
                  <div key={stop.stop_order} style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: si < officer.stops.length - 1 ? "4px" : 0 }}>
                    {/* Timeline dot + connector */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "28px" }}>
                      <div style={{
                        width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                        background: si === 0 ? OFFICER_COLORS[oi % OFFICER_COLORS.length] : "rgba(255,255,255,0.1)",
                        border: `2px solid ${OFFICER_COLORS[oi % OFFICER_COLORS.length]}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.68rem", fontWeight: 700,
                        color: si === 0 ? "#000" : OFFICER_COLORS[oi % OFFICER_COLORS.length],
                      }}>
                        {stop.stop_order}
                      </div>
                      {si < officer.stops.length - 1 && (
                        <div style={{ width: "2px", background: `${OFFICER_COLORS[oi % OFFICER_COLORS.length]}44`, flex: 1, minHeight: "28px", marginTop: "2px" }} />
                      )}
                    </div>

                    {/* Stop Info */}
                    <div style={{ flex: 1, paddingBottom: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px" }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                            {stop.label || `Cluster #${stop.cluster_id}`}
                          </span>
                          {stop.police_station && (
                            <span style={{ marginLeft: "8px", fontSize: "0.72rem", color: "var(--text-secondary)",
                              background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: "4px" }}>
                              📍 {stop.police_station}
                            </span>
                          )}
                          {stop.travel_km_from_prev > 0 && (
                            <span style={{ marginLeft: "8px", fontSize: "0.72rem", color: "var(--text-secondary)",
                              background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: "4px" }}>
                              +{stop.travel_km_from_prev} km · {stop.travel_min_from_prev} min drive
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          <span style={{ color: OFFICER_COLORS[oi % OFFICER_COLORS.length], fontWeight: 600 }}>ETA {stop.eta}</span>
                          <span style={{ margin: "0 6px" }}>→</span>
                          <span>Depart {stop.depart}</span>
                          <span style={{ marginLeft: "8px",
                            background: `${OFFICER_COLORS[oi % OFFICER_COLORS.length]}22`,
                            color: OFFICER_COLORS[oi % OFFICER_COLORS.length],
                            padding: "1px 6px", borderRadius: "4px", fontSize: "0.72rem" }}>
                            {stop.dwell_minutes} min dwell
                          </span>
                          {stop.score > 0 && (
                            <span style={{ marginLeft: "6px", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                              Score: {stop.score}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
