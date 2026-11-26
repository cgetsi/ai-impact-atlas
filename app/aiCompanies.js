import { getCleanEnergyProfile } from './cleanResources.js';

/**
 * Leading AI companies tracked across both Owned/Built campuses (operator/name)
 * and Rented/Hosted compute campuses (Epoch AI `aiUsers` & public disclosures).
 *
 * Environmental standing is grounded in 4 verifiable dimensions:
 * 1. Physical Local Grid Cleanliness (computed live from EPA eGRID / EIA across mapped sites)
 * 2. Corporate Clean Power vs. On-Site Fossil Reliance (audited PPAs/24-7 CFE vs. gas turbines)
 * 3. Cooling & Water Sustainability (closed-loop/air/reclaimed vs. high-stress evaporative)
 * 4. Site-Level Public Transparency (audited campus tables vs. undisclosed footprint)
 */
export const AI_COMPANIES = [
  {
    id: 'google',
    name: 'Google',
    subtitle: 'Google Cloud & DeepMind',
    ownedRe: /google/i,
    rentedRe: /google|deepmind/i,
    standing: 'stronger',
    standingLabel: 'Stronger',
    cleanPower: {
      score: 92,
      tag: '100% PPA · 66% 24/7 CFE',
      detail: 'Audited 100% annual renewable match since 2017, ~66% fleet-wide hourly 24/7 carbon-free energy, and first commercial 24/7 geothermal deal (Nevada).'
    },
    waterTech: {
      score: 68,
      tag: 'Air & Recycled + Legacy Evap',
      detail: 'Pioneered air-cooled desert design (0.2M gal/yr in Storey NV) and 100% recycled wastewater (Douglas GA), though older evaporative campuses still use 800M–1B+ gal/yr.'
    },
    transparency: {
      score: 96,
      tag: 'Site-Level Water Tables',
      detail: 'Publishes audited facility-by-facility U.S. water withdrawal and consumption figures annually.'
    }
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    subtitle: 'Azure & OpenAI Partner',
    ownedRe: /microsoft/i,
    rentedRe: /microsoft/i,
    standing: 'stronger',
    standingLabel: 'Stronger',
    cleanPower: {
      score: 86,
      tag: '100% PPA · Nuclear & Solar',
      detail: 'Matches 100% of annual electricity with renewable contracts and backs zero-carbon nuclear/solar, though rapid regional load has prompted utility gas peaking in WI.'
    },
    waterTech: {
      score: 90,
      tag: 'Zero-Water Closed-Loop',
      detail: 'Leading transition to zero-evaporation closed-loop liquid cooling on flagship AI builds (Fairwater WI, Goodyear AZ, new West Des Moines phases).'
    },
    transparency: {
      score: 68,
      tag: 'Partial Site Disclosures',
      detail: 'Publishes regional WUE/PUE benchmarks and select campus water filings, though not a complete site-by-site U.S. table.'
    }
  },
  {
    id: 'meta',
    name: 'Meta',
    subtitle: 'Llama & Hyperscale Fleet',
    ownedRe: /\bmeta\b|facebook/i,
    rentedRe: /\bmeta\b/i,
    standing: 'mixed',
    standingLabel: 'Mixed',
    cleanPower: {
      score: 74,
      tag: '100% PPA · New Utility Gas',
      detail: 'Matches 100% of operating sites with wind/solar PPAs, but its 2–5 GW Hyperion Louisiana build triggered 3 proposed utility natural gas plants (~2.26 GW).'
    },
    waterTech: {
      score: 72,
      tag: 'Low-WUE Air + Arid Sites',
      detail: 'Efficient outside-air cooling (~0.18 L/kWh fleet average) and watershed restoration grants, offset by large sites in extremely high water-stress basins (UT, NM).'
    },
    transparency: {
      score: 92,
      tag: 'Site-Level MWh Tables',
      detail: 'Publishes exact campus-by-campus annual electricity (MWh) consumption in its annual Environmental Data Index.'
    }
  },
  {
    id: 'aws',
    name: 'Amazon / AWS',
    subtitle: 'AWS & Anthropic Partner',
    ownedRe: /amazon|\baws\b/i,
    rentedRe: /amazon|\baws\b/i,
    standing: 'mixed',
    standingLabel: 'Mixed',
    cleanPower: {
      score: 80,
      tag: '100% Annual Match · Nuclear',
      detail: 'Largest corporate renewable buyer (100% annual match) plus nuclear agreements, though gigawatt load growth in VA and IN strains fossil-heavy PJM grids.'
    },
    waterTech: {
      score: 76,
      tag: 'Outside-Air + Reclaimed',
      detail: 'Uses outside-air economizers ~97% of the year on new campuses and Loudoun purple-pipe reclaimed wastewater in VA.'
    },
    transparency: {
      score: 46,
      tag: 'Fleet Totals Only',
      detail: 'Publishes global fleet WUE and renewable percentages but rarely discloses per-campus power or water figures.'
    }
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    subtitle: 'Claude (Mostly Partner Cloud)',
    ownedRe: /anthropic|rainier/i,
    rentedRe: /anthropic/i,
    standing: 'mixed',
    standingLabel: 'Partner-Dependent',
    cleanPower: {
      score: 62,
      tag: 'Via AWS / Google + Leased',
      detail: 'Trains largely on AWS and Google Cloud (100% annual PPA matched) plus hydro-corridor sites like Lake Mariner NY, alongside leased third-party clusters.'
    },
    waterTech: {
      score: 52,
      tag: 'Partner Cooling (Undisclosed)',
      detail: 'Inherits AWS outside-air cooling on Project Rainier, but publishes no independent water consumption or cooling metrics.'
    },
    transparency: {
      score: 20,
      tag: 'Undisclosed',
      detail: 'Does not publish an audited sustainability report or site-level energy/water figures across its rented compute.'
    }
  },
  {
    id: 'openai',
    name: 'OpenAI',
    subtitle: 'ChatGPT & Stargate Initiative',
    ownedRe: /openai|stargate/i,
    rentedRe: /openai/i,
    standing: 'mixed',
    standingLabel: 'Mixed / Opaque',
    cleanPower: {
      score: 54,
      tag: 'Partner PPAs + Gas Bridging',
      detail: 'Rents heavily on Microsoft Azure (100% matched), while new Stargate campuses combine West Texas wind with on-site natural gas / fuel-cell bridging generation.'
    },
    waterTech: {
      score: 62,
      tag: 'Closed-Loop Stargate · Mix',
      detail: 'Flagship Stargate Abilene uses closed-loop liquid cooling to avoid desert evaporation, but water usage across rented clusters is undisclosed.'
    },
    transparency: {
      score: 20,
      tag: 'Undisclosed',
      detail: 'Does not publish audited facility-level electricity, carbon, or water consumption reports.'
    }
  },
  {
    id: 'xai',
    name: 'xAI',
    subtitle: 'Grok / Colossus Clusters',
    ownedRe: /\bxai\b|spacex|colossus/i,
    rentedRe: /\bxai\b|spacex/i,
    standing: 'higher_impact',
    standingLabel: 'Higher Impact',
    cleanPower: {
      score: 22,
      tag: 'Grid + On-Site Gas Turbines',
      detail: 'Deployed dozens of temporary unpermitted methane gas turbines in Memphis ahead of utility substations; no audited 100% renewable PPA disclosure.'
    },
    waterTech: {
      score: 42,
      tag: 'Aquifer -> Greywater Plant',
      detail: 'Draws heavily from the Memphis Sand Aquifer during peak cooling, though xAI is funding a greywater recycling plant to offset municipal potable draw.'
    },
    transparency: {
      score: 18,
      tag: 'Undisclosed',
      detail: 'No audited sustainability report or publicly disclosed annual electricity, emissions, or water totals.'
    }
  }
];

export function getAiCompanyById(id) {
  return AI_COMPANIES.find((c) => c.id === id) || null;
}

/**
 * Classifies a facility's relationship to a given AI company:
 * returns 'owned' | 'rented' | null.
 */
export function matchFacilityToAiCompany(feature, company) {
  if (!feature || !feature.properties || !company) return null;
  const p = feature.properties;
  // Scope AI company filter to AI & hyperscale campuses (PeeringDB colos don't disclose AI tenants)
  if (p.category !== 'ai_hyperscale') return null;

  const ownerHay = `${p.operator || ''} ${p.name || ''}`;
  if (company.ownedRe.test(ownerHay)) return 'owned';

  const tenantHay = `${p.aiUsers || ''} ${p.summary || ''}`;
  if (company.rentedRe.test(tenantHay)) return 'rented';

  return null;
}

/**
 * Computes live scorecard stats for all 7 leading AI companies from the mapped dataset.
 */
export function computeAiCompanyScorecards(allFeatures) {
  const aiFeatures = (allFeatures || []).filter((f) => f.properties && f.properties.category === 'ai_hyperscale');

  return AI_COMPANIES.map((company) => {
    const ownedSites = [];
    const rentedSites = [];

    for (const f of aiFeatures) {
      const role = matchFacilityToAiCompany(f, company);
      if (role === 'owned') ownedSites.push(f);
      else if (role === 'rented') rentedSites.push(f);
    }

    const allSites = [...ownedSites, ...rentedSites];
    const cleanGridVals = allSites.map((f) => getCleanEnergyProfile(f.properties).cleanPct);
    const avgCleanGridPct = cleanGridVals.length
      ? Math.round(cleanGridVals.reduce((a, b) => a + b, 0) / cleanGridVals.length)
      : 44;

    const trackedMw = Math.round(allSites.reduce((acc, f) => acc + (Number(f.properties.powerMw) || 0), 0));
    const waterDisclosedCount = allSites.filter(
      (f) => f.properties.waterMillionGal !== null && f.properties.waterMillionGal !== undefined
    ).length;

    const compositeScore = Math.round(
      (avgCleanGridPct + company.cleanPower.score + company.waterTech.score + company.transparency.score) / 4
    );

    return {
      ...company,
      ownedSites,
      rentedSites,
      allSites,
      ownedCount: ownedSites.length,
      rentedCount: rentedSites.length,
      totalCount: allSites.length,
      avgCleanGridPct,
      trackedMw,
      waterDisclosedCount,
      compositeScore
    };
  }).sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Maps a 0..100 environmental score to the intuitive Red (low/harm) -> Amber (mixed) -> Green (stronger) palette.
 */
export function scoreToColor(score) {
  if (score >= 72) return '#34d399'; // Pass Green
  if (score >= 48) return '#f5b82e'; // Warning Amber
  return '#e5484d'; // Red (higher impact / opaque)
}
