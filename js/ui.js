// ─── PAGE MODEL ──────────────────────────────────────────
// Each page defines:
//   SERIES  = { name: { source: 'fred'|'market', id, label, unit, decimals,
//                       freq, sample, mode, change, target, hidden, desc } }
//   LAYOUT  = [{ title, series: [names...] }, ...]   (module order and groups)
//   SIGNALS = ['recession', 'curve', ...]            (optional, see SIGNAL_LIBRARY)
//   SECTORS = { symbol: label }                      (optional, ranked returns)

const moduleModes = {};
const moduleZoom = {};

// Zoom window (years) for the "recent" chart. Shorter comparisons get
// shorter default windows; the range buttons override it.
const ZOOM_RANGES = [1, 2, 3, 5, 10];
const DEFAULT_ZOOM = { Level: 5, YoY: 5, MoM: 3, QoQ: 2 };

function pageSignals() { return typeof SIGNALS !== 'undefined' ? SIGNALS : []; }
function pageSectors() { return typeof SECTORS !== 'undefined' ? SECTORS : null; }

function pageLayout() {
  if (typeof LAYOUT !== 'undefined' && LAYOUT.length) return LAYOUT;
  return [{ title: '', series: Object.keys(SERIES).filter(n => !SERIES[n].hidden) }];
}

function storageGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }

function modeStorageKey(name) {
  return 'macro.mode.' + (location.pathname.split('/').pop() || 'index.html') + '.' + name;
}

function getMode(name) {
  if (moduleModes[name]) return moduleModes[name];
  const cfg = SERIES[name];
  const modes = seriesModes(cfg);
  const saved = storageGet(modeStorageKey(name));
  const fallback = cfg.mode || 'Level';
  moduleModes[name] = modes.includes(saved) ? saved : (modes.includes(fallback) ? fallback : 'Level');
  return moduleModes[name];
}

function setMode(name, mode) {
  delete moduleZoom[name];
  moduleModes[name] = mode;
  storageSet(modeStorageKey(name), mode);
  renderModule(name);
}

function getZoom(name) {
  return moduleZoom[name] || DEFAULT_ZOOM[getMode(name)] || 5;
}

function setZoom(name, years) {
  moduleZoom[name] = years;
  renderModule(name);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ─── MODULE MARKUP ───────────────────────────────────────
function segmented(cls, items, attr) {
  return '<div class="segmented ' + cls + '" role="group">' +
    items.map(it => '<button type="button" ' + attr + '="' + it.value + '">' + it.label + '</button>').join('') +
    '</div>';
}

function moduleMarkup(name) {
  const cfg = SERIES[name];
  const source = cfg.source === 'market' ? 'Yahoo Finance · ' + cfg.id : 'FRED · ' + cfg.id;
  return '' +
    '<article class="module" id="card-' + name + '">' +
      '<header class="module-head">' +
        '<div class="module-id">' +
          '<h3 class="module-name">' + escapeHtml(cfg.label) + '</h3>' +
          '<div class="module-reading">' +
            '<span class="module-value is-loading" id="val-' + name + '">Loading…</span>' +
            '<span class="module-asof" id="date-' + name + '"></span>' +
          '</div>' +
        '</div>' +
        '<div class="module-controls">' +
          segmented('mode-toggle', seriesModes(cfg).map(m => ({ value: m, label: m })), 'data-mode') +
        '</div>' +
      '</header>' +
      '<div class="module-charts">' +
        '<figure class="pane">' +
          '<figcaption class="pane-head">' +
            '<span class="pane-title" id="hist-title-' + name + '">Full history</span>' +
            '<button type="button" class="link-btn" data-expand>Expand</button>' +
          '</figcaption>' +
          '<div class="pane-canvas"><canvas id="hist-' + name + '" role="img" aria-label="' + escapeHtml(cfg.label) + ', full history"></canvas></div>' +
          '<div class="pane-key" id="hist-key-' + name + '"></div>' +
        '</figure>' +
        '<figure class="pane">' +
          '<figcaption class="pane-head">' +
            '<span class="pane-title" id="zoom-title-' + name + '">Recent</span>' +
            segmented('zoom-toggle small', ZOOM_RANGES.map(y => ({ value: y, label: y + 'Y' })), 'data-years') +
          '</figcaption>' +
          '<div class="pane-canvas"><canvas id="chart-' + name + '" role="img" aria-label="' + escapeHtml(cfg.label) + ', recent"></canvas></div>' +
          '<div class="pane-key" id="zoom-key-' + name + '"></div>' +
        '</figure>' +
      '</div>' +
      '<div class="table-wrap" id="mini-table-' + name + '"></div>' +
      '<details class="module-about">' +
        '<summary>About this measure <span class="module-source">' + escapeHtml(source) + '</span></summary>' +
        '<p>' + escapeHtml(cfg.desc || '') + '</p>' +
      '</details>' +
    '</article>';
}

function renderModules() {
  const host = document.getElementById('modules');
  if (!host) return;
  host.innerHTML = pageLayout().map(group =>
    '<section class="module-group">' +
      (group.title ? '<h2 class="group-title">' + escapeHtml(group.title) + '</h2>' : '') +
      group.series.filter(n => SERIES[n]).map(moduleMarkup).join('') +
    '</section>'
  ).join('');

  Object.keys(SERIES).forEach(name => {
    const card = document.getElementById('card-' + name);
    if (!card) return;
    card.querySelectorAll('[data-mode]').forEach(btn =>
      btn.addEventListener('click', () => setMode(name, btn.dataset.mode)));
    card.querySelectorAll('[data-years]').forEach(btn =>
      btn.addEventListener('click', () => setZoom(name, parseInt(btn.dataset.years, 10))));
    card.querySelector('[data-expand]').addEventListener('click', () => openSeriesChart(name));
    syncButtons(name);
  });
}

function syncButtons(name) {
  const card = document.getElementById('card-' + name);
  if (!card) return;
  const mode = getMode(name), years = getZoom(name);
  card.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
  card.querySelectorAll('[data-years]').forEach(b => b.setAttribute('aria-pressed', parseInt(b.dataset.years, 10) === years));
}

// ─── MODULE RENDERING ────────────────────────────────────
function updateCard(name, rawObs) {
  seriesRawData[name] = rawObs;
  renderModule(name);
  renderSignals();
}

function renderModule(name) {
  const cfg = SERIES[name];
  const raw = seriesRawData[name];
  const valEl = document.getElementById('val-' + name);
  if (!cfg || !raw || raw.length < 2 || !valEl) return;
  syncButtons(name);

  const quarterly = cfg.freq === 'QoQ';
  const display = buildModeSeries(raw, cfg, getMode(name));
  const obs = display.obs;
  if (!obs.length) return;
  const latest = obs[obs.length - 1];

  // Headline
  valEl.classList.remove('is-loading');
  const u = splitUnit(display.unit);
  const head = formatDisplayValue(latest.value, Object.assign({}, display, { unit: u.pre === '$' ? '$' : '' }));
  valEl.innerHTML = escapeHtml(head) +
    (u.post.trim() ? '<span class="module-unit">' + escapeHtml(u.post.trim()) + '</span>' : '');
  const modeText = display.mode === 'Level' ? '' : ' · ' + display.mode + ' change';
  document.getElementById('date-' + name).textContent =
    formatObsDate(latest.date, 'long', quarterly) + modeText;

  // Full history (left) and recent window (right)
  const years = getZoom(name);
  const cutoff = (parseInt(latest.date.slice(0, 4), 10) - years) + latest.date.slice(4);
  const recent = obs.filter(d => d.date > cutoff);
  const bars = display.mode === 'MoM' || display.mode === 'QoQ';
  const reference = cfg.target && cfg.target[display.mode] != null
    ? { value: cfg.target[display.mode], label: cfg.target.label || 'Target' } : null;
  document.getElementById('hist-title-' + name).textContent = 'Since ' + obs[0].date.slice(0, 4);
  document.getElementById('zoom-title-' + name).textContent =
    'Last ' + years + (years === 1 ? ' year' : ' years');

  const log = !!cfg.log && display.mode === 'Level';
  makeModuleChart('hist-' + name, obs, display, {
    quarterly, reference, log, maxLabels: 8,
    highlight: recent.length ? [recent[0].date, latest.date] : null
  });
  makeModuleChart('chart-' + name, recent, display, { quarterly, bars, reference, maxLabels: 10 });

  // Keys: say what the shading, highlight and dashed line mean.
  const refKey = reference ? '<span><i class="key-ref"></i>' + escapeHtml(reference.label) + '</span>' : '';
  document.getElementById('hist-key-' + name).innerHTML =
    '<span><i class="key-recession"></i>Recession</span>' +
    '<span><i class="key-window"></i>Shown at right</span>' + refKey;
  document.getElementById('zoom-key-' + name).innerHTML = refKey;

  // Last 12 readings
  const tableObs = obs.slice(-12);
  const wrap = document.getElementById('mini-table-' + name);
  if (!wrap) return;
  wrap.innerHTML =
    '<table class="readings"><thead><tr><th scope="row">' + display.mode + '</th>' +
      tableObs.map(d => '<th scope="col" title="' + formatObsDate(d.date, 'long', quarterly) + '">' +
        formatObsDate(d.date, 'short', quarterly) + '</th>').join('') +
    '</tr></thead><tbody><tr><th scope="row"></th>' +
      tableObs.map(d => '<td>' + formatDisplayValue(d.value, display) + '</td>').join('') +
    '</tr></tbody></table>';
  wrap.scrollLeft = wrap.scrollWidth;   // latest readings first on narrow screens
}

function renderAllModules() {
  Object.keys(SERIES).forEach(renderModule);
}

// ─── SIGNALS ─────────────────────────────────────────────
// Rule-of-thumb readings of the economy's vital signs. Each returns
// { value, status: 'good'|'warning'|'critical', verdict, note } or null.
const STATUS_ICON = { good: '✓', warning: '!', critical: '✕' };

function latestOf(name) {
  const obs = seriesRawData[name];
  return obs && obs.length ? obs[obs.length - 1] : null;
}

const SIGNAL_LIBRARY = {
  recession: {
    title: 'Recession signal',
    series: 'SahmRule',
    read() {
      const l = latestOf('SahmRule'); if (!l) return null;
      const v = l.value;
      return {
        value: v.toFixed(2) + ' pp',
        status: v >= 0.5 ? 'critical' : v >= 0.3 ? 'warning' : 'good',
        verdict: v >= 0.5 ? 'Triggered' : v >= 0.3 ? 'Approaching' : 'Not triggered',
        note: 'Sahm rule: 3-mo avg unemployment vs. its 12-mo low. Triggers at 0.50.',
        date: l.date
      };
    }
  },
  curve: {
    title: 'Yield curve',
    series: 'Spread',
    read() {
      const l = latestOf('Spread'); if (!l) return null;
      const v = l.value;
      return {
        value: (v > 0 ? '+' : '') + v.toFixed(2) + ' pp',
        status: v < 0 ? 'warning' : 'good',
        verdict: v < 0 ? 'Inverted' : 'Positive',
        note: '10-yr minus 2-yr Treasury. Inversions have preceded past recessions.',
        date: l.date
      };
    }
  },
  inflation: {
    title: 'Core inflation',
    series: 'CorePCE',
    read() {
      const obs = seriesRawData.CorePCE; if (!obs) return null;
      const yoy = buildModeSeries(obs, SERIES.CorePCE, 'YoY').obs;
      const l = yoy[yoy.length - 1]; if (!l) return null;
      const v = l.value;
      return {
        value: v.toFixed(1) + '%',
        status: v <= 2.5 ? 'good' : v <= 3.5 ? 'warning' : 'critical',
        verdict: v <= 2.5 ? 'Near target' : v <= 3.5 ? 'Above target' : 'Well above target',
        note: 'Core PCE, year over year. The Fed targets 2%.',
        date: l.date
      };
    }
  },
  growth: {
    title: 'Real growth',
    series: 'RealGDP',
    read() {
      const obs = seriesRawData.RealGDP; if (!obs || obs.length < 2) return null;
      const a = obs[obs.length - 2], b = obs[obs.length - 1];
      const v = (Math.pow(b.value / a.value, 4) - 1) * 100;
      return {
        value: (v > 0 ? '+' : '') + v.toFixed(1) + '%',
        status: v < 0 ? 'critical' : v < 1 ? 'warning' : 'good',
        verdict: v < 0 ? 'Contracting' : v < 1 ? 'Weak' : 'Expanding',
        note: 'Real GDP, latest quarter at an annualized rate.',
        date: b.date, quarterly: true
      };
    }
  },
  credit: {
    title: 'Credit stress',
    series: 'CreditSpread',
    read() {
      const l = latestOf('CreditSpread'); if (!l) return null;
      const v = l.value;
      return {
        value: v.toFixed(2) + ' pp',
        status: v >= 3.5 ? 'critical' : v >= 2.5 ? 'warning' : 'good',
        verdict: v >= 3.5 ? 'Stressed' : v >= 2.5 ? 'Elevated' : 'Calm',
        note: 'Baa corporate bond yield minus 10-yr Treasury. Above ~3.5 pp has marked past credit crunches.',
        date: l.date
      };
    }
  }
};

function renderSignals() {
  const host = document.getElementById('signals');
  const ids = pageSignals();
  if (!host || !ids.length) return;
  host.innerHTML = ids.map(id => {
    const sig = SIGNAL_LIBRARY[id];
    const r = sig.read();
    if (!r) {
      return '<div class="signal"><div class="signal-title">' + sig.title + '</div>' +
        '<div class="signal-value is-loading">Loading…</div></div>';
    }
    return '<div class="signal">' +
      '<div class="signal-title">' + sig.title + '</div>' +
      '<div class="signal-value">' + r.value + '</div>' +
      '<div class="status status-' + r.status + '"><span class="status-icon" aria-hidden="true">' +
        STATUS_ICON[r.status] + '</span>' + r.verdict + '</div>' +
      '<p class="signal-note">' + r.note + ' <span class="signal-date">' +
        formatObsDate(r.date, 'long', r.quarterly) + '</span></p>' +
    '</div>';
  }).join('');
}

// ─── SECTOR RETURNS ──────────────────────────────────────
const SECTOR_PERIODS = ['1M', '3M', 'YTD', '1Y'];
const sectorReturns = {};
let sectorPeriod = storageGet('macro.sectorPeriod') || 'YTD';

function renderSectors() {
  const sectors = pageSectors();
  const host = document.getElementById('sectors');
  if (!sectors || !host) return;
  const rows = Object.keys(sectors)
    .filter(sym => sectorReturns[sym] && sectorReturns[sym][sectorPeriod] != null)
    .map(sym => ({ sym, label: sectors[sym], value: sectorReturns[sym][sectorPeriod] }))
    .sort((a, b) => b.value - a.value);

  // One linear scale spanning the actual range, so the zero line sits
  // where the data puts it instead of wasting half the width.
  const maxPos = Math.max(0, ...rows.map(r => r.value));
  const maxNeg = Math.max(0, ...rows.map(r => -r.value));
  const span = (maxPos + maxNeg) || 1;
  const hasNeg = maxNeg > 0;
  const zero = maxNeg / span * 100;         // % position of the zero line

  host.querySelector('.sector-rows').innerHTML = rows.length ? rows.map(r => {
    const w = Math.abs(r.value) / span * 100;
    const left = r.value >= 0 ? zero : zero - w;
    const val = formatDisplayValue(r.value, { unit: '%', decimals: 1, showSign: true });
    return '<div class="sector-row">' +
      '<span class="sector-label">' + escapeHtml(r.label) + ' <span class="sector-sym">' + r.sym + '</span></span>' +
      '<span class="sector-track">' +
        (hasNeg ? '<span class="sector-zero" style="left:' + zero + '%"></span>' : '') +
        '<span class="sector-bar' + (r.value < 0 ? ' neg' : '') + '" style="left:' + left + '%;width:' + w + '%"></span>' +
      '</span>' +
      '<span class="sector-value">' + val + '</span>' +
    '</div>';
  }).join('') : '<div class="empty">Loading sector returns…</div>';

  host.querySelectorAll('[data-period]').forEach(b =>
    b.setAttribute('aria-pressed', b.dataset.period === sectorPeriod));
}

function initSectors() {
  const host = document.getElementById('sectors');
  if (!pageSectors() || !host) return;
  host.querySelector('.sector-controls').innerHTML =
    segmented('period-toggle', SECTOR_PERIODS.map(p => ({ value: p, label: p })), 'data-period');
  host.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => {
    sectorPeriod = b.dataset.period;
    storageSet('macro.sectorPeriod', sectorPeriod);
    renderSectors();
  }));
  renderSectors();
}

// ─── FETCH ───────────────────────────────────────────────
async function fetchAll() {
  const btn   = document.getElementById('refreshBtn');
  const errEl = document.getElementById('errorMsg');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  errEl.hidden = true;
  const errors = [];

  const names = Object.keys(SERIES);
  for (let i = 0; i < names.length; i++) {
    if (i > 0) await sleep(SERIES[names[i]].source === 'market' ? 400 : 200);
    const name = names[i];
    try {
      updateCard(name, await fetchSeries(SERIES[name]));
    } catch (e) {
      errors.push(SERIES[name].label + ': ' + e.message);
      const el = document.getElementById('val-' + name);
      if (el) { el.textContent = 'Unavailable'; el.classList.add('is-loading'); }
    }
  }

  const sectors = pageSectors();
  if (sectors) {
    for (const sym of Object.keys(sectors)) {
      try {
        await sleep(400);
        sectorReturns[sym] = trailingReturns(await fetchMarketRange(sym, '2y', '1d'));
        renderSectors();
      } catch (e) {
        errors.push(sectors[sym] + ': ' + e.message);
      }
    }
  }

  _finishFetch(errors);
}

function _finishFetch(errors) {
  const btn   = document.getElementById('refreshBtn');
  const errEl = document.getElementById('errorMsg');
  const ts = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
  document.getElementById('last-updated').textContent = 'Updated ' + ts;
  if (errors.length) {
    errEl.textContent = 'Some data could not be loaded: ' + errors.join(' · ');
    errEl.hidden = false;
  }
  btn.disabled = false;
  btn.textContent = 'Refresh';
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(fetchAll, REFRESH_INTERVAL);
}

// ─── FULL-SCREEN CHART ───────────────────────────────────
function openSeriesChart(name) {
  const cfg = SERIES[name];
  if (!cfg) return;
  const query = new URLSearchParams({
    source: cfg.source || 'fred',
    id: cfg.alts ? cfg.alts[0] : cfg.id,
    label: cfg.label,
    unit: cfg.unit,
    decimals: cfg.decimals,
    interval: getMode(name),
    freq: cfg.freq || '',
    change: changeKind(cfg),
    sample: cfg.sample || ''
  });
  if (cfg.target && cfg.target[getMode(name)] != null) {
    query.set('target', cfg.target[getMode(name)]);
    query.set('targetLabel', cfg.target.label || 'Target');
  }
  window.open('chart.html?' + query.toString(), '_blank', 'noopener');
}

// ─── PAGE INIT ───────────────────────────────────────────
function initPage() {
  if (!document.getElementById('modules')) return;   // e.g. the test runner
  renderModules();
  renderSignals();
  initSectors();
  document.getElementById('refreshBtn').addEventListener('click', fetchAll);
  fetchAll();
  if (typeof fetchCalendar === 'function') fetchCalendar();
}

window.addEventListener('DOMContentLoaded', initPage);
