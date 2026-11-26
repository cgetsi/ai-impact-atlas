import {
  escapeHtml,
  formatNumber,
  formatMw,
  formatGallons,
  formatAcres,
  mwToHomes,
  mwhToHomes,
  gallonsToContext,
  acresToContext,
  provenanceBadge,
  waterStressPill
} from './utils.js';
import { getCleanEnergyProfile, getWaterSustainabilityProfile } from './cleanResources.js';

const PAGE_SIZE = 75;

export class DirectoryDrawer {
  constructor({ onSelectFacility }) {
    this.el = document.getElementById('directoryDrawer');
    this.listEl = document.getElementById('directoryList');
    this.countEl = document.getElementById('directoryCount');
    this.sortSelect = document.getElementById('directorySort');
    this.closeBtn = document.getElementById('closeDirectory');
    this.toggleBtns = document.querySelectorAll('[data-toggle-directory]');
    this.onSelectFacility = onSelectFacility;

    this.features = [];
    this.sortedFeatures = [];
    this.sortBy = 'featured';
    this.visibleLimit = PAGE_SIZE;
    this.selectedId = null;

    this.bindEvents();
  }

  bindEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.hide());
    }
    this.toggleBtns.forEach((btn) => {
      btn.addEventListener('click', () => this.toggle());
    });
    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.visibleLimit = PAGE_SIZE;
        this.sortAndRender();
      });
    }
  }

  isOpen() {
    return this.el && !this.el.classList.contains('collapsed');
  }

  show() {
    if (!this.el) return;
    this.el.classList.remove('collapsed');
    this.syncToggleButtons(true);
  }

  hide() {
    if (!this.el) return;
    this.el.classList.add('collapsed');
    this.syncToggleButtons(false);
  }

  toggle() {
    if (this.isOpen()) this.hide();
    else this.show();
  }

  syncToggleButtons(open) {
    this.toggleBtns.forEach((btn) => {
      btn.classList.toggle('active', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  setFeatures(features) {
    this.features = features || [];
    this.visibleLimit = PAGE_SIZE;
    this.sortAndRender();
  }

  setSelectedId(id) {
    this.selectedId = id;
    if (!this.listEl) return;
    this.listEl.querySelectorAll('.dir-item').forEach((row) => {
      row.classList.toggle('active', row.dataset.id === id);
    });
  }

  getSortScore(f) {
    const p = f.properties || {};
    if (this.sortBy === 'power') {
      return Number(p.powerMw) || (p.annualMwh ? p.annualMwh / 7008 : -1);
    }
    if (this.sortBy === 'water') {
      return p.waterMillionGal !== null && p.waterMillionGal !== undefined ? Number(p.waterMillionGal) : -1;
    }
    if (this.sortBy === 'land') {
      return Number(p.landAcres) || (p.landSqft ? p.landSqft / 43560 : -1);
    }
    if (this.sortBy === 'compute') {
      return Number(p.h100Equiv) || -1;
    }
    if (this.sortBy === 'networks') {
      return p.netCount !== undefined && p.netCount !== null ? Number(p.netCount) : -1;
    }
    // Default 'featured': Flagship -> Epoch AI -> Colocation, broken by MW or netCount
    const tierBonus = p.tier === 'flagship' ? 1e9 : p.category === 'ai_hyperscale' ? 1e6 : 0;
    const sizeMetric = (Number(p.powerMw) || 0) * 100 + (Number(p.netCount) || 0);
    return tierBonus + sizeMetric;
  }

  formatPrimaryMetric(p) {
    if (this.sortBy === 'water') {
      return p.waterMillionGal !== null && p.waterMillionGal !== undefined ? formatGallons(p.waterMillionGal) : 'Undisclosed';
    }
    if (this.sortBy === 'land') {
      return formatAcres(p.landAcres, p.landSqft);
    }
    if (this.sortBy === 'compute') {
      return p.h100Equiv ? `${formatNumber(Math.round(p.h100Equiv))} H100-eq` : '—';
    }
    if (this.sortBy === 'networks') {
      return p.netCount !== undefined && p.netCount !== null ? `${formatNumber(p.netCount)} nets` : '—';
    }
    if (p.powerMw && p.powerMw > 0) return formatMw(p.powerMw);
    if (p.annualMwh && p.annualMwh > 0) return `${formatNumber(p.annualMwh / 1000, 0)} GWh/yr`;
    if (p.netCount !== undefined && p.netCount !== null) return `${formatNumber(p.netCount)} nets`;
    return 'Verified';
  }

  sortAndRender() {
    if (!this.listEl) return;
    this.sortedFeatures = [...this.features].sort((a, b) => this.getSortScore(b) - this.getSortScore(a));

    if (this.countEl) {
      this.countEl.textContent = `${formatNumber(this.sortedFeatures.length)} matching`;
    }

    if (!this.sortedFeatures.length) {
      this.listEl.innerHTML = `<div class="dir-empty">No facilities match the active filters.</div>`;
      return;
    }

    const slice = this.sortedFeatures.slice(0, this.visibleLimit);
    const rowsHtml = slice
      .map((f, idx) => {
        const p = f.properties || {};
        const dotCls = p.tier === 'flagship' ? 'dot-flagship' : p.category === 'ai_hyperscale' ? 'dot-ai' : 'dot-colo';
        const loc = [p.city, p.state].filter(Boolean).join(', ');
        const subParts = [p.operator, loc].filter(Boolean);
        if (this.sortBy !== 'water' && p.waterMillionGal !== null && p.waterMillionGal !== undefined) {
          subParts.push(formatGallons(p.waterMillionGal));
        } else if (p.waterStress && (p.waterStress.includes('High') || p.waterStress.includes('Extreme'))) {
          subParts.push(`${p.waterStress} Water Stress`);
        }

        const isSel = p.id === this.selectedId;
        return `
          <button class="dir-item ${isSel ? 'active' : ''}" data-id="${escapeHtml(p.id)}" type="button">
            <div class="dir-item-top">
              <span class="dir-rank">${idx + 1}</span>
              <span class="dot ${dotCls}"></span>
              <span class="dir-name">${escapeHtml(p.name)}</span>
              <span class="dir-metric">${escapeHtml(this.formatPrimaryMetric(p))}</span>
            </div>
            <div class="dir-item-sub">${escapeHtml(subParts.join(' · '))}</div>
          </button>
        `;
      })
      .join('');

    const remaining = this.sortedFeatures.length - slice.length;
    const moreBtnHtml =
      remaining > 0
        ? `<button id="dirLoadMore" class="dir-more-btn" type="button">Show more (${formatNumber(remaining)} remaining)</button>`
        : '';

    this.listEl.innerHTML = rowsHtml + moreBtnHtml;

    this.listEl.querySelectorAll('.dir-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const match = this.sortedFeatures.find((f) => f.properties.id === btn.dataset.id);
        if (match && this.onSelectFacility) {
          this.onSelectFacility(match);
          // Auto-collapse drawer on small mobile screens so map & detail sheet are visible
          if (window.innerWidth <= 768) {
            this.hide();
          }
        }
      });
    });

    const moreBtn = this.listEl.querySelector('#dirLoadMore');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        this.visibleLimit += PAGE_SIZE;
        this.sortAndRender();
      });
    }
  }
}

export class SiteCompareManager {
  constructor({ onFocusSite, onNotify, onSelectionChange }) {
    this.trayEl = document.getElementById('siteCompareTray');
    this.modalEl = document.getElementById('siteCompareModal');
    this.modalBody = document.getElementById('siteCompareBody');
    this.closeModalBtn = document.getElementById('closeCompareModal');

    this.onFocusSite = onFocusSite;
    this.onNotify = onNotify;
    this.onSelectionChange = onSelectionChange;

    this.compared = []; // Array of full GeoJSON features (max 3)

    if (this.closeModalBtn) {
      this.closeModalBtn.addEventListener('click', () => this.closeModal());
    }
    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) this.closeModal();
      });
    }
  }

  has(id) {
    return this.compared.some((f) => f.properties.id === id);
  }

  isModalOpen() {
    return this.modalEl && !this.modalEl.classList.contains('hidden');
  }

  toggle(feature) {
    const id = feature.properties.id;
    if (this.has(id)) {
      this.compared = this.compared.filter((f) => f.properties.id !== id);
    } else {
      if (this.compared.length >= 3) {
        if (this.onNotify) this.onNotify('You can compare up to 3 facilities at once. Remove one first.');
        return false;
      }
      this.compared.push(feature);
    }
    this.renderTray();
    if (this.isModalOpen()) {
      if (this.compared.length === 0) this.closeModal();
      else this.renderModal();
    }
    if (this.onSelectionChange) this.onSelectionChange();
    return true;
  }

  clear() {
    this.compared = [];
    this.closeModal();
    this.renderTray();
    if (this.onSelectionChange) this.onSelectionChange();
  }

  openModal() {
    if (!this.compared.length || !this.modalEl) return;
    this.renderModal();
    this.modalEl.classList.remove('hidden');
    if (this.closeModalBtn) this.closeModalBtn.focus();
  }

  closeModal() {
    if (!this.modalEl) return;
    this.modalEl.classList.add('hidden');
  }

  renderTray() {
    if (!this.trayEl) return;
    if (!this.compared.length) {
      this.trayEl.classList.add('hidden');
      this.trayEl.innerHTML = '';
      return;
    }

    const pills = this.compared
      .map((f) => {
        const p = f.properties;
        return `
          <span class="tray-chip">
            <span class="tray-chip-name">${escapeHtml(p.name)}</span>
            <button class="tray-chip-rm" data-rm="${escapeHtml(p.id)}" type="button" aria-label="Remove ${escapeHtml(p.name)}">×</button>
          </span>
        `;
      })
      .join('');

    this.trayEl.innerHTML = `
      <div class="tray-chips">${pills}</div>
      <div class="tray-actions">
        <button id="openCompareModalBtn" class="tray-cta" type="button">
          Compare Side-by-Side (${this.compared.length}/3)
        </button>
        <button id="clearCompareTrayBtn" class="tray-clear" type="button">Clear</button>
      </div>
    `;
    this.trayEl.classList.remove('hidden');

    this.trayEl.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = this.compared.find((f) => f.properties.id === btn.dataset.rm);
        if (target) this.toggle(target);
      });
    });

    this.trayEl.querySelector('#openCompareModalBtn').addEventListener('click', () => this.openModal());
    this.trayEl.querySelector('#clearCompareTrayBtn').addEventListener('click', () => this.clear());
  }

  renderModal() {
    if (!this.modalBody) return;
    const cols = this.compared.length;

    const cardsHtml = this.compared
      .map((f) => {
        const p = f.properties || {};
        const homes = p.annualMwh ? mwhToHomes(p.annualMwh) : mwToHomes(p.powerMw);
        const powerStr = p.annualMwh ? `${formatNumber(p.annualMwh / 1000, 0)} GWh/yr` : formatMw(p.powerMw);
        const waterCtx = gallonsToContext(p.waterMillionGal);
        const landCtx = acresToContext(p.landAcres);
        const loc = [p.city, p.state].filter(Boolean).join(', ') || 'United States';

        const computeOrNet = p.h100Equiv
          ? `${formatNumber(Math.round(p.h100Equiv))} H100-eq${p.chipTypes ? ` (${p.chipTypes})` : ''}`
          : p.netCount !== undefined && p.netCount !== null
            ? `${formatNumber(p.netCount)} Networks · ${formatNumber(p.carrierCount || 0)} Carriers`
            : '—';

        const topBenefit = Array.isArray(p.localBenefits) && p.localBenefits[0] ? p.localBenefits[0] : 'Not documented in public filings';
        const topConcern = Array.isArray(p.localConcerns) && p.localConcerns[0] ? p.localConcerns[0] : 'Site-level environmental audit not published';
        const cleanE = getCleanEnergyProfile(p);
        const cleanW = getWaterSustainabilityProfile(p);

        return `
          <div class="cmp-col">
            <div class="cmp-col-head">
              <div>
                <div class="cmp-col-title">${escapeHtml(p.name)}</div>
                <div class="cmp-col-sub">${escapeHtml(p.operator || '')} · ${escapeHtml(loc)}</div>
              </div>
              <button class="icon-btn icon-btn-sm" data-modal-rm="${escapeHtml(p.id)}" type="button" title="Remove from comparison" aria-label="Remove ${escapeHtml(p.name)}">×</button>
            </div>

            <div class="cmp-field">
              <div class="cmp-field-lbl">Status &amp; Tier</div>
              <div class="cmp-field-val">${escapeHtml(p.status || 'Operating')}</div>
            </div>

            <div class="cmp-field">
              <div class="cmp-field-lbl">Power / Electricity ${provenanceBadge(p.powerStatus)}</div>
              <div class="cmp-field-mono">${escapeHtml(powerStr)}</div>
              <div class="cmp-field-note">${escapeHtml(homes ? `≈ ${formatNumber(homes)} U.S. homes/yr` : 'Capacity undisclosed')}</div>
            </div>

            <div class="cmp-field">
              <div class="cmp-field-lbl">Clean Energy (Grid &amp; PPA)</div>
              <div class="cmp-field-val">${cleanE.cleanPct}% Carbon-Free Local Grid (${cleanE.renewablePct}% Ren · ${cleanE.nuclearPct}% Nuc)</div>
              <div class="cmp-field-note">Operator PPA: ${escapeHtml(cleanE.corpLabel)}</div>
            </div>

            <div class="cmp-field">
              <div class="cmp-field-lbl">Water Consumption ${provenanceBadge(p.waterStatus)}</div>
              <div class="cmp-field-mono">${escapeHtml(formatGallons(p.waterMillionGal))}</div>
              <div class="cmp-field-note">
                ${p.waterStress ? `${waterStressPill(p.waterStress)} ` : ''}
                ${escapeHtml([waterCtx, cleanW.sourceType].filter(Boolean).join(' · '))}
              </div>
            </div>

            <div class="cmp-field">
              <div class="cmp-field-lbl">Land Footprint ${provenanceBadge(p.landStatus)}</div>
              <div class="cmp-field-mono">${escapeHtml(formatAcres(p.landAcres, p.landSqft))}</div>
              <div class="cmp-field-note">${escapeHtml(landCtx || 'Acreage undisclosed')}</div>
            </div>

            <div class="cmp-field">
              <div class="cmp-field-lbl">Compute / Interconnection</div>
              <div class="cmp-field-val">${escapeHtml(computeOrNet)}</div>
            </div>

            <div class="cmp-field">
              <div class="cmp-field-lbl">Regional Grid</div>
              <div class="cmp-field-note">${escapeHtml(p.gridContext || 'Undisclosed')}</div>
            </div>

            <div class="cmp-field">
              <div class="cmp-field-lbl" style="color:var(--benefit-text)">Key Local Benefit</div>
              <div class="cmp-field-note">${escapeHtml(topBenefit)}</div>
            </div>

            <div class="cmp-field">
              <div class="cmp-field-lbl" style="color:var(--concern-text)">Key Trade-Off / Concern</div>
              <div class="cmp-field-note">${escapeHtml(topConcern)}</div>
            </div>

            <button class="cmp-focus-btn" data-focus-id="${escapeHtml(p.id)}" type="button">Focus on Map →</button>
          </div>
        `;
      })
      .join('');

    const hintHtml =
      cols < 3
        ? `<div class="cmp-empty-col"><span>Select any facility on the map and click <strong>+ Compare Site</strong> to add ${cols === 1 ? 'a second or third' : 'a third'} campus here.</span></div>`
        : '';

    this.modalBody.innerHTML = `<div class="cmp-grid">${cardsHtml}${hintHtml}</div>`;

    this.modalBody.querySelectorAll('[data-modal-rm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = this.compared.find((f) => f.properties.id === btn.dataset.modalRm);
        if (target) this.toggle(target);
      });
    });

    this.modalBody.querySelectorAll('[data-focus-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = this.compared.find((f) => f.properties.id === btn.dataset.focusId);
        this.closeModal();
        if (target && this.onFocusSite) this.onFocusSite(target);
      });
    });
  }
}
