import { escapeHtml, formatNumber, formatMw } from './utils.js';
import { computeAiCompanyScorecards, computeAiOwnershipPie, scoreToColor } from './aiCompanies.js';

const LOCAL_SPOTLIGHTS = {
  energy: [
    { id: 'flagship-aws-project-rainier-indiana', label: 'AWS Rainier IN (2.25 GW)' },
    { id: 'flagship-meta-hyperion-louisiana', label: 'Meta Hyperion LA (2.0 GW)' },
    { id: 'flagship-stargate-abilene', label: 'Stargate TX (1.2 GW)' },
    { id: 'flagship-xai-colossus-memphis', label: 'xAI Memphis (1.0 GW)' }
  ],
  water: [
    { id: 'flagship-google-council-bluffs', label: 'Google IA (1.01B gal/yr)' },
    { id: 'flagship-google-douglas-county', label: 'Google GA (Recycled Water)' },
    { id: 'flagship-microsoft-goodyear', label: 'Microsoft AZ (High Stress)' },
    { id: 'flagship-microsoft-fairwater-wisconsin', label: 'Microsoft WI (Closed-Loop)' }
  ],
  land: [
    { id: 'flagship-meta-hyperion-louisiana', label: 'Meta LA (3,200 acres)' },
    { id: 'flagship-aws-project-rainier-indiana', label: 'AWS IN (1,200 acres)' },
    { id: 'flagship-stargate-abilene', label: 'Stargate TX (1,100 acres)' },
    { id: 'flagship-google-council-bluffs', label: 'Google IA (1,000 acres)' }
  ]
};

/**
 * Multi-stop consumption intensity color ramp:
 * Largest consumer (t = 0) -> Red (#e5484d) -> Orange (#f47a20) -> Yellow (#ecc335)
 * -> Soft Pass Green (#58b674) -> Calm Low-Intensity Muted Sage (t = 1, #38857a).
 */
const INTENSITY_STOPS = [
  { t: 0.0, rgb: [229, 72, 77] },   // Red (largest consumer)
  { t: 0.25, rgb: [244, 122, 32] }, // Orange
  { t: 0.5, rgb: [236, 195, 53] },  // Yellow / Amber
  { t: 0.75, rgb: [88, 182, 116] }, // Pass Green
  { t: 1.0, rgb: [56, 133, 122] }   // Quiet Muted Sage-Green (smallest consumer)
];

function interpolateColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < INTENSITY_STOPS.length - 1; i++) {
    const a = INTENSITY_STOPS[i];
    const b = INTENSITY_STOPS[i + 1];
    if (clamped >= a.t && clamped <= b.t) {
      const local = (clamped - a.t) / (b.t - a.t);
      const r = Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * local);
      const g = Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * local);
      const bl = Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * local);
      return `rgb(${r}, ${g}, ${bl})`;
    }
  }
  const last = INTENSITY_STOPS[INTENSITY_STOPS.length - 1].rgb;
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

function getRankIntensityColor(index, total) {
  if (total <= 1) return interpolateColor(0);
  return interpolateColor(index / (total - 1));
}

function buildStripedFillStyle(baseColor) {
  return `background: repeating-linear-gradient(-45deg, ${baseColor}, ${baseColor} 6px, rgba(20, 22, 26, 0.38) 6px, rgba(20, 22, 26, 0.38) 12px); background-color: ${baseColor};`;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  };
}

function describeDonutArc(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const span = Math.min(359.99, Math.max(0.01, endAngle - startAngle));
  const end = startAngle + span;
  const largeArc = span > 180 ? 1 : 0;

  const p1 = polarToCartesian(cx, cy, rOuter, end);
  const p2 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p3 = polarToCartesian(cx, cy, rInner, startAngle);
  const p4 = polarToCartesian(cx, cy, rInner, end);

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z'
  ].join(' ');
}

export class IndustryCompareView {
  constructor(data, { onJumpToFacility, onFilterAiCompany, onMetricChange, initialMetric = 'energy', allFeatures = [] } = {}) {
    this.data = data;
    this.allFeatures = allFeatures;
    this.onJumpToFacility = onJumpToFacility;
    this.onFilterAiCompany = onFilterAiCompany;
    this.onMetricChange = onMetricChange;
    this.activeMetric = ['energy', 'water', 'land', 'companies'].includes(initialMetric) ? initialMetric : 'energy';
    this.chartType = 'pie'; // 'pie' | 'vbar'
    this.showDeepNotes = false;

    this.heroEl = document.getElementById('compareHeroKpis');
    this.contentEl = document.getElementById('compareContent');
    this.tabs = document.querySelectorAll('.compare-tab[data-metric]');

    this.renderHero();
    this.bindEvents();
    this.syncTabButtons();
    this.renderMetric();
  }

  setMetric(metric, notify = false) {
    if (!['energy', 'water', 'land', 'companies'].includes(metric)) return;
    if (this.activeMetric === metric) return;
    this.activeMetric = metric;
    this.syncTabButtons();
    this.renderMetric();
    if (notify && this.onMetricChange) {
      this.onMetricChange(this.activeMetric);
    }
  }

  syncTabButtons() {
    this.tabs.forEach((t) => {
      const isActive = t.dataset.metric === this.activeMetric;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });
  }

  bindEvents() {
    this.tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setMetric(btn.dataset.metric, true);
      });
    });
  }

  renderHero() {
    if (!this.heroEl) return;
    const h = this.data.headlineStats;
    const renShare = h.dcPhysicalRenewableSharePct ?? 24;
    const nucShare = h.dcPhysicalNuclearSharePct ?? 20;
    this.heroEl.innerHTML = `
      <div class="hero-kpi">
        <div class="hero-kpi-val">${h.dcElectricity2023SharePct}%</div>
        <div class="hero-kpi-label">of U.S. Electricity</div>
        <div class="hero-kpi-sub detail-only">${h.dcElectricity2023Twh} TWh · Projected ${h.dcElectricity2028ShareRange} by 2028</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">~${renShare + nucShare}%</div>
        <div class="hero-kpi-label">Carbon-Free Grid Mix</div>
        <div class="hero-kpi-sub detail-only">${renShare}% renewable + ${nucShare}% nuclear on local grids</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${h.dcDirectWater2023BillionGal}B gal</div>
        <div class="hero-kpi-label">Direct Cooling Water</div>
        <div class="hero-kpi-sub detail-only">44× less than golf courses (&lt;5% recycled)</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">0.005%</div>
        <div class="hero-kpi-label">of U.S. Land</div>
        <div class="hero-kpi-sub detail-only">~${formatNumber(h.dcEstimatedLandAcres)} acres vs. 2M acres of golf courses</div>
      </div>
    `;
  }

  formatBarValue(val, metric) {
    if (metric === 'energy') return `${formatNumber(val, 0)} TWh`;
    if (metric === 'water') {
      if (val >= 1000) return `${formatNumber(val, 0)}B gal`;
      return `${formatNumber(val, val < 100 ? 1 : 0)}B gal`;
    }
    if (val >= 1e6) return `${formatNumber(val / 1e6, val >= 10e6 ? 0 : 1)}M acres`;
    if (val >= 1e3) return `${formatNumber(val / 1e3, 0)}k acres`;
    return `${formatNumber(val, 0)} acres`;
  }

  formatCompactValue(val, metric) {
    if (metric === 'energy') return `${formatNumber(val, 0)} TWh`;
    if (metric === 'water') {
      if (val >= 1000) return `${(val / 1000).toFixed(1)}T gal`;
      return `${formatNumber(val, val < 50 ? 1 : 0)}B gal`;
    }
    if (val >= 1e6) return `${Math.round(val / 1e6)}M ac`;
    return `${Math.round(val / 1e3)}k ac`;
  }

  formatMultipleVsBaseline(val, baselineVal) {
    if (!baselineVal || baselineVal <= 0) return '';
    const ratio = val / baselineVal;
    if (Math.abs(ratio - 1) < 0.02) return 'Baseline';
    if (ratio >= 100) return `${formatNumber(Math.round(ratio))}× DCs`;
    if (ratio >= 10) return `${formatNumber(ratio, 0)}× DCs`;
    if (ratio >= 1) return `${formatNumber(ratio, 1)}× DCs`;
    return `${formatNumber(ratio, 2)}× DCs`;
  }

  buildCleanMiniStrip() {
    if (!this.data.cleanBreakdown) return '';
    const key = this.activeMetric === 'energy' ? 'electricity' : this.activeMetric === 'water' ? 'water' : null;
    if (!key || !this.data.cleanBreakdown[key]) return '';

    const info = this.data.cleanBreakdown[key];
    const isWater = key === 'water';

    const items = isWater
      ? [
          {
            id: 'rec',
            label: 'Recycled',
            sub: 'Treated Greywater',
            pct: 5,
            pctText: '<5%',
            color: '#10b981',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>'
          },
          {
            id: 'fresh',
            label: 'Fresh Water',
            sub: 'Municipal · River · Aquifer',
            pct: 95,
            pctText: '95%+',
            color: '#64748b',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
          }
        ]
      : [
          {
            id: 'ren',
            label: 'Renewable',
            sub: 'Wind · Solar · Hydro',
            pct: 24,
            pctText: '24%',
            color: '#10b981',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>'
          },
          {
            id: 'nuc',
            label: 'Nuclear',
            sub: 'Zero-Carbon Baseload',
            pct: 20,
            pctText: '20%',
            color: '#38bdf8',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="10" ry="4.2"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)"/></svg>'
          },
          {
            id: 'fos',
            label: 'Fossil',
            sub: 'Gas 40% · Coal 16%',
            pct: 56,
            pctText: '56%',
            color: '#64748b',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'
          }
        ];

    const cellsHtml = [];
    items.forEach((item) => {
      for (let i = 0; i < item.pct; i++) {
        if (isWater) {
          cellsHtml.push(`
            <div class="waffle-drop waffle-unit" data-waffle-cat="${item.id}" style="color:${item.color}" title="${escapeHtml(item.label)}: ${escapeHtml(item.pctText)}">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5C12 2.5 5 10.2 5 14.8a7 7 0 0 0 14 0C19 10.2 12 2.5 12 2.5z"/></svg>
            </div>
          `);
        } else {
          cellsHtml.push(
            `<div class="waffle-cell waffle-unit" data-waffle-cat="${item.id}" style="background:${item.color}" title="${escapeHtml(item.label)}: ${escapeHtml(item.pctText)}"></div>`
          );
        }
      }
    });

    const statCardsHtml = items
      .map(
        (item) => `
        <div class="waffle-stat-card" data-waffle-hover="${item.id}">
          <div class="waffle-stat-left">
            <span class="waffle-stat-icon" style="background:${item.color}22; color:${item.color}">${item.icon}</span>
            <div>
              <div class="waffle-stat-name">${escapeHtml(item.label)}</div>
              <div class="waffle-stat-sub">${escapeHtml(item.sub)}</div>
            </div>
          </div>
          <div class="waffle-stat-pct" style="color:${item.color}">${escapeHtml(item.pctText)}</div>
        </div>
      `
      )
      .join('');

    const heading = isWater ? 'Cooling Water Source' : 'Electricity Source Mix';
    const summaryPill = isWater ? '5 in 100 Recycled' : '44% Carbon-Free';

    return `
      <div class="national-clean-box">
        <div class="national-clean-top">
          <div class="waffle-title-group">
            <h3>${escapeHtml(heading)}</h3>
            <span class="waffle-summary-pill ${isWater ? 'is-water' : 'is-clean'}">${escapeHtml(summaryPill)}</span>
          </div>
          <span class="prov-badge prov-reported detail-only">${escapeHtml(info.source)}</span>
        </div>
        <div class="waffle-layout">
          <div class="waffle-grid" role="img" aria-label="${escapeHtml(heading)}: ${items.map((i) => `${i.label} ${i.pctText}`).join(', ')}">
            ${cellsHtml.join('')}
          </div>
          <div class="waffle-cards">${statCardsHtml}</div>
        </div>
        <p class="national-clean-note detail-prose">${escapeHtml(info.explanation)}</p>
      </div>
    `;
  }

  buildPieChartHtml(section) {
    const rawSlices = section.pieSlices || [];
    if (!rawSlices.length) return '';

    // Sort from largest consumer (Red) to smallest consumer (Calm Green)
    const slices = [...rawSlices].sort((a, b) => b.value - a.value);
    const dcIdx = Math.max(0, slices.findIndex((s) => s.isDc));
    const dcSlice = slices[dcIdx];

    const minDeg = 3.8;
    const totalRaw = slices.reduce((acc, s) => acc + s.value, 0);
    const rawDegs = slices.map((s) => (s.value / totalRaw) * 360);
    let deficit = 0;
    const adjDegs = rawDegs.map((d) => {
      if (d < minDeg) {
        deficit += minDeg - d;
        return minDeg;
      }
      return d;
    });
    const largeSum = rawDegs.reduce((acc, d) => (d >= minDeg ? acc + d : acc), 0);
    const finalDegs = adjDegs.map((d, i) => (rawDegs[i] >= minDeg ? d - (rawDegs[i] / largeSum) * deficit : d));

    // Rotate starting angle so the Data Center slice always sits cleanly at 36° (upper-right ~1:15 o'clock)
    const dcUnrotatedMid = finalDegs.slice(0, dcIdx).reduce((a, b) => a + b, 0) + finalDegs[dcIdx] / 2;
    const targetDcAngle = 36;
    const startRotation = targetDcAngle - dcUnrotatedMid;

    const cx = 142;
    const cy = 156;
    const rOuter = 114;
    const rInner = 65;
    const dcPullOut = 20;

    let angle = startRotation;
    const regularPaths = [];
    let dcPathHtml = '';
    let calloutHtml = '';

    slices.forEach((s, idx) => {
      const span = finalDegs[idx];
      const start = angle;
      const end = angle + span;
      angle = end;

      const midAngle = start + span / 2;
      const offset = s.isDc ? dcPullOut : 0;
      const rad = ((midAngle - 90) * Math.PI) / 180;
      const dx = (offset * Math.cos(rad)).toFixed(2);
      const dy = (offset * Math.sin(rad)).toFixed(2);

      const sliceColor = getRankIntensityColor(idx, slices.length);
      const d = describeDonutArc(cx, cy, s.isDc ? rOuter + 2 : rOuter, rInner, start, end);
      const pctStr = s.pct < 0.01 ? `${s.pct.toFixed(3)}%` : s.pct < 1 ? `${s.pct.toFixed(2)}%` : `${s.pct.toFixed(1)}%`;

      const pathMarkup = `
        <path
          class="pie-slice ${s.isDc ? 'is-dc' : ''}"
          data-slice-id="${escapeHtml(s.id)}"
          data-label="${escapeHtml(s.label)}"
          data-pct="${escapeHtml(pctStr)}"
          data-val="${escapeHtml(this.formatBarValue(s.value, this.activeMetric))}"
          d="${d}"
          fill="${sliceColor}"
          transform="translate(${dx}, ${dy})"
        >
          <title>${escapeHtml(s.label)}: ${pctStr} (${this.formatBarValue(s.value, this.activeMetric)})</title>
        </path>
      `;

      if (s.isDc) {
        dcPathHtml = pathMarkup;
        const tipPt = polarToCartesian(cx, cy, rOuter + dcPullOut + 5, midAngle);
        const elbowPt = polarToCartesian(cx, cy, rOuter + dcPullOut + 18, midAngle);
        const pillText = `DC · ${section.dcShareLabel || pctStr}`;
        calloutHtml = `
          <g class="pie-dc-callout" pointer-events="none">
            <polyline
              points="${tipPt.x.toFixed(1)},${tipPt.y.toFixed(1)} ${elbowPt.x.toFixed(1)},${elbowPt.y.toFixed(1)} ${(elbowPt.x + 8).toFixed(1)},${elbowPt.y.toFixed(1)}"
              fill="none"
              stroke="var(--dc-outline)"
              stroke-width="1.75"
              stroke-linecap="round"
            />
            <rect
              x="${(elbowPt.x + 9).toFixed(1)}"
              y="${(elbowPt.y - 11).toFixed(1)}"
              width="82"
              height="22"
              rx="6"
              class="pie-callout-box"
            />
            <text
              x="${(elbowPt.x + 50).toFixed(1)}"
              y="${(elbowPt.y + 4).toFixed(1)}"
              text-anchor="middle"
              class="pie-callout-text"
            >${escapeHtml(pillText)}</text>
          </g>
        `;
      } else {
        regularPaths.push(pathMarkup);
      }
    });

    const centerSvgHtml = `
      <g class="pie-center-svg" pointer-events="none">
        <text id="pieCenterPct" x="${cx}" y="${cy - 8}" text-anchor="middle" class="pie-center-pct-svg">${escapeHtml(section.dcShareLabel || '')}</text>
        <text id="pieCenterTitle" x="${cx}" y="${cy + 11}" text-anchor="middle" class="pie-center-title-svg">U.S. Data Centers</text>
        <text id="pieCenterSub" x="${cx}" y="${cy + 27}" text-anchor="middle" class="pie-center-sub-svg">${escapeHtml(this.formatBarValue(dcSlice.value, this.activeMetric))}</text>
      </g>
    `;

    // Render dcPathHtml after regular slices so adjacent wedges never clip its white border
    const paths = regularPaths.join('') + dcPathHtml + calloutHtml + centerSvgHtml;

    const legendCards = slices
      .map((s, idx) => {
        const sliceColor = getRankIntensityColor(idx, slices.length);
        const pctStr = s.pct < 0.01 ? `${s.pct.toFixed(3)}%` : s.pct < 1 ? `${s.pct.toFixed(2)}%` : `${s.pct.toFixed(1)}%`;
        return `
          <div class="pie-legend-row ${s.isDc ? 'is-dc' : ''}" data-slice-target="${escapeHtml(s.id)}">
            <span class="pie-swatch" style="background:${sliceColor}"></span>
            <div class="pie-legend-main">
              <span class="pie-legend-name">${escapeHtml(s.label)}${s.isDc ? ' <span class="dc-marker-pill">DC</span>' : ''}</span>
              <span class="pie-legend-val">${escapeHtml(this.formatBarValue(s.value, this.activeMetric))}</span>
            </div>
            <span class="pie-legend-pct">${escapeHtml(pctStr)}</span>
          </div>
        `;
      })
      .join('');

    const noteCallout =
      dcSlice.pct < 1
        ? `<div class="pie-magnifier-badge detail-only">
             <span>Data center sliver slightly widened to stay visible — actual share is <strong>${escapeHtml(section.dcShareLabel)}</strong> (${escapeHtml(section.dcProjectionCallout)})</span>
           </div>`
        : `<div class="pie-magnifier-badge detail-only">
             <span>${escapeHtml(section.dcProjectionCallout || '')}</span>
           </div>`;

    return `
      <div class="pie-stage">
        <div class="pie-wheel-wrap">
          <svg class="pie-svg" viewBox="16 8 320 278" role="img" aria-label="U.S. share breakdown pie chart">
            ${paths}
          </svg>
        </div>

        <div class="pie-legend-col">
          <div class="pie-legend-list">${legendCards}</div>
          ${noteCallout}
        </div>
      </div>
    `;
  }

  buildVerticalBarChartHtml(items, maxVal) {
    const colsHtml = items
      .map((item, idx) => {
        // Scale tallest bar to 86% of track height so the top value label sits cleanly inside the frame
        const rawPct = (item.value / maxVal) * 86;
        const heightPct = Math.max(0, rawPct);
        const isDc = item.category === 'datacenter' || item.category === 'datacenter_proj';
        const isProj = item.category === 'datacenter_proj';
        const barColor = getRankIntensityColor(idx, items.length);
        const fillStyle = isProj
          ? `height:${heightPct.toFixed(2)}%; ${buildStripedFillStyle(barColor)}`
          : `height:${heightPct.toFixed(2)}%; background:${barColor};`;

        const shortLbl = item.label
          .replace('U.S. Data Centers ', 'Data Centers ')
          .replace('U.S. Hyperscale Data Centers — ', 'Hyperscale DCs ')
          .replace(' (Residential Total)', '')
          .replace(' (excl. Data Centers)', '')
          .replace(' (All Industrial)', '')
          .replace(' (Withdrawals)', '')
          .replace(' (Evaporative Consumption)', '')
          .replace(' (~15,500 courses)', '')
          .replace(' (~15,500 facilities)', '')
          .replace(' (Estimated Campuses)', '');

        return `
          <div class="vbar-col ${isDc ? 'is-dc' : ''}" title="${escapeHtml(item.label)}: ${escapeHtml(this.formatBarValue(item.value, this.activeMetric))}">
            <div class="vbar-track">
              <div class="vbar-val" style="bottom:calc(${heightPct.toFixed(2)}% + 5px)">${escapeHtml(this.formatCompactValue(item.value, this.activeMetric))}</div>
              <div class="vbar-fill" style="${fillStyle}"></div>
            </div>
            <div class="vbar-lbl">${escapeHtml(shortLbl)}</div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="vbar-stage-wrap">
        <div class="vbar-grid">${colsHtml}</div>
      </div>
    `;
  }

  buildAiOwnershipPieHtml(pieSlices) {
    if (!pieSlices || !pieSlices.length) return '';
    const totalSites = pieSlices.reduce((acc, s) => acc + s.count, 0);

    const cx = 142;
    const cy = 142;
    const rOuter = 114;
    const rInner = 64;

    let angle = 0;
    const paths = pieSlices
      .map((s) => {
        const span = (s.count / totalSites) * 360;
        const start = angle;
        const end = angle + span;
        angle = end;

        const color = s.color || '#64748b';
        const d = describeDonutArc(cx, cy, rOuter, rInner, start, end);
        const pctStr = `${s.pct.toFixed(1)}%`;

        return `
          <path
            class="pie-slice"
            data-co-slice="${escapeHtml(s.id)}"
            data-label="${escapeHtml(s.label)}"
            data-pct="${escapeHtml(pctStr)}"
            data-val="${s.count} ${s.count === 1 ? 'campus' : 'campuses'}"
            ${s.companyId ? `data-slice-company="${escapeHtml(s.companyId)}"` : ''}
            d="${d}"
            fill="${color}"
          >
            <title>${escapeHtml(s.label)}: ${s.count} sites (${pctStr})</title>
          </path>
        `;
      })
      .join('');

    const centerSvg = `
      <g class="pie-center-svg" pointer-events="none">
        <text id="coPieCenterVal" x="${cx}" y="${cy - 8}" text-anchor="middle" class="pie-center-pct-svg">${totalSites}</text>
        <text id="coPieCenterTitle" x="${cx}" y="${cy + 11}" text-anchor="middle" class="pie-center-title-svg">AI Campuses</text>
        <text id="coPieCenterSub" x="${cx}" y="${cy + 27}" text-anchor="middle" class="pie-center-sub-svg">Owned / Run</text>
      </g>
    `;

    const legendCards = pieSlices
      .map((s) => {
        const color = s.color || '#64748b';
        const pctStr = `${s.pct.toFixed(1)}%`;
        return `
          <div class="pie-legend-row" data-co-target="${escapeHtml(s.id)}" ${s.companyId ? `data-filter-company="${escapeHtml(s.companyId)}"` : ''}>
            <span class="pie-swatch" style="background:${color}"></span>
            <div class="pie-legend-main">
              <span class="pie-legend-name">${escapeHtml(s.label)}</span>
              <span class="pie-legend-val">${s.count} ${s.count === 1 ? 'site' : 'sites'}</span>
            </div>
            <span class="pie-legend-pct">${escapeHtml(pctStr)}</span>
          </div>
        `;
      })
      .join('');

    return `
      <div class="co-pie-section">
        <div class="compare-header" style="margin-bottom:4px">
          <div>
            <h2>U.S. AI Campuses Owned / Run by Company</h2>
            <p class="detail-prose">Slice width shows total campuses owned; slice color reflects each company's environmental standing below.</p>
          </div>
        </div>
        <div class="pie-stage">
          <div class="pie-wheel-wrap co-pie-wrap">
            <svg class="pie-svg co-pie-svg" viewBox="18 18 248 248" role="img" aria-label="Owned AI data center share by company, colored by environmental standing">
              ${paths}
              ${centerSvg}
            </svg>
          </div>
          <div class="pie-legend-col">
            <div class="pie-legend-list co-pie-legend-list">${legendCards}</div>
          </div>
        </div>
        <div class="co-legend" aria-label="Pie chart encoding legend">
          <span class="intensity-lbl">Slice Width = Fleet Size</span>
          <span class="intensity-sep">·</span>
          <span class="co-legend-item"><i class="mix-dot" style="background:#10b981"></i>Stronger</span>
          <span class="co-legend-item"><i class="mix-dot" style="background:#f59e0b"></i>Mixed</span>
          <span class="co-legend-item"><i class="mix-dot" style="background:#e5484d"></i>Higher Impact</span>
          <span class="co-legend-item"><i class="mix-dot" style="background:#64748b"></i>3rd-Party Host</span>
        </div>
      </div>
    `;
  }

  renderAiCompaniesScorecard() {
    const cards = computeAiCompanyScorecards(this.allFeatures);
    const pieSlices = computeAiOwnershipPie(this.allFeatures);
    const totalOwned = pieSlices.reduce((acc, s) => acc + s.count, 0);

    const buildMeter = (label, pct, tag, detail) => {
      const col = scoreToColor(pct);
      return `
        <div class="co-meter" title="${escapeHtml(label)}: ${escapeHtml(tag)}">
          <div class="co-meter-head">
            <span class="co-meter-lbl">${escapeHtml(label)}</span>
            <span class="co-meter-tag detail-only" style="color:${col}">${escapeHtml(tag)}</span>
          </div>
          <div class="co-meter-track">
            <div class="co-meter-fill" style="width:${Math.max(0, Math.min(100, pct))}%; background:${col}"></div>
          </div>
          ${detail ? `<div class="co-meter-detail detail-prose">${escapeHtml(detail)}</div>` : ''}
        </div>
      `;
    };

    const cardsHtml = cards
      .map((co) => {
        const standingCls =
          co.standing === 'stronger'
            ? 'standing-good'
            : co.standing === 'higher_impact'
              ? 'standing-high'
              : 'standing-mixed';

        const siteBreakdown =
          co.rentedCount > 0
            ? `${co.ownedCount} built · ${co.rentedCount} rented`
            : `${co.ownedCount} built`;

        return `
          <article class="co-card">
            <div class="co-card-head">
              <div class="co-title-wrap">
                <div class="co-title-row">
                  <h3 class="co-name">${escapeHtml(co.name)}</h3>
                  <span class="standing-pill ${standingCls}">${escapeHtml(co.standingLabel)}</span>
                </div>
                <div class="co-meta-row detail-only">
                  <span>${escapeHtml(siteBreakdown)}</span>
                  ${co.trackedMw > 0 ? `<span>· ${escapeHtml(formatMw(co.trackedMw))} linked</span>` : ''}
                  <span>· ${co.waterDisclosedCount}/${co.totalCount} disclose water</span>
                </div>
              </div>
              <button class="co-map-btn" data-filter-company="${escapeHtml(co.id)}" type="button">
                Map (${co.totalCount}) →
              </button>
            </div>

            <div class="co-meters-grid">
              ${buildMeter(
                'Clean Grid',
                co.avgCleanGridPct,
                `${co.avgCleanGridPct}% avg`,
                `Live EPA eGRID / EIA carbon-free average across ${co.totalCount} mapped U.S. campuses.`
              )}
              ${buildMeter('Clean Power', co.cleanPower.score, co.cleanPower.tag, co.cleanPower.detail)}
              ${buildMeter('Water Tech', co.waterTech.score, co.waterTech.tag, co.waterTech.detail)}
              ${buildMeter('Transparency', co.transparency.score, co.transparency.tag, co.transparency.detail)}
            </div>
          </article>
        `;
      })
      .join('');

    this.contentEl.innerHTML = `
      ${this.buildAiOwnershipPieHtml(pieSlices)}

      <div class="co-section-divider"></div>

      <div class="compare-header">
        <div>
          <h2>Environmental Scorecard</h2>
          <p class="detail-prose">Scored across physical grid cleanliness (EPA eGRID), renewable power vs. on-site gas, water cooling tech, and site-level transparency—including both owned and rented compute.</p>
        </div>
        <div class="co-legend" aria-label="Standing color legend">
          <span class="co-legend-item"><i class="mix-dot" style="background:#34d399"></i>Stronger</span>
          <span class="co-legend-item"><i class="mix-dot" style="background:#f5b82e"></i>Mixed</span>
          <span class="co-legend-item"><i class="mix-dot" style="background:#e5484d"></i>Higher Impact / Opaque</span>
        </div>
      </div>

      <div class="co-scorecard-list">${cardsHtml}</div>

      <div class="distinction-banner detail-only">
        <strong>Owned vs. Rented Compute:</strong> The pie chart above counts who directly owns/builds each of the ${totalOwned} tracked U.S. AI campuses (zero double-counting). In the scorecard below, AI labs like OpenAI and Anthropic also include partner-hosted cloud campuses (Microsoft Azure, AWS, Oracle, CoreWeave).
      </div>
    `;

    // Bind interactive hover sync on the Ownership Pie Chart
    const svgEl = this.contentEl.querySelector('.co-pie-svg');
    const legendListEl = this.contentEl.querySelector('.co-pie-legend-list');
    const centerVal = this.contentEl.querySelector('#coPieCenterVal');
    const centerTitle = this.contentEl.querySelector('#coPieCenterTitle');
    const centerSub = this.contentEl.querySelector('#coPieCenterSub');

    const highlightCoSlice = (id) => {
      if (svgEl) svgEl.classList.add('has-hover');
      if (legendListEl) legendListEl.classList.add('has-hover');
      const centerNode = svgEl ? svgEl.querySelector('.pie-center-svg') : null;
      this.contentEl.querySelectorAll('[data-co-slice]').forEach((el) => {
        const match = el.dataset.coSlice === id;
        el.classList.toggle('hovered', match);
        if (match) {
          if (svgEl && centerNode) svgEl.insertBefore(el, centerNode);
          if (centerVal && centerTitle && centerSub) {
            centerVal.textContent = el.dataset.pct;
            centerTitle.textContent = el.dataset.label;
            centerSub.textContent = el.dataset.val;
          }
        }
      });
      this.contentEl.querySelectorAll('[data-co-target]').forEach((row) => {
        row.classList.toggle('hovered', row.dataset.coTarget === id);
      });
    };

    const resetCoSlice = () => {
      if (svgEl) svgEl.classList.remove('has-hover');
      if (legendListEl) legendListEl.classList.remove('has-hover');
      this.contentEl.querySelectorAll('[data-co-slice], [data-co-target]').forEach((el) => el.classList.remove('hovered'));
      if (centerVal && centerTitle && centerSub) {
        centerVal.textContent = String(totalOwned);
        centerTitle.textContent = 'AI Campuses';
        centerSub.textContent = 'Owned / Run';
      }
    };

    this.contentEl.querySelectorAll('[data-co-slice]').forEach((el) => {
      el.addEventListener('mouseenter', () => highlightCoSlice(el.dataset.coSlice));
      el.addEventListener('mouseleave', resetCoSlice);
      if (el.dataset.sliceCompany) {
        el.addEventListener('click', () => {
          if (this.onFilterAiCompany) this.onFilterAiCompany(el.dataset.sliceCompany);
        });
      }
    });
    this.contentEl.querySelectorAll('[data-co-target]').forEach((row) => {
      row.addEventListener('mouseenter', () => highlightCoSlice(row.dataset.coTarget));
      row.addEventListener('mouseleave', resetCoSlice);
    });

    this.contentEl.querySelectorAll('[data-filter-company]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.onFilterAiCompany) {
          this.onFilterAiCompany(btn.dataset.filterCompany);
        }
      });
    });
  }

  renderMetric() {
    if (this.activeMetric === 'companies') {
      this.renderAiCompaniesScorecard();
      return;
    }

    const section = this.data[this.activeMetric];
    const items = [...section.items].sort((a, b) => b.value - a.value);
    const maxVal = Math.max(...items.map((i) => i.value));
    const dcBaselineItem = items.find((i) => i.category === 'datacenter');
    const dcBaseline = dcBaselineItem ? dcBaselineItem.value : null;

    const titles = {
      energy: 'Electricity Share — Data Centers vs. U.S. Sectors',
      water: 'Water Share — Data Centers vs. Major Users',
      land: 'Land Footprint — Data Centers vs. U.S. Land'
    };

    const mainVisualHtml =
      this.chartType === 'vbar' ? this.buildVerticalBarChartHtml(items, maxVal) : this.buildPieChartHtml(section);

    const intensityLegendHtml = `
      <div class="intensity-legend" aria-label="Resource consumption color scale">
        <span class="intensity-lbl">Highest Consumer</span>
        <span class="intensity-gradient-bar"></span>
        <span class="intensity-lbl">Smallest Consumer</span>
        <span class="intensity-sep">·</span>
        <span class="chart-legend-item"><span class="swatch swatch-dc-outline"></span>Data Centers</span>
        ${
          this.chartType !== 'pie'
            ? '<span class="intensity-sep">·</span><span class="chart-legend-item"><span class="swatch swatch-striped-neutral"></span>Striped = 2028 Forecast / Indirect</span>'
            : ''
        }
      </div>
    `;

    const spotlights = LOCAL_SPOTLIGHTS[this.activeMetric] || [];
    const spotlightHtml = spotlights.length
      ? `
        <div class="spotlight-row detail-only">
          <span class="spotlight-lbl">See on map:</span>
          ${spotlights
            .map(
              (s) => `<button class="spotlight-chip" data-jump-id="${escapeHtml(s.id)}" type="button">${escapeHtml(s.label)} →</button>`
            )
            .join('')}
        </div>
      `
      : '';

    this.contentEl.innerHTML = `
      <div class="compare-header">
        <div>
          <h2>${titles[this.activeMetric]}</h2>
          <p class="detail-prose">${escapeHtml(section.subtitle)} (${escapeHtml(section.unit)})</p>
        </div>
        <div class="scale-toggle" role="group" aria-label="Visual chart style">
          <button class="scale-btn ${this.chartType === 'pie' ? 'active' : ''}" data-chart="pie" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
            Pie Chart
          </button>
          <button class="scale-btn ${this.chartType === 'vbar' ? 'active' : ''}" data-chart="vbar" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Bar Chart
          </button>
        </div>
      </div>

      ${mainVisualHtml}
      ${intensityLegendHtml}
      ${this.buildCleanMiniStrip()}

      ${spotlightHtml}

      <div class="compare-deep-notes detail-only">
        <div class="takeaway-banner">${escapeHtml(section.takeaway)}</div>
        ${
          section.distinctionNote
            ? `<div class="distinction-banner" style="margin-top:10px"><strong>Key distinction:</strong> ${escapeHtml(section.distinctionNote)}</div>`
            : ''
        }
      </div>
    `;

    this.contentEl.querySelectorAll('[data-chart]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.chartType = btn.dataset.chart;
        this.renderMetric();
      });
    });

    if (this.chartType === 'pie') {
      const svgEl = this.contentEl.querySelector('.pie-svg');
      const legendListEl = this.contentEl.querySelector('.pie-legend-list');
      const centerPct = this.contentEl.querySelector('#pieCenterPct');
      const centerTitle = this.contentEl.querySelector('#pieCenterTitle');
      const centerSub = this.contentEl.querySelector('#pieCenterSub');
      const sortedSlices = [...(section.pieSlices || [])].sort((a, b) => b.value - a.value);
      const dcSlice = sortedSlices.find((s) => s.isDc) || sortedSlices[sortedSlices.length - 1];
      const defaultPct = section.dcShareLabel || '';
      const defaultSub = dcSlice ? this.formatBarValue(dcSlice.value, this.activeMetric) : '';

      const highlightSlice = (id) => {
        if (svgEl) svgEl.classList.add('has-hover');
        if (legendListEl) legendListEl.classList.add('has-hover');
        const calloutNode = svgEl ? svgEl.querySelector('.pie-dc-callout') : null;
        this.contentEl.querySelectorAll('.pie-slice').forEach((el) => {
          const match = el.dataset.sliceId === id;
          el.classList.toggle('hovered', match);
          if (match) {
            if (svgEl && calloutNode) svgEl.insertBefore(el, calloutNode);
            if (centerPct && centerTitle && centerSub) {
              centerPct.textContent = el.dataset.pct;
              centerTitle.textContent = el.dataset.label;
              centerSub.textContent = el.dataset.val;
            }
          }
        });
        this.contentEl.querySelectorAll('.pie-legend-row').forEach((row) => {
          row.classList.toggle('hovered', row.dataset.sliceTarget === id);
        });
      };

      const resetSlice = () => {
        if (svgEl) svgEl.classList.remove('has-hover');
        if (legendListEl) legendListEl.classList.remove('has-hover');
        const dcPathNode = svgEl ? svgEl.querySelector('.pie-slice.is-dc') : null;
        const calloutNode = svgEl ? svgEl.querySelector('.pie-dc-callout') : null;
        if (svgEl && dcPathNode && calloutNode) {
          svgEl.insertBefore(dcPathNode, calloutNode);
        }
        this.contentEl.querySelectorAll('.pie-slice, .pie-legend-row').forEach((el) => el.classList.remove('hovered'));
        if (centerPct && centerTitle && centerSub) {
          centerPct.textContent = defaultPct;
          centerTitle.textContent = 'U.S. Data Centers';
          centerSub.textContent = defaultSub;
        }
      };

      this.contentEl.querySelectorAll('.pie-slice').forEach((el) => {
        el.addEventListener('mouseenter', () => highlightSlice(el.dataset.sliceId));
        el.addEventListener('mouseleave', resetSlice);
      });
      this.contentEl.querySelectorAll('.pie-legend-row').forEach((row) => {
        row.addEventListener('mouseenter', () => highlightSlice(row.dataset.sliceTarget));
        row.addEventListener('mouseleave', resetSlice);
      });
    }

    // Interactive Waffle Grid hover spotlighting
    const waffleGrid = this.contentEl.querySelector('.waffle-grid');
    if (waffleGrid) {
      const spotlightCat = (cat) => {
        waffleGrid.classList.add('dim-others');
        waffleGrid.querySelectorAll('.waffle-unit').forEach((u) => {
          u.classList.toggle('spotlit', u.dataset.waffleCat === cat);
        });
        this.contentEl.querySelectorAll('.waffle-stat-card').forEach((c) => {
          c.classList.toggle('hovered', c.dataset.waffleHover === cat);
        });
      };
      const clearSpotlight = () => {
        waffleGrid.classList.remove('dim-others');
        waffleGrid.querySelectorAll('.waffle-unit').forEach((u) => u.classList.remove('spotlit'));
        this.contentEl.querySelectorAll('.waffle-stat-card').forEach((c) => c.classList.remove('hovered'));
      };
      this.contentEl.querySelectorAll('.waffle-stat-card').forEach((card) => {
        card.addEventListener('mouseenter', () => spotlightCat(card.dataset.waffleHover));
        card.addEventListener('mouseleave', clearSpotlight);
      });
      waffleGrid.querySelectorAll('.waffle-unit').forEach((u) => {
        u.addEventListener('mouseenter', () => spotlightCat(u.dataset.waffleCat));
        u.addEventListener('mouseleave', clearSpotlight);
      });
    }

    this.contentEl.querySelectorAll('[data-jump-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.onJumpToFacility) {
          this.onJumpToFacility(btn.dataset.jumpId);
        }
      });
    });
  }
}
