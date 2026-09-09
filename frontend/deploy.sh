#!/usr/bin/env bash
# Deploy the built front end to the pinned Netlify site. Never bare `netlify deploy`.
# First time: run `netlify sites:list`, confirm the site with Vicky, paste its id below.
set -euo pipefail
SITE_ID="${HOTSHOT_NETLIFY_SITE_ID:-}"
if [ -z "$SITE_ID" ]; then
  echo "Set HOTSHOT_NETLIFY_SITE_ID (from 'netlify sites:list') before deploying." >&2; exit 1
fi
cd "$(dirname "$0")"
CI=true GENERATE_SOURCEMAP=false npm run build
netlify deploy --prod --dir=build --site="$SITE_ID"
