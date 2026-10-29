# Levees & the warning gap

Interactive research explorer: global population exposure, hazard emergence, and warning time across 426 river sub-basins.

**Website:** https://gangzhao-hydro.github.io/levee-warning-explorer/

This is an independent project, separate from the author's personal homepage.

## Data and resolution

The supporting historical map shows 2000 with and without levees at the original 30-arcsecond resolution. Float32 COG bytes are preserved exactly in 92 bounded static parts, each at most 4 MiB. The browser loads only needed parts and verifies SHA-256 checksums. Global views use averaged overviews; cell queries always read the original grid.

The historical flood map is from the VIC hindcast. The three manuscript results use the CMIP6 ensemble. The optional 2020 population overlay is a coarse visual reference.

## Project layout

- `site/`: editable HTML, CSS and JavaScript, applied over the data bundle during deployment.
- `deploy/asset.json`: exact release asset size, SHA-256 and tag.
- `deploy/assemble.py`: verifies the asset and every map part, then assembles the site.
- Release `v1.0.0`, asset `site-2000.zip`: complete static dataset, scientific figures, per-basin data, third-party library notices and the 2000 flood maps.
- `.github/workflows/pages.yml`: builds and publishes the assembled site to GitHub Pages.

The large data bundle is a Release asset rather than part of Git history. Pages serves the assembled files directly; visitors do not download the complete ZIP. To update presentation or interactions, edit `site/` and run the Pages workflow. Updating the dataset requires a new release asset and an updated checksum manifest.

## Local preview of the release

Download `site-2000.zip` from this repository's Releases, then run:

```sh
python3 deploy/assemble.py site-2000.zip _site
python3 -m http.server 4173 --bind 127.0.0.1 --directory _site
```

Open http://127.0.0.1:4173/ . The chunked map works on an ordinary static server and does not require HTTP Range support.

## Corrected manuscript results — 28 October 2026

The current title is **Levees reduce flood exposure but obscure river-flood emergence**.
Results use the verified corrected lookup, corrected cell-area aggregation, VIC runoff mask (18.25 mm yr⁻¹), and positive-exceedance guard. The 426-basin domain is unchanged. Figures 1–4 use the current manuscript numbering.

- P95 / SSP5-8.5: detected ToE 328 → 222; 107 masked; 120 delayed.
- Shared protected-system RET: 234 detections. Both lead-time distributions use exactly the same 195 basins: medians 6 → 0 years.
- Full-domain warning classes and common-support lead distributions have different denominators and are labelled separately.
- SSP1-2.6 global exposure uses its 10 available models; other scenarios and the historical baseline use 11.

The original release `v1.0.0` remains an immutable source of the already-public 2000 VIC maps and dependencies. `deploy/corrected-results/` contains checksum-verified parts of a ZIP overlay with updated aggregate data, basin series, CSV downloads and figure previews. Assembly verifies each part, the combined archive, and all original map chunks. No new full-resolution CMIP6 rasters are published.

Rebuild the scientific overlay with `deploy/build_corrected_data.py --project <reference-project> --corrected <verified-corrected-root>` in the production analysis Python environment. The builder verifies every one of 852 P95 ToE values and 426 shared RET values before display rounding. Current provenance is published in `data/provenance.json`.

## VIC year-2000 map correction (29 October 2026)

The two VIC-GPU historical maps now use the verified return-period coordinate sequence [0.1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 10000, 100000]. This updates only the 2000 lookup/downscaling products, retaining the VIC input series, linear interpolation, endpoint clamping, levee partition, native Float32 grid and display palette. No hydrodynamic simulation is rerun.

The immutable original release is preserved. `deploy/vic2000-correction/` stores exact sparse Float32 updates, with old/new full-grid hashes and patch checksums. `deploy/apply_vic2000.py` reconstructs and checks all 1,866,240,000 base-grid cells, generates lossless COGs and averaged display overviews, and publishes them in a new versioned namespace. Original map chunks remain available. Patch arrays contain only raster indices and corrected depth values, with no local paths or private records. The basin/manuscript data are unchanged.

Maps retain physical water depths. Comparison statistics use the same runoff ≥18.25 mm/year and protection-class <4 screen in both versions, with flooded depth >0.15 m and corrected spherical pixel areas. The underlying VIC simulation and upstream frequency-fit provenance are not newly audited by this packaging step.
