# Deployment Guide
## Hotshot Dashboard → dashboard.nbtechai.com

**Stack:** Supabase (auth + DB) · Render (FastAPI backend) · Vercel (React frontend)
**Domain:** nbtechai.com is registered at Squarespace Domains (formerly Google Domains)

---

## Overview — do these in order

| Step | Service | Time |
|------|---------|------|
| 1    | Supabase — create project + run SQL | ~5 min |
| 2    | Render — deploy backend API | ~10 min |
| 3    | Update `vercel.json` with Render URL | 2 min |
| 4    | Vercel — deploy frontend | ~10 min |
| 5    | Squarespace DNS — point subdomain | ~5 min + up to 1 hr propagation |
| 6    | Add custom domain in Vercel | 2 min |
| 7    | Make yourself admin | 2 min |

---

## Step 1 — Supabase

1. Go to [supabase.com](https://supabase.com) → **Start your project** (free)
2. Create a new project — pick any name, set a database password, choose **US West** region
3. Wait ~2 minutes for provisioning

**Run the database setup:**
4. In Supabase → **SQL Editor** → **New Query**
5. Paste the contents of `supabase/setup.sql` → click **Run**
6. You should see "Success. No rows returned"

**Copy your API keys** (you'll need these later):
Go to **Project Settings → API**

| Key | Where to find it | Used in |
|-----|-----------------|---------|
| `SUPABASE_URL` | Project URL | Backend + Frontend |
| `SUPABASE_ANON_KEY` | `anon public` key | Frontend only |
| `SUPABASE_JWT_SECRET` | Settings → JWT Settings → JWT Secret | Backend only |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (keep secret!) | Backend only |

**Configure auth redirect URLs:**
7. Supabase → **Authentication → URL Configuration**
8. Set **Site URL** to: `https://dashboard.nbtechai.com`
9. Under **Redirect URLs** add: `https://dashboard.nbtechai.com/**`

---

## Step 2 — Deploy Backend to Render

1. Go to [render.com](https://render.com) → Sign up (free) → **New → Web Service**
2. Connect your GitHub account and select the `Hotshot_Dashboard` repo
3. Configure the service:

   | Setting | Value |
   |---------|-------|
   | Name | `hotshot-dashboard-api` |
   | Root Directory | `backend` |
   | Environment | `Python 3` |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | `Free` (or Starter $7/mo for always-on) |

4. Click **Advanced** → add these **Environment Variables**:

   ```
   SUPABASE_URL               = https://xxxx.supabase.co
   SUPABASE_JWT_SECRET        = (from Supabase step above)
   SUPABASE_SERVICE_ROLE_KEY  = (from Supabase step above)
   FIRMS_API_KEY              = (get free at firms.modaps.eosdis.nasa.gov/api/)
   SYNOPTIC_API_KEY           = (get free at synopticdata.com)
   AIRNOW_API_KEY             = (get free at docs.airnowapi.org/account/request)
   ELMFIRE_OUTPUT_DIR         = ./data/elmfire_outputs
   CORS_ORIGINS               = https://dashboard.nbtechai.com
   ```

5. Click **Create Web Service** — first deploy takes ~5 minutes
6. **Copy your Render URL** — it looks like `https://hotshot-dashboard-api.onrender.com`

> **Free tier note:** Render free services sleep after 15 minutes of inactivity (cold start ~30 sec).
> Upgrade to Starter ($7/mo) for always-on performance.

---

## Step 3 — Update vercel.json with Render URL

1. Open `frontend/vercel.json` in the repo
2. Replace `REPLACE_WITH_RENDER_URL` with your actual Render URL:

   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://hotshot-dashboard-api.onrender.com/api/:path*"
       },
       {
         "source": "/((?!.*\\.).*)",
         "destination": "/index.html"
       }
     ]
   }
   ```

3. Commit and push:
   ```bash
   git add frontend/vercel.json
   git commit -m "Add Render backend URL to Vercel proxy"
   git push origin main
   ```

---

## Step 4 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project → Import Git Repository**
2. Select `Hotshot_Dashboard`
3. Configure:

   | Setting | Value |
   |---------|-------|
   | Framework Preset | Create React App |
   | Root Directory | `frontend` |

4. Add **Environment Variables**:

   ```
   REACT_APP_SUPABASE_URL       = https://xxxx.supabase.co
   REACT_APP_SUPABASE_ANON_KEY  = (anon public key from Supabase)
   ```

5. Click **Deploy** — takes ~3 minutes
6. You'll get a URL like `https://hotshot-dashboard-xxxx.vercel.app` — test it to make sure it works

---

## Step 5 — Squarespace DNS (subdomain setup)

Your domain `nbtechai.com` is managed at **Squarespace Domains** (formerly Google Domains).

1. Go to [domains.squarespace.com](https://domains.squarespace.com)
2. Sign in with your Google account
3. Click on **nbtechai.com** → **DNS**
4. Scroll to **Custom Records** → click **Manage custom records**
5. Click **Add a record** and fill in:

   | Type | Host | Value | TTL |
   |------|------|-------|-----|
   | `CNAME` | `dashboard` | `cname.vercel-dns.com` | 1 hour |

6. Click **Save**

> DNS changes can take up to 1 hour to fully propagate, but usually under 10 minutes.

---

## Step 6 — Add Custom Domain in Vercel

1. In Vercel → your project → **Settings → Domains**
2. Click **Add Domain** → type `dashboard.nbtechai.com`
3. Vercel will verify the DNS record and auto-provision an SSL certificate
4. Status will show **Valid Configuration** once DNS has propagated
5. Visit **https://dashboard.nbtechai.com** — your dashboard is live!

---

## Step 7 — Make Yourself Admin

After signing up through the dashboard:

1. Supabase → **Table Editor → profiles**
2. Find your row → click the pencil icon to edit
3. Set `approved = true`, `role = admin`
4. Sign out of the dashboard and sign back in
5. You now have full admin access — approve other users via the API or directly in Supabase

**To approve other users:**
- **Easiest:** Supabase → Table Editor → profiles → find user → set `approved = true`
- **Via API:** `POST https://hotshot-dashboard-api.onrender.com/api/admin/approve` with your JWT + `{"user_id": "..."}`

---

## API Keys Needed (all free)

| Key | Service | URL |
|-----|---------|-----|
| `FIRMS_API_KEY` | NASA FIRMS fire detections | [firms.modaps.eosdis.nasa.gov/api](https://firms.modaps.eosdis.nasa.gov/api/) |
| `SYNOPTIC_API_KEY` | RAWS weather stations | [synopticdata.com](https://synopticdata.com) |
| `AIRNOW_API_KEY` | EPA air quality / smoke | [docs.airnowapi.org/account/request](https://docs.airnowapi.org/account/request/) |

**No API key needed:** NWS fire alerts, LANDFIRE, ALERTWildfire cameras, NIFC IRWIN incidents, iNaturalist Plant ID, NASA GIBS vegetation, MODIS NDVI, Watch Duty links.

---

## Local Development

```bash
# Backend
cd backend
cp .env.example .env       # fill in your keys
pip install -r requirements.txt
uvicorn main:app --reload  # runs at http://localhost:8000

# Frontend (new terminal)
cd frontend
cp .env.example .env.local  # fill in Supabase keys
npm install
npm start                   # runs at http://localhost:3000
                            # /api/* calls auto-proxy to localhost:8000
```

---

## Re-deploy after code changes

Vercel and Render are connected to GitHub. Every push to `main` auto-deploys both services — no manual action needed.
