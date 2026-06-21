import os
import sys
import json
import math
import warnings
from datetime import datetime, timedelta
import requests


import numpy as np
import pandas as pd
from sklearn.cluster import KMeans

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

# DATA_DIR: where input CSV files live (set via env var on Render with mounted disk)
# OUT_DIR: where output JSON/CSV/TXT route files are written
DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(os.path.abspath(__file__)))
OUT_DIR  = os.environ.get("OUT_DIR",  os.path.dirname(os.path.abspath(__file__)))
DWELL_MINUTES = 20
AVG_SPEED_KMPH = 25.0
SCORE_COL_PRIORITY = [
    "hotspot_impact_score_v3",
    "hotspot_score_decay_blended",
    "hotspot_impact_score_v2",
    "hotspot_impact_score",
]

SHIFT_PRESETS = {
    "morning":   (7,  12),
    "afternoon": (12, 17),
    "evening":   (17, 21),
    "night":     (21, 7),
}

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.asin(math.sqrt(a))

def _get_mappls_token(client_id, client_secret):
    """Fetch OAuth 2.0 Access Token from MapmyIndia (Mappls)."""
    try:
        url = "https://outpost.mappls.com/api/security/oauth/token"
        payload = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret
        }
        headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        }
        response = requests.post(url, data=payload, headers=headers, timeout=5)
        if response.status_code == 200:
            res_json = response.json()
            return res_json.get("access_token")
        else:
            print(f"[MapmyIndia] Auth Failed ({response.status_code}): {response.text}", flush=True)
    except Exception as e:
        print(f"[MapmyIndia] Error fetching OAuth token: {str(e)}", flush=True)
    return None

def _get_mappls_distance_matrix(points, access_token):
    """
    Fetch real-world routing distances (km) and durations (min) using MapmyIndia.
    points: list of (lat, lon)
    """
    n = len(points)
    dist_mat = np.zeros((n, n))
    dur_mat = np.zeros((n, n))
    
    # Pre-fill with Haversine fallback
    for i in range(n):
        for j in range(n):
            if i != j:
                d = _haversine_km(*points[i], *points[j])
                dist_mat[i, j] = d
                dur_mat[i, j] = (d / AVG_SPEED_KMPH) * 60

    if not access_token or n < 2:
        return dist_mat, dur_mat, False

    try:
        # Mappls expects coords as: lon,lat;lon,lat...
        coord_strings = [f"{lon},{lat}" for lat, lon in points]
        coords_path = ";".join(coord_strings)
        
        # Use primary resource with traffic matrix if enabled, or standard
        url = f"https://route.mappls.com/route/dm/distance_matrix/driving/{coords_path}"
        params = {
            "rtype": "0",
            "region": "ind",
            "access_token": access_token
        }
        
        response = requests.get(url, params=params, timeout=8)
        if response.status_code == 200:
            res_data = response.json()
            if "distances" in res_data and "durations" in res_data:
                # Distances are usually in meters, Durations in seconds
                m_dists = res_data["distances"]
                s_durs = res_data["durations"]
                
                for i in range(n):
                    for j in range(n):
                        if i != j and i < len(m_dists) and j < len(m_dists[i]):
                            dist_mat[i, j] = m_dists[i][j] / 1000.0  # to km
                            dur_mat[i, j] = s_durs[i][j] / 60.0      # to minutes
                print(f"[MapmyIndia] Loaded real-world distance matrix for {n} locations.", flush=True)
                return dist_mat, dur_mat, True
        else:
            print(f"[MapmyIndia] Distance Matrix API Failed ({response.status_code}): {response.text}", flush=True)
    except Exception as e:
        print(f"[MapmyIndia] Error calling Distance Matrix API: {str(e)}", flush=True)
        
    return dist_mat, dur_mat, False

def _build_distance_matrix(points):
    n = len(points)
    mat = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i != j:
                mat[i, j] = _haversine_km(*points[i], *points[j])
    return mat

def _nearest_neighbour_tsp(dist_matrix, start=0):
    n = len(dist_matrix)
    unvisited = set(range(n))
    route = [start]
    unvisited.remove(start)
    current = start
    while unvisited:
        nearest = min(unvisited, key=lambda j: dist_matrix[current, j])
        route.append(nearest)
        unvisited.remove(nearest)
        current = nearest
    return route

def _find_score_col(df):
    for col in SCORE_COL_PRIORITY:
        if col in df.columns:
            return col
    raise ValueError(f"No score column found. Expected one of: {SCORE_COL_PRIORITY}")

def _find_id_col(df):
    for col in ("cluster_id", "cell_id", "hotspot_id"):
        if col in df.columns:
            return col
    return None

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main(
    hotspots_path: str,
    n_officers: int = 3,
    top_n_hotspots: int = 15,
    shift_name: str = "morning",
    shift_start_hour: int = 7,
    shift_end_hour: int = 12,
    zone_filter: str = None,
):
    print("\n" + "="*60, flush=True)
    print("PHASE 3A — PATROL ROUTE OPTIMIZER", flush=True)
    print("="*60, flush=True)

    # 1. LOAD & FILTER
    hdf = pd.read_csv(hotspots_path, low_memory=False)
    print(f"[1/5] Loaded {len(hdf):,} hotspots", flush=True)

    score_col = _find_score_col(hdf)
    id_col = _find_id_col(hdf)

    if zone_filter and zone_filter.strip():
        zone_col = None
        for col in ("police_station", "top_police_station", "center_code"):
            if col in hdf.columns:
                zone_col = col
                break
        if zone_col:
            hdf = hdf[hdf[zone_col].astype(str).str.contains(zone_filter, case=False, na=False)]
            print(f"      After zone filter '{zone_filter}': {len(hdf):,} hotspots", flush=True)

    if "dominant_hour" in hdf.columns:
        hdf["dominant_hour"] = pd.to_numeric(hdf["dominant_hour"], errors="coerce")
        shift_active = hdf["dominant_hour"].between(shift_start_hour, shift_end_hour - 1)
        hdf_shift = hdf[shift_active | hdf["dominant_hour"].isna()].copy()
    else:
        hdf_shift = hdf.copy()

    hdf_shift = hdf_shift.dropna(subset=["avg_lat", "avg_lon"])
    hdf_shift["lat"] = pd.to_numeric(hdf_shift["avg_lat"], errors="coerce")
    hdf_shift["lon"] = pd.to_numeric(hdf_shift["avg_lon"], errors="coerce")
    hdf_shift = hdf_shift.dropna(subset=["lat", "lon"])
    hdf_shift = hdf_shift.sort_values(score_col, ascending=False).head(top_n_hotspots).reset_index(drop=True)
    print(f"      Top {len(hdf_shift)} hotspots selected", flush=True)

    if len(hdf_shift) == 0:
        print("[ERROR] No hotspots to route.", flush=True)
        sys.exit(1)

    n_officers = min(n_officers, len(hdf_shift))

    # 2. SPLIT HOTSPOTS AMONG OFFICERS (KMeans clustering)
    coords = hdf_shift[["lat", "lon"]].values
    if n_officers == 1:
        hdf_shift["officer_id"] = 1
    else:
        km = KMeans(n_clusters=n_officers, random_state=42, n_init=10)
        hdf_shift["officer_id"] = km.fit_predict(coords) + 1

    # 3. BUILD ROUTES (Nearest-Neighbour TSP per officer)
    routes = {}
    shift_start_dt = datetime.now().replace(
        hour=shift_start_hour, minute=0, second=0, microsecond=0
    )

    # Check for MapmyIndia credentials
    client_id = os.environ.get("MAPMYINDIA_CLIENT_ID")
    client_secret = os.environ.get("MAPMYINDIA_CLIENT_SECRET")
    access_token = None
    if client_id and client_secret:
        print("[MapmyIndia] Credentials detected. Authenticating...", flush=True)
        access_token = _get_mappls_token(client_id, client_secret)

    for officer_id in range(1, n_officers + 1):
        subset = hdf_shift[hdf_shift["officer_id"] == officer_id].reset_index(drop=True)
        if len(subset) == 0:
            continue
        points = list(zip(subset["lat"], subset["lon"]))
        
        # Build distance matrix (try MapmyIndia real route network first, fallback to Haversine)
        dist_mat, dur_mat, is_real_traffic = _get_mappls_distance_matrix(points, access_token)
        
        start_idx = int(subset[score_col].idxmax()) if len(subset) > 1 else 0
        route_indices = _nearest_neighbour_tsp(dist_mat, start=start_idx)

        total_km = sum(
            dist_mat[route_indices[i], route_indices[i + 1]]
            for i in range(len(route_indices) - 1)
        )

        stops = []
        current_time = shift_start_dt
        for stop_order, idx in enumerate(route_indices, start=1):
            row = subset.iloc[idx]
            congestion_level = "low"
            congestion_mult = 1.0

            if stop_order == 1:
                travel_km, travel_min = 0.0, 0
            else:
                prev_idx = route_indices[stop_order - 2]
                travel_km = dist_mat[prev_idx, idx]
                
                if is_real_traffic:
                    travel_min = int(round(dur_mat[prev_idx, idx]))
                    # Compute traffic speed to classify congestion
                    if travel_min > 0:
                        real_speed = (travel_km / (travel_min / 60.0))
                        if real_speed < 12.0:
                            congestion_level = "heavy"
                            congestion_mult = 1.5
                        elif real_speed < 20.0:
                            congestion_level = "moderate"
                            congestion_mult = 1.2
                else:
                    travel_min = int((travel_km / AVG_SPEED_KMPH) * 60)
                
                current_time += timedelta(minutes=travel_min)

            eta_str = current_time.strftime("%H:%M")
            current_time += timedelta(minutes=DWELL_MINUTES)
            depart_str = current_time.strftime("%H:%M")

            # Grab extra hotspot info if available
            junction = str(row.get("junction", "")) if "junction" in row.index else ""
            road_name = str(row.get("road_name", "")) if "road_name" in row.index else ""
            police_station = str(row.get("police_station", "")) if "police_station" in row.index else ""
            label = junction if junction and junction not in ("", "nan", "No Junction") else (road_name if road_name and road_name != "nan" else f"Cluster #{row[id_col] if id_col else idx}")

            # Apply congestion multiplier to score
            raw_score = float(row[score_col])
            adjusted_score = raw_score * congestion_mult

            stop = {
                "stop_order": stop_order,
                "officer_id": officer_id,
                "cluster_id": str(row[id_col]) if id_col and id_col in row.index else f"hs_{idx}",
                "label": label,
                "police_station": police_station,
                "lat": round(float(row["lat"]), 6),
                "lon": round(float(row["lon"]), 6),
                "score": round(adjusted_score, 4),
                "raw_score": round(raw_score, 4),
                "congestion_level": congestion_level,
                "congestion_multiplier": congestion_mult,
                "eta": eta_str,
                "depart": depart_str,
                "dwell_minutes": DWELL_MINUTES,
                "travel_km_from_prev": round(travel_km, 3),
                "travel_min_from_prev": travel_min,
            }
            stops.append(stop)

        finish_time = current_time
        total_patrol_minutes = int((finish_time - shift_start_dt).total_seconds() // 60)

        routes[officer_id] = {
            "officer_id": officer_id,
            "shift": shift_name,
            "shift_start": f"{shift_start_hour:02d}:00",
            "shift_end": f"{shift_end_hour:02d}:00",
            "n_stops": len(stops),
            "total_km": round(total_km, 2),
            "total_patrol_minutes": total_patrol_minutes,
            "estimated_finish": finish_time.strftime("%H:%M"),
            "stops": stops,
        }

    # 4. OUTPUTS
    json_out = {
        "generated_at": datetime.now().isoformat(),
        "shift": shift_name,
        "n_officers": n_officers,
        "top_n_hotspots": top_n_hotspots,
        "zone_filter": zone_filter,
        "dwell_minutes_per_stop": DWELL_MINUTES,
        "avg_speed_kmph": AVG_SPEED_KMPH,
        "routes": list(routes.values()),
    }

    json_path = os.path.join(OUT_DIR, f"patrol_routes_{shift_name}.json")
    with open(json_path, "w") as f:
        json.dump(json_out, f, indent=2)

    csv_df = pd.DataFrame([s for r in routes.values() for s in r["stops"]])
    csv_path = os.path.join(OUT_DIR, f"patrol_routes_{shift_name}.csv")
    csv_df.to_csv(csv_path, index=False)

    txt_path = os.path.join(OUT_DIR, f"patrol_routes_{shift_name}.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(f"PATROL BRIEFING — {shift_name.upper()} SHIFT\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"Shift window: {shift_start_hour:02d}:00 - {shift_end_hour:02d}:00\n")
        f.write(f"Zone: {zone_filter or 'All zones'}\n")
        f.write("=" * 56 + "\n")
        for route in routes.values():
            f.write(f"\nOFFICER {route['officer_id']}\n")
            f.write(f"  Total stops:    {route['n_stops']}\n")
            f.write(f"  Total distance: {route['total_km']} km\n")
            f.write(f"  Est. finish:    {route['estimated_finish']}\n\n")
            f.write(f"  {'#':<4} {'ETA':<6} {'LAT':>10} {'LON':>11} {'SCORE':>8}  LOCATION\n")
            f.write(f"  {'-'*4} {'-'*6} {'-'*10} {'-'*11} {'-'*8}  {'-'*20}\n")
            for stop in route["stops"]:
                f.write(
                    f"  {stop['stop_order']:<4} {stop['eta']:<6} "
                    f"{stop['lat']:>10.5f} {stop['lon']:>11.5f} "
                    f"{stop['score']:>8.2f}  {stop['label']}\n"
                )
            f.write(f"  Depart last stop by: {route['stops'][-1]['depart']}\n")

    print(f"[4/5] Saved: {json_path}", flush=True)
    print(f"[5/5] Done — {n_officers} officer route(s) generated.", flush=True)

    # Signal to Node.js where the JSON output is
    print(f"ROUTE_JSON:{json_path}", flush=True)
    return json_out

# ---------------------------------------------------------------------------
# CLI ENTRY POINT
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Usage: python two.py [zone_filter] [n_officers] [top_n] [shift_name]
    #   shift_name: morning | afternoon | evening | night
    hotspots_path = os.path.join(DATA_DIR, "hotspots_with_road_context_v3.csv")

    zone_filter    = None
    n_officers     = 3
    top_n_hotspots = 15
    shift_name     = "morning"

    args = sys.argv[1:]
    numeric_args = []
    
    for arg in args:
        if not arg:
            continue
        if arg.lower() in SHIFT_PRESETS:
            shift_name = arg.lower()
        elif arg.isdigit():
            numeric_args.append(int(arg))
        else:
            zone_filter = arg

    if len(numeric_args) >= 1:
        n_officers = numeric_args[0]
    if len(numeric_args) >= 2:
        top_n_hotspots = numeric_args[1]

    start_hour, end_hour = SHIFT_PRESETS.get(shift_name, (7, 12))

    main(
        hotspots_path,
        n_officers=n_officers,
        top_n_hotspots=top_n_hotspots,
        shift_name=shift_name,
        shift_start_hour=start_hour,
        shift_end_hour=end_hour,
        zone_filter=zone_filter,
    )
