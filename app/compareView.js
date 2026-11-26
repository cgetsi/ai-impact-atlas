import { escapeHtml, formatNumber } from './utils.js';

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
  constructor(data, { onJumpToFacility, onMetricChange, initialMetric = 'energy' } = {}) {
    this.data = data;
    this.onJumpToFacility = onJumpToFacility;
    this.onMetricChange = onMetricChange;
    this.activeMetric = ['energy', 'water', 'land'].includes(initialMetric) ? initialMetric : 'energy';
    this.chartType = 'pie'; // 'pie' | 'vbar' | 'linear'
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
    if (!['energy', 'water', 'land'].includes(metric)) return;
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
    const segsHtml = info.physicalMix
      .map((s) => {
        const cls = s.kind === 'renewable' ? 'mix-ren' : s.kind === 'nuclear' ? 'mix-nuc' : 'mix-fos';
        return `<div class="mix-seg ${cls}" style="width:${s.pct}%" title="${escapeHtml(s.label)}: ${s.pct}%"></div>`;
      })
      .join('');

    const legendHtml = info.physicalMix
      .map((s) => {
        const cls = s.kind === 'renewable' ? 'mix-ren' : s.kind === 'nuclear' ? 'mix-nuc' : 'mix-fos';
        return `<span><i class="mix-dot ${cls}"></i>${escapeHtml(s.label)}: <strong>${s.pct}%</strong></span>`;
      })
      .join('');

    return `
      <div class="national-clean-box">
        <div class="national-clean-top">
          <h3>${escapeHtml(info.title)}</h3>
          <span class="prov-badge prov-reported">${escapeHtml(info.source)}</span>
        </div>
        <div class="mix-bar mix-bar-lg">${segsHtml}</div>
        <div class="mix-legend">${legendHtml}</div>
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
        ? `<div class="pie-magnifier-badge">
             <span>Data center sliver slightly widened to stay visible — actual share is <strong>${escapeHtml(section.dcShareLabel)}</strong> (${escapeHtml(section.dcProjectionCallout)})</span>
           </div>`
        : `<div class="pie-magnifier-badge">
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
        const heightPct = Math.max(2.2, rawPct);
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
              <div class="vbar-val">${escapeHtml(this.formatCompactValue(item.value, this.activeMetric))}</div>
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

  buildLinearHorizontalHtml(items, maxVal, dcBaseline) {
    const barsHtml = items
      .map((item, idx) => {
        const width = Math.max(1.2, (item.value / maxVal) * 100);
        const isDc = item.category === 'datacenter' || item.category === 'datacenter_proj';
        const isProj = item.category === 'datacenter_proj';
        const barColor = getRankIntensityColor(idx, items.length);
        const fillStyle = isProj
          ? `width:${width.toFixed(2)}%; ${buildStripedFillStyle(barColor)}`
          : `width:${width.toFixed(2)}%; background:${barColor};`;
        const multipleText = this.formatMultipleVsBaseline(item.value, dcBaseline);

        return `
          <div class="bar-row ${isDc ? 'is-dc' : ''}">
            <div class="bar-row-head">
              <div class="bar-label ${isDc ? 'is-dc' : ''}">
                <span>${escapeHtml(item.label)}</span>
                ${isDc ? '<span class="dc-marker-pill">DC</span>' : ''}
              </div>
              <div class="bar-value-group">
                ${multipleText ? `<span class="bar-ratio">${escapeHtml(multipleText)}</span>` : ''}
                <span class="bar-value">${escapeHtml(this.formatBarValue(item.value, this.activeMetric))}</span>
              </div>
            </div>
            <div class="bar-track">
              <div class="bar-fill ${isDc ? 'is-dc' : ''}" style="${fillStyle}"></div>
            </div>
            <div class="bar-meta detail-prose">
              <span>${escapeHtml(item.note)}</span>
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source)} ↗</a>
            </div>
          </div>
        `;
      })
      .join('');

    return `<div class="bar-chart">${barsHtml}</div>`;
  }

  renderMetric() {
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

    let mainVisualHtml = '';
    if (this.chartType === 'pie') {
      mainVisualHtml = this.buildPieChartHtml(section);
    } else if (this.chartType === 'vbar') {
      mainVisualHtml = this.buildVerticalBarChartHtml(items, maxVal);
    } else {
      mainVisualHtml = this.buildLinearHorizontalHtml(items, maxVal, dcBaseline);
    }

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
        <div class="spotlight-row">
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
          <button class="scale-btn ${this.chartType === 'linear' ? 'active' : ''}" data-chart="linear" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="9" y2="18"/></svg>
            Linear Scale
          </button>
        </div>
      </div>

      ${mainVisualHtml}
      ${intensityLegendHtml}
      ${this.buildCleanMiniStrip()}

      ${spotlightHtml}

      <div class="dig-deeper-wrap ${this.showDeepNotes ? 'expanded' : ''}">
        <button id="toggleCompareNotes" class="dig-deeper-btn" type="button" aria-expanded="${String(this.showDeepNotes)}">
          ${this.showDeepNotes ? 'Hide background notes & citations ▴' : 'Dig deeper: methodology & takeaway notes ▾'}
        </button>
        <div class="dig-deeper-body">
          <div class="takeaway-banner">${escapeHtml(section.takeaway)}</div>
          ${
            section.distinctionNote
              ? `<div class="distinction-banner" style="margin-top:10px"><strong>Key distinction:</strong> ${escapeHtml(section.distinctionNote)}</div>`
              : ''
          }
        </div>
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

    const notesBtn = this.contentEl.querySelector('#toggleCompareNotes');
    if (notesBtn) {
      notesBtn.addEventListener('click', () => {
        this.showDeepNotes = !this.showDeepNotes;
        this.renderMetric();
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
