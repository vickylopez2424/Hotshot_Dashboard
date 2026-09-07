#!/usr/bin/env bash
# Run one bundled ELMFIRE tutorial inside the native Docker image and drop
# the resulting GeoTIFFs where the Hotshot Dashboard backend reads them.
#
# Usage:
#   ./run_tutorial.sh                      # 01-constant-wind -> run_id tutorial_01
#   ./run_tutorial.sh 02-transient-wind tutorial_02
#
# Env overrides:
#   IMAGE       docker image tag (default elmfire:arm64)
#   BACKEND_OUT where the backend scans for runs
#               (default ../../backend/data/elmfire_outputs relative to this file)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TUTORIAL="${1:-01-constant-wind}"
RUN_ID="${2:-tutorial_01}"
IMAGE="${IMAGE:-elmfire:arm64}"
BACKEND_OUT="${BACKEND_OUT:-$HERE/../../backend/data/elmfire_outputs}"

if [ "$RUN_ID" = "sample_run" ]; then
  echo "Refusing to overwrite sample_run" >&2
  exit 1
fi

HOST_OUT="$HERE/outputs/$RUN_ID"
rm -rf "$HOST_OUT"
mkdir -p "$HOST_OUT"

# The tutorial script is run in place inside the image so that
# ../functions/functions.sh and the repo VERSION file resolve. Its outputs/
# folder is then copied to the bind-mounted /out.
START=$(date +%s)
docker run --rm \
  -v "$HOST_OUT":/out \
  "$IMAGE" \
  bash -c "cd /elmfire/elmfire/tutorials/$TUTORIAL \
           && ./01-run.sh > /out/run.log 2>&1; rc=\$?; \
           cp -a inputs/elmfire.data /out/ 2>/dev/null; \
           cp -a outputs/. /out/ 2>/dev/null; exit \$rc"
END=$(date +%s)
echo "ELMFIRE $TUTORIAL finished in $((END-START)) s (container wall clock)"

# Copy GeoTIFFs to the backend run folder. Filenames already follow the
# time_of_arrival_<member>_<seconds>.tif convention the geotiff_processor scans.
DEST="$BACKEND_OUT/$RUN_ID"
mkdir -p "$DEST"
cp "$HOST_OUT"/*.tif "$DEST"/
cp "$HOST_OUT"/elmfire.data "$DEST"/elmfire.data 2>/dev/null || true
# ELMFIRE names the spread-rate raster vs_<member>_<seconds>.tif; the backend
# classifier looks for "spread_rate", so provide that name as well.
for f in "$DEST"/vs_*.tif; do
  [ -e "$f" ] && cp "$f" "$DEST/spread_rate_${f##*/vs_}"
done
echo "Outputs in $DEST:"
ls -la "$DEST"
