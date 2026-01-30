#!/bin/bash
set -e
# Downloads Natural Earth 10m rivers shapefile and converts to GeoJSON
# Outputs to data/natural-earth-10m/rivers.geojson

mkdir -p data/natural-earth-10m
TMPDIR=$(mktemp -d)
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT
cd "$TMPDIR"

echo "Downloading Natural Earth 10m rivers..."
wget -q -O ne_rivers.zip "https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/physical/ne_10m_rivers_lake_centerlines.zip"
unzip -o ne_rivers.zip

# Try common shapefile locations
SHP=""
if [ -d "ne_10m_rivers_lake_centerlines" ]; then
  SHP=$(ls ne_10m_rivers_lake_centerlines/*.shp 2>/dev/null || true)
fi
if [ -z "$SHP" ]; then
  SHP=$(ls *.shp 2>/dev/null | head -n1 || true)
fi
if [ -z "$SHP" ]; then
  echo "Error: shapefile not found after unzip"
  exit 1
fi

echo "Converting $SHP to GeoJSON..."
# Use the repository workspace path for output when running in Actions
OUTPATH="$(pwd)/../workspace_out"
mkdir -p "$OUTPATH"
# If running in GitHub Actions, /github/workspace is available; otherwise write to repository relative path
if [ -d "/github/workspace" ]; then
  OUTFILE="/github/workspace/data/natural-earth-10m/rivers.geojson"
else
  # assume running locally from repo root
  OUTFILE="$(git rev-parse --show-toplevel 2>/dev/null || pwd)/data/natural-earth-10m/rivers.geojson"
fi

gdal2ogr -f GeoJSON "$OUTFILE" "$SHP"

echo "Wrote: $OUTFILE"
ls -lh "$OUTFILE" || true

exit 0
