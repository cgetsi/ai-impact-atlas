import { escapeHtml } from './utils.js';

function parseDate(str) {
  const parts = str.split('-').map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function formatPrice(val) {
  if (val >= 10) return `$${val.toFixed(0)}`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(3).replace(/0$/, '')}`;
}

// Plain-language names for the capability benchmarks (Simple view)
const PLAIN_BENCH = {
  gpqa: 'PhD-level science questions',
  aime: 'High-school math competition',
  swebench: 'Fixing real software bugs',
  frontiermath: 'Research-level math'
};

// A 500-page book is ~250K tokens
const BOOK_TOKENS_M = 0.25;

function formatMinutes(min) {
  if (min < 1) return `${Math.round(min * 60)} sec`;
  if (min < 60) return `${Math.round(min)} min`;
  const hrs = min / 60;
  return `${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hrs`;
}

function formatMoney(val) {
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(3)}`;
}

export class ScalingView {
  constructor(data, { onJumpToDataCenters } = {}) {
    this.data = data;
    this.onJumpToDataCenters = onJumpToDataCenters;

    this.costScale = 'log'; // 'log' | 'linear'
    const costPts = data.costDecaySeries?.points || [];
    this.selectedCostIdx = costPts.length ? costPts.length - 1 : 0;

    this.visibleBenchmarks = new Set((data.capabilityBenchmarks || []).map((b) => b.id));
    this.selectedBenchPoint = null;

    this.heroEl = document.getElementById('scalingHeroKpis');
    this.costEl = document.getElementById('scalingCostCard');
    this.benchEl = document.getElementById('scalingBenchCard');
    this.horizonEl = document.getElementById('scalingHorizonCard');
    this.takeawaysEl = document.getElementById('scalingTakeaways');
    this.simpleEl = document.getElementById('scalingSimple');

    this.renderHero();
    this.renderSimple();
    this.renderCostChart();
    this.renderBenchmarksChart();
    this.renderTaskHorizon();
    this.renderTakeaways();
  }

  setTheme() {
    this.renderSimple();
    this.renderCostChart();
    this.renderBenchmarksChart();
  }

  renderHero() {
    if (!this.heroEl) return;
    const h = this.data.headlineMetrics || {};
    const gpqa = (this.data.capabilityBenchmarks || []).find((b) => b.id === 'gpqa');
    const gpqaLatest = gpqa?.points?.length ? `${gpqa.points[gpqa.points.length - 1].score}%` : h.phdScienceAccuracy || '86%';
    const hzPts = this.data.taskHorizon?.points || [];
    const hzLatest = hzPts.length ? hzPts[hzPts.length - 1].minutes : null;
    // Derive the cost-collapse headline from the series itself so every view shows the same number
    const cp = this.data.costDecaySeries?.points || [];
    const costFactor = cp.length >= 2 ? `${Math.round(cp[0].pricePer1M / cp[cp.length - 1].pricePer1M)}×` : h.costCollapseFactor || '300×+';
    const costDetail =
      cp.length >= 2
        ? `GPT-4–class intelligence fell from ${formatPrice(cp[0].pricePer1M)} to ${formatPrice(cp[cp.length - 1].pricePer1M)} per 1M blended tokens (${cp[0].date.slice(0, 4)} → ${cp[cp.length - 1].date.slice(0, 4)})`
        : h.costCollapseDetail || '';
    this.heroEl.innerHTML = `
      <div class="hero-kpi">
        <div class="hero-kpi-val">${escapeHtml(costFactor)}</div>
        <div class="hero-kpi-label">Cheaper than in ${escapeHtml(cp.length ? cp[0].date.slice(0, 4) : '2023')}</div>
        <div class="hero-kpi-sub detail-only">${escapeHtml(costDetail)}</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${escapeHtml(gpqaLatest)}</div>
        <div class="hero-kpi-label">On PhD-level science tests</div>
        <div class="hero-kpi-sub detail-only">${escapeHtml(h.phdScienceDetail || '')}</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${hzLatest ? escapeHtml(formatMinutes(hzLatest)) : escapeHtml(h.taskHorizonDoublingMonths || '~7 mo')}</div>
        <div class="hero-kpi-label">${hzLatest ? 'Of expert work AI can do on its own' : 'Task length doubling time'}</div>
        <div class="hero-kpi-sub detail-only">${escapeHtml(h.taskHorizonDetail || '')}</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${escapeHtml(h.energyPerQueryDrop || '10–30×')}</div>
        <div class="hero-kpi-label">Less energy per question</div>
        <div class="hero-kpi-sub detail-only">${escapeHtml(h.energyPerQueryDetail || '')}</div>
      </div>
    `;
  }

  /* ------------------------------------------------------------------------
     SIMPLE VIEW — plain-language, instantly readable visuals
     ------------------------------------------------------------------------ */
  renderSimple() {
    if (!this.simpleEl) return;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const green = isLight ? '#059669' : '#34d399';

    // 1) Cost: what it costs to have AI read a 500-page book
    const pts = this.data.costDecaySeries?.points || [];
    let costHtml = '';
    if (pts.length >= 2) {
      const first = pts[0];
      const last = pts[pts.length - 1];
      const thenCost = first.pricePer1M * BOOK_TOKENS_M;
      const nowCost = last.pricePer1M * BOOK_TOKENS_M;
      const factor = Math.round(first.pricePer1M / last.pricePer1M);
      const nowPct = Math.max(0.6, (nowCost / thenCost) * 100);

      // Small linear trend chart (linear on purpose: the "cliff" is the story)
      const w = 560;
      const h = 170;
      const pL = 8;
      const pR = 8;
      const pT = 14;
      const pB = 24;
      const minTs = parseDate(first.date).getTime();
      const maxTs = parseDate(last.date).getTime();
      const maxP = first.pricePer1M;
      const xFor = (d) => pL + ((parseDate(d).getTime() - minTs) / Math.max(1, maxTs - minTs)) * (w - pL - pR);
      const yFor = (p) => pT + (h - pT - pB) - (p / maxP) * (h - pT - pB);
      const lineD = pts.map((p, i) => `${i ? 'L' : 'M'} ${xFor(p.date).toFixed(1)} ${yFor(p.pricePer1M).toFixed(1)}`).join(' ');
      const baseY = (h - pB).toFixed(1);
      const areaD = `${lineD} L ${xFor(last.date).toFixed(1)} ${baseY} L ${xFor(first.date).toFixed(1)} ${baseY} Z`;
      const yearTicks = [];
      for (let y = Number(first.date.slice(0, 4)) + 1; y <= Number(last.date.slice(0, 4)); y++) yearTicks.push(y);
      const ticksHtml = [first.date.slice(0, 4), ...yearTicks.map(String)]
        .map((y, i) => {
          const x = i === 0 ? xFor(first.date) : xFor(`${y}-01-01`);
          return `<text class="sv-axis" x="${x.toFixed(1)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : 'middle'}">${y}</text>`;
        })
        .join('');
      const dots = pts
        .map(
          (p) => `<circle cx="${xFor(p.date).toFixed(1)}" cy="${yFor(p.pricePer1M).toFixed(1)}" r="4.5" fill="${green}" stroke="var(--bg-surface-solid)" stroke-width="2"><title>${escapeHtml(`${p.label} (${p.date.slice(0, 7)}): ${formatMoney(p.pricePer1M * BOOK_TOKENS_M)} per book`)}</title></circle>`
        )
        .join('');

      costHtml = `
        <section class="sv-card">
          <div class="sv-card-head">
            <h2 class="sv-h2">The price of smart AI has collapsed</h2>
            <span class="sv-muted">Cost to have top-quality AI read a 500-page book</span>
          </div>
          <div class="sv-cost-grid">
            <div class="sv-cost-bars">
              <div class="sv-cost-row">
                <span class="sv-cost-yr">${escapeHtml(first.date.slice(0, 4))}</span>
                <div class="sv-cost-track"><div class="sv-cost-fill then" style="width:100%"></div></div>
                <span class="sv-cost-val">${formatMoney(thenCost)}</span>
              </div>
              <div class="sv-cost-row">
                <span class="sv-cost-yr">${escapeHtml(last.date.slice(0, 4))}</span>
                <div class="sv-cost-track"><div class="sv-cost-fill now" style="width:${nowPct.toFixed(2)}%;background:${green}"></div></div>
                <span class="sv-cost-val now" style="color:${green}">${formatMoney(nowCost)}</span>
              </div>
              <div class="sv-cost-big"><span style="color:${green}">${factor}×</span> cheaper</div>
            </div>
            <svg class="sv-cost-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Price of GPT-4-class AI fell from ${formatMoney(thenCost)} to ${formatMoney(nowCost)} per 500-page book between ${first.date.slice(0, 4)} and ${last.date.slice(0, 4)}">
              <defs>
                <linearGradient id="svCostGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="${green}" stop-opacity="0.30" />
                  <stop offset="100%" stop-color="${green}" stop-opacity="0.02" />
                </linearGradient>
              </defs>
              <line x1="${pL}" y1="${baseY}" x2="${w - pR}" y2="${baseY}" stroke="var(--border-subtle)" />
              <path d="${areaD}" fill="url(#svCostGrad)" />
              <path d="${lineD}" fill="none" stroke="${green}" stroke-width="2.5" stroke-linejoin="round" />
              ${dots}
              ${ticksHtml}
            </svg>
          </div>
        </section>
      `;
    }

    // 2) AI vs. human experts: then → now bars with human-expert marker
    const benches = this.data.capabilityBenchmarks || [];
    const benchRows = benches
      .map((b) => {
        const bp = b.points || [];
        if (bp.length < 2) return '';
        const a = bp[0];
        const z = bp[bp.length - 1];
        const marker = b.humanBaseline
          ? `<span class="sv-human-mark" style="left:${b.humanBaseline}%" title="${escapeHtml(b.humanBaselineLabel || 'Human expert')}"></span>`
          : '';
        return `
          <div class="sv-bench-row">
            <div class="sv-bench-name">${escapeHtml(PLAIN_BENCH[b.id] || b.shortName)}</div>
            <div class="sv-bench-track" role="img" aria-label="${escapeHtml(`${PLAIN_BENCH[b.id] || b.shortName}: ${a.score}% in ${a.date.slice(0, 4)}, ${z.score}% in ${z.date.slice(0, 4)}${b.humanBaseline ? `; human experts about ${b.humanBaseline}%` : ''}`)}">
              <div class="sv-bench-then" style="width:${Math.max(0.8, a.score)}%"></div>
              <div class="sv-bench-now" style="width:${z.score}%"></div>
              ${marker}
            </div>
            <div class="sv-bench-vals"><span class="sv-muted">${a.score}%</span> → <strong>${z.score}%</strong></div>
          </div>
        `;
      })
      .join('');
    const firstYr = benches.length ? Math.min(...benches.map((b) => Number(b.points[0].date.slice(0, 4)))) : 2023;

    // 3) How long AI can work on its own (linear: shows the real explosion)
    const hz = this.data.taskHorizon;
    let hzHtml = '';
    if (hz && hz.points?.length) {
      const maxMin = Math.max(...hz.points.map((p) => p.minutes));
      hzHtml = `
        <section class="sv-card">
          <div class="sv-card-head">
            <h2 class="sv-h2">How long a task AI can finish on its own</h2>
            <span class="sv-muted">Measured in how long the same task takes a skilled person</span>
          </div>
          <div class="sv-hz-list">
            ${hz.points
              .map(
                (p) => `
                <div class="sv-hz-row">
                  <span class="sv-hz-yr">${escapeHtml(p.year)}</span>
                  <div class="sv-hz-track"><div class="sv-hz-fill" style="width:${Math.max(0.8, (p.minutes / maxMin) * 100).toFixed(1)}%"></div></div>
                  <span class="sv-hz-val">${escapeHtml(formatMinutes(p.minutes))}</span>
                </div>
              `
              )
              .join('')}
          </div>
          <div class="sv-callout">Doubling about every <strong>${escapeHtml((this.data.headlineMetrics?.taskHorizonDoublingMonths || '~7 mo').replace('mo', 'months'))}</strong></div>
        </section>
      `;
    }

    this.simpleEl.innerHTML = `
      ${costHtml}
      <div class="sv-two-col sv-two-col-even">
        <section class="sv-card">
          <div class="sv-card-head">
            <h2 class="sv-h2">AI vs. human experts on hard tests</h2>
            <span class="sv-muted">Share of questions answered correctly</span>
          </div>
          <div class="sv-bench-list">${benchRows}</div>
          <div class="sv-legend">
            <span class="sv-legend-item"><span class="sv-swatch then"></span>${firstYr}</span>
            <span class="sv-legend-item"><span class="sv-swatch now"></span>Today</span>
            <span class="sv-legend-item"><span class="sv-swatch human"></span>Human expert</span>
          </div>
        </section>
        ${hzHtml}
      </div>
      <button class="sv-bridge" data-sv-jump type="button">
        <span>What powers all of this?</span>
        <strong>See the Data Centers →</strong>
      </button>
    `;

    const jump = this.simpleEl.querySelector('[data-sv-jump]');
    if (jump && this.onJumpToDataCenters) jump.addEventListener('click', () => this.onJumpToDataCenters());
  }

  renderCostChart() {
    if (!this.costEl) return;
    const series = this.data.costDecaySeries;
    if (!series || !series.points?.length) return;

    const pts = series.points;
    const baseline = pts[0].pricePer1M;
    const minTs = parseDate(pts[0].date).getTime();
    const maxTs = parseDate(pts[pts.length - 1].date).getTime();

    const width = 880;
    const height = 310;
    const padL = 68;
    const padR = 32;
    const padT = 24;
    const padB = 42;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxPrice = 50;
    const minPrice = 0.05;

    const xFor = (dateStr) => {
      const ts = parseDate(dateStr).getTime();
      return padL + ((ts - minTs) / Math.max(1, maxTs - minTs)) * plotW;
    };

    const yFor = (price) => {
      if (this.costScale === 'log') {
        const logMin = Math.log10(minPrice);
        const logMax = Math.log10(maxPrice);
        const t = (Math.log10(Math.max(minPrice, price)) - logMin) / (logMax - logMin);
        return padT + plotH - t * plotH;
      }
      const t = Math.min(1, price / maxPrice);
      return padT + plotH - t * plotH;
    };

    const yTicks =
      this.costScale === 'log' ? [50, 10, 1, 0.1] : [50, 37.5, 25, 12.5, 0];

    const gridYHtml = yTicks
      .map((val) => {
        const y = val === 0 ? padT + plotH : yFor(val);
        return `
          <line class="sc-grid-h" x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}" />
          <text class="sc-axis-lbl" x="${padL - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${val === 0 ? '$0' : formatPrice(val)}</text>
        `;
      })
      .join('');

    const xYears = ['2023-03-14', '2024-01-01', '2025-01-01', '2026-01-01'];
    const gridXHtml = xYears
      .map((d) => {
        const x = xFor(d);
        return `
          <line class="sc-grid-v" x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + plotH}" />
          <text class="sc-axis-lbl" x="${x.toFixed(1)}" y="${height - 14}" text-anchor="middle">${d.slice(0, 4)}</text>
        `;
      })
      .join('');

    const coords = pts.map((p) => ({ x: xFor(p.date), y: yFor(p.pricePer1M), p }));
    const lineD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaD = `${lineD} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

    const dotsHtml = coords
      .map((c, i) => {
        const sel = i === this.selectedCostIdx;
        const showTopLabel = sel || i === 0 || i === 4 || i === coords.length - 1;
        return `
          <g class="sc-point ${sel ? 'selected' : ''}" data-cost-idx="${i}" tabindex="0" role="button" aria-label="${escapeHtml(`${c.p.label}: ${formatPrice(c.p.pricePer1M)} per million tokens`)}">
            <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="15" fill="transparent" />
            ${sel ? `<circle class="sc-point-ring" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="11" fill="none" stroke="#34d399" stroke-width="2" />` : ''}
            <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${sel ? '6.5' : '5'}" fill="#34d399" stroke="var(--bg-surface-solid)" stroke-width="2" />
            ${
              showTopLabel
                ? `<text class="sc-pt-lbl ${sel ? 'selected' : ''}" x="${Math.min(padL + plotW - 32, Math.max(padL + 36, c.x)).toFixed(1)}" y="${(c.y - 12).toFixed(1)}" text-anchor="middle">${escapeHtml(c.p.label)} (${formatPrice(c.p.pricePer1M)})</text>`
                : ''
            }
          </g>
        `;
      })
      .join('');

    const active = pts[this.selectedCostIdx] || pts[pts.length - 1];
    const dropFactor = baseline / Math.max(0.01, active.pricePer1M);
    const dropText = dropFactor <= 1.05 ? '1× Baseline' : `${Math.round(dropFactor)}× cheaper than 2023 GPT-4`;

    this.costEl.innerHTML = `
      <div class="sc-card-head">
        <div>
          <span class="eyebrow">Cost Deflation</span>
          <h2>${escapeHtml(series.title)}</h2>
          <p class="detail-prose">${escapeHtml(series.subtitle)}</p>
        </div>
        <div class="bt-range-toggle" role="group" aria-label="Price chart scale">
          <button class="bt-range-btn ${this.costScale === 'log' ? 'active' : ''}" data-cost-scale="log" type="button">Log 10× Scale</button>
          <button class="bt-range-btn ${this.costScale === 'linear' ? 'active' : ''}" data-cost-scale="linear" type="button">Linear Scale</button>
        </div>
      </div>

      <div class="sc-analogy-banner">
        <strong>Human-Scale Meaning:</strong> ${escapeHtml(series.humanAnalogy)}
      </div>

      <svg class="sc-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Price collapse of GPT-4-class AI tokens from 2023 to 2026">
        <defs>
          <linearGradient id="scCostGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#34d399" stop-opacity="0.28" />
            <stop offset="100%" stop-color="#34d399" stop-opacity="0.01" />
          </linearGradient>
        </defs>
        ${gridYHtml}
        ${gridXHtml}
        <path d="${areaD}" fill="url(#scCostGrad)" />
        <path d="${lineD}" fill="none" stroke="#34d399" stroke-width="3" stroke-linejoin="round" />
        ${dotsHtml}
      </svg>

      <div class="sc-detail-strip">
        <div>
          <div class="sc-detail-top">
            <strong>${escapeHtml(active.label)}</strong>
            <span class="ver-badge ver-verified">${escapeHtml(dropText)}</span>
            <span class="sc-detail-date">${escapeHtml(active.date)} · ${escapeHtml(active.provider)}</span>
          </div>
          <p class="sc-detail-note">${escapeHtml(active.note)}</p>
        </div>
        <div class="sc-detail-nums">
          <div class="sc-num-box">
            <span class="sc-num-val">${formatPrice(active.pricePer1M)}</span>
            <span class="sc-num-lbl">Blended / 1M</span>
          </div>
          <div class="sc-num-box">
            <span class="sc-num-val">${formatPrice(active.inputPrice)} / ${formatPrice(active.outputPrice)}</span>
            <span class="sc-num-lbl">In / Out</span>
          </div>
          <a class="bt-source-link" href="${escapeHtml(active.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a>
        </div>
      </div>
    `;

    this.costEl.querySelectorAll('[data-cost-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.costScale = btn.dataset.costScale;
        this.renderCostChart();
      });
    });

    this.costEl.querySelectorAll('[data-cost-idx]').forEach((el) => {
      const pick = () => {
        this.selectedCostIdx = Number(el.dataset.costIdx);
        this.renderCostChart();
      };
      el.addEventListener('click', pick);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      });
    });
  }

  renderBenchmarksChart() {
    if (!this.benchEl) return;
    const benchmarks = this.data.capabilityBenchmarks || [];
    if (!benchmarks.length) return;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const minTs = parseDate('2023-02').getTime();
    const maxTs = parseDate('2026-04').getTime();

    const width = 880;
    const height = 320;
    const padL = 56;
    const padR = 30;
    const padT = 24;
    const padB = 42;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const xFor = (d) => padL + ((parseDate(d).getTime() - minTs) / (maxTs - minTs)) * plotW;
    const yFor = (score) => padT + plotH - (Math.max(0, Math.min(100, score)) / 100) * plotH;

    const gridYHtml = [0, 25, 50, 75, 100]
      .map((val) => {
        const y = yFor(val);
        return `
          <line class="sc-grid-h" x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}" />
          <text class="sc-axis-lbl" x="${padL - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${val}%</text>
        `;
      })
      .join('');

    const gridXHtml = ['2023-03', '2024-01', '2025-01', '2026-01']
      .map((d) => {
        const x = xFor(d);
        return `
          <line class="sc-grid-v" x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + plotH}" />
          <text class="sc-axis-lbl" x="${x.toFixed(1)}" y="${height - 14}" text-anchor="middle">${d.slice(0, 4)}</text>
        `;
      })
      .join('');

    const activeBenches = benchmarks.filter((b) => this.visibleBenchmarks.has(b.id));

    const seriesHtml = activeBenches
      .map((b) => {
        const color = isLight && b.lightColor ? b.lightColor : b.color;
        const pts = b.points || [];
        const dPath = pts
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.date).toFixed(1)} ${yFor(p.score).toFixed(1)}`)
          .join(' ');
        const last = pts[pts.length - 1];

        const baseLine =
          activeBenches.length === 1 && b.humanBaseline
            ? `
              <line x1="${padL}" y1="${yFor(b.humanBaseline).toFixed(1)}" x2="${padL + plotW}" y2="${yFor(b.humanBaseline).toFixed(1)}" stroke="${color}" stroke-opacity="0.55" stroke-dasharray="5 4" stroke-width="1.5" />
              <text class="sc-base-lbl" x="${padL + plotW - 4}" y="${(yFor(b.humanBaseline) - 6).toFixed(1)}" text-anchor="end" fill="${color}">${escapeHtml(b.humanBaselineLabel)}</text>
            `
            : '';

        const dots = pts
          .map((p, pIdx) => {
            const x = xFor(p.date);
            const y = yFor(p.score);
            const isSel =
              this.selectedBenchPoint &&
              this.selectedBenchPoint.benchId === b.id &&
              this.selectedBenchPoint.pointIdx === pIdx;
            return `
              <g class="sc-point ${isSel ? 'selected' : ''}" data-bench-id="${escapeHtml(b.id)}" data-pt-idx="${pIdx}" tabindex="0" role="button" aria-label="${escapeHtml(`${b.shortName}: ${p.score}% (${p.model}, ${p.date})`)}">
                <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="transparent" />
                <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isSel ? '6.5' : '4.5'}" fill="${color}" stroke="var(--bg-surface-solid)" stroke-width="2" />
              </g>
            `;
          })
          .join('');

        return `
          ${baseLine}
          <path d="${dPath}" fill="none" stroke="${color}" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round" />
          ${dots}
          ${
            last
              ? `<text class="sc-end-lbl" x="${Math.min(padL + plotW - 4, xFor(last.date) + 6).toFixed(1)}" y="${(yFor(last.score) - 8).toFixed(1)}" text-anchor="end" fill="${color}">${escapeHtml(b.shortName)} ${last.score}%</text>`
              : ''
          }
        `;
      })
      .join('');

    // Determine readout info
    let readoutBench = activeBenches[0] || benchmarks[0];
    let readoutPt = readoutBench.points[readoutBench.points.length - 1];
    if (this.selectedBenchPoint) {
      const foundB = benchmarks.find((b) => b.id === this.selectedBenchPoint.benchId);
      if (foundB && foundB.points[this.selectedBenchPoint.pointIdx]) {
        readoutBench = foundB;
        readoutPt = foundB.points[this.selectedBenchPoint.pointIdx];
      }
    }

    this.benchEl.innerHTML = `
      <div class="sc-card-head">
        <div>
          <span class="eyebrow">Capability Frontier</span>
          <h2>Exponential Growth Across Science, Math &amp; Engineering</h2>
          <p class="detail-prose">Toggle benchmarks below or click any point on the curve to inspect the exact milestone model and primary evaluation source.</p>
        </div>
      </div>

      <div class="bt-domain-pills" role="group" aria-label="Toggle capability benchmarks">
        ${benchmarks
          .map((b) => {
            const active = this.visibleBenchmarks.has(b.id);
            const col = isLight && b.lightColor ? b.lightColor : b.color;
            return `
              <button class="bt-pill ${active ? 'active' : ''}" data-toggle-bench="${escapeHtml(b.id)}" type="button">
                <span class="bt-pill-dot" style="background:${col}"></span>
                ${escapeHtml(b.shortName)}
              </button>
            `;
          })
          .join('')}
      </div>

      <svg class="sc-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="AI capability growth across GPQA Diamond, SWE-bench Verified, AIME, and FrontierMath">
        ${gridYHtml}
        ${gridXHtml}
        ${seriesHtml}
      </svg>

      <div class="sc-detail-strip">
        <div>
          <div class="sc-detail-top">
            <strong>${escapeHtml(readoutBench.name)}</strong>
            <span class="ver-badge ver-milestone">${readoutPt.score}% · ${escapeHtml(readoutPt.model)}</span>
            <span class="sc-detail-date">${escapeHtml(readoutPt.date)}</span>
          </div>
          <p class="sc-detail-note">${escapeHtml(readoutBench.description)}</p>
        </div>
        <div class="sc-detail-nums">
          <a class="bt-source-link" href="${escapeHtml(readoutBench.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(readoutBench.sourceLabel)} ↗</a>
        </div>
      </div>
    `;

    this.benchEl.querySelectorAll('[data-toggle-bench]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggleBench;
        if (this.visibleBenchmarks.has(id)) {
          if (this.visibleBenchmarks.size > 1) this.visibleBenchmarks.delete(id);
        } else {
          this.visibleBenchmarks.add(id);
        }
        this.renderBenchmarksChart();
      });
    });

    this.benchEl.querySelectorAll('[data-bench-id]').forEach((el) => {
      const pick = () => {
        this.selectedBenchPoint = {
          benchId: el.dataset.benchId,
          pointIdx: Number(el.dataset.ptIdx)
        };
        this.renderBenchmarksChart();
      };
      el.addEventListener('click', pick);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      });
    });
  }

  renderTaskHorizon() {
    if (!this.horizonEl) return;
    const h = this.data.taskHorizon;
    if (!h) return;

    const maxMin = Math.max(...h.points.map((p) => p.minutes), 1);
    const rowsHtml = h.points
      .map((p) => {
        // Use log-adjusted width so both 0.2 min and 130 min read cleanly
        const logPct = ((Math.log10(p.minutes + 0.2) - Math.log10(0.3)) / (Math.log10(maxMin + 0.2) - Math.log10(0.3))) * 100;
        const widthPct = Math.max(5, Math.min(100, logPct));
        const labelVal = p.minutes >= 60 ? `${(p.minutes / 60).toFixed(1)} hrs` : `${p.minutes} min`;
        return `
          <div class="hz-row">
            <div class="hz-meta">
              <span class="hz-yr">${escapeHtml(p.year)}</span>
              <span class="hz-model">${escapeHtml(p.label)}</span>
            </div>
            <div class="hz-track">
              <div class="hz-fill" style="width:${widthPct.toFixed(1)}%"></div>
            </div>
            <div class="hz-val">${escapeHtml(labelVal)}</div>
          </div>
        `;
      })
      .join('');

    this.horizonEl.innerHTML = `
      <div class="sc-card-head">
        <div>
          <span class="eyebrow">Autonomy Scaling</span>
          <h2>${escapeHtml(h.title)}</h2>
          <p class="detail-prose">${escapeHtml(h.subtitle)}</p>
        </div>
        <a class="bt-source-link" href="${escapeHtml(h.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(h.sourceLabel)} ↗</a>
      </div>

      <div class="hz-list">${rowsHtml}</div>

      <p class="hz-caveat"><strong>Honest Scope:</strong> ${escapeHtml(h.caveat)}</p>
    `;
  }

  renderTakeaways() {
    if (!this.takeawaysEl) return;
    const list = this.data.humanImpactTakeaways || [];
    this.takeawaysEl.innerHTML = `
      <div class="takeaways-grid">
        ${list
          .map(
            (t) => `
            <article class="takeaway-card">
              <h3>${escapeHtml(t.title)}</h3>
              <p>${escapeHtml(t.body)}</p>
            </article>
          `
          )
          .join('')}
      </div>
      <div class="sc-bridge-cta">
        <div>
          <strong>Want to see the physical infrastructure powering this curve?</strong>
          <span>Explore 1,446 mapped U.S. data centers, their power &amp; water footprint, and local community trade-offs.</span>
        </div>
        <button id="scalingToMapBtn" class="co-map-btn" type="button">Explore U.S. Data Centers →</button>
      </div>
    `;

    const btn = this.takeawaysEl.querySelector('#scalingToMapBtn');
    if (btn && this.onJumpToDataCenters) {
      btn.addEventListener('click', () => this.onJumpToDataCenters());
    }
  }
}
