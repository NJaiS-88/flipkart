# Parking Violations Hotspot Inspector
## Data-Driven Targeted Enforcement & Feedback Loop System

A full-stack web application for Bengaluru traffic enforcement — featuring hotspot detection, patrol route optimisation, monthly enforcement reports, repeat offender tracking, and enforcement outcome analytics.

---

## 🗂 Project Structure

```
├── frontend/               # React + Vite (deploy to Vercel)
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapComponent.jsx       # Leaflet hotspot map
│   │   │   ├── DetailPanel.jsx        # Hotspot detail + violations chart
│   │   │   ├── PatrolRoutes.jsx       # TSP patrol route UI
│   │   │   └── ReportDashboard.jsx    # Monthly PDF report UI
│   │   ├── App.jsx                    # Main dashboard + nav tabs
│   │   └── index.css                  # Dark glassmorphism design system
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── backend/                # Node.js + Express + MongoDB (deploy to Render)
│   ├── server.js           # REST API (10 endpoints)
│   ├── models.js           # Mongoose schemas
│   ├── seed.js             # CSV → MongoDB data loader
│   ├── patrolOptimizer.js  # (legacy JS TSP — replaced by two.py)
│   └── package.json
│
├── one.py                  # Phase 3B: Monthly enforcement report generator (PDF)
├── two.py                  # Phase 3A: Patrol route optimizer (TSP + KMeans)
├── requirements.txt        # Python dependencies
├── hotspots_with_road_context_v3.csv   # Hotspot dataset (input for two.py)
├── violations_scored (1).csv           # Violations dataset (input for one.py)
└── .env.example            # Environment variable template
```

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Leaflet, Lucide React |
| Backend | Node.js, Express 4, MongoDB Atlas, Mongoose 8 |
| Python | pandas, numpy, scikit-learn, reportlab |
| Deployment | Vercel (frontend) + Render (backend) |
| Database | MongoDB Atlas (cloud) |

---

## ⚙️ Features

- **🗺 Hotspot Map** — Interactive Leaflet map with violation density clusters ranked by impact score v3
- **📊 Detail Panel** — Per-hotspot analytics: vehicle type breakdown, before/after enforcement, trend chart
- **🚔 Patrol Route Optimizer** — `two.py` generates TSP-optimised routes with KMeans officer clustering for Morning/Afternoon/Evening/Night shifts
- **📄 Monthly Reports** — `one.py` generates per-station PDF enforcement reports with violation trends and repeat offender counts, saved to MongoDB
- **🔁 Enforcement Outcomes** — Pre vs. post enforcement comparison with % change and outcome flags
- **👮 Station Workloads** — Jurisdiction-level violation density and hotspot counts
- **🚗 Repeat Offender Registry** — Searchable registry of high-frequency violator vehicles
- **⚖️ Severity Calibration** — Statistical T-test validation of impact score model

---

## 🛠 Local Development

### Prerequisites
- Node.js 18+
- Python 3.10+
- MongoDB (local or Atlas)

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 2. Backend setup
```bash
cd backend
cp ../.env.example .env
# Edit .env with your MONGO_URI
npm install
node seed.js          # Load CSV data into MongoDB (run once)
npm start             # Start API server on :5000
```

### 3. Frontend setup
```bash
cd frontend
cp .env.example .env.local
# Set VITE_API_URL=http://localhost:5000
npm install
npm run dev           # Start dev server on :5173
```

---

## 🌐 Deployment

### Frontend → Vercel

1. Push repo to GitHub
2. Import project in [vercel.com](https://vercel.com)
3. Set **Root Directory** to `frontend`
4. Set **Build Command** to `npm run build`
5. Set **Output Directory** to `dist`
6. Add Environment Variable:
   ```
   VITE_API_URL = https://your-render-backend.onrender.com
   ```
7. Deploy ✅

### Backend → Render

1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repo
3. Set **Root Directory** to `backend`
4. Set **Build Command** to `npm install`
5. Set **Start Command** to `npm start`
6. Add Environment Variables:
   ```
   MONGO_URI     = mongodb+srv://user:pass@cluster.mongodb.net/parking_db
   PORT          = 5000
   FRONTEND_URL  = https://your-vercel-app.vercel.app
   PYTHON_PATH   = python3
   ```
7. Under **Advanced → Python**, ensure Python 3.10+ is available (Render includes it by default)
8. Deploy ✅

> **Note:** `one.py` and `two.py` are called as subprocess by the backend. They require the CSV files to be present in the backend's working directory on Render. Upload them via Render Disk or use MongoDB GridFS for large datasets.

### Python Scripts on Render

The backend calls these scripts via `execFile("python", ...)`. On Render, Python 3 is available as `python3`. If `python` isn't found, set the env var `PYTHON_PATH=python3` and update `server.js` to use `process.env.PYTHON_PATH || "python"`.

---

## 🔧 Environment Variables

### Backend (`backend/.env`)
```env
MONGO_URI=mongodb://127.0.0.1:27017/parking_db
PORT=5000
FRONTEND_URL=http://localhost:5173
PYTHON_PATH=python
```

### Frontend (`frontend/.env.local`)
```env
VITE_API_URL=http://localhost:5000
```

---

## 📜 Python Scripts

### `one.py` — Monthly Enforcement Report Generator

Generates per-station PDF enforcement reports from violations data.

```bash
# Generate report for all stations (latest month)
python one.py

# Generate report for specific station, year, month
python one.py "Shivajinagar" 2024 3
```

**Output:** `report_YYYY_MM_STATION.pdf` + `monthly_report_YYYY_MM.json`

**Requirements:** `pandas`, `numpy`, `reportlab`

---

### `two.py` — Patrol Route Optimizer

Generates TSP-optimised patrol routes using KMeans officer clustering and Nearest-Neighbour heuristic.

```bash
# Generate morning routes, 3 officers, top 15 hotspots, all zones
python two.py "" 3 15 morning

# Generate afternoon routes for Shivajinagar, 2 officers, top 10
python two.py "Shivajinagar" 2 10 afternoon
```

**Shift options:** `morning` (07–12), `afternoon` (12–17), `evening` (17–21), `night` (21–07)

**Output:** `patrol_routes_{shift}.json` + `.csv` + `.txt` briefing

**Requirements:** `pandas`, `numpy`, `scikit-learn`

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hotspots` | List hotspots (with `?limit=&police_station=`) |
| GET | `/api/hotspots/:id/violations` | Violations for a hotspot |
| GET | `/api/repeat-offenders` | Paginated offender registry |
| GET | `/api/station-load` | Station workload metrics |
| GET | `/api/meta` | Police stations, vehicle types, stats |
| GET | `/api/severity-calibration` | T-test calibration report |
| POST | `/api/patrol-routes` | Generate routes via `two.py` |
| GET | `/api/reports` | List saved PDF reports |
| GET | `/api/reports/:id/download` | Download PDF binary |
| POST | `/api/reports/generate` | Generate report via `one.py` |

---

## 📦 Seeding the Database

```bash
cd backend
node seed.js
```

This loads:
- `hotspots_with_road_context_v3.csv` → `Hotspot` collection
- `violations_scored (1).csv` → `Violation` collection  
- `repeat_offenders.csv` → `RepeatOffender` collection
- `station_load.csv` → `StationLoad` collection

---

## 📄 License

MIT — Jai, 2026
