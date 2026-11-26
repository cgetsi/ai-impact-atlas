import { escapeHtml, formatNumber, formatMw, formatGallons, formatAcres, US_STATE_NAMES } from './utils.js';
import {
  getCleanEnergyProfile,
  getWaterSustainabilityProfile,
  ARID_HIGH_STRESS_STATES,
  MODERATE_HIGH_STRESS_STATES
} from './cleanResources.js';

function joinPositiveText(p) {
  return (Array.isArray(p.localBenefits) ? p.localBenefits.join(' ') : '').toLowerCase();
}

function joinNegativeText(p) {
  return (Array.isArray(p.localConcerns) ? p.localConcerns.join(' ') : '').toLowerCase();
}

function sortRepresentative(list) {
  return [...list].sort((a, b) => {
    const pa = a.properties;
    const pb = b.properties;
    const rank = (x) => (x.tier === 'flagship' ? 0 : x.category === 'ai_hyperscale' ? 1 : 2);
    const rd = rank(pa) - rank(pb);
    if (rd !== 0) return rd;
    return (Number(pb.powerMw) || Number(pb.netCount) || 0) - (Number(pa.powerMw) || Number(pa.netCount) || 0);
  });
}

function buildPipelineImpacts(feature) {
  const p = feature.properties || {};
  const cleanE = getCleanEnergyProfile(p);
  const cleanW = getWaterSustainabilityProfile(p);
  const stateFull = US_STATE_NAMES[p.state] || p.state || 'U.S.';

  const positives = Array.isArray(p.localBenefits) && p.localBenefits.length ? [...p.localBenefits] : [];
  const concerns = Array.isArray(p.localConcerns) && p.localConcerns.length ? [...p.localConcerns] : [];

  if (!positives.length) {
    positives.push(
      `Major AI infrastructure investment in ${[p.city, stateFull].filter(Boolean).join(', ')}, creating construction jobs and local tax revenue.`
    );
    if (cleanE.corpMatchPct && cleanE.corpMatchPct >= 95) {
      positives.push(`Backed by ${p.operator} (${cleanE.corpLabel}).`);
    }
    if (cleanE.cleanPct >= 50) {
      positives.push(`Sited on a ${cleanE.cleanPct}% carbon-free regional grid (${cleanE.gridName}).`);
    }
    if ((p.name || '').toLowerCase().includes('lordstown') || (p.operator || '').toLowerCase().includes('cipher')) {
      positives.push('Reuses existing industrial/energy corridor infrastructure.');
    }
  }

  if (!concerns.length) {
    if (cleanE.fossilPct > 55) {
      concerns.push(`Local grid is ${cleanE.fossilPct}% fossil gas/coal (${cleanE.gridName}).`);
    } else {
      concerns.push(`Large AI power load requires new high-voltage substation & grid capacity in ${stateFull}.`);
    }
    if (cleanE.hasOnsiteGas) {
      concerns.push('Uses on-site natural gas / fuel-cell generation.');
    }
    if (ARID_HIGH_STRESS_STATES.has(p.state)) {
      concerns.push(`Arid, high water-stress region (${stateFull}) with undisclosed cooling water demand.`);
    } else if (MODERATE_HIGH_STRESS_STATES.has(p.state)) {
      concerns.push(`Drought-sensitive region (${stateFull}); annual cooling water not yet disclosed.`);
    } else {
      concerns.push('Annual cooling water, acreage, and utility rate terms are not yet publicly disclosed.');
    }
  }

  return { positives, concerns, cleanE, cleanW };
}

export class ImpactsPipelineView {
  constructor(allFeatures, { onJumpToFacility }) {
    this.allFeatures = allFeatures || [];
    this.onJumpToFacility = onJumpToFacility;
    this.pipelineFilter = 'new_build';
    this.expandedThemeIds = new Set();
    this.expandedPipeIds = new Set();

    this.heroEl = document.getElementById('impactsHeroKpis');
    this.positivesEl = document.getElementById('aggregatedPositives');
    this.negativesEl = document.getElementById('aggregatedNegatives');
    this.pipelineEl = document.getElementById('pipelineContainer');
    this.pipelineTabs = document.querySelectorAll('[data-pipeline-filter]');

    this.computeAggregations();
    this.renderHero();
    this.renderThemes();
    this.bindEvents();
    this.renderPipeline();
  }

  bindEvents() {
    this.pipelineTabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.pipelineFilter = btn.dataset.pipelineFilter;
        this.pipelineTabs.forEach((b) => {
          const act = b.dataset.pipelineFilter === this.pipelineFilter;
          b.classList.toggle('active', act);
          b.setAttribute('aria-selected', String(act));
        });
        this.renderPipeline();
      });
    });
  }

  computeAggregations() {
    const all = this.allFeatures;
    const flagships = all.filter((f) => f.properties.tier === 'flagship');

    const withCleanGrid = all.filter((f) => getCleanEnergyProfile(f.properties).cleanPct >= 50);
    const withFossilGrid = all.filter((f) => getCleanEnergyProfile(f.properties).fossilPct > 50);
    const withCorpCleanPpa = all.filter((f) => {
      const c = getCleanEnergyProfile(f.properties);
      return c.corpMatchPct !== null && c.corpMatchPct >= 95;
    });

    const taxAndInfra = flagships.filter((f) => {
      const t = joinPositiveText(f.properties);
      return t.includes('tax') || t.includes('school') || t.includes('infrastructure') || t.includes('fee');
    });

    const lowWaterOrReclaimed = flagships.filter((f) => {
      const w = getWaterSustainabilityProfile(f.properties);
      return w.usesReclaimed || w.isZeroOrLowWater;
    });

    const brownfieldReuse = all.filter((f) => {
      const p = f.properties;
      const hay = `${joinPositiveText(p)} ${p.summary || ''} ${p.landNote || ''} ${p.name || ''}`.toLowerCase();
      return (
        hay.includes('vacant') ||
        hay.includes('former') ||
        hay.includes('repurpos') ||
        hay.includes('brownfield') ||
        hay.includes('foxconn') ||
        hay.includes('timber') ||
        hay.includes('furniture') ||
        hay.includes('lordstown')
      );
    });

    const jobsAndWorkforce = flagships.filter((f) => {
      const t = joinPositiveText(f.properties);
      return t.includes('job') || t.includes('employ') || t.includes('worker') || t.includes('academy') || t.includes('stem');
    });

    const majorBackboneHubs = all.filter((f) => (Number(f.properties.netCount) || 0) >= 25);

    const undisclosedResource = all.filter(
      (f) => f.properties.waterStatus === 'undisclosed' || f.properties.powerStatus === 'undisclosed'
    );

    const highWaterStressSites = all.filter((f) => {
      const p = f.properties;
      const ws = (p.waterStress || '').toLowerCase();
      if (ws.includes('high') || ws.includes('extreme')) return true;
      return ARID_HIGH_STRESS_STATES.has(p.state);
    });

    const gridStrainDocumented = flagships.filter((f) => {
      const t = joinNegativeText(f.properties);
      return (
        t.includes('grid') ||
        t.includes('transmission') ||
        t.includes('coal') ||
        t.includes('gas') ||
        t.includes('power') ||
        t.includes('electricity') ||
        t.includes('ercot')
      );
    });

    const heavyEvaporativeWater = all.filter((f) => (Number(f.properties.waterMillionGal) || 0) >= 200);
    const largeLandFootprint = all.filter((f) => (Number(f.properties.landAcres) || 0) >= 400);

    const taxAbatementDebate = flagships.filter((f) => {
      const t = joinNegativeText(f.properties);
      return t.includes('tax') || t.includes('abatement') || t.includes('exemption') || t.includes('incentive') || t.includes('job count');
    });

    const localAirNoiseGenerators = flagships.filter((f) => {
      const t = joinNegativeText(f.properties);
      return t.includes('turbine') || t.includes('diesel') || t.includes('noise') || t.includes('smog') || t.includes('generator');
    });

    this.positiveThemes = [
      {
        id: 'pos-clean-ppa',
        title: '96%–100% Clean-Energy PPAs (Wind, Solar & Geothermal)',
        count: withCorpCleanPpa.length,
        denomLabel: `of ${formatNumber(all.length)} sites`,
        pct: (withCorpCleanPpa.length / all.length) * 100,
        desc: 'Operated by companies (Google, Meta, Microsoft, AWS, Equinix, Switch, QTS) with audited 96%–100% annual renewable PPAs financing gigawatts of new U.S. clean energy.',
        matches: sortRepresentative(withCorpCleanPpa)
      },
      {
        id: 'pos-clean-grid',
        title: 'On ≥50% Carbon-Free Physical Power Grids',
        count: withCleanGrid.length,
        denomLabel: `of ${formatNumber(all.length)} sites`,
        pct: (withCleanGrid.length / all.length) * 100,
        desc: 'Physically connected to regional grids where at least half of all electricity comes from hydro, wind, solar, or nuclear power.',
        matches: sortRepresentative(withCleanGrid)
      },
      {
        id: 'pos-backbone',
        title: 'Core Internet Exchange Hubs (25+ Networks)',
        count: majorBackboneHubs.length,
        denomLabel: `of ${formatNumber(all.length)} sites`,
        pct: (majorBackboneHubs.length / all.length) * 100,
        desc: 'Carrier-neutral interconnection hubs keeping regional broadband, cloud, hospitals, and banking fast and resilient.',
        matches: sortRepresentative(majorBackboneHubs)
      },
      {
        id: 'pos-tax',
        title: 'Local Tax Revenue for Schools, Roads & Water',
        count: taxAndInfra.length,
        denomLabel: `of ${flagships.length} impact sites`,
        pct: (taxAndInfra.length / flagships.length) * 100,
        desc: 'Major county property/equipment tax windfalls funding public schools, water upgrades, and lower homeowner tax rates.',
        matches: sortRepresentative(taxAndInfra)
      },
      {
        id: 'pos-jobs',
        title: 'Construction Jobs, Tech Careers & College Grants',
        count: jobsAndWorkforce.length,
        denomLabel: `of ${flagships.length} impact sites`,
        pct: (jobsAndWorkforce.length / flagships.length) * 100,
        desc: 'Thousands of trade construction jobs per megacampus, permanent engineering roles, and community college academies.',
        matches: sortRepresentative(jobsAndWorkforce)
      },
      {
        id: 'pos-water-tech',
        title: 'Closed-Loop, Air-Cooled, or Recycled Greywater',
        count: lowWaterOrReclaimed.length,
        denomLabel: `of ${flagships.length} impact sites`,
        pct: (lowWaterOrReclaimed.length / flagships.length) * 100,
        desc: 'Campuses engineered with closed-loop liquid cooling, dry air cooling, or non-potable municipal wastewater to spare drinking water.',
        matches: sortRepresentative(lowWaterOrReclaimed)
      },
      {
        id: 'pos-brownfield',
        title: 'Vacant Factory & Post-Industrial Town Revival',
        count: brownfieldReuse.length,
        denomLabel: 'documented sites',
        pct: Math.min(100, (brownfieldReuse.length / flagships.length) * 100),
        desc: 'Repurposes shuttered factories or stalled industrial parks instead of clearing untouched farmland.',
        matches: sortRepresentative(brownfieldReuse)
      }
    ];

    this.negativeThemes = [
      {
        id: 'neg-undisclosed',
        title: 'Private / Undisclosed Water or Power Usage',
        count: undisclosedResource.length,
        denomLabel: `of ${formatNumber(all.length)} sites`,
        pct: (undisclosedResource.length / all.length) * 100,
        desc: 'No federal law requires facility-level reporting—leaving >98% of mapped U.S. data centers without public annual water numbers.',
        matches: sortRepresentative(undisclosedResource)
      },
      {
        id: 'neg-fossil-grid',
        title: 'On Fossil-Majority Grids (>50% Gas & Coal)',
        count: withFossilGrid.length,
        denomLabel: `of ${formatNumber(all.length)} sites`,
        pct: (withFossilGrid.length / all.length) * 100,
        desc: 'Physically drawing from regional grids still >50% powered by natural gas and coal (e.g., VA, TX, OH, LA, IN).',
        matches: sortRepresentative(withFossilGrid)
      },
      {
        id: 'neg-arid-stress',
        title: 'Located in Drought / High Water-Stress Regions',
        count: highWaterStressSites.length,
        denomLabel: `of ${formatNumber(all.length)} sites`,
        pct: (highWaterStressSites.length / all.length) * 100,
        desc: 'Operating or planned inside arid basins (AZ, NV, UT, NM, West TX) facing severe aquifer and river scarcity.',
        matches: sortRepresentative(highWaterStressSites)
      },
      {
        id: 'neg-grid-strain',
        title: 'Grid Strain, New Gas Plants & Delayed Coal Closures',
        count: gridStrainDocumented.length,
        denomLabel: `of ${flagships.length} impact sites`,
        pct: (gridStrainDocumented.length / flagships.length) * 100,
        desc: 'Concentrated gigawatt loads prompting new utility gas plants, delayed coal retirements, and 500kV power-line disputes.',
        matches: sortRepresentative(gridStrainDocumented)
      },
      {
        id: 'neg-farmland',
        title: '400 to 3,200+ Acre Rural Farmland Conversion',
        count: largeLandFootprint.length,
        denomLabel: `of ${flagships.length} impact sites`,
        pct: (largeLandFootprint.length / flagships.length) * 100,
        desc: 'Sprawling AI megacampuses permanently rezoning agricultural land across rural Midwest and Southern towns.',
        matches: sortRepresentative(largeLandFootprint)
      },
      {
        id: 'neg-heavy-water',
        title: 'Heavy Evaporative Water Draw (200M–1B+ Gal/Yr)',
        count: heavyEvaporativeWater.length,
        denomLabel: 'disclosed campuses',
        pct: (heavyEvaporativeWater.length / flagships.length) * 100,
        desc: 'Single evaporative campuses consuming as much water as 2,000–10,000+ homes (up to 25%+ of a small city’s water).',
        matches: sortRepresentative(heavyEvaporativeWater)
      },
      {
        id: 'neg-tax-air',
        title: 'Tax Abatements, Gas Turbines & Generator Noise',
        count: new Set([...taxAbatementDebate, ...localAirNoiseGenerators].map((f) => f.properties.id)).size,
        denomLabel: `of ${flagships.length} impact sites`,
        pct:
          (new Set([...taxAbatementDebate, ...localAirNoiseGenerators].map((f) => f.properties.id)).size /
            flagships.length) *
          100,
        desc: 'Large sales/property tax exemptions for modest permanent headcounts, plus local air/noise disputes over turbines and diesel backups.',
        matches: sortRepresentative(
          all.filter((f) => taxAbatementDebate.includes(f) || localAirNoiseGenerators.includes(f))
        )
      }
    ];

    this.newBuildSites = sortRepresentative(
      all.filter((f) => {
        const st = (f.properties.status || '').toLowerCase();
        return st.includes('planned') || st.includes('under construction');
      })
    );

    this.expandingSites = sortRepresentative(
      all.filter((f) => {
        const st = (f.properties.status || '').toLowerCase();
        return st.includes('expanding');
      })
    );

    this.cleanGridCount = withCleanGrid.length;
    this.undisclosedWaterCount = all.filter((f) => f.properties.waterStatus === 'undisclosed').length;
  }

  renderHero() {
    if (!this.heroEl) return;
    const total = this.allFeatures.length;
    const totalPipeline = this.newBuildSites.length + this.expandingSites.length;
    const undisclosedPct = total ? ((this.undisclosedWaterCount / total) * 100).toFixed(1) : '0';

    this.heroEl.innerHTML = `
      <div class="hero-kpi">
        <div class="hero-kpi-val">${formatNumber(this.cleanGridCount)}</div>
        <div class="hero-kpi-label">On ≥50% Clean Grids</div>
        <div class="hero-kpi-sub detail-only">${Math.round((this.cleanGridCount / total) * 100)}% of mapped U.S. sites (EIA/eGRID)</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${undisclosedPct}%</div>
        <div class="hero-kpi-label">Undisclosed Water</div>
        <div class="hero-kpi-sub detail-only">${formatNumber(this.undisclosedWaterCount)} of ${formatNumber(total)} sites publish no water data</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${this.newBuildSites.length}</div>
        <div class="hero-kpi-label">Planned / Building</div>
        <div class="hero-kpi-sub detail-only">Greenfield AI megacampuses under construction</div>
      </div>
      <div class="hero-kpi">
        <div class="hero-kpi-val">${totalPipeline}</div>
        <div class="hero-kpi-label">Active Buildouts</div>
        <div class="hero-kpi-sub detail-only">New builds + major gigawatt expansions</div>
      </div>
    `;
  }

  buildThemeCardHtml(theme, kind) {
    const isExpanded = this.expandedThemeIds.has(theme.id);
    const previewList = theme.matches.slice(0, 10);
    const moreCount = Math.max(0, theme.matches.length - previewList.length);

    const detailsHtml = isExpanded
      ? `
        <div class="theme-matches detail-only">
          <p class="theme-desc-expanded">${escapeHtml(theme.desc)}</p>
          <div class="theme-matches-list">
            ${previewList
              .map((f) => {
                const p = f.properties;
                const meta = [
                  [p.city, p.state].filter(Boolean).join(', '),
                  p.powerMw ? formatMw(p.powerMw) : p.waterMillionGal ? formatGallons(p.waterMillionGal) : p.netCount ? `${p.netCount} nets` : null
                ]
                  .filter(Boolean)
                  .join(' · ');
                return `
                  <button class="theme-fac-btn" data-jump-id="${escapeHtml(p.id)}" type="button">
                    <span class="theme-fac-name">${escapeHtml(p.name)}</span>
                    <span class="theme-fac-meta">${escapeHtml(meta)} →</span>
                  </button>
                `;
              })
              .join('')}
          </div>
          ${moreCount > 0 ? `<div class="theme-more-note">+ ${formatNumber(moreCount)} more on map</div>` : ''}
        </div>
      `
      : `<p class="theme-desc detail-prose">${escapeHtml(theme.desc)}</p>`;

    return `
      <div class="theme-card ${kind}">
        <div class="theme-card-top">
          <h3 class="theme-title">${escapeHtml(theme.title)}</h3>
          <div class="theme-count-box ${kind}">
            <span class="theme-count-num">${formatNumber(theme.count)}</span>
            <span class="theme-count-sub">${escapeHtml(theme.denomLabel)}</span>
          </div>
        </div>
        <div class="theme-bar-track">
          <div class="theme-bar-fill ${kind}" style="width:${Math.max(0, Math.min(100, theme.pct)).toFixed(1)}%"></div>
        </div>
        ${detailsHtml}
        <button class="theme-expand-btn detail-only" data-expand-theme="${escapeHtml(theme.id)}" aria-expanded="${String(isExpanded)}" type="button">
          ${isExpanded ? 'Hide sites ▴' : `See ${formatNumber(theme.count)} sites ▾`}
        </button>
      </div>
    `;
  }

  renderThemes() {
    if (this.positivesEl) {
      this.positivesEl.innerHTML = this.positiveThemes.map((t) => this.buildThemeCardHtml(t, 'positive')).join('');
    }
    if (this.negativesEl) {
      this.negativesEl.innerHTML = this.negativeThemes.map((t) => this.buildThemeCardHtml(t, 'negative')).join('');
    }

    const bindContainer = (container) => {
      if (!container) return;
      container.querySelectorAll('[data-expand-theme]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.expandTheme;
          if (this.expandedThemeIds.has(id)) this.expandedThemeIds.delete(id);
          else this.expandedThemeIds.add(id);
          this.renderThemes();
        });
      });
      container.querySelectorAll('[data-jump-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (this.onJumpToFacility) this.onJumpToFacility(btn.dataset.jumpId);
        });
      });
    };

    bindContainer(this.positivesEl);
    bindContainer(this.negativesEl);
  }

  renderPipeline() {
    if (!this.pipelineEl) return;

    const cntNew = document.getElementById('pipeCountNew');
    const cntExp = document.getElementById('pipeCountExp');
    const cntAll = document.getElementById('pipeCountAll');
    if (cntNew) cntNew.textContent = String(this.newBuildSites.length);
    if (cntExp) cntExp.textContent = String(this.expandingSites.length);
    if (cntAll) cntAll.textContent = String(this.newBuildSites.length + this.expandingSites.length);

    let list = this.newBuildSites;
    if (this.pipelineFilter === 'expanding') list = this.expandingSites;
    else if (this.pipelineFilter === 'all') list = [...this.newBuildSites, ...this.expandingSites];

    const cardsHtml = list
      .map((f) => {
        const p = f.properties || {};
        const { positives, concerns, cleanE, cleanW } = buildPipelineImpacts(f);
        const loc = [p.city, p.state].filter(Boolean).join(', ') || 'United States';
        const statusCls = (p.status || '').toLowerCase().includes('expanding') ? 'badge-ai' : 'badge-flagship';
        const isOpen = this.expandedPipeIds.has(p.id);

        const metrics = [];
        if (p.powerMw && p.powerMw > 0) metrics.push(`⚡ ${formatMw(p.powerMw)}`);
        else metrics.push('⚡ MW Undisclosed');

        metrics.push(`🌱 ${cleanE.cleanPct}% Clean Grid`);
        if (cleanW.sourceType !== 'Undisclosed') {
          metrics.push(`💧 ${cleanW.sourceType}`);
        } else if (p.landAcres) {
          metrics.push(`🟩 ${formatAcres(p.landAcres)}`);
        }

        return `
          <article class="pipe-card ${isOpen ? 'pipe-expanded' : ''}">
            <div class="pipe-card-head">
              <div>
                <div class="badge-row" style="margin-bottom:5px">
                  <span class="badge ${statusCls}">${escapeHtml(p.status || 'Planned')}</span>
                  ${p.aiUsers ? `<span class="badge badge-neutral">${escapeHtml(p.aiUsers)}</span>` : ''}
                </div>
                <h3 class="pipe-title">${escapeHtml(p.name)}</h3>
                <div class="pipe-sub">${escapeHtml(p.operator || '')} · ${escapeHtml(loc)}</div>
              </div>
              <div class="pipe-head-actions">
                <button class="theme-expand-btn simple-only-inline" data-expand-pipe="${escapeHtml(p.id)}" type="button">
                  ${isOpen ? 'Less ▴' : 'Pros & Cons ▾'}
                </button>
                <button class="pipe-map-btn" data-jump-id="${escapeHtml(p.id)}" type="button">Map →</button>
              </div>
            </div>

            <div class="pipe-metrics">
              ${metrics.map((m) => `<span class="pipe-metric-pill">${escapeHtml(m)}</span>`).join('')}
            </div>

            <div class="pipe-pros-cons ${isOpen ? 'force-open' : ''}">
              <div class="impact-box benefits">
                <h4>+ Positives</h4>
                <ul>${positives.slice(0, 3).map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
              </div>
              <div class="impact-box concerns">
                <h4>− Negatives / Watchouts</h4>
                <ul>${concerns.slice(0, 3).map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    this.pipelineEl.innerHTML = `<div class="pipe-list">${cardsHtml}</div>`;

    this.pipelineEl.querySelectorAll('[data-expand-pipe]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.expandPipe;
        if (this.expandedPipeIds.has(id)) this.expandedPipeIds.delete(id);
        else this.expandedPipeIds.add(id);
        this.renderPipeline();
      });
    });

    this.pipelineEl.querySelectorAll('[data-jump-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.onJumpToFacility) this.onJumpToFacility(btn.dataset.jumpId);
      });
    });
  }
}
