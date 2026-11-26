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

function formatMinutes(min) {
  if (min < 1) return `${Math.round(min * 60)} sec`;
  if (min < 60) return `${Math.round(min)} min`;
  const hrs = min / 60;
  return `${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hrs`;
}

function formatMoney(val) {
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
    this.storiesEl = document.getElementById('scalingStories');
    this.costEl = document.getElementById('scalingCostCard');
    this.benchEl = document.getElementById('scalingBenchCard');
    this.horizonEl = document.getElementById('scalingHorizonCard');
    this.takeawaysEl = document.getElementById('scalingTakeaways');
    this.flagshipEl = document.getElementById('scalingFlagshipCard');

    this.renderHero();
    this.renderStories();
    this.renderCostChart();
    this.renderBenchmarksChart();
    this.renderTaskHorizon();
    this.renderFlagshipTable();
    this.renderTakeaways();
  }

  setTheme() {
    this.renderStories();
    this.renderCostChart();
    this.renderBenchmarksChart();
  }

  renderHero() {
    if (!this.heroEl) return;
    const benches = this.data.capabilityBenchmarks || [];
    const gpqa = benches.find((b) => b.id === 'gpqa');
    const expert = this.data.humanBaselines?.gpqaExperts?.value ?? gpqa?.humanBaseline ?? null;
    const best = gpqa?.points?.length ? Math.max(...gpqa.points.map((p) => p.score)) : null;
    const fpPts = this.data.frontierPrice?.points || [];
    const fpFirst = fpPts[0];
    const fpLast = fpPts[fpPts.length - 1];
    const hzMax = this.data.taskHorizon?.reliableMaxMinutes || Infinity;
    const hzPts = (this.data.taskHorizon?.points || []).filter((p) => p.ciHigh == null || p.ciHigh <= hzMax);
    const hzBest = hzPts.length ? Math.max(...hzPts.map((p) => p.minutes)) : null;
    const fmPts = this.data.mathProgress?.frontierMath?.points || [];
    const fmBest = fmPts.length ? fmPts.reduce((a, b) => (b.score > a.score ? b : a)) : null;

    const kpis = [];
    if (best != null) {
      kpis.push({
        val: expert != null ? `${best}% vs ${expert}%` : `${best}%`,
        label: 'AI vs. PhD experts on science questions',
        sub: 'Best published GPQA Diamond score vs. domain-expert accuracy reported in the GPQA paper'
      });
    }
    if (fpPts.length >= 2) {
      const m = (v) => (v % 1 === 0 ? `$${v}` : formatMoney(v));
      kpis.push({
        val: `${m(fpLast.pricePer1M)} vs ${m(fpFirst.pricePer1M)}`,
        label: `Price of the best AI: ${fpLast.year} vs. ${fpFirst.year}`,
        sub: `${fpLast.model} vs. ${fpFirst.model}, per 1M blended tokens — while the science score rose from ${fpFirst.gpqa}% to ${fpLast.gpqa}%`
      });
    }
    if (hzBest) {
      kpis.push({
        val: formatMinutes(hzBest),
        label: 'Of skilled human work AI can finish on its own',
        sub: 'METR 50%-reliability time horizon on software & research tasks'
      });
    }
    if (fmBest) {
      kpis.push({
        val: `${Math.round(fmBest.score)}%`,
        label: 'Of expert-level math problems solved',
        sub: `FrontierMath (Epoch AI's own evaluation), ${fmBest.model}, ${fmBest.date}`
      });
    }

    this.heroEl.innerHTML = kpis
      .map(
        (k) => `
        <div class="hero-kpi">
          <div class="hero-kpi-val">${escapeHtml(k.val)}</div>
          <div class="hero-kpi-label">${escapeHtml(k.label)}</div>
          <div class="hero-kpi-sub detail-only">${escapeHtml(k.sub)}</div>
        </div>`
      )
      .join('');
  }

  /* ------------------------------------------------------------------------
     STORY CARDS (both modes) — measured against PEOPLE, not old models.
     Every card: one big plain-language statement + one simple column chart.
     ------------------------------------------------------------------------ */

  // Best value per calendar year (for "the best AI at the end of each year")
  bestPerYear(points, valueKey) {
    const byYear = new Map();
    points.forEach((p) => {
      const y = p.date.slice(0, 4);
      const cur = byYear.get(y);
      if (!cur || p[valueKey] > cur[valueKey]) byYear.set(y, p);
    });
    return [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([y, p]) => ({ ...p, year: y }));
  }

  // Simple vertical column chart (HTML, responsive, linear scale)
  // Bar heights are exact percentages of one fixed plot box (the same box the reference
  // line is positioned in); value labels are positioned above each bar and never resize it.
  columnChart({ columns, max, refValue = null, refLabel = '', tone = 'up', ariaLabel }) {
    const top = max || Math.max(...columns.map((c) => c.value));
    const refPct = refValue != null ? (refValue / top) * 100 : null;
    const cols = columns
      .map((c, i) => {
        const h = Math.min(100, Math.max(0, (c.value / top) * 100));
        const isLast = i === columns.length - 1;
        let cls = 'sc-col-bar';
        if (refValue != null) cls += c.value >= refValue ? ' above' : ' below';
        else if (tone === 'down') cls += isLast ? ' win' : i === 0 ? ' start' : ' mid';
        else if (tone === 'neutral') cls += ' mid solid';
        else cls += isLast ? ' win' : ' mid';
        return `
          <div class="sc-col">
            <div class="${cls}" style="height:${h.toFixed(2)}%" title="${escapeHtml(c.title || '')}"></div>
            <span class="sc-col-val ${isLast ? 'last' : ''}" style="bottom:calc(${h.toFixed(2)}% + 4px)">${escapeHtml(c.display)}</span>
          </div>`;
      })
      .join('');
    const axis = columns
      .map(
        (c) => `
          <div class="sc-col-axis">
            <span class="sc-col-lbl">${escapeHtml(c.label)}</span>
            ${c.sub ? `<span class="sc-col-sub">${escapeHtml(c.sub)}</span>` : ''}
          </div>`
      )
      .join('');
    return `
      <div class="sc-cols" role="img" aria-label="${escapeHtml(ariaLabel)}">
        <div class="sc-cols-plot">
          <div class="sc-cols-inner">
            ${cols}
            ${refPct != null ? `<div class="sc-ref-line" style="bottom:${refPct.toFixed(2)}%"><span>${escapeHtml(refLabel)}</span></div>` : ''}
          </div>
        </div>
        <div class="sc-cols-axis">${axis}</div>
      </div>
    `;
  }

  // Dot-and-line chart: years left→right, one line per lab, dots at exact prices (linear $ scale from $0).
  // Rendered at the container's real pixel width so text never scales.
  renderDotLine(force = false) {
    const host = this.storiesEl && this.storiesEl.querySelector('[data-dotline]');
    const spec = this.dotLineSpec;
    if (!host || !spec) return;
    const width = Math.round(host.clientWidth);
    if (!width) return; // hidden: ResizeObserver renders once visible
    if (!force && width === this.dotLineWidth && host.firstElementChild) return;
    this.dotLineWidth = width;

    const { groups, series, format } = spec;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const colorOf = (s) => (isLight && s.lightColor ? s.lightColor : s.color);
    const narrow = width < 480;
    const padL = narrow ? 38 : 46;
    const padR = narrow ? 50 : 64;
    const padT = 16;
    const padB = 30;
    const height = narrow ? 240 : 270;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const n = groups.length;
    const xFor = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const vals = groups.flatMap((g) => series.map((s) => g.values[s.id]?.value).filter((v) => v != null));
    const maxV = Math.max(...vals);
    const step = maxV > 40 ? 20 : maxV > 20 ? 10 : 5;
    const top = Math.ceil(maxV / step) * step;
    const yFor = (v) => padT + plotH - (v / top) * plotH;
    const r = narrow ? 5 : 6;

    // Dot positions; dots with (near-)identical prices in the same year are split sideways (y stays exact)
    const dots = [];
    groups.forEach((g, i) => {
      const inYear = series.map((s) => ({ s, v: g.values[s.id] })).filter((d) => d.v && d.v.value != null);
      inYear.forEach((d) => {
        dots.push({ i, s: d.s, value: d.v.value, title: d.v.title || '', x: xFor(i), y: yFor(d.v.value) });
      });
      const here = dots.filter((d) => d.i === i);
      here.forEach((d, k) => {
        const twins = here.filter((o) => Math.abs(o.y - d.y) < r * 2);
        if (twins.length > 1) {
          const idx = twins.indexOf(d);
          d.x += (idx - (twins.length - 1) / 2) * (r * 2 + 2);
        }
      });
    });

    const grid = [];
    for (let v = 0; v <= top + 1e-9; v += step) {
      const y = yFor(v);
      grid.push(`<line class="sc-dl-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}" />
        <text class="sc-dl-axis" x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">$${v}</text>`);
    }
    const xLabels = groups
      .map((g, i) => `<text class="sc-dl-year" x="${xFor(i).toFixed(1)}" y="${height - 8}" text-anchor="middle">${escapeHtml(g.label)}</text>`)
      .join('');

    const lines = series
      .map((s) => {
        const pts = dots.filter((d) => d.s === s).sort((a, b) => a.i - b.i);
        if (pts.length < 2) return '';
        const dPath = pts.map((p, k) => `${k ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        return `<path d="${dPath}" fill="none" stroke="${colorOf(s)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;
      })
      .join('');

    // Value labels: to the right of each dot, nudged apart vertically within a year; identical values share one label
    const labels = [];
    groups.forEach((g, i) => {
      const here = dots.filter((d) => d.i === i).sort((a, b) => a.y - b.y);
      const placed = [];
      here.forEach((d) => {
        const text = format(d.value);
        const same = placed.find((p) => p.text === text && Math.abs(p.dotY - d.y) < r * 2);
        if (same) return;
        let ly = d.y + 4;
        const prev = placed[placed.length - 1];
        if (prev && ly - prev.ly < 13) ly = prev.ly + 13;
        const maxX = Math.max(...here.filter((o) => Math.abs(o.y - d.y) < r * 2).map((o) => o.x));
        placed.push({ text, ly, dotY: d.y, x: maxX + r + 4 });
      });
      placed.forEach((p) => labels.push(`<text class="sc-dl-val" x="${p.x.toFixed(1)}" y="${p.ly.toFixed(1)}">${escapeHtml(p.text)}</text>`));
    });

    const dotsSvg = dots
      .map(
        (d) => `<g class="sc-dl-dot"><circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${r + 7}" fill="transparent" /><circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${r}" fill="${colorOf(d.s)}" stroke="var(--bg-surface-solid)" stroke-width="2" /><title>${escapeHtml(d.title)}</title></g>`
      )
      .join('');

    host.innerHTML = `
      <svg class="sc-dl-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        ${grid.join('')}
        <line class="sc-dl-base" x1="${padL}" y1="${(padT + plotH).toFixed(1)}" x2="${padL + plotW}" y2="${(padT + plotH).toFixed(1)}" />
        ${xLabels}
        ${lines}
        ${dotsSvg}
        ${labels.join('')}
      </svg>
    `;
  }

  renderStories() {
    if (!this.storiesEl) return;
    const benches = this.data.capabilityBenchmarks || [];
    const gpqa = benches.find((b) => b.id === 'gpqa');
    const hz = this.data.taskHorizon;
    const baselines = this.data.humanBaselines || {};
    const expert = baselines.gpqaExperts?.value ?? gpqa?.humanBaseline ?? null;
    const cards = [];

    // 1) SMARTER — best PhD-level science score each year vs. PhD experts
    if (gpqa && (gpqa.points || []).length) {
      const yearly = this.bestPerYear(gpqa.points, 'score');
      const last = yearly[yearly.length - 1];
      const currentYear = String(new Date().getFullYear());
      cards.push(`
        <section class="sc-story">
          <div class="sc-story-head">
            <span class="sc-story-kicker up">Smarter</span>
            <h2 class="sc-story-title">AI now outscores PhD experts on PhD-level science questions</h2>
          </div>
          <div class="sc-story-big"><strong>${last.score}%</strong><span>AI's best score</span><em>vs.</em><strong class="muted">${expert}%</strong><span>PhD experts in their own field</span></div>
          ${this.columnChart({
            columns: yearly.map((p) => ({
              label: p.year === currentYear ? `${p.year}*` : p.year,
              value: p.score,
              display: `${p.score}%`,
              sub: p.model,
              title: `${p.model} (${p.date}): ${p.score}%`
            })),
            max: 100,
            refValue: expert,
            refLabel: `PhD experts ${expert}%`,
            ariaLabel: `Best AI score on PhD-level science questions by year: ${yearly.map((p) => `${p.year} ${p.score}%`).join(', ')}. PhD experts score ${expert}%.`
          })}
          <p class="sc-story-foot">Best published score each year on GPQA Diamond, a test of PhD-level biology, chemistry &amp; physics questions, vs. PhD experts answering the same questions (GPQA paper—a figure the authors note is generous to humans)${yearly.some((p) => p.year === currentYear) ? `. *${currentYear} so far` : ''}.</p>
        </section>
      `);
    }

    // 2) COST — each lab's best model per year (OpenAI, Anthropic, Google), at published list prices
    const fl = this.data.frontierLabs;
    if (fl && (fl.years || []).length >= 2) {
      const series = fl.series || [];
      const years = fl.years;
      const money = (v) => (v % 1 === 0 ? `$${v}` : v >= 10 ? `$${v.toFixed(2).replace(/0$/, '')}` : formatMoney(v));
      const blend = (m) => (3 * m.inputPrice + m.outputPrice) / 4;
      const groups = years.map((y) => ({
        label: y.year === String(new Date().getFullYear()) ? `${y.year}*` : y.year,
        values: Object.fromEntries(
          series.map((s) => {
            const m = y.models[s.id];
            return [
              s.id,
              m
                ? {
                    value: blend(m),
                    title: `${m.model} (${m.date}): $${m.inputPrice} in / $${m.outputPrice} out per 1M tokens${m.eci != null ? `; capability index ${m.eci}` : ''}`
                  }
                : null
            ];
          })
        )
      }));

      // Headline: prices move up and down by lab, so state the actual range (no cherry-picked ratio)
      const allPrices = years.flatMap((y) => series.map((s) => y.models[s.id]).filter(Boolean).map(blend));
      const lo = Math.min(...allPrices);
      const hi = Math.max(...allPrices);
      const roundDollar = (v) => `$${Math.max(1, Math.round(v))}`;
      const title = `Top AI models have stayed in the same ${roundDollar(lo)}–${roundDollar(hi)} price range since ${years[0].year} — while getting far smarter`;

      cards.push(`
        <section class="sc-story">
          <div class="sc-story-head">
            <span class="sc-story-kicker down">Cost</span>
            <h2 class="sc-story-title">${escapeHtml(title)}</h2>
          </div>
          <div class="sc-legend">${series
            .map((s) => `<span class="sc-legend-item"><span class="sc-legend-dot round" style="background:${document.documentElement.getAttribute('data-theme') === 'light' && s.lightColor ? s.lightColor : s.color}"></span>${escapeHtml(s.shortName || s.name)}</span>`)
            .join('')}</div>
          <div class="sc-dotline" data-dotline role="img" aria-label="${escapeHtml(
            `List price per million tokens of each lab's best model by year: ${years
              .map((y) => `${y.year}: ${series.map((s) => (y.models[s.id] ? `${y.models[s.id].model} ${money(blend(y.models[s.id]))}` : `${s.name} none`)).join(', ')}`)
              .join('; ')}.`
          )}"></div>
          <p class="sc-story-foot detail-only">Published list price to use each lab's most capable model at the end of each year, per million tokens (about 750,000 words; 3:1 input/output blend). ${escapeHtml(fl.trendNote || '')} ${escapeHtml(fl.caveat || '')}</p>
        </section>
      `);
      this.dotLineSpec = { groups, series, format: money };
    }

    // 3) MORE CAPABLE — how long a task AI can finish on its own
    if (hz && (hz.points || []).length) {
      const reliable = hz.points.filter((p) => p.ciHigh == null || p.ciHigh <= (hz.reliableMaxMinutes || Infinity));
      const yearly = this.bestPerYear(reliable, 'minutes');
      const last = yearly[yearly.length - 1];
      const firstPt = yearly[0];
      cards.push(`
        <section class="sc-story">
          <div class="sc-story-head">
            <span class="sc-story-kicker up">More capable</span>
            <h2 class="sc-story-title">AI can now finish tasks that take a skilled person ${escapeHtml(formatMinutes(last.minutes))}</h2>
          </div>
          <div class="sc-story-big"><strong class="muted">${escapeHtml(formatMinutes(firstPt.minutes))}</strong><span>${escapeHtml(firstPt.year)}</span><em>→</em><strong>${escapeHtml(formatMinutes(last.minutes))}</strong><span>${escapeHtml(last.year)}</span></div>
          ${this.columnChart({
            columns: yearly.map((p) => ({
              label: p.year,
              value: p.minutes,
              display: formatMinutes(p.minutes),
              sub: p.label,
              title: `${p.label}: ${formatMinutes(p.minutes)}`
            })),
            ariaLabel: `Length of task AI can complete on its own, by year: ${yearly.map((p) => `${p.year} ${formatMinutes(p.minutes)}`).join(', ')}.`
          })}
          <p class="sc-story-foot">Length of software and research tasks (timed on skilled humans) that the best AI completes on its own at least half the time. Measured by METR${hz.doublingNote ? `; ${escapeHtml(hz.doublingNote)}` : ''}.</p>
        </section>
      `);
    }

    // 4) MATH — expert-level math solved (Epoch AI's own runs) + verified milestones
    const mp = this.data.mathProgress;
    const fm = mp?.frontierMath;
    if (fm && (fm.points || []).length) {
      const yearly = this.bestPerYear(fm.points, 'score');
      const firstPt = yearly[0];
      const last = yearly[yearly.length - 1];
      const currentYear = String(new Date().getFullYear());
      const medals = mp.milestones || [];
      cards.push(`
        <section class="sc-story">
          <div class="sc-story-head">
            <span class="sc-story-kicker up">Math</span>
            <h2 class="sc-story-title">${escapeHtml(mp.headline || `AI now solves ${Math.round(last.score)}% of expert-written math problems`)}</h2>
          </div>
          ${
            medals.length
              ? `<div class="sc-milestones">
              ${medals
                .map(
                  (m) => `
                  <div class="sc-milestone ${escapeHtml(m.tier)}">
                    <span class="sc-milestone-badge">${m.tier === 'gold' ? 'Gold' : m.tier === 'silver' ? 'Silver' : m.tier === 'claimed' ? '?' : '★'}</span>
                    <span class="sc-milestone-body">
                      <span class="sc-milestone-yr">${escapeHtml(m.year)}</span>
                      <span class="sc-milestone-title">${escapeHtml(m.title)}</span>
                      ${m.status ? `<span class="sc-milestone-status">${escapeHtml(m.status)}</span>` : ''}
                      <span class="sc-milestone-txt detail-only">${escapeHtml(m.text)}${m.sourceUrl ? ` <a href="${escapeHtml(m.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}</span>
                    </span>
                  </div>`
                )
                .join('')}
            </div>`
              : ''
          }
          <div class="sc-story-big"><strong class="muted">${Math.round(firstPt.score)}%</strong><span>${escapeHtml(firstPt.year)}</span><em>→</em><strong>${Math.round(last.score)}%</strong><span>${escapeHtml(last.year)} · expert-written math problems solved</span></div>
          ${this.columnChart({
            columns: yearly.map((p) => ({
              label: p.year === currentYear ? `${p.year}*` : p.year,
              value: p.score,
              display: `${Math.round(p.score)}%`,
              sub: p.model,
              title: `${p.model} (${p.date}): ${p.score}%`
            })),
            max: 100,
            ariaLabel: `Share of FrontierMath expert math problems solved by the best AI each year: ${yearly.map((p) => `${p.year} ${p.score}%`).join(', ')}.`
          })}
          <p class="sc-story-foot">Best score each year on FrontierMath, graded by Epoch AI, an independent research group${yearly.some((p) => p.year === currentYear) ? `. *${currentYear} so far` : ''}.<span class="detail-only"> ${escapeHtml(fm.caveat || '')} ${escapeHtml(mp.excludedNote || '')}</span></p>
        </section>
      `);
    }

    this.storiesEl.innerHTML = `
      <div class="sc-story-grid">${cards.join('')}</div>
      <button class="sv-bridge" data-sv-jump type="button">
        <span>What powers all of this — and what does it cost the planet?</span>
        <strong>See the Data Centers →</strong>
      </button>
    `;
    const jump = this.storiesEl.querySelector('[data-sv-jump]');
    if (jump && this.onJumpToDataCenters) jump.addEventListener('click', () => this.onJumpToDataCenters());

    const dl = this.storiesEl.querySelector('[data-dotline]');
    this.dotLineWidth = null; // new host element: always redraw it
    if (dl) {
      if (this.dotLineObserver) this.dotLineObserver.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        this.dotLineObserver = new ResizeObserver(() => this.renderDotLine());
        this.dotLineObserver.observe(dl);
      }
      this.renderDotLine(true);
      requestAnimationFrame(() => this.renderDotLine());
    }
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

    // Scale to the data: log range spans whole powers of ten around the prices
    const hiP = Math.max(...pts.map((p) => p.pricePer1M));
    const loP = Math.min(...pts.map((p) => p.pricePer1M));
    const maxPrice = this.costScale === 'log' ? 10 ** Math.ceil(Math.log10(hiP * 1.05)) : Math.ceil(hiP * 1.15 * 4) / 4;
    const minPrice = 10 ** Math.floor(Math.log10(loP * 0.95));

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

    const yTicks = [];
    if (this.costScale === 'log') {
      for (let v = maxPrice; v >= minPrice * 0.999; v /= 10) yTicks.push(v);
    } else {
      for (let i = 4; i >= 0; i--) yTicks.push((maxPrice * i) / 4);
    }

    const gridYHtml = yTicks
      .map((val) => {
        const y = val === 0 ? padT + plotH : yFor(val);
        return `
          <line class="sc-grid-h" x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}" />
          <text class="sc-axis-lbl" x="${padL - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${val === 0 ? '$0' : formatPrice(val)}</text>
        `;
      })
      .join('');

    const xYears = [];
    for (let y = new Date(minTs).getFullYear() + 1; y <= new Date(maxTs).getFullYear(); y++) xYears.push(`${y}-01-01`);
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
        const showTopLabel = sel || i === 0 || i === coords.length - 1;
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
    const dropText = dropFactor <= 1.05 ? 'Starting price' : `${Math.round(dropFactor * 10) / 10}× cheaper than ${pts[0].label}`;

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
        <strong>In plain terms:</strong> ${escapeHtml(series.humanAnalogy)}
        ${series.caveat ? `<br /><strong>Caveat:</strong> ${escapeHtml(series.caveat)}` : ''}
      </div>

      <svg class="sc-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${series.title}: ${formatPrice(pts[0].pricePer1M)} to ${formatPrice(pts[pts.length - 1].pricePer1M)}`)}">
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
            <span class="sc-num-val">${active.inputPrice != null && active.outputPrice != null ? `${formatPrice(active.inputPrice)} / ${formatPrice(active.outputPrice)}` : "Blended only"}</span>
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
    const allDates = benchmarks.flatMap((b) => (b.points || []).map((p) => parseDate(p.date).getTime()));
    const minTs = new Date(new Date(Math.min(...allDates)).getFullYear(), 0, 1).getTime();
    const maxTs = Math.max(...allDates) + 1000 * 60 * 60 * 24 * 45;

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

    const benchYears = [];
    for (let y = new Date(minTs).getFullYear() + 1; y <= new Date(maxTs).getFullYear(); y++) benchYears.push(`${y}-01`);
    const gridXHtml = benchYears
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
          <h2>Rising Scores on PhD-Level Science &amp; Real Software Work</h2>
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

      <svg class="sc-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="AI capability growth on GPQA Diamond and SWE-bench Verified">
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
        // Linear scale: bar length is exactly proportional to the measured task length
        const widthPct = Math.max(0, Math.min(100, (p.minutes / maxMin) * 100));
        const labelVal = formatMinutes(p.minutes);
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

  renderFlagshipTable() {
    if (!this.flagshipEl) return;
    const fs = this.data.flagshipModels;
    if (!fs || !(fs.models || []).length) {
      this.flagshipEl.classList.add('hidden');
      return;
    }
    const blend = (m) => (3 * m.inputPrice + m.outputPrice) / 4;
    const rows = [...fs.models]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (m) => `
        <tr>
          <td class="fl-date">${escapeHtml(m.date.slice(0, 7))}</td>
          <td><strong>${escapeHtml(m.model)}</strong><span class="fl-lab">${escapeHtml(m.lab)}</span>${m.note ? `<span class="fl-note">${escapeHtml(m.note)}</span>` : ''}</td>
          <td class="fl-num">$${m.inputPrice} / $${m.outputPrice}</td>
          <td class="fl-num">${formatMoney(blend(m))}</td>
          <td class="fl-num">${m.gpqa != null ? `${m.gpqa}%` : '<span class="fl-na">not reported</span>'}</td>
          <td class="fl-num">${m.eci != null ? m.eci.toFixed(1) : '<span class="fl-na">—</span>'}</td>
          <td><a class="fl-src" href="${escapeHtml(m.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a></td>
        </tr>`
      )
      .join('');
    this.flagshipEl.innerHTML = `
      <div class="sc-card-head">
        <div>
          <span class="eyebrow">Frontier Models</span>
          <h2>${escapeHtml(fs.title)}</h2>
          <p class="detail-prose">${escapeHtml(fs.note)}</p>
        </div>
        <a class="bt-source-link" href="${escapeHtml(fs.eciSourceUrl)}" target="_blank" rel="noopener noreferrer">Epoch Capabilities Index data ↗</a>
      </div>
      <div class="fl-table-wrap">
        <table class="fl-table">
          <thead>
            <tr><th>Released</th><th>Model</th><th>In / out per 1M</th><th>Blended</th><th>GPQA Diamond</th><th>ECI</th><th></th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
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
