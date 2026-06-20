"""
ROAD-NETWORK IMPACT ENRICHMENT (Stage 3a)
==========================================
Purpose: For each hotspot in hotspots.csv, query OpenStreetMap via osmnx to fetch
the nearest road segment's metadata (highway class, lanes, speed limit). Then
compute an updated hotspot_impact_score_v2 = hotspot_impact_score × road_class_weight
so that hotspots on major arterial roads are weighted higher than identical violation
counts on quiet residential streets.

Input:  hotspots.csv (or hotspots (1).csv) — all columns from Stage 1
Output: hotspots_with_road_context.csv — original columns + road_class, lanes,
        speed_limit, road_class_weight, hotspot_impact_score_v2, re-ranked by v2 score.

Dependencies: pandas, osmnx, networkx (osmnx dependency)

Design decisions documented inline.

Author: AI Assistant (building on parking_hotspot_ml.py pipeline)
"""

import pandas as pd
import numpy as np
import time
import warnings
import os
import json
from pathlib import Path

# ============================================================================
# ROAD CLASS → WEIGHT MAPPING
# ============================================================================
# Rationale: OSM highway tags represent road importance. A parking violation on
# a primary arterial road (high traffic volume, high obstruction impact) should
# weigh more than the same violation count on a residential side street.
#
# OSM highway tag reference: https://wiki.openstreetmap.org/wiki/Key:highway
#
# Weight mapping (chosen to give a meaningful but not overwhelming multiplier):
#   - residential / living_street / service / unclassified = 1.0 (baseline)
#   - tertiary / tertiary_link                              = 1.3
#   - secondary / secondary_link                            = 1.5
#   - primary / primary_link                                = 2.0
#   - trunk / trunk_link                                    = 2.5
#   - motorway / motorway_link                              = 3.0 (unlikely for parking but complete)
#
# Fallback for unknown/missing tags or OSM lookup failure: 1.0 (neutral, no boost)
#
# Known limitation: OSM data coverage is not 100%. Some roads may lack lane counts
# or speed limits. We handle missing values gracefully (NaN / "unknown").

ROAD_CLASS_WEIGHT_MAP = {
    # Residential / minor roads — baseline weight
    "residential":    1.0,
    "living_street":  1.0,
    "service":        1.0,
    "unclassified":   1.0,
    "pedestrian":     0.8,   # pedestrian zones — less traffic impact
    "footway":        0.8,
    "cycleway":       0.8,
    "track":          0.8,
    "path":           0.8,

    # Tertiary roads — local connectors
    "tertiary":       1.3,
    "tertiary_link":  1.3,

    # Secondary roads — significant urban roads
    "secondary":      1.5,
    "secondary_link": 1.5,

    # Primary roads — major arterials
    "primary":        2.0,
    "primary_link":   2.0,

    # Trunk roads — high-capacity roads below motorway
    "trunk":          2.5,
    "trunk_link":     2.5,

    # Motorway — unlikely for parking violations, but included for completeness
    "motorway":       3.0,
    "motorway_link":  3.0,
}

DEFAULT_WEIGHT = 1.0  # Fallback for unknown road types or lookup failures


# ============================================================================
# CACHE for OSM lookups — avoid redundant network calls for nearby hotspots
# ============================================================================
# osmnx downloads the street network for an area; we cache by grid cell
# (rounded coordinates) to avoid re-downloading the same area repeatedly.
# Cache key: (lat rounded to 3 decimals, lon rounded to 3 decimals)
# This groups hotspots within ~111m of each other into the same cache bucket.

_network_cache = {}
_CACHE_PRECISION = 3  # decimal places for coordinate rounding


def _get_cached_network(lat, lon, dist=200):
    """
    Get the OSM street network graph near (lat, lon), using a local cache
    to avoid redundant API calls for nearby points.
    
    Parameters
    ----------
    lat, lon : float
        Center point coordinates.
    dist : int
        Radius in meters to download the network around the point.
    
    Returns
    -------
    G : networkx.MultiDiGraph or None
        The street network graph, or None if the download failed.
    """
    import osmnx as ox

    cache_key = (round(lat, _CACHE_PRECISION), round(lon, _CACHE_PRECISION))
    if cache_key in _network_cache:
        return _network_cache[cache_key]
    
    try:
        # Download a small network graph around the point
        # network_type='drive' gets driveable roads (most relevant for parking)
        G = ox.graph_from_point((lat, lon), dist=dist, network_type="drive")
        _network_cache[cache_key] = G
        return G
    except Exception as e:
        # Common failures: no driveable roads nearby, network timeout, etc.
        _network_cache[cache_key] = None
        return None


def lookup_nearest_road(lat, lon, delay=0.3):
    """
    Query OSM for the nearest road segment to (lat, lon) and extract
    highway class, lanes, and speed limit.
    
    Parameters
    ----------
    lat, lon : float
        Coordinates of the hotspot center.
    delay : float
        Seconds to wait between uncached requests (OSM rate limiting).
    
    Returns
    -------
    dict with keys: road_class, lanes, speed_limit, road_class_weight, fallback_used
    """
    import osmnx as ox

    result = {
        "road_class": "unknown",
        "lanes": np.nan,
        "speed_limit": np.nan,
        "road_class_weight": DEFAULT_WEIGHT,
        "fallback_used": True
    }

    # Check if this is a fresh (uncached) request — if so, add delay for rate limiting
    cache_key = (round(lat, _CACHE_PRECISION), round(lon, _CACHE_PRECISION))
    is_cached = cache_key in _network_cache
    
    G = _get_cached_network(lat, lon)
    
    if not is_cached:
        # Only delay after fresh network downloads to respect OSM rate limits
        time.sleep(delay)
    
    if G is None:
        return result
    
    try:
        # Find the nearest edge (road segment) to the point
        nearest_edge = ox.nearest_edges(G, lon, lat)
        
        # nearest_edges returns (u, v, key) tuple for single point
        u, v, key = nearest_edge
        edge_data = G[u][v][key]
        
        # Extract highway class
        # OSM highway tag can be a string or a list (when segment has multiple tags)
        highway = edge_data.get("highway", "unknown")
        if isinstance(highway, list):
            # Take the most "important" (highest weight) tag from the list
            highway = max(highway, key=lambda h: ROAD_CLASS_WEIGHT_MAP.get(h, DEFAULT_WEIGHT))
        
        result["road_class"] = highway
        result["road_class_weight"] = ROAD_CLASS_WEIGHT_MAP.get(highway, DEFAULT_WEIGHT)
        result["fallback_used"] = highway not in ROAD_CLASS_WEIGHT_MAP
        
        # Extract lanes (may not be tagged)
        lanes = edge_data.get("lanes", None)
        if lanes is not None:
            if isinstance(lanes, list):
                lanes = lanes[0]
            try:
                result["lanes"] = int(lanes)
            except (ValueError, TypeError):
                pass
        
        # Extract speed limit (maxspeed tag, may not be tagged)
        maxspeed = edge_data.get("maxspeed", None)
        if maxspeed is not None:
            if isinstance(maxspeed, list):
                maxspeed = maxspeed[0]
            try:
                # OSM maxspeed is usually a string like "40" or "40 km/h"
                speed_str = str(maxspeed).replace("km/h", "").replace("mph", "").strip()
                result["speed_limit"] = float(speed_str)
            except (ValueError, TypeError):
                pass
        
    except Exception as e:
        # Edge lookup can fail if the graph is empty or malformed
        warnings.warn(f"Edge lookup failed at ({lat:.4f}, {lon:.4f}): {e}")
    
    return result


def enrich_hotspots_with_road_context(
    hotspots_path="hotspots (1).csv",
    output_path="hotspots_with_road_context.csv",
    delay_between_requests=0.3,
    test_mode=False,
    test_limit=10
):
    """
    Main enrichment function. Reads hotspots, queries OSM for each, and writes
    enriched CSV with road context and updated impact scores.
    
    Parameters
    ----------
    hotspots_path : str
        Path to the input hotspots CSV.
    output_path : str
        Path to write the enriched output CSV.
    delay_between_requests : float
        Seconds to wait between fresh OSM network downloads.
    test_mode : bool
        If True, only process first `test_limit` rows (for quick testing).
    test_limit : int
        Number of rows to process in test mode.
    """
    print("=" * 60)
    print("ROAD-NETWORK IMPACT ENRICHMENT")
    print("=" * 60)
    
    # Load hotspots
    df = pd.read_csv(hotspots_path)
    print(f"Loaded {len(df)} hotspots from: {hotspots_path}")
    
    if test_mode:
        df = df.head(test_limit).copy()
        print(f"TEST MODE: Processing only first {test_limit} rows")
    
    # Initialize new columns
    df["road_class"] = "unknown"
    df["lanes"] = np.nan
    df["speed_limit"] = np.nan
    df["road_class_weight"] = DEFAULT_WEIGHT
    
    # Track fallbacks for reporting
    fallback_rows = []
    total = len(df)
    
    print(f"\nQuerying OSM for {total} hotspot locations...")
    print("(This may take a while due to OSM rate limiting)\n")
    
    for idx, row in df.iterrows():
        lat = row["avg_lat"]
        lon = row["avg_lon"]
        cluster_id = row["cluster_id"]
        
        # Progress indicator
        position = df.index.get_loc(idx) + 1
        if position % 50 == 0 or position == 1 or position == total:
            print(f"  Processing {position}/{total} (cluster {cluster_id})...")
        
        road_info = lookup_nearest_road(lat, lon, delay=delay_between_requests)
        
        df.at[idx, "road_class"] = road_info["road_class"]
        df.at[idx, "lanes"] = road_info["lanes"]
        df.at[idx, "speed_limit"] = road_info["speed_limit"]
        df.at[idx, "road_class_weight"] = road_info["road_class_weight"]
        
        if road_info["fallback_used"]:
            fallback_rows.append({
                "cluster_id": cluster_id,
                "lat": lat,
                "lon": lon,
                "road_class_returned": road_info["road_class"],
                "reason": "unknown road type or OSM lookup failure"
            })
    
    # Compute updated impact score
    # hotspot_impact_score_v2 = hotspot_impact_score × road_class_weight
    df["hotspot_impact_score_v2"] = df["hotspot_impact_score"] * df["road_class_weight"]
    
    # Re-rank by the new score (descending)
    df = df.sort_values("hotspot_impact_score_v2", ascending=False).reset_index(drop=True)
    df["rank_v2"] = df.index + 1
    
    # Save output
    df.to_csv(output_path, index=False)
    print(f"\n{'=' * 60}")
    print(f"OUTPUT: {output_path}")
    print(f"{'=' * 60}")
    
    # Summary statistics
    print(f"\nTotal hotspots enriched: {total}")
    print(f"Fallback (weight=1.0) used for: {len(fallback_rows)} rows "
          f"({len(fallback_rows)/total*100:.1f}%)")
    
    # Road class distribution
    print(f"\nRoad Class Distribution:")
    class_counts = df["road_class"].value_counts()
    for cls, count in class_counts.items():
        weight = ROAD_CLASS_WEIGHT_MAP.get(cls, DEFAULT_WEIGHT)
        print(f"  {cls:20s}: {count:5d} hotspots (weight={weight})")
    
    # Weight distribution
    print(f"\nRoad Class Weight Statistics:")
    print(f"  Mean weight:   {df['road_class_weight'].mean():.3f}")
    print(f"  Median weight: {df['road_class_weight'].median():.3f}")
    print(f"  Min weight:    {df['road_class_weight'].min():.3f}")
    print(f"  Max weight:    {df['road_class_weight'].max():.3f}")
    
    # Show top 10 re-ranked hotspots
    print(f"\nTop 10 Hotspots by Updated Score (v2):")
    print(f"{'Rank_v2':>8} {'Old_Rank':>9} {'Cluster':>8} {'Score_v1':>10} "
          f"{'Weight':>7} {'Score_v2':>10} {'Road_Class':>15}")
    print("-" * 75)
    for _, r in df.head(10).iterrows():
        print(f"{int(r['rank_v2']):>8} {int(r['rank']):>9} {int(r['cluster_id']):>8} "
              f"{r['hotspot_impact_score']:>10.1f} {r['road_class_weight']:>7.1f} "
              f"{r['hotspot_impact_score_v2']:>10.1f} {r['road_class']:>15}")
    
    # Log fallback details
    if fallback_rows:
        print(f"\n⚠️  FALLBACK DETAILS ({len(fallback_rows)} rows):")
        for fb in fallback_rows[:20]:  # Show first 20
            print(f"  Cluster {fb['cluster_id']}: ({fb['lat']:.4f}, {fb['lon']:.4f}) "
                  f"→ road_class='{fb['road_class_returned']}' — {fb['reason']}")
        if len(fallback_rows) > 20:
            print(f"  ... and {len(fallback_rows) - 20} more (see output CSV)")
    
    return df


# ============================================================================
# SYNTHETIC TEST — run a small test before real data
# ============================================================================
def run_synthetic_test():
    """
    Create a tiny synthetic hotspots CSV and run enrichment on it to verify
    the pipeline works end-to-end before using real data.
    """
    print("\n" + "=" * 60)
    print("SYNTHETIC TEST — Road Network Enrichment")
    print("=" * 60)
    
    # Known Bengaluru locations with different road types:
    # 1. MG Road (primary road) — major commercial arterial
    # 2. Residential area in Koramangala — residential streets
    # 3. Outer Ring Road near Marathahalli — trunk road
    # 4. Small lane in Basavanagudi — residential
    # 5. Mysore Road — trunk/primary
    test_data = pd.DataFrame({
        "cluster_id":            [9001, 9002, 9003, 9004, 9005],
        "violation_count":       [100,  100,  100,  100,  100],
        "avg_lat":               [12.9758, 12.9352, 12.9563, 12.9430, 12.9600],
        "avg_lon":               [77.6063, 77.6245, 77.6970, 77.5650, 77.5440],
        "total_impact":          [200.0, 200.0, 200.0, 200.0, 200.0],
        "avg_impact":            [2.0, 2.0, 2.0, 2.0, 2.0],
        "top_police_station":    ["Cubbon Park", "Madiwala", "Marathahalli", "Basavanagudi", "Byatarayanapura"],
        "top_junction":          ["MG Road", "Koramangala", "ORR", "Bull Temple", "Mysore Rd"],
        "date_span_days":        [30, 30, 30, 30, 30],
        "unique_days":           [20, 20, 20, 20, 20],
        "dominant_violation":    ["NO PARKING"] * 5,
        "recurrence_rate":       [0.67, 0.67, 0.67, 0.67, 0.67],
        "hotspot_impact_score":  [150.0, 150.0, 150.0, 150.0, 150.0],
        "rank":                  [1, 2, 3, 4, 5],
    })
    
    test_csv_path = "test_hotspots_road.csv"
    test_output_path = "test_hotspots_with_road_context.csv"
    test_data.to_csv(test_csv_path, index=False)
    
    print(f"Created synthetic test file: {test_csv_path}")
    print(f"Test locations: MG Road, Koramangala, ORR Marathahalli, Basavanagudi, Mysore Road\n")
    
    result = enrich_hotspots_with_road_context(
        hotspots_path=test_csv_path,
        output_path=test_output_path,
        delay_between_requests=0.5,
        test_mode=False
    )
    
    # Validate results
    print(f"\n{'=' * 60}")
    print("SYNTHETIC TEST VALIDATION")
    print(f"{'=' * 60}")
    
    assert len(result) == 5, f"Expected 5 rows, got {len(result)}"
    assert "hotspot_impact_score_v2" in result.columns, "Missing v2 score column"
    assert "road_class" in result.columns, "Missing road_class column"
    assert "road_class_weight" in result.columns, "Missing weight column"
    assert "rank_v2" in result.columns, "Missing rank_v2 column"
    
    # All scores should be >= original (weights are >= 0.8)
    for _, r in result.iterrows():
        v2 = r["hotspot_impact_score_v2"]
        v1 = r["hotspot_impact_score"]
        w  = r["road_class_weight"]
        assert abs(v2 - v1 * w) < 0.01, f"Score mismatch: {v2} != {v1} * {w}"
    
    print("✅ All assertions passed.")
    print(f"✅ Output written to: {test_output_path}")
    
    # Cleanup test input (keep output for inspection)
    os.remove(test_csv_path)
    print(f"✅ Cleaned up test input file.")
    
    return result


# ============================================================================
# NOTEBOOK-SAFE ENTRY POINT
# ============================================================================
# Matches the notebook-detection pattern from existing scripts:
# - If running as a script: uses __main__ block
# - If in Jupyter/Colab: call main() directly with explicit paths

def main(
    hotspots_path="hotspots (1).csv",
    output_path="hotspots_with_road_context.csv",
    run_test=True,
    test_only=False,
    delay=0.3
):
    """
    Main entry point. Runs synthetic test first (if enabled), then enriches
    real data.
    
    Parameters
    ----------
    hotspots_path : str
        Path to the real hotspots CSV.
    output_path : str
        Path to write the enriched output.
    run_test : bool
        If True, run the synthetic test first.
    test_only : bool
        If True, only run the synthetic test (skip real data).
    delay : float
        Delay in seconds between OSM requests.
    """
    if run_test:
        run_synthetic_test()
    
    if not test_only:
        print("\n\n")
        enrich_hotspots_with_road_context(
            hotspots_path=hotspots_path,
            output_path=output_path,
            delay_between_requests=delay,
            test_mode=False
        )


if __name__ == "__main__":
    # For command-line use, run with defaults
    # For notebook use, call main() directly with custom paths
    main(
        hotspots_path="hotspots (1).csv",
        output_path="hotspots_with_road_context.csv",
        run_test=True,
        test_only=False,
        delay=0.3
    )
