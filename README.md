# U.S. Data Center Atlas

An interactive, static web application mapping verified U.S. data centers and frontier AI campuses—showing power capacity, water consumption, land footprint, local community trade-offs, and national comparisons against other major U.S. industries.

## Features

- **Interactive U.S. Map (MapLibre GL JS):** Smooth clustering across 1,440+ verified U.S. locations with true-to-legend pin colors, always-visible *Disclosed Impact* flagship pins, cluster hover summaries, multi-tenant stacked building switchers, and a **Satellite Aerial Imagery** toggle.
- **Sortable Facility Directory & Side-by-Side Comparison:** Rank mapped sites by power capacity (MW), water consumption, land footprint, AI compute (H100-eq), or network interconnections, and compare up to 3 campuses side-by-side.
- **Slide-Over Details Sidebar:** Inspect reported/estimated power, water, land (with human-scale household, pool, and square-mile equivalents), AI compute scale, grid context, documented local benefits vs. concerns, and clickable source links.
- **Smart Search & Shareable Deep Links:** Multi-token cross-field search (state names, cities, operators, AI chip types, tenants) with full keyboard navigation and URL query syncing (`?site=...`, `?view=compare`) for direct sharing and browser history navigation.
- **Industry Comparisons:** Compare U.S. data centers against homes, manufacturing, agriculture, golf courses, and solar across **Electricity (TWh)**, **Water (Billion Gallons)**, and **Land (Acres)** with linear & 10× logarithmic scale toggles, explicit baseline multiples, and federal citations (LBNL, EIA, USGS, USDA).
- **Dark-Gray First + Light Theme:** Low-glare charcoal dark-gray interface by default with zero-flash theme persistence.

## Running Locally (Zero Dependencies)

No Node.js or Python installation is required on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then open **http://localhost:8080/** in your browser.

## Refreshing the Open Dataset

1. Fetch live open registries (PeeringDB U.S. facilities + Epoch AI Frontier Data Centers CSV):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\fetch-open-data.ps1
   powershell -ExecutionPolicy Bypass -File .\scripts\geocode-epoch.ps1
   ```
2. Merge with curated environmental disclosures (`data-sources/flagship-facilities.json`) and federal industry benchmarks (`data-sources/industry-benchmarks.json`):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\build-dataset.ps1
   ```

## Deploying Free to Cloudflare Pages

This project is 100% static (no backend or build step needed):

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Drag and drop this folder (or only `index.html`, `styles.css`, `app/`, and `data/`).
3. Click **Deploy site** to get a free `*.pages.dev` HTTPS URL with unlimited static bandwidth.
