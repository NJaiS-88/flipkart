// frontend/src/components/ReportDashboard.jsx
import React, { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function ReportDashboard() {
  const [stations, setStations] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState("");
  const [genError, setGenError] = useState("");

  // Load stations for dropdown (reuse meta endpoint)
  useEffect(() => {
    fetch(`${API_URL}/api/meta`)
      .then(r => r.json())
      .then(d => setStations(d.policeStations || []))
      .catch(() => {});
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    setGenMessage("");
    setGenError("");
    try {
      const query = new URLSearchParams();
      if (selectedStation) query.set("station", selectedStation);
      if (selectedYear)    query.set("year", selectedYear);
      if (selectedMonth)   query.set("month", selectedMonth);
      const res = await fetch(`${API_URL}/api/reports?${query.toString()}`);
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedStation) { setGenError("Please select a Police Station first."); return; }
    if (!selectedYear)    { setGenError("Please select a Year first."); return; }
    if (!selectedMonth)   { setGenError("Please select a Month first."); return; }

    setGenerating(true);
    setGenMessage("");
    setGenError("");

    try {
      const res = await fetch(`${API_URL}/api/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station: selectedStation,
          year: parseInt(selectedYear),
          month: parseInt(selectedMonth)
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGenMessage(data.warning
          ? `⚠️ ${data.warning}`
          : `✅ Report generated! Click "Load Reports" to see it.`
        );
        // Auto-reload the list
        await fetchReports();
      } else {
        setGenError(data.error || "Failed to generate report.");
      }
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div className="glass" style={{ padding: "24px", borderRadius: "16px", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 6px" }}>
          📄 Monthly Enforcement Reports
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
          Select a station, year and month. Generate a new report from <code>one.py</code> or download existing ones.
        </p>
      </div>

      {/* Filters + Actions */}
      <div className="glass" style={{ padding: "20px", borderRadius: "16px", marginBottom: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          {/* Station */}
          <div>
            <label className="filter-label">Police Station</label>
            <select
              value={selectedStation}
              onChange={e => setSelectedStation(e.target.value)}
              className="filter-input"
            >
              <option value="">All Stations</option>
              {stations.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="filter-label">Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="filter-input"
            >
              <option value="">Any Year</option>
              {years.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Month */}
          <div>
            <label className="filter-label">Month</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="filter-input"
            >
              <option value="">Any Month</option>
              {MONTH_NAMES.slice(1).map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={fetchReports}
            disabled={loading}
            style={{
              padding: "10px 20px", borderRadius: "8px", border: "none",
              cursor: loading ? "not-allowed" : "pointer", fontWeight: 700,
              fontSize: "0.9rem",
              background: "rgba(255,255,255,0.1)",
              color: "var(--text-primary)",
              transition: "all 0.2s"
            }}
          >
            {loading ? "Loading…" : "🔍 Load Reports"}
          </button>

          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "10px 24px", borderRadius: "8px", border: "none",
              cursor: generating ? "not-allowed" : "pointer", fontWeight: 700,
              fontSize: "0.9rem",
              background: generating ? "rgba(102,252,241,0.4)" : "var(--accent-cyan)",
              color: "#000",
              transition: "all 0.2s"
            }}
          >
            {generating ? "⏳ Generating…" : "⚡ Generate Report"}
          </button>
        </div>

        {/* Status messages */}
        {genError && (
          <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "8px",
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
            color: "#fca5a5", fontSize: "0.9rem" }}>
            ❌ {genError}
          </div>
        )}
        {genMessage && (
          <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "8px",
            background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)",
            color: "#6ee7b7", fontSize: "0.9rem" }}>
            {genMessage}
          </div>
        )}
      </div>

      {/* Report List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px", color: "var(--text-secondary)" }}>
          Loading reports…
        </div>
      ) : reports.length > 0 ? (
        <div className="glass" style={{ borderRadius: "16px", overflow: "hidden" }}>
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Station</th>
                <th>Year</th>
                <th>Month</th>
                <th>Generated At</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r._id}>
                  <td style={{ fontWeight: 600 }}>{r.station}</td>
                  <td>{r.year}</td>
                  <td>{MONTH_NAMES[r.month] || r.month}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                  </td>
                  <td>
                    <a
                      href={`${API_URL}/api/reports/${r._id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        padding: "4px 12px", borderRadius: "6px",
                        background: "var(--accent-cyan)", color: "#000",
                        fontWeight: 700, fontSize: "0.82rem",
                        textDecoration: "none"
                      }}
                    >
                      ⬇ PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass" style={{ padding: "48px", textAlign: "center", borderRadius: "16px" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>📭</div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            No reports found. Select a station, year &amp; month, then click <strong>Generate Report</strong>.
          </div>
        </div>
      )}
    </div>
  );
}
