# Natural Earth 10m — rivers and basins (generator)

This directory contains a small sample GeoJSON and automation to generate full Natural Earth 10m "rivers" GeoJSON and to integrate basins data (HydroBASINS) if you want higher-quality watershed polygons.

What is included here

- `rivers.geojson` — a tiny sample FeatureCollection (for quick testing / direct download).
- `basins.geojson` — a tiny sample polygon (Natural Earth does not provide hydrological basins; see HydroBASINS notes below).
- `scripts/fetch_and_convert.sh` — script to download Natural Earth 10m rivers shapefile and convert to GeoJSON using `ogr2ogr`.
- `.github/workflows/generate_geojson.yml` — a manual workflow (workflow_dispatch) that runs the script, generates GeoJSON files, and commits them to the repo. Use this to produce full files without doing conversions locally.

Sources and links

- Natural Earth 10m rivers (rivers + lake centerlines): https://www.naturalearthdata.com/downloads/10m-physical-vectors/ — direct shapefile download used by the script:
  - https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/physical/ne_10m_rivers_lake_centerlines.zip

- Natural Earth is lightweight and suitable for low-detail global maps. Estimated sizes (approx):
  - `rivers.geojson` (full Natural Earth 10m conversion): ~3–20 MB (GeoJSON, uncompressed)
  - `basins.geojson`: Natural Earth does not supply hydrological basin polygons. For basins, use HydroBASINS (see below).

HydroBASINS (watersheds / basins)

- HydroBASINS provides hydrological basin polygons at multiple levels (global, per continent). It is the recommended source for basin polygons: https://www.hydrosheds.org/page/hydrobasins
- HydroBASINS downloads are typically provided per continent and can be large (tens to hundreds of MB depending on aggregation/level). The repository automation does not download HydroBASINS automatically — see the script comments for how to obtain and convert them.

How to generate full GeoJSON files

Option A — Run locally (recommended if you have GDAL installed):

1. Install GDAL/ogr2ogr (Ubuntu: `sudo apt-get install -y gdal-bin`)
2. Run the script:

   ```bash
   bash scripts/fetch_and_convert.sh
   ```

This will download the Natural Earth rivers shapefile and produce `data/natural-earth-10m/rivers.geojson`.

Option B — Use the GitHub Action in `.github/workflows/generate_geojson.yml`:

- Go to the Actions tab, choose "Generate Natural Earth GeoJSON" workflow and click "Run workflow" (or trigger a `workflow_dispatch`). The action will install GDAL, run the script, and commit generated files back to the repo using the workflow GITHUB_TOKEN.

Notes and licensing

- Natural Earth data is public domain. HydroBASINS has its own license — review the source sites before redistribution.
- GeoJSON files can be large; consider using compressed `.geojson.gz` or `GeoPackage` for storage if size becomes an issue.

If you want, I can:
- Trigger the workflow (I cannot trigger Actions from here), or
- Modify the script to download specific HydroBASINS continent files and merge them.
