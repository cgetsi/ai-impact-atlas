import { escapeHtml, formatNumber } from './utils.js';

const DOMAIN_ORDER = ['medicine', 'math', 'science', 'accessibility'];

// Simple-view icons (24×24 stroke paths)
const ICONS = {
  health: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><line x1="7" y1="15" x2="17" y2="15"/>',
  storm: '<path d="M18 16a4 4 0 0 0-1-7.9A6 6 0 0 0 5.3 10 3.5 3.5 0 0 0 6 17h1"/><polyline points="13 11 10 16 14 16 11 21"/>',
  book: '<path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z"/><path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>',
  speech: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bolt: '<polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  factory: '<path d="M2 20V9l6 4V9l6 4V5h4l2 15z"/><line x1="2" y1="20" x2="22" y2="20"/>',
  sigma: '<polyline points="18 5 6 5 12 12 6 19 18 19"/>'
};

function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// "What AI is doing for people" — everyday life areas, each backed by a cited event in breakthroughs.json
const PEOPLE_IMPACT = [
  { area: 'Your language', icon: 'globe', eventId: 'nllb-200-languages-2022', value: '200', line: 'languages covered by free AI translation' },
  { area: 'Time with patients', icon: 'clock', eventId: 'ambient-clinical-ai-burnout-2025', value: '~1 hr', line: 'of paperwork saved per doctor, per day' },
  { area: 'New medicines', icon: 'flask', eventId: 'rentosertib-phase2a-nature-med-2025', value: '1st', line: 'AI-discovered drug to succeed in a human trial' },
  { area: 'Storm warnings', icon: 'storm', eventId: 'gencast-extreme-weather-2024', value: '15 days', line: 'of more accurate extreme-weather forecasts' },
  { area: 'Learning', icon: 'book', eventId: 'ai-tutoring-rct-2024', value: '2×', line: 'more learned per hour with an AI tutor' },
  { area: 'A voice again', icon: 'speech', eventId: 'bci-speech-restoration-2023', value: '62–78', line: 'words per minute for paralyzed patients' },
  { area: 'Sight assistance', icon: 'eye', eventId: 'bemyeyes-vision-ai-2023', value: '600K+', line: 'blind & low-vision people can use it free' },
  { area: 'Cleaner power', icon: 'bolt', eventId: 'clean-grid-ai-dispatch-2026', value: '10–30%', line: 'more clean power through existing lines' }
];

const SIMPLE_CARD_BATCH = 9;

function parseIsoDate(str) {
  if (!str) return new Date(2020, 0, 1);
  const [y, m = 1, d = 1] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatReadableDate(str) {
  const dt = parseIsoDate(str);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthYear(str) {
  const dt = parseIsoDate(str);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function tierBadgeHtml(tier, customLabel) {
  const cls =
    tier === 'verified' ? 'ver-verified' : tier === 'trial' ? 'ver-trial' : 'ver-milestone';
  const fallback =
    tier === 'verified' ? 'Verified' : tier === 'trial' ? 'Clinical Trial' : 'Milestone';
  return `<span class="ver-badge ${cls}">${escapeHtml(customLabel || fallback)}</span>`;
}

export class BreakthroughsView {
  constructor(data, { initialEventId = null, onEventSelect, onCopyLink, onJumpToView, onRequestDetailed, isSimple } = {}) {
    this.data = data;
    this.onEventSelect = onEventSelect;
    this.onCopyLink = onCopyLink;
    this.onJumpToView = onJumpToView;
    this.onRequestDetailed = onRequestDetailed;
    this.simpleDomain = 'all';
    this.simpleShowAll = false;

    this.events = [...(data.events || [])].sort((a, b) => a.date.localeCompare(b.date));
    this.domainMap = new Map((data.domains || []).map((d) => [d.id, d]));

    this.activeDomain = 'all';
    this.activeTier = 'all';
    this.timeRange = 'all'; // 'all' (2020-2026) | 'recent' (2023-2026)
    this.searchQuery = '';
    this.selectedEventId =
      (initialEventId && this.events.some((e) => e.id === initialEventId) ? initialEventId : null) ||
      (this.events.length ? this.events[this.events.length - 1].id : null);

    this.heroEl = document.getElementById('btHeroKpis');
    this.controlsEl = document.getElementById('btControls');
    this.chartWrapEl = document.getElementById('btTimelineChart');
    this.inspectorEl = document.getElementById('btInspector');
    this.cardsEl = document.getElementById('btCardsGrid');
    this.mathEl = document.getElementById('btMathBoard');
    this.medEl = document.getElementById('btMedicalPipeline');
    this.simpleEl = document.getElementById('btSimple');

    this.renderHero();
    this.renderSimple();
    this.renderControls();
    this.renderAllDynamic();
    this.renderMathBoard();
    this.renderMedicalPipeline();

    // A shared ?event= link opened in Simple mode shows that breakthrough's quick view
    if (initialEventId && typeof isSimple === 'function' && isSimple()) {
      const ev = this.events.find((e) => e.id === initialEventId);
      if (ev) setTimeout(() => this.openSimpleDialog(ev), 250);
    }
  }

  getFilteredEvents() {
    const q = this.searchQuery.trim().toLowerCase();
    const minYear = this.timeRange === 'recent' ? 2023 : 2020;

    return this.events.filter((ev) => {
      const yr = Number(ev.date.slice(0, 4));
      if (yr < minYear) return false;
      if (this.activeDomain !== 'all' && ev.domain !== this.activeDomain) return false;
      if (this.activeTier !== 'all' && ev.verificationTier !== this.activeTier) return false;
      if (q) {
        const hay = `${ev.title} ${ev.organization} ${ev.summary} ${ev.whyItMatters} ${(ev.metrics || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  selectEvent(eventId, { notify = true, scrollToInspector = false } = {}) {
    if (!this.events.some((e) => e.id === eventId)) return;
    this.selectedEventId = eventId;
    this.renderTimelineChart();
    this.renderInspector();
    this.updateActiveCardHighlight();

    if (notify && this.onEventSelect) {
      this.onEventSelect(eventId);
    }
    if (scrollToInspector && this.inspectorEl && window.innerWidth < 960) {
      this.inspectorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  setTheme() {
    this.renderSimple();
    this.renderTimelineChart();
    this.renderMedicalPipeline();
  }

  getDomainColor(domainId) {
    const dom = this.domainMap.get(domainId);
    if (!dom) return '#38bdf8';
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight && dom.lightColor ? dom.lightColor : dom.color;
  }

  renderHero() {
    if (!this.heroEl) return;
    const total = this.events.length;
    const verifiedCount = this.events.filter((e) => e.verificationTier === 'verified').length;
    const verifiedPct = total ? Math.round((verifiedCount / total) * 100) : 0;

    const earlyPace = this.events.filter((e) => Number(e.date.slice(0, 4)) <= 2022).length / 3;
    const recentPace = this.events.filter((e) => Number(e.date.slice(0, 4)) >= 2024 && Number(e.date.slice(0, 4)) <= 2025).length / 2;
    const accelRatio = earlyPace > 0 ? (recentPace / earlyPace).toFixed(1) : '3.0';

    const fdaSeries = this.data.clinicalPipeline?.fdaAnnualDevices || [];
    const latestFda = fdaSeries.length ? fdaSeries[fdaSeries.length - 1].cumulative : 1250;

    this.heroEl.innerHTML = `
      <div class="hero-kpi">
        <div class="hero-kpi-val">${formatNumber(latestFda)}+</div>
        <div class="hero-kpi-label">AI tools helping U.S. doctors</div>
        <div class="hero-kpi-sub detail-only">FDA-authorized AI/ML medical devices operating in U.S. care</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${formatNumber(total)}</div>
        <div class="hero-kpi-label">Breakthroughs tracked</div>
        <div class="hero-kpi-sub detail-only">Curated 2020–2026 breakthroughs with primary citations</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${accelRatio}×</div>
        <div class="hero-kpi-label">More breakthroughs per year</div>
        <div class="hero-kpi-sub detail-only">2024–2025 annual cadence vs. 2020–2022 baseline</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${verifiedPct}%</div>
        <div class="hero-kpi-label">Peer-reviewed or in real use</div>
        <div class="hero-kpi-sub detail-only">Nature, Science, NEJM, Lean 4, or FDA-cleared</div>
      </div>
    `;
  }

  /* ------------------------------------------------------------------------
     SIMPLE VIEW — people-first, visual, minimal text
     ------------------------------------------------------------------------ */
  renderSimple() {
    if (!this.simpleEl) return;
    const evById = new Map(this.events.map((e) => [e.id, e]));
    const domains = DOMAIN_ORDER.map((id) => this.domainMap.get(id)).filter(Boolean);

    // 1) What AI is doing for people
    const tilesHtml = PEOPLE_IMPACT.map((t) => {
      const ev = evById.get(t.eventId);
      if (!ev) return '';
      return `
        <button class="sv-impact-tile" data-sv-event="${escapeHtml(ev.id)}" type="button" style="--dom-color:${this.getDomainColor(ev.domain)}">
          <span class="sv-impact-top">
            <span class="sv-impact-icon">${iconSvg(t.icon)}</span>
            <span class="sv-impact-area">${escapeHtml(t.area)}</span>
          </span>
          <span class="sv-impact-val">${escapeHtml(t.value)}</span>
          <span class="sv-impact-line">${escapeHtml(t.line)}</span>
        </button>
      `;
    }).join('');

    // 2) Breakthroughs per year, stacked by area
    const startYear = 2020;
    const endYear = Number((this.data.meta?.coverageEnd || '2026').slice(0, 4)) || 2026;
    const years = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);
    const counts = new Map(years.map((y) => [y, new Map(DOMAIN_ORDER.map((d) => [d, 0]))]));
    this.events.forEach((ev) => {
      const yc = counts.get(Number(ev.date.slice(0, 4)));
      if (yc && yc.has(ev.domain)) yc.set(ev.domain, yc.get(ev.domain) + 1);
    });
    const totals = years.map((y) => [...counts.get(y).values()].reduce((a, b) => a + b, 0));
    const maxTotal = Math.max(1, ...totals);
    const currentYear = new Date().getFullYear();
    const partialYear = endYear >= currentYear ? endYear : null;

    const colsHtml = years
      .map((y, i) => {
        const total = totals[i];
        // Segment heights are exact shares of the column; the column height is an exact share of the plot
        const segs = DOMAIN_ORDER.map((d) => {
          const n = counts.get(y).get(d);
          if (!n) return '';
          const dom = this.domainMap.get(d);
          return `<span class="sv-year-seg" style="height:${((n / total) * 100).toFixed(2)}%;background:${this.getDomainColor(d)}" title="${y} · ${escapeHtml(dom ? dom.shortLabel : d)}: ${n}"></span>`;
        }).join('');
        const colPct = ((total / maxTotal) * 100).toFixed(2);
        return `
          <div class="sv-year-col">
            <div class="sv-year-plot">
              <div class="sv-year-bar" style="height:${colPct}%">${segs}</div>
              <span class="sv-year-total" style="bottom:calc(${colPct}% + 4px)">${total || ''}</span>
            </div>
            <span class="sv-year-lbl">${y}${y === partialYear ? '*' : ''}</span>
          </div>
        `;
      })
      .join('');

    const legendHtml = domains
      .map((d) => `<span class="sv-legend-item"><span class="sv-dot" style="background:${this.getDomainColor(d.id)}"></span>${escapeHtml(d.shortLabel)}</span>`)
      .join('');

    // 3) Honest "still being worked on" ledger, computed from the dataset
    const drugs = this.data.clinicalPipeline?.trackedDrugs || [];
    const approvedDrugs = drugs.filter((d) => d.stageIndex >= 5).length;
    const failedDrugs = drugs.filter((d) => d.stageIndex === 0).length;
    const openMath = (this.data.openMathProblems || []).filter((m) => m.statusTone === 'open').length;

    const honestRows = [
      { icon: 'flask', value: String(approvedDrugs), line: `AI-discovered drugs fully approved yet — ${drugs.length - failedDrugs - approvedDrugs} still in testing` },
      { icon: 'alert', value: String(failedDrugs), line: `tracked AI-discovered ${failedDrugs === 1 ? 'drug' : 'drugs'} failed in human trials` },
      { icon: 'sigma', value: String(openMath), line: 'famous math problems still unsolved' }
    ];

    const domainChips = [
      `<button class="bt-pill ${this.simpleDomain === 'all' ? 'active' : ''}" data-sv-domain="all" type="button">All <span class="sv-chip-n">${this.events.length}</span></button>`,
      ...domains.map((d) => {
        const n = this.events.filter((e) => e.domain === d.id).length;
        return `<button class="bt-pill ${this.simpleDomain === d.id ? 'active' : ''}" data-sv-domain="${escapeHtml(d.id)}" type="button"><span class="bt-pill-dot" style="background:${this.getDomainColor(d.id)}"></span>${escapeHtml(d.shortLabel)} <span class="sv-chip-n">${n}</span></button>`;
      })
    ].join('');

    this.simpleEl.innerHTML = `
      <section class="sv-block">
        <h2 class="sv-h2">What AI is already doing for people</h2>
        <div class="sv-impact-grid">${tilesHtml}</div>
      </section>

      <div class="sv-two-col">
        <section class="sv-card">
          <div class="sv-card-head">
            <h2 class="sv-h2">Breakthroughs are speeding up</h2>
            <span class="sv-muted">Verified breakthroughs per year</span>
          </div>
          <div class="sv-year-chart" role="img" aria-label="Verified AI breakthroughs per year, ${startYear} to ${endYear}: ${years.map((y, i) => `${y}: ${totals[i]}`).join(', ')}">${colsHtml}</div>
          <div class="sv-legend">${legendHtml}${partialYear ? `<span class="sv-muted sv-foot">*${partialYear} so far</span>` : ''}</div>
        </section>

        <section class="sv-card sv-honest">
          <div class="sv-card-head">
            <h2 class="sv-h2">Still being worked on</h2>
            <span class="sv-muted">The honest side</span>
          </div>
          <div class="sv-honest-list">
            ${honestRows
              .map(
                (r) => `
                <div class="sv-honest-row">
                  <span class="sv-honest-icon">${iconSvg(r.icon)}</span>
                  <span class="sv-honest-val">${escapeHtml(r.value)}</span>
                  <span class="sv-honest-line">${escapeHtml(r.line)}</span>
                </div>
              `
              )
              .join('')}
            <button class="sv-honest-row sv-honest-link" data-sv-jump="compare" type="button">
              <span class="sv-honest-icon">${iconSvg('factory')}</span>
              <span class="sv-honest-line">AI data centers use real power &amp; water</span>
              <span class="sv-honest-cta">See the costs →</span>
            </button>
          </div>
        </section>
      </div>

      <section class="sv-block">
        <div class="sv-block-head">
          <h2 class="sv-h2">Every breakthrough we track</h2>
          <div class="bt-domain-pills" role="group" aria-label="Filter breakthroughs by area">${domainChips}</div>
        </div>
        <div id="btSimpleCards" class="sv-bt-grid"></div>
        <button id="btSimpleMore" class="sv-more-btn" type="button"></button>
      </section>
    `;

    this.simpleEl.querySelectorAll('.sv-impact-tile[data-sv-event]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ev = evById.get(btn.dataset.svEvent);
        if (ev) this.openSimpleDialog(ev);
      });
    });
    this.simpleEl.querySelectorAll('[data-sv-jump]').forEach((btn) => {
      btn.addEventListener('click', () => this.onJumpToView && this.onJumpToView(btn.dataset.svJump));
    });
    this.simpleEl.querySelectorAll('[data-sv-domain]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.simpleDomain = btn.dataset.svDomain;
        this.simpleShowAll = false;
        this.simpleEl.querySelectorAll('[data-sv-domain]').forEach((b) =>
          b.classList.toggle('active', b.dataset.svDomain === this.simpleDomain)
        );
        this.renderSimpleCards();
      });
    });
    const moreBtn = this.simpleEl.querySelector('#btSimpleMore');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        this.simpleShowAll = !this.simpleShowAll;
        this.renderSimpleCards();
      });
    }

    this.renderSimpleCards();
  }

  renderSimpleCards() {
    const grid = this.simpleEl && this.simpleEl.querySelector('#btSimpleCards');
    const moreBtn = this.simpleEl && this.simpleEl.querySelector('#btSimpleMore');
    if (!grid) return;

    const list = [...this.events]
      .filter((e) => this.simpleDomain === 'all' || e.domain === this.simpleDomain)
      .reverse();
    const shown = this.simpleShowAll ? list : list.slice(0, SIMPLE_CARD_BATCH);

    grid.innerHTML = shown
      .map((ev) => {
        const dom = this.domainMap.get(ev.domain);
        const stat = ev.bigStat || { value: '', label: (ev.metrics && ev.metrics[0]) || '' };
        const tierShort = ev.verificationTier === 'verified' ? 'Verified' : ev.verificationTier === 'trial' ? 'In trials' : 'Milestone';
        return `
          <button class="sv-bt-card" data-sv-card="${escapeHtml(ev.id)}" type="button" style="--dom-color:${this.getDomainColor(ev.domain)}">
            <span class="sv-bt-top">
              <span class="sv-dot"></span>${escapeHtml(dom ? dom.shortLabel : ev.domain)}
              <span class="sv-bt-year">${escapeHtml(ev.date.slice(0, 4))}</span>
            </span>
            ${stat.value ? `<span class="sv-bt-val">${escapeHtml(stat.value)}</span>` : ''}
            <span class="sv-bt-vlabel">${escapeHtml(stat.label)}</span>
            <span class="sv-bt-head">${escapeHtml(ev.plainHeadline || ev.shortLabel)}</span>
            <span class="sv-bt-foot">${tierBadgeHtml(ev.verificationTier, tierShort)}</span>
          </button>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-sv-card]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ev = this.events.find((e) => e.id === btn.dataset.svCard);
        if (ev) this.openSimpleDialog(ev);
      });
    });

    if (moreBtn) {
      const hidden = list.length - SIMPLE_CARD_BATCH;
      moreBtn.classList.toggle('hidden', hidden <= 0);
      moreBtn.textContent = this.simpleShowAll ? 'Show fewer' : `Show all ${list.length}`;
    }
  }

  openSimpleDialog(ev) {
    if (!this.dialogEl) {
      const d = document.createElement('dialog');
      d.className = 'sv-dialog';
      d.addEventListener('click', (e) => {
        if (e.target === d) d.close();
      });
      document.body.appendChild(d);
      this.dialogEl = d;
    }
    const d = this.dialogEl;
    const dom = this.domainMap.get(ev.domain);
    const color = this.getDomainColor(ev.domain);
    const stat = ev.bigStat || { value: '', label: (ev.metrics && ev.metrics[0]) || '' };

    d.innerHTML = `
      <div class="sv-dlg" style="--dom-color:${color}">
        <div class="sv-dlg-top">
          <span class="bt-dom-pill" style="--dom-color:${color}">${escapeHtml(dom ? dom.label : ev.domain)}</span>
          ${tierBadgeHtml(ev.verificationTier, ev.verificationLabel)}
          <span class="sv-muted">${escapeHtml(formatMonthYear(ev.date))}</span>
          <button class="icon-btn icon-btn-sm sv-dlg-close" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        ${stat.value ? `<div class="sv-dlg-stat"><span class="sv-dlg-val">${escapeHtml(stat.value)}</span><span class="sv-dlg-lbl">${escapeHtml(stat.label)}</span></div>` : ''}
        <h3 class="sv-dlg-title">${escapeHtml(ev.plainHeadline || ev.title)}</h3>
        <div class="sv-dlg-block positive"><h4>Why it matters</h4><p>${escapeHtml(ev.whyItMatters)}</p></div>
        <div class="sv-dlg-block caveat"><h4>Honest context</h4><p>${escapeHtml(ev.caveats)}</p></div>
        <div class="sv-dlg-sources">
          ${(ev.sources || [])
            .map((s) => `<a class="bt-source-link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(s.publisher)}</span> ↗</a>`)
            .join('')}
        </div>
        <div class="sv-dlg-actions">
          <button class="sv-more-btn sv-dlg-full" type="button">See full details →</button>
        </div>
      </div>
    `;

    d.querySelector('.sv-dlg-close').addEventListener('click', () => d.close());
    d.querySelector('.sv-dlg-full').addEventListener('click', () => {
      d.close();
      if (this.onRequestDetailed) this.onRequestDetailed(ev.id);
    });

    if (this.onEventSelect) this.onEventSelect(ev.id);
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }

  renderControls() {
    if (!this.controlsEl) return;
    const domains = this.data.domains || [];

    this.controlsEl.innerHTML = `
      <div class="bt-filter-row">
        <div class="bt-domain-pills" role="group" aria-label="Filter breakthroughs by domain">
          <button class="bt-pill ${this.activeDomain === 'all' ? 'active' : ''}" data-bt-domain="all" type="button">
            All Domains
          </button>
          ${domains
            .map(
              (d) => `
              <button class="bt-pill ${this.activeDomain === d.id ? 'active' : ''}" data-bt-domain="${escapeHtml(d.id)}" type="button">
                <span class="bt-pill-dot" style="background:${escapeHtml(d.color)}"></span>
                ${escapeHtml(d.shortLabel)}
              </button>
            `
            )
            .join('')}
        </div>

        <div class="bt-right-controls">
          <div class="bt-range-toggle" role="group" aria-label="Timeline window">
            <button class="bt-range-btn ${this.timeRange === 'all' ? 'active' : ''}" data-bt-range="all" type="button">2020–2026</button>
            <button class="bt-range-btn ${this.timeRange === 'recent' ? 'active' : ''}" data-bt-range="recent" type="button">2023–2026</button>
          </div>

          <select id="btTierFilter" class="select-control" aria-label="Filter by verification tier">
            <option value="all">All Evidence Tiers</option>
            <option value="verified">Verified / Deployed</option>
            <option value="trial">Clinical Trials / Replicated</option>
            <option value="milestone">Frontier Milestones</option>
          </select>

          <input id="btSearchInput" class="bt-search-input" type="search" placeholder="Filter breakthroughs..." aria-label="Search breakthroughs" value="${escapeHtml(this.searchQuery)}" />
        </div>
      </div>
    `;

    this.controlsEl.querySelectorAll('[data-bt-domain]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeDomain = btn.dataset.btDomain;
        this.controlsEl.querySelectorAll('[data-bt-domain]').forEach((b) =>
          b.classList.toggle('active', b.dataset.btDomain === this.activeDomain)
        );
        this.renderAllDynamic();
      });
    });

    this.controlsEl.querySelectorAll('[data-bt-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.timeRange = btn.dataset.btRange;
        this.controlsEl.querySelectorAll('[data-bt-range]').forEach((b) =>
          b.classList.toggle('active', b.dataset.btRange === this.timeRange)
        );
        this.renderAllDynamic();
      });
    });

    const tierSel = this.controlsEl.querySelector('#btTierFilter');
    if (tierSel) {
      tierSel.value = this.activeTier;
      tierSel.addEventListener('change', (e) => {
        this.activeTier = e.target.value;
        this.renderAllDynamic();
      });
    }

    const srch = this.controlsEl.querySelector('#btSearchInput');
    if (srch) {
      srch.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderAllDynamic();
      });
    }
  }

  renderAllDynamic() {
    const filtered = this.getFilteredEvents();
    if (filtered.length && !filtered.some((e) => e.id === this.selectedEventId)) {
      this.selectedEventId = filtered[filtered.length - 1].id;
    }
    this.renderTimelineChart(filtered);
    this.renderInspector(filtered);
    this.renderCardsGrid(filtered);
  }

  renderTimelineChart(preFiltered) {
    if (!this.chartWrapEl) return;
    const filtered = preFiltered || this.getFilteredEvents();

    if (!filtered.length) {
      this.chartWrapEl.innerHTML = `
        <div class="bt-empty-state">
          No breakthroughs match the active filters. Try selecting <strong>All Domains</strong> or clearing your search.
        </div>
      `;
      return;
    }

    const startYear = this.timeRange === 'recent' ? 2023 : 2020;
    const endYear = 2026;
    const minTs = new Date(startYear, 0, 1).getTime();
    const maxTs = new Date(endYear, 11, 31).getTime();

    const width = 960;
    const height = 390;
    const padL = 136;
    const padR = 30;
    const padT = 34;
    const padB = 48;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const xForDate = (dateStr) => {
      const ts = parseIsoDate(dateStr).getTime();
      const clamped = Math.max(minTs, Math.min(maxTs, ts));
      return padL + ((clamped - minTs) / (maxTs - minTs)) * plotW;
    };

    const visibleDomains =
      this.activeDomain === 'all' ? DOMAIN_ORDER : [this.activeDomain];
    const laneHeight = plotH / visibleDomains.length;
    const yForDomain = (domId) => {
      const idx = Math.max(0, visibleDomains.indexOf(domId));
      return padT + laneHeight * idx + laneHeight * 0.5;
    };

    // Yearly counts for subtle background acceleration histogram
    const years = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);

    const yearCounts = new Map(years.map((y) => [y, 0]));
    filtered.forEach((ev) => {
      const y = Number(ev.date.slice(0, 4));
      if (yearCounts.has(y)) yearCounts.set(y, yearCounts.get(y) + 1);
    });

    // Cumulative curve points (quarter-resolution across timeframe)
    const cumPoints = [];
    let running = 0;
    const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
    const maxCum = Math.max(1, sorted.length);
    cumPoints.push({ x: padL, y: padT + plotH });
    sorted.forEach((ev) => {
      running++;
      const x = xForDate(ev.date);
      const y = padT + plotH - (running / maxCum) * (plotH * 0.86);
      cumPoints.push({ x, y });
    });
    const lastCum = cumPoints[cumPoints.length - 1];
    cumPoints.push({ x: padL + plotW, y: lastCum.y });

    const areaPath =
      `M ${cumPoints[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} ` +
      cumPoints.map((pt) => `L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ') +
      ` L ${(padL + plotW).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

    const linePath = cumPoints
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');

    // Place nodes with smart collision nudging within each domain swimlane
    const placedNodes = [];
    const byLane = new Map();
    sorted.forEach((ev) => {
      const baseX = xForDate(ev.date);
      const baseY = yForDomain(ev.domain);
      const r = ev.impactScore >= 5 ? 11.5 : ev.impactScore === 4 ? 9 : 7.2;

      const laneList = byLane.get(ev.domain) || [];
      let dy = 0;
      const offsets = [0, -18, 18, -32, 32, -10, 10];
      for (const candidateDy of offsets) {
        const overlaps = laneList.some(
          (other) => Math.hypot(other.x - baseX, other.y - (baseY + candidateDy)) < other.r + r + 5
        );
        if (!overlaps) {
          dy = candidateDy;
          break;
        }
      }
      const node = { ev, x: baseX, y: baseY + dy, r };
      laneList.push(node);
      byLane.set(ev.domain, laneList);
      placedNodes.push(node);
    });

    // Label priority: selected node + select high-impact non-overlapping nodes
    const labeledRects = [];
    const selectedNode = placedNodes.find((n) => n.ev.id === this.selectedEventId);
    const labelCandidates = [
      ...(selectedNode ? [selectedNode] : []),
      ...placedNodes
        .filter((n) => n.ev.id !== this.selectedEventId && n.ev.impactScore >= 5)
        .reverse()
    ];

    const visibleLabels = new Set();
    labelCandidates.forEach((n) => {
      const approxW = Math.min(130, n.ev.shortLabel.length * 6.4 + 12);
      const lx = Math.max(padL + 6, Math.min(padL + plotW - approxW, n.x - approxW / 2));
      const ly = n.y - n.r - 17;
      const box = { x1: lx - 4, x2: lx + approxW + 4, y1: ly - 4, y2: ly + 16 };
      const collides = labeledRects.some(
        (b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)
      );
      if (!collides || n === selectedNode) {
        labeledRects.push(box);
        visibleLabels.add(n.ev.id);
      }
    });

    const yearGridHtml = years
      .map((y) => {
        const x = xForDate(`${y}-01-01`);
        const nextX = y < endYear ? xForDate(`${y + 1}-01-01`) : padL + plotW;
        const midX = (x + nextX) / 2;
        const cnt = yearCounts.get(y) || 0;
        return `
          <line class="bt-grid-v" x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + plotH}" />
          <text class="bt-axis-year" x="${midX.toFixed(1)}" y="${height - 20}" text-anchor="middle">${y}</text>
          <text class="bt-axis-count" x="${midX.toFixed(1)}" y="${height - 6}" text-anchor="middle">${cnt > 0 ? `${cnt} ${cnt === 1 ? 'hit' : 'hits'}` : ''}</text>
        `;
      })
      .join('');

    const lanesHtml = visibleDomains
      .map((domId, idx) => {
        const dom = this.domainMap.get(domId);
        const yCenter = yForDomain(domId);
        const yTop = padT + laneHeight * idx;
        const color = this.getDomainColor(domId);
        return `
          ${idx > 0 ? `<line class="bt-lane-sep" x1="${padL}" y1="${yTop.toFixed(1)}" x2="${padL + plotW}" y2="${yTop.toFixed(1)}" />` : ''}
          <circle cx="20" cy="${yCenter.toFixed(1)}" r="5" fill="${color}" />
          <text class="bt-lane-label" x="32" y="${(yCenter + 4).toFixed(1)}">${escapeHtml(dom ? dom.shortLabel : domId)}</text>
        `;
      })
      .join('');

    const nodesHtml = placedNodes
      .map((n) => {
        const ev = n.ev;
        const color = this.getDomainColor(ev.domain);
        const isSelected = ev.id === this.selectedEventId;
        const isTrial = ev.verificationTier === 'trial';
        const showLbl = visibleLabels.has(ev.id);
        const labelX = Math.max(padL + 46, Math.min(padL + plotW - 46, n.x));

        return `
          <g class="bt-node ${isSelected ? 'selected' : ''}" data-event-id="${escapeHtml(ev.id)}" tabindex="0" role="button" aria-label="${escapeHtml(`${ev.shortLabel} (${formatMonthYear(ev.date)}) — ${ev.verificationLabel}`)}">
            ${
              isSelected
                ? `<circle class="bt-node-pulse" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${(n.r + 7).toFixed(1)}" stroke="${color}" fill="none" />`
                : ''
            }
            <circle
              class="bt-node-hit"
              cx="${n.x.toFixed(1)}"
              cy="${n.y.toFixed(1)}"
              r="${Math.max(15, n.r + 5).toFixed(1)}"
              fill="transparent"
            />
            <circle
              class="bt-node-dot"
              cx="${n.x.toFixed(1)}"
              cy="${n.y.toFixed(1)}"
              r="${n.r.toFixed(1)}"
              fill="${color}"
              fill-opacity="${isSelected ? '1' : '0.88'}"
              stroke="${isSelected ? 'var(--text-primary)' : 'var(--bg-surface-solid)'}"
              stroke-width="${isSelected ? '2.6' : '2'}"
              ${isTrial ? 'stroke-dasharray="3 2"' : ''}
            />
            ${
              showLbl
                ? `<text class="bt-node-label ${isSelected ? 'selected' : ''}" x="${labelX.toFixed(1)}" y="${(n.y - n.r - 7).toFixed(1)}" text-anchor="middle">${escapeHtml(ev.shortLabel)}</text>`
                : ''
            }
          </g>
        `;
      })
      .join('');

    this.chartWrapEl.innerHTML = `
      <div class="bt-chart-header">
        <div>
          <h2 class="bt-chart-title">Verifiable AI Breakthroughs Over Time (${startYear}–${endYear})</h2>
          <p class="bt-chart-sub">Each dot is a cited milestone—larger dots indicate paradigm shifts. Click any point to inspect evidence, real-world impact, caveats, and official sources.</p>
        </div>
        <div class="bt-chart-legend">
          <span class="bt-legend-chip"><span class="bt-leg-ring solid"></span>Verified / Milestone</span>
          <span class="bt-legend-chip"><span class="bt-leg-ring dashed"></span>Clinical Trial</span>
          <span class="bt-legend-chip"><span class="bt-leg-curve"></span>Cumulative Pace</span>
        </div>
      </div>

      <div class="bt-svg-stage">
        <svg class="bt-timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Interactive timeline of verified AI breakthroughs from ${startYear} to ${endYear}">
          <defs>
            <linearGradient id="btAccelGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent-ai)" stop-opacity="0.20" />
              <stop offset="100%" stop-color="var(--accent-ai)" stop-opacity="0.01" />
            </linearGradient>
          </defs>

          <!-- Background cumulative acceleration curve -->
          <path d="${areaPath}" fill="url(#btAccelGrad)" />
          <path d="${linePath}" fill="none" stroke="var(--accent-ai)" stroke-opacity="0.38" stroke-width="2" stroke-dasharray="4 4" />
          <text class="bt-curve-tag" x="${(padL + plotW - 6).toFixed(1)}" y="${Math.max(padT + 14, lastCum.y - 7).toFixed(1)}" text-anchor="end">Cumulative: ${filtered.length} milestones ↑</text>

          ${yearGridHtml}
          ${lanesHtml}
          ${nodesHtml}
        </svg>

        <div id="btChartTooltip" class="bt-tooltip hidden" role="tooltip"></div>
      </div>
    `;

    const tooltip = this.chartWrapEl.querySelector('#btChartTooltip');
    const stage = this.chartWrapEl.querySelector('.bt-svg-stage');
    const evById = new Map(filtered.map((e) => [e.id, e]));

    this.chartWrapEl.querySelectorAll('.bt-node[data-event-id]').forEach((nodeEl) => {
      const id = nodeEl.dataset.eventId;
      const ev = evById.get(id);
      if (!ev) return;

      const showTip = (clientX, clientY) => {
        if (!tooltip || !stage) return;
        const rect = stage.getBoundingClientRect();
        tooltip.innerHTML = `
          <div class="bt-tip-meta">${escapeHtml(formatReadableDate(ev.date))} · ${escapeHtml(ev.organization)}</div>
          <div class="bt-tip-title">${escapeHtml(ev.title)}</div>
          <div class="bt-tip-foot">${tierBadgeHtml(ev.verificationTier, ev.verificationLabel)} <span class="bt-tip-cta">Click to inspect →</span></div>
        `;
        tooltip.classList.remove('hidden');
        const tipW = tooltip.offsetWidth || 260;
        const tipH = tooltip.offsetHeight || 90;
        let left = clientX - rect.left + 14;
        let top = clientY - rect.top - tipH - 12;
        if (left + tipW > rect.width - 8) left = Math.max(8, clientX - rect.left - tipW - 14);
        if (top < 6) top = clientY - rect.top + 16;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      };

      nodeEl.addEventListener('mouseenter', (e) => showTip(e.clientX, e.clientY));
      nodeEl.addEventListener('mousemove', (e) => showTip(e.clientX, e.clientY));
      nodeEl.addEventListener('mouseleave', () => tooltip && tooltip.classList.add('hidden'));
      nodeEl.addEventListener('click', () => {
        if (tooltip) tooltip.classList.add('hidden');
        this.selectEvent(id, { notify: true, scrollToInspector: true });
      });
      nodeEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.selectEvent(id, { notify: true, scrollToInspector: true });
        }
      });
    });
  }

  renderInspector(preFiltered) {
    if (!this.inspectorEl) return;
    const filtered = preFiltered || this.getFilteredEvents();
    const idx = filtered.findIndex((e) => e.id === this.selectedEventId);
    const ev = idx >= 0 ? filtered[idx] : filtered[filtered.length - 1];

    if (!ev) {
      this.inspectorEl.innerHTML = '';
      return;
    }

    const dom = this.domainMap.get(ev.domain);
    const domColor = this.getDomainColor(ev.domain);
    const prevEv = idx > 0 ? filtered[idx - 1] : null;
    const nextEv = idx >= 0 && idx < filtered.length - 1 ? filtered[idx + 1] : null;

    this.inspectorEl.innerHTML = `
      <div class="bt-insp-head">
        <div class="bt-insp-badges">
          <span class="bt-dom-pill" style="--dom-color:${domColor}">${escapeHtml(dom ? dom.label : ev.domain)}</span>
          ${tierBadgeHtml(ev.verificationTier, ev.verificationLabel)}
          <span class="bt-insp-date">${escapeHtml(formatReadableDate(ev.date))}</span>
        </div>
        <div class="bt-insp-nav">
          <button class="bt-nav-btn" id="btPrevEv" type="button" ${prevEv ? '' : 'disabled'} title="Previous milestone">← Older</button>
          <span class="bt-nav-pos">${idx + 1} / ${filtered.length}</span>
          <button class="bt-nav-btn" id="btNextEv" type="button" ${nextEv ? '' : 'disabled'} title="Next milestone">Newer →</button>
          <button class="bt-nav-btn bt-share-btn" id="btShareEv" type="button" title="Copy direct link to this breakthrough">Share</button>
        </div>
      </div>

      <h3 class="bt-insp-title">${escapeHtml(ev.title)}</h3>
      <div class="bt-insp-org">${escapeHtml(ev.organization)}</div>

      ${
        ev.metrics && ev.metrics.length
          ? `<div class="bt-metric-pills">${ev.metrics.map((m) => `<span class="bt-metric-pill">${escapeHtml(m)}</span>`).join('')}</div>`
          : ''
      }

      <div class="bt-insp-grid">
        <div class="bt-insp-block">
          <h4>What Happened</h4>
          <p>${escapeHtml(ev.summary)}</p>
        </div>
        <div class="bt-insp-block positive">
          <h4>Why It Matters for People</h4>
          <p>${escapeHtml(ev.whyItMatters)}</p>
        </div>
        <div class="bt-insp-block caveat">
          <h4>Honest Context &amp; What Could Be Improved</h4>
          <p>${escapeHtml(ev.caveats)}</p>
        </div>
      </div>

      <div class="bt-insp-sources">
        <span class="bt-sources-kicker">Official Primary Sources:</span>
        <div class="bt-sources-links">
          ${(ev.sources || [])
            .map(
              (s) => `
              <a class="bt-source-link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">
                <span>${escapeHtml(s.label)}</span>
                <span class="bt-source-pub">${escapeHtml(s.publisher)} ↗</span>
              </a>
            `
            )
            .join('')}
        </div>
      </div>
    `;

    const prevBtn = this.inspectorEl.querySelector('#btPrevEv');
    const nextBtn = this.inspectorEl.querySelector('#btNextEv');
    const shareBtn = this.inspectorEl.querySelector('#btShareEv');
    if (prevBtn && prevEv) {
      prevBtn.addEventListener('click', () => this.selectEvent(prevEv.id));
    }
    if (nextBtn && nextEv) {
      nextBtn.addEventListener('click', () => this.selectEvent(nextEv.id));
    }
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        if (this.onCopyLink) this.onCopyLink(ev.id);
      });
    }
  }

  renderCardsGrid(preFiltered) {
    if (!this.cardsEl) return;
    const filtered = [...(preFiltered || this.getFilteredEvents())].reverse();

    this.cardsEl.innerHTML = filtered
      .map((ev) => {
        const dom = this.domainMap.get(ev.domain);
        const color = this.getDomainColor(ev.domain);
        const active = ev.id === this.selectedEventId;
        return `
          <button class="bt-card ${active ? 'active' : ''}" data-bt-card-id="${escapeHtml(ev.id)}" type="button">
            <div class="bt-card-top">
              <span class="bt-card-dom" style="color:${color}">● ${escapeHtml(dom ? dom.shortLabel : ev.domain)}</span>
              <span class="bt-card-date">${escapeHtml(formatMonthYear(ev.date))}</span>
            </div>
            <div class="bt-card-title">${escapeHtml(ev.title)}</div>
            <div class="bt-card-org">${escapeHtml(ev.organization)}</div>
            <div class="bt-card-foot">
              ${tierBadgeHtml(ev.verificationTier, ev.verificationTier === 'verified' ? 'Verified' : ev.verificationTier === 'trial' ? 'In Trials' : 'Milestone')}
              <span class="bt-card-metric">${escapeHtml((ev.metrics && ev.metrics[0]) || '')}</span>
            </div>
          </button>
        `;
      })
      .join('');

    this.cardsEl.querySelectorAll('[data-bt-card-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectEvent(btn.dataset.btCardId, { notify: true, scrollToInspector: false });
        if (this.chartWrapEl) {
          this.chartWrapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  updateActiveCardHighlight() {
    if (!this.cardsEl) return;
    this.cardsEl.querySelectorAll('[data-bt-card-id]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.btCardId === this.selectedEventId);
    });
  }

  renderMathBoard() {
    if (!this.mathEl) return;
    const items = this.data.openMathProblems || [];

    this.mathEl.innerHTML = items
      .map((m) => {
        const toneCls =
          m.statusTone === 'solved'
            ? 'math-solved'
            : m.statusTone === 'progress'
              ? 'math-progress'
              : 'math-open';
        return `
          <article class="math-card">
            <div class="math-card-head">
              <div>
                <div class="math-cat">${escapeHtml(m.category)}</div>
                <h3 class="math-name">${escapeHtml(m.name)}</h3>
              </div>
              <span class="math-status ${toneCls}">${escapeHtml(m.status)}</span>
            </div>

            <div class="math-bar-row">
              <div class="math-bar-track">
                <div class="math-bar-fill ${toneCls}" style="width:${Math.max(0, Math.min(100, m.progressPct))}%"></div>
              </div>
              <span class="math-pct">${m.progressPct}%</span>
            </div>

            <p class="math-role detail-only"><strong>AI &amp; Lean Role:</strong> ${escapeHtml(m.aiRole)}</p>
            <p class="math-milestone detail-prose">${escapeHtml(m.latestMilestone)}</p>
            <p class="math-caveat detail-only"><strong>Reality Check:</strong> ${escapeHtml(m.caveat)}</p>

            <div class="math-sources detail-only">
              ${(m.sources || [])
                .map(
                  (s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)} ↗</a>`
                )
                .join('')}
            </div>
          </article>
        `;
      })
      .join('');
  }

  renderMedicalPipeline() {
    if (!this.medEl) return;
    const pipe = this.data.clinicalPipeline;
    if (!pipe) return;

    const fda = pipe.fdaAnnualDevices || [];
    const maxCum = Math.max(...fda.map((d) => d.cumulative), 1);
    const barW = 420;
    const barH = 195;
    const pL = 38;
    const pR = 14;
    const pT = 18;
    const pB = 28;
    const chartW = barW - pL - pR;
    const chartH = barH - pT - pB;
    const colW = chartW / Math.max(1, fda.length);

    const barsSvg = fda
      .map((d, i) => {
        const h = (d.cumulative / maxCum) * chartH;
        const x = pL + i * colW + colW * 0.16;
        const w = colW * 0.68;
        const y = pT + chartH - h;
        return `
          <g>
            <rect class="fda-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="4" />
            <text class="fda-val" x="${(x + w / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle">${formatNumber(d.cumulative)}</text>
            <text class="fda-yr" x="${(x + w / 2).toFixed(1)}" y="${barH - 8}" text-anchor="middle">${d.year}</text>
          </g>
        `;
      })
      .join('');

    const stages = ['Preclinical', 'Phase I', 'Phase II', 'Phase III', 'FDA Approved'];

    const drugsHtml = (pipe.trackedDrugs || [])
      .map((d) => {
        const isHalted = d.stageIndex === 0;
        return `
          <div class="drug-row ${isHalted ? 'drug-halted' : ''}">
            <div class="drug-top">
              <div>
                <a class="drug-name" href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.name)} ↗</a>
                <div class="drug-meta"><span class="detail-only">${escapeHtml(d.developer)} · </span>${escapeHtml(d.indication)}${d.nctId ? `<span class="detail-only"> · <code>${escapeHtml(d.nctId)}</code></span>` : ''}</div>
              </div>
              <span class="ver-badge ${isHalted ? 'ver-caveat' : d.stageIndex >= 3 ? 'ver-verified' : 'ver-trial'}">${escapeHtml(d.stage)}</span>
            </div>
            ${
              !isHalted
                ? `
                <div class="drug-stepper" aria-label="Clinical trial progress">
                  ${stages
                    .map(
                      (st, idx) => `
                      <span class="drug-step ${idx + 1 <= d.stageIndex ? 'done' : ''} ${idx + 1 === d.stageIndex ? 'current' : ''}">${st}</span>
                    `
                    )
                    .join('')}
                </div>
              `
                : ''
            }
            <p class="drug-note detail-prose">${escapeHtml(d.statusNote)}</p>
          </div>
        `;
      })
      .join('');

    this.medEl.innerHTML = `
      <div class="med-grid">
        <div class="med-card">
          <div class="med-card-head">
            <div>
              <span class="eyebrow">Real-World Clinical Deployment</span>
              <h3><span class="simple-only">AI tools cleared by the FDA (total)</span><span class="detail-only">FDA-Authorized AI/ML Medical Devices</span></h3>
              <p class="detail-prose">Cumulative U.S. FDA authorizations across radiology, cardiology, stroke triage, pathology, and ophthalmology.</p>
            </div>
          </div>
          <svg class="fda-svg" viewBox="0 0 ${barW} ${barH}" role="img" aria-label="Cumulative FDA AI medical devices growth 2018 to 2025">
            <line x1="${pL}" y1="${pT + chartH}" x2="${barW - pR}" y2="${pT + chartH}" stroke="var(--border-subtle)" />
            ${barsSvg}
          </svg>
          ${
            pipe.fdaSource
              ? `<a class="med-source-link detail-only" href="${escapeHtml(pipe.fdaSource.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(pipe.fdaSource.label)} ↗</a>`
              : ''
          }
        </div>

        <div class="med-card">
          <div class="med-card-head">
            <div>
              <span class="eyebrow">ClinicalTrials.gov Watchlist</span>
              <h3><span class="simple-only">AI-discovered drugs: how far they've gotten</span><span class="detail-only">AI-Discovered Drug Pipeline (Honest Status)</span></h3>
              <p class="detail-prose">AI cuts early drug discovery from ~4–5 years to ~18 months, though human Phase II/III trials remain the true test—including failures.</p>
            </div>
          </div>
          <div class="drug-list">${drugsHtml}</div>
        </div>
      </div>
    `;
  }
}
