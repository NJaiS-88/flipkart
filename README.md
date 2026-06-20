# Parking Violation Hotspot Inspector

An AI-driven parking violation detection, outcome tracking, and hotspot visualization dashboard.

## 📂 Project Structure

```text
├── backend/                   # Express & MongoDB API
│   ├── server.js              # Server entry point
│   ├── models.js              # MongoDB schemas
│   └── seed.js                # Database seeder
├── frontend/                  # React & Vite application
│   ├── src/
│   │   ├── App.jsx            # Main dashboard shell
│   │   └── components/        # MapComponent & DetailPanel
│   └── index.html             # Application entry point
├── .gitignore                 # Root level git rules
└── README.md                  # This file
```

---

## 🚀 Local Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [MongoDB](https://www.mongodb.com/) running locally or in cloud.

### 2. Seeding & Running Backend
```bash
cd backend
npm install
npm run seed  # Loads hotspots, violations, repeat offenders, and station load logs
npm start     # Runs server on http://localhost:5000
```

### 3. Running Frontend
```bash
cd frontend
npm install
npm run dev   # Starts Vite server on http://localhost:5173
```

---

## ☁️ Production Deployment

### 1. Backend (Render)
1. Sign up on [Render](https://render.com/).
2. Click **New** ➔ **Web Service**.
3. Connect your GitHub repository.
4. Set:
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. In **Environment Variables**, configure:
   - `MONGO_URI`: Your production MongoDB connection string (e.g. from MongoDB Atlas).

### 2. Frontend (Vercel)
1. Sign up on [Vercel](https://vercel.com/).
2. Click **Add New** ➔ **Project**.
3. Select your repository.
4. Set:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
5. In **Environment Variables**, add:
   - `VITE_API_URL`: Your Render backend service URL (e.g., `https://your-backend.onrender.com`).
6. Click **Deploy**.

---

## 🐙 Push to GitHub

The root-level `.gitignore` has been pre-configured to automatically exclude heavy raw CSV data sheets, local environment logs, and dependency directories to keep repository pushes fast and clean.

To push:
```bash
git init
git add .
git commit -m "Initialize project structure and deployment configuration"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```
