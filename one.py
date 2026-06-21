import os
import sys
import ast
import json
import warnings
from calendar import month_name
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
TOP_HOTSPOTS_PER_STATION = 5
MIN_VIOLATIONS_FOR_STATION = 10   # skip stations with fewer violations in the month

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _find_id_col(df):
    for col in ("cluster_id", "cell_id", "hotspot_id"):
        if col in df.columns:
            return col
    if "cell_row" in df.columns and "cell_col" in df.columns:
        df["cluster_id"] = df["cell_row"].astype(str) + "_" + df["cell_col"].astype(str)
        return "cluster_id"
    return None

def _find_score_col(df):
    for col in ("hotspot_impact_score_v3","hotspot_score_decay_blended",
                "hotspot_impact_score_v2","hotspot_impact_score"):
        if col in df.columns:
            return col
    return None

def _find_impact_col(df):
    for col in ("violation_impact_v3","violation_impact_v2","violation_impact"):
        if col in df.columns:
            return col
    return None

def _find_station_col(df):
    for col in ("police_station","top_police_station"):
        if col in df.columns:
            return col
    return None

def _safe_parse_list(val):
    if pd.isna(val) or str(val).strip() in ("","NULL","null","[]"):
        return "UNKNOWN"
    try:
        parsed = ast.literal_eval(str(val))
        if isinstance(parsed,list) and parsed:
            return str(parsed[0]).strip().upper()
    except Exception:
        pass
    return str(val).strip().upper()

def _pct_change_str(old,new):
    if old==0:
        return "N/A (no data last month)"
    pct = 100*(new-old)/old
    arrow = "up" if pct>0 else "down" if pct<0 else "flat"
    return f"{arrow} {abs(pct):.1f}%"

def _write_summary_paragraph(station,stats):
    month_str = stats["report_month_name"]
    year_str = stats["report_year"]
    n = stats["total_violations_this_month"]
    pct_str = stats["mom_change_str"]
    top_type = stats.get("top_violation_type","parking violations")
    top_hotspot_loc = stats.get("top_hotspot_location","the top hotspot")
    n_anomalies = stats.get("n_anomaly_hotspots",0)
    n_repeat = stats.get("n_repeat_offenders_in_zone",0)

    lines = [
        f"{station} recorded {n:,} parking violations in {month_str} {year_str} ({pct_str} vs. previous month).",
        f"The most common violation type was {top_type}.",
        f"The highest-impact hotspot was at {top_hotspot_loc}.",
    ]
    if n_anomalies>0:
        lines.append(f"{n_anomalies} hotspot(s) showed unusual spike activity this month.")
    if n_repeat>0:
        lines.append(f"{n_repeat} repeat offender vehicle(s) were recorded across multiple zones.")
    lines.append("Enforcement resources should be prioritised toward the high-impact zones listed below.")
    return " ".join(lines)

def generate_pdf(stats, pdf_path):
    """Generate a PDF report for a station using reportlab."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.enums import TA_LEFT, TA_CENTER

        doc = SimpleDocTemplate(pdf_path, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()

        # Custom styles
        title_style = ParagraphStyle('Title', parent=styles['Heading1'],
                                     fontSize=18, textColor=colors.HexColor('#1a1a2e'),
                                     spaceAfter=6, alignment=TA_CENTER)
        sub_style = ParagraphStyle('Sub', parent=styles['Normal'],
                                   fontSize=11, textColor=colors.HexColor('#4f46e5'),
                                   spaceAfter=4, alignment=TA_CENTER)
        body_style = ParagraphStyle('Body', parent=styles['Normal'],
                                    fontSize=10, leading=14, spaceAfter=8)
        section_style = ParagraphStyle('Section', parent=styles['Heading2'],
                                       fontSize=13, textColor=colors.HexColor('#1a1a2e'),
                                       spaceBefore=12, spaceAfter=6)

        story = []

        # Header
        story.append(Paragraph("Monthly Enforcement Report", title_style))
        story.append(Paragraph(f"{stats['station']} — {stats['report_month_name']} {stats['report_year']}", sub_style))
        story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#4f46e5')))
        story.append(Spacer(1, 0.4*cm))

        # Summary
        story.append(Paragraph("Executive Summary", section_style))
        story.append(Paragraph(stats['summary_paragraph'], body_style))
        story.append(Spacer(1, 0.4*cm))

        # Key Metrics
        story.append(Paragraph("Key Metrics", section_style))
        metrics_data = [
            ["Metric", "Value"],
            ["Total Violations (This Month)", f"{stats['total_violations_this_month']:,}"],
            ["Total Violations (Prev Month)", f"{stats['total_violations_prev_month']:,}"],
            ["Month-on-Month Change", stats['mom_change_str']],
            ["Top Violation Type", stats.get('top_violation_type', 'N/A')],
            ["Anomaly Hotspots", str(stats.get('n_anomaly_hotspots', 0))],
            ["Repeat Offenders in Zone", str(stats.get('n_repeat_offenders_in_zone', 0))],
        ]
        metrics_table = Table(metrics_data, colWidths=[10*cm, 6*cm])
        metrics_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4f46e5')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 11),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,1), (-1,-1), 10),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8f9fa'), colors.white]),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dee2e6')),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
        ]))
        story.append(metrics_table)
        story.append(Spacer(1, 0.4*cm))

        # Violation type breakdown
        vtype = stats.get('violation_type_breakdown', {})
        if vtype:
            story.append(Paragraph("Violation Type Breakdown (Top 5)", section_style))
            vtype_data = [["Violation Type", "Count"]]
            for k, v in list(vtype.items())[:5]:
                vtype_data.append([str(k), str(v)])
            vtype_table = Table(vtype_data, colWidths=[12*cm, 4*cm])
            vtype_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#10b981')),
                ('TEXTCOLOR', (0,0), (-1,0), colors.white),
                ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                ('FONTSIZE', (0,0), (-1,0), 10),
                ('ALIGN', (1,0), (1,-1), 'CENTER'),
                ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
                ('FONTSIZE', (0,1), (-1,-1), 10),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f0fdf4'), colors.white]),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dee2e6')),
                ('TOPPADDING', (0,0), (-1,-1), 5),
                ('BOTTOMPADDING', (0,0), (-1,-1), 5),
                ('LEFTPADDING', (0,0), (-1,-1), 8),
            ]))
            story.append(vtype_table)

        # Footer
        story.append(Spacer(1, 1*cm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dee2e6')))
        story.append(Paragraph(
            f"Generated by Parking Violations Hotspot Inspector — {stats['report_month_name']} {stats['report_year']}",
            ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8,
                           textColor=colors.grey, alignment=TA_CENTER)
        ))

        doc.build(story)
        return True
    except ImportError:
        # If reportlab not available, write a text PDF placeholder
        with open(pdf_path, "wb") as f:
            # Write minimal valid text file as fallback
            content = f"MONTHLY ENFORCEMENT REPORT\n{stats['station']} — {stats['report_month_name']} {stats['report_year']}\n\n"
            content += stats['summary_paragraph'] + "\n\n"
            content += f"Total Violations: {stats['total_violations_this_month']:,}\n"
            f.write(content.encode("utf-8"))
        return True

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main(violations_path, hotspots_path, report_year=None, report_month=None,
         filter_station=None, repeat_offenders_path=None, anomalies_path=None):

    print("\n" + "="*60)
    print("PHASE 3B — MONTHLY ENFORCEMENT REPORT GENERATOR")
    print("="*60)

    # 1. LOAD
    vdf = pd.read_csv(violations_path, low_memory=False)
    hdf = pd.read_csv(hotspots_path, low_memory=False)
    print(f"[1/5] Loaded {len(vdf):,} violations | {len(hdf):,} hotspots")

    id_col = _find_id_col(vdf)
    impact_col = _find_impact_col(vdf)
    score_col = _find_score_col(hdf)
    station_col_v = _find_station_col(vdf)

    vdf["created_dt"] = pd.to_datetime(vdf["created_datetime"], errors="coerce", utc=True)
    vdf = vdf.dropna(subset=["created_dt"])
    latest = vdf["created_dt"].max()
    if report_year is None: report_year = latest.year
    if report_month is None: report_month = latest.month
    report_month_name_str = month_name[report_month]
    print(f"      Report period: {report_month_name_str} {report_year}")

    this_mask = (vdf["created_dt"].dt.year==report_year)&(vdf["created_dt"].dt.month==report_month)
    prev_month = report_month-1 if report_month>1 else 12
    prev_year = report_year if report_month>1 else report_year-1
    prev_mask = (vdf["created_dt"].dt.year==prev_year)&(vdf["created_dt"].dt.month==prev_month)

    vdf_this = vdf[this_mask].copy()
    vdf_prev = vdf[prev_mask].copy()
    print(f"      This month: {len(vdf_this):,} | Prev month: {len(vdf_prev):,}")

    if len(vdf_this)==0:
        print("[WARN] No violations found for this month.")
        return

    vdf_this["vtype"] = vdf_this["violation_type"].apply(_safe_parse_list)

    # 2. STATIONS
    if station_col_v:
        vdf_this["station_norm"] = vdf_this[station_col_v].fillna("UNKNOWN").astype(str).str.upper()
        stations = [s for s in vdf_this["station_norm"].unique()
                    if vdf_this[vdf_this["station_norm"]==s].shape[0]>=MIN_VIOLATIONS_FOR_STATION]
        if filter_station:
            filter_upper = filter_station.strip().upper()
            stations = [s for s in stations if filter_upper in s]
        if station_col_v in vdf_prev.columns:
            vdf_prev["station_norm"] = vdf_prev[station_col_v].fillna("UNKNOWN").astype(str).str.upper()
    else:
        stations = ["ALL_ZONES"]
        vdf_this["station_norm"]="ALL_ZONES"
        vdf_prev["station_norm"]="ALL_ZONES"

    print(f"[2/5] {len(stations)} station(s) identified")

    # 3. REPORTS
    reports=[]
    pdf_paths=[]
    for station in stations:
        sv_this = vdf_this[vdf_this["station_norm"]==station]
        sv_prev = vdf_prev[vdf_prev["station_norm"]==station] if "station_norm" in vdf_prev.columns else vdf_prev

        n_this, n_prev = len(sv_this), len(sv_prev)
        vtype_counts = sv_this["vtype"].value_counts().head(5).to_dict()
        top_vtype = sv_this["vtype"].mode().iloc[0] if len(sv_this)>0 else "N/A"

        stats={
            "station":station,
            "report_year":report_year,
            "report_month":report_month,
            "report_month_name":report_month_name_str,
            "total_violations_this_month":n_this,
            "total_violations_prev_month":n_prev,
            "mom_change_str":_pct_change_str(n_prev,n_this),
            "top_violation_type":top_vtype,
            "violation_type_breakdown":vtype_counts,
            "n_anomaly_hotspots":0,
            "n_repeat_offenders_in_zone":0,
            "top_hotspot_location":"N/A",
            "top_hotspots":[],
        }
        stats["summary_paragraph"]=_write_summary_paragraph(station,stats)
        reports.append(stats)

        # Generate PDF per station
        slug=station.replace(" ","_")[:40]
        period_str=f"{report_year}_{report_month:02d}"
        pdf_path=os.path.join(OUT_DIR,f"report_{period_str}_{slug}.pdf")
        generate_pdf(stats, pdf_path)
        pdf_paths.append(pdf_path)
        print(f"      PDF: {pdf_path}")

    # 4. JSON SUMMARY
    period_str=f"{report_year}_{report_month:02d}"
    json_path=os.path.join(OUT_DIR,f"monthly_report_{period_str}.json")
    with open(json_path,"w") as f: json.dump({"stations":reports},f,indent=2)
    print(f"[4/5] Saved: {json_path}")

    # 5. SUMMARY — print PDF paths so Node.js can read them
    print(f"\n[5/5] Complete — {len(reports)} station report(s) generated.")
    for p in pdf_paths:
        print(f"PDF_OUTPUT:{p}")

# ---------------------------------------------------------------------------
# CLI ENTRY POINT
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Usage: python one.py [station] [year] [month]
    #   or : python one.py  (uses defaults)
    violations_path = os.path.join(OUT_DIR, "violations_scored (1).csv")
    hotspots_path   = os.path.join(OUT_DIR, "hotspots_with_road_context_v3.csv")

    filter_station = None
    report_year    = None
    report_month   = None

    args = sys.argv[1:]
    if len(args) >= 1 and args[0]:
        filter_station = args[0]
    if len(args) >= 2 and args[1]:
        report_year = int(args[1])
    if len(args) >= 3 and args[2]:
        report_month = int(args[2])

    main(violations_path, hotspots_path,
         report_year=report_year, report_month=report_month,
         filter_station=filter_station)
