import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// TomTom API key — set VITE_TOMTOM_KEY in frontend/.env
// Get a free key at: https://developer.tomtom.com (takes 2 min, 2500 tiles/day free)
const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_KEY || "";

// Helper component to center map on selected hotspot
function ChangeMapView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom, { animate: true, duration: 1 });
    }
  }, [center, zoom, map]);
  return null;
}

// TomTom Traffic Flow Layer - shows real road congestion as colored lines
// Green = free flow, Yellow = slow, Orange = queuing, Red = stationary
function TomTomTrafficFlow({ apiKey }) {
  if (!apiKey) return null;
  return (
    <TileLayer
      url={`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${apiKey}`}
      opacity={0.8}
      attribution='Traffic &copy; <a href="https://www.tomtom.com" target="_blank">TomTom</a>'
      maxZoom={22}
      zIndex={500}
    />
  );
}

// TomTom Traffic Incidents Layer - shows accidents/roadworks icons
function TomTomTrafficIncidents({ apiKey }) {
  if (!apiKey) return null;
  return (
    <TileLayer
      url={`https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=${apiKey}`}
      opacity={0.9}
      attribution='Incidents &copy; <a href="https://www.tomtom.com" target="_blank">TomTom</a>'
      maxZoom={22}
      zIndex={501}
    />
  );
}

export default function MapComponent({ hotspots, selectedHotspot, onSelectHotspot }) {
  const [colorMode, setColorMode] = useState("impact"); // "impact" | "traffic"
  const [showTrafficFlow, setShowTrafficFlow] = useState(false);
  const [showIncidents, setShowIncidents] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const hasTomTomKey = !!TOMTOM_KEY;

  const defaultCenter = [12.9716, 77.5946]; // Bengaluru
  const mapCenter = selectedHotspot
    ? [selectedHotspot.avg_lat, selectedHotspot.avg_lon]
    : defaultCenter;
  const mapZoom = selectedHotspot ? 15 : 12;

  // Compute last traffic sync time from hotspot data
  useEffect(() => {
    const synced = hotspots.filter(h => h.congestion_updated_at);
    if (synced.length > 0) {
      const latest = synced.reduce((a, b) =>
        new Date(a.congestion_updated_at) > new Date(b.congestion_updated_at) ? a : b
      );
      setLastSync(new Date(latest.congestion_updated_at));
    }
  }, [hotspots]);

  // Circle color based on mode
  const getMarkerColor = (spot) => {
    if (colorMode === "traffic") {
      if (spot.congestion_level === "heavy")    return "#ef4444";
      if (spot.congestion_level === "moderate") return "#f97316";
      if (spot.congestion_level === "low")      return "#22c55e";
      return "#94a3b8"; // gray = not synced yet
    }
    if (spot.anomaly_flag) return "#ef4444";
    const score = spot.hotspot_impact_score_v3;
    if (score > 10000) return "#ef4444";
    if (score > 2000)  return "#f97316";
    if (score > 500)   return "#eab308";
    return "#66fcf1";
  };

  const getMarkerRadius = (score) =>
    Math.max(6, Math.min(30, Math.sqrt(score) * 0.08));

  const syncedCount  = hotspots.filter(h => h.congestion_level).length;
  const heavyCount   = hotspots.filter(h => h.congestion_level === "heavy").length;
  const moderateCount = hotspots.filter(h => h.congestion_level === "moderate").length;
  const lowCount     = hotspots.filter(h => h.congestion_level === "low").length;

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>

      {/* ── Control Panel (top-right) ── */}
      <div style={{
        position: "absolute", top: "10px", right: "10px", zIndex: 1000,
        background: "rgba(10, 16, 30, 0.93)", backdropFilter: "blur(10px)",
        padding: "12px 14px", borderRadius: "12px",
        border: "1px solid rgba(100,252,241,0.2)",
        display: "flex", flexDirection: "column", gap: "10px", minWidth: "200px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)"
      }}>

        {/* Hotspot color mode */}
        <div>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: "700",
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>
            🔵 Hotspot Color
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <button onClick={() => setColorMode("impact")} style={{
              flex: 1,
              background: colorMode === "impact" ? "#66fcf1" : "transparent",
              color: colorMode === "impact" ? "#000" : "#fff",
              border: "1px solid #66fcf1",
              padding: "4px 6px", borderRadius: "5px", fontSize: "0.72rem",
              cursor: "pointer", fontWeight: "600", transition: "all 0.15s"
            }}>OSM Impact</button>
            <button onClick={() => setColorMode("traffic")} style={{
              flex: 1,
              background: colorMode === "traffic" ? "#f97316" : "transparent",
              color: colorMode === "traffic" ? "#000" : "#fff",
              border: "1px solid #f97316",
              padding: "4px 6px", borderRadius: "5px", fontSize: "0.72rem",
              cursor: "pointer", fontWeight: "600", transition: "all 0.15s"
            }}>🚦 Congestion</button>
          </div>
        </div>

        {/* Traffic legend (only in traffic mode) */}
        {colorMode === "traffic" && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "8px" }}>
            <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginBottom: "5px" }}>
              MapmyIndia synced: {syncedCount} hotspots
              {lastSync && <div>{lastSync.toLocaleTimeString()}</div>}
            </div>
            {[
              { color: "#ef4444", label: `Heavy (${heavyCount})`, sub: "<12 km/h" },
              { color: "#f97316", label: `Moderate (${moderateCount})`, sub: "12–20 km/h" },
              { color: "#22c55e", label: `Low (${lowCount})`, sub: "≥20 km/h" },
              { color: "#94a3b8", label: "Not synced yet", sub: "" },
            ].map(({ color, label, sub }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: "0.7rem", color: "#f1f5f9" }}>{label} {sub && <span style={{ color: "#94a3b8" }}>{sub}</span>}</span>
              </div>
            ))}
          </div>
        )}

        {/* TomTom Traffic Overlay section */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "8px" }}>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: "700",
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
            🛣️ TomTom Traffic Overlay
          </div>

          {!hasTomTomKey ? (
            <div style={{
              fontSize: "0.68rem", color: "#fbbf24",
              background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
              borderRadius: "6px", padding: "6px 8px", lineHeight: "1.5"
            }}>
              ⚠️ Add <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: "3px" }}>VITE_TOMTOM_KEY</code> to <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: "3px" }}>frontend/.env</code>
              <br />
              <a href="https://developer.tomtom.com" target="_blank" rel="noreferrer"
                style={{ color: "#60a5fa", textDecoration: "underline" }}>
                Get free key →
              </a>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <label style={{ fontSize: "0.75rem", color: "#cbd5e1", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "7px" }}>
                <input type="checkbox" checked={showTrafficFlow}
                  onChange={e => setShowTrafficFlow(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "#22c55e", width: 14, height: 14 }}
                />
                <span>
                  <span style={{ fontWeight: "600" }}>Traffic Flow</span>
                  <span style={{ color: "#64748b", display: "block", fontSize: "0.67rem" }}>
                    🟢 Free · 🟡 Slow · 🔴 Jammed
                  </span>
                </span>
              </label>
              <label style={{ fontSize: "0.75rem", color: "#cbd5e1", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "7px" }}>
                <input type="checkbox" checked={showIncidents}
                  onChange={e => setShowIncidents(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "#f87171", width: 14, height: 14 }}
                />
                <span>
                  <span style={{ fontWeight: "600" }}>Incidents</span>
                  <span style={{ color: "#64748b", display: "block", fontSize: "0.67rem" }}>
                    Accidents · Roadworks
                  </span>
                </span>
              </label>
              {(showTrafficFlow || showIncidents) && (
                <div style={{ fontSize: "0.67rem", color: "#86efac", marginTop: "2px" }}>
                  ✅ TomTom live data active
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Leaflet Map ── */}
      <MapContainer
        center={defaultCenter}
        zoom={12}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        {/* Base dark tile */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* TomTom Traffic Flow overlay (green/yellow/red road lines) */}
        {showTrafficFlow && <TomTomTrafficFlow apiKey={TOMTOM_KEY} />}

        {/* TomTom Traffic Incidents overlay */}
        {showIncidents && <TomTomTrafficIncidents apiKey={TOMTOM_KEY} />}

        {/* Hotspot circles */}
        {hotspots.map((spot) => {
          const isSelected = selectedHotspot?.cluster_id === spot.cluster_id;
          const color = getMarkerColor(spot);
          return (
            <CircleMarker
              key={spot.cluster_id}
              center={[spot.avg_lat, spot.avg_lon]}
              radius={getMarkerRadius(spot.hotspot_impact_score_v3)}
              fillColor={color}
              color={isSelected ? "#ffffff" : color}
              weight={isSelected ? 3 : 1.5}
              fillOpacity={isSelected ? 0.92 : (colorMode === "traffic" ? 0.8 : 0.5)}
              eventHandlers={{ click: () => onSelectHotspot(spot) }}
            >
              <Popup>
                <div style={{ color: "#333", fontSize: "0.85rem", lineHeight: "1.6", minWidth: "200px" }}>
                  <strong style={{ fontSize: "0.95rem" }}>Rank #{spot.rank_v3}</strong>
                  <br />
                  <strong>Junction:</strong> {spot.junction || "No Junction"}
                  {spot.road_name && (
                    <><br /><strong>OSM Road:</strong> {spot.road_name} ({spot.road_class})</>
                  )}
                  <br />
                  <strong>Station:</strong> {spot.police_station}
                  <br />
                  <strong>Impact Score:</strong> {Math.round(spot.hotspot_impact_score_v3)}

                  {/* Traffic info block */}
                  {spot.congestion_level ? (
                    <div style={{
                      marginTop: "8px", padding: "7px 9px", borderRadius: "7px",
                      background: spot.congestion_level === "heavy" ? "#fef2f2"
                        : spot.congestion_level === "moderate" ? "#fff7ed" : "#f0fdf4",
                      border: `1px solid ${spot.congestion_level === "heavy" ? "#fca5a5"
                        : spot.congestion_level === "moderate" ? "#fdba74" : "#86efac"}`
                    }}>
                      <div style={{ fontWeight: "700", fontSize: "0.85rem",
                        color: spot.congestion_level === "heavy" ? "#dc2626"
                          : spot.congestion_level === "moderate" ? "#ea580c" : "#16a34a"
                      }}>
                        🚦 {spot.congestion_level.toUpperCase()} TRAFFIC
                      </div>
                      {spot.congestion_speed_kmh != null && (
                        <div style={{ fontSize: "0.78rem", color: "#555", marginTop: "2px" }}>
                          Speed: <strong>{spot.congestion_speed_kmh} km/h</strong>
                          {" · "}Multiplier: <strong>{spot.congestion_multiplier}×</strong>
                        </div>
                      )}
                      {spot.congestion_updated_at && (
                        <div style={{ fontSize: "0.7rem", color: "#888", marginTop: "2px" }}>
                          Synced: {new Date(spot.congestion_updated_at).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: "6px", color: "#999", fontSize: "0.78rem" }}>
                      🚦 Traffic data pending next sync...
                    </div>
                  )}

                  {spot.outcome_flag && (
                    <><br />
                      <strong>Enforcement:</strong>{" "}
                      <span style={{ color: spot.outcome_flag === "improved" ? "green" : spot.outcome_flag === "worsened" ? "red" : "orange", fontWeight: "bold" }}>
                        {spot.outcome_flag}
                      </span>
                    </>
                  )}
                  {spot.anomaly_flag && (
                    <><br /><span style={{ color: "red", fontWeight: "bold" }}>⚠️ SPIKE ALARM</span></>
                  )}
                  {spot.predicted_next_week != null && (
                    <><br /><strong>Next Wk Forecast:</strong> {spot.predicted_next_week}</>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        <ChangeMapView center={mapCenter} zoom={mapZoom} />
      </MapContainer>
    </div>
  );
}
