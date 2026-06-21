import React, { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";

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

export default function MapComponent({ hotspots, selectedHotspot, onSelectHotspot }) {
  const defaultCenter = [12.9716, 77.5946]; // Bengaluru default
  const mapCenter = selectedHotspot 
    ? [selectedHotspot.avg_lat, selectedHotspot.avg_lon] 
    : defaultCenter;
  const mapZoom = selectedHotspot ? 15 : 12;

  // Helper to color circles based on impact score or status
  const getMarkerColor = (spot) => {
    if (spot.anomaly_flag) return "#ef4444"; // Red for anomalies/active spikes
    const score = spot.hotspot_impact_score_v3;
    if (score > 10000) return "#ef4444"; // Red
    if (score > 2000) return "#f97316";  // Orange
    if (score > 500) return "#eab308";   // Yellow
    return "#66fcf1";                     // Cyan
  };

  // Helper to determine size of circle based on impact score
  const getMarkerRadius = (score) => {
    const minRadius = 6;
    const maxRadius = 30;
    const radius = Math.sqrt(score) * 0.08;
    return Math.max(minRadius, Math.min(maxRadius, radius));
  };

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <MapContainer 
        center={defaultCenter} 
        zoom={12} 
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {hotspots.map((spot) => {
          const isSelected = selectedHotspot?.cluster_id === spot.cluster_id;
          return (
            <CircleMarker
              key={spot.cluster_id}
              center={[spot.avg_lat, spot.avg_lon]}
              radius={getMarkerRadius(spot.hotspot_impact_score_v3)}
              fillColor={getMarkerColor(spot)}
              color={isSelected ? "#ffffff" : getMarkerColor(spot)}
              weight={isSelected ? 3 : 1}
              fillOpacity={isSelected ? 0.85 : 0.45}
              eventHandlers={{
                click: () => onSelectHotspot(spot),
              }}
            >
              <Popup>
                <div style={{ color: "#333", fontSize: "0.85rem", lineHeight: "1.4" }}>
                  <strong>Rank #{spot.rank_v3}</strong>
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
                  <strong>Impact Score (OSM v3):</strong> {Math.round(spot.hotspot_impact_score_v3)}
                  <br />
                  <strong>Violations Count:</strong> {spot.violation_count}
                  {spot.outcome_flag && (
                    <>
                      <br />
                      <strong>Enforcement:</strong> <span style={{ color: spot.outcome_flag === "improved" ? "green" : spot.outcome_flag === "worsened" ? "red" : "orange", fontWeight: "bold" }}>{spot.outcome_flag}</span>
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

