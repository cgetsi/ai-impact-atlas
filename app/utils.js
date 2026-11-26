export const US_STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatNumber(n, decimals = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatMw(mw) {
  if (mw === null || mw === undefined || mw <= 0) return 'Undisclosed';
  if (mw >= 1000) return `${formatNumber(mw / 1000, 2)} GW`;
  return `${formatNumber(mw, mw < 10 ? 1 : 0)} MW`;
}

export function formatGallons(millionGal) {
  if (millionGal === null || millionGal === undefined) return 'Undisclosed';
  if (millionGal >= 1000) return `${formatNumber(millionGal / 1000, 2)}B gal/yr`;
  if (millionGal < 1) return `${formatNumber(millionGal, 2)}M gal/yr`;
  return `${formatNumber(millionGal, 1)}M gal/yr`;
}

export function formatAcres(acres, sqft) {
  if (acres && acres > 0) return `${formatNumber(acres, 0)} acres`;
  if (sqft && sqft > 0) return `${formatNumber(sqft / 1e6, 2)}M sq ft`;
  return 'Undisclosed';
}

/**
 * Rough average U.S. household electricity use is ~10.5 MWh/yr (EIA).
 * Continuous 1 MW @ ~80% utilization = ~7,008 MWh/yr ≈ 667 U.S. homes.
 */
export function mwToHomes(mw) {
  if (!mw || mw <= 0) return null;
  return Math.round(mw * 667);
}

export function mwhToHomes(mwh) {
  if (!mwh || mwh <= 0) return null;
  return Math.round(mwh / 10.5);
}

/**
 * Average U.S. household domestic water demand is ~90,000–100,000 gal/yr (~0.1M gal/yr, USGS/EPA).
 * Olympic-size swimming pool ≈ 660,000 gallons (0.66M gal).
 */
export function gallonsToContext(millionGal) {
  if (millionGal === null || millionGal === undefined || millionGal <= 0) return null;
  const homes = Math.round(millionGal * 10);
  if (millionGal >= 25) {
    return `≈ ${formatNumber(homes)} U.S. homes' water/yr`;
  }
  const pools = Math.max(1, Math.round(millionGal / 0.66));
  return `≈ ${formatNumber(homes)} U.S. homes/yr (~${formatNumber(pools)} Olympic pools)`;
}

/**
 * 1 sq mile = 640 acres; 1 American football field (incl. end zones) ≈ 1.32 acres.
 */
export function acresToContext(acres) {
  if (!acres || acres <= 0) return null;
  const fields = Math.round(acres / 1.32);
  if (acres >= 640) {
    return `≈ ${(acres / 640).toFixed(1)} sq mi (~${formatNumber(fields)} football fields)`;
  }
  if (acres >= 10) {
    return `≈ ${formatNumber(fields)} football fields`;
  }
  return null;
}

export function provenanceBadge(status) {
  const s = (status || 'undisclosed').toLowerCase();
  if (s === 'reported') return '<span class="prov-badge prov-reported">Reported</span>';
  if (s === 'estimated') return '<span class="prov-badge prov-estimated">Estimated</span>';
  return '<span class="prov-badge prov-undisclosed">Undisclosed</span>';
}

export function waterStressPill(level) {
  if (!level) return '';
  const l = level.toLowerCase();
  let cls = 'stress-low';
  if (l.includes('high') || l.includes('extreme')) cls = 'stress-high';
  else if (l.includes('med')) cls = 'stress-med';
  return `<span class="stress-pill ${cls}">Water Stress: ${escapeHtml(level)}</span>`;
}

export function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Hydrates compact GeoJSON features (such as PeeringDB registry points) with default fields
 * and precomputes fast search tokens + coordinate grouping keys.
 */
export function hydrateFeature(feature) {
  const p = feature.properties || {};
  if (!p.tier) p.tier = 'registry';
  if (!p.category) p.category = 'colocation';
  if (!p.status) p.status = 'Operating';
  if (!p.powerStatus) p.powerStatus = 'undisclosed';
  if (!p.waterStatus) p.waterStatus = 'undisclosed';
  if (!p.landStatus) p.landStatus = 'undisclosed';
  if (p.powerMw === undefined) p.powerMw = null;
  if (p.waterMillionGal === undefined) p.waterMillionGal = null;

  if (p.pdbId && !p.sources) {
    p.registrySource = 'PeeringDB Global Facility Registry';
    p.sources = [
      { label: `PeeringDB Facility Record (#${p.pdbId})`, url: `https://www.peeringdb.com/fac/${p.pdbId}` }
    ];
    if (p.website) {
      p.sources.push({ label: `Operator Website (${p.operator})`, url: p.website });
    }
  }

  const coords = (feature.geometry && feature.geometry.coordinates) || [0, 0];
  p._coordKey = `${ Number(coords[0]).toFixed(4) },${ Number(coords[1]).toFixed(4) }`;

  const stateFull = p.state ? US_STATE_NAMES[p.state] || '' : '';
  p._searchText = [
    p.name,
    p.operator,
    p.city,
    p.state,
    stateFull,
    p.county,
    p.address,
    p.aiUsers,
    p.chipTypes,
    p.coolingType,
    p.gridContext
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return feature;
}
