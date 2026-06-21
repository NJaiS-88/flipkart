# 🚦 Bengaluru Parking Violations Hotspot Detection & Impact Scoring System

An end-to-end, AI-driven spatial analysis, time-series forecasting, and enforcement tracking system designed to transform raw traffic violations data into actionable, targeted policing intelligence.

This system takes massive unstructured parking violations records (nearly 250,000 logs from Bengaluru, India), applies spatial clustering and network theory to identify chronic risk areas, layers predictive models to forecast next-week violation counts, tracks enforcement campaign effectiveness, and visualizes everything inside a premium dark-themed glassmorphic MERN stack dashboard.

---

## 📂 Project Architecture & File Directory

```text
├── backend/                         # Express & MongoDB Node API Service
│   ├── server.js                    # REST API entry point and DB connection
│   ├── models.js                    # Mongoose database schemas (Hotspots, Violations, Offenders, StationLoad)
│   ├── seed.js                      # High-performance streaming CSV parser & database seeder
│   └── package.json                 # Backend dependencies & configuration
├── frontend/                        # React & Vite client application
│   ├── src/
│   │   ├── App.jsx                  # Main dashboard dashboard shell & tab navigation state
│   │   ├── index.css                # Custom glassmorphic CSS design system, typography & scrollbars
│   │   └── components/
│   │       ├── MapComponent.jsx     # Leaflet-based spatial visualization with CartoDB Dark tiles
│   │       └── DetailPanel.jsx      # Slide-out details, sub-filters, and violation drill-downs
│   ├── index.html                   # HTML entry point (Outfit + Inter fonts, viewport configurations)
│   └── package.json                 # Frontend dependencies & configuration
├── road_network_enrichment.py       # Stage 3a: OSMnx road metadata fetcher & impact-score multiplier
├── enforcement_outcome_tracking.py  # Stage 3b: Before-after enforcement effectiveness comparative tracker
├── severity_calibration.txt         # Statistical T-Test weight check output file
├── hotspots (1).csv                 # Stage 1: Core spatial clustering results (1,016 clusters)
├── hotspots (1).geojson             # GeoJSON version of spatial clusters for Leaflet mapping
├── violations_scored (1).csv        # Cleaned & weighted violations dataset (~248K records)
├── repeat_offenders.csv             # Aggegated repeat offending vehicle license numbers
├── station_load.csv                 # Aggregate workload metrics per police station jurisdiction
├── hotspot_anomalies.csv            # Stage 4a: Outlier Z-score spikes detected in weekly logs
├── hotspot_forecast.csv             # Stage 4b: Linear regression weekly trends & forecasts
└── README.md                        # This system documentation
```

---

## 🧠 Why It Was Done & Technical Decisions

### 1. Spatial Clustering: Fixed‑size 60 m × 60 m Grid Binning
- **The Problem**: DBSCAN was originally used, but the upstream Python pipeline now generates hotspots via a deterministic grid‑based binning approach, which guarantees consistent cluster boundaries and full coverage of the study area.
- **The Solution**: **Fixed‑size 60 m × 60 m grid binning** applied to the raw violation coordinates. Each grid cell aggregates violations and produces a hotspot record.
- **Parameters**: 
  - Cell width = 60 meters, cell height = 60 meters.
  - Minimum violations per cell = 1 (all populated cells become hotspots).
- **Data Flow**: The resulting hotspot records are saved to `hotspots_with_road_context_v3.csv` and are directly loaded by the MERN application; no clustering is performed at runtime.

### 2. Composite Hotspot Impact Scoring Formula
To avoid ranking hotspots solely by raw violation count (which treats a 2-minute minor infraction the same as an overnight obstruction), we designed a **Composite Hotspot Impact Score**:

$$\text{Violation Impact} = \text{Severity Weight} \times \text{Vehicle Weight} \times \text{Peak Hour Weight} \times \text{Junction Weight}$$

- **Severity Weight**: Calibrated by the urgency of the infraction (e.g., Double Parking/Obstruction $= 2.0$, Normal No Parking $= 1.0$).
- **Vehicle Weight**: Heavy commercial vehicles blocking a narrow street receive higher weight ($3.0$) than motorcycles ($1.0$).
- **Peak Hour Weight**: Violations during rush hours (08:00–11:00, 17:00–20:00) get a $1.5\times$ boost due to severe traffic spillover.
- **Junction Weight**: Violations within $50\text{m}$ of a major junction get a $1.3\times$ boost.
- **Recurrence Rate**: The ratio of active days to total days in the observation span:

$$\text{Recurrence Rate} = \frac{\text{Unique Days with Violations}}{\text{Total Days in Date Span}}$$

The final Hotspot Score is:

$$\text{Hotspot Impact Score} = \text{Sum of Violation Impacts} \times (1 + \text{Recurrence Rate})$$

*Why?* A location with 100 violations spread across 100 days is a systemic chronic hazard. A location with 100 violations on a single Sunday is a temporary event. The recurrence rate ensures chronic corridors rank higher.

### 3. OpenStreetMap (OSM) Road Network Enrichment (`road_network_enrichment.py`)
- **The Rationale**: A violation on a primary multi-lane arterial road causes massive economic and traffic delays compared to the same violation on a quiet residential street.
- **How It Works**: The script queries OpenStreetMap via `osmnx` for each hotspot’s coordinates, fetches the nearest highway segment, and extracts the highway class, lanes, and speed limit.
- **Multiplier Matrix**:
  - `residential` / `living_street` / `service` $= 1.0$ (baseline)
  - `tertiary` $= 1.3$
  - `secondary` $= 1.5$
  - `primary` $= 2.0$
  - `trunk` $= 2.5$
  - `motorway` $= 3.0$
- **Result**: Recalculates `hotspot_impact_score_v2 = hotspot_impact_score * road_class_weight` and re-ranks hotspots, pushing critical highway bottlenecks to the top of enforcement task queues.

### 4. Enforcement Outcome Tracker & Feedback Loop (`enforcement_outcome_tracking.py`)
- **The Rationale**: Policing requires accountability. We need a feedback loop showing whether a targeted enforcement campaign actually cleared a hotspot.
- **How It Works**: The script splits/compares violation counts before and after a specific enforcement date (default: `2024-02-01`), evaluating the percent change:
  - **Improved (Count decrease $\ge 20\%$):** Indicates highly effective enforcement.
  - **Worsened (Count increase $\ge 20\%$):** Signifies displacement or growing chronic problems.
  - **Stable (Within $\pm 20\%$):** No significant change.

### 5. Anomaly Detection & Trend Forecasting
- **Anomaly Detection**: Compares the latest week’s violation count against a historical average and standard deviation. Any week with $Z\text{-score} > 2.0$ is flagged as a `SPIKE` (indicating a temporary event, construction bottleneck, or rapid rise of a new chronic zone).
- **Trend Forecasting**: Utilizes a rolling time-series window to compute the regression slope. Highlights whether a hotspot's violations are `increasing`, `decreasing`, or `stable`, forecasting next week's counts to help dispatch officers proactively.

### 6. MERN Stack & UI Design Decisions
- **Database**: **MongoDB** was selected due to the unstructured and geo-spatial properties of the datasets. Geo-indexing is applied to `latitude`/`longitude` to speed up queries.
- **Seeding**: Raw violations file is extremely large ($\sim 95\text{MB}$). Seeding is implemented using Node's streaming `csv-parser` and bulk-inserted in batches of $10,000$ to prevent heap memory exhaustion.
- **Aesthetic UI**: Custom dark glassmorphic design system using Outfit & Inter typography. Clean visual hierarchy consisting of harmonious high-contrast colors (Neon Red for critical alerts, Cyan for focus states, Green for positive outcomes).
- **Leaflet Map Integration**: Marker sizes scale non-linearly with the cluster's impact score ($\text{radius} \propto \sqrt{\text{score}}$) to prevent map clutter, and colors indicate severity. Smooth zoom-fly-to animations trigger when clicking hotspots.

---

## 📊 Data Dictionary

### 1. Hotspots Dataset (`hotspots (1).csv`)
*   `cluster_id`: Unique identifier assigned by the upstream grid‑based binning process.
*   `violation_count`: Total number of violation logs in the cluster.
*   `avg_lat` / `avg_lon`: Center coordinate of the spatial cluster.
*   `total_impact`: Accumulated baseline severity weights of all points in the cluster.
*   `top_police_station`: The primary local police station jurisdiction.
*   `top_junction`: Nearest major intersection name.
*   `recurrence_rate`: Chronicity metric of the hotspot (0 to 1).
*   `hotspot_impact_score`: Combined score of total impact adjusted by recurrence.
*   `rank`: Order of priority (Rank #1 is the highest risk).

### 2. Enforcement Outcomes (`enforcement_outcome_report.csv`)
*   `violation_count_before`: Count of violations before the campaign.
*   `violation_count_after`: Count of violations after the campaign.
*   `percent_change`: Relative count difference percentage.
*   `outcome_flag`: Classification (`improved` / `worsened` / `no significant change`).
*   `impact_percent_change`: Change in total weighted traffic impact score.

### 3. Anomalies (`hotspot_anomalies.csv`)
*   `latest_week_count`: Count in the most recent week.
*   `historical_avg` / `historical_std`: Weekly baseline stats.
*   `z_score`: Number of standard deviations away from the mean.
*   `flag`: Actionable investigation trigger notice.

### 4. Forecasts (`hotspot_forecast.csv`)
*   `weeks_of_history`: Total active weeks observed.
*   `trend`: Heading direction (`increasing`, `decreasing`, `stable`).
*   `trend_slope`: Weekly growth rate slope coefficient.
*   `predicted_next_week`: Forecasted count of violations for the upcoming week.

---

## ⚡ Setup & Launch Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [MongoDB](https://www.mongodb.com/) running locally on `localhost:27017`

### 1. Seeding and Starting Backend
1. Open a terminal, navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the streaming seeder (this parses and merges hotspots, violations, repeat offenders, anomalies, and forecasts directly into MongoDB):
   ```bash
   npm run seed
   ```
4. Start the Express server:
   ```bash
   npm start
   ```
   The backend will start running on [http://localhost:5000](http://localhost:5000).

### 2. Starting Frontend
1. Open a new terminal, navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to [http://localhost:5173](http://localhost:5173).

---

## 🌐 Production Deployment Guide

### Backend (Render Deployment)
1. Register on [Render](https://render.com/).
2. Create a new **Web Service** and link it to your GitHub Repository.
3. Configure the following build settings:
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Under **Environment Variables**, add:
   - `MONGO_URI`: Your production MongoDB connection string (e.g., MongoDB Atlas Cluster).

### Frontend (Vercel Deployment)
1. Register on [Vercel](https://vercel.com/).
2. Create a new project, select the repository, and set:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
3. Under **Environment Variables**, add:
   - `VITE_API_URL`: Your hosted Render backend service URL (e.g., `https://your-backend-service.onrender.com`).
4. Click **Deploy**.
