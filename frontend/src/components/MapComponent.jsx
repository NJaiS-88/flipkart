import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

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

// Mappls Traffic Tile Layer component (inside MapContainer)
function MapplsTrafficLayer({ token }) {
  if (!token) return null;
  return (
    <TileLayer
      url={`https://apis.mappls.com/advancedmaps/v1/${token}/traffictile/{z}/{x}/{y}.png`}
      opacity={0.75}
      attribution='Traffic &copy; <a href="https://www.mappls.com">Mappls</a>'
      maxZoom={18}
      zIndex={500}
    />
  );
}

export default function MapComponent({ hotspots, selectedHotspot, onSelectHotspot }) {
  const [colorMode, setColorMode] = useState("impact"); // "impact" or "traffic"
  const [showTrafficLayer, setShowTrafficLayer] = useState(false);
  const [mapplsToken, setMapplsToken] = useState(null);
  const [tokenError, setTokenError] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const defaultCenter = [12.9716, 77.5946]; // Bengaluru default
  const mapCenter = selectedHotspot 
    ? [selectedHotspot.avg_lat, selectedHotspot.avg_lon] 
    : defaultCenter;
  const mapZoom = selectedHotspot ? 15 : 12;

  // Fetch Mappls token when traffic layer is toggled on
  useEffect(() => {
    if (!showTrafficLayer) return;
    if (mapplsToken) return; // already have one

    fetch(`${API_URL}/api/traffic-token`)
      .then(r => r.json())
      .then(d => {
        if (d.token) {
          setMapplsToken(d.token);
          setTokenError(false);
        } else {
          setTokenError(true);
        }
      })
      .catch(() => setTokenError(true));
  }, [showTrafficLayer]);

  // Compute last sync time from hotspots
  useEffect(() => {
    const synced = hotspots.filter(h => h.congestion_updated_at);
    if (synced.length > 0) {
      const latest = synced.reduce((a, b) => 
        new Date(a.congestion_updated_at) > new Date(b.congestion_updated_at) ? a : b
      );
      setLastSync(new Date(latest.congestion_updated_at));
    }
  }, [hotspots]);

  // Helper to color circles based on impact score or traffic status
  const getMarkerColor = (spot) => {
    if (colorMode === "traffic") {
      if (spot.congestion_level === "heavy")   return "#ef4444"; // Red
      if (spot.congestion_level === "moderate") return "#f97316"; // Orange
      if (spot.congestion_level === "low")      return "#22c55e"; // Green
      return "#94a3b8"; // Gray for unknown/not yet synced
    }
    // Default impact mode
    if (spot.anomaly_flag) return "#ef4444";
    const score = spot.hotspot_impact_score_v3;
    if (score > 10000) return "#ef4444";
    if (score > 2000)  return "#f97316";
    if (score > 500)   return "#eab308";
    return "#66fcf1";
  };

  const getMarkerRadius = (score) => {
    const minRadius = 6, maxRadius = 30;
    return Math.max(minRadius, Math.min(maxRadius, Math.sqrt(score) * 0.08));
  };

  // Count traffic-synced hotspots
  const syncedCount = hotspots.filter(h => h.congestion_level).length;
  const heavyCount = hotspots.filter(h => h.congestion_level === "heavy").length;
  const moderateCount = hotspots.filter(h => h.congestion_level === "moderate").length;
  const lowCount = hotspots.filter(h => h.congestion_level === "low").length;

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>

      {/* Top-right control panel */}
      <div style={{ 
        position: "absolute", top: "10px", right: "10px", zIndex: 1000,
        background: "rgba(10, 16, 30, 0.92)", backdropFilter: "blur(8px)",
        padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(100,252,241,0.2)",
        display: "flex", flexDirection: "column", gap: "8px", minWidth: "180px"
      }}>
        <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          🗺️ Map Layer
        </div>
        
        {/* Color mode toggle */}
        <div style={{ display: "flex", gap: "4px" }}>
          <button 
            onClick={() => setColorMode("impact")}
            style={{ 
              flex: 1,
              background: colorMode === "impact" ? "#66fcf1" : "transparent",
              color: colorMode === "impact" ? "#000" : "#fff",
              border: "1px solid #66fcf1",
              padding: "4px 6px", borderRadius: "4px", fontSize: "0.72rem", cursor: "pointer", fontWeight: "600"
            }}
          >
            OSM Impact
          </button>
          <button 
            onClick={() => setColorMode("traffic")}
            style={{ 
              flex: 1,
              background: colorMode === "traffic" ? "#f97316" : "transparent",
              color: colorMode === "traffic" ? "#000" : "#fff",
              border: "1px solid #f97316",
              padding: "4px 6px", borderRadius: "4px", fontSize: "0.72rem", cursor: "pointer", fontWeight: "600"
            }}
          >
            🚦 Traffic
          </button>
        </div>

        {/* Mappls traffic tile overlay toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <label style={{ fontSize: "0.75rem", color: "#cbd5e1", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
            <input 
              type="checkbox" 
              checked={showTrafficLayer}
              onChange={e => setShowTrafficLayer(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "#f97316" }}
            />
            Live Traffic Layer
          </label>
        </div>
        {showTrafficLayer && tokenError && (
          <div style={{ fontSize: "0.68rem", color: "#f87171" }}>⚠️ Token unavailable</div>
        )}
        {showTrafficLayer && mapplsToken && (
          <div style={{ fontSize: "0.68rem", color: "#86efac" }}>✅ Mappls traffic active</div>
        )}

        {/* Traffic legend (visible in traffic mode) */}
        {colorMode === "traffic" && (
          <div style={{ paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginBottom: "4px" }}>
              Synced: {syncedCount} hotspots
              {lastSync && <span> · {lastSync.toLocaleTimeString()}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <div style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                <span style={{ color: "#f1f5f9" }}>Heavy ({heavyCount}) &lt;12 km/h</span>
              </div>
              <div style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f97316", display: "inline-block" }} />
                <span style={{ color: "#f1f5f9" }}>Moderate ({moderateCount}) &lt;20 km/h</span>
              </div>
              <div style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                <span style={{ color: "#f1f5f9" }}>Low ({lowCount}) ≥20 km/h</span>
              </div>
              <div style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#94a3b8", display: "inline-block" }} />
                <span style={{ color: "#f1f5f9" }}>Not synced yet</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <MapContainer 
        center={defaultCenter} 
        zoom={12} 
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        {/* Base map tile */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Mappls Live Traffic Tile Overlay */}
        {showTrafficLayer && <MapplsTrafficLayer token={mapplsToken} />}
        
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
              weight={isSelected ? 3 : 1}
              fillOpacity={isSelected ? 0.9 : (colorMode === "traffic" ? 0.75 : 0.45)}
              eventHandlers={{
                click: () => onSelectHotspot(spot),
              }}
            >
              <Popup>
                <div style={{ color: "#333", fontSize: "0.85rem", lineHeight: "1.6", minWidth: "200px" }}>
                  <strong style={{ fontSize: "0.95rem" }}>Rank #{spot.rank_v3}</strong>
                  <br />
                  <strong>Junction:</strong> {spot.junction || "No Junction"}
                  {spot.road_name && (
                    <>
                      <br />
                      <strong>OSM Road:</strong> {spot.road_name} ({spot.road_class})
                    </>
                  )}
                  <br />
                  <strong>Station:</strong> {spot.police_station}
                  <br />
                  <strong>Impact Score:</strong> {Math.round(spot.hotspot_impact_score_v3)}
                  <br />
                  {/* Traffic block */}
                  {spot.congestion_level ? (
                    <div style={{ 
                      marginTop: "6px", padding: "6px 8px", borderRadius: "6px",
                      background: spot.congestion_level === "heavy" ? "#fef2f2" : spot.congestion_level === "moderate" ? "#fff7ed" : "#f0fdf4",
                      border: `1px solid ${spot.congestion_level === "heavy" ? "#fca5a5" : spot.congestion_level === "moderate" ? "#fdba74" : "#86efac"}`
                    }}>
                      <div style={{ fontWeight: "700", fontSize: "0.85rem",
                        color: spot.congestion_level === "heavy" ? "#dc2626" : spot.congestion_level === "moderate" ? "#ea580c" : "#16a34a"
                      }}>
                        🚦 {spot.congestion_level.toUpperCase()} TRAFFIC
                      </div>
                      {spot.congestion_speed_kmh && (
                        <div style={{ fontSize: "0.78rem", color: "#555", marginTop: "2px" }}>
                          Speed: <strong>{spot.congestion_speed_kmh} km/h</strong> · Multiplier: <strong>{spot.congestion_multiplier}×</strong>
                        </div>
                      )}
                      {spot.congestion_updated_at && (
                        <div style={{ fontSize: "0.72rem", color: "#888", marginTop: "2px" }}>
                          Updated: {new Date(spot.congestion_updated_at).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: "6px", color: "#999", fontSize: "0.78rem" }}>
                      🚦 Traffic data pending sync...
                    </div>
                  )}
                  {spot.outcome_flag && (
                    <>
                      <br />
                      <strong>Enforcement:</strong>{" "}
                      <span style={{ color: spot.outcome_flag === "improved" ? "green" : spot.outcome_flag === "worsened" ? "red" : "orange", fontWeight: "bold" }}>
                        {spot.outcome_flag}
                      </span>
                    </>
                  )}
                  {spot.anomaly_flag && (
                    <>
                      <br />
                      <span style={{ color: "red", fontWeight: "bold" }}>⚠️ SPIKE ALARM</span>
                    </>
                  )}
                  {spot.predicted_next_week !== undefined && spot.predicted_next_week !== null && (
                    <>
                      <br />
                      <strong>Next Wk Forecast:</strong> {spot.predicted_next_week}
                    </>
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
