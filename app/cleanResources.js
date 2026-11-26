/**
 * Verified Regional Grid Clean-Energy Profiles (U.S. EIA Electric Power Annual / EPA eGRID)
 * and Audited Corporate Clean-Energy & Water-Stewardship Disclosures.
 *
 * Distinctions enforced throughout the UI:
 * 1. Physical Local Grid Mix (Reported — EIA / EPA eGRID): Actual generation mix on the state/regional grid
 *    where the facility physically draws power (Renewables = wind, solar, hydro, geothermal, biomass;
 *    Carbon-Free = Renewables + Nuclear; Fossil = Natural Gas + Coal).
 * 2. Corporate Contracted Clean Energy (Reported — Corporate Sustainability Reports): Annual global/fleet MWh
 *    matched via Power Purchase Agreements (PPAs) or Renewable Energy Certificates (RECs), which finances clean
 *    power but does not mean 24/7 fossil-free local grid draw.
 * 3. Water Sourcing & Cooling Sustainability: Distinguishes potable evaporative draw from reclaimed/greywater
 *    ("recycled water") and closed-loop / air-cooled near-zero-evaporation designs.
 */

export const STATE_GRID_PROFILES = {
  AL: { ren: 9, nuc: 31, grid: 'SERC / Southern', note: 'Nuclear + natural gas dominant; modest hydro/biomass' },
  AK: { ren: 30, nuc: 0, grid: 'Alaska Railbelt / Isolated', note: 'Hydroelectric + natural gas' },
  AZ: { ren: 17, nuc: 29, grid: 'WECC Southwest (APS/SRP)', note: 'Palo Verde nuclear + strong solar, natural gas summer peaking' },
  AR: { ren: 10, nuc: 24, grid: 'MISO South / SPP', note: 'Nuclear + natural gas & coal' },
  CA: { ren: 54, nuc: 9, grid: 'CAISO', note: 'High solar, geothermal & hydro; evening natural gas + battery ramp' },
  CO: { ren: 41, nuc: 0, grid: 'WECC Rockies', note: 'Rapidly growing Plains wind & solar alongside natural gas/coal' },
  CT: { ren: 6, nuc: 37, grid: 'ISO New England', note: 'Millstone nuclear + natural gas' },
  DC: { ren: 12, nuc: 30, grid: 'PJM Interconnection', note: 'Draws from PJM regional nuclear/gas pool' },
  DE: { ren: 7, nuc: 0, grid: 'PJM Interconnection', note: 'Natural gas generation + PJM regional imports' },
  FL: { ren: 8, nuc: 12, grid: 'FRCC (Florida)', note: 'Heavily natural gas (~74%) with expanding utility solar + nuclear' },
  GA: { ren: 11, nuc: 31, grid: 'SERC (Georgia Power)', note: 'Plant Vogtle & Hatch nuclear + natural gas, solar & biomass' },
  HI: { ren: 31, nuc: 0, grid: 'Hawaiian Island Grids', note: 'Solar, wind & geothermal offsetting imported petroleum' },
  IA: { ren: 65, nuc: 0, grid: 'MISO West (MidAmerican)', note: 'Top U.S. wind-share state (~60%+ wind generation)' },
  ID: { ren: 74, nuc: 0, grid: 'NWPP (Idaho Power)', note: 'Hydroelectric + wind majority with natural gas seasonal support' },
  IL: { ren: 14, nuc: 54, grid: 'PJM / MISO (Illinois)', note: 'Largest U.S. nuclear fleet (~54%) + wind, low carbon intensity' },
  IN: { ren: 12, nuc: 0, grid: 'MISO / PJM (Indiana)', note: 'Historically coal & natural gas heavy (~88% fossil), expanding wind/solar' },
  KS: { ren: 47, nuc: 17, grid: 'SPP (Kansas)', note: 'Abundant Great Plains wind + Wolf Creek nuclear' },
  KY: { ren: 7, nuc: 0, grid: 'SERC / PJM (Kentucky)', note: 'Coal & natural gas dominant (~93% fossil)' },
  LA: { ren: 6, nuc: 17, grid: 'MISO South (Entergy)', note: 'Natural gas dominant (~75%+) with Waterford/River Bend nuclear' },
  MA: { ren: 26, nuc: 0, grid: 'ISO New England', note: 'Solar + regional hydro/nuclear imports, natural gas winter reliance' },
  MD: { ren: 13, nuc: 40, grid: 'PJM Interconnection', note: 'Calvert Cliffs nuclear + natural gas & PJM imports' },
  ME: { ren: 74, nuc: 0, grid: 'ISO New England', note: 'Hydroelectric, wind & biomass majority' },
  MI: { ren: 13, nuc: 29, grid: 'MISO (Michigan)', note: 'Nuclear + natural gas/coal with expanding wind & solar' },
  MN: { ren: 33, nuc: 23, grid: 'MISO West', note: 'Over 55% carbon-free from Plains wind, solar & two nuclear plants' },
  MO: { ren: 14, nuc: 12, grid: 'MISO / SPP', note: 'Coal & natural gas majority alongside Callaway nuclear + wind' },
  MS: { ren: 5, nuc: 16, grid: 'MISO South / TVA', note: 'Natural gas dominant (~78%) + Grand Gulf nuclear' },
  MT: { ren: 53, nuc: 0, grid: 'NWPP', note: 'Hydroelectric + wind majority alongside coal' },
  NC: { ren: 16, nuc: 33, grid: 'SERC (Duke Energy)', note: ' nearly 50% carbon-free via nuclear + strong utility solar' },
  ND: { ren: 38, nuc: 0, grid: 'SPP / MISO', note: 'High wind share alongside lignite coal' },
  NE: { ren: 35, nuc: 17, grid: 'SPP (OPPD / NPPD)', note: 'Wind + Cooper nuclear (~52% clean) alongside coal & gas' },
  NH: { ren: 19, nuc: 56, grid: 'ISO New England', note: '~75% carbon-free led by Seabrook nuclear + hydro/biomass' },
  NJ: { ren: 8, nuc: 42, grid: 'PJM Interconnection', note: '50% carbon-free via nuclear + solar alongside natural gas' },
  NM: { ren: 42, nuc: 0, grid: 'WECC Southwest', note: 'Rapidly growing wind & solar (~42%) alongside natural gas/coal' },
  NV: { ren: 40, nuc: 0, grid: 'WECC (NV Energy)', note: 'Utility solar, geothermal & Hoover hydro (~40%), natural gas balance' },
  NY: { ren: 31, nuc: 22, grid: 'NYISO', note: 'Upstate hydro/nuclear/wind (~90% clean upstate; gas-heavy downstate)' },
  OH: { ren: 8, nuc: 14, grid: 'PJM Interconnection (AEP)', note: 'Natural gas & coal (~78% fossil) with Perry/Davis-Besse nuclear' },
  OK: { ren: 43, nuc: 0, grid: 'SPP (Oklahoma)', note: 'Over 40% wind + hydro generation paired with natural gas' },
  OR: { ren: 68, nuc: 0, grid: 'NWPP / BPA', note: 'Columbia River hydroelectric + wind (~68% renewable)' },
  PA: { ren: 5, nuc: 33, grid: 'PJM Interconnection', note: 'Major nuclear & Marcellus natural gas exporter' },
  PR: { ren: 7, nuc: 0, grid: 'LUMA / PREPA Island Grid', note: 'Petroleum & LNG dominant (~93% fossil) with growing solar/storage' },
  RI: { ren: 12, nuc: 0, grid: 'ISO New England', note: 'Natural gas generation + offshore wind/solar' },
  SC: { ren: 9, nuc: 55, grid: 'SERC (Duke / Santee Cooper)', note: 'Over 64% carbon-free anchored by four major nuclear stations' },
  SD: { ren: 80, nuc: 0, grid: 'SPP / MISO', note: 'Wind + Missouri River hydro supply ~80% of state electricity' },
  TN: { ren: 12, nuc: 41, grid: 'TVA', note: '~53% carbon-free via TVA Watts Bar/Sequoyah nuclear + hydro dams' },
  TX: { ren: 29, nuc: 10, grid: 'ERCOT', note: '#1 U.S. wind & solar producer (~29%) + ~10% nuclear; ~61% gas/coal' },
  UT: { ren: 18, nuc: 0, grid: 'WECC (PacifiCorp)', note: 'Expanding solar/geothermal (~18%), historically coal & gas heavy' },
  VA: { ren: 11, nuc: 30, grid: 'PJM (Dominion Energy)', note: '~41% carbon-free (30% nuclear + 11% solar/hydro/biomass), ~59% gas/coal' },
  VT: { ren: 99, nuc: 0, grid: 'ISO New England', note: 'Nearly 100% renewable in-state generation (hydro, wind, biomass, solar)' },
  WA: { ren: 70, nuc: 8, grid: 'NWPP / BPA', note: '~78% carbon-free dominated by Columbia River hydroelectric dams' },
  WI: { ren: 14, nuc: 16, grid: 'MISO (Wisconsin)', note: 'Point Beach nuclear + wind/solar (~30% clean), ~70% gas & coal' },
  WV: { ren: 7, nuc: 0, grid: 'PJM Interconnection', note: 'Coal-dominant grid (~88%+ coal/gas) with mountain wind/hydro' },
  WY: { ren: 26, nuc: 0, grid: 'WECC Rockies', note: 'High Plains wind (~26%) alongside coal generation' }
};

export const ARID_HIGH_STRESS_STATES = new Set(['AZ', 'NV', 'UT', 'NM']);
export const MODERATE_HIGH_STRESS_STATES = new Set(['TX', 'CA', 'CO']);

/**
 * Returns verified physical regional grid mix + corporate contracted clean-energy status for a facility.
 */
export function getCleanEnergyProfile(props) {
  const p = props || {};
  const st = (p.state || '').toUpperCase();
  const grid = STATE_GRID_PROFILES[st] || {
    ren: 23,
    nuc: 19,
    grid: 'U.S. Interconnected Grid',
    note: 'U.S. national average mix (~23% renewable, ~19% nuclear, ~58% fossil)'
  };
  const cleanPct = Math.min(100, grid.ren + grid.nuc);
  const fossilPct = Math.max(0, 100 - cleanPct);

  const op = (p.operator || '').toLowerCase();
  const noteText = `${p.powerNote || ''} ${p.gridContext || ''}`.toLowerCase();
  const hasOnsiteGas =
    noteText.includes('gas turbine') ||
    noteText.includes('methane') ||
    noteText.includes('on-site natural gas') ||
    noteText.includes('bloom');

  let corpMatchPct = null;
  let corpStatus = 'undisclosed';
  let corpLabel = 'Undisclosed';
  let corpDetail = 'Operator has not published an audited renewable electricity matching figure for this facility.';

  if (op.includes('google')) {
    corpMatchPct = 100;
    corpStatus = 'reported';
    corpLabel = '100% Annual PPA Match (~66% 24/7 CFE)';
    corpDetail =
      'Google reports 100% global annual renewable electricity matching since 2017 and ~66% fleet-wide hourly 24/7 Carbon-Free Energy (Google Environmental Report).';
  } else if (op.includes('meta') || op.includes('facebook')) {
    corpMatchPct = 100;
    corpStatus = 'reported';
    corpLabel = '100% Annual Renewable Match';
    corpDetail = 'Meta reports matching 100% of operational data center electricity with contracted wind and solar PPAs (Meta Sustainability Report).';
  } else if (op.includes('microsoft')) {
    corpMatchPct = 100;
    corpStatus = 'reported';
    corpLabel = '100% Annual Renewable Match';
    corpDetail = 'Microsoft reports 100% renewable energy coverage via contracted PPAs and clean-energy attributes (Microsoft Sustainability Report).';
  } else if (op.includes('amazon') || op.includes('aws')) {
    corpMatchPct = 100;
    corpStatus = 'reported';
    corpLabel = '100% Annual Renewable Match';
    corpDetail = 'Amazon reports matching 100% of global electricity consumption across AWS with renewable energy sources (Amazon Sustainability Report).';
  } else if (op.includes('switch')) {
    corpMatchPct = 100;
    corpStatus = 'reported';
    corpLabel = '100% Renewable (Solar + Storage)';
    corpDetail = 'Switch reports powering 100% of its U.S. data center campuses with renewable energy since 2016.';
  } else if (op.includes('equinix')) {
    corpMatchPct = 96;
    corpStatus = 'reported';
    corpLabel = '96% Global Renewable Coverage';
    corpDetail = 'Equinix reports 96% renewable electricity coverage across its global colocation footprint via PPAs and green certificates.';
  } else if (op.includes('qts')) {
    corpMatchPct = 100;
    corpStatus = 'reported';
    corpLabel = '100% Renewable Procurement Target';
    corpDetail = 'QTS reports procuring renewable energy matching across its flagship North American hyperscale campuses.';
  } else if (op.includes('digital realty')) {
    corpMatchPct = 66;
    corpStatus = 'reported';
    corpLabel = '~66% Portfolio Renewable (100% U.S. Retail)';
    corpDetail = 'Digital Realty reports 100% renewable coverage for U.S. retail colocation and ~66% across its global portfolio.';
  } else if (op.includes('xai') || op.includes('spacex')) {
    corpStatus = 'reported';
    corpLabel = 'Grid + On-Site Gas Turbines (No 100% PPA)';
    corpDetail = 'Draws from TVA/MLGW grid supplemented by on-site natural gas turbines; no audited 100% renewable matching disclosure.';
  } else if (op.includes('openai') || op.includes('oracle') || op.includes('crusoe')) {
    corpStatus = 'estimated';
    corpLabel = 'Mixed Wind/Solar + Gas Generation';
    corpDetail = 'Combines grid renewables (e.g., West Texas wind) with dedicated on-site natural gas bridging/peaking generation.';
  }

  return {
    state: st,
    gridName: grid.grid,
    renewablePct: grid.ren,
    nuclearPct: grid.nuc,
    cleanPct,
    fossilPct,
    gridNote: grid.note,
    hasOnsiteGas,
    corpMatchPct,
    corpStatus,
    corpLabel,
    corpDetail
  };
}

/**
 * Returns verified water sourcing & cooling sustainability classification for a facility.
 */
export function getWaterSustainabilityProfile(props) {
  const p = props || {};
  const cooling = (p.coolingType || '').toLowerCase();
  const wNote = (p.waterNote || '').toLowerCase();
  const op = (p.operator || '').toLowerCase();

  const usesReclaimed =
    cooling.includes('reclaimed') ||
    cooling.includes('greywater') ||
    cooling.includes('wastewater') ||
    wNote.includes('reclaimed') ||
    wNote.includes('effluent') ||
    wNote.includes('purple-pipe') ||
    wNote.includes('greywater');

  const isZeroOrLowWater =
    cooling.includes('closed-loop') ||
    cooling.includes('air-cooled') ||
    cooling.includes('zero-evaporation') ||
    cooling.includes('zero-water');

  let sourceType = 'Undisclosed';
  let badgeStatus = 'undisclosed';
  let summary = 'Facility does not publicly report whether cooling uses potable municipal water, reclaimed wastewater, or dry air cooling.';

  if (usesReclaimed && isZeroOrLowWater) {
    sourceType = 'Hybrid Closed-Loop + Reclaimed Water';
    badgeStatus = 'reported';
    summary = 'Combines closed-loop/air cooling with non-potable reclaimed or industrial water pipelines.';
  } else if (usesReclaimed) {
    sourceType = cooling.includes('under construction')
      ? 'Transitioning to Recycled Greywater'
      : 'Reclaimed / Recycled Non-Potable Water';
    badgeStatus = 'reported';
    summary = 'Uses treated municipal wastewater / greywater for cooling towers to reduce draw on potable drinking-water supplies.';
  } else if (isZeroOrLowWater) {
    sourceType = 'Closed-Loop / Air-Cooled (Near-Zero Evaporation)';
    badgeStatus = p.waterStatus === 'reported' ? 'reported' : 'estimated';
    summary = 'Recirculates cooling fluid in a closed loop or uses dry air cooling—avoiding continuous evaporative water loss.';
  } else if (cooling.includes('evaporative')) {
    sourceType = 'Fresh / Municipal Evaporative Cooling';
    badgeStatus = 'reported';
    summary = 'Evaporates municipal, river, or aquifer water to reject server heat (nationally, >95% of data center water is potable/fresh).';
  }

  let replenishmentNote = null;
  if (op.includes('google')) {
    replenishmentNote = 'Corporate pledge: Google targets 120% watershed replenishment by 2030 (off-site restoration projects contracted across stressed basins).';
  } else if (op.includes('meta')) {
    replenishmentNote = 'Corporate pledge: Meta targets being Water Positive by 2030, funding off-site watershed restoration in high/medium water-stress basins.';
  } else if (op.includes('microsoft')) {
    replenishmentNote = 'Corporate pledge: Microsoft targets Water Positive by 2030 and closed-loop zero-water cooling on all new flagship AI designs.';
  } else if (op.includes('amazon') || op.includes('aws')) {
    replenishmentNote = 'Corporate pledge: AWS targets Water Positive by 2030 (reported >40% progress via watershed restoration & purple-pipe reclaimed water).';
  }

  return {
    usesReclaimed,
    isZeroOrLowWater,
    sourceType,
    badgeStatus,
    summary,
    replenishmentNote
  };
}
