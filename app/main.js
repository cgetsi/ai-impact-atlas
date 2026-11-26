import { AtlasMapView } from './mapView.js';
import { DetailSidebar } from './sidebar.js';
import { IndustryCompareView } from './compareView.js';
import { DirectoryDrawer, SiteCompareManager } from './directoryView.js';
import { ImpactsPipelineView } from './impactsView.js';
import { getCleanEnergyProfile } from './cleanResources.js';
import { getAiCompanyById, matchFacilityToAiCompany } from './aiCompanies.js';
import {
  US_STATE_NAMES,
  escapeHtml,
  formatNumber,
  formatMw,
  hydrateFeature,
  prefersReducedMotion
} from './utils.js';

const state = {
  theme: document.documentElement.getAttribute('data-theme') || localStorage.getItem('atlas-theme') || 'dark',
  density: document.documentElement.getAttribute('data-density') || localStorage.getItem('atlas-density') || 'simple',
  view: 'map',
  metric: 'energy',
  filter: 'all',
  usState: 'all',
  operator: 'all',
  aiCompany: 'all',
  impactFilter: 'all', // 'all' | 'clean_grid' | 'high_water_stress' | 'operating' | 'planned'
  allFeatures: [],
  filteredFeatures: [],
  featureById: new Map(),
  selectedFacility: null,
  industries: null,
  meta: null
};

let mapView = null;
let sidebar = null;
let directory = null;
let siteCompare = null;
let compareViewInstance = null;
let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('appToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 3200);
}

function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('view');
  if (v && ['map', 'compare', 'impacts', 'about'].includes(v)) state.view = v;

  const m = params.get('metric');
  if (m && ['energy', 'water', 'land', 'companies'].includes(m)) state.metric = m;

  const f = params.get('filter');
  if (f && ['all', 'flagship', 'ai_hyperscale', 'colocation'].includes(f)) state.filter = f;

  const st = params.get('state');
  if (st) state.usState = st.toUpperCase() === 'ALL' ? 'all' : st.toUpperCase();

  const op = params.get('op');
  if (op) state.operator = op;

  const co = params.get('company');
  if (co && getAiCompanyById(co.toLowerCase())) state.aiCompany = co.toLowerCase();

  const imp = params.get('impact');
  if (imp && ['all', 'clean_grid', 'high_water_stress', 'operating', 'planned'].includes(imp)) state.impactFilter = imp;

  return params.get('site') || null;
}

function syncUrlState(push = false) {
  const params = new URLSearchParams();
  if (state.view !== 'map') params.set('view', state.view);
  if (state.view === 'compare' && state.metric !== 'energy') params.set('metric', state.metric);
  if (state.filter !== 'all') params.set('filter', state.filter);
  if (state.usState !== 'all') params.set('state', state.usState);
  if (state.operator !== 'all') params.set('op', state.operator);
  if (state.aiCompany !== 'all') params.set('company', state.aiCompany);
  if (state.impactFilter !== 'all') params.set('impact', state.impactFilter);
  if (state.selectedFacility && state.view === 'map') {
    params.set('site', state.selectedFacility.properties.id);
  }

  const qs = params.toString();
  const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  if (nextUrl === `${window.location.pathname}${window.location.search}`) return;

  if (push) {
    window.history.pushState({}, '', nextUrl);
  } else {
    window.history.replaceState({}, '', nextUrl);
  }
}

function updateDocumentTitle() {
  if (state.view === 'map' && state.selectedFacility) {
    document.title = `${state.selectedFacility.properties.name} — U.S. Data Center Atlas`;
  } else if (state.view === 'compare') {
    document.title = 'Industry Resource Comparison — U.S. Data Center Atlas';
  } else if (state.view === 'impacts') {
    document.title = 'Pros, Cons & Construction Pipeline — U.S. Data Center Atlas';
  } else if (state.view === 'about') {
    document.title = 'Methodology & Sources — U.S. Data Center Atlas';
  } else {
    document.title = 'U.S. Data Center Atlas — Energy, Water & Local Impact';
  }
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('atlas-theme', theme);

  const sunIcon = document.getElementById('themeIconSun');
  const moonIcon = document.getElementById('themeIconMoon');
  const toggleBtn = document.getElementById('themeToggle');

  if (theme === 'dark') {
    sunIcon.classList.remove('hidden');
    moonIcon.classList.add('hidden');
    toggleBtn.title = 'Switch to light mode';
  } else {
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
    toggleBtn.title = 'Switch to dark gray mode';
  }

  if (mapView) {
    mapView.setTheme(theme);
  }
}

function applyDensity(mode) {
  const next = mode === 'detailed' ? 'detailed' : 'simple';
  state.density = next;
  document.documentElement.setAttribute('data-density', next);
  localStorage.setItem('atlas-density', next);
  document.querySelectorAll('[data-density-mode]').forEach((btn) => {
    const act = btn.dataset.densityMode === next;
    btn.classList.toggle('active', act);
    btn.setAttribute('aria-pressed', String(act));
  });
  if (mapView) {
    setTimeout(() => mapView.map.resize(), 40);
  }
}

function switchView(viewName, { pushHistory = true } = {}) {
  state.view = viewName;
  document.querySelectorAll('.view-tab').forEach((btn) => {
    const active = btn.dataset.view === viewName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });

  document.getElementById('mapView').classList.toggle('active', viewName === 'map');
  document.getElementById('compareView').classList.toggle('active', viewName === 'compare');
  document.getElementById('impactsView').classList.toggle('active', viewName === 'impacts');
  document.getElementById('aboutView').classList.toggle('active', viewName === 'about');
  document.getElementById('mapControls').classList.toggle('hidden', viewName !== 'map');
  const mobileFilterToggle = document.getElementById('mobileFiltersBtn');
  if (mobileFilterToggle) {
    mobileFilterToggle.classList.toggle('hidden', viewName !== 'map');
  }

  if (viewName === 'map' && mapView) {
    setTimeout(() => mapView.map.resize(), 60);
  }

  updateDocumentTitle();
  syncUrlState(pushHistory);
}

function normalizeOperatorBucket(op) {
  if (!op) return 'Other';
  const s = op.toLowerCase();
  if (s.includes('google')) return 'Google';
  if (s.includes('meta') || s.includes('facebook')) return 'Meta';
  if (s.includes('amazon') || s.includes('aws')) return 'Amazon / AWS';
  if (s.includes('microsoft')) return 'Microsoft';
  if (s.includes('openai') || s.includes('oracle') || s.includes('stargate')) return 'OpenAI / Oracle';
  if (s.includes('xai') || s.includes('spacex')) return 'xAI';
  if (s.includes('coreweave')) return 'CoreWeave';
  if (s.includes('equinix')) return 'Equinix';
  if (s.includes('digital realty')) return 'Digital Realty';
  if (s.includes('qts')) return 'QTS';
  if (s.includes('cyrusone')) return 'CyrusOne';
  if (s.includes('switch')) return 'Switch';
  if (s.includes('databank')) return 'DataBank';
  if (s.includes('tierpoint')) return 'TierPoint';
  if (s.includes('flexential')) return 'Flexential';
  if (s.includes('centersquare') || s.includes('cyxtera')) return 'Centersquare';
  return op;
}

function syncFilterUiControls() {
  document.querySelectorAll('.filter-pill').forEach((p) => {
    const active = p.dataset.filter === state.filter;
    p.classList.toggle('active', active);
    p.setAttribute('aria-pressed', String(active));
  });

  const stSel = document.getElementById('stateFilter');
  if (stSel && [...stSel.options].some((o) => o.value === state.usState)) {
    stSel.value = state.usState;
  }

  const opSel = document.getElementById('operatorFilter');
  if (opSel && [...opSel.options].some((o) => o.value === state.operator)) {
    opSel.value = state.operator;
  }

  const coSel = document.getElementById('aiCompanyFilter');
  if (coSel) {
    coSel.value = state.aiCompany;
    coSel.classList.toggle('active-select', state.aiCompany !== 'all');
  }

  const impSel = document.getElementById('impactFilter');
  if (impSel) {
    impSel.value = state.impactFilter;
  }

  const hasActiveFilter =
    state.filter !== 'all' ||
    state.usState !== 'all' ||
    state.operator !== 'all' ||
    state.aiCompany !== 'all' ||
    state.impactFilter !== 'all';
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) {
    resetBtn.classList.toggle('hidden', !hasActiveFilter);
  }

  const activeFilterDot = document.getElementById('mobileFiltersBadge');
  if (activeFilterDot) {
    activeFilterDot.classList.toggle('hidden', !hasActiveFilter);
  }
}

function resetAllFilters(applyNow = true) {
  state.filter = 'all';
  state.usState = 'all';
  state.operator = 'all';
  state.aiCompany = 'all';
  state.impactFilter = 'all';
  syncFilterUiControls();
  if (applyNow) {
    applyFilters();
    syncUrlState(false);
  }
}

function updateCompanyMapBanner(filtered) {
  const banner = document.getElementById('companyMapBanner');
  if (!banner) return;
  const company = state.aiCompany !== 'all' ? getAiCompanyById(state.aiCompany) : null;
  if (!company) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }

  let owned = 0;
  let rented = 0;
  filtered.forEach((f) => {
    const role = matchFacilityToAiCompany(f, company);
    if (role === 'owned') owned++;
    else if (role === 'rented') rented++;
  });

  const standingCls =
    company.standing === 'stronger'
      ? 'standing-good'
      : company.standing === 'higher_impact'
        ? 'standing-high'
        : 'standing-mixed';

  const countText =
    rented > 0
      ? `${filtered.length} sites (${owned} built · ${rented} rented)`
      : `${filtered.length} built sites`;

  banner.innerHTML = `
    <span class="standing-pill ${standingCls}">${escapeHtml(company.standingLabel)}</span>
    <strong>${escapeHtml(company.name)}</strong>
    <span class="company-banner-meta">${escapeHtml(countText)}</span>
    <button id="bannerScorecardBtn" class="company-banner-link" type="button">Scorecard →</button>
    <button id="bannerClearCompany" class="company-banner-close" type="button" aria-label="Clear company filter">×</button>
  `;
  banner.classList.remove('hidden');

  banner.querySelector('#bannerScorecardBtn').addEventListener('click', () => {
    state.metric = 'companies';
    if (compareViewInstance) compareViewInstance.setMetric('companies', false);
    switchView('compare', { pushHistory: true });
  });
  banner.querySelector('#bannerClearCompany').addEventListener('click', () => {
    state.aiCompany = 'all';
    syncFilterUiControls();
    applyFilters();
    syncUrlState(false);
  });
}

function filterByAiCompany(companyId, { switchToMap = true, fitBounds = true } = {}) {
  state.filter = 'all';
  state.usState = 'all';
  state.operator = 'all';
  state.impactFilter = 'all';
  state.aiCompany = companyId || 'all';
  syncFilterUiControls();
  applyFilters();
  if (switchToMap && state.view !== 'map') {
    switchView('map', { pushHistory: true });
  } else {
    syncUrlState(false);
  }
  if (fitBounds) {
    if (state.aiCompany !== 'all') {
      setTimeout(() => fitToFilteredBounds(), 90);
    } else if (mapView) {
      mapView.resetView();
    }
  }
}

function applyFilters() {
  const activeCompany = state.aiCompany !== 'all' ? getAiCompanyById(state.aiCompany) : null;

  const filtered = state.allFeatures.filter((f) => {
    const p = f.properties;
    if (state.filter === 'flagship' && p.tier !== 'flagship') return false;
    if (state.filter === 'ai_hyperscale' && p.category !== 'ai_hyperscale') return false;
    if (state.filter === 'colocation' && p.category !== 'colocation') return false;
    if (state.usState !== 'all' && p.state !== state.usState) return false;
    if (state.operator !== 'all' && p._opBucket !== state.operator) return false;
    if (activeCompany && !matchFacilityToAiCompany(f, activeCompany)) return false;

    if (state.impactFilter === 'clean_grid') {
      if (getCleanEnergyProfile(p).cleanPct < 50) return false;
    } else if (state.impactFilter === 'high_water_stress') {
      const ws = (p.waterStress || '').toLowerCase();
      if (!ws.includes('high') && !ws.includes('extreme')) return false;
    } else if (state.impactFilter === 'operating') {
      const st = (p.status || '').toLowerCase();
      if (!st.includes('operating')) return false;
    } else if (state.impactFilter === 'planned') {
      const st = (p.status || '').toLowerCase();
      if (!st.includes('planned') && !st.includes('construction')) return false;
    }

    return true;
  });

  state.filteredFeatures = filtered;

  if (mapView) {
    mapView.setData({ type: 'FeatureCollection', features: filtered });
  }
  if (directory) {
    directory.setFeatures(filtered);
  }
  updateCompanyMapBanner(filtered);

  // Update live summary card
  const aiCount = filtered.filter((f) => f.properties.category === 'ai_hyperscale').length;
  const totalMw = filtered.reduce((acc, f) => acc + (Number(f.properties.powerMw) || 0), 0);

  document.getElementById('statCount').textContent = formatNumber(filtered.length);
  document.getElementById('statFlagship').textContent = formatNumber(aiCount);

  const statPowerEl = document.getElementById('statPower');
  const statPowerLbl = document.getElementById('statPowerLbl');
  if (totalMw > 0) {
    statPowerEl.textContent = formatMw(totalMw);
    statPowerLbl.textContent = 'Reported / Est. Cap';
    statPowerEl.title = 'Combined reported & estimated campus capacity (includes active and announced multi-phase AI buildouts)';
  } else if (state.filter === 'colocation' || aiCount === 0) {
    statPowerEl.textContent = 'N/A';
    statPowerLbl.textContent = 'MW Undisclosed';
    statPowerEl.title = 'Colocation registries (PeeringDB) verify carrier networks rather than facility MW capacity';
  } else {
    statPowerEl.textContent = '—';
    statPowerLbl.textContent = 'Tracked Capacity';
  }

  const browseBtnCount = document.getElementById('browseBtnCount');
  if (browseBtnCount) {
    browseBtnCount.textContent = formatNumber(filtered.length);
  }
}

function renderSidebarForCurrentSelection() {
  if (!state.selectedFacility || !sidebar) return;
  const coGroup = mapView ? mapView.getCoLocatedForFeature(state.selectedFacility) : [state.selectedFacility];
  sidebar.show(state.selectedFacility, coGroup, {
    isCompared: siteCompare ? siteCompare.has(state.selectedFacility.properties.id) : false,
    onToggleCompare: (feat) => {
      if (siteCompare) siteCompare.toggle(feat);
    },
    onInspectSatellite: (feat) => {
      setBasemapModeUi('satellite');
      if (mapView) mapView.focusFacility(feat, { forceZoom: 15.2 });
    },
    onCopyShareLink: async () => {
      syncUrlState(false);
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Direct facility link copied to clipboard');
      } catch {
        showToast('Share URL updated in address bar');
      }
    },
    onSelectCoLocated: (chosen) => {
      selectFacility(chosen, { shouldFly: false, pushHistory: true });
    }
  });
}

function selectFacility(feature, { shouldFly = true, pushHistory = true, minZoom = 10.4 } = {}) {
  if (!feature) return;
  state.selectedFacility = feature;
  if (state.view !== 'map') {
    switchView('map', { pushHistory: false });
  }

  document.getElementById('mapView').classList.add('sidebar-open');
  renderSidebarForCurrentSelection();
  if (directory) {
    directory.setSelectedId(feature.properties.id);
  }

  if (mapView) {
    if (shouldFly) {
      mapView.focusFacility(feature, { minZoom });
    } else {
      mapView.selectedId = feature.properties.id;
      mapView.refreshSelectionSource();
    }
  }

  updateDocumentTitle();
  syncUrlState(pushHistory);
}

function selectFacilityById(id, opts = {}) {
  const feat = state.featureById.get(id);
  if (!feat) return;
  // Ensure filters don't hide the target facility
  const isVisible = state.filteredFeatures.some((f) => f.properties.id === id);
  if (!isVisible) {
    resetAllFilters(true);
    showToast(`Filters cleared to show ${feat.properties.name}`);
  }
  selectFacility(feat, opts);
}

function setBasemapModeUi(mode) {
  if (!mapView) return;
  mapView.setBasemapMode(mode);
}

function populateFilterDropdowns(features) {
  // 1. States
  const stCounts = new Map();
  // 2. Major Operators
  const opCounts = new Map();

  features.forEach((f) => {
    const p = f.properties;
    const st = p.state;
    if (st && st.length === 2) {
      stCounts.set(st, (stCounts.get(st) || 0) + 1);
    }
    p._opBucket = normalizeOperatorBucket(p.operator);
    opCounts.set(p._opBucket, (opCounts.get(p._opBucket) || 0) + 1);
  });

  const stSelect = document.getElementById('stateFilter');
  [...stCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([st, count]) => {
      const opt = document.createElement('option');
      opt.value = st;
      const fullName = US_STATE_NAMES[st] ? `${US_STATE_NAMES[st]} (${st})` : st;
      opt.textContent = `${st} — ${US_STATE_NAMES[st] || st} (${count})`;
      opt.title = fullName;
      stSelect.appendChild(opt);
    });

  const opSelect = document.getElementById('operatorFilter');
  if (opSelect) {
    const priorityOps = ['Google', 'Meta', 'Amazon / AWS', 'Microsoft', 'OpenAI / Oracle', 'xAI', 'CoreWeave'];
    const topColoOps = [...opCounts.entries()]
      .filter(([name, cnt]) => !priorityOps.includes(name) && cnt >= 8 && name !== 'Colocation Operator')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    const optGroupHyper = document.createElement('optgroup');
    optGroupHyper.label = 'AI & Hyperscale Operators';
    priorityOps.forEach((name) => {
      const cnt = opCounts.get(name) || 0;
      if (cnt > 0) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = `${name} (${cnt})`;
        optGroupHyper.appendChild(opt);
      }
    });
    opSelect.appendChild(optGroupHyper);

    if (topColoOps.length) {
      const optGroupColo = document.createElement('optgroup');
      optGroupColo.label = 'Major Colocation Operators';
      topColoOps.forEach(([name, cnt]) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = `${name} (${cnt})`;
        optGroupColo.appendChild(opt);
      });
      opSelect.appendChild(optGroupColo);
    }
  }
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClearBtn');
  const resultsEl = document.getElementById('searchResults');
  let activeIndex = -1;
  let currentMatches = [];

  const updateHighlight = () => {
    const items = resultsEl.querySelectorAll('.search-item[data-id]');
    items.forEach((el, idx) => {
      const isAct = idx === activeIndex;
      el.classList.toggle('keyboard-active', isAct);
      el.setAttribute('aria-selected', String(isAct));
      if (isAct) {
        el.scrollIntoView({ block: 'nearest' });
        input.setAttribute('aria-activedescendant', el.id);
      }
    });
    if (activeIndex < 0) input.removeAttribute('aria-activedescendant');
  };

  const chooseMatch = (feat) => {
    if (!feat) return;
    resultsEl.classList.add('hidden');
    activeIndex = -1;
    input.blur();
    selectFacilityById(feat.properties.id, { shouldFly: true, pushHistory: true });
  };

  const renderResults = (q) => {
    const raw = q.trim();
    if (clearBtn) clearBtn.classList.toggle('hidden', !raw);
    const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);

    if (!tokens.length) {
      resultsEl.classList.add('hidden');
      resultsEl.innerHTML = '';
      currentMatches = [];
      activeIndex = -1;
      return;
    }

    currentMatches = state.allFeatures
      .filter((f) => {
        const hay = f.properties._searchText || '';
        return tokens.every((tok) => hay.includes(tok));
      })
      .sort((a, b) => {
        const pa = a.properties;
        const pb = b.properties;
        // Boost prefix match on name or operator
        const qLow = raw.toLowerCase();
        const aPrefix = (pa.name || '').toLowerCase().startsWith(qLow) || (pa.operator || '').toLowerCase().startsWith(qLow) ? 0 : 1;
        const bPrefix = (pb.name || '').toLowerCase().startsWith(qLow) || (pb.operator || '').toLowerCase().startsWith(qLow) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;

        const rank = (f) => (f.properties.tier === 'flagship' ? 0 : f.properties.category === 'ai_hyperscale' ? 1 : 2);
        const rDiff = rank(a) - rank(b);
        if (rDiff !== 0) return rDiff;
        return (Number(pb.powerMw) || 0) - (Number(pa.powerMw) || 0);
      })
      .slice(0, 14);

    activeIndex = currentMatches.length ? 0 : -1;

    if (!currentMatches.length) {
      resultsEl.innerHTML = `<div class="search-empty">No matching U.S. data centers found for "${escapeHtml(raw)}"</div>`;
      resultsEl.classList.remove('hidden');
      return;
    }

    resultsEl.innerHTML = currentMatches
      .map((f, idx) => {
        const p = f.properties;
        const dotCls =
          p.tier === 'flagship' ? 'dot-flagship' : p.category === 'ai_hyperscale' ? 'dot-ai' : 'dot-colo';
        const sub = [
          p.operator,
          [p.city, p.state].filter(Boolean).join(', '),
          p.powerMw ? formatMw(p.powerMw) : p.netCount ? `${p.netCount} networks` : null
        ]
          .filter(Boolean)
          .join(' · ');
        return `
          <button id="srch-opt-${idx}" class="search-item ${idx === 0 ? 'keyboard-active' : ''}" data-id="${escapeHtml(p.id)}" type="button" role="option" aria-selected="${idx === 0 ? 'true' : 'false'}">
            <span class="search-item-title"><span class="dot ${dotCls}"></span>${escapeHtml(p.name)}</span>
            <span class="search-item-sub">${escapeHtml(sub)}</span>
          </button>
        `;
      })
      .join('');

    resultsEl.classList.remove('hidden');
    updateHighlight();

    resultsEl.querySelectorAll('.search-item[data-id]').forEach((btn, idx) => {
      btn.addEventListener('mouseenter', () => {
        activeIndex = idx;
        updateHighlight();
      });
      btn.addEventListener('click', () => {
        chooseMatch(currentMatches[idx]);
      });
    });
  };

  input.addEventListener('input', (e) => renderResults(e.target.value));
  input.addEventListener('focus', (e) => {
    if (e.target.value.trim()) renderResults(e.target.value);
  });

  input.addEventListener('keydown', (e) => {
    const isOpen = !resultsEl.classList.contains('hidden');
    if (e.key === 'ArrowDown') {
      if (!isOpen && input.value.trim()) {
        renderResults(input.value);
        return;
      }
      if (currentMatches.length) {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % currentMatches.length;
        updateHighlight();
      }
    } else if (e.key === 'ArrowUp' && isOpen && currentMatches.length) {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
      updateHighlight();
    } else if (e.key === 'Enter' && isOpen && activeIndex >= 0 && currentMatches[activeIndex]) {
      e.preventDefault();
      chooseMatch(currentMatches[activeIndex]);
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      resultsEl.classList.add('hidden');
      activeIndex = -1;
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      renderResults('');
      input.focus();
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) {
      resultsEl.classList.add('hidden');
    }
  });
}

function setupTopbarObserver() {
  const topbar = document.querySelector('.topbar');
  if (!topbar || typeof ResizeObserver === 'undefined') return;
  const updateVar = () => {
    const bottomEdge = topbar.offsetTop + topbar.offsetHeight;
    document.documentElement.style.setProperty('--topbar-offset', `${bottomEdge + 12}px`);
  };
  updateVar();
  new ResizeObserver(updateVar).observe(topbar);
}

function fitToFilteredBounds() {
  if (!mapView || !state.filteredFeatures.length) return;
  if (state.filteredFeatures.length === 1) {
    mapView.focusFacility(state.filteredFeatures[0], { minZoom: 9.5 });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  state.filteredFeatures.forEach((f) => bounds.extend(f.geometry.coordinates));
  mapView.map.fitBounds(bounds, {
    padding: mapView.getViewportPadding(Boolean(state.selectedFacility)),
    maxZoom: 8.5,
    duration: prefersReducedMotion() ? 0 : 680
  });
}

async function init() {
  const initialSiteId = readUrlParams();
  applyTheme(state.theme);
  applyDensity(state.density);
  setupTopbarObserver();

  // Bind Simple vs Detailed visual mode switcher
  document.querySelectorAll('[data-density-mode]').forEach((btn) => {
    btn.addEventListener('click', () => applyDensity(btn.dataset.densityMode));
  });

  // Bind progressive filter expander in Simple mode
  const moreFiltersBtn = document.getElementById('moreFiltersBtn');
  const advFilters = document.getElementById('advancedMapFilters');
  if (moreFiltersBtn && advFilters) {
    moreFiltersBtn.addEventListener('click', () => {
      const open = advFilters.classList.toggle('expanded');
      moreFiltersBtn.classList.toggle('active', open);
      moreFiltersBtn.setAttribute('aria-expanded', String(open));
      moreFiltersBtn.querySelector('span').textContent = open ? 'Less ▴' : 'Filters & List ▾';
    });
  }

  // Bind UI chrome controls
  document.getElementById('themeToggle').addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  document.querySelectorAll('.view-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view, { pushHistory: true }));
  });

  document.getElementById('quickCompareBtn').addEventListener('click', () => switchView('compare', { pushHistory: true }));

  const mobileFiltersBtn = document.getElementById('mobileFiltersBtn');
  if (mobileFiltersBtn) {
    mobileFiltersBtn.addEventListener('click', () => {
      const controls = document.getElementById('mapControls');
      const expanded = controls.classList.toggle('mobile-open');
      mobileFiltersBtn.setAttribute('aria-expanded', String(expanded));
      mobileFiltersBtn.classList.toggle('active', expanded);
    });
  }

  document.getElementById('brandBtn').addEventListener('click', () => {
    resetAllFilters(false);
    switchView('map', { pushHistory: true });
    if (sidebar) sidebar.hide();
    if (directory) directory.hide();
    applyFilters();
    if (mapView) mapView.resetView();
  });

  document.querySelectorAll('.filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      syncFilterUiControls();
      applyFilters();
      syncUrlState(false);
    });
  });

  document.getElementById('stateFilter').addEventListener('change', (e) => {
    state.usState = e.target.value;
    syncFilterUiControls();
    applyFilters();
    syncUrlState(false);
    if (state.usState !== 'all') fitToFilteredBounds();
    else if (mapView) mapView.resetView();
  });

  const opFilter = document.getElementById('operatorFilter');
  if (opFilter) {
    opFilter.addEventListener('change', (e) => {
      state.operator = e.target.value;
      syncFilterUiControls();
      applyFilters();
      syncUrlState(false);
      if (state.operator !== 'all') fitToFilteredBounds();
    });
  }

  const coFilter = document.getElementById('aiCompanyFilter');
  if (coFilter) {
    coFilter.addEventListener('change', (e) => {
      filterByAiCompany(e.target.value, { switchToMap: false, fitBounds: false });
    });
  }

  const impFilter = document.getElementById('impactFilter');
  if (impFilter) {
    impFilter.addEventListener('change', (e) => {
      state.impactFilter = e.target.value;
      syncFilterUiControls();
      applyFilters();
      syncUrlState(false);
      if (state.impactFilter !== 'all') fitToFilteredBounds();
    });
  }

  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetAllFilters(true);
      if (mapView) mapView.resetView();
    });
  }

  // Featured Campus quick-pick buttons in bottom-left summary card
  document.querySelectorAll('[data-featured-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectFacilityById(btn.dataset.featuredId, { shouldFly: true, pushHistory: true });
    });
  });

  // Layered Escape key handling: Compare Modal -> Search Dropdown -> Detail Sidebar -> Directory Drawer
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (siteCompare && siteCompare.isModalOpen()) {
      siteCompare.closeModal();
      return;
    }
    const srch = document.getElementById('searchResults');
    if (srch && !srch.classList.contains('hidden')) {
      srch.classList.add('hidden');
      return;
    }
    if (sidebar && sidebar.isOpen()) {
      sidebar.hide();
      return;
    }
    if (directory && directory.isOpen()) {
      directory.hide();
    }
  });

  // Initialize Directory, SiteCompare, Sidebar & Map
  directory = new DirectoryDrawer({
    onSelectFacility: (feat) => selectFacility(feat, { shouldFly: true, pushHistory: true })
  });

  siteCompare = new SiteCompareManager({
    onFocusSite: (feat) => selectFacility(feat, { shouldFly: true, pushHistory: true }),
    onNotify: (msg) => showToast(msg),
    onSelectionChange: () => renderSidebarForCurrentSelection()
  });

  sidebar = new DetailSidebar({
    onClose: () => {
      state.selectedFacility = null;
      document.getElementById('mapView').classList.remove('sidebar-open');
      if (mapView) mapView.clearSelection();
      if (directory) directory.setSelectedId(null);
      updateDocumentTitle();
      syncUrlState(false);
    },
    onCompareIndustries: () => switchView('compare', { pushHistory: true })
  });

  mapView = new AtlasMapView('map', {
    theme: state.theme,
    onSelectFacility: (feature) => selectFacility(feature, { shouldFly: true, pushHistory: true })
  });

  // Browser Back / Forward navigation support
  window.addEventListener('popstate', () => {
    state.view = 'map';
    state.metric = 'energy';
    state.filter = 'all';
    state.usState = 'all';
    state.operator = 'all';
    state.aiCompany = 'all';
    state.impactFilter = 'all';
    const siteId = readUrlParams();

    syncFilterUiControls();
    applyFilters();
    switchView(state.view, { pushHistory: false });
    if (compareViewInstance) {
      compareViewInstance.setMetric(state.metric, false);
    }

    if (siteId && state.featureById.has(siteId)) {
      selectFacility(state.featureById.get(siteId), { shouldFly: true, pushHistory: false });
    } else if (sidebar && sidebar.isOpen()) {
      sidebar.hide();
    }
  });

  // Load compiled static datasets
  try {
    const [geoRes, indRes, metaRes] = await Promise.all([
      fetch('data/facilities.geojson'),
      fetch('data/industries.json'),
      fetch('data/meta.json')
    ]);

    const geojson = await geoRes.json();
    state.industries = await indRes.json();
    state.meta = await metaRes.json();
    state.allFeatures = (geojson.features || []).map((f) => hydrateFeature(f));
    state.allFeatures.forEach((f) => state.featureById.set(f.properties.id, f));

    populateFilterDropdowns(state.allFeatures);
    syncFilterUiControls();
    setupSearch();
    applyFilters();

    compareViewInstance = new IndustryCompareView(state.industries, {
      allFeatures: state.allFeatures,
      initialMetric: state.metric,
      onMetricChange: (m) => {
        state.metric = m;
        syncUrlState(false);
      },
      onJumpToFacility: (id) => {
        selectFacilityById(id, { shouldFly: true, pushHistory: true });
      },
      onFilterAiCompany: (companyId) => {
        filterByAiCompany(companyId, { switchToMap: true });
      }
    });

    new ImpactsPipelineView(state.allFeatures, {
      onJumpToFacility: (id) => {
        selectFacilityById(id, { shouldFly: true, pushHistory: true });
      }
    });

    const metaFooter = document.getElementById('datasetMetaFooter');
    if (metaFooter && state.meta) {
      metaFooter.textContent = `Dataset compiled ${state.meta.builtAt} · ${formatNumber(state.meta.totalFacilities)} verified U.S. locations (${state.meta.flagshipCount} deep-dive impact profiles, ${state.meta.epochAiCount} Epoch AI campuses, ${formatNumber(state.meta.peeringDbCount)} PeeringDB colocation facilities).`;
    }

    document.getElementById('mapLoading').classList.add('hidden');

    // Apply initial deep-linked view or facility
    if (state.view !== 'map') {
      switchView(state.view, { pushHistory: false });
    } else if (initialSiteId && state.featureById.has(initialSiteId)) {
      selectFacilityById(initialSiteId, { shouldFly: true, pushHistory: false });
    } else if (state.usState !== 'all' || state.operator !== 'all' || state.aiCompany !== 'all' || state.impactFilter !== 'all') {
      fitToFilteredBounds();
    }
  } catch (err) {
    console.error('Failed to load dataset:', err);
    document.getElementById('mapLoading').innerHTML =
      '<span>Could not load dataset. Serve this folder over HTTP (e.g. <code>serve.ps1</code>).</span>';
  }
}

init();
