#!/usr/bin/env bash
# Run ELMFIRE in Docker against a prepared input folder.
#
# Usage:  run_elmfire.sh <run_dir>
#
# <run_dir> must contain inputs/elmfire.data plus the rasters it names
# (landscape, adj, phi, ws, wd, m1, m10, m100), and may contain a_srs.txt
# holding the grid CRS (e.g. "EPSG:32610") that gets stamped on the outputs.
# The folder is mounted at /run inside the image; elmfire.data paths are
# relative ('./inputs', './outputs', './scratch') so cwd is /run.
#
# On success outputs/*.tif holds time_of_arrival_*, flin_*, vs_* and a
# spread_rate_* copy of vs_*. On failure the log tail goes to stderr and the
# exit code is non-zero (124 on timeout).
#
# Env: IMAGE (default elmfire:arm64), ELMFIRE_TIMEOUT seconds (default 180).
set -uo pipefail

if [ $# -lt 1 ] || [ ! -d "$1" ]; then
  echo "usage: $0 <run_dir>" >&2; exit 2
fi
RUN_DIR="$(cd "$1" && pwd)"
IMAGE="${IMAGE:-elmfire:arm64}"
TIMEOUT="${ELMFIRE_TIMEOUT:-180}"

if [ ! -f "$RUN_DIR/inputs/elmfire.data" ]; then
  echo "missing $RUN_DIR/inputs/elmfire.data" >&2; exit 2
fi
A_SRS="$(tr -d '[:space:]' < "$RUN_DIR/a_srs.txt" 2>/dev/null || true)"
mkdir -p "$RUN_DIR/outputs" "$RUN_DIR/scratch"
rm -f "$RUN_DIR/outputs"/* "$RUN_DIR/run.log"
rm -rf "$RUN_DIR/scratch"/*

NAME="elmfire_$(basename "$RUN_DIR" | tr -c 'A-Za-z0-9_.-' '_')_$$"
docker rm -f "$NAME" >/dev/null 2>&1 || true

START=$(date +%s)
if ! docker run -d --name "$NAME" -e A_SRS="$A_SRS" \
     -v "$RUN_DIR":/run -w /run "$IMAGE" bash -c '
  set -e
  "elmfire_${ELMFIRE_VER}" ./inputs/elmfire.data
  for f in ./outputs/*.bil; do
    [ -e "$f" ] || continue
    b=$(basename "$f" .bil)
    if [ -n "$A_SRS" ]; then
      gdal_translate -q -a_srs "$A_SRS" -co COMPRESS=DEFLATE -co ZLEVEL=6 "$f" "./outputs/$b.tif"
    else
      gdal_translate -q -co COMPRESS=DEFLATE -co ZLEVEL=6 "$f" "./outputs/$b.tif"
    fi
  done
  for f in ./outputs/vs_*.tif; do
    [ -e "$f" ] && cp "$f" "./outputs/spread_rate_${f##*/vs_}"
  done
  rm -f ./outputs/*.bil ./outputs/*.hdr ./outputs/*.csv
  rm -rf ./scratch/*
' >/dev/null; then
  echo "docker run failed for image $IMAGE" >&2; exit 3
fi

# Watchdog: kill the container if it outlives the timeout. Its stdio is
# detached so a caller capturing our output is not held open by the sleep,
# and the sleep child is killed along with the subshell afterwards.
rm -f "$RUN_DIR/.timeout"
( sleep "$TIMEOUT" & SLEEP_PID=$!; trap 'kill $SLEEP_PID 2>/dev/null; exit 0' TERM
  wait $SLEEP_PID
  if docker kill "$NAME" >/dev/null 2>&1; then touch "$RUN_DIR/.timeout"; fi ) </dev/null >/dev/null 2>&1 &
WATCHDOG=$!
RC="$(docker wait "$NAME" 2>/dev/null || echo 1)"
kill "$WATCHDOG" >/dev/null 2>&1 || true
pkill -P "$WATCHDOG" >/dev/null 2>&1 || true
docker logs "$NAME" > "$RUN_DIR/run.log" 2>&1 || true
docker rm -f "$NAME" >/dev/null 2>&1 || true
END=$(date +%s)

if [ -e "$RUN_DIR/.timeout" ]; then
  echo "ELMFIRE timed out after ${TIMEOUT}s in $RUN_DIR" >&2
  tail -n 20 "$RUN_DIR/run.log" >&2
  exit 124
fi
if [ "$RC" != "0" ]; then
  echo "ELMFIRE exited $RC in $RUN_DIR" >&2
  tail -n 30 "$RUN_DIR/run.log" >&2
  exit 1
fi
if ! ls "$RUN_DIR"/outputs/time_of_arrival_*.tif >/dev/null 2>&1; then
  echo "ELMFIRE finished but wrote no time_of_arrival raster in $RUN_DIR/outputs" >&2
  tail -n 30 "$RUN_DIR/run.log" >&2
  exit 1
fi
echo "ELMFIRE finished in $((END-START)) s: $(ls "$RUN_DIR"/outputs/*.tif | wc -l | tr -d ' ') GeoTIFFs in $RUN_DIR/outputs"
exit 0
