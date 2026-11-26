import { escapeHtml, formatNumber, formatMw, formatGallons, prefersReducedMotion } from './utils.js';

const VECTOR_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
};

function buildSatelliteStyle() {
  return {
    version: 8,
    glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
    sources: {
      'esri-imagery': {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
      },
      'carto-labels': {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png'],
        tileSize: 256,
        maxzoom: 18,
        attribution: '&copy; OpenStreetMap &copy; CARTO'
      }
    },
    layers: [
      { id: 'sat-bg', type: 'background', paint: { 'background-color': '#14181e' } },
      { id: 'esri-imagery-layer', type: 'raster', source: 'esri-imagery', paint: { 'raster-brightness-max': 0.94 } },
      { id: 'carto-labels-layer', type: 'raster', source: 'carto-labels', paint: { 'raster-opacity': 0.88 } }
    ]
  };
}

export class AtlasMapView {
  constructor(containerId, { theme, onSelectFacility, onClearSelection }) {
    this.containerId = containerId;
    this.theme = theme || 'dark';
    this.basemapMode = 'vector'; // 'vector' | 'satellite'
    this.onSelectFacility = onSelectFacility;
    this.onClearSelection = onClearSelection;

    this.currentGeojson = { type: 'FeatureCollection', features: [] };
    this.lightGeojson = { type: 'FeatureCollection', features: [] };
    this.flagshipGeojson = { type: 'FeatureCollection', features: [] };
    this.featureById = new Map();
    this.byCoordKey = new Map();
    this.selectedId = null;

    this.map = new maplibregl.Map({
      container: containerId,
      style: this.getStyleSpec(),
      center: [-96.5, 38.6],
      zoom: 3.85,
      minZoom: 2.5,
      maxZoom: 17.5,
      attributionControl: true
    });

    // Add Satellite toggle inside MapLibre's own bottom-right control flow so it never overlaps zoom/attribution
    this.satelliteBtn = null;
    const satControl = {
      onAdd: () => {
        const wrap = document.createElement('div');
        wrap.className = 'maplibregl-ctrl sat-ctrl-wrap';
        const btn = document.createElement('button');
        btn.id = 'satelliteToggle';
        btn.type = 'button';
        btn.className = 'map-layer-pill';
        btn.setAttribute('aria-pressed', 'false');
        btn.title = 'Toggle aerial satellite imagery';
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
          <span>Satellite</span>
        `;
        btn.addEventListener('click', () => {
          const next = this.basemapMode === 'satellite' ? 'vector' : 'satellite';
          this.setBasemapMode(next);
        });
        wrap.appendChild(btn);
        this.satelliteBtn = btn;
        return wrap;
      },
      onRemove: () => {
        this.satelliteBtn = null;
      }
    };

    this.map.addControl(satControl, 'bottom-right');
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    this.hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      maxWidth: '300px'
    });

    this.map.on('error', (e) => {
      if (e && e.error) console.warn('MapLibre error:', e.error.message || e.error);
    });

    this.map.on('movestart', () => {
      this.hoverPopup.remove();
    });

    // Attach basemap adjustments + data layers whenever style finishes loading
    this.map.on('style.load', () => {
      this.tuneBasemapContrast();
      this.ensureDataLayers();
    });

    this.bindMapInteractions();
  }

  isTouchPrimary() {
    return Boolean(window.matchMedia && window.matchMedia('(hover: none)').matches);
  }

  getStyleSpec() {
    if (this.basemapMode === 'satellite') {
      return buildSatelliteStyle();
    }
    return VECTOR_STYLES[this.theme] || VECTOR_STYLES.dark;
  }

  setTheme(theme) {
    if (this.theme === theme) return;
    this.theme = theme;
    if (this.basemapMode === 'vector') {
      this.map.setStyle(this.getStyleSpec(), { diff: false });
    } else {
      // Update marker strokes if needed
      this.refreshSelectionSource();
    }
  }

  setBasemapMode(mode) {
    const next = mode === 'satellite' ? 'satellite' : 'vector';
    if (this.basemapMode === next) return;
    this.basemapMode = next;
    if (this.satelliteBtn) {
      const isSat = next === 'satellite';
      this.satelliteBtn.classList.toggle('active', isSat);
      this.satelliteBtn.setAttribute('aria-pressed', String(isSat));
      const lbl = this.satelliteBtn.querySelector('span');
      if (lbl) lbl.textContent = isSat ? 'Map View' : 'Satellite';
    }
    this.map.setStyle(this.getStyleSpec(), { diff: false });
  }

  /**
   * Keeps the basemap recessed and neutral (removing the muddy blue-slate cast)
   * so floating UI panels and bright data markers stand out with sharp figure-ground contrast.
   */
  tuneBasemapContrast() {
    if (this.basemapMode !== 'vector') return;
    try {
      const style = this.map.getStyle();
      if (!style || !Array.isArray(style.layers)) return;

      if (this.theme === 'dark') {
        for (const layer of style.layers) {
          if (
            layer.id.startsWith('clusters') ||
            layer.id.startsWith('flagship') ||
            layer.id.startsWith('unclustered') ||
            layer.id.startsWith('selected') ||
            layer.id.startsWith('colocated')
          ) {
            continue;
          }
          if (layer.type === 'background') {
            this.map.setPaintProperty(layer.id, 'background-color', '#121316');
          } else if (layer.type === 'fill' && layer.id.includes('water')) {
            this.map.setPaintProperty(layer.id, 'fill-color', '#090a0d');
          } else if (layer.type === 'fill' && (layer.id.includes('landcover') || layer.id.includes('park') || layer.id.includes('landuse') || layer.id.includes('building'))) {
            this.map.setPaintProperty(layer.id, 'fill-color', '#17191d');
          } else if (layer.type === 'line' && (layer.id.includes('boundary') || layer.id.includes('admin'))) {
            this.map.setPaintProperty(layer.id, 'line-color', '#343841');
          }
        }
      } else {
        // Light mode: slightly deepen map land/water tint so crisp white UI cards pop off the canvas
        for (const layer of style.layers) {
          if (layer.type === 'background') {
            this.map.setPaintProperty(layer.id, 'background-color', '#e4e8ee');
          } else if (layer.type === 'fill' && layer.id.includes('water')) {
            this.map.setPaintProperty(layer.id, 'fill-color', '#cdd6e2');
          }
        }
      }
    } catch {}
  }

  buildLightGeojson(geojson) {
    this.featureById.clear();
    this.byCoordKey.clear();

    const rawFeatures = geojson.features || [];
    for (const f of rawFeatures) {
      const p = f.properties || {};
      this.featureById.set(p.id, f);
      const key = p._coordKey || `${Number(f.geometry.coordinates[0]).toFixed(4)},${Number(f.geometry.coordinates[1]).toFixed(4)}`;
      if (!this.byCoordKey.has(key)) {
        this.byCoordKey.set(key, []);
      }
      this.byCoordKey.get(key).push(f);
    }

    // Sort co-located groups so flagship/AI or highest-network facility comes first
    for (const group of this.byCoordKey.values()) {
      if (group.length > 1) {
        group.sort((a, b) => {
          const rank = (x) => (x.properties.tier === 'flagship' ? 0 : x.properties.category === 'ai_hyperscale' ? 1 : 2);
          const diff = rank(a) - rank(b);
          if (diff !== 0) return diff;
          return (b.properties.netCount || 0) - (a.properties.netCount || 0);
        });
      }
    }

    const allLight = [];
    const flagships = [];

    for (const f of rawFeatures) {
      const p = f.properties || {};
      const key = p._coordKey || `${Number(f.geometry.coordinates[0]).toFixed(4)},${Number(f.geometry.coordinates[1]).toFixed(4)}`;
      const coGroup = this.byCoordKey.get(key) || [f];
      const lightFeat = {
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: p.id,
          coordKey: key,
          coCount: coGroup.length,
          isPrimaryAtCoord: coGroup[0].properties.id === p.id ? 1 : 0,
          name: p.name || '',
          operator: p.operator || '',
          city: p.city || '',
          state: p.state || '',
          tier: p.tier || 'registry',
          category: p.category || 'colocation',
          powerMw: p.powerMw ?? null,
          waterMillionGal: p.waterMillionGal ?? null
        }
      };
      allLight.push(lightFeat);
      if (p.tier === 'flagship') {
        flagships.push(lightFeat);
      }
    }

    this.flagshipGeojson = { type: 'FeatureCollection', features: flagships };
    return { type: 'FeatureCollection', features: allLight };
  }

  getCoLocatedForFeature(feature) {
    if (!feature || !feature.properties) return [];
    const key = feature.properties._coordKey;
    return (key && this.byCoordKey.get(key)) || [feature];
  }

  setData(geojson) {
    this.currentGeojson = geojson;
    this.lightGeojson = this.buildLightGeojson(geojson);

    const src = this.map.getSource('datacenters');
    const flagSrc = this.map.getSource('flagship-pins');
    if (src && flagSrc) {
      src.setData(this.lightGeojson);
      flagSrc.setData(this.flagshipGeojson);
      this.refreshSelectionSource();
    } else if (this.map.isStyleLoaded()) {
      this.ensureDataLayers();
    }
  }

  getViewportPadding(forSelection = false) {
    const topbar = document.querySelector('.topbar');
    const topH = topbar ? topbar.offsetHeight + 24 : 96;
    const dirOpen = document.getElementById('directoryDrawer') && !document.getElementById('directoryDrawer').classList.contains('collapsed');
    const isDesktop = window.innerWidth > 900;

    if (!isDesktop) {
      return {
        top: topH,
        bottom: forSelection ? Math.round(window.innerHeight * 0.56) : 110,
        left: 24,
        right: 24
      };
    }

    return {
      top: topH,
      bottom: 48,
      left: dirOpen ? 390 : 48,
      right: forSelection ? 444 : 48
    };
  }

  resetView() {
    this.map.flyTo({
      center: [-96.5, 38.6],
      zoom: 3.85,
      padding: { top: 40, bottom: 20, left: 20, right: 20 },
      duration: prefersReducedMotion() ? 0 : 700
    });
  }

  focusFacility(feature, { minZoom = 10.2, forceZoom = null } = {}) {
    if (!feature || !feature.geometry) return;
    const [lng, lat] = feature.geometry.coordinates;
    this.selectedId = feature.properties.id;
    this.refreshSelectionSource();

    const targetZoom = forceZoom !== null ? forceZoom : Math.max(this.map.getZoom(), minZoom);
    this.map.flyTo({
      center: [lng, lat],
      zoom: targetZoom,
      padding: this.getViewportPadding(true),
      duration: prefersReducedMotion() ? 0 : 750
    });
  }

  clearSelection() {
    this.selectedId = null;
    this.refreshSelectionSource();
  }

  refreshSelectionSource() {
    const selSrc = this.map.getSource('selected-pin');
    if (!selSrc) return;
    const feat = this.selectedId ? this.featureById.get(this.selectedId) : null;
    if (!feat) {
      selSrc.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const p = feat.properties || {};
    selSrc.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: feat.geometry,
          properties: {
            id: p.id,
            tier: p.tier || 'registry',
            category: p.category || 'colocation'
          }
        }
      ]
    });
  }

  detectStyleFont() {
    try {
      const style = this.map.getStyle();
      if (style && Array.isArray(style.layers)) {
        for (const layer of style.layers) {
          const tf = layer.layout && layer.layout['text-font'];
          if (Array.isArray(tf) && tf.length && typeof tf[0] === 'string') {
            return tf;
          }
        }
      }
    } catch {}
    return ['Open Sans Regular', 'Arial Unicode MS Regular'];
  }

  ensureDataLayers() {
    if (this.map.getSource('datacenters')) {
      this.map.getSource('datacenters').setData(this.lightGeojson);
      if (this.map.getSource('flagship-pins')) {
        this.map.getSource('flagship-pins').setData(this.flagshipGeojson);
      }
      this.refreshSelectionSource();
      return;
    }

    const isDarkSurface = this.theme === 'dark' || this.basemapMode === 'satellite';
    const flagshipColor = isDarkSurface ? '#ffb627' : '#d97706';
    const aiColor = isDarkSurface ? '#38bdf8' : '#2563eb';
    const coloColor = isDarkSurface ? '#2dd4bf' : '#0d9488';
    const strokeColor = isDarkSurface ? '#0b0c0f' : '#ffffff';
    const fontStack = this.detectStyleFont();

    // 1. Clustered source across all filtered facilities with semantic aggregations
    this.map.addSource('datacenters', {
      type: 'geojson',
      data: this.lightGeojson,
      cluster: true,
      clusterMaxZoom: 8,
      clusterRadius: 38,
      clusterProperties: {
        flagshipCount: ['+', ['case', ['==', ['get', 'tier'], 'flagship'], 1, 0]],
        aiCount: ['+', ['case', ['==', ['get', 'category'], 'ai_hyperscale'], 1, 0]],
        totalMw: ['+', ['coalesce', ['get', 'powerMw'], 0]]
      }
    });

    // 2. Dedicated unclustered source for Flagship sites so they remain clickable at national zoom
    this.map.addSource('flagship-pins', {
      type: 'geojson',
      data: this.flagshipGeojson
    });

    // 3. Dedicated unclustered source for the active selected facility so it never vanishes into a cluster
    this.map.addSource('selected-pin', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // Cluster bubbles — neutral high-contrast charcoal badges with bright semantic rings
    this.map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'datacenters',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          isDarkSurface ? '#262830' : '#334155',
          15,
          isDarkSurface ? '#2f323c' : '#1e293b',
          50,
          isDarkSurface ? '#393d49' : '#0f172a'
        ],
        'circle-radius': ['step', ['get', 'point_count'], 15, 15, 20, 50, 25],
        'circle-stroke-width': ['case', ['>', ['get', 'aiCount'], 0], 2.6, 2.0],
        'circle-stroke-color': [
          'case',
          ['>', ['get', 'flagshipCount'], 0],
          flagshipColor,
          ['>', ['get', 'aiCount'], 0],
          aiColor,
          isDarkSurface ? 'rgba(244, 246, 250, 0.62)' : '#ffffff'
        ]
      }
    });

    // Cluster count labels
    this.map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'datacenters',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': fontStack,
        'text-size': 11,
        'text-allow-overlap': true
      },
      paint: {
        'text-color': '#ffffff'
      }
    });

    // Unclustered non-flagship facility points (only render primary at exact coord to avoid z-fighting)
    this.map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'datacenters',
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['!=', ['get', 'tier'], 'flagship'],
        ['==', ['get', 'isPrimaryAtCoord'], 1]
      ],
      paint: {
        'circle-color': ['case', ['==', ['get', 'category'], 'ai_hyperscale'], aiColor, coloColor],
        'circle-radius': [
          'case',
          ['>', ['get', 'coCount'], 1],
          7.8,
          ['==', ['get', 'category'], 'ai_hyperscale'],
          7.0,
          5.4
        ],
        'circle-stroke-width': ['case', ['>', ['get', 'coCount'], 1], 2.4, 1.75],
        'circle-stroke-color': strokeColor
      }
    });

    // Co-located count badge at zoomed-in levels (e.g. "8" at 60 Hudson St)
    this.map.addLayer({
      id: 'colocated-count',
      type: 'symbol',
      source: 'datacenters',
      minzoom: 9.2,
      filter: [
        'all',
        ['!', ['has', 'point_count']],
        ['>', ['get', 'coCount'], 1],
        ['==', ['get', 'isPrimaryAtCoord'], 1]
      ],
      layout: {
        'text-field': ['to-string', ['get', 'coCount']],
        'text-font': fontStack,
        'text-size': 9.5,
        'text-allow-overlap': true
      },
      paint: {
        'text-color': '#ffffff'
      }
    });

    // Soft halo for flagship disclosed-impact campuses (always visible across zoom levels)
    this.map.addLayer({
      id: 'flagship-halo',
      type: 'circle',
      source: 'flagship-pins',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 11.5, 9, 18],
        'circle-color': flagshipColor,
        'circle-opacity': 0.25
      }
    });

    // Always-visible Flagship pins on top of clusters
    this.map.addLayer({
      id: 'flagship-point',
      type: 'circle',
      source: 'flagship-pins',
      paint: {
        'circle-color': flagshipColor,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 6.2, 8, 8.6],
        'circle-stroke-width': 1.85,
        'circle-stroke-color': strokeColor
      }
    });

    // Active selection outer pulse ring + crisp center pin (always visible at all zooms)
    this.map.addLayer({
      id: 'selected-ring-outer',
      type: 'circle',
      source: 'selected-pin',
      paint: {
        'circle-radius': 15,
        'circle-color': 'rgba(255, 255, 255, 0.12)',
        'circle-stroke-width': 2.6,
        'circle-stroke-color': isDarkSurface ? '#ffffff' : '#111827'
      }
    });

    this.map.addLayer({
      id: 'selected-pin-dot',
      type: 'circle',
      source: 'selected-pin',
      paint: {
        'circle-color': [
          'case',
          ['==', ['get', 'tier'], 'flagship'],
          flagshipColor,
          ['==', ['get', 'category'], 'ai_hyperscale'],
          aiColor,
          coloColor
        ],
        'circle-radius': 7.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': strokeColor
      }
    });

    this.refreshSelectionSource();
  }

  bindMapInteractions() {
    const pointLayers = ['flagship-point', 'unclustered-point'];

    // Click on point (prioritizes flagship-point or unclustered-point over underlying clusters)
    this.map.on('click', (e) => {
      const activePointLayers = pointLayers.filter((id) => Boolean(this.map.getLayer(id)));
      if (activePointLayers.length) {
        const hitPoints = this.map.queryRenderedFeatures(e.point, { layers: activePointLayers });
        if (hitPoints.length) {
          this.hoverPopup.remove();
          const feat = hitPoints[0];
          const fullFeature = this.featureById.get(feat.properties.id);
          if (fullFeature && this.onSelectFacility) {
            const coGroup = this.getCoLocatedForFeature(fullFeature);
            this.onSelectFacility(fullFeature, coGroup);
          }
          return;
        }
      }

      if (this.map.getLayer('clusters')) {
        const hitClusters = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        if (hitClusters.length) {
          this.hoverPopup.remove();
          const clusterFeat = hitClusters[0];
          const clusterId = clusterFeat.properties.cluster_id;
          this.map.getSource('datacenters').getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            this.map.easeTo({
              center: clusterFeat.geometry.coordinates,
              zoom: Math.min(Math.max(zoom, this.map.getZoom() + 1.5), 13.5),
              duration: prefersReducedMotion() ? 0 : 480
            });
          });
        }
      }
    });

    // Cluster hover summary tooltip
    this.map.on('mousemove', 'clusters', (e) => {
      if (this.isTouchPrimary()) return;
      // Don't override if hovering a flagship pin sitting atop a cluster
      if (this.map.getLayer('flagship-point')) {
        const overPin = this.map.queryRenderedFeatures(e.point, { layers: ['flagship-point'] });
        if (overPin.length) return;
      }

      this.map.getCanvas().style.cursor = 'pointer';
      const feat = e.features && e.features[0];
      if (!feat) return;
      const p = feat.properties;
      const count = Number(p.point_count) || 0;
      const aiCount = Number(p.aiCount) || 0;
      const flagshipCount = Number(p.flagshipCount) || 0;
      const totalMw = Number(p.totalMw) || 0;

      const metaBits = [];
      if (flagshipCount > 0) metaBits.push(`${flagshipCount} Disclosed Impact`);
      if (aiCount > flagshipCount) metaBits.push(`${aiCount - flagshipCount} Epoch AI`);
      const coloCount = count - aiCount;
      if (coloCount > 0) metaBits.push(`${formatNumber(coloCount)} Colocation`);
      if (totalMw > 0) metaBits.push(`${formatMw(totalMw)} tracked`);

      this.hoverPopup
        .setLngLat(feat.geometry.coordinates)
        .setHTML(
          `<div class="popup-title">${formatNumber(count)} Facilities in Region</div>` +
            `<div class="popup-meta">${escapeHtml(metaBits.join(' · '))}<br/><span class="popup-hint">Click cluster to zoom in</span></div>`
        )
        .addTo(this.map);
    });

    this.map.on('mouseleave', 'clusters', () => {
      this.map.getCanvas().style.cursor = '';
      this.hoverPopup.remove();
    });

    // Individual pin hover tooltip (both Flagship & Unclustered)
    for (const layerId of pointLayers) {
      this.map.on('mouseenter', layerId, (e) => {
        if (this.isTouchPrimary()) return;
        this.map.getCanvas().style.cursor = 'pointer';
        const feat = e.features && e.features[0];
        if (!feat) return;
        const p = feat.properties;
        const coords = feat.geometry.coordinates.slice();
        const details = [];
        if (p.operator) details.push(p.operator);
        if (p.city && p.state) details.push(`${p.city}, ${p.state}`);
        if (p.powerMw && Number(p.powerMw) > 0) details.push(formatMw(Number(p.powerMw)));
        if (p.waterMillionGal !== null && p.waterMillionGal !== undefined && p.waterMillionGal !== '') {
          details.push(formatGallons(Number(p.waterMillionGal)));
        }

        const coCount = Number(p.coCount) || 1;
        const stackBadge =
          coCount > 1
            ? `<div class="popup-stack-note">+ ${coCount - 1} more ${coCount - 1 === 1 ? 'facility' : 'facilities'} at this address</div>`
            : '';

        this.hoverPopup
          .setLngLat(coords)
          .setHTML(
            `<div class="popup-title">${escapeHtml(p.name)}</div>` +
              `<div class="popup-meta">${escapeHtml(details.join(' · '))}</div>` +
              stackBadge
          )
          .addTo(this.map);
      });

      this.map.on('mouseleave', layerId, () => {
        this.map.getCanvas().style.cursor = '';
        this.hoverPopup.remove();
      });
    }
  }
}
