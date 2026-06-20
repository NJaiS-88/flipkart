"""
ENFORCEMENT OUTCOME TRACKING / BEFORE-AFTER FEEDBACK LOOP (Stage 3b)
=====================================================================
Purpose: Compare two violations_scored.csv snapshots from different time
periods (e.g. "before enforcement" vs "after enforcement", or month-over-month)
to measure whether violation counts at each hotspot have increased, decreased,
or stayed the same. This is the proof-of-impact feedback loop for the system.

Inputs:
  - violations_before.csv — violations snapshot from the "before" period
  - violations_after.csv  — violations snapshot from the "after" period
  - hotspots.csv          — hotspot definitions (for metadata: police_station, junction, etc.)

Output:
  - enforcement_outcome_report.csv — per-cluster_id comparison with:
      cluster_id, rank, police_station, junction,
      violation_count_before, violation_count_after,
      percent_change, outcome_flag ("improved" / "worsened" / "no significant change"),
      impact_before, impact_after, impact_percent_change

Design decisions:
  - "improved" = >=20% decrease in violation count
  - "worsened" = >=20% increase in violation count
  - "no significant change" = everything else (within ±20%)
  - Threshold of 20% is configurable via parameter
  - Handles clusters that appear in only one period (new hotspot / cleared hotspot)
  - Groups summary by top-N ranked hotspots for executive reporting

Known limitations:
  - This is a simple count comparison — it does not control for external factors
    (seasonality, weather, holidays, camera downtime, etc.)
  - For a rigorous causal analysis, a difference-in-differences or synthetic control
    approach would be needed. This is a practical first step.
  - The script assumes both CSVs have the same schema as violations_scored.csv

Author: AI Assistant (building on parking_hotspot_ml.py pipeline)
"""

import pandas as pd
import numpy as np
import os
from pathlib import Path


def compute_enforcement_outcomes(
    violations_before_path,
    violations_after_path,
    hotspots_path="hotspots (1).csv",
    output_path="enforcement_outcome_report.csv",
    improvement_threshold=0.20,
    top_n_summary=20
):
    """
    Compare two violation snapshots and compute per-hotspot outcome metrics.
    
    Parameters
    ----------
    violations_before_path : str
        Path to the "before" violations CSV (must have cluster_id, violation_impact columns).
    violations_after_path : str
        Path to the "after" violations CSV (same schema).
    hotspots_path : str
        Path to hotspots CSV (for metadata like rank, police_station, junction).
    output_path : str
        Path to write the outcome report CSV.
    improvement_threshold : float
        Fractional threshold for improvement/worsening classification.
        Default 0.20 = 20%. A hotspot is "improved" if violations decreased by
        >= this fraction, "worsened" if increased by >= this fraction.
    top_n_summary : int
        Number of top-ranked hotspots to include in the executive summary.
    
    Returns
    -------
    report_df : pd.DataFrame
        The full outcome report.
    """
    print("=" * 60)
    print("ENFORCEMENT OUTCOME TRACKING")
    print("Before-After Feedback Loop Analysis")
    print("=" * 60)
    
    # ---------------------------------------------------------------
    # 1. Load data
    # ---------------------------------------------------------------
    print(f"\nLoading data...")
    
    # For large violations CSVs, only load the columns we need
    needed_violation_cols = ["cluster_id", "violation_impact"]
    
    # Try to load with just needed columns (faster for large files)
    try:
        viol_before = pd.read_csv(violations_before_path, usecols=needed_violation_cols)
    except ValueError:
        # If columns don't exist, load all and check
        viol_before = pd.read_csv(violations_before_path)
        for col in needed_violation_cols:
            if col not in viol_before.columns:
                raise ValueError(
                    f"Column '{col}' not found in {violations_before_path}. "
                    f"Available columns: {list(viol_before.columns)}"
                )
        viol_before = viol_before[needed_violation_cols]
    
    try:
        viol_after = pd.read_csv(violations_after_path, usecols=needed_violation_cols)
    except ValueError:
        viol_after = pd.read_csv(violations_after_path)
        for col in needed_violation_cols:
            if col not in viol_after.columns:
                raise ValueError(
                    f"Column '{col}' not found in {violations_after_path}. "
                    f"Available columns: {list(viol_after.columns)}"
                )
        viol_after = viol_after[needed_violation_cols]
    
    hotspots = pd.read_csv(hotspots_path)
    
    print(f"  Before period: {len(viol_before):,} violation records")
    print(f"  After period:  {len(viol_after):,} violation records")
    print(f"  Hotspots:      {len(hotspots):,} clusters")
    
    # ---------------------------------------------------------------
    # 2. Filter out noise (cluster_id = -1 means unassigned/noise)
    # ---------------------------------------------------------------
    viol_before = viol_before[viol_before["cluster_id"] != -1].copy()
    viol_after = viol_after[viol_after["cluster_id"] != -1].copy()
    
    print(f"  After noise filter: {len(viol_before):,} before, {len(viol_after):,} after")
    
    # ---------------------------------------------------------------
    # 3. Aggregate per cluster_id
    # ---------------------------------------------------------------
    before_agg = viol_before.groupby("cluster_id").agg(
        violation_count_before=("cluster_id", "count"),
        impact_before=("violation_impact", "sum")
    ).reset_index()
    
    after_agg = viol_after.groupby("cluster_id").agg(
        violation_count_after=("cluster_id", "count"),
        impact_after=("violation_impact", "sum")
    ).reset_index()
    
    # ---------------------------------------------------------------
    # 4. Merge with hotspot metadata
    # ---------------------------------------------------------------
    # Start from hotspots table to get rank, police_station, junction info
    hotspot_meta = hotspots[["cluster_id", "rank", "top_police_station", "top_junction",
                             "hotspot_impact_score"]].copy()
    hotspot_meta.rename(columns={
        "top_police_station": "police_station",
        "top_junction": "junction"
    }, inplace=True)
    
    # Full outer merge: include clusters that appear in before, after, or both
    merged = hotspot_meta.merge(before_agg, on="cluster_id", how="outer")
    merged = merged.merge(after_agg, on="cluster_id", how="outer")
    
    # Fill NaN counts with 0 (cluster not seen in that period)
    merged["violation_count_before"] = merged["violation_count_before"].fillna(0).astype(int)
    merged["violation_count_after"] = merged["violation_count_after"].fillna(0).astype(int)
    merged["impact_before"] = merged["impact_before"].fillna(0.0)
    merged["impact_after"] = merged["impact_after"].fillna(0.0)
    
    # ---------------------------------------------------------------
    # 5. Compute metrics
    # ---------------------------------------------------------------
    # Percent change in violation count
    # Handle division by zero: if before=0 and after>0, that's a "new" hotspot (100% increase)
    # If before=0 and after=0, that's 0% change
    def safe_pct_change(before, after):
        if before == 0 and after == 0:
            return 0.0
        elif before == 0:
            return 1.0  # 100% increase (new violations appeared)
        else:
            return (after - before) / before
    
    merged["percent_change"] = merged.apply(
        lambda row: safe_pct_change(row["violation_count_before"], row["violation_count_after"]),
        axis=1
    )
    
    merged["impact_percent_change"] = merged.apply(
        lambda row: safe_pct_change(row["impact_before"], row["impact_after"]),
        axis=1
    )
    
    # Classify outcome
    def classify_outcome(pct_change, count_before, count_after):
        """
        Classify as improved/worsened/no significant change.
        
        Edge cases:
        - If both counts are 0 → "no significant change" (nothing to compare)
        - If before=0 and after>0 → "worsened" (new hotspot)
        - If before>0 and after=0 → "improved" (cleared!)
        """
        if count_before == 0 and count_after == 0:
            return "no significant change"
        elif pct_change <= -improvement_threshold:
            return "improved"
        elif pct_change >= improvement_threshold:
            return "worsened"
        else:
            return "no significant change"
    
    merged["outcome_flag"] = merged.apply(
        lambda row: classify_outcome(
            row["percent_change"],
            row["violation_count_before"],
            row["violation_count_after"]
        ),
        axis=1
    )
    
    # Round for readability
    merged["percent_change"] = (merged["percent_change"] * 100).round(1)
    merged["impact_percent_change"] = (merged["impact_percent_change"] * 100).round(1)
    merged["impact_before"] = merged["impact_before"].round(2)
    merged["impact_after"] = merged["impact_after"].round(2)
    
    # Sort by rank (if available), then by absolute change magnitude
    merged["rank"] = merged["rank"].fillna(9999).astype(int)
    merged = merged.sort_values("rank").reset_index(drop=True)
    
    # ---------------------------------------------------------------
    # 6. Save output
    # ---------------------------------------------------------------
    output_cols = [
        "cluster_id", "rank", "police_station", "junction",
        "violation_count_before", "violation_count_after",
        "percent_change", "outcome_flag",
        "impact_before", "impact_after", "impact_percent_change",
        "hotspot_impact_score"
    ]
    
    # Only include columns that exist (some may be NaN for non-hotspot clusters)
    available_cols = [c for c in output_cols if c in merged.columns]
    report = merged[available_cols].copy()
    
    report.to_csv(output_path, index=False)
    
    # ---------------------------------------------------------------
    # 7. Print summary
    # ---------------------------------------------------------------
    print(f"\n{'=' * 60}")
    print(f"OUTPUT: {output_path}")
    print(f"{'=' * 60}")
    
    total_clusters = len(report)
    improved = len(report[report["outcome_flag"] == "improved"])
    worsened = len(report[report["outcome_flag"] == "worsened"])
    unchanged = len(report[report["outcome_flag"] == "no significant change"])
    
    print(f"\nOVERALL SUMMARY ({total_clusters} clusters analyzed):")
    print(f"  ✅ Improved (≥{improvement_threshold*100:.0f}% decrease):         {improved:,} clusters")
    print(f"  ❌ Worsened (≥{improvement_threshold*100:.0f}% increase):         {worsened:,} clusters")
    print(f"  ➖ No significant change (within ±{improvement_threshold*100:.0f}%): {unchanged:,} clusters")
    
    # Top-N summary
    top_n = report[report["rank"] <= top_n_summary].copy()
    if len(top_n) > 0:
        top_improved = len(top_n[top_n["outcome_flag"] == "improved"])
        top_worsened = len(top_n[top_n["outcome_flag"] == "worsened"])
        top_unchanged = len(top_n[top_n["outcome_flag"] == "no significant change"])
        
        print(f"\nTOP {top_n_summary} HOTSPOTS SUMMARY:")
        print(f"  ✅ {top_improved} improved, "
              f"❌ {top_worsened} worsened, "
              f"➖ {top_unchanged} unchanged")
        
        # Show details for top-N
        print(f"\n{'Rank':>5} {'Cluster':>8} {'Before':>8} {'After':>8} "
              f"{'%Change':>9} {'Outcome':>22} {'Station':>20}")
        print("-" * 85)
        for _, r in top_n.iterrows():
            station = str(r.get("police_station", "N/A"))[:20]
            print(f"{int(r['rank']):>5} {int(r['cluster_id']):>8} "
                  f"{int(r['violation_count_before']):>8} {int(r['violation_count_after']):>8} "
                  f"{r['percent_change']:>8.1f}% {r['outcome_flag']:>22} {station:>20}")
    
    # Aggregate impact change
    total_impact_before = report["impact_before"].sum()
    total_impact_after = report["impact_after"].sum()
    if total_impact_before > 0:
        total_impact_change = ((total_impact_after - total_impact_before) / total_impact_before) * 100
        print(f"\nAGGREGATE IMPACT:")
        print(f"  Total impact before: {total_impact_before:,.1f}")
        print(f"  Total impact after:  {total_impact_after:,.1f}")
        print(f"  Change:              {total_impact_change:+.1f}%")
    
    return report


# ============================================================================
# SYNTHETIC TEST — validate the pipeline with controlled data
# ============================================================================
def run_synthetic_test():
    """
    Create synthetic before/after violation datasets and a hotspots file,
    then run the enforcement outcome analysis to verify correctness.
    """
    print("\n" + "=" * 60)
    print("SYNTHETIC TEST — Enforcement Outcome Tracking")
    print("=" * 60)
    
    # Create synthetic hotspots
    hotspots_data = pd.DataFrame({
        "cluster_id":            [101, 102, 103, 104, 105, 106],
        "violation_count":       [100, 80,  60,  40,  20,  10],
        "avg_lat":               [12.97, 12.96, 12.95, 12.94, 12.93, 12.92],
        "avg_lon":               [77.59, 77.58, 77.57, 77.56, 77.55, 77.54],
        "total_impact":          [200, 160, 120, 80, 40, 20],
        "avg_impact":            [2.0, 2.0, 2.0, 2.0, 2.0, 2.0],
        "top_police_station":    ["StationA", "StationB", "StationC", "StationD", "StationE", "StationF"],
        "top_junction":          ["Junction1", "Junction2", "Junction3", "Junction4", "Junction5", "Junction6"],
        "date_span_days":        [30, 30, 30, 30, 30, 30],
        "unique_days":           [25, 20, 15, 10, 5, 3],
        "dominant_violation":    ["NO PARKING"] * 6,
        "recurrence_rate":       [0.83, 0.67, 0.50, 0.33, 0.17, 0.10],
        "hotspot_impact_score":  [180, 130, 90, 60, 30, 15],
        "rank":                  [1, 2, 3, 4, 5, 6],
    })
    
    # Create synthetic "before" violations
    # Cluster 101: 50 violations (will decrease → improved)
    # Cluster 102: 40 violations (will stay same → no change)
    # Cluster 103: 30 violations (will increase → worsened)
    # Cluster 104: 20 violations (will be cleared → improved)
    # Cluster 105: 10 violations (will stay same)
    # Cluster 106: 0 violations in before (will appear in after → worsened/new)
    np.random.seed(42)
    before_records = []
    violations_per_cluster_before = {101: 50, 102: 40, 103: 30, 104: 20, 105: 10}
    for cid, count in violations_per_cluster_before.items():
        for i in range(count):
            before_records.append({
                "cluster_id": cid,
                "violation_impact": round(np.random.uniform(0.5, 3.0), 2)
            })
    viol_before_df = pd.DataFrame(before_records)
    
    # Create synthetic "after" violations
    # Cluster 101: 30 violations (decreased 40% → improved ✅)
    # Cluster 102: 38 violations (decreased 5%  → no change ➖)
    # Cluster 103: 45 violations (increased 50% → worsened ❌)
    # Cluster 104: 0  violations (cleared!       → improved ✅)
    # Cluster 105: 11 violations (increased 10%  → no change ➖)
    # Cluster 106: 15 violations (new hotspot!   → worsened ❌)
    after_records = []
    violations_per_cluster_after = {101: 30, 102: 38, 103: 45, 105: 11, 106: 15}
    for cid, count in violations_per_cluster_after.items():
        for i in range(count):
            after_records.append({
                "cluster_id": cid,
                "violation_impact": round(np.random.uniform(0.5, 3.0), 2)
            })
    viol_after_df = pd.DataFrame(after_records)
    
    # Save synthetic data
    test_hotspots_path = "test_hotspots_enforcement.csv"
    test_before_path = "test_violations_before.csv"
    test_after_path = "test_violations_after.csv"
    test_output_path = "test_enforcement_outcome.csv"
    
    hotspots_data.to_csv(test_hotspots_path, index=False)
    viol_before_df.to_csv(test_before_path, index=False)
    viol_after_df.to_csv(test_after_path, index=False)
    
    print(f"\nCreated synthetic test files:")
    print(f"  Hotspots:  {test_hotspots_path} ({len(hotspots_data)} clusters)")
    print(f"  Before:    {test_before_path} ({len(viol_before_df)} violations)")
    print(f"  After:     {test_after_path} ({len(viol_after_df)} violations)")
    
    print("\nExpected outcomes:")
    print("  Cluster 101: 50 → 30 (-40%) → IMPROVED")
    print("  Cluster 102: 40 → 38 (-5%)  → NO CHANGE")
    print("  Cluster 103: 30 → 45 (+50%) → WORSENED")
    print("  Cluster 104: 20 → 0  (-100%)→ IMPROVED")
    print("  Cluster 105: 10 → 11 (+10%) → NO CHANGE")
    print("  Cluster 106: 0  → 15 (new)  → WORSENED")
    
    # Run analysis
    report = compute_enforcement_outcomes(
        violations_before_path=test_before_path,
        violations_after_path=test_after_path,
        hotspots_path=test_hotspots_path,
        output_path=test_output_path,
        improvement_threshold=0.20,
        top_n_summary=6
    )
    
    # Validate
    print(f"\n{'=' * 60}")
    print("SYNTHETIC TEST VALIDATION")
    print(f"{'=' * 60}")
    
    # Check outcomes match expected
    expected = {
        101: "improved",
        102: "no significant change",
        103: "worsened",
        104: "improved",
        105: "no significant change",
        106: "worsened",
    }
    
    all_passed = True
    for cid, expected_outcome in expected.items():
        row = report[report["cluster_id"] == cid]
        if len(row) == 0:
            print(f"  ❌ Cluster {cid}: NOT FOUND in report")
            all_passed = False
            continue
        actual_outcome = row.iloc[0]["outcome_flag"]
        status = "✅" if actual_outcome == expected_outcome else "❌"
        if actual_outcome != expected_outcome:
            all_passed = False
        print(f"  {status} Cluster {cid}: expected='{expected_outcome}', got='{actual_outcome}'")
    
    if all_passed:
        print(f"\n✅ All assertions passed!")
    else:
        print(f"\n❌ Some assertions FAILED — check logic.")
    
    # Cleanup test files
    for f in [test_hotspots_path, test_before_path, test_after_path]:
        os.remove(f)
    print(f"✅ Cleaned up test input files. Output preserved: {test_output_path}")
    
    return report


# ============================================================================
# TIME-BASED SPLIT HELPER
# ============================================================================
def split_violations_by_date(
    violations_path,
    split_date,
    before_output="violations_before_split.csv",
    after_output="violations_after_split.csv"
):
    """
    Convenience helper: split a single violations_scored.csv into two time
    periods around a given date. Useful when you don't have separate before/after
    files — just split the existing data by date.
    
    Parameters
    ----------
    violations_path : str
        Path to the full violations_scored CSV.
    split_date : str
        Date string (e.g. "2024-02-01") to split on. Violations before this
        date go to the "before" file, violations on/after go to "after".
    before_output : str
        Output path for the before-period violations.
    after_output : str
        Output path for the after-period violations.
    
    Returns
    -------
    tuple : (before_count, after_count)
    """
    print(f"\nSplitting violations by date: {split_date}")
    print(f"  Loading: {violations_path}")
    
    # Only load needed columns + created_datetime for efficiency
    df = pd.read_csv(
        violations_path,
        usecols=["cluster_id", "violation_impact", "created_datetime"]
    )
    
    df["created_datetime"] = pd.to_datetime(df["created_datetime"], utc=True)
    split_dt = pd.to_datetime(split_date, utc=True)
    
    before = df[df["created_datetime"] < split_dt][["cluster_id", "violation_impact"]]
    after = df[df["created_datetime"] >= split_dt][["cluster_id", "violation_impact"]]
    
    before.to_csv(before_output, index=False)
    after.to_csv(after_output, index=False)
    
    print(f"  Before ({split_date}): {len(before):,} violations → {before_output}")
    print(f"  After  ({split_date}): {len(after):,} violations → {after_output}")
    
    return len(before), len(after)


# ============================================================================
# NOTEBOOK-SAFE ENTRY POINT
# ============================================================================
def main(
    violations_before_path=None,
    violations_after_path=None,
    hotspots_path="hotspots (1).csv",
    output_path="enforcement_outcome_report.csv",
    # If you don't have separate before/after files, use these:
    single_violations_path=None,
    split_date=None,
    run_test=True,
    test_only=False,
    improvement_threshold=0.20,
    top_n_summary=20
):
    """
    Main entry point.
    
    Usage modes:
    1. Two separate files:
       main(violations_before_path="before.csv", violations_after_path="after.csv")
    
    2. Single file split by date:
       main(single_violations_path="violations_scored (1).csv", split_date="2024-02-01")
    
    3. Test only:
       main(test_only=True)
    """
    if run_test:
        run_synthetic_test()
    
    if test_only:
        return
    
    # If single file + split date provided, split first
    if single_violations_path and split_date:
        before_path = "violations_before_split.csv"
        after_path = "violations_after_split.csv"
        split_violations_by_date(
            single_violations_path, split_date,
            before_output=before_path,
            after_output=after_path
        )
        violations_before_path = before_path
        violations_after_path = after_path
    
    if violations_before_path and violations_after_path:
        print("\n\n")
        compute_enforcement_outcomes(
            violations_before_path=violations_before_path,
            violations_after_path=violations_after_path,
            hotspots_path=hotspots_path,
            output_path=output_path,
            improvement_threshold=improvement_threshold,
            top_n_summary=top_n_summary
        )
    elif not run_test:
        print("\n⚠️  No violation files specified. Use one of:")
        print("  main(violations_before_path='before.csv', violations_after_path='after.csv')")
        print("  main(single_violations_path='violations_scored (1).csv', split_date='2024-02-01')")


if __name__ == "__main__":
    # Default: run test, then split real data by date and analyze
    # Adjust the split_date to match your enforcement action timeline
    main(
        single_violations_path="violations_scored (1).csv",
        split_date="2024-02-01",
        hotspots_path="hotspots (1).csv",
        output_path="enforcement_outcome_report.csv",
        run_test=True,
        test_only=False,
        improvement_threshold=0.20,
        top_n_summary=20
    )
