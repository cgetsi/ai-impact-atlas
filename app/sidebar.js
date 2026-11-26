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

export class DetailSidebar {
  constructor({ onClose, onCompareIndustries }) {
    this.el = document.getElementById('detailSidebar');
    this.badgesEl = document.getElementById('detailBadges');
    this.nameEl = document.getElementById('detailName');
    this.subtitleEl = document.getElementById('detailSubtitle');
    this.actionsEl = document.getElementById('detailActions');
    this.bodyEl = document.getElementById('detailBody');
    this.closeBtn = document.getElementById('closeSidebar');
    this.onClose = onClose;
    this.onCompareIndustries = onCompareIndustries;

    this.currentFacility = null;
    this.expandedDetails = false;
    this.closeBtn.addEventListener('click', () => this.hide());
  }

  isOpen() {
    return this.el && !this.el.classList.contains('collapsed');
  }

  hide() {
    this.currentFacility = null;
    this.expandedDetails = false;
    this.el.classList.add('collapsed');
    if (this.onClose) this.onClose();
  }

  show(facility, coLocatedGroup = [], handlers = {}) {
    if (!this.currentFacility || this.currentFacility.properties.id !== facility.properties.id) {
      this.expandedDetails = false;
    }
    this.currentFacility = facility;
    this.lastCoGroup = coLocatedGroup;
    this.lastHandlers = handlers;
    this.render();
    this.el.classList.remove('collapsed');
  }

  render() {
    const facility = this.currentFacility;
    if (!facility) return;
    const p = facility.properties || facility;
    const coLocatedGroup = this.lastCoGroup || [];
    const { isCompared = false, onToggleCompare, onInspectSatellite, onCopyShareLink, onSelectCoLocated } = this.lastHandlers || {};

    // Header badges
    const badges = [];
    if (p.tier === 'flagship') {
      badges.push('<span class="badge badge-flagship">Impact Profile</span>');
    } else if (p.tier === 'epoch_ai') {
      badges.push('<span class="badge badge-ai">AI Campus</span>');
    } else {
      badges.push('<span class="badge badge-colo">Colocation</span>');
    }
    if (p.status) {
      badges.push(`<span class="badge badge-neutral">${escapeHtml(p.status)}</span>`);
    }
    if (p.aiUsers && (!p.operator || !p.aiUsers.toLowerCase().includes(p.operator.toLowerCase().split(' ')[0]))) {
      badges.push(`<span class="badge badge-neutral">Rented by: ${escapeHtml(p.aiUsers)}</span>`);
    }
    this.badgesEl.innerHTML = badges.join('');

    this.nameEl.textContent = p.name || 'Unnamed Data Center';
    const locParts = [p.city, p.state].filter(Boolean).join(', ');
    const operatorText = p.operator ? `${p.operator} · ` : '';
    this.subtitleEl.textContent = `${operatorText}${locParts || 'United States'}`;

    // Quick Action Buttons
    if (this.actionsEl) {
      this.actionsEl.innerHTML = `
        <button id="sidebarPinCompare" class="action-chip ${isCompared ? 'active' : ''}" type="button" aria-pressed="${String(isCompared)}">
          ${isCompared ? '✓ Comparing' : '+ Compare'}
        </button>
        <button id="sidebarSatelliteBtn" class="action-chip" type="button" title="Zoom into aerial satellite view">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Aerial
        </button>
        <button id="sidebarShareBtn" class="action-chip" type="button" title="Copy direct link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <span id="sidebarShareLbl">Share</span>
        </button>
      `;

      const pinBtn = this.actionsEl.querySelector('#sidebarPinCompare');
      if (pinBtn && onToggleCompare) {
        pinBtn.addEventListener('click', () => onToggleCompare(facility));
      }

      const satBtn = this.actionsEl.querySelector('#sidebarSatelliteBtn');
      if (satBtn && onInspectSatellite) {
        satBtn.addEventListener('click', () => onInspectSatellite(facility));
      }

      const shareBtn = this.actionsEl.querySelector('#sidebarShareBtn');
      if (shareBtn && onCopyShareLink) {
        shareBtn.addEventListener('click', async () => {
          await onCopyShareLink(facility);
          const lbl = shareBtn.querySelector('#sidebarShareLbl');
          if (lbl) {
            lbl.textContent = 'Copied!';
            setTimeout(() => {
              lbl.textContent = 'Share';
            }, 1800);
          }
        });
      }
    }

    const sections = [];

    // Multi-Facility Co-Located Building Switcher
    if (Array.isArray(coLocatedGroup) && coLocatedGroup.length > 1) {
      const siblingBtns = coLocatedGroup
        .map((sib) => {
          const sp = sib.properties || {};
          const active = sp.id === p.id;
          const netLbl = sp.netCount ? ` · ${sp.netCount} nets` : sp.powerMw ? ` · ${formatMw(sp.powerMw)}` : '';
          return `
            <button class="coloc-pill ${active ? 'active' : ''}" data-coloc-id="${escapeHtml(sp.id)}" type="button">
              <span class="coloc-pill-name">${escapeHtml(sp.name)}</span>
              <span class="coloc-pill-meta">${escapeHtml((sp.operator || '') + netLbl)}</span>
            </button>
          `;
        })
        .join('');

      sections.push(`
        <div class="coloc-switcher">
          <div class="coloc-switcher-title">
            <span>${coLocatedGroup.length} Sites at Address</span>
            <span class="coloc-switcher-hint">Switch suite</span>
          </div>
          <div class="coloc-pill-list">${siblingBtns}</div>
        </div>
      `);
    }

    // Visual-First Snapshot KPIs (short, punchy 1-line equivalents!)
    const powerMw = p.powerMw ?? null;
    const annualMwh = p.annualMwh ?? null;
    const homes = annualMwh ? mwhToHomes(annualMwh) : mwToHomes(powerMw);
    const powerVal = annualMwh ? `${formatNumber(annualMwh / 1000, 0)} GWh/yr` : formatMw(powerMw);
    const powerBrief = homes ? `≈ ${formatNumber(homes)} homes/yr` : 'Not publicly disclosed';

    const cleanE = getCleanEnergyProfile(p);
    const cleanW = getWaterSustainabilityProfile(p);

    const waterVal =
      p.waterMillionGal !== null && p.waterMillionGal !== undefined
        ? formatGallons(p.waterMillionGal)
        : cleanW.isZeroOrLowWater
          ? 'Low / Closed-Loop'
          : 'Undisclosed';
    const waterCtx = gallonsToContext(p.waterMillionGal);
    const waterBrief = waterCtx || (cleanW.sourceType !== 'Undisclosed' ? cleanW.sourceType : 'Not publicly disclosed');

    const landVal = formatAcres(p.landAcres, p.landSqft);
    const landCtx = acresToContext(p.landAcres);

    let kpisHtml = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">⚡ Power</span>
            ${provenanceBadge(p.powerStatus)}
          </div>
          <div class="kpi-value">${escapeHtml(powerVal)}</div>
          <div class="kpi-sub">${escapeHtml(powerBrief)}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">💧 Water</span>
            ${provenanceBadge(p.waterStatus)}
          </div>
          <div class="kpi-value">${escapeHtml(waterVal)}</div>
          <div class="kpi-sub">
            ${p.waterStress ? `<div style="margin-bottom:3px">${waterStressPill(p.waterStress)}</div>` : ''}
            ${escapeHtml(waterBrief)}
          </div>
        </div>
    `;

    if (p.landAcres || p.landSqft || p.tier === 'flagship') {
      kpisHtml += `
        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">🟩 Land</span>
            ${provenanceBadge(p.landStatus)}
          </div>
          <div class="kpi-value">${escapeHtml(landVal)}</div>
          <div class="kpi-sub">${escapeHtml(landCtx || 'Footprint')}</div>
        </div>
      `;
    }

    if (p.h100Equiv && p.h100Equiv > 0) {
      kpisHtml += `
        <div class="kpi-card ${!(p.landAcres || p.landSqft || p.tier === 'flagship') ? 'full' : ''}">
          <div class="kpi-top">
            <span class="kpi-label">🧠 AI Chips</span>
            ${provenanceBadge('estimated')}
          </div>
          <div class="kpi-value">${formatNumber(Math.round(p.h100Equiv))} H100-eq</div>
          <div class="kpi-sub">${escapeHtml(p.chipTypes || 'AI Compute Cluster')}</div>
        </div>
      `;
    } else if (p.netCount !== undefined && p.netCount !== null) {
      kpisHtml += `
        <div class="kpi-card full">
          <div class="kpi-top">
            <span class="kpi-label">🌐 Interconnections</span>
            ${provenanceBadge('reported')}
          </div>
          <div class="kpi-value">${formatNumber(p.netCount)} Networks</div>
          <div class="kpi-sub">${formatNumber(p.carrierCount || 0)} Carriers · ${formatNumber(p.ixCount || 0)} Exchanges</div>
        </div>
      `;
    }

    kpisHtml += '</div>';
    sections.push(kpisHtml);

    // Compact Visual Clean Grid Bar (always visible & super visual!)
    const onsiteGasBadge = cleanE.hasOnsiteGas
      ? `<div class="clean-warn-pill">Uses on-site gas / fuel-cell power</div>`
      : '';

    sections.push(`
      <div class="clean-card">
        <div class="clean-head">
          <span class="clean-lbl">🌱 Local Grid Mix (${escapeHtml(cleanE.state || 'U.S.')})</span>
          <span class="clean-pct-pill">${cleanE.cleanPct}% Carbon-Free</span>
        </div>
        <div class="mix-bar" role="img" aria-label="${cleanE.renewablePct}% renewable, ${cleanE.nuclearPct}% nuclear, ${cleanE.fossilPct}% fossil">
          <div class="mix-seg mix-ren" style="width:${cleanE.renewablePct}%" title="Renewables: ${cleanE.renewablePct}%"></div>
          <div class="mix-seg mix-nuc" style="width:${cleanE.nuclearPct}%" title="Nuclear: ${cleanE.nuclearPct}%"></div>
          <div class="mix-seg mix-fos" style="width:${cleanE.fossilPct}%" title="Gas/Coal: ${cleanE.fossilPct}%"></div>
        </div>
        <div class="mix-legend">
          <span><i class="mix-dot mix-ren"></i>Renewables ${cleanE.renewablePct}%</span>
          <span><i class="mix-dot mix-nuc"></i>Nuclear ${cleanE.nuclearPct}%</span>
          <span><i class="mix-dot mix-fos"></i>Fossil ${cleanE.fossilPct}%</span>
        </div>
        <div class="clean-tags-row">
          <span class="mini-tag">PPA: ${escapeHtml(cleanE.corpMatchPct ? `${cleanE.corpMatchPct}% Clean Match` : cleanE.corpLabel)}</span>
          <span class="mini-tag">Water: ${escapeHtml(cleanW.sourceType)}</span>
        </div>
        ${onsiteGasBadge}
      </div>
    `);

    // Visual Pros & Cons (shown concisely if documented)
    const benefits = Array.isArray(p.localBenefits) ? p.localBenefits : [];
    const concerns = Array.isArray(p.localConcerns) ? p.localConcerns : [];

    if (benefits.length || concerns.length) {
      let impactHtml = '<div class="detail-section">';
      if (benefits.length) {
        impactHtml += `
          <div class="impact-box benefits">
            <h4>+ Positives</h4>
            <ul>${benefits.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
          </div>
        `;
      }
      if (concerns.length) {
        impactHtml += `
          <div class="impact-box concerns">
            <h4>− Concerns &amp; Trade-Offs</h4>
            <ul>${concerns.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
          </div>
        `;
      }
      impactHtml += '</div>';
      sections.push(impactHtml);
    }

    // Progressive Disclosure ("Dig deeper") for dense prose notes & source citations
    const sources = Array.isArray(p.sources) ? p.sources : [];
    const detailNotes = [
      p.summary ? `<p class="detail-summary">${escapeHtml(p.summary)}</p>` : '',
      p.powerNote ? `<div class="info-note"><strong>Power note:</strong> ${escapeHtml(p.powerNote)}</div>` : '',
      p.waterNote && p.waterNote !== 'Site-level water consumption is not publicly disclosed.'
        ? `<div class="info-note"><strong>Water note:</strong> ${escapeHtml(p.waterNote)}</div>`
        : '',
      `<div class="info-note"><strong>Grid &amp; PPA detail:</strong> ${escapeHtml(cleanE.gridName)} (${escapeHtml(cleanE.gridNote)}). ${escapeHtml(cleanE.corpDetail)}${cleanW.replenishmentNote ? ` ${escapeHtml(cleanW.replenishmentNote)}` : ''}</div>`,
      p.address ? `<div class="info-note"><strong>Address:</strong> ${escapeHtml(p.address)}</div>` : '',
      sources.length
        ? `
          <div class="detail-section">
            <h3 class="detail-section-title">Verified Sources (${sources.length})</h3>
            <div class="source-links">
              ${sources
                .map(
                  (s) => `
                <a class="source-link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">
                  <span>${escapeHtml(s.label)}</span>
                  <span>Open ↗</span>
                </a>`
                )
                .join('')}
            </div>
          </div>
        `
        : ''
    ]
      .filter(Boolean)
      .join('');

    sections.push(`
      <div class="dig-deeper-wrap ${this.expandedDetails ? 'expanded' : ''}">
        <button id="sidebarDigDeeper" class="dig-deeper-btn" type="button" aria-expanded="${String(this.expandedDetails)}">
          ${this.expandedDetails ? 'Hide full notes & sources ▴' : `Dig deeper: notes & ${sources.length} verified ${sources.length === 1 ? 'source' : 'sources'} ▾`}
        </button>
        <div class="dig-deeper-body">
          ${detailNotes}
        </div>
      </div>
    `);

    this.bodyEl.innerHTML = sections.join('');

    this.bodyEl.querySelectorAll('[data-coloc-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = coLocatedGroup.find((item) => item.properties.id === btn.dataset.colocId);
        if (chosen && onSelectCoLocated) {
          onSelectCoLocated(chosen, coLocatedGroup);
        }
      });
    });

    const digBtn = this.bodyEl.querySelector('#sidebarDigDeeper');
    if (digBtn) {
      digBtn.addEventListener('click', () => {
        this.expandedDetails = !this.expandedDetails;
        const scrollPos = this.bodyEl.scrollTop;
        this.render();
        this.bodyEl.scrollTop = scrollPos;
      });
    }
  }
}
