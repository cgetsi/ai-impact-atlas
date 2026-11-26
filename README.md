# AI Impact Atlas

An interactive, verifiable static web application showing **the full truth about AI**: real-world breakthroughs in medicine, mathematics, science, and accessibility alongside exponential intelligence scaling, collapsing token costs, and the physical U.S. data center infrastructure powering it.

## Equal Pillars

1. **Verifiable Breakthroughs Timeline (2020–2026):**
   - Interactive acceleration chart plotting peer-reviewed medical discoveries, machine-checked Lean 4 proofs, extreme-weather models, and accessibility tools over time.
   - Click any milestone dot to inspect **What Happened**, **Why It Matters for People**, **Honest Limitations / What Could Be Improved**, and clickable official primary sources (*Nature*, *Science*, *NEJM*, FDA, ClinicalTrials.gov, Lean 4).
   - **Open Mathematics & Lean 4 Board:** Live status on the Riemann Hypothesis, $\text{VP} \neq \text{VNP}$, Erdős problems, Fermat's Last Theorem in Lean 4, and Busy Beaver $BB(5)$—separating real proofs from social-media hype.
   - **Medicine & FDA Pipeline:** Cumulative FDA-authorized AI/ML medical devices (2018–2025) plus an honest ClinicalTrials.gov drug watchlist.

2. **Intelligence Growth & Collapsing Cost per Token:**
   - Interactive log-scale & linear **Price Collapse** chart tracking GPT-4–class intelligence falling **300×+** per million tokens (2023 → 2026).
   - Multi-benchmark capability curves across **PhD Science (GPQA Diamond)**, **Real Software Engineering (SWE-bench Verified)**, **Competition Math (AIME)**, and **Research Math (FrontierMath)**.
   - **Autonomous Task Horizon** doubling curve (METR) + Jevons Paradox bridge linking per-query efficiency to total infrastructure demand.

3. **U.S. Data Centers & Infrastructure (Equal Pillar):**
   - **Interactive U.S. Map (MapLibre GL JS):** 1,446 verified U.S. data centers and frontier AI campuses with satellite imagery toggle, AI company filters, ranked directory, and side-by-side campus comparison.
   - **Industry Comparisons & Pros/Cons:** Compare U.S. data centers against homes, manufacturing, agriculture, golf courses, and solar across electricity, water, and land with federal citations (LBNL, EIA, USGS, USDA).

---

## Running Locally (Zero Dependencies)

No build step is required. On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then open **http://localhost:8080/** in your browser.

---

## Automated GitHub Updates & Anti-Hype Review Gate

This project stays **100% static JSON** and uses **GitHub Actions** (`.github/workflows/update-ai-datasets.yml`) to keep datasets fresh without database overhead or unverified bot hallucinations:

1. Twice weekly (or manually via **Actions → Update AI Impact Atlas Datasets → Run workflow**), `scripts/update-ai-data.mjs`:
   - Queries **ClinicalTrials.gov API v2** for tracked AI-discovered drug statuses (`NCT` IDs).
   - Scans official scientific RSS feeds (**MIT News AI**, **Google DeepMind**, **Nature Machine Intelligence**).
   - Optionally calls **Grok** (`XAI_API_KEY`) or **Gemini** (`GEMINI_API_KEY`) if you add either secret under **GitHub Repo Settings → Secrets and variables → Actions** to triage genuinely major breakthroughs against strict anti-hype criteria.
2. `scripts/validate-datasets.mjs` enforces the strict JSON schema (valid dates, primary `https://` citations, quantitative metrics, and honest caveats).
3. GitHub Actions automatically opens a **Pull Request** with a clean summary—you review and click **Merge** in 1 click, and **Cloudflare Pages** (connected to your GitHub repo) auto-redeploys in ~15 seconds.

### Validating Locally

```powershell
node .\scripts\validate-datasets.mjs
```

### Refreshing U.S. Data Center Registries

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\fetch-open-data.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\geocode-epoch.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\build-dataset.ps1
```
