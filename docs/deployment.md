# Deployment Guide

## Overview

| Layer    | Service | Free tier |
|----------|---------|-----------|
| Frontend | Vercel  | Yes       |
| Backend  | Render  | Yes       |
| Auth/DB  | Supabase| Yes       |

---

## 1. Supabase Setup

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor → New Query**, paste `supabase/setup.sql`, and run it
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `REACT_APP_SUPABASE_ANON_KEY`
   - **JWT Secret** (under JWT Settings) → `SUPABASE_JWT_SECRET`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`
4. Under **Authentication → Settings**:
   - Set **Site URL** to your Vercel URL (e.g. `https://hotshot.vercel.app`)
   - Add redirect URLs: `https://hotshot.vercel.app/**`

### Make yourself admin
After deploying and signing up:
1. Supabase → Table Editor → `profiles`
2. Find your row, set `approved = true`, `role = admin`
3. Sign out and back in

---

## 2. Deploy Backend → Render

1. Push your code to GitHub (already done)
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add **Environment Variables**:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_JWT_SECRET=...
   SUPABASE_SERVICE_ROLE_KEY=...
   FIRMS_API_KEY=...
   SYNOPTIC_API_KEY=...
   CORS_ORIGINS=https://your-vercel-url.vercel.app
   ```
6. Deploy — note the Render URL (e.g. `https://hotshot-api.onrender.com`)

> **Free tier note**: Render free services spin down after 15 minutes of inactivity.
> Upgrade to the $7/mo Starter plan to keep it always-on.

---

## 3. Deploy Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project → Import from GitHub**
2. Select the `Hotshot_Dashboard` repo
3. Settings:
   - **Framework Preset**: Create React App
   - **Root Directory**: `frontend`
4. Add **Environment Variables**:
   ```
   REACT_APP_SUPABASE_URL=https://your-project.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=...
   REACT_APP_API_URL=https://hotshot-api.onrender.com
   ```
5. Deploy — Vercel gives you a `.vercel.app` URL

---

## 4. Link to nbtechai.com

### Option A — Subdomain (recommended)
Point `dashboard.nbtechai.com` at Vercel:
1. Vercel → your project → **Domains → Add Domain** → enter `dashboard.nbtechai.com`
2. In your DNS provider, add a **CNAME record**:
   ```
   dashboard   CNAME   cname.vercel-dns.com
   ```
3. Vercel will auto-provision an SSL certificate

### Option B — Path redirect
Add a link/button on nbtechai.com pointing to the Vercel URL.

---

## 5. Approving users

Users who sign up appear in Supabase → Table Editor → `profiles` with `approved = false`.

### Via Supabase Studio (easiest)
1. Table Editor → `profiles`
2. Find the user, click the row, set `approved = true`

### Via Admin API (if you want a UI later)
```
GET  /api/admin/pending   — list pending users
POST /api/admin/approve   — {"user_id": "..."}
POST /api/admin/reject    — {"user_id": "..."}
```
These endpoints require an admin JWT (Bearer token in Authorization header).
