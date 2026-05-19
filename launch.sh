#!/usr/bin/env bash
# Hotshot Dashboard — local launcher
# Starts the FastAPI backend (:8000) and the React frontend (:3000),
# then opens the dashboard in your browser. Ctrl+C stops both.

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔥 Starting Hotshot Dashboard..."

# ── Backend ──────────────────────────────────────────────────────────────────
if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "First run: creating Python venv + installing backend deps..."
  ~/.local/bin/python3.12 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi

echo "→ backend  on http://localhost:8000"
( cd "$ROOT/backend" && .venv/bin/uvicorn main:app --port 8000 --reload ) &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────────────────────
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "First run: installing frontend deps..."
  ( cd "$ROOT/frontend" && npm install )
fi

echo "→ frontend on http://localhost:3000"
( cd "$ROOT/frontend" && BROWSER=none CI=false npm start ) &
FRONTEND_PID=$!

# Stop both servers on Ctrl+C
trap 'echo; echo "Stopping..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT TERM

sleep 12
open http://localhost:3000 2>/dev/null || true
echo
echo "✅ Dashboard live at http://localhost:3000  (Ctrl+C to stop)"
wait
