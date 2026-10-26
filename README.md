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
